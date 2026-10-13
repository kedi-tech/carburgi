import Link from "next/link";

import ActionButton from "@/components/action-button";
import { reconcileSubscriptionPayment } from "@/app/actions/admin";
import Icon from "@/components/icon";
import Pagination from "@/components/pagination";
import PlanEditor from "@/components/plan-editor";
import RefreshButton from "@/components/refresh-button";
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  NoteBanner,
  PageHeader,
  SectionHeader,
  StatCard,
  TableShell,
  Td,
  Th,
  Tr,
  type Tone,
} from "@/components/ui";
import { fetchPayments, fetchPlans, fetchSubscriptions } from "@/lib/api";
import { dateLabel, elapsedLabel, grouped, phoneLabel } from "@/lib/format";
import { paginate, parsePage } from "@/lib/paginate";
import { safe } from "@/lib/safe";
import {
  paymentStatusLabels,
  type Payment,
  type PaymentStatus,
  type Subscription,
  type SubscriberRef,
} from "@/lib/types";

const STATUSES: (PaymentStatus | "ALL")[] = [
  "ALL",
  "SUCCEEDED",
  "PENDING",
  "FAILED",
  "EXPIRED",
  "CANCELED",
];

const PAYMENTS_PER_PAGE = 20;

function isStatus(value: unknown): value is PaymentStatus | "ALL" {
  return typeof value === "string" && (STATUSES as string[]).includes(value);
}

function statusTone(status: PaymentStatus): Tone {
  return status === "SUCCEEDED"
    ? "good"
    : status === "PENDING"
      ? "warn"
      : status === "FAILED"
        ? "bad"
        : "neutral";
}

function matches(payment: Payment, needle: string): boolean {
  if (needle.length === 0) {
    return true;
  }
  return `${payment.account?.fullName ?? ""} ${payment.account?.phoneNumber ?? ""} ${payment.merchantReference} ${payment.transactionId ?? ""}`
    .toLowerCase()
    .includes(needle);
}

/** Periods covering now, closest to expiry first. */
function currentPeriods(subscriptions: Subscription[], now: number = Date.now()): Subscription[] {
  return subscriptions
    .filter(
      (subscription) =>
        new Date(subscription.startsAt).getTime() <= now &&
        new Date(subscription.endsAt).getTime() > now,
    )
    .sort((a, b) => a.endsAt.localeCompare(b.endsAt));
}

function Subscriber({ account, fallbackId }: { account?: SubscriberRef | null; fallbackId?: string }) {
  if (!account) {
    return <span className="font-mono text-body-sm text-outline">{fallbackId ?? "—"}</span>;
  }
  return (
    <>
      <span className="block truncate text-title-md text-on-surface">
        {account.fullName ?? "Sans nom"}
      </span>
      <span className="block text-body-sm tnum text-outline">{phoneLabel(account.phoneNumber)}</span>
    </>
  );
}

function PaymentRow({ payment }: { payment: Payment }) {
  // A driver who says "j'ai payé" while the row is not SUCCEEDED is the case
  // reconciliation exists for. A success needs no second look.
  const reconcilable = payment.status !== "SUCCEEDED";

  return (
    <Tr>
      <Td>
        <Subscriber account={payment.account} fallbackId={payment.accountId} />
      </Td>
      <Td>
        <span className="block text-body-md text-on-surface-variant">
          {payment.plan?.label ?? "—"}
        </span>
        <code className="block font-mono text-label-md text-secondary">
          {payment.merchantReference}
        </code>
      </Td>
      <Td align="right">
        <span className="block text-data tnum text-on-surface">
          {grouped(payment.amountGnf)} GNF
        </span>
        {typeof payment.receivedAmount === "number" ? (
          <span className="block text-body-sm tnum text-outline">
            reçu {grouped(payment.receivedAmount)}
            {typeof payment.fees === "number" ? ` · frais ${grouped(payment.fees)}` : ""}
          </span>
        ) : null}
      </Td>
      <Td>
        <Chip tone={statusTone(payment.status)} dot>
          {paymentStatusLabels[payment.status] ?? payment.status}
        </Chip>
        {payment.failureReason ? (
          <span className="mt-0.5 block max-w-[220px] truncate text-body-sm text-error" title={payment.failureReason}>
            {payment.failureReason}
          </span>
        ) : null}
      </Td>
      <Td className="text-body-sm text-on-surface-variant">
        <span className="block">{payment.paymentMethod ?? "—"}</span>
        {payment.subscription ? (
          <span className="block text-outline">
            jusqu’au {dateLabel(payment.subscription.endsAt)}
          </span>
        ) : null}
      </Td>
      <Td className="text-body-sm text-on-surface-variant">
        <span className="block">{dateLabel(payment.paidAt ?? payment.createdAt)}</span>
        <span className="block text-outline">{elapsedLabel(payment.createdAt)}</span>
      </Td>
      <Td align="right">
        {reconcilable ? (
          <ActionButton
            action={reconcileSubscriptionPayment}
            fields={{ id: payment.id }}
            label="Revérifier"
            pendingLabel="Djomy…"
            icon="sync"
          />
        ) : (
          <span className="text-body-sm text-outline">—</span>
        )}
      </Td>
    </Tr>
  );
}

