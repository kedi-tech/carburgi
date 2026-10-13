/**
 * The wire vocabulary of the Carbugui API, mirroring `backend-docs/openapi.json`
 * (Admin · *). The server shouts its enums; nothing above this file has to.
 */

export type AccountRole = "DRIVER" | "STATION" | "ADMIN";
export type AccountStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "DELETED";
export type Product = "ESSENCE" | "GASOIL" | "GAZ" | "LUBRIFIANT";
export type Availability = "AVAILABLE" | "EMPTY";
export type ReportStatus = "PENDING" | "ACCEPTED" | "REJECTED";
export type ReportKind =
  | "WRONG_AVAILABILITY"
  | "WRONG_OPEN_STATE"
  | "WRONG_LOCATION"
  | "CLOSED_PERMANENTLY"
  | "OTHER";
export type ThreadStatus = "OPEN" | "ESCALATED" | "CLOSED";
export type MessageStatus = "SCHEDULED" | "SENT" | "CANCELED";
export type RecipientStatus = "PENDING" | "SENT" | "FAILED" | "SKIPPED";
export type PlanCode = "DAY" | "MONTH";
export type PaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "EXPIRED";

export type Account = {
  id: string;
  role: AccountRole;
  status: AccountStatus;
  phoneNumber: string | null;
  fullName: string | null;
  locale: string;
  defaultAreaId: string | null;
  loginCode?: string | null;
  lastSeenAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Area = {
  id: string;
  slug: string;
  label: string;
  latitude: number;
  longitude: number;
  isActive: boolean;
  sortOrder: number;
};

export type Brand = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
};

export type StationProduct = {
  id: string;
  stationId: string;
  product: Product;
  availability: Availability;
  priceGnf: number | null;
  updatedAt: string;
  updatedById: string | null;
};

export type Station = {
  id: string;
  slug: string;
  name: string;
  brandId: string | null;
  areaId: string | null;
  neighborhood: string | null;
  city: string;
  address: string | null;
  phoneNumber: string | null;
  latitude: number;
  longitude: number;
  isOpen: boolean;
  isPublished: boolean;
  verifiedAt: string | null;
  statusUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
  brand: Brand | null;
  area: Area | null;
  products?: StationProduct[];
};

export type StationReport = {
  id: string;
  stationId: string;
  accountId: string | null;
  kind: ReportKind;
  product: Product | null;
  comment: string | null;
  status: ReportStatus;
  resolvedAt: string | null;
  createdAt: string;
};

export type ChatThread = {
  id: string;
  accountId: string;
  status: ThreadStatus;
  escalatedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatRole = "USER" | "BOT" | "AGENT";

export type ChatMessage = {
  id: string;
  threadId: string;
  role: ChatRole;
  text: string;
  intentId: string | null;
  createdAt: string;
};

/**
 * One line per account a message was addressed to. `phoneNumber` is a copy
 * taken at send time, so the row stays readable after the account changes.
 */
export type AdminMessageRecipient = {
  id: string;
  messageId: string;
  accountId: string;
  phoneNumber: string | null;
  status: RecipientStatus;
  error: string | null;
  sentAt: string | null;
  createdAt: string;
  account: {
    id: string;
    fullName: string | null;
    phoneNumber: string | null;
    role: AccountRole;
  } | null;
};

/**
 * An SMS campaign (`Admin · Messagerie`). The list route carries
 * `recipientCount` only; the detail and the send response carry `recipients`
 * and the per-status `counts`.
 */
export type AdminMessage = {
  id: string;
  senderId: string;
  body: string;
  status: MessageStatus;
  scheduledAt: string;
  dispatchedAt: string | null;
  createdAt: string;
  sender: { id: string; fullName: string | null } | null;
  recipientCount?: number;
  recipients?: AdminMessageRecipient[];
  counts?: Partial<Record<RecipientStatus, number>>;
};

/**
 * What `POST /admin/messages` answers: the message, plus the ids the server
 * could not address — unknown, or an administrator slipped into the list.
 */
export type SentMessage = AdminMessage & {
  notFoundIds?: string[];
  wrongRoleIds?: string[];
};

/**
 * `POST /admin/stations/{id}/accounts` answers with the plaintext password
 * once and never again — the confirmation screen is the only place it exists.
 */
export type StationAccess = {
  accountId: string;
  loginCode: string;
  password: string;
  fullName?: string | null;
  phoneNumber?: string | null;
};

export type MembershipRole = "OWNER" | "STAFF";

/** One account of a station, as `GET /admin/stations/{id}/accounts` lists it. */
export type StationAgent = {
  id: string;
  fullName: string | null;
  phoneNumber: string | null;
  loginCode: string | null;
  status: AccountStatus;
  membershipRole: MembershipRole | null;
  lastSeenAt: string | null;
  createdAt: string;
};

/**
 * What `POST /admin/accounts/admins` answers: the number the new
 * administrator signs in with and a server-generated password, in clear,
 * on this response only.
 */
export type AdminAccess = {
  accountId: string;
  phoneNumber: string;
  password: string;
};

/**
 * A subscription formula (`Admin · Abonnements`). The admin list carries the
 * inactive ones too, hence `isActive`, which the public schema leaves out.
 */
export type Plan = {
  code: PlanCode;
  label: string;
  priceGnf: number;
  durationHours: number;
  isActive?: boolean;
};

/** The driver a payment or a subscription period belongs to. */
export type SubscriberRef = {
  id: string;
  fullName: string | null;
  phoneNumber: string | null;
};

/**
 * A Djomy payment as the admin route returns it: the driver-facing fields of
 * the `Payment` schema plus what only the back-office sees — the processor's
 * transaction id, its fees and what actually reached the account. The spec
 * names these without typing them, so all three are optional.
 */
export type Payment = {
  id: string;
  accountId?: string;
  status: PaymentStatus;
  amountGnf: number;
  merchantReference: string;
  paymentUrl: string | null;
  linkExpiresAt: string | null;
  paymentMethod: string | null;
  paidAt: string | null;
  failureReason: string | null;
  createdAt: string;
  transactionId?: string | null;
  fees?: number | null;
  receivedAmount?: number | null;
  plan: { code: string; label: string } | null;
  subscription: { startsAt: string; endsAt: string } | null;
  account?: SubscriberRef | null;
};

/** One paid period of access. Periods bought in advance start where the last ends. */
export type Subscription = {
  id: string;
  accountId: string;
  planCode?: PlanCode;
  startsAt: string;
  endsAt: string;
  createdAt?: string;
  plan?: { code: string; label: string } | null;
  account?: SubscriberRef | null;
};

/** `POST /admin/subscriptions/payments/{id}/reconcile`: what Djomy said, and the payment after. */
export type Reconciliation = {
  outcome: string;
  payment: Payment | null;
};

/** `POST /admin/stations/import-osm` reports what it did to the catalogue. */
export type OsmImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
};

