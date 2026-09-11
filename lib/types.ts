/**
 * The wire vocabulary of the Carbugui API, mirroring `expo/assets/openapi.json`
 * (Admin · *). The server shouts its enums; nothing above this file has to.
 */

export type AccountRole = "DRIVER" | "STATION" | "ADMIN";
export type AccountStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "DELETED";
export type Product = "ESSENCE" | "GASOIL";
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