/**
 * Driver subscriptions, paid through Djomy: the two formulas the app sells,
 * the payments they produced, and who has access right now.
 *
 * Three reads, each whole: the payment tabs are counted in memory from one
 * unfiltered list, and the "en cours" panel filters the period list here rather
 * than spending a fourth request on `?active=true`.
 */
export default async function SubscriptionsPage(props: PageProps<"/subscriptions">) {
  const params = await props.searchParams;
  const status: PaymentStatus | "ALL" = isStatus(params.status) ? params.status : "ALL";
  const search = typeof params.q === "string" ? params.q : "";
  const requestedPage = parsePage(params.page);

  const [plansResult, paymentsResult, subscriptionsResult] = await Promise.all([
    safe(() => fetchPlans()),
    safe(() => fetchPayments()),
    safe(() => fetchSubscriptions()),
  ]);

  const plans = plansResult.data ?? [];
  const payments = paymentsResult.data ?? [];
  const current = currentPeriods(subscriptionsResult.data ?? []);

  const count = (target: PaymentStatus) =>
    payments.filter((payment) => payment.status === target).length;
  const succeeded = payments.filter((payment) => payment.status === "SUCCEEDED");
  const revenue = succeeded.reduce((sum, payment) => sum + payment.amountGnf, 0);
  const received = succeeded.reduce(
    (sum, payment) => sum + (payment.receivedAmount ?? payment.amountGnf),
    0,
  );
  const subscribers = new Set(current.map((subscription) => subscription.accountId)).size;
  const soldPerPlan = (code: string) =>
    succeeded.filter((payment) => payment.plan?.code === code).length;

  const needle = search.trim().toLowerCase();
  const matched = payments
    .filter((payment) => (status === "ALL" ? true : payment.status === status))
    .filter((payment) => matches(payment, needle))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const listing = paginate(matched, requestedPage, PAYMENTS_PER_PAGE);

  const currentQuery: Record<string, string | undefined> = {
    status: status !== "ALL" ? status : undefined,
    q: search || undefined,
  };

  return (
    <>
      <PageHeader
        eyebrow="Revenus"
        title="Abonnements"
        description="Formules vendues aux conducteurs, paiements Djomy et accès en cours."
        actions={<RefreshButton label="Actualiser" />}
      />

      <div className="flex flex-col gap-4 p-6">
        <NoteBanner icon="payments" title="Accès aux stations">
          Un conducteur sans abonnement en cours reçoit un refus (402) sur la liste et la fiche des
          stations. Les comptes station et administrateur ne sont pas concernés. Les paiements se
          confirment seuls (webhook Djomy et revérification chaque minute) : « Revérifier » sert au
          conducteur qui affirme avoir payé sans avoir obtenu l’accès.
        </NoteBanner>

        <section className="grid gap-3 md:grid-cols-4">
          <StatCard
            label="Abonnés actifs"
            value={grouped(subscribers)}
            tone={subscribers > 0 ? "good" : "neutral"}
            hint="Conducteurs couverts par une période en cours."
          />
          <StatCard
            label="Encaissé"
            value={grouped(revenue)}
            unit="GNF"
            hint={
              received !== revenue
                ? `${grouped(received)} GNF reçus après frais`
                : `${grouped(succeeded.length)} paiement(s) réussi(s)`
            }
          />
          <StatCard
            label="En attente"
            value={grouped(count("PENDING"))}
            tone={count("PENDING") > 0 ? "warn" : "neutral"}
            hint="Lien généré, paiement pas encore confirmé."
          />
          <StatCard
            label="Échecs"
            value={grouped(count("FAILED") + count("EXPIRED"))}
            tone={count("FAILED") > 0 ? "bad" : "neutral"}
            hint="Échoués ou liens expirés sans paiement."
          />
        </section>

        <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
          <section className="flex flex-col gap-2">
            <SectionHeader
              title="Formules"
              icon="sell"
              subtitle="Libellé et prix affichés dans l’application. Seuls les prochains paiements sont concernés."
            />
            {plansResult.error ? (
              <ErrorState title="Formules illisibles">{plansResult.error}</ErrorState>
            ) : plans.length === 0 ? (
              <EmptyState icon="sell">Aucune formule n’est configurée sur le serveur.</EmptyState>
            ) : (
              <Card className="overflow-hidden">
                {plans.map((plan) => (
                  <PlanEditor key={plan.code} plan={plan} sold={soldPerPlan(plan.code)} />
                ))}
              </Card>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <SectionHeader
              title="Accès en cours"
              icon="event_available"
              subtitle="Périodes qui couvrent l’instant présent, la plus proche de son échéance d’abord."
            />
            {subscriptionsResult.error ? (
              <ErrorState title="Abonnements illisibles">{subscriptionsResult.error}</ErrorState>
            ) : current.length === 0 ? (
              <EmptyState icon="event_busy">Aucun conducteur n’a d’accès en cours.</EmptyState>
            ) : (
              <TableShell minWidth={520}>
                <thead>
                  <tr>
                    <Th>Conducteur</Th>
                    <Th>Formule</Th>
                    <Th align="right">Échéance</Th>
                  </tr>
                </thead>
                <tbody>
                  {current.slice(0, 12).map((subscription) => (
                    <Tr key={subscription.id}>
                      <Td>
                        <Subscriber
                          account={subscription.account}
                          fallbackId={subscription.accountId}
                        />
                      </Td>
                      <Td className="text-body-md text-on-surface-variant">
                        {subscription.plan?.label ?? subscription.planCode ?? "—"}
                      </Td>
                      <Td align="right" className="text-body-sm tnum text-on-surface-variant">
                        {dateLabel(subscription.endsAt)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableShell>
            )}
            {current.length > 12 ? (
              <p className="text-body-sm text-outline">
                Et {current.length - 12} autre(s) — les 12 échéances les plus proches sont affichées.
              </p>
            ) : null}
          </section>
        </div>

        <section className="flex flex-col gap-2">
          <SectionHeader
            title="Paiements"
            icon="receipt_long"
            subtitle="Les 200 plus récents, tous statuts confondus."
          />

          {paymentsResult.error ? (
            <ErrorState title="Paiements illisibles">{paymentsResult.error}</ErrorState>
          ) : null}

          <nav className="flex flex-wrap gap-1 border-b border-outline-variant/40">
            {STATUSES.map((entry) => (
              <Link
                key={entry}
                href={{
                  pathname: "/subscriptions",
                  query: { ...(entry !== "ALL" ? { status: entry } : {}), ...(search ? { q: search } : {}) },
                }}
                className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-title-md transition-colors ${
                  entry === status
                    ? "border-primary-container text-on-surface"
                    : "border-transparent text-outline hover:text-on-surface"
                }`}
              >
                {entry === "ALL" ? "Tous" : paymentStatusLabels[entry]}
                <span className="rounded bg-surface-container-high px-1.5 py-0.5 text-label-sm font-bold tnum text-on-surface-variant">
                  {entry === "ALL" ? payments.length : count(entry)}
                </span>
              </Link>
            ))}
          </nav>

          <form className="flex flex-wrap items-end gap-2">
            {status !== "ALL" ? <input type="hidden" name="status" value={status} /> : null}
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
                  placeholder="Nom, téléphone ou référence (ex : SUB-M2X7K9QF-3A1C)"
                  className="h-[34px] w-full rounded border border-surface-dim bg-surface-container-lowest pl-9 pr-2.5 text-body-md text-on-surface outline-none transition placeholder:text-outline focus:border-primary-container focus:ring-2 focus:ring-primary-container/20"
                />
              </span>
            </label>
            <button
              type="submit"
              className="inline-flex h-[34px] items-center gap-1.5 rounded bg-primary-container px-3 text-label-md font-semibold text-on-primary transition-colors hover:bg-primary"
            >
              <Icon name="filter_alt" size={16} />
              Filtrer
            </button>
          </form>

          {listing.rows.length === 0 ? (
            <EmptyState icon="receipt_long">Aucun paiement ne correspond à cette sélection.</EmptyState>
          ) : (
            <TableShell minWidth={980}>
              <thead>
                <tr>
                  <Th>Conducteur</Th>
                  <Th>Formule &amp; référence</Th>
                  <Th align="right">Montant</Th>
                  <Th>Statut</Th>
                  <Th>Moyen &amp; période</Th>
                  <Th>Date</Th>
                  <Th align="right">Action</Th>
                </tr>
              </thead>
              <tbody>
                {listing.rows.map((payment) => (
                  <PaymentRow key={payment.id} payment={payment} />
                ))}
              </tbody>
            </TableShell>
          )}

          <Pagination page={listing} pathname="/subscriptions" query={currentQuery} noun="paiement" />
        </section>
      </div>
    </>
  );
}
