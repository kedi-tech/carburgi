"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { createAdmin, type ActionState } from "@/app/actions/admin";
import CopyField from "@/components/copy-field";
import Icon from "@/components/icon";
import { Field, buttonClass, inputClass } from "@/components/ui";
import { phoneLabel } from "@/lib/format";

const initialState: ActionState = {};

/**
 * Creates a back-office login from the console.
 *
 * `POST /admin/accounts/admins` takes a name and a phone number, generates
 * the password server-side and returns it **once** in the response — the same
 * contract as a station's access, and the same consequence: while the
 * credentials are on screen the dialog is a deliberate dead end. No Escape, no
 * click-outside; the only way past is the button saying they were handed
 * over. Before that point, the form closes like any other.
 *
 * A portal for the same reason as `IssueAccess`: the header this button sits
 * in is a stacking context of its own, and an overlay drawn inside it would
 * sit under the chrome.
 */
export default function CreateAdmin() {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState(createAdmin, initialState);
  // The action's state outlives the dialog; a result from a previous opening
  // must not greet the next one. Each opening starts from a fresh key.
  const [session, setSession] = useState(0);
  const [shownFor, setShownFor] = useState(0);

  const admin = shownFor === session ? state.admin : undefined;
  const error = shownFor === session ? state.error : undefined;
  // With credentials showing, nothing but the acknowledgement closes the dialog.
  const dismissable = !pending && !admin;

  useEffect(() => {
    if (!open) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissable) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [dismissable, open]);

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
            if (event.target === event.currentTarget && dismissable) {
              setOpen(false);
            }
          }}
        >
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-surface-container-lowest shadow-level3 ring-1 ring-black/10">
            <div className="flex items-start gap-3 bg-primary-container px-5 py-4 text-on-primary">
              <span className="flex size-9 shrink-0 items-center justify-center rounded bg-secondary-container">
                <Icon
                  name={admin ? "key" : "shield_person"}
                  size={20}
                  className="text-on-secondary-fixed"
                  filled
                />
              </span>
              <div className="min-w-0">
                <p className="text-label-sm uppercase tracking-wider text-on-primary-container">
                  Gouvernance des accès
                </p>
                <h2 id="create-admin-title" className="font-display text-headline-sm text-white">
                  {admin ? "Identifiants créés" : "Nouvel administrateur"}
                </h2>
                {admin ? (
                  <p className="truncate text-body-sm text-on-primary-container">
                    {phoneLabel(admin.phoneNumber)}
                  </p>
                ) : null}
              </div>
            </div>

            {admin ? (
              <>
                <div className="flex flex-col gap-4 overflow-y-auto p-5">
                  <div className="flex items-start gap-2 rounded border border-[#fecaca] bg-error-container px-3 py-2.5">
                    <Icon name="warning" size={18} className="mt-0.5 shrink-0 text-error" />
                    <p className="text-body-sm leading-relaxed text-on-error-container">
                      Ce mot de passe ne sera <strong>plus jamais affiché</strong>. Transmettez-le
                      à la personne concernée avant de fermer cette fenêtre.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 rounded border border-surface-dim bg-surface-container-low p-3">
                    <CopyField label="Numéro de connexion" value={admin.phoneNumber} />
                    <CopyField label="Mot de passe" value={admin.password} />
                  </div>

                  <p className="text-body-sm text-outline">
                    Le numéro et le mot de passe ouvrent ce back-office, avec les mêmes droits que
                    les vôtres.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-outline-variant/40 bg-surface-container-low px-5 py-3">
                  <button
                    type="button"
                    className={buttonClass("primary")}
                    onClick={() => setOpen(false)}
                  >
                    <Icon name="check" size={16} />
                    J’ai transmis les identifiants
                  </button>
                </div>
              </>
            ) : (
              <form
                action={(formData) => {
                  setShownFor(session);
                  submit(formData);
                }}
                className="flex flex-col gap-4 overflow-y-auto p-5"
              >
                <p className="text-body-sm leading-relaxed text-on-surface-variant">
                  Le serveur génère le mot de passe et ne l’affiche qu’une fois, à l’étape
                  suivante. Le compte a les mêmes droits que le vôtre.
                </p>

                <Field label="Nom complet">
                  <input
                    name="fullName"
                    required
                    minLength={3}
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

                <div className="flex items-center justify-between gap-3 border-t border-outline-variant/40 pt-3">
                  <span className="text-body-sm text-outline">
                    {error ? (
                      <span className="font-semibold text-error">{error}</span>
                    ) : (
                      "Le numéro servira d’identifiant de connexion."
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
