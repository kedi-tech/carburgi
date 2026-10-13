import "server-only";

import { headers as requestHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { readAccessToken } from "./session";
import type {
  Account,
  AccountRole,
  AdminAccess,
  AccountStatus,
  AdminMessage,
  Area,
  AuthResult,
  Brand,
  ChatMessage,
  ChatThread,
  Envelope,
  MessageStatus,
  OsmImportResult,
  Payment,
  PaymentStatus,
  Plan,
  PlanCode,
  Reconciliation,
  ReportStatus,
  SentMessage,
  Station,
  StationAccess,
  StationAgent,
  StationReport,
  Subscription,
  ThreadStatus,
} from "./types";

/**
 * The one place this console talks to Carbugui. Every call runs on the server,
 * so the admin token never leaves it.
 *
 * The whole `Admin · *` surface of `backend-docs/openapi.json` is covered here
 * and nothing else is: if a screen wants a figure, it comes from one of these
 * routes or it does not appear. That rule is what keeps the console from
 * showing a number the API cannot vouch for.
 */
export const API_BASE_URL: string = (
  process.env.CARBUGUI_API_URL ?? "https://carbugui.kedi-tech.com/api/v1"
).replace(/\/+$/, "");

export class ApiError extends Error {
  readonly status: number;
  /**
   * The server has no such route at all ("Route introuvable"), as opposed to a
   * 404 about a missing record. Lets a call fall back on an older route while
   * a deployment catches up with the spec.
   */
  readonly routeMissing: boolean;

  constructor(status: number, message: string, routeMissing: boolean = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.routeMissing = routeMissing;
  }
}

/**
 * What to say when the API answers with a status and no `message`. The live
 * server does this — a 409 on the credentials route, for one — and "Erreur 409"
 * tells an administrator nothing.
 */
const FALLBACK_MESSAGES: Record<number, string> = {
  400: "Le serveur a refusé la requête : données invalides.",
  403: "Action refusée pour ce compte.",
  404: "Ressource introuvable — elle a peut-être été supprimée entre-temps.",
  409: "Conflit avec l’état actuel : cette opération a déjà été faite ou n’est plus possible.",
  422: "Le serveur a refusé les données envoyées.",
  500: "Erreur interne du serveur. Réessayez dans un instant.",
  502: "Le serveur est momentanément indisponible.",
  503: "Le serveur est momentanément indisponible.",
};

type RequestOptions = {
  method?: string;
  body?: unknown;
  /** Attach the admin token. Everything but the login call needs it. */
  auth?: boolean;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = options;
  const headers: Record<string, string> = { Accept: "application/json" };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (auth) {
    const token = await readAccessToken();
    if (!token) {
      redirect("/login");
    }
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // A regulator's console must never show a cached picture of the network.
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "L’API Carbugui est injoignable. Vérifiez la connexion au serveur.");
  }

  if (response.status === 401 && auth) {
    // A rejected token: the route handler this redirects to tries one renewal
    // and returns to this page, or clears the session — cookies cannot be
    // written from here, during render.
    const path = (await requestHeaders()).get("x-sonap-path");
    redirect(path ? `/auth/expired?next=${encodeURIComponent(path)}` : "/auth/expired");
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 429) {
      throw new ApiError(
        429,
        "L’API a refusé la requête : trop d’appels en peu de temps. Patientez un instant avant de rafraîchir.",
      );
    }
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message: unknown }).message)
        : FALLBACK_MESSAGES[response.status] ?? `Le serveur a répondu par une erreur (${response.status}).`;
    const routeMissing =
      response.status === 404 &&
      Boolean(payload && typeof payload === "object" && "error" in payload &&
        String((payload as { error: unknown }).error).startsWith("Route introuvable"));
    throw new ApiError(response.status, message, routeMissing);
  }

  return payload as T;
}

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

