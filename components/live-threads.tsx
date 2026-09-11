"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

import { readThreadsDigest } from "@/app/actions/admin";
import { THREADS_POLL_MS } from "@/lib/chat-live";

/**
 * Keeps the Support list current without anyone pressing Actualiser.
 *
 * Every twenty seconds, while the tab is visible, it asks the server for a
 * fingerprint of the thread list and re-reads the page when the fingerprint
 * moved — a new escalation, a usager writing in a conversation other than the
 * open one, a thread closed from another seat. The open conversation is
 * followed by its transcript and does not count here (see `threadsDigest`),
 * so replying never triggers a full re-render.
 *
 * Renders nothing: the page it sits in is what changes.
 */
export default function LiveThreads({
  digest,
  openThreadId,
}: {
  /** The fingerprint of the list the page was rendered from. */
  digest: string;
  openThreadId: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // What the page currently shows. Synced from the prop after each server
  // render, and moved ahead the moment a change is seen so one change does
  // not refresh twice while the re-render is in flight.
  const shown = useRef(digest);

  useEffect(() => {
    shown.current = digest;
  }, [digest]);

  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      const result = await readThreadsDigest(openThreadId);
      if (result.digest !== null && result.digest !== shown.current) {
        shown.current = result.digest;
        startTransition(() => router.refresh());
      }
    }, THREADS_POLL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [openThreadId, router]);

  return null;
}
