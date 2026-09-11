"use client";

import { useActionState, useState } from "react";

import { syncOpenStreetMap, type ActionState } from "@/app/actions/admin";
import Icon from "@/components/icon";
import { buttonClass } from "@/components/ui";

const initialState: ActionState = {};

/**
 * Re-syncs the national catalogue from OpenStreetMap.
 *
 * The call touches every published station, so it is armed before it is fired,
 * and its four counts — créées, mises à jour, ignorées, erreurs — stay on
 * screen afterwards rather than flashing past in a toast. An import that gives
 * no feedback is an import somebody runs twice.
 */
export default function OsmSync() {
  const [state, submit, pending] = useActionState(syncOpenStreetMap, initialState);
  const [armed, setArmed] = useState(false);

  const result = state.imported;

  return (
    <div className="flex flex-col items-end gap-2">
      <form action={submit}>
        <button
          type={armed ? "submit" : "button"}
          onClick={armed ? undefined : () => setArmed(true)}
          disabled={pending}
          className={buttonClass(armed ? "accent" : "ghost")}
        >
          <Icon name={pending ? "sync" : armed ? "warning" : "sync"} size={16} />
          {pending
            ? "Import en cours…"
            : armed
              ? "Confirmer la synchronisation"
              : "Synchroniser OpenStreetMap"}
        </button>
      </form>

      {armed && !pending && !result ? (
        <p className="max-w-xs text-right text-body-sm text-on-surface-variant">
          L’import modifie le catalogue national lu par l’application conducteur.
        </p>
      ) : null}

      {state.error ? (
        <p className="text-label-sm font-semibold text-error">{state.error}</p>
      ) : null}

      {result ? (
        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-body-sm">
          {[
            { label: "créées", value: result.created },
            { label: "mises à jour", value: result.updated },
            { label: "ignorées", value: result.skipped },
            { label: "erreurs", value: result.errors },
          ].map((entry) => (
            <div key={entry.label} className="flex items-baseline gap-1">
              <dt className="text-outline">{entry.label}</dt>
              <dd
                className={`text-title-md tnum ${
                  entry.label === "erreurs" && entry.value > 0 ? "text-error" : "text-on-surface"
                }`}
              >
                {entry.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
