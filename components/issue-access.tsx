"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { issueStationAccess, type ActionState } from "@/app/actions/admin";
import CopyField from "@/components/copy-field";
import Icon from "@/components/icon";
import { buttonClass } from "@/components/ui";

const initialState: ActionState = {};

/**
 * Mints a station's credentials and puts them on screen.
 *
 * `POST /admin/stations/{id}/accounts` returns the plaintext password **once**;
 * it exists nowhere else, in no log and in no later response. So this is a
 * deliberate dead end: no auto-dismiss, no click-outside, and the only way past
 * it is the button saying the credentials have been handed over. If the
 * administrator loses them here, the recovery is a password reset — or another
 * account.
 *
 * This component must stay mounted across the creation. The action revalidates
 * the page, the new account then links to the station, and `alreadyIssued`
 * flips to true — if the page swapped this component out at that moment, the
 * dialog and the password inside it would vanish before anyone read them. So
 * the page always renders it, and it decides for itself whether to show the
 * button or the note.
 */
export default function IssueAccess({
  stationId,
  stationName,
  alreadyIssued,
  label = "Créer un accès station",
}: {
  stationId: string;
  stationName: string;
  /** An account already fits this station: the route would answer 409. */
  alreadyIssued: boolean;
  label?: string;
}) {
  const [state, submit, pending] = useActionState(issueStationAccess, initialState);
  const [acknowledged, setAcknowledged] = useState(false);

  const access = state.access;
  const open = Boolean(access) && !acknowledged;

  // The page behind must not scroll while the credentials are on screen.
  useEffect(() => {
    if (!open) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  /*
    Rendered into <body>, not in place. The inspector this button lives in is
    position: sticky, which creates its own stacking context — a fixed overlay
    drawn inside it sits *under* the fixed header and sidebar, so the chrome
    stayed bright while the page dimmed. A portal escapes that, and z-[100]
    clears the header's z-50.
  */
  // No "mounted" guard is needed: `access` only exists after the action has
  // run in the browser, so this branch never executes during server rendering.
  const dialog =
    open && access
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="issue-access-title"
            className="fixed inset-0 z-[100] flex items-center justify-center bg-on-surface/55 p-4 backdrop-blur-[2px]"
          >
            <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-surface-container-lowest shadow-level3 ring-1 ring-black/10">
              <div className="flex items-start gap-3 bg-primary-container px-5 py-4 text-on-primary">
                <span className="flex size-9 shrink-0 items-center justify-center rounded bg-secondary-container">
                  <Icon name="key" size={20} className="text-on-secondary-fixed" filled />
                </span>
                <div className="min-w-0">
                  <p className="text-label-sm uppercase tracking-wider text-on-primary-container">
                    Accès station
                  </p>
                  <h2 id="issue-access-title" className="font-display text-headline-sm text-white">
                    Identifiants créés
                  </h2>
                  <p className="truncate text-body-sm text-on-primary-container">{stationName}</p>
                </div>
              </div>

              <div className="flex flex-col gap-4 overflow-y-auto p-5">
                <div className="flex items-start gap-2 rounded border border-[#fecaca] bg-error-container px-3 py-2.5">
                  <Icon name="warning" size={18} className="mt-0.5 shrink-0 text-error" />
                  <p className="text-body-sm leading-relaxed text-on-error-container">
                    Ce mot de passe ne sera <strong>plus jamais affiché</strong>. Transmettez-le à
                    l’équipe de la station avant de fermer cette fenêtre.
                  </p>
                </div>

                <div className="flex flex-col gap-3 rounded border border-surface-dim bg-surface-container-low p-3">
                  <CopyField label="Code de connexion" value={access.loginCode} />
                  <CopyField label="Mot de passe" value={access.password} />
                </div>

                <p className="text-body-sm text-outline">
                  Le code sert à ouvrir l’espace station dans l’application ; le mot de passe peut
                  être changé par l’équipe une fois connectée.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-outline-variant/40 bg-surface-container-low px-5 py-3">
                <button
                  type="button"
                  className={buttonClass("primary")}
                  onClick={() => setAcknowledged(true)}
                >
                  <Icon name="check" size={16} />
                  J’ai transmis les identifiants
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  if (alreadyIssued && !open) {
    return (
      <div className="flex items-start gap-1.5 rounded bg-surface-container-low px-3 py-2 text-body-sm text-on-surface-variant">
        <Icon name="group_add" size={16} className="mt-px shrink-0 text-outline" />
        <p className="leading-relaxed">
          Le back-office ne délivre qu’un identifiant par station — c’est le compte d’équipe, que
          ses membres se partagent. Pour que d’autres personnes aient leur propre accès, elles
          s’inscrivent depuis l’application station ; leur demande apparaît alors dans{" "}
          <Link href="/validations" className="font-semibold text-secondary hover:underline">
            Validations
          </Link>
          , rattachée à cette station. Le mot de passe se renouvelle via « mot de passe oublié »
          dans l’application.
        </p>
      </div>
    );
  }

  return (
    <>
      {dialog}
      <form action={submit} className="inline-flex flex-col items-start gap-1">
        <input type="hidden" name="id" value={stationId} />
        <button type="submit" disabled={pending || open} className={buttonClass("ghost")}>
          <Icon name="key" size={16} />
          {pending ? "Création…" : label}
        </button>
        {state.error ? (
          <span className="text-label-sm font-semibold text-error">{state.error}</span>
        ) : null}
      </form>
    </>
  );
}
