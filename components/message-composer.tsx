"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { sendNotification, type ActionState } from "@/app/actions/admin";
import Icon from "@/components/icon";
import { buttonClass, Chip, inputClass } from "@/components/ui";
import { grouped, phoneLabel } from "@/lib/format";
import { audienceLabels, type Audience, type Person, type Target } from "@/lib/messages";
import { accountStatusLabels, roleLabels } from "@/lib/types";

const initialState: ActionState = {};

const MAX_LENGTH = 500;

const ROLE_FILTERS: { key: "ALL" | "DRIVER" | "STATION"; label: string }[] = [
  { key: "ALL", label: "Tous" },
  { key: "DRIVER", label: "Conducteurs" },
  { key: "STATION", label: "Stations" },
];

const TARGETS: { key: Target; label: string; icon: string; hint: string }[] = [
  { key: "DRIVER", label: audienceLabels.DRIVER, icon: "two_wheeler", hint: "Comptes conducteurs actifs" },
  { key: "STATION", label: audienceLabels.STATION, icon: "local_gas_station", hint: "Équipes validées" },
  { key: "BOTH", label: audienceLabels.BOTH, icon: "groups", hint: "Tout le réseau" },
  { key: "ONE", label: "Un compte", icon: "person", hint: "Conducteur ou équipe, au choix" },
];