/**
 * Reads are memoised for the length of one request; writes are not.
 *
 * The shell and the page under it want overlapping data — the sidebar's three
 * counters come from the same lists the page below is about to render — and the
 * API rate-limits. Without this, one page load fired ten or eleven requests and
 * started collecting 429s.
 *
 * `cache()` compares arguments by identity, which is why every read takes
 * primitives rather than an options object: an object literal is a new
 * reference each call and would miss the memo every time.
 *
 * The companion rule lives in the pages — a screen that needs both a filtered
 * list and per-status counts reads the list **once, unfiltered**, and counts in
 * memory rather than issuing one request per bucket.
 */

/* ----------------------------------------------------------------- Auth */

export async function adminLogin(phoneNumber: string, password: string): Promise<AuthResult> {
  return request<AuthResult>("/admin/auth/login", {
    method: "POST",
    auth: false,
    body: { phoneNumber, password },
  });
}

export const fetchAdminMe = cache(async (): Promise<Account> => {
  const response = await request<Envelope<Account>>("/admin/auth/me");
  return response.data;
});

/**
 * Creates another administrator — same rights as the caller, there is no
 * "super admin". The server generates the password and returns it **once**
 * in `data.password`, exactly like a station's access; the caller shows it
 * and hands it over. A deployment that lags the spec answers 404, which is
 * reported as such rather than as "introuvable".
 */
export async function createAdminAccount(fullName: string, phoneNumber: string): Promise<AdminAccess> {
  let response: Envelope<AdminAccess>;
  try {
    response = await request("/admin/accounts/admins", {
      method: "POST",
      body: { fullName, phoneNumber },
    });
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 404) {
      throw new ApiError(
        404,
        "Ce serveur ne propose pas encore la création d’administrateur.",
      );
    }
    if (caught instanceof ApiError && caught.status === 409) {
      throw new ApiError(409, "Un compte utilise déjà ce numéro de téléphone.");
    }
    throw caught;
  }
  return response.data;
}

/* ------------------------------------------------------------- Stations */

export const fetchStations = cache(async (): Promise<Station[]> => {
  const response = await request<Envelope<Station[]>>("/admin/stations");
  return response.data ?? [];
});

export const fetchStation = cache(async (id: string): Promise<Station> => {
  const response = await request<Envelope<Station>>(`/admin/stations/${id}`);
  return response.data;
});

export type StationDraft = {
  name: string;
  brandId?: string | null;
  areaId?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  address?: string | null;
  phoneNumber?: string | null;
  latitude: number;
  longitude: number;
};

export async function createStation(draft: StationDraft): Promise<Station> {
  const response = await request<Envelope<Station>>("/admin/stations", {
    method: "POST",
    body: draft,
  });
  return response.data;
}

/**
 * `PUT /admin/stations/{id}` takes a partial body: only the fields sent are
 * changed, which is what lets the publication toggle and the identity form
 * share one route without one overwriting the other.
 */
export async function updateStation(
  id: string,
  patch: Partial<StationDraft> & { isPublished?: boolean },
): Promise<Station> {
  const response = await request<Envelope<Station>>(`/admin/stations/${id}`, {
    method: "PUT",
    body: patch,
  });
  return response.data;
}

export async function setStationPublished(id: string, isPublished: boolean): Promise<Station> {
  return updateStation(id, { isPublished });
}

export async function deleteStation(id: string): Promise<void> {
  await request<Envelope<null>>(`/admin/stations/${id}`, { method: "DELETE" });
}

export async function verifyStation(id: string): Promise<Station> {
  const response = await request<Envelope<Station>>(`/admin/stations/${id}/verify`, {
    method: "PUT",
  });
  return response.data;
}

/**
 * Creates one named access for a station. Each call is a new account with its
 * own login code (`slug`, then `slug-2`, `slug-3`…), so a station can have as
 * many agents as it needs. The plaintext password comes back once; the caller
 * shows it (and the console's vault keeps it).
 */
