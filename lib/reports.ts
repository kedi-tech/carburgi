import type { ReportKind, Station, StationReport } from "./types";

/**
 * Turning a flat list of contestations into something a regulator can act on.
 *
 * One driver contesting a status is noise. Five against the same station inside
 * an hour is the aggregated signal §6.4 of the cahier des charges asks for — and
 * it is invisible in a chronological list, which is why the console groups
 * before it sorts.
 *
 * All of this is derived from `GET /admin/reports`; the route offers no
 * grouping and no station expansion, so the join to the catalogue happens here.
 */

/** Reports this close together on one station are treated as one event. */
export const CLUSTER_WINDOW_HOURS = 6;

export type ReportCluster = {
  stationId: string;
  station: Station | null;
  reports: StationReport[];
  /** How many landed inside the cluster window. */
  recentCount: number;
  /** The kind most of them agree on, and how strong that agreement is. */
  dominantKind: ReportKind;
  concordance: number;
  newestAt: string;
};

function dominant(reports: StationReport[]): { kind: ReportKind; concordance: number } {
  const tally = new Map<ReportKind, number>();
  for (const report of reports) {
    tally.set(report.kind, (tally.get(report.kind) ?? 0) + 1);
  }
  let best: ReportKind = reports[0].kind;
  let bestCount = 0;
  for (const [kind, count] of tally) {
    if (count > bestCount) {
      best = kind;
      bestCount = count;
    }
  }
  return { kind: best, concordance: bestCount / reports.length };
}

export function clusterReports(reports: StationReport[], stations: Station[]): ReportCluster[] {
  const stationsById = new Map(stations.map((station) => [station.id, station]));
  const buckets = new Map<string, StationReport[]>();

  for (const report of reports) {
    const bucket = buckets.get(report.stationId);
    if (bucket) {
      bucket.push(report);
    } else {
      buckets.set(report.stationId, [report]);
    }
  }

  const windowMs = CLUSTER_WINDOW_HOURS * 60 * 60 * 1000;

  return [...buckets.entries()]
    .map(([stationId, bucket]) => {
      const sorted = [...bucket].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const newestAt = sorted[0].createdAt;
      const newest = new Date(newestAt).getTime();
      const recentCount = sorted.filter(
        (report) => newest - new Date(report.createdAt).getTime() <= windowMs,
      ).length;
      const { kind, concordance } = dominant(sorted);

      return {
        stationId,
        station: stationsById.get(stationId) ?? null,
        reports: sorted,
        recentCount,
        dominantKind: kind,
        concordance,
        newestAt,
      } satisfies ReportCluster;
    })
    .sort((a, b) => {
      // Loudest first; ties broken by recency, so a fresh single report is not
      // buried under an old one.
      if (b.reports.length !== a.reports.length) {
        return b.reports.length - a.reports.length;
      }
      return b.newestAt.localeCompare(a.newestAt);
    });
}

/** A cluster is worth flagging once several independent drivers agree. */
export function isUrgent(cluster: ReportCluster): boolean {
  return cluster.reports.length >= 3 && cluster.concordance >= 0.5;
}

export type AreaIncidents = { key: string; label: string; count: number };

/** Where the contestations are coming from, by zone. */
export function incidentsByArea(
  reports: StationReport[],
  stations: Station[],
): AreaIncidents[] {
  const stationsById = new Map(stations.map((station) => [station.id, station]));
  const tally = new Map<string, AreaIncidents>();

  for (const report of reports) {
    const station = stationsById.get(report.stationId);
    const key = station?.area?.id ?? "sans-zone";
    const label = station?.area?.label ?? station?.city ?? "Zone non renseignée";
    const entry = tally.get(key) ?? { key, label, count: 0 };
    entry.count += 1;
    tally.set(key, entry);
  }

  return [...tally.values()].sort((a, b) => b.count - a.count);
}
