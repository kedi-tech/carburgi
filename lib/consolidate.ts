import type { Product, Station } from "./types";

/**
 * Turning a list of stations into the reading the SONAP asks for: availability
 * per product, per zone and per operator, plus how stale the declarations are.
 *
 * Everything here is derived on the fly from `GET /admin/stations`. The API has
 * no aggregation endpoint, and at pilot scale (hundreds of stations) computing
 * it per request is cheaper than a caching layer that could show a stale
 * picture of a shortage.
 */

export const PRODUCTS: Product[] = ["ESSENCE", "GASOIL"];

/** Beyond this, a declaration is old enough that the SONAP should not lean on it. */
export const STALE_AFTER_HOURS = 24;

export type ProductTally = {
  product: Product;
  available: number;
  empty: number;
  /** No team has ever declared this product here — not the same as a rupture. */
  unknown: number;
};

export type GroupTally = {
  key: string;
  label: string;
  stations: number;
  open: number;
  /** Stations declaring at least one product available. */
  serving: number;
  /** Stations declaring every carried product empty. */
  dry: number;
  /** Stations that have never declared anything. */
  silent: number;
  /** Share of stations serving at least one product, 0–1, `null` when all silent. */
  rate: number | null;
};

export type Consolidation = {
  total: number;
  published: number;
  open: number;
  declaring: number;
  silent: number;
  stale: number;
  products: ProductTally[];
  byArea: GroupTally[];
  byBrand: GroupTally[];
  /** Zones where the shortage is worth a look, worst first. */
  tension: GroupTally[];
};

function availabilityOf(station: Station, product: Product): "available" | "empty" | "unknown" {
  const entry = (station.products ?? []).find((candidate) => candidate.product === product);
  if (!entry) {
    return "unknown";
  }
  return entry.availability === "AVAILABLE" ? "available" : "empty";
}

function isSilent(station: Station): boolean {
  return (station.products ?? []).length === 0;
}

function isServing(station: Station): boolean {
  return (station.products ?? []).some((entry) => entry.availability === "AVAILABLE");
}

function isDry(station: Station): boolean {
  const products = station.products ?? [];
  return products.length > 0 && products.every((entry) => entry.availability === "EMPTY");
}

function isStale(station: Station, now: number): boolean {
  if (isSilent(station)) {
    return false;
  }
  const updated = new Date(station.statusUpdatedAt).getTime();
  if (Number.isNaN(updated)) {
    return false;
  }
  return now - updated > STALE_AFTER_HOURS * 60 * 60 * 1000;
}

function group(
  stations: Station[],
  keyOf: (station: Station) => { key: string; label: string },
): GroupTally[] {
  const buckets = new Map<string, GroupTally>();

  for (const station of stations) {
    const { key, label } = keyOf(station);
    const bucket: GroupTally = buckets.get(key) ?? {
      key,
      label,
      stations: 0,
      open: 0,
      serving: 0,
      dry: 0,
      silent: 0,
      rate: null,
    };

    bucket.stations += 1;
    if (station.isOpen) {
      bucket.open += 1;
    }
    if (isSilent(station)) {
      bucket.silent += 1;
    } else if (isServing(station)) {
      bucket.serving += 1;
    } else if (isDry(station)) {
      bucket.dry += 1;
    }
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .map((bucket) => {
      const declaring = bucket.stations - bucket.silent;
      return { ...bucket, rate: declaring > 0 ? bucket.serving / declaring : null };
    })
    .sort((a, b) => b.stations - a.stations);
}

export function consolidate(stations: Station[], now: number = Date.now()): Consolidation {
  const products: ProductTally[] = PRODUCTS.map((product) => {
    const tally: ProductTally = { product, available: 0, empty: 0, unknown: 0 };
    for (const station of stations) {
      tally[availabilityOf(station, product)] += 1;
    }
    return tally;
  });

  const byArea = group(stations, (station) => ({
    key: station.area?.id ?? station.city ?? "sans-zone",
    label: station.area?.label ?? station.city ?? "Zone non renseignée",
  }));

  const byBrand = group(stations, (station) => ({
    key: station.brand?.id ?? "sans-marque",
    label: station.brand?.name ?? "Sans enseigne",
  }));

  return {
    total: stations.length,
    published: stations.filter((station) => station.isPublished).length,
    open: stations.filter((station) => station.isOpen).length,
    declaring: stations.filter((station) => !isSilent(station)).length,
    silent: stations.filter(isSilent).length,
    stale: stations.filter((station) => isStale(station, now)).length,
    products,
    byArea,
    byBrand,
    // A zone only signals tension once enough of its stations have spoken —
    // one dry station out of one declaring is noise, not a shortage — and only
    // if at least one of them is actually dry. A zone where every declaring
    // station serves is the opposite of tension, and listing it under that
    // heading just because it sorts last would be misleading.
    tension: byArea
      .filter(
        (area) => area.rate !== null && area.stations - area.silent >= 3 && area.rate < 1,
      )
      .sort((a, b) => (a.rate ?? 1) - (b.rate ?? 1))
      .slice(0, 6),
  };
}