export async function createStationAccess(
  id: string,
  fullName: string,
  phoneNumber: string | null,
): Promise<StationAccess> {
  let response: Envelope<Partial<StationAccess>> & Partial<StationAccess>;
  try {
    response = await request(`/admin/stations/${id}/accounts`, {
      method: "POST",
      body: { fullName, ...(phoneNumber ? { phoneNumber } : {}) },
    });
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 409) {
      throw new ApiError(
        409,
        caught.message.startsWith("Conflit")
          ? "Ce numéro de téléphone est déjà utilisé par un autre compte."
          : caught.message,
      );
    }
    throw caught;
  }
  // The spec wraps the credentials in `data`; accept them at the top level too,
  // and refuse to hand back a blank password as if it were one.
  const source = response.data ?? response;
  const access: StationAccess = {
    accountId: String(source.accountId ?? ""),
    loginCode: String(source.loginCode ?? ""),
    password: String(source.password ?? ""),
    fullName: source.fullName ?? fullName,
    phoneNumber: source.phoneNumber ?? phoneNumber,
  };
  if (!access.loginCode || !access.password) {
    throw new ApiError(
      502,
      "Le serveur a créé le compte mais n’a pas renvoyé les identifiants. Réinitialisez son mot de passe depuis cette fiche.",
    );
  }
  return access;
}

/**
 * A station's accounts, read from its memberships. `null` when the server
 * predates the route — the page then falls back on matching login codes.
 */
export const fetchStationAgents = cache(async (stationId: string): Promise<StationAgent[] | null> => {
  try {
    const response = await request<Envelope<StationAgent[]>>(`/admin/stations/${stationId}/accounts`);
    return response.data ?? [];
  } catch (caught) {
    if (caught instanceof ApiError && caught.routeMissing) {
      return null;
    }
    throw caught;
  }
});

/**
 * Removes a station account for good: memberships and sessions go, and its
 * login code and number are freed for a new access. On a server without the
 * route, the account is set DELETED instead — it can no longer sign in, but
 * its code stays taken. Returns which of the two happened.
 */
export async function deleteStationAccount(id: string): Promise<"deleted" | "disabled"> {
  try {
    await request<Envelope<null>>(`/admin/accounts/${id}`, { method: "DELETE" });
    return "deleted";
  } catch (caught) {
    if (caught instanceof ApiError && caught.routeMissing) {
      await setAccountStatus(id, "DELETED");
      return "disabled";
    }
    throw caught;
  }
}

/** A new server-generated password for a station account; its sessions are revoked. */
export async function resetStationPassword(id: string): Promise<StationAccess> {
  let response: Envelope<Partial<StationAccess>> & Partial<StationAccess>;
  try {
    response = await request(`/admin/accounts/${id}/password`, { method: "POST" });
  } catch (caught) {
    if (caught instanceof ApiError && caught.routeMissing) {
      throw new ApiError(404, "Ce serveur ne propose pas encore la réinitialisation de mot de passe.");
    }
    throw caught;
  }
  const source = response.data ?? response;
  const access: StationAccess = {
    accountId: String(source.accountId ?? id),
    loginCode: String(source.loginCode ?? ""),
    password: String(source.password ?? ""),
  };
  if (!access.password) {
    throw new ApiError(502, "Le serveur n’a pas renvoyé le nouveau mot de passe.");
  }
  return access;
}

export async function importOsmStations(): Promise<OsmImportResult> {
  const response = await request<Envelope<OsmImportResult>>("/admin/stations/import-osm", {
    method: "POST",
  });
  // The route documents counts but the envelope shape is loose; default rather
  // than render `undefined` as a figure.
  return {
    created: response.data?.created ?? 0,
    updated: response.data?.updated ?? 0,
    skipped: response.data?.skipped ?? 0,
    errors: response.data?.errors ?? 0,
  };
}

/* ------------------------------------------------------------- Accounts */

export const fetchAccounts = cache(
  async (role?: AccountRole, status?: AccountStatus): Promise<Account[]> => {
    const response = await request<Envelope<Account[]>>(`/admin/accounts${query({ role, status })}`);
    return response.data ?? [];
  },
);

