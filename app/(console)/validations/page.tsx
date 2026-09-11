import Link from "next/link";

import ActionButton from "@/components/action-button";
import { updateAccountStatus } from "@/app/actions/admin";
import Icon from "@/components/icon";
import RefreshButton from "@/components/refresh-button";
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  NoteBanner,
  PageHeader,
  SectionHeader,
} from "@/components/ui";
import { fetchAccounts, fetchStations } from "@/lib/api";
import { elapsedLabel, dateLabel, phoneLabel, placeLabel } from "@/lib/format";
import { findRivalAccounts, linkStation, type StationLink } from "@/lib/link";
import { safe } from "@/lib/safe";
import type { Account, Station } from "@/lib/types";

/**
 * The approval queue.
 *
 * A station team registers itself, receives a login code, signs in — and reads
 * a dashboard where every control is dead until an administrator flips the
 * account to ACTIVE. Until someone does, that station publishes nothing. This
 * is the only human bottleneck in the product.
 */

/** The one field the API does not give us, rendered for what it is. */
function Affiliation({ link }: { link: StationLink }) {
  if (link.kind === "matched") {
    return (
      <>
        <p className="text-title-md text-on-surface">{link.station.name}</p>
        <p className="text-body-sm text-outline">
          {placeLabel([link.station.neighborhood, link.station.area?.label, link.station.city])}
        </p>
      </>
    );
  }

  return (
    <>
      <Chip tone="warn">Non identifiable</Chip>
      <p className="mt-1 text-body-sm text-outline">{link.reason}</p>
    </>
  );
}

