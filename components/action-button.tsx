"use client";

import { useActionState, useEffect, useState } from "react";

import type { ActionState } from "@/app/actions/admin";
import Icon from "@/components/icon";
import { buttonClass, type ButtonTone } from "@/components/ui";

const initialState: ActionState = {};

/**
 * One decision, one button. Each carries its own form so a table row can hold
 * several without them fighting over a single pending state, and the outcome is
 * reported next to the button that caused it.
 *
 * `confirm` turns it into two taps. Reach for it whenever the decision takes
 * something away from someone — suspending an account, retiring a station,
 * rejecting a registration — and leave it off for the reversible half of the
 * pair, so the common path stays one tap.
 */
export default function ActionButton({
  action,
  fields,
  label,
  pendingLabel,
  tone = "ghost",
  icon,
  confirm,
  className = "",
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  label: string;
  pendingLabel?: string;
  tone?: ButtonTone;
  icon?: string;
  /** Copy for the second tap, e.g. "Confirmer le refus". */
  confirm?: string;
  className?: string;
}) {
  const [state, submit, pending] = useActionState(action, initialState);
  const [armed, setArmed] = useState(false);

  // A confirmation that is left hanging should not stay armed forever.
  useEffect(() => {
    if (!armed) {
      return;
    }
    const timer = window.setTimeout(() => setArmed(false), 6000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  const needsConfirmation = Boolean(confirm) && !armed;

  return (
    <form action={submit} className={`inline-flex flex-col items-end gap-1 ${className}`}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <button
        type={needsConfirmation ? "button" : "submit"}
        onClick={needsConfirmation ? () => setArmed(true) : undefined}
        disabled={pending}
        className={buttonClass(armed ? "solidDanger" : tone)}
      >
        {icon && !pending ? <Icon name={icon} size={16} /> : null}
        {pending ? (pendingLabel ?? "…") : armed ? confirm : label}
      </button>

      {state.error ? (
        <span className="max-w-[240px] text-right text-label-sm font-semibold text-error">
          {state.error}
        </span>
      ) : state.done ? (
        <span className="text-label-sm font-semibold text-on-tertiary-container">{state.done}</span>
      ) : null}
    </form>
  );
}
