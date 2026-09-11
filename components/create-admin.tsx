"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { createAdmin, type ActionState } from "@/app/actions/admin";
import Icon from "@/components/icon";
import { Field, buttonClass, inputClass } from "@/components/ui";
import { phoneLabel } from "@/lib/format";
import { accountStatusLabels } from "@/lib/types";

const initialState: ActionState = {};

/**
 * Creates a back-office login from the console.
 *
 * An administrator is an account with role ADMIN, a phone number (what the
 * login form asks for) and a password. The password is typed here by the
 * person creating the access and handed over in person — the API never
 * returns it, so unlike a station's credentials there is nothing to display
 * once and never again. The dialog stays open on the confirmation so the
 * number the newcomer must sign in with can be read back to them.
 *
 * A portal for the same reason as `IssueAccess`: the header this button sits
 * in is a stacking context of its own, and an overlay drawn inside it would
 * sit under the chrome.
 */
export default function CreateAdmin() {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState(createAdmin, initialState);
  // The action's state outlives the dialog; a success from a previous opening
  // must not greet the next one. Each opening starts from a fresh key.
  const [session, setSession] = useState(0);
  const [shownFor, setShownFor] = useState(0);

  const created = state.done && shownFor === session ? state : null;

  useEffect(() => {
    if (!open) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, pending]);

  function openDialog() {
    setSession((current) => current + 1);
    setOpen(true);
  }

  const dialog = open
    ? createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-admin-title"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-on-surface/55 p-4 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) {
              setOpen(false);
            }
          }}
        >
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-surface-container-lowest shadow-level3 ring-1 ring-black/10">
            <div className="flex items-start gap-3 bg-primary-container px-5 py-4 text-on-primary">
              <span className="flex size-9 shrink-0 items-center justify-center rounded bg-secondary-container">
                <Icon name="shield_person" size={20} className="text-on-secondary-fixed" filled />
              </span>
              <div className="min-w-0">
                <p className="text-label-sm uppercase tracking-wider text-on-primary-container">
                  Gouvernance des accès
                </p>
                <h2 id="create-admin-title" className="font-display text-headline-sm text-white">
                  Nouvel administrateur
                </h2>
              </div>
            </div>

            {created ? (
              <div className="flex flex-col gap-4 overflow-y-auto p-5">
                <div className="flex items-start gap-2 rounded border border-[#bbf7d0] bg-tertiary-container/40 px-3 py-2.5">
                  <Icon name="check_circle" size={18} className="mt-0.5 shrink-0 text-on-tertiary-container" />
                  <p className="text-body-sm leading-relaxed text-on-surface">{created.done}</p>
                </div>
                {created.account ? (
                  <dl className="flex flex-col gap-2 rounded border border-surface-dim bg-surface-container-low p-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-label-md text-on-surface-variant">Identifiant de connexion</dt>
                      <dd className="font-mono text-title-md tnum text-on-surface">
                        {phoneLabel(created.account.phoneNumber)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-label-md text-on-surface-variant">Statut</dt>
                      <dd className="text-body-md text-on-surface">{accountStatusLabels[created.account.status]}</dd>
                    </div>
                  </dl>
                ) : null}
                <p className="text-body-sm text-outline">
                  Le mot de passe est celui que vous venez de saisir ; il n’est ni conservé ni
                  affiché par le back-office. Transmettez-le en main propre.
                </p>
                <div className="flex justify-end">
                  <button type="button" className={buttonClass("primary")} onClick={() => setOpen(false)}>
                    <Icon name="check" size={16} />
                    Fermer
                  </button>
                </div>
              </div>
            ) : (
              <form
                action={(formData) => {
                  setShownFor(session);
                  submit(formData);
                }}
                className="flex flex-col gap-4 overflow-y-auto p-5"
              >
                <p className="text-body-sm leading-relaxed text-on-surface-variant">
                  Le compte ouvre ce back-office avec le numéro et le mot de passe saisis ici. Il
                  dispose des mêmes droits que le vôtre.
                </p>

                <Field label="Nom complet">
                  <input
                    name="fullName"
                    required
                    autoFocus
                    autoComplete="off"
                    placeholder="Prénom Nom"
                    className={inputClass}
                  />
                </Field>

                <Field label="Numéro de téléphone" hint="Neuf chiffres, avec ou sans +224.">
                  <input
                    name="phoneNumber"
                    required
                    inputMode="tel"
                    autoComplete="off"
                    placeholder="+224 6XX XX XX XX"
                    className={`${inputClass} tnum`}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Mot de passe" hint="Au moins 8 caractères.">
                    <input
                      name="password"
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Confirmation">
                    <input
                      name="confirmation"
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      className={inputClass}
                    />
                  </Field>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-outline-variant/40 pt-3">
                  <span className="text-body-sm text-outline">
                    {state.error && shownFor === session ? (
                      <span className="font-semibold text-error">{state.error}</span>
                    ) : (
                      "Le mot de passe est à transmettre en main propre."
                    )}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      className={buttonClass("ghost")}
                      onClick={() => setOpen(false)}
                    >
                      Annuler
                    </button>
                    <button type="submit" disabled={pending} className={buttonClass("primary")}>
                      <Icon name="person_add" size={16} />
                      {pending ? "Création…" : "Créer le compte"}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      {dialog}
      <button type="button" onClick={openDialog} className={buttonClass("primary")}>
        <Icon name="person_add" size={16} />
        Nouvel administrateur
      </button>
    </>
  );
}
