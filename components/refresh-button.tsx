"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import Icon from "@/components/icon";
import { buttonClass } from "@/components/ui";

/**
 * Re-reads the page's server data. Every route is fetched `no-store`, so this
 * genuinely goes back to the API — it is not a cache bust dressed up as one.
 */
export default function RefreshButton({ label = "Rafraîchir les flux" }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
      className={buttonClass("ghost")}
    >
      <Icon name="sync" size={16} className={pending ? "animate-spin" : undefined} />
      {pending ? "Lecture…" : label}
    </button>
  );
}
