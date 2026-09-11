"use client";

import { startTransition, useCallback, useEffect, useOptimistic, useRef, useState } from "react";

import { readThreadMessages, sendThreadReply } from "@/app/actions/admin";
import Icon from "@/components/icon";
import { Chip, buttonClass } from "@/components/ui";
import {
  RECONNECT_DELAYS_MS,
  TRANSCRIPT_POLL_MS,
  mergeMessages,
  parseSocketFrame,
} from "@/lib/chat-live";
import { dateLabel } from "@/lib/format";
import { chatRoleLabels, type ChatMessage } from "@/lib/types";

const SUGGESTIONS: string[] = [
  "Bonjour, un agent CARBUGUI prend le relais de votre demande.",
  "Pouvez-vous préciser le nom de la station et l’heure de votre passage ?",
  "Merci, votre signalement a été transmis à l’équipe de la station.",
];

/** A message the transcript is showing before the API has confirmed it. */
type Row = ChatMessage & { pending?: boolean };

/** Where the live channel stands; shown in the transcript's header line. */
type LiveState = "connecting" | "live" | "polling";

/**
 * The optimistic row for a reply that has just been sent. Lives outside the
 * component because it reads the clock, which render code may not do.
 */
function draftReply(threadId: string, text: string): Row {
  return {
    id: `optimistic-${Date.now()}`,
    threadId,
    role: "AGENT",
    text,
    intentId: null,
    createdAt: new Date().toISOString(),
    pending: true,
  };
}

function Message({ message }: { message: Row }) {
  if (message.role === "AGENT") {
    return (
      <li className={`flex flex-col items-end gap-1 ${message.pending ? "opacity-60" : ""}`}>
        <span className="flex items-center gap-1.5 text-label-sm text-on-surface-variant">
          <Chip tone="info">{chatRoleLabels.AGENT}</Chip>
          {message.pending ? (
            <span className="flex items-center gap-1">
              <Icon name="schedule" size={14} />
              envoi…
            </span>
          ) : (
            dateLabel(message.createdAt)
          )}
        </span>
        <p className="max-w-[80%] whitespace-pre-wrap rounded rounded-tr-none bg-primary-container px-3 py-2 text-body-md leading-relaxed text-on-primary">
          {message.text}
        </p>
      </li>
    );
  }

  const isBot = message.role === "BOT";

  return (
    <li className="flex flex-col items-start gap-1">
      <span className="flex items-center gap-1.5 text-label-sm text-on-surface-variant">
        <span className="flex items-center gap-1">
          <Icon
            name={isBot ? "smart_toy" : "person"}
            size={14}
            className={isBot ? "text-surface-tint" : "text-on-surface-variant"}
          />
          {chatRoleLabels[message.role]}
        </span>
        {dateLabel(message.createdAt)}
        {message.intentId ? (
          <span className="rounded bg-surface-container px-1.5 py-0.5 font-mono text-label-sm text-on-surface-variant">
            {message.intentId}
          </span>
        ) : null}
      </span>
      <p
        className={`max-w-[80%] whitespace-pre-wrap rounded rounded-tl-none px-3 py-2 text-body-md leading-relaxed ${
          isBot
            ? "border border-surface-container-highest bg-surface-container-low text-on-surface-variant"
            : "bg-surface-container-high text-on-surface"
        }`}
      >
        {message.text}
      </p>
    </li>
  );
}

