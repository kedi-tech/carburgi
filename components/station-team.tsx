"use client";

import { useActionState, useState } from "react";

import {
  issueStationAccess,
  removeStationAgent,
  resetAgentPassword,
  type ActionState,
} from "@/app/actions/admin";
import ActionButton from "@/components/action-button";
import CopyField from "@/components/copy-field";
import Icon from "@/components/icon";
import { buttonClass, Chip, inputClass } from "@/components/ui";
import { phoneLabel } from "@/lib/format";
import { accountStatusLabels, type AccountStatus, type MembershipRole } from "@/lib/types";

const initialState: ActionState = {};

export type TeamMember = {
  id: string;
  /** The server's name, else the one the console recorded at creation. */
  name: string | null;
  phoneNumber: string | null;
  loginCode: string | null;
  status: AccountStatus;
  membershipRole: MembershipRole | null;
  /** The stored password, decrypted on the server; null when the console never kept it. */
  password: string | null;
};

function MemberRow({ member, stationId }: { member: TeamMember; stationId: string }) {
  return (
    <li className="flex flex-col gap-2 rounded bg-surface-container-low px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate text-body-md text-on-surface">
            {member.name ?? "Compte d’équipe (sans nom)"}
          </span>
          <span className="block text-body-sm tnum text-outline">
            {phoneLabel(member.phoneNumber)}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {member.membershipRole ? (
            <Chip tone="info">{member.membershipRole === "OWNER" ? "Gérant" : "Agent"}</Chip>
          ) : null}
          <Chip
            tone={member.status === "ACTIVE" ? "good" : member.status === "PENDING" ? "warn" : "bad"}
            dot
          >
            {accountStatusLabels[member.status]}
          </Chip>
        </span>
      </div>

      {member.loginCode ? <CopyField label="Code de connexion" value={member.loginCode} /> : null}

      {member.password ? (
        <CopyField label="Mot de passe" value={member.password} />
      ) : (
        <p className="text-body-sm text-outline">
          Mot de passe non conservé (compte créé avant la conservation, ou depuis l’application).
          « Nouveau mot de passe » en génère un, qui restera affiché ici.
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <ActionButton
          action={resetAgentPassword}
          fields={{
            id: member.id,
            stationId,
            fullName: member.name ?? "",
            phoneNumber: member.phoneNumber ?? "",
          }}
          label="Nouveau mot de passe"
          confirm="Confirmer : l’ancien ne marchera plus"
          icon="lock_reset"
        />
        <ActionButton
          action={removeStationAgent}
          fields={{ id: member.id }}
          label="Supprimer l’accès"
          confirm="Confirmer la suppression"
          tone="danger"
          icon="person_remove"
        />
      </div>
    </li>
  );
}

/**
 * Everyone who can open this station's space: their login code, their
 * password when the console kept it, and the controls to add an access, reset
 * a password or delete an access.
 *
 * Kept mounted across the creation (the page keys it by station): the create
 * action revalidates the page, and the credentials just shown must survive
 * that re-render.
 */
export default function StationTeam({
  stationId,
  members,
  vaultEnabled,
}: {
  stationId: string;
  members: TeamMember[];
  vaultEnabled: boolean;
}) {
  const [state, submit, pending] = useActionState(issueStationAccess, initialState);
  const [dismissed, setDismissed] = useState<ActionState | null>(null);
  const fresh = state.access && dismissed !== state ? state : null;

  return (
    <div className="flex flex-col gap-3">
      {members.length === 0 ? (
        <p className="text-body-sm text-outline">Aucun accès pour cette station.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {members.map((member) => (
            <MemberRow key={member.id} member={member} stationId={stationId} />
          ))}
        </ul>
      )}

      {fresh?.access ? (
        <div className="flex flex-col gap-2 rounded border border-[#a7f3d0] bg-[#ecfdf5] p-3">
          <p className="flex items-center gap-1.5 text-label-md font-semibold text-[#065f46]">
            <Icon name="check_circle" size={16} />
            {fresh.done}
          </p>
          <CopyField label="Code de connexion" value={fresh.access.loginCode} />
          <CopyField label="Mot de passe" value={fresh.access.password} />
          <p className="text-body-sm text-on-surface-variant">
            {fresh.vaulted
              ? "Le mot de passe reste affiché sur cette fiche, avec l’accès."
              : "Attention : ce mot de passe n’a pas été conservé. Notez-le maintenant, il ne sera plus affiché."}
          </p>
          <button
            type="button"
            className={`${buttonClass("primary")} self-end`}
            onClick={() => setDismissed(state)}
          >
            <Icon name="check" size={16} />
            Fermer
          </button>
        </div>
      ) : null}

      <form action={submit} className="flex flex-col gap-2 rounded border border-outline-variant/40 p-3">
        <p className="text-label-md font-semibold text-on-surface-variant">Créer un accès</p>
        <input type="hidden" name="id" value={stationId} />
        <input
          name="fullName"
          required
          minLength={3}
          placeholder="Nom du titulaire"
          className={inputClass}
        />
        <input
          name="phoneNumber"
          inputMode="tel"
          placeholder="Téléphone (facultatif)"
          className={`${inputClass} tnum`}
        />
        <button type="submit" disabled={pending} className={`${buttonClass("primary")} self-start`}>
          <Icon name="key" size={16} />
          {pending ? "Création…" : "Créer l’accès"}
        </button>
        {state.error ? (
          <span className="text-label-sm font-semibold text-error">{state.error}</span>
        ) : null}
        <p className="text-body-sm text-outline">
          Chaque accès a son propre code et son mot de passe, générés par le serveur.
          {vaultEnabled
            ? ""
            : " Conservation des mots de passe désactivée : définissez STATION_VAULT_KEY pour les retrouver plus tard."}
        </p>
      </form>
    </div>
  );
}
