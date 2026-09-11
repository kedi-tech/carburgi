import { STALE_AFTER_HOURS } from "./consolidate";
import type { Station } from "./types";

/**
 * The station table's filtering, kept out of the page: reading the clock is not
 * something a component may do while rendering, and "périmée" is a question
 * about now.
 */

export type StationFilter =
  | "all"
  | "silent"
  | "dry"
  | "unpublished"
  | "unverified"
  | "stale";

export const STATION_FILTERS: { key: StationFilter; label: string }[] = [
  { key: "all", label: "Toutes" },
  { key: "unverified", label: "Non vérifiées" },
  { key: "silent", label: "Sans produit déclaré" },
  { key: "dry", label: "À sec" },
  { key: "stale", label: "Déclarations périmées" },
  { key: "unpublished", label: "Non publiées" },
];

export function isStationFilter(value: unknown): value is StationFilter {
  return STATION_FILTERS.some((entry) => entry.key === value);
}

function matchesFilter(station: Station, filter: StationFilter, now: number): boolean {
  const products = station.products ?? [];
  switch (filter) {
    case "silent":
      return products.length === 0;
    case "dry":
      return products.length > 0 && products.every((entry) => entry.availability === "EMPTY");
    case "unpublished":
      return !station.isPublished;
    case "unverified":
      return station.verifiedAt === null;
    case "stale":
      return (
        products.length > 0 &&
        now - new Date(station.statusUpdatedAt).getTime() > STALE_AFTER_HOURS * 60 * 60 * 1000
      );
    default:
      return true;
  }
}

/** Accents are folded, so "Kipe" finds "Kipé" — as the mobile app already does. */
function fold(value: string): string {
  return value.normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "").toLowerCase();
}

function matchesSearch(station: Station, needle: string): boolean {
  if (needle.length === 0) {
    return true;
  }
  return fold(
    `${station.name} ${station.brand?.name ?? ""} ${station.neighborhood ?? ""} ${
      station.area?.label ?? ""
    } ${station.city} ${station.slug}`,
  ).includes(needle);
}

/** How many rows a zone filter counts, without applying the display cap. */
export function countMatching(stations: Station[], filter: StationFilter): number {
  const now = Date.now();
  return stations.filter((station) => matchesFilter(station, filter, now)).length;
}

export type StationQuery = {
  filter: StationFilter;
  search: string;
  areaId: string | null;
};

/** Every match, sorted; the page cuts it into pages (`lib/paginate.ts`). */
export function filterStations(
  stations: Station[],
  { filter, search, areaId }: StationQuery,
  now: number = Date.now(),
): Station[] {
  const needle = fold(search.trim());
  return stations
    .filter((station) => matchesFilter(station, filter, now))
    .filter((station) => (areaId ? station.areaId === areaId : true))
    .filter((station) => matchesSearch(station, needle))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export function isStale(station: Station, now: number = Date.now()): boolean {
  const products = station.products ?? [];
  return (
    products.length > 0 &&
    now - new Date(station.statusUpdatedAt).getTime() > STALE_AFTER_HOURS * 60 * 60 * 1000
  );
}
