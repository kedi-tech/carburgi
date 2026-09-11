import type { ChatMessage } from "./types";

/**
 * The live side of Support: what the browser needs to follow a conversation
 * as it happens. Deliberately free of server imports — `transcript.tsx` runs
 * this in the client.
 *
 * The API's WebSocket is joined with `{ threadId, accountId }` and nothing
 * else, so the console can open it straight from the browser without the
 * admin token ever leaving the server. The console only ever *listens* on it:
 * a `{ text }` frame on that handshake would be posted as the usager, so
 * replies keep going through `POST /admin/chat/threads/{id}/messages`.
 */

/** `wss://host/` from the API base — the upgrade lives at the root, not `/ws`. */
export function chatSocketUrl(apiBaseUrl: string): string {
  return apiBaseUrl.replace(/^http/, "ws").replace(/\/api\/v1$/, "");
}

/**
 * How often the transcript re-reads its thread. The socket is the fast path;
 * this catches what it does not carry. Twelve requests a minute from one open
 * conversation sits well inside the API's 500-per-10-minutes budget, which is
 * shared by everyone using this console since every read leaves from the
 * server's address.
 */
export const TRANSCRIPT_POLL_MS = 5_000;

/**
 * How often the page checks whether *other* conversations moved — a new
 * escalation, a usager writing in a thread that is not the open one. A change
 * refreshes the page's server data, which costs several reads, so this is
 * slower than the transcript's own poll.
 */
export const THREADS_POLL_MS = 20_000;

/** Reconnect delays after a dropped socket, in order; the last one repeats. */
export const RECONNECT_DELAYS_MS: number[] = [1_000, 2_000, 5_000, 10_000, 20_000];

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<ChatMessage>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.text === "string" &&
    typeof candidate.role === "string" &&
    typeof candidate.createdAt === "string"
  );
}

/**
 * Pulls the chat message out of a socket frame, or returns null for anything
 * else. The spec documents only the handshake; the live server answers in
 * `{ type, … }` envelopes (`{ type: "error", message }` for a bad handshake),
 * so a message may arrive bare or wrapped under `data`, `message` or
 * `payload`. Every shape is accepted rather than betting on one.
 */
export function parseSocketFrame(raw: unknown): ChatMessage | null {
  let frame: unknown = raw;
  if (typeof raw === "string") {
    try {
      frame = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!frame || typeof frame !== "object") {
    return null;
  }
  if (isChatMessage(frame)) {
    return frame;
  }
  const envelope = frame as { type?: unknown; data?: unknown; message?: unknown; payload?: unknown };
  if (envelope.type === "error") {
    return null;
  }
  for (const inner of [envelope.data, envelope.message, envelope.payload]) {
    if (isChatMessage(inner)) {
      return inner;
    }
  }
  return null;
}

/**
 * The list with `incoming` folded in: messages already present (by id) are
 * left alone, new ones are appended in the order they came. Both the socket
 * and the poll go through here, so a message that arrives twice shows once.
 */
export function mergeMessages<T extends ChatMessage>(current: T[], incoming: T[]): T[] {
  const known = new Set(current.map((message) => message.id));
  const fresh = incoming.filter((message) => !known.has(message.id));
  return fresh.length === 0 ? current : [...current, ...fresh];
}

/**
 * A fingerprint of the thread list, for noticing that something moved without
 * comparing lists. The open conversation contributes its status only: its
 * messages are followed by the transcript, and counting its own replies as a
 * change would refresh the whole page after every message sent.
 */
export function threadsDigest(
  threads: { id: string; status: string; updatedAt: string }[],
  openThreadId: string | null,
): string {
  return threads
    .map((thread) =>
      thread.id === openThreadId
        ? `${thread.id}:${thread.status}`
        : `${thread.id}:${thread.status}:${thread.updatedAt}`,
    )
    .sort()
    .join("|");
}
