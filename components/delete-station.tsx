"use client";

import { useActionState, useState } from "react";

import { removeStation, type ActionState } from "@/app/actions/admin";
import Icon from "@/components/icon";
import { buttonClass, inputClass } from "@/components/ui";

const initialState: ActionState = {};

/**
 * Deleting a station cascades to its products, its activity feed, its
 * memberships and every signalement ever filed against it — the audit trail
 * goes with it.
 *
 * So the reversible option is stated first, the form stays folded until asked
 * for, and the name has to be typed out. The server checks the typed name too:
 * a confirmation only enforced in the browser is not a confirmation.
 */
export default function DeleteStation({
  stationId,
  stationName,
}: {
  stationId: string;
  stationName: string;
}) {
  const [state, submit, pending] = useActionState(removeStation, initialState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-label-md font-semibold text-error hover:underline"
      >
        <Icon name="delete_forever" size={16} />
        Supprimer définitivement la station
      </button>
    );
  }

  return (
    <form action={submit} className="flex flex-col gap-2 rounded border border-[#fecaca] bg-error-container p-3">
      <input type="hidden" name="id" value={stationId} />
      <input type="hidden" name="expected" value={stationName} />

      <p className="text-body-sm leading-relaxed text-on-error-container">
        La suppression efface aussi les produits, l’historique d’activité, les rattachements
        d’équipe et tous les signalements de cette station. <strong>Préférez « Retirer du
        public »</strong>, qui la masque aux conducteurs sans rien perdre.
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-label-md font-semibold text-on-error-container">
          Saisissez « {stationName} » pour confirmer
        </span>
        <input name="confirmation" required autoComplete="off" className={inputClass} />
      </label>

      {state.error ? (
        <p className="text-body-sm font-semibold text-on-error-container">{state.error}</p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost")}>
          Annuler
        </button>
        <button type="submit" disabled={pending} className={buttonClass("solidDanger")}>
          <Icon name="delete_forever" size={16} />
          {pending ? "Suppression…" : "Supprimer"}
        </button>
      </div>
    </form>
  );
}
