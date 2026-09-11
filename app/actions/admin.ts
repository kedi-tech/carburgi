"use server";

import { revalidatePath } from "next/cache";

import {
  ApiError,
  cancelMessage,
  closeThread,
  createArea,
  createBrand,
  createStation,
  createStationAccess,
  deleteArea,
  deleteBrand,
  deleteStation,
  fetchAccounts,
  fetchThreadMessages,
  fetchThreads,
  importOsmStations,
  MESSAGE_MAX_LENGTH,
  MESSAGE_MAX_RECIPIENTS,
  replyToThread,
  resolveReport,
  sendMessage,
  setAccountStatus,
  setStationPublished,
  updateArea,
  updateBrand,
  updateStation,
  verifyStation,
} from "@/lib/api";
import { threadsDigest } from "@/lib/chat-live";
import { dateLabel, phoneLabel } from "@/lib/format";
import { audienceRecipients, isTarget, reachablePeople } from "@/lib/messages";
import { safe } from "@/lib/safe";
import type {
  AccountStatus,
  ChatMessage,
  OsmImportResult,
  ReportStatus,
  SentMessage,
  StationAccess,
} from "@/lib/types";

/**
 * Every decision a regulator takes from this console goes through one of these.
 * They return a message rather than throwing, so a failed call leaves the row
 * in place with an explanation instead of collapsing the page.
 */
export type ActionState = {
  error?: string;
  done?: string;
  /** Credentials minted by the API, readable once and never again. */
  access?: StationAccess;
  /** What an OpenStreetMap re-sync did to the catalogue. */
  imported?: OsmImportResult;
  /** The reply as the API stored it, for the transcript to confirm in place. */
  message?: ChatMessage;
  /** The campaign(s) the API created — one per chunk of 1000 recipients. */
  sent?: SentMessage[];
};

function failure(caught: unknown, fallback: string): ActionState {
  if (caught instanceof ApiError) {
    return { error: caught.message };
  }
  return { error: fallback };
}

/**
 * The sidebar counters and the home tiles are derived from the same reads as
 * the pages, so a decision has to refresh the shell too — not just the table
 * it was taken in.
 */
function revalidateConsole(...paths: string[]): void {
  revalidatePath("/", "layout");
  for (const path of paths) {
    revalidatePath(path);
  }
}

