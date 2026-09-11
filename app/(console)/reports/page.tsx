import Link from "next/link";

import ActionButton from "@/components/action-button";
import { resolveReportBatch, updateReportStatus } from "@/app/actions/admin";
import Icon from "@/components/icon";
import Pagination from "@/components/pagination";
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
import { fetchReports, fetchStations } from "@/lib/api";
import { dateLabel, elapsedLabel, grouped, percent, phoneLabel, placeLabel } from "@/lib/format";
import {
  CLUSTER_WINDOW_HOURS,
  clusterReports,
  incidentsByArea,
  isUrgent,
  type ReportCluster,
} from "@/lib/reports";
import { paginate, parsePage } from "@/lib/paginate";
import { safe } from "@/lib/safe";
import { productLabels, reportKindLabels, reportKindShort, type ReportStatus } from "@/lib/types";

const TABS: { key: ReportStatus; label: string }[] = [
  { key: "PENDING", label: "En attente" },
  { key: "ACCEPTED", label: "Retenus" },
  { key: "REJECTED", label: "Rejetés" },
];

/** Cluster cards are tall; eight keeps a page to a couple of screens. */
const CLUSTERS_PER_PAGE = 8;

function isReportStatus(value: unknown): value is ReportStatus {
  return value === "PENDING" || value === "ACCEPTED" || value === "REJECTED";
}