export const fetchAccount = cache(async (id: string): Promise<Account> => {
  const response = await request<Envelope<Account>>(`/admin/accounts/${id}`);
  return response.data;
});

export async function setAccountStatus(id: string, status: AccountStatus): Promise<Account> {
  const response = await request<Envelope<Account>>(`/admin/accounts/${id}/status`, {
    method: "PUT",
    body: { status },
  });
  return response.data;
}

/* -------------------------------------------------------------- Reports */

export const fetchReports = cache(async (status?: ReportStatus): Promise<StationReport[]> => {
  const response = await request<Envelope<StationReport[]>>(`/admin/reports${query({ status })}`);
  return response.data ?? [];
});

export async function resolveReport(id: string, status: ReportStatus): Promise<StationReport> {
  const response = await request<Envelope<StationReport>>(`/admin/reports/${id}`, {
    method: "PUT",
    body: { status },
  });
  return response.data;
}

/* ------------------------------------------------------------- Catalogue */

export const fetchAreas = cache(async (): Promise<Area[]> => {
  const response = await request<Envelope<Area[]>>("/admin/catalog/areas");
  return response.data ?? [];
});

export type AreaDraft = {
  label: string;
  latitude: number;
  longitude: number;
  sortOrder?: number;
};

export async function createArea(draft: AreaDraft): Promise<Area> {
  const response = await request<Envelope<Area>>("/admin/catalog/areas", {
    method: "POST",
    body: draft,
  });
  return response.data;
}

export async function updateArea(
  id: string,
  patch: Partial<AreaDraft> & { isActive?: boolean },
): Promise<Area> {
  const response = await request<Envelope<Area>>(`/admin/catalog/areas/${id}`, {
    method: "PUT",
    body: patch,
  });
  return response.data;
}

export async function deleteArea(id: string): Promise<void> {
  await request<Envelope<null>>(`/admin/catalog/areas/${id}`, { method: "DELETE" });
}

export const fetchBrands = cache(async (): Promise<Brand[]> => {
  const response = await request<Envelope<Brand[]>>("/admin/catalog/brands");
  return response.data ?? [];
});

export type BrandDraft = { name: string; logoUrl?: string | null };

export async function createBrand(draft: BrandDraft): Promise<Brand> {
  const response = await request<Envelope<Brand>>("/admin/catalog/brands", {
    method: "POST",
    body: draft,
  });
  return response.data;
}

export async function updateBrand(id: string, patch: Partial<BrandDraft>): Promise<Brand> {
  const response = await request<Envelope<Brand>>(`/admin/catalog/brands/${id}`, {
    method: "PUT",
    body: patch,
  });
  return response.data;
}

export async function deleteBrand(id: string): Promise<void> {
  await request<Envelope<null>>(`/admin/catalog/brands/${id}`, { method: "DELETE" });
}

/* ------------------------------------------------------------------ Chat */

export const fetchThreads = cache(async (status?: ThreadStatus): Promise<ChatThread[]> => {
  const response = await request<Envelope<ChatThread[]>>(`/admin/chat/threads${query({ status })}`);
  return response.data ?? [];
});

export const fetchThreadMessages = cache(async (id: string): Promise<ChatMessage[]> => {
  const response = await request<Envelope<ChatMessage[]>>(`/admin/chat/threads/${id}/messages`);
  return response.data ?? [];
});

/** Posts as `AGENT`; the usager sees a human has taken over from the bot. */
export async function replyToThread(id: string, text: string): Promise<ChatMessage> {
  const response = await request<Envelope<ChatMessage>>(`/admin/chat/threads/${id}/messages`, {
    method: "POST",
    body: { text },
  });
  return response.data;
}

export async function closeThread(id: string): Promise<ChatThread> {
  const response = await request<Envelope<ChatThread>>(`/admin/chat/threads/${id}/close`, {
    method: "PUT",
  });
  return response.data;
}