/** "2026-09-11T18:30" as typed in the browser's zone → ISO 8601 in UTC. */
function toIso(local: string): string | null {
  if (!local) {
    return null;
  }
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** The earliest value the picker accepts: now plus a minute, in local time. */
function minLocal(): string {
  const date = new Date(Date.now() + 60_000);
  date.setSeconds(0, 0);
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function personMatches(person: Person, needle: string): boolean {
  if (needle.length === 0) {
    return true;
  }
  return `${person.fullName ?? ""} ${person.phoneNumber} ${person.loginCode ?? ""}`
    .toLowerCase()
    .includes(needle);
}

/** Named accounts first, alphabetically; the nameless ones by number after. */
function byName(a: Person, b: Person): number {
  if (a.fullName && b.fullName) {
    return a.fullName.localeCompare(b.fullName, "fr", { sensitivity: "base" });
  }
  if (a.fullName || b.fullName) {
    return a.fullName ? -1 : 1;
  }
  return a.phoneNumber.localeCompare(b.phoneNumber);
}

function statusTone(person: Person) {
  return person.status === "ACTIVE" ? "good" : person.status === "PENDING" ? "warn" : "bad";
}

/**
 * One SMS to an audience, or to one person. The recipient count under each
 * broadcast is the number of active accounts with a phone number, read by the
 * page from the same list the action resolves against; the individual picker
 * searches the accounts an SMS can reach at all.
 *
 * Sending is two taps: the first arms the button with the count, the second
 * sends. An SMS to a thousand phones is not something to fire on a slip.
 * After a successful send the text, the schedule and the picked person are
 * cleared, so the same message cannot go out twice by reflex.
 */
export default function MessageComposer({
  counts,
  people,
  initialPersonId = null,
}: {
  counts: Record<Audience, number>;
  people: Person[];
  /** Preselects "Un compte" — the Comptes page links here with an id. */
  initialPersonId?: string | null;
}) {
  const initialPerson = people.find((person) => person.id === initialPersonId) ?? null;

  const [target, setTarget] = useState<Target>(initialPerson ? "ONE" : "DRIVER");
  const [person, setPerson] = useState<Person | null>(initialPerson);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | "DRIVER" | "STATION">("ALL");
  const [body, setBody] = useState("");
  const [scheduled, setScheduled] = useState(false);
  const [scheduledLocal, setScheduledLocal] = useState("");
  const [armed, setArmed] = useState(false);

  /** Effacer: the text and the schedule go, the chosen recipient stays. */
  const clearDraft = () => {
    setBody("");
    setScheduled(false);
    setScheduledLocal("");
    setArmed(false);
  };

  /** After a send: the recipient goes too, so nothing is one click from a repeat. */
  const reset = () => {
    clearDraft();
    setPerson(null);
    setSearch("");
  };

  // Wrapping the server action is what lets the form clear itself: the
  // outcome is known here, in the browser, the moment it comes back.
  const [state, submit, pending] = useActionState(
    async (previous: ActionState, formData: FormData): Promise<ActionState> => {
      const outcome = await sendNotification(previous, formData);
      if (outcome.done) {
        reset();
      }
      return outcome;
    },
    initialState,
  );

  // An armed send that is left hanging should not stay armed forever.
  useEffect(() => {
    if (!armed) {
      return;
    }
    const timer = window.setTimeout(() => setArmed(false), 8000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  const recipients = target === "ONE" ? (person ? 1 : 0) : counts[target];
  const remaining = MAX_LENGTH - body.length;
  const scheduledIso = scheduled ? toIso(scheduledLocal) : null;
  const scheduleInvalid = scheduled && scheduledIso === null;
  const canSend = body.trim().length > 0 && recipients > 0 && !scheduleInvalid && !pending;

  // The whole directory is listed as soon as "Un compte" is chosen; the
  // search and the role filter narrow it rather than gate it.
  const needle = search.trim().toLowerCase();
  const matches = people
    .filter((candidate) => roleFilter === "ALL" || candidate.role === roleFilter)
    .filter((candidate) => personMatches(candidate, needle))
    .sort(byName);

  const send = (formData: FormData) => {
    // The picker yields local wall-clock time with no zone; the server may
    // sit in another one, so the conversion happens here, in the browser.
    if (scheduledIso) {
      formData.set("scheduledAt", scheduledIso);
    } else {
      formData.delete("scheduledAt");
    }
    setArmed(false);
    submit(formData);
  };

  const confirmLabel = scheduled
    ? person && target === "ONE"
      ? `Confirmer la programmation pour ${person.fullName ?? phoneLabel(person.phoneNumber)}`
      : `Confirmer la programmation (${grouped(recipients)})`
    : person && target === "ONE"
      ? `Confirmer l’envoi à ${person.fullName ?? phoneLabel(person.phoneNumber)}`
      : `Confirmer l’envoi à ${grouped(recipients)} numéro${recipients > 1 ? "s" : ""}`;

  return (
    <form action={send} className="flex flex-col gap-4 p-4">
      <input type="hidden" name="accountId" value={target === "ONE" && person ? person.id : ""} />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-label-md font-semibold text-on-surface-variant">Destinataires</legend>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {TARGETS.map((option) => {
            const active = option.key === target;
            const figure = option.key === "ONE" ? null : counts[option.key];
            return (
              <label
                key={option.key}
                className={`flex cursor-pointer items-start gap-3 rounded border px-3 py-2.5 transition-colors ${
                  active
                    ? "border-primary-container bg-surface-container-low ring-2 ring-primary-container/20"
                    : "border-surface-dim bg-surface-container-lowest hover:bg-surface-container-low"
                }`}
              >
                <input
                  type="radio"
                  name="target"
                  value={option.key}
                  checked={active}
                  onChange={() => {
                    setTarget(option.key);
                    setArmed(false);
                  }}
                  className="sr-only"
                />
                <Icon
                  name={option.icon}
                  size={20}
                  className={active ? "mt-0.5 text-secondary" : "mt-0.5 text-outline"}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-title-md text-on-surface">{option.label}</span>
                  <span className="block text-body-sm text-outline">{option.hint}</span>
                </span>
                {figure !== null ? (
                  <span className="shrink-0 font-display text-headline-sm tnum text-on-surface">
                    {grouped(figure)}
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      </fieldset>

      {target === "ONE" ? (
        <div className="flex flex-col gap-2 rounded border border-surface-dim bg-surface-container-low/40 p-3">
          {person ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <Icon name="person" size={18} className="text-secondary" />
                <span className="min-w-0">
                  <span className="block truncate text-title-md text-on-surface">
                    {person.fullName ?? "Sans nom"}
                  </span>
                  <span className="block text-body-sm tnum text-outline">
                    {phoneLabel(person.phoneNumber)} · {roleLabels[person.role]}
                    {person.loginCode ? ` · ${person.loginCode}` : ""}
                  </span>
                </span>
                <Chip tone={statusTone(person)} dot>
                  {accountStatusLabels[person.status]}
                </Chip>
              </span>
              <button
                type="button"
                onClick={() => {
                  setPerson(null);
                  setArmed(false);
                }}
                className={buttonClass("ghost")}
              >
                <Icon name="close" size={16} />
                Changer
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex min-w-64 flex-1 flex-col gap-1">
                  <span className="text-label-md font-semibold text-on-surface-variant">
                    Choisir le compte
                  </span>
                  <span className="relative">
                    <Icon
                      name="search"
                      size={18}
                      className="pointer-events-none absolute left-2.5 top-2 text-outline"
                    />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Filtrer par nom, téléphone (+224…) ou code station"
                      autoComplete="off"
                      className={`${inputClass} pl-9`}
                    />
                  </span>
                </label>
                <div className="flex gap-1">
                  {ROLE_FILTERS.map((filter) => (
                    <button
                      key={filter.key}
                      type="button"
                      onClick={() => setRoleFilter(filter.key)}
                      aria-pressed={roleFilter === filter.key}
                      className={`inline-flex h-[34px] items-center rounded border px-2.5 text-label-md font-semibold transition-colors ${
                        roleFilter === filter.key
                          ? "border-primary-container bg-primary-container text-on-primary"
                          : "border-surface-dim bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low"
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-body-sm text-outline">
                {matches.length === people.length
                  ? `${grouped(people.length)} compte${people.length > 1 ? "s" : ""} joignable${people.length > 1 ? "s" : ""} par SMS.`
                  : `${grouped(matches.length)} sur ${grouped(people.length)} compte${people.length > 1 ? "s" : ""} joignable${people.length > 1 ? "s" : ""}.`}
              </p>

              {matches.length === 0 ? (
                <p className="rounded border border-dashed border-outline-variant bg-surface-container-lowest px-3 py-4 text-center text-body-sm text-outline">
                  Aucun compte avec un numéro ne correspond.
                </p>
              ) : (
                <ul className="max-h-80 divide-y divide-surface-container-low overflow-y-auto rounded border border-surface-dim bg-surface-container-lowest">
                  {matches.map((candidate) => (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setPerson(candidate);
                          setArmed(false);
                        }}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-container-low"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Icon
                            name={candidate.role === "STATION" ? "local_gas_station" : "two_wheeler"}
                            size={18}
                            className="shrink-0 text-outline"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-title-md text-on-surface">
                              {candidate.fullName ?? "Sans nom"}
                            </span>
                            <span className="block text-body-sm tnum text-outline">
                              {phoneLabel(candidate.phoneNumber)} · {roleLabels[candidate.role]}
                              {candidate.loginCode ? ` · ${candidate.loginCode}` : ""}
                            </span>
                          </span>
                        </span>
                        <Chip tone={statusTone(candidate)} dot>
                          {accountStatusLabels[candidate.status]}
                        </Chip>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className="flex items-center justify-between">
          <span className="text-label-md font-semibold text-on-surface-variant">Message</span>
          <span
            className={`text-label-sm tnum ${remaining < 0 ? "font-semibold text-error" : "text-outline"}`}
          >
            {body.length} / {MAX_LENGTH}
          </span>
        </span>
        <textarea
          name="body"
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            setArmed(false);
          }}
          maxLength={MAX_LENGTH}
          rows={4}
          placeholder="Maintenance prévue ce soir de 22h à minuit."
          className={`${inputClass} h-auto resize-y py-2 leading-relaxed`}
        />
        <span className="text-body-sm text-outline">
          Envoyé tel quel par SMS, sans signature ajoutée. Les caractères accentués peuvent
          compter double chez certains opérateurs.
        </span>
      </label>

      <div className="flex flex-col gap-2 rounded border border-surface-dim bg-surface-container-low/40 px-3 py-2.5">
        <label className="flex items-center gap-2 text-body-md text-on-surface">
          <input
            type="checkbox"
            checked={scheduled}
            onChange={(event) => {
              setScheduled(event.target.checked);
              if (event.target.checked && !scheduledLocal) {
                setScheduledLocal(minLocal());
              }
              setArmed(false);
            }}
            className="size-4 accent-primary-container"
          />
          Programmer l’envoi
        </label>
        {scheduled ? (
          <label className="flex flex-wrap items-center gap-2">
            <span className="text-body-sm text-on-surface-variant">Le</span>
            <input
              type="datetime-local"
              name="scheduledLocal"
              value={scheduledLocal}
              min={minLocal()}
              onChange={(event) => {
                setScheduledLocal(event.target.value);
                setArmed(false);
              }}
              className={`${inputClass} w-auto`}
            />
            <span className="text-body-sm text-outline">
              heure de cet ordinateur · le planificateur passe toutes les 60 s · annulable jusqu’au
              départ
            </span>
          </label>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/30 pt-3">
        <div className="min-w-0 flex-1">
          {state.error ? (
            <p className="text-body-sm font-semibold text-error">{state.error}</p>
          ) : state.done ? (
            <p className="flex flex-wrap items-center gap-2 text-body-sm font-semibold text-on-tertiary-container">
              {state.done}
              {state.sent?.[0] ? (
                <Link
                  href={{ pathname: "/messages", query: { message: state.sent[0].id } }}
                  className="inline-flex items-center gap-0.5 text-secondary hover:underline"
                >
                  Voir le détail
                  <Icon name="chevron_right" size={14} />
                </Link>
              ) : null}
            </p>
          ) : target === "ONE" && !person ? (
            <p className="text-body-sm text-outline">Choisissez le compte destinataire.</p>
          ) : recipients === 0 ? (
            <p className="text-body-sm text-outline">
              Aucun compte actif avec un numéro dans cette audience.
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {armed ? <Chip tone="warn">Cliquez à nouveau pour confirmer</Chip> : null}
          {body.length > 0 || scheduled ? (
            <button type="button" onClick={clearDraft} disabled={pending} className={buttonClass("ghost")}>
              <Icon name="backspace" size={16} />
              Effacer
            </button>
          ) : null}
          <button
            type={armed ? "submit" : "button"}
            disabled={!canSend}
            onClick={armed ? undefined : () => setArmed(true)}
            className={buttonClass(armed ? "accent" : "primary")}
          >
            <Icon name={scheduled ? "schedule_send" : "send"} size={16} />
            {pending ? "Envoi…" : armed ? confirmLabel : scheduled ? "Programmer" : "Envoyer"}
          </button>
        </div>
      </div>
    </form>
  );
}