function ClusterCard({ cluster, status }: { cluster: ReportCluster; status: ReportStatus }) {
  const urgent = isUrgent(cluster);
  const station = cluster.station;
  const ids = cluster.reports.map((report) => report.id).join(",");

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-container-low px-4 py-2">
        <div className="flex items-center gap-2">
          {urgent ? (
            <Chip tone="bad" dot>
              Groupe urgent
            </Chip>
          ) : cluster.reports.length > 1 ? (
            <Chip tone="warn">Groupe</Chip>
          ) : (
            <Chip tone="neutral">Signalement isolé</Chip>
          )}
          <span className="text-title-md text-on-surface">
            {cluster.reports.length} signalement{cluster.reports.length > 1 ? "s" : ""}
            {cluster.recentCount > 1 && cluster.recentCount < cluster.reports.length
              ? ` · ${cluster.recentCount} en ${CLUSTER_WINDOW_HOURS} h`
              : ""}
          </span>
        </div>
        <span className="flex items-center gap-1.5 text-body-sm text-outline">
          <Icon name="location_on" size={14} />
          {station
            ? placeLabel([station.neighborhood, station.area?.label, station.city])
            : "Zone inconnue"}
        </span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded bg-surface-container-high">
            <Icon name="local_gas_station" size={20} className="text-on-surface-variant" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-headline-sm text-on-surface">
              {station?.name ?? "Station absente du catalogue"}
            </p>
            <p className="text-body-sm text-outline">
              {station ? (
                <>
                  {station.brand?.name ?? "Sans enseigne"} ·{" "}
                  {station.isPublished ? "publiée" : "non publiée"}
                </>
              ) : (
                <>Identifiant {cluster.stationId}</>
              )}
            </p>
          </div>
        </div>

        {station ? (
          <div className="flex flex-col items-end gap-1">
            <span className="text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
              Statut publié
            </span>
            <div className="flex flex-wrap justify-end gap-1">
              {(station.products ?? []).length === 0 ? (
                <Chip tone="neutral">Aucun produit déclaré</Chip>
              ) : (
                (station.products ?? []).map((entry) => (
                  <Chip
                    key={entry.id}
                    tone={entry.availability === "AVAILABLE" ? "good" : "bad"}
                    dot
                  >
                    {productLabels[entry.product]} ·{" "}
                    {entry.availability === "AVAILABLE" ? "dispo" : "rupture"}
                  </Chip>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mx-4 mb-3 flex flex-wrap items-center justify-between gap-2 rounded border border-[#fecaca] bg-error-container px-3 py-2">
        <span className="flex items-center gap-2">
          <Icon name="error" size={18} className="text-error" />
          <span>
            <span className="block text-label-sm font-bold uppercase tracking-wider text-on-error-container">
              Motif dominant
            </span>
            <span className="text-title-md text-on-error-container">
              {reportKindLabels[cluster.dominantKind]}
            </span>
          </span>
        </span>
        {/* Concordance across one report is always 100% — a figure that says nothing. */}
        {cluster.reports.length > 1 ? (
          <span className="text-right">
            <span className="block text-label-sm font-bold uppercase tracking-wider text-on-error-container">
              Concordance
            </span>
            <span className="text-title-md tnum text-on-error-container">
              {percent(cluster.concordance)} (
              {Math.round(cluster.concordance * cluster.reports.length)}/{cluster.reports.length})
            </span>
          </span>
        ) : null}
      </div>

      <div className="px-4 pb-3">
        <p className="mb-1.5 text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
          Messages des usagers
        </p>
        <ul className="flex flex-col gap-1.5">
          {cluster.reports.slice(0, 4).map((report) => (
            <li
              key={report.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded bg-surface-container-low px-3 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <Chip tone="info">{reportKindShort[report.kind]}</Chip>
                  {report.product ? <Chip>{productLabels[report.product]}</Chip> : null}
                </span>
                <span className="mt-1 block text-body-md italic text-on-surface-variant">
                  {report.comment ? `« ${report.comment} »` : "Aucun commentaire joint."}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-body-sm text-outline">
                <Icon name="schedule" size={14} />
                {elapsedLabel(report.createdAt)}
              </span>
            </li>
          ))}
          {cluster.reports.length > 4 ? (
            <li className="px-3 text-body-sm text-outline">
              + {cluster.reports.length - 4} autre(s) signalement(s) sur cette station.
            </li>
          ) : null}
        </ul>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-container-low p-4">
        {station?.phoneNumber ? (
          <a
            href={`tel:${station.phoneNumber}`}
            className="flex items-center gap-1.5 text-label-md font-semibold text-secondary hover:underline"
          >
            <Icon name="call" size={16} />
            Appeler la station ({phoneLabel(station.phoneNumber)})
          </a>
        ) : station ? (
          <Link
            href={{ pathname: "/stations", query: { q: station.name } }}
            className="flex items-center gap-1.5 text-label-md font-semibold text-secondary hover:underline"
          >
            <Icon name="visibility" size={16} />
            Ouvrir la fiche station
          </Link>
        ) : (
          <span className="text-body-sm text-outline">
            Cette station n’existe plus au catalogue.
          </span>
        )}

        {status === "PENDING" ? (
          <div className="flex flex-wrap items-start gap-2">
            <ActionButton
              action={cluster.reports.length > 1 ? resolveReportBatch : updateReportStatus}
              fields={
                cluster.reports.length > 1
                  ? { ids, status: "REJECTED" }
                  : { id: cluster.reports[0].id, status: "REJECTED" }
              }
              label={cluster.reports.length > 1 ? "Rejeter le groupe" : "Rejeter"}
              confirm="Confirmer le rejet"
              tone="danger"
              icon="block"
            />
            <ActionButton
              action={cluster.reports.length > 1 ? resolveReportBatch : updateReportStatus}
              fields={
                cluster.reports.length > 1
                  ? { ids, status: "ACCEPTED" }
                  : { id: cluster.reports[0].id, status: "ACCEPTED" }
              }
              label={cluster.reports.length > 1 ? "Retenir le groupe" : "Retenir"}
              tone="primary"
              icon="gavel"
            />
          </div>
        ) : (
          <span className="text-body-sm text-outline">
            Arbitré{" "}
            {cluster.reports[0].resolvedAt ? `le ${dateLabel(cluster.reports[0].resolvedAt)}` : ""}
          </span>
        )}
      </div>
    </Card>
  );
}

export default async function ReportsPage(props: PageProps<"/reports">) {
  const params = await props.searchParams;
  const status: ReportStatus = isReportStatus(params.status) ? params.status : "PENDING";
  const requestedPage = parsePage(params.page);

  // One read of every signalement. The tab counters need all three buckets
  // anyway, so asking per status would spend four requests to learn what one
  // list already says.
  const [reportsResult, stationsResult] = await Promise.all([
    safe(() => fetchReports()),
    safe(() => fetchStations()),
  ]);

  const allReports = reportsResult.data ?? [];
  const reports = allReports.filter((report) => report.status === status);
  const stations = stationsResult.data ?? [];
  const counts = reportsResult.error
    ? undefined
    : {
        PENDING: allReports.filter((report) => report.status === "PENDING").length,
        ACCEPTED: allReports.filter((report) => report.status === "ACCEPTED").length,
        REJECTED: allReports.filter((report) => report.status === "REJECTED").length,
      };

  const clusters = clusterReports(reports, stations);
  const listing = paginate(clusters, requestedPage, CLUSTERS_PER_PAGE);
  const zones = incidentsByArea(reports, stations);
  const currentQuery: Record<string, string | undefined> = {
    status: status !== "PENDING" ? status : undefined,
  };
  const worstZone = zones[0];

  return (
    <>
      <PageHeader
        eyebrow="Fiabilité du réseau"
        title="Triage des signalements usagers"
        description="Contestations émises par les conducteurs depuis l’application lorsqu’un statut publié ne correspond pas au terrain."
        badge={
          counts && counts.PENDING > 0 ? (
            <Chip tone="bad" dot>
              {counts.PENDING} en attente d’arbitrage
            </Chip>
          ) : undefined
        }
        actions={
<RefreshButton label="Actualiser" />
        }
      />

      <div className="flex flex-col gap-4 p-6">
        {reportsResult.error ? (
          <ErrorState title="Signalements illisibles">{reportsResult.error}</ErrorState>
        ) : null}

        <nav className="flex flex-wrap gap-1 border-b border-outline-variant/40">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={{ pathname: "/reports", query: { status: tab.key } }}
              className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-title-md transition-colors ${
                tab.key === status
                  ? "border-primary-container text-on-surface"
                  : "border-transparent text-outline hover:text-on-surface"
              }`}
            >
              {tab.label}
              {counts ? (
                <span
                  className={`rounded px-1.5 py-0.5 text-label-sm font-bold tnum ${
                    tab.key === "PENDING" && counts.PENDING > 0
                      ? "bg-error text-on-error"
                      : "bg-surface-container-high text-on-surface-variant"
                  }`}
                >
                  {counts[tab.key]}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>

        <NoteBanner icon="insights" title="Regroupement par station">
          Un signalement isolé n’est pas une preuve ; plusieurs signalements concordants sur la même
          station en sont une. Les contestations sont donc regroupées par station et classées par
          nombre, et non par ordre d’arrivée. Retenir un groupe applique la décision à chacun de ses
          signalements.
        </NoteBanner>

        {/*
          Kept deliberately out of the page: "accepter" ne corrige pas le statut
          de la station et ne la notifie pas — la route ne fait que dater
          l'arbitrage. Le dire ici évite de promettre un effet qui n'existe pas.
        */}
        <NoteBanner icon="info" title="Ce que « retenir » fait — et ne fait pas">
          L’arbitrage enregistre la décision et l’horodate. Il ne corrige pas la disponibilité
          publiée par la station, ne la notifie pas et n’alimente aucun score de fiabilité : ces
          effets n’existent pas encore côté serveur. Un arbitrage documente un écart, il ne le
          répare pas.
        </NoteBanner>

        <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
          <section className="flex flex-col gap-3">
            <SectionHeader
              title={
                clusters.length > 0
                  ? `${grouped(reports.length)} signalement(s) · ${clusters.length} station(s)`
                  : "Rien à afficher"
              }
              subtitle="Stations les plus contestées en premier."
            />

            {clusters.length === 0 ? (
              <EmptyState icon="verified">
                {status === "PENDING"
                  ? "Aucune contestation en attente. Les signalements des conducteurs arrivent ici en temps réel."
                  : "Aucun signalement dans cette catégorie."}
              </EmptyState>
            ) : (
              <>
                {listing.rows.map((cluster) => (
                  <ClusterCard key={cluster.stationId} cluster={cluster} status={status} />
                ))}
                <Pagination page={listing} pathname="/reports" query={currentQuery} noun="station" />
              </>
            )}
          </section>

          <aside className="flex flex-col gap-3">
            <Card>
              <div className="flex items-center gap-2 border-b border-surface-container-low px-4 py-3">
                <Icon name="pie_chart" size={20} className="text-secondary" />
                <span className="font-display text-headline-sm text-on-surface">
                  Signalements par zone
                </span>
              </div>
              {zones.length === 0 ? (
                <p className="p-4 text-body-sm text-outline">Aucun signalement à répartir.</p>
              ) : (
                <ul className="flex flex-col gap-2 p-4">
                  {zones.slice(0, 8).map((zone) => (
                    <li key={zone.key} className="flex flex-col gap-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-body-md text-on-surface">{zone.label}</span>
                        <span className="text-data tnum text-on-surface-variant">
                          {zone.count} signalement{zone.count > 1 ? "s" : ""}
                        </span>
                      </span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-surface-container-high">
                        <span
                          className="block h-full rounded-full bg-error"
                          style={{
                            width: `${worstZone ? Math.round((zone.count / worstZone.count) * 100) : 0}%`,
                          }}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card padded>
              <p className="text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
                Motifs disponibles
              </p>
              <p className="mt-2 text-body-md leading-relaxed text-on-surface-variant">
                L’application ne propose aujourd’hui que des motifs négatifs. Un conducteur peut
                contester une information, pas la confirmer — le signal de confirmation agrégé
                réclamé par le cahier des charges n’a donc aucune source.
              </p>
              <ul className="mt-2 flex flex-wrap gap-1">
                {Object.entries(reportKindShort).map(([kind, label]) => (
                  <li key={kind}>
                    <Chip tone="neutral">{label}</Chip>
                  </li>
                ))}
              </ul>
            </Card>
          </aside>
        </div>
      </div>
    </>
  );
}