/* ------------------------------------------------------------ Messaging */

/** The 100 most recent campaigns — the route caps the history itself. */
export const fetchMessages = cache(async (status?: MessageStatus): Promise<AdminMessage[]> => {
  const response = await request<Envelope<AdminMessage[]>>(`/admin/messages${query({ status })}`);
  return response.data ?? [];
});

/** One campaign with its `recipients[]` and the per-status `counts`. */
export const fetchMessage = cache(async (id: string): Promise<AdminMessage> => {
  const response = await request<Envelope<AdminMessage>>(`/admin/messages/${id}`);
  return response.data;
});

/** The API's ceiling on `accountIds` per call. Larger audiences are chunked. */
export const MESSAGE_MAX_RECIPIENTS: number = 1000;
export const MESSAGE_MAX_LENGTH: number = 500;

/**
 * Sends — or, with `scheduledAt`, books — one SMS to a list of accounts. Each
 * recipient is settled on its own (`recipients[].status`): the call answers
 * 201 even when every single SMS failed, so the caller reads the counts.
 */
export async function sendMessage(
  accountIds: string[],
  body: string,
  scheduledAt?: string,
): Promise<SentMessage> {
  const response = await request<Envelope<SentMessage>>("/admin/messages", {
    method: "POST",
    body: { accountIds, body, ...(scheduledAt ? { scheduledAt } : {}) },
  });
  return response.data;
}

/** Only a `SCHEDULED` campaign can be withdrawn; anything else answers 400. */
export async function cancelMessage(id: string): Promise<AdminMessage> {
  const response = await request<Envelope<AdminMessage>>(`/admin/messages/${id}/cancel`, {
    method: "PUT",
  });
  return response.data;
}

/* ---------------------------------------------------------- Subscriptions */

/** Every formula, active or not. Prices here are the ones drivers are charged. */
export const fetchPlans = cache(async (): Promise<Plan[]> => {
  const response = await request<Envelope<Plan[]>>("/admin/subscriptions/plans");
  return response.data ?? [];
});

export type PlanPatch = { label?: string; priceGnf?: number; isActive?: boolean };

/** Only future payments are affected; a link already generated keeps its price. */
export async function updatePlan(code: PlanCode, patch: PlanPatch): Promise<Plan> {
  const response = await request<Envelope<Plan>>(`/admin/subscriptions/plans/${code}`, {
    method: "PUT",
    body: patch,
  });
  return response.data;
}

/** The 200 most recent payments — the route caps the history itself. */
export const fetchPayments = cache(
  async (status?: PaymentStatus, accountId?: string): Promise<Payment[]> => {
    const response = await request<Envelope<Payment[]>>(
      `/admin/subscriptions/payments${query({ status, accountId })}`,
    );
    return response.data ?? [];
  },
);

/** The 200 most recent periods; `activeOnly` keeps those covering now. */
export const fetchSubscriptions = cache(
  async (accountId?: string, activeOnly?: boolean): Promise<Subscription[]> => {
    const response = await request<Envelope<Subscription[]>>(
      `/admin/subscriptions${query({ accountId, active: activeOnly ? "true" : undefined })}`,
    );
    return response.data ?? [];
  },
);

/**
 * Asks Djomy again about one payment — for a driver who says they paid and
 * still has no access. Grants the subscription if Djomy confirms. The route
 * documents `outcome` and the updated payment without fixing where they sit,
 * so both the top level and `data` are read.
 */
export async function reconcilePayment(id: string): Promise<Reconciliation> {
  type Raw = { outcome?: string; payment?: Payment; data?: (Payment & { outcome?: string; payment?: Payment }) | null };
  const response = await request<Raw>(`/admin/subscriptions/payments/${id}/reconcile`, {
    method: "POST",
  });
  const data = response.data ?? null;
  return {
    outcome: String(response.outcome ?? data?.outcome ?? ""),
    payment: response.payment ?? data?.payment ?? (data && "status" in data ? data : null),
  };
}