function LiveBadge({ state }: { state: LiveState }) {
  if (state === "live") {
    return (
      <span className="flex items-center gap-1.5 text-label-sm text-on-surface-variant">
        <span className="h-2 w-2 rounded-full bg-[#16a34a]" />
        En direct
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-label-sm text-on-surface-variant">
      <Icon name="sync" size={14} className={state === "connecting" ? "animate-spin" : undefined} />
      {state === "connecting" ? "Connexion…" : "Actualisé toutes les 5 s"}
    </span>
  );
}

/**
 * The conversation and the box to answer it, as one client component.
 *
 * Sending has to feel instant. The message is appended the moment Envoyer is
 * pressed (`useOptimistic`), greyed and marked "envoi…", and the action goes
 * off in the background. When it returns, the confirmed copy — with the id and
 * timestamp the API assigned — replaces the optimistic one; on failure the row
 * is withdrawn and the reason shown under the box. Nothing on the page is
 * re-fetched: one request per message, and the caret never leaves the box.
 *
 * Receiving has to be live too. The transcript joins the thread's WebSocket
 * with the same `{ threadId, accountId }` handshake the app uses, so what the
 * usager types lands here the moment the server broadcasts it, and re-reads
 * the thread every few seconds for anything the socket did not carry. Both
 * paths merge by id, so nothing shows twice.
 */
export default function Transcript({
  threadId,
  accountId,
  socketUrl,
  initialMessages,
  closed,
  error,
}: {
  threadId: string;
  /** The usager's account — the socket handshake needs it beside the thread. */
  accountId: string;
  /** `wss://host/`, derived on the server from the API base URL. */
  socketUrl: string;
  initialMessages: ChatMessage[];
  closed: boolean;
  /** A read failure for the transcript itself, shown in place of the list. */
  error?: string | null;
}) {
  // Confirmed messages: what the server sent, plus every reply the API has
  // acknowledged since and everything the live channel brought in. Optimistic
  // rows sit on top of this and fall away as each action settles.
  const [confirmed, setConfirmed] = useState<Row[]>(initialMessages);
  const [optimistic, addOptimistic] = useOptimistic<Row[], Row>(confirmed, (rows, next) => [
    ...rows,
    next,
  ]);
  const [failure, setFailure] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // Without a socket to open there is only the poll; the badge says so from
  // the first paint rather than after an effect.
  const [live, setLive] = useState<LiveState>(
    closed || socketUrl.length === 0 ? "polling" : "connecting",
  );

  const textarea = useRef<HTMLTextAreaElement>(null);
  const listEnd = useRef<HTMLDivElement>(null);

  // Switching threads must not carry local additions across: the parent keys
  // this component by thread id, so a different conversation is a fresh mount.

  // Keep the newest message in view, as any chat does.
  useEffect(() => {
    listEnd.current?.scrollIntoView({ block: "end" });
  }, [optimistic.length]);

  const receive = useCallback((incoming: ChatMessage[]) => {
    setConfirmed((rows) => mergeMessages(rows, incoming));
  }, []);

  /** Re-reads the thread; a failed read is left to the next tick. */
  const refresh = useCallback(async () => {
    const result = await readThreadMessages(threadId);
    if (result.messages) {
      receive(result.messages);
    }
  }, [receive, threadId]);

  // The live channel. Listening only — see `lib/chat-live.ts` for why a reply
  // never goes down this socket. Reopened with growing delays while the
  // transcript is mounted; each (re)connection re-reads the thread to fill
  // whatever the gap missed.
  useEffect(() => {
    if (closed || socketUrl.length === 0) {
      return;
    }

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let active = true;

    const scheduleReconnect = () => {
      if (!active || reconnectTimer) {
        return;
      }
      setLive("polling");
      const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
      attempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    const connect = () => {
      if (!active) {
        return;
      }
      try {
        socket = new WebSocket(socketUrl);
      } catch {
        scheduleReconnect();
        return;
      }
      socket.onopen = () => {
        attempt = 0;
        socket?.send(JSON.stringify({ threadId, accountId }));
        setLive("live");
        void refresh();
      };
      socket.onmessage = (event: MessageEvent) => {
        const message = parseSocketFrame(event.data);
        if (message && (!message.threadId || message.threadId === threadId)) {
          receive([message]);
        }
      };
      // The close handler does the reconnecting; an error always closes.
      socket.onerror = () => undefined;
      socket.onclose = () => {
        socket = null;
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, [accountId, closed, receive, refresh, socketUrl, threadId]);

  // The safety net under the socket: while the tab is visible, re-read the
  // thread on a short interval. A closed conversation cannot grow, so it is
  // not polled.
  useEffect(() => {
    if (closed) {
      return;
    }
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }, TRANSCRIPT_POLL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [closed, refresh]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (trimmed.length === 0 || sending) {
      return;
    }

    setFailure(null);
    setSending(true);

    const draft = draftReply(threadId, trimmed);

    // The box empties immediately — the message is already on screen.
    if (textarea.current) {
      textarea.current.value = "";
      textarea.current.focus();
    }

    const formData = new FormData();
    formData.set("id", threadId);
    formData.set("text", trimmed);

    startTransition(async () => {
      addOptimistic(draft);
      const result = await sendThreadReply({}, formData);
      if (result.message) {
        // Merged rather than appended: the socket may have delivered the
        // API's copy of this very reply before the action came back.
        receive([result.message]);
      } else {
        setFailure(result.error ?? "Le message n’a pas pu être envoyé.");
        // Give the text back so it is not lost to a retry.
        if (textarea.current && textarea.current.value.length === 0) {
          textarea.current.value = trimmed;
        }
      }
      setSending(false);
    });
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto bg-surface-container-low/40 p-4">
        {error ? (
          <div className="flex items-start gap-2 rounded border border-[#fecaca] bg-error-container px-3 py-2">
            <Icon name="error" size={18} className="mt-px text-error" />
            <p className="text-body-sm text-on-error-container">{error}</p>
          </div>
        ) : optimistic.length === 0 ? (
          <p className="text-body-sm text-outline">Cette conversation ne contient aucun message.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {optimistic.map((message) => (
              <Message key={message.id} message={message} />
            ))}
          </ul>
        )}
        <div ref={listEnd} />
      </div>

      {closed ? (
        <div className="border-t border-outline-variant/40 bg-surface-container-low px-4 py-3 text-body-sm text-outline">
          Cette conversation est clôturée. Elle doit être rouverte pour reprendre l’échange.
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send(textarea.current?.value ?? "");
          }}
          className="border-t border-outline-variant/40 bg-surface-container-lowest p-3"
        >
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
              Réponses types
            </span>
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  if (textarea.current) {
                    textarea.current.value = suggestion;
                    textarea.current.focus();
                  }
                }}
                className="rounded border border-surface-dim bg-surface-container-low px-2 py-1 text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container"
              >
                {suggestion.length > 42 ? `${suggestion.slice(0, 42)}…` : suggestion}
              </button>
            ))}
            <span className="ml-auto">
              <LiveBadge state={live} />
            </span>
          </div>

          <textarea
            ref={textarea}
            name="text"
            rows={3}
            required
            autoFocus
            placeholder="Répondre en tant qu’agent CARBUGUI… (Entrée pour envoyer, Maj+Entrée pour un retour à la ligne)"
            onKeyDown={(event) => {
              // Enter sends, as in every messaging tool; Shift+Enter keeps the
              // newline for the rare multi-paragraph answer.
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send(event.currentTarget.value);
              }
            }}
            className="w-full resize-y rounded border border-surface-dim bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface outline-none transition placeholder:text-outline focus:border-primary-container focus:ring-2 focus:ring-primary-container/20"
          />

          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-body-sm text-outline">
              {failure ? (
                <span className="font-semibold text-error">{failure}</span>
              ) : (
                "Publié en tant qu’agent CARBUGUI, visible par l’usager dans l’application."
              )}
            </span>
            <button type="submit" disabled={sending} className={buttonClass("primary")}>
              <Icon name="send" size={16} />
              Envoyer
            </button>
          </div>
        </form>
      )}
    </>
  );
}
