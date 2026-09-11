import Link from "next/link";

import ActionButton from "@/components/action-button";
import CreateAdmin from "@/components/create-admin";
import { updateAccountStatus } from "@/app/actions/admin";
import Icon from "@/components/icon";
import Pagination from "@/components/pagination";
import RefreshButton from "@/components/refresh-button";
import {
  buttonClass,
  Chip,
  EmptyState,
  ErrorState,
  NoteBanner,
  PageHeader,
  StatCard,
  TableShell,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { fetchAccounts, fetchStations } from "@/lib/api";
import { dateLabel, elapsedLabel, grouped, phoneLabel } from "@/lib/format";
import { linkStation } from "@/lib/link";
import { paginate, parsePage } from "@/lib/paginate";
import { safe } from "@/lib/safe";
import { readIdentity } from "@/lib/session";
import {
  accountStatusLabels,
  roleLabels,
  type Account,
  type AccountRole,
  type AccountStatus,
  type Station,
} from "@/lib/types";

const ROLE_TABS: { key: AccountRole | "ALL"; label: string; icon: string }[] = [
  { key: "STATION", label: "Équipes stations", icon: "local_gas_station" },
  { key: "DRIVER", label: "Conducteurs", icon: "two_wheeler" },
  { key: "ADMIN", label: "Administrateurs", icon: "shield_person" },
  { key: "ALL", label: "Tous les comptes", icon: "groups" },
];

const STATUSES: (AccountStatus | "ALL")[] = ["ALL", "PENDING", "ACTIVE", "SUSPENDED", "DELETED"];

const ACCOUNTS_PER_PAGE = 25;

function isRole(value: unknown): value is AccountRole | "ALL" {
  return value === "STATION" || value === "DRIVER" || value === "ADMIN" || value === "ALL";
}

function isStatus(value: unknown): value is AccountStatus | "ALL" {
  return (
    value === "PENDING" ||
    value === "ACTIVE" ||
    value === "SUSPENDED" ||
    value === "DELETED" ||
    value === "ALL"
  );
}

function statusTone(status: AccountStatus) {
  return status === "ACTIVE"
    ? "good"
    : status === "PENDING"
      ? "warn"
      : status === "SUSPENDED"
        ? "bad"
        : "neutral";
}

function matches(account: Account, needle: string): boolean {
  if (needle.length === 0) {
    return true;
  }
  return `${account.fullName ?? ""} ${account.phoneNumber ?? ""} ${account.loginCode ?? ""}`
    .toLowerCase()
    .includes(needle);
}

function AccountRow({
  account,
  stations,
  isSelf,
}: {
  account: Account;
  stations: Station[];
  isSelf: boolean;
}) {
  const link = account.role === "STATION" ? linkStation(account, stations) : null;
  // Anyone an individual SMS can reach: the Messagerie composer opens on them.
  const reachable =
    account.role !== "ADMIN" && account.status !== "DELETED" && Boolean(account.phoneNumber);

  return (
    <Tr>
      <Td>
        <div className="flex items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded bg-surface-container-high text-label-sm font-bold text-on-surface-variant">
            {(account.fullName ?? "?")
              .split(" ")
              .slice(0, 2)
              .map((part) => part.charAt(0).toUpperCase())
              .join("")}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-title-md text-on-surface">
                {account.fullName ?? "Sans nom"}
              </span>
              {isSelf ? <Chip tone="info">Vous</Chip> : null}
            </span>
            <span className="block text-body-sm tnum text-outline">
              {phoneLabel(account.phoneNumber)}
            </span>
          </span>
        </div>
      </Td>

      <Td>
        <span className="block text-body-md text-on-surface-variant">
          {roleLabels[account.role]}
        </span>
        {account.loginCode ? (
          <code className="block font-mono text-label-md text-secondary">{account.loginCode}</code>
        ) : null}
      </Td>

      <Td className="text-body-md text-on-surface-variant">
        {link ? (
          link.kind === "matched" ? (
            <>
              <span className="block">{link.station.name}</span>
              <span className="block text-body-sm text-outline">
                {link.station.area?.label ?? link.station.city}
              </span>
            </>
          ) : (
            <Chip tone="neutral">Rattachement inconnu</Chip>
          )
        ) : (
          <span className="text-outline">—</span>
        )}
      </Td>

      <Td>
        <Chip tone={statusTone(account.status)} dot>
          {accountStatusLabels[account.status]}
        </Chip>
      </Td>

      <Td className="text-body-sm text-on-surface-variant">
        <span className="block">{elapsedLabel(account.lastSeenAt ?? null)}</span>
        <span className="block text-outline">inscrit le {dateLabel(account.createdAt)}</span>
      </Td>

      <Td align="right">
        <div className="flex justify-end gap-2">
          {isSelf ? (
            <span className="text-body-sm text-outline">Compte protégé</span>
          ) : account.status === "DELETED" ? (
            <span className="text-body-sm text-outline">Supprimé</span>
          ) : (
            <>
              {reachable ? (
                <Link
                  href={{ pathname: "/messages", query: { to: account.id } }}
                  title="Envoyer un SMS à ce compte"
                  className={buttonClass("ghost")}
                >
                  <Icon name="sms" size={16} />
                  SMS
                </Link>
              ) : null}
              {account.status !== "ACTIVE" ? (
                <ActionButton
                  action={updateAccountStatus}
                  fields={{ id: account.id, status: "ACTIVE" }}
                  label={account.status === "PENDING" ? "Valider" : "Réactiver"}
                  tone="primary"
                  icon="check"
                />
              ) : null}
              {account.status !== "SUSPENDED" ? (
                <ActionButton
                  action={updateAccountStatus}
                  fields={{ id: account.id, status: "SUSPENDED" }}
                  label="Suspendre"
                  confirm="Confirmer la suspension"
                  tone="danger"
                  icon="pause_circle"
                />
              ) : (
                <ActionButton
                  action={updateAccountStatus}
                  fields={{ id: account.id, status: "DELETED" }}
                  label="Supprimer"
                  confirm="Suppression définitive"
                  tone="danger"
                  icon="delete"
                />
              )}
            </>
          )}
        </div>
      </Td>
    </Tr>
  );
}

export default async function AccountsPage(props: PageProps<"/accounts">) {
  const params = await props.searchParams;
  const role: AccountRole | "ALL" = isRole(params.role) ? params.role : "STATION";
  const status: AccountStatus | "ALL" = isStatus(params.status) ? params.status : "ALL";
  const search = typeof params.q === "string" ? params.q : "";
  const requestedPage = parsePage(params.page);

  const identity = await readIdentity();

  const [allResult, stationsResult] = await Promise.all([
    // One read, filtered here: the tab counters need every role anyway, and the
    // route offers no search parameter to push the query server-side.
    safe(() => fetchAccounts()),
    safe(() => fetchStations()),
  ]);

  const all = allResult.data ?? [];
  const stations = stationsResult.data ?? [];

  const needle = search.trim().toLowerCase();
  const matched = all
    .filter((account) => (role === "ALL" ? true : account.role === role))
    .filter((account) => (status === "ALL" ? true : account.status === status))
    .filter((account) => matches(account, needle))
    .sort((a, b) => (b.lastSeenAt ?? b.createdAt).localeCompare(a.lastSeenAt ?? a.createdAt));
  const listing = paginate(matched, requestedPage, ACCOUNTS_PER_PAGE);
  const rows = listing.rows;

  const currentQuery: Record<string, string | undefined> = {
    role,
    status: status !== "ALL" ? status : undefined,
    q: search || undefined,
  };

  const totals = {
    all: all.length,
    active: all.filter((account) => account.status === "ACTIVE").length,
    suspended: all.filter((account) => account.status === "SUSPENDED").length,
    pending: all.filter((account) => account.status === "PENDING").length,
    byRole: (target: AccountRole) => all.filter((account) => account.role === target).length,
  };

  const activeRate = totals.all > 0 ? totals.active / totals.all : null;

  return (
    <>
      <PageHeader
        eyebrow="Gouvernance des accès"
        title="Répertoire des comptes"
        description="Accès des équipes station, modération des conducteurs et traçabilité des comptes administrateurs."
        actions={
          <>
            <CreateAdmin />
            <RefreshButton label="Actualiser" />
          </>
        }
      />

      <div className="flex flex-col gap-4 p-6">
        {allResult.error ? (
          <ErrorState title="Répertoire illisible">{allResult.error}</ErrorState>
        ) : null}

        <NoteBanner icon="shield" title="Provisionnement des administrateurs">
          Un accès au back-office se crée depuis « Nouvel administrateur » : nom, numéro de
          téléphone et mot de passe, transmis en main propre. Sur les autres comptes, le changement
          de statut est la seule modification possible.
        </NoteBanner>

        <section className="grid gap-3 md:grid-cols-4">
          <StatCard
            label="Total comptes"
            value={grouped(totals.all)}
            hint={`${grouped(totals.byRole("STATION"))} stations · ${grouped(totals.byRole("DRIVER"))} conducteurs · ${grouped(totals.byRole("ADMIN"))} admins`}
          />
          <StatCard
            label="Comptes actifs"
            value={grouped(totals.active)}
            badge={
              activeRate !== null
                ? { text: `${Math.round(activeRate * 100)}%`, tone: "good" }
                : undefined
            }
            tone="good"
            hint="Accès valides aux espaces station et conducteur."
          />
          <StatCard
            label="Suspendus"
            value={grouped(totals.suspended)}
            tone={totals.suspended > 0 ? "warn" : "neutral"}
            hint="Connexion refusée, compte conservé."
          />
          <StatCard
            label="En attente"
            value={grouped(totals.pending)}
            tone={totals.pending > 0 ? "bad" : "neutral"}
            badge={totals.pending > 0 ? { text: "À arbitrer", tone: "bad" } : undefined}
            footer={
              totals.pending > 0 ? (
                <Link
                  href="/validations"
                  className="flex items-center gap-1 font-semibold text-secondary hover:underline"
                >
                  Ouvrir la file d’approbation
                  <Icon name="chevron_right" size={14} />
                </Link>
              ) : undefined
            }
          />
        </section>

        <nav className="flex flex-wrap gap-1 border-b border-outline-variant/40">
          {ROLE_TABS.map((tab) => (
            <Link
              key={tab.key}
              href={{
                pathname: "/accounts",
                query: { role: tab.key, ...(status !== "ALL" ? { status } : {}) },
              }}
              className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-title-md transition-colors ${
                tab.key === role
                  ? "border-primary-container text-on-surface"
                  : "border-transparent text-outline hover:text-on-surface"
              }`}
            >
              <Icon name={tab.icon} size={18} />
              {tab.label}
              <span className="rounded bg-surface-container-high px-1.5 py-0.5 text-label-sm font-bold tnum text-on-surface-variant">
                {tab.key === "ALL" ? totals.all : totals.byRole(tab.key)}
              </span>
            </Link>
          ))}
        </nav>

        <form className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="role" value={role} />
          <label className="flex min-w-64 flex-1 flex-col gap-1">
            <span className="text-label-md font-semibold text-on-surface-variant">Rechercher</span>
            <span className="relative">
              <Icon
                name="search"
                size={18}
                className="pointer-events-none absolute left-2.5 top-2 text-outline"
              />
              <input
                name="q"
                defaultValue={search}
                placeholder="Nom, téléphone (+224…) ou code station (ex : KALOUM-4821)"
                className="h-[34px] w-full rounded border border-surface-dim bg-surface-container-lowest pl-9 pr-2.5 text-body-md text-on-surface outline-none transition placeholder:text-outline focus:border-primary-container focus:ring-2 focus:ring-primary-container/20"
              />
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-label-md font-semibold text-on-surface-variant">Statut</span>
            <select
              name="status"
              defaultValue={status}
              className="h-[34px] rounded border border-surface-dim bg-surface-container-lowest px-2.5 pr-8 text-body-md text-on-surface outline-none focus:border-primary-container"
            >
              {STATUSES.map((entry) => (
                <option key={entry} value={entry}>
                  {entry === "ALL" ? "Tous les statuts" : accountStatusLabels[entry]}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="inline-flex h-[34px] items-center gap-1.5 rounded bg-primary-container px-3 text-label-md font-semibold text-on-primary transition-colors hover:bg-primary"
          >
            <Icon name="filter_alt" size={16} />
            Filtrer
          </button>
        </form>

        {rows.length === 0 ? (
          <EmptyState icon="person_search">
            Aucun compte ne correspond à cette sélection.
          </EmptyState>
        ) : (
          <TableShell minWidth={920}>
            <thead>
              <tr>
                <Th>Utilisateur</Th>
                <Th>Rôle &amp; code</Th>
                <Th>Station rattachée</Th>
                <Th>Statut</Th>
                <Th>Activité</Th>
                <Th align="right">Actions de gouvernance</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  stations={stations}
                  isSelf={account.id === identity?.id}
                />
              ))}
            </tbody>
          </TableShell>
        )}

        <Pagination page={listing} pathname="/accounts" query={currentQuery} noun="compte" />

        <p className="text-body-sm text-outline">
          La colonne « station rattachée » est déduite du code de connexion : le rattachement d’une
          équipe à sa station n’est pas enregistré.
        </p>
      </div>
    </>
  );
}