function required(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function optional(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value.length > 0 ? value : null;
}

function coordinate(formData: FormData, name: string): number | null {
  const raw = required(formData, name).replace(",", ".");
  if (raw.length === 0) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/* -------------------------------------------------------------- Accounts */

/** Approving a PENDING station account is what lets an agent publish statuses. */
export async function updateAccountStatus(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = required(formData, "id");
  const status = required(formData, "status") as AccountStatus;
  if (!id || !status) {
    return { error: "Compte ou statut manquant." };
  }

  try {
    await setAccountStatus(id, status);
  } catch (caught) {
    return failure(caught, "Le statut n’a pas pu être modifié.");
  }

  revalidateConsole("/validations", "/accounts");
  const messages: Record<AccountStatus, string> = {
    ACTIVE: "Accès validé.",
    SUSPENDED: "Compte suspendu.",
    DELETED: "Compte supprimé.",
    PENDING: "Statut mis à jour.",
  };
  return { done: messages[status] ?? "Statut mis à jour." };
}

/* --------------------------------------------------------------- Reports */

export async function updateReportStatus(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = required(formData, "id");
  const status = required(formData, "status") as ReportStatus;
  if (!id || !status) {
    return { error: "Signalement ou décision manquante." };
  }

  try {
    await resolveReport(id, status);
  } catch (caught) {
    return failure(caught, "Le signalement n’a pas pu être traité.");
  }

  revalidateConsole("/reports");
  return { done: status === "ACCEPTED" ? "Signalement retenu." : "Signalement rejeté." };
}

/** Arbitrates a whole cluster in one decision — same route, once per report. */
export async function resolveReportBatch(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ids = required(formData, "ids").split(",").filter(Boolean);
  const status = required(formData, "status") as ReportStatus;
  if (ids.length === 0 || !status) {
    return { error: "Signalements ou décision manquants." };
  }

  let failed = 0;
  for (const id of ids) {
    try {
      await resolveReport(id, status);
    } catch {
      failed += 1;
    }
  }

  revalidateConsole("/reports");
  if (failed === ids.length) {
    return { error: "Aucun signalement n’a pu être traité." };
  }
  if (failed > 0) {
    return { done: `${ids.length - failed} traité(s), ${failed} en échec.` };
  }
  return {
    done: `${ids.length} signalement(s) ${status === "ACCEPTED" ? "retenus" : "rejetés"}.`,
  };
}

/* -------------------------------------------------------------- Stations */

export async function markStationVerified(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = required(formData, "id");
  if (!id) {
    return { error: "Station manquante." };
  }

  try {
    await verifyStation(id);
  } catch (caught) {
    return failure(caught, "La station n’a pas pu être vérifiée.");
  }

  revalidateConsole("/stations");
  return { done: "Station vérifiée." };
}

/** Unpublishing hides a station from drivers without deleting anything. */
export async function updateStationPublication(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = required(formData, "id");
  const isPublished = required(formData, "isPublished") === "true";
  if (!id) {
    return { error: "Station manquante." };
  }

  try {
    await setStationPublished(id, isPublished);
  } catch (caught) {
    return failure(caught, "La publication n’a pas pu être modifiée.");
  }

  revalidateConsole("/stations");
  return { done: isPublished ? "Station publiée." : "Station retirée du public." };
}

/** Creates when `id` is empty, edits otherwise — one form, one action. */
export async function saveStation(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = required(formData, "id");
  const name = required(formData, "name");
  const latitude = coordinate(formData, "latitude");
  const longitude = coordinate(formData, "longitude");

  if (name.length < 2) {
    return { error: "Le nom de la station est obligatoire." };
  }
  if (latitude === null || longitude === null) {
    return { error: "Latitude et longitude sont obligatoires et doivent être numériques." };
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return { error: "Coordonnées hors limites." };
  }

  const draft = {
    name,
    brandId: optional(formData, "brandId"),
    areaId: optional(formData, "areaId"),
    neighborhood: optional(formData, "neighborhood"),
    city: optional(formData, "city") ?? "Conakry",
    address: optional(formData, "address"),
    phoneNumber: optional(formData, "phoneNumber"),
    latitude,
    longitude,
  };

  try {
    if (id) {
      await updateStation(id, draft);
    } else {
      await createStation(draft);
    }
  } catch (caught) {
    return failure(caught, "La station n’a pas pu être enregistrée.");
  }

  revalidateConsole("/stations");
  return { done: id ? "Station modifiée." : "Station créée." };
}

/**
 * Deletion cascades to products, activities, memberships and reports. The UI
 * asks for the station's name to be typed before calling this; unpublishing is
 * the reversible alternative and is offered first.
 */
export async function removeStation(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = required(formData, "id");
  const confirmation = required(formData, "confirmation");
  const expected = required(formData, "expected");

  if (!id) {
    return { error: "Station manquante." };
  }
  if (confirmation !== expected) {
    return { error: "Saisissez exactement le nom de la station pour confirmer." };
  }

  try {
    await deleteStation(id);
  } catch (caught) {
    return failure(caught, "La station n’a pas pu être supprimée.");
  }

  revalidateConsole("/stations");
  return { done: "Station supprimée." };
}

/**
 * Mints the station's credentials. The password comes back once — the caller
 * puts it on screen and the API can never show it again.
 */
export async function issueStationAccess(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = required(formData, "id");
  if (!id) {
    return { error: "Station manquante." };
  }

  try {
    const access = await createStationAccess(id);
    revalidateConsole("/stations", "/accounts");
    return { access, done: "Identifiants créés." };
  } catch (caught) {
    return failure(caught, "Les identifiants n’ont pas pu être créés.");
  }
}

export async function syncOpenStreetMap(
  _state: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  try {
    const imported = await importOsmStations();
    revalidateConsole("/stations");
    return { imported, done: "Import terminé." };
  } catch (caught) {
    return failure(caught, "L’import OpenStreetMap a échoué.");
  }
}

/* ------------------------------------------------------------- Catalogue */

export async function saveBrand(_state: ActionState, formData: FormData): Promise<ActionState> {
  const id = required(formData, "id");
  const name = required(formData, "name");
  if (name.length < 2) {
    return { error: "Le nom de la marque est obligatoire." };
  }

  try {
    const draft = { name, logoUrl: optional(formData, "logoUrl") };
    if (id) {
      await updateBrand(id, draft);
    } else {
      await createBrand(draft);
    }
  } catch (caught) {
    return failure(caught, "La marque n’a pas pu être enregistrée.");
  }

  revalidateConsole("/catalogue", "/stations");
  return { done: id ? "Marque modifiée." : "Marque créée." };
}

/** `onDelete: SetNull` — the stations survive, they lose their enseigne. */
export async function removeBrand(_state: ActionState, formData: FormData): Promise<ActionState> {
  const id = required(formData, "id");
  if (!id) {
    return { error: "Marque manquante." };
  }

  try {
    await deleteBrand(id);
  } catch (caught) {
    return failure(caught, "La marque n’a pas pu être supprimée.");
  }

  revalidateConsole("/catalogue", "/stations");
  return { done: "Marque supprimée." };
}

export async function saveArea(_state: ActionState, formData: FormData): Promise<ActionState> {
  const id = required(formData, "id");
  const label = required(formData, "label");
  const latitude = coordinate(formData, "latitude");
  const longitude = coordinate(formData, "longitude");
  const sortOrderRaw = required(formData, "sortOrder");

  if (label.length < 2) {
    return { error: "Le nom de la zone est obligatoire." };
  }
  if (latitude === null || longitude === null) {
    return { error: "Latitude et longitude sont obligatoires et doivent être numériques." };
  }

  try {
    const draft = {
      label,
      latitude,
      longitude,
      ...(sortOrderRaw ? { sortOrder: Number(sortOrderRaw) } : {}),
    };
    if (id) {
      await updateArea(id, draft);
    } else {
      await createArea(draft);
    }
  } catch (caught) {
    return failure(caught, "La zone n’a pas pu être enregistrée.");
  }

  revalidateConsole("/catalogue");
  return { done: id ? "Zone modifiée." : "Zone créée." };
}

/**
 * Deactivating is preferred to deleting: a zone is a choice offered in the
 * driver app when the device refuses location, and removing it detaches every
 * station that referenced it.
 */
export async function setAreaActive(_state: ActionState, formData: FormData): Promise<ActionState> {
  const id = required(formData, "id");
  const isActive = required(formData, "isActive") === "true";
  if (!id) {
    return { error: "Zone manquante." };
  }

  try {
    await updateArea(id, { isActive });
  } catch (caught) {
    return failure(caught, "La zone n’a pas pu être modifiée.");
  }

  revalidateConsole("/catalogue");
  return { done: isActive ? "Zone réactivée." : "Zone désactivée." };
}

export async function removeArea(_state: ActionState, formData: FormData): Promise<ActionState> {
  const id = required(formData, "id");
  if (!id) {
    return { error: "Zone manquante." };
  }

  try {
    await deleteArea(id);
  } catch (caught) {
    return failure(caught, "La zone n’a pas pu être supprimée.");
  }

  revalidateConsole("/catalogue", "/stations");
  return { done: "Zone supprimée." };
}

/* ------------------------------------------------------------------ Chat */

export async function sendThreadReply(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = required(formData, "id");
  const text = required(formData, "text");

  if (!id) {
    return { error: "Conversation manquante." };
  }
  if (text.length === 0) {
    return { error: "Écrivez un message avant d’envoyer." };
  }

  try {
    const message = await replyToThread(id, text);
    /*
      Deliberately no revalidation. Revalidating the layout here made every
      reply wait for the whole console to re-render — threads, accounts, the
      transcript and the four sidebar reads — before the action could resolve.
      The transcript appends the message optimistically and swaps in this
      confirmed one; the server-rendered copy catches up on the next navigation,
      which re-reads the thread anyway.
    */
    return {
      done: "Message envoyé.",
      // A route that answers with an empty body still sent the message: fall
      // back to what was typed rather than dropping it from the transcript.
      message: message?.id
        ? message
        : {
            id: `local-${Date.now()}`,
            threadId: id,
            role: "AGENT",
            text,
            intentId: null,
            createdAt: new Date().toISOString(),
          },
    };
  } catch (caught) {
    return failure(caught, "Le message n’a pas pu être envoyé.");
  }
}

/**
 * The transcript’s poll. Reads are otherwise the page’s business, but the
 * live transcript needs a way to re-read one thread without re-rendering the
 * console around it — the whole point of not revalidating in `sendThreadReply`.
 * A failure is returned, not thrown: the next tick simply tries again.
 */
export async function readThreadMessages(
  id: string,
): Promise<{ messages: ChatMessage[]; error: null } | { messages: null; error: string }> {
  const result = await safe(() => fetchThreadMessages(id));
  return result.data ? { messages: result.data, error: null } : { messages: null, error: result.error };
}

/**
 * The thread list’s poll: a fingerprint rather than the list, so the page can
 * notice a change and refresh itself without shipping every thread each time.
 */
export async function readThreadsDigest(
  openThreadId: string | null,
): Promise<{ digest: string; error: null } | { digest: null; error: string }> {
  const result = await safe(() => fetchThreads());
  return result.data
    ? { digest: threadsDigest(result.data, openThreadId), error: null }
    : { digest: null, error: result.error };
}

export async function closeThreadAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = required(formData, "id");
  if (!id) {
    return { error: "Conversation manquante." };
  }

  try {
    await closeThread(id);
  } catch (caught) {
    return failure(caught, "La conversation n’a pas pu être clôturée.");
  }

  revalidateConsole("/support");
  return { done: "Conversation clôturée." };
}

/* ------------------------------------------------------------ Messaging */

/**
 * Sends one SMS to a whole audience — every active driver, every active
 * station team, or both — or to a single account. The recipient list is
 * resolved here, from the same account read the page displays, so the count
 * the administrator saw is the list that goes out. The API caps a call at
 * 1000 ids; a bigger audience is split into consecutive campaigns rather than
 * refused.
 */
export async function sendNotification(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const target = required(formData, "target");
  const accountId = optional(formData, "accountId");
  const body = required(formData, "body");
  const scheduledAt = optional(formData, "scheduledAt");

  if (!isTarget(target)) {
    return { error: "Choisissez à qui envoyer le message." };
  }
  if (target === "ONE" && !accountId) {
    return { error: "Choisissez le compte destinataire." };
  }
  if (body.length === 0) {
    return { error: "Écrivez le message avant d’envoyer." };
  }
  if (body.length > MESSAGE_MAX_LENGTH) {
    return { error: `Le message dépasse ${MESSAGE_MAX_LENGTH} caractères.` };
  }
  if (scheduledAt) {
    const when = new Date(scheduledAt).getTime();
    if (Number.isNaN(when)) {
      return { error: "La date de programmation est illisible." };
    }
    // The API refuses anything under a minute ahead; say so before the round trip.
    if (when < Date.now() + 60_000) {
      return { error: "La date de programmation doit être au moins une minute dans le futur." };
    }
  }

  let recipients: string[];
  let recipientName: string | null = null;
  try {
    const accounts = await fetchAccounts();
    if (target === "ONE") {
      // Re-checked here rather than trusted from the form: the id must still
      // be someone an SMS can reach.
      const person = reachablePeople(accounts).find((candidate) => candidate.id === accountId);
      if (!person) {
        return { error: "Ce compte n’existe plus, n’a pas de numéro, ou n’est pas joignable par SMS." };
      }
      recipients = [person.id];
      recipientName = person.fullName ?? phoneLabel(person.phoneNumber);
    } else {
      recipients = audienceRecipients(accounts, target).map((account) => account.id);
    }
  } catch (caught) {
    return failure(caught, "La liste des destinataires n’a pas pu être lue.");
  }
  if (recipients.length === 0) {
    return { error: "Aucun compte actif avec un numéro ne correspond à cette audience." };
  }

  const sent: SentMessage[] = [];
  for (let start = 0; start < recipients.length; start += MESSAGE_MAX_RECIPIENTS) {
    const chunk = recipients.slice(start, start + MESSAGE_MAX_RECIPIENTS);
    try {
      sent.push(await sendMessage(chunk, body, scheduledAt ?? undefined));
    } catch (caught) {
      // Earlier chunks have already left; say what did go out rather than
      // reporting a clean failure.
      const outcome = failure(caught, "L’envoi a échoué.");
      if (sent.length > 0) {
        revalidateConsole("/messages");
        return {
          ...outcome,
          sent,
          error: `${sent.length} lot(s) envoyé(s), puis : ${outcome.error}`,
        };
      }
      return outcome;
    }
  }

  revalidateConsole("/messages");

  if (scheduledAt) {
    return {
      sent,
      done: recipientName
        ? `Envoi à ${recipientName} programmé pour le ${dateLabel(scheduledAt)}.`
        : `Envoi programmé pour le ${dateLabel(scheduledAt)} — ${recipients.length} destinataire(s).`,
    };
  }

  const tally = { SENT: 0, FAILED: 0, SKIPPED: 0, PENDING: 0 };
  for (const campaign of sent) {
    for (const recipient of campaign.recipients ?? []) {
      tally[recipient.status] += 1;
    }
  }
  if (recipientName) {
    const outcome = sent[0]?.recipients?.[0];
    if (outcome?.status === "FAILED") {
      return { sent, error: `L’envoi à ${recipientName} a échoué${outcome.error ? ` : ${outcome.error}` : "."}` };
    }
    if (outcome?.status === "SKIPPED") {
      return { sent, error: `${recipientName} n’a pas de numéro enregistré : rien n’a été envoyé.` };
    }
    return { sent, done: `Message remis à ${recipientName}.` };
  }

  const parts: string[] = [`${tally.SENT} remis`];
  if (tally.FAILED > 0) {
    parts.push(`${tally.FAILED} en échec`);
  }
  if (tally.SKIPPED > 0) {
    parts.push(`${tally.SKIPPED} sans numéro`);
  }
  if (tally.PENDING > 0) {
    parts.push(`${tally.PENDING} en attente`);
  }
  return {
    sent,
    done: `Message traité pour ${recipients.length} destinataire(s) : ${parts.join(", ")}.`,
  };
}

/** Withdraws a campaign the scheduler has not picked up yet. */
export async function cancelNotification(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = required(formData, "id");
  if (!id) {
    return { error: "Envoi manquant." };
  }

  try {
    await cancelMessage(id);
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 400) {
      return { error: "Cet envoi est déjà parti ou déjà annulé." };
    }
    return failure(caught, "L’envoi n’a pas pu être annulé.");
  }

  revalidateConsole("/messages");
  return { done: "Envoi annulé." };
}