/** Most admin routes answer `{ success, count?, data }`. */
export type Envelope<T> = {
  success: boolean;
  count?: number;
  data: T;
};

export type AuthResult = {
  success: boolean;
  accessToken: string;
  refreshToken: string;
  account: Account;
};

export const productLabels: Record<Product, string> = {
  ESSENCE: "Essence",
  GASOIL: "Gasoil",
  GAZ: "Gaz",
  LUBRIFIANT: "Lubrifiant",
};

/**
 * What `priceGnf` measures. Fuels are priced by the litre; gas by the bottle;
 * a lubricant's price is only indicative, as the stations sell several sizes.
 */
export const productPriceUnits: Record<Product, string> = {
  ESSENCE: "GNF/L",
  GASOIL: "GNF/L",
  GAZ: "GNF/bouteille",
  LUBRIFIANT: "GNF (indicatif)",
};

export const reportKindLabels: Record<ReportKind, string> = {
  WRONG_AVAILABILITY: "Disponibilité incorrecte",
  WRONG_OPEN_STATE: "Ouverture incorrecte",
  WRONG_LOCATION: "Localisation incorrecte",
  CLOSED_PERMANENTLY: "Fermeture définitive",
  OTHER: "Autre",
};

export const accountStatusLabels: Record<AccountStatus, string> = {
  PENDING: "En attente",
  ACTIVE: "Actif",
  SUSPENDED: "Suspendu",
  DELETED: "Supprimé",
};

export const roleLabels: Record<AccountRole, string> = {
  DRIVER: "Conducteur",
  STATION: "Station",
  ADMIN: "Administrateur",
};

export const threadStatusLabels: Record<ThreadStatus, string> = {
  OPEN: "Ouvert",
  ESCALATED: "Escaladé",
  CLOSED: "Clôturé",
};

export const chatRoleLabels: Record<ChatRole, string> = {
  USER: "Usager",
  BOT: "Assistant CARBUGUI",
  AGENT: "Agent",
};

export const messageStatusLabels: Record<MessageStatus, string> = {
  SCHEDULED: "Programmé",
  SENT: "Envoyé",
  CANCELED: "Annulé",
};

export const recipientStatusLabels: Record<RecipientStatus, string> = {
  PENDING: "En attente",
  SENT: "Remis",
  FAILED: "Échec",
  SKIPPED: "Ignoré",
};

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  PENDING: "En attente",
  SUCCEEDED: "Payé",
  FAILED: "Échec",
  CANCELED: "Annulé",
  EXPIRED: "Expiré",
};

/** `outcome` of a reconciliation, in words. Unknown values are shown as sent. */
export const reconcileOutcomeLabels: Record<string, string> = {
  granted: "Paiement confirmé : l’abonnement est activé.",
  already_processed: "Paiement déjà traité : rien à faire.",
  pending: "Djomy n’a pas encore reçu le paiement.",
  expired: "Le lien de paiement a expiré sans paiement.",
  failed: "Djomy indique un paiement échoué.",
  canceled: "Le paiement a été annulé.",
};

/**
 * Short forms for the report list. The long ones above title a detail panel;
 * these fit in a chip.
 */
export const reportKindShort: Record<ReportKind, string> = {
  WRONG_AVAILABILITY: "Disponibilité",
  WRONG_OPEN_STATE: "Ouverture",
  WRONG_LOCATION: "Localisation",
  CLOSED_PERMANENTLY: "Fermeture définitive",
  OTHER: "Autre",
};
