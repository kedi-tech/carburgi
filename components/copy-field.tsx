"use client";

import { useState } from "react";

import Icon from "@/components/icon";
import { buttonClass } from "@/components/ui";

/**
 * A credential with a Copier button beside it. Used by the two dialogs that
 * show a server-generated password once: a station's access and a new
 * administrator's.
 */
export default function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-label-md font-semibold text-on-surface-variant">{label}</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 select-all overflow-x-auto whitespace-nowrap rounded border border-surface-dim bg-surface-container-lowest px-3 py-2 font-mono text-title-md tracking-wide text-on-surface">
          {value}
        </code>
        <button
          type="button"
          className={buttonClass("ghost")}
          onClick={() => {
            navigator.clipboard?.writeText(value).then(
              () => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              },
              () => setCopied(false),
            );
          }}
        >
          <Icon name={copied ? "check" : "content_copy"} size={16} />
          {copied ? "Copié" : "Copier"}
        </button>
      </div>
    </div>
  );
}
