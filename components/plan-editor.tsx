"use client";

import { useActionState } from "react";

import { savePlan, setPlanActive, type ActionState } from "@/app/actions/admin";
import Icon from "@/components/icon";
import { buttonClass, inputClass } from "@/components/ui";
import { grouped } from "@/lib/format";
import type { Plan } from "@/lib/types";

const initialState: ActionState = {};

function Outcome({ state }: { state: ActionState }) {
  if (state.error) {
    return <p className="text-body-sm font-semibold text-error">{state.error}</p>;
  }
  if (state.done) {
    return <p className="text-body-sm font-semibold text-on-tertiary-container">{state.done}</p>;
  }
  return null;
}

function durationLabel(hours: number): string {
  if (hours % 24 !== 0) {
    return `${hours} h`;
  }
  const days = hours / 24;
  return days === 1 ? "24 h" : `${days} jours`;
}

/**
 * One formula: what the driver app lists and what Djomy charges. The app reads
 * these figures on every checkout, so a change applies to the next payment —
 * never to a link already generated or a period already paid.
 */
export default function PlanEditor({ plan, sold }: { plan: Plan; sold: number }) {
  const [saveState, save, saving] = useActionState(savePlan, initialState);
  const [activeState, toggle, toggling] = useActionState(setPlanActive, initialState);
  const active = plan.isActive !== false;

  return (
    <div className="flex flex-col gap-3 border-b border-surface-container-low p-4 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5">
            <span className="text-title-md text-on-surface">{plan.label}</span>
            <code className="font-mono text-label-md text-secondary">{plan.code}</code>
            {active ? null : (
              <span className="rounded border border-outline-variant bg-surface-container-low px-1.5 text-label-sm font-semibold text-on-surface-variant">
                Retirée
              </span>
            )}
          </p>
          <p className="text-body-sm tnum text-outline">
            {grouped(plan.priceGnf)} GNF · accès {durationLabel(plan.durationHours)} ·{" "}
            {sold} vente{sold > 1 ? "s" : ""} réussie{sold > 1 ? "s" : ""}
          </p>
        </div>
        <form action={toggle} className="flex flex-col items-end gap-1">
          <input type="hidden" name="code" value={plan.code} />
          <input type="hidden" name="isActive" value={active ? "false" : "true"} />
          <button type="submit" disabled={toggling} className={buttonClass("ghost")}>
            <Icon name={active ? "toggle_off" : "toggle_on"} size={16} />
            {toggling ? "…" : active ? "Retirer de l’application" : "Proposer à nouveau"}
          </button>
          <Outcome state={activeState} />
        </form>
      </div>

      <form action={save} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="code" value={plan.code} />
        <label className="flex min-w-40 flex-1 flex-col gap-1">
          <span className="text-label-md font-semibold text-on-surface-variant">Libellé</span>
          <input name="label" defaultValue={plan.label} required className={inputClass} />
        </label>
        <label className="flex w-36 flex-col gap-1">
          <span className="text-label-md font-semibold text-on-surface-variant">Prix (GNF)</span>
          <input
            name="priceGnf"
            defaultValue={String(plan.priceGnf)}
            required
            inputMode="numeric"
            className={`${inputClass} tnum`}
          />
        </label>
        <button type="submit" disabled={saving} className={buttonClass("primary")}>
          <Icon name="save" size={16} />
          {saving ? "…" : "Enregistrer"}
        </button>
      </form>
      <Outcome state={saveState} />
    </div>
  );
}