function CoherenceAudit({ link, rivals }: { link: StationLink; rivals: Account[] }) {
  if (link.kind !== "matched") {
    return (
      <span className="flex items-center gap-1.5 text-body-md text-secondary">
        <Icon name="help" size={16} />
        Rapprochement impossible
      </span>
    );
  }

  if (rivals.length > 0) {
    return (
      <span className="flex items-center gap-1.5 text-body-md font-semibold text-error">
        <Icon name="warning" size={16} />
        Conflit gestionnaire détecté
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-body-md text-on-tertiary-container">
      <Icon name="check_circle" size={16} />
      Aucun autre gestionnaire actif
    </span>
  );
}

function PendingCard({
  account,
  stations,
  allStationAccounts,
}: {
  account: Account;
  stations: Station[];
  allStationAccounts: Account[];
}) {
  const link = linkStation(account, stations);
  const rivals = findRivalAccounts(account, link, allStationAccounts);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-container-low p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded bg-surface-container-high">
            <Icon
              name={rivals.length > 0 ? "person_alert" : "person"}
              size={20}
              className={rivals.length > 0 ? "text-error" : "text-on-surface-variant"}
            />
          </span>
          <div className="min-w-0">
            <p className="font-display text-headline-sm text-on-surface">
              {account.fullName ?? "Nom non renseigné"}
            </p>
            <p className="flex flex-wrap items-center gap-x-3 text-body-sm text-outline">
              <span className="flex items-center gap-1 tnum">
                <Icon name="call" size={14} />
                {phoneLabel(account.phoneNumber)}
              </span>
              <span>Inscrit {elapsedLabel(account.createdAt)}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="info" dot>
            En attente · tableau de bord verrouillé
          </Chip>
          {account.loginCode ? (
            <span className="flex items-center gap-1.5 rounded border border-surface-dim bg-surface-container-low px-2 py-1 font-mono text-label-md text-on-surface">
              <Icon name="badge" size={14} className="text-outline" />
              {account.loginCode}
            </span>
          ) : null}
        </div>
      </div>

      <dl className="grid gap-3 bg-surface-container-low/60 p-4 sm:grid-cols-3">
        <div>
          <dt className="text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
            Station présumée
          </dt>
          <dd className="mt-1">
            <Affiliation link={link} />
          </dd>
        </div>
        <div>
          <dt className="text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
            Dernière activité
          </dt>
          <dd className="mt-1 text-body-md text-on-surface">
            {account.lastSeenAt ? elapsedLabel(account.lastSeenAt) : "Jamais connecté"}
          </dd>
        </div>
        <div>
          <dt className="text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
            Audit de cohérence
          </dt>
          <dd className="mt-1">
            <CoherenceAudit link={link} rivals={rivals} />
          </dd>
        </div>
      </dl>

      {rivals.length > 0 ? (
        <div className="flex items-start gap-2 border-t border-[#fecaca] bg-error-container px-4 py-3">
          <Icon name="error" size={18} className="mt-0.5 text-error" />
          <p className="text-body-sm leading-relaxed text-on-error-container">
            <strong>Attention :</strong>{" "}
            {rivals.length === 1 ? "un autre compte est déjà" : `${rivals.length} autres comptes sont déjà`}{" "}
            enregistré{rivals.length > 1 ? "s" : ""} sur cette station —{" "}
            {rivals
              .map(
                (rival) =>
                  `${rival.fullName ?? "compte sans nom"} (${rival.status === "ACTIVE" ? "actif" : rival.status.toLowerCase()})`,
              )
              .join(", ")}
            . Valider cet accès donnerait à deux personnes le contrôle du même statut public.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        {link.kind === "matched" ? (
          <Link
            href={{ pathname: "/stations", query: { q: link.station.name } }}
            className="flex items-center gap-1.5 text-label-md font-semibold text-secondary hover:underline"
          >
            <Icon name="visibility" size={16} />
            Détails de la station
          </Link>
        ) : (
          <span className="text-body-sm text-outline">
            Vérifiez l’identité par téléphone avant de trancher.
          </span>
        )}

        <div className="flex flex-wrap items-start gap-2">
          {/*
            The status enum has no REJECTED and no way back to PENDING, so a
            refusal is a suspension: the account survives, cannot write, and can
            be reinstated from Comptes. DELETED is deliberately not offered here.
          */}
          <ActionButton
            action={updateAccountStatus}
            fields={{ id: account.id, status: "SUSPENDED" }}
            label="Refuser pour l’instant"
            confirm="Confirmer le refus"
            pendingLabel="Refus…"
            tone="danger"
            icon="block"
          />
          <ActionButton
            action={updateAccountStatus}
            fields={{ id: account.id, status: "ACTIVE" }}
            label="Valider l’accès"
            pendingLabel="Validation…"
            tone="primary"
            icon="check"
          />
        </div>
      </div>
    </Card>
  );
}

export default async function ValidationsPage() {
  const [accountsResult, stationsResult] = await Promise.all([
    safe(() => fetchAccounts()),
    safe(() => fetchStations()),
  ]);

  // The queue and the conflict check both come out of one read of the accounts
  // list; asking twice with different filters would just spend a request.
  const pendingResult = accountsResult;
  const stationAccounts = (accountsResult.data ?? []).filter(
    (account) => account.role === "STATION",
  );
  const pending = stationAccounts
    .filter((account) => account.status === "PENDING")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const stations = stationsResult.data ?? [];

  const oldest = pending[0];

  return (
    <>
      <PageHeader
        eyebrow="File d’approbation"
        title="Validations des stations"
        description="Les équipes inscrites restent en lecture seule jusqu’à validation administrative."
        badge={
          pending.length > 0 ? (
            <Chip tone="warn">{pending.length} en attente</Chip>
          ) : (
            <Chip tone="good">File vide</Chip>
          )
        }
        actions={
<RefreshButton label="Actualiser la file" />
        }
      />

      <div className="flex flex-col gap-4 p-6">
        {pendingResult.error ? (
          <ErrorState title="File d’approbation illisible">{pendingResult.error}</ErrorState>
        ) : null}

        {/*
          The honest caveat. Everything this screen says about *which* station an
          account belongs to is inferred, and an administrator has to know that
          before they act on it.
        */}
        <NoteBanner icon="policy" title="Rapprochement station — information non certifiée">
          Le dossier d’une équipe ne contient pas la station qu’elle gère : seulement un nom, un
          téléphone et un code d’accès. La station affichée ci-dessous est donc{" "}
          <strong>déduite du code de connexion</strong>, qui reprend l’identifiant de la station
          ( <code>sonap-116269</code> ) — un indice, pas une preuve. Confirmez par téléphone avant
          de valider un accès.
        </NoteBanner>

        <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
          <section className="flex flex-col gap-3">
            <SectionHeader
              title={
                pending.length > 0
                  ? `${pending.length} demande(s) à instruire`
                  : "Aucune demande à instruire"
              }
              subtitle="La plus ancienne en premier."
            />

            {pending.length === 0 ? (
              <EmptyState icon="task_alt">
                Aucune équipe n’attend de validation. Une nouvelle demande apparaît ici dès qu’une
                station s’inscrit depuis l’application.
              </EmptyState>
            ) : (
              pending.map((account) => (
                <PendingCard
                  key={account.id}
                  account={account}
                  stations={stations}
                  allStationAccounts={stationAccounts}
                />
              ))
            )}
          </section>

          <aside className="flex flex-col gap-3">
            <Card>
              <div className="flex items-center gap-2 border-b border-surface-container-low px-4 py-3">
                <Icon name="bolt" size={20} className="text-secondary" />
                <span className="font-display text-headline-sm text-on-surface">
                  Effet d’une validation
                </span>
              </div>
              <div className="flex flex-col gap-3 p-4 text-body-md leading-relaxed text-on-surface-variant">
                <p>
                  Valider active le compte. À sa prochaine ouverture de l’application, le tableau
                  de bord de la station se déverrouille : ouverture, fermeture et statut de chaque
                  produit deviennent modifiables.
                </p>
                <p>
                  Tant que le compte est en attente, le serveur refuse toute publication de sa
                  part. Le verrou affiché dans l’application n’est qu’une politesse — la sécurité
                  est côté serveur.
                </p>
                <p className="border-t border-outline-variant/30 pt-3">
                  Un refus suspend le compte : il subsiste, ne peut
                  rien publier, et reste réactivable depuis{" "}
                  <Link href="/accounts" className="font-semibold text-secondary hover:underline">
                    Comptes
                  </Link>
                  . La suppression définitive n’est pas proposée ici.
                </p>
              </div>
            </Card>

            {oldest ? (
              <Card padded>
                <p className="text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
                  Demande la plus ancienne
                </p>
                <p className="mt-2 font-display text-headline-lg text-secondary">
                  {elapsedLabel(oldest.createdAt)}
                </p>
                <p className="mt-1 text-body-sm text-outline">
                  {oldest.fullName ?? "Sans nom"} · reçue le {dateLabel(oldest.createdAt)}
                </p>
              </Card>
            ) : null}

            <Card padded>
              <p className="text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
                Traçabilité
              </p>
              <p className="mt-2 text-body-md leading-relaxed text-on-surface-variant">
                Chaque changement de statut est enregistré côté serveur avec l’identité du compte
                administrateur qui l’a décidé.
              </p>
            </Card>
          </aside>
        </div>
      </div>
    </>
  );
}
