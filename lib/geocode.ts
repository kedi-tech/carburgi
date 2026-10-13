import "server-only";

/**
 * Turns what an administrator has in hand — a Google Maps link, a short
 * `maps.app.goo.gl` link, or bare "lat, lng" — into coordinates, then asks
 * OpenStreetMap what is there: quartier, ville, adresse.
 *
 * Nominatim rather than Google Geocoding: the console's Google key is an Embed
 * key, restricted by referrer, and cannot geocode from a server. Nominatim
 * needs no key; its policy asks for an identifying User-Agent and at most one
 * request per second, which a form filled by hand never approaches. Answers
 * are memoised for the life of the process.
 */

export type Coordinates = { latitude: number; longitude: number };

export type PlaceDetails = Coordinates & {
  /** The place's own name when the link or OSM carries one, e.g. "Total Kaloum". */
  name: string | null;
  neighborhood: string | null;
  city: string | null;
  address: string | null;
  /**
   * Every place name OSM gives for the point, most specific first — quartier,
   * sous-quartier, commune, ville, préfecture, région. The form matches these
   * against the zone catalogue by name.
   */
  localities: string[];
};

const USER_AGENT = "CARBUGUI-backoffice/1.0 (station catalogue; contact via carbugui.kedi-tech.com)";

function valid(latitude: number, longitude: number): Coordinates | null {
  return Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
    ? { latitude, longitude }
    : null;
}

/** "9.5092, -13.7122" or "9.5092 -13.7122". */
function fromPair(text: string): Coordinates | null {
  const match = text.trim().match(/^(-?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)$/);
  return match ? valid(Number(match[1].replace(",", ".")), Number(match[2].replace(",", "."))) : null;
}

/**
 * Coordinates out of a full Google Maps URL. The `!3d…!4d…` pair is the pin
 * itself and wins; `@lat,lng` is only where the viewport was centred.
 */
function fromMapsUrl(url: string): Coordinates | null {
  const decoded = decodeURIComponent(url);
  const pin = decoded.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (pin) {
    return valid(Number(pin[1]), Number(pin[2]));
  }
  const param = decoded.match(/[?&](?:q|query|ll|center|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
  if (param) {
    return valid(Number(param[1]), Number(param[2]));
  }
  const at = decoded.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  return at ? valid(Number(at[1]), Number(at[2])) : null;
}

/** "/maps/place/Total+Kaloum/@…" → "Total Kaloum". */
function placeNameFromUrl(url: string): string | null {
  const match = url.match(/\/place\/([^/@]+)/);
  if (!match) {
    return null;
  }
  const name = decodeURIComponent(match[1].replace(/\+/g, " ")).trim();
  return name.length > 1 && !fromPair(name) ? name : null;
}

const SHORT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl", "g.co"]);

/** Follows a short link's redirects by hand, staying on Google hosts. */
async function expand(url: string): Promise<string> {
  let current = url;
  for (let hop = 0; hop < 5; hop += 1) {
    const host = new URL(current).hostname;
    if (!SHORT_HOSTS.has(host)) {
      return current;
    }
    const response = await fetch(current, {
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    const next = response.headers.get("location");
    if (!next) {
      return current;
    }
    current = new URL(next, current).toString();
  }
  return current;
}

function isGoogleHost(host: string): boolean {
  return /(^|\.)google\.[a-z.]+$/.test(host) || SHORT_HOSTS.has(host);
}

export async function resolveInput(
  input: string,
): Promise<{ coordinates: Coordinates; name: string | null } | null> {
  const text = input.trim();
  const pair = fromPair(text);
  if (pair) {
    return { coordinates: pair, name: null };
  }

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  // Only Google's own hosts are fetched: this runs on the server and must not
  // become a way to make it call arbitrary addresses.
  if (url.protocol !== "https:" || !isGoogleHost(url.hostname)) {
    return null;
  }

  const full = await expand(url.toString());
  const coordinates = fromMapsUrl(full);
  return coordinates ? { coordinates, name: placeNameFromUrl(full) } : null;
}

type NominatimAddress = Partial<
  Record<
    | "road"
    | "house_number"
    | "suburb"
    | "neighbourhood"
    | "quarter"
    | "city_district"
    | "village"
    | "hamlet"
    | "town"
    | "city"
    | "municipality"
    | "county"
    | "state",
    string
  >
>;

const reverseCache = new Map<string, Omit<PlaceDetails, "latitude" | "longitude">>();

export async function reverseGeocode({ latitude, longitude }: Coordinates): Promise<PlaceDetails> {
  const cacheKey = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
  const cached = reverseCache.get(cacheKey);
  if (cached) {
    return { latitude, longitude, ...cached };
  }

  const endpoint = new URL("https://nominatim.openstreetmap.org/reverse");
  endpoint.search = new URLSearchParams({
    format: "jsonv2",
    lat: String(latitude),
    lon: String(longitude),
    zoom: "18",
    addressdetails: "1",
    "accept-language": "fr",
  }).toString();

  const response = await fetch(endpoint, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error(`Nominatim ${response.status}`);
  }
  const payload = (await response.json()) as {
    name?: string;
    display_name?: string;
    category?: string;
    type?: string;
    address?: NominatimAddress;
    error?: string;
  };
  const address = payload.address ?? {};

  const city =
    address.city ?? address.town ?? address.municipality ?? address.village ?? address.county ?? null;
  const neighborhood =
    address.suburb ??
    address.neighbourhood ??
    address.quarter ??
    address.city_district ??
    (address.village && address.village !== city ? address.village : null) ??
    address.hamlet ??
    null;
  const street = [address.house_number, address.road].filter(Boolean).join(" ").trim();

  // `display_name` carries places `address` leaves out — "Kissoso Plateau",
  // "Kaporo Rails" — between the quartier and the commune.
  const known = new Set(
    Object.values(address).map((value) => String(value).toLowerCase()),
  );
  const extra = (payload.display_name ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && !/^\d+$/.test(part) && part !== "Guinée" && !known.has(part.toLowerCase()));

  const strip = (value: string | undefined) =>
    value?.replace(/^(Préfecture|Région|Sous-préfecture|Commune) de /i, "").trim();
  const localities = [
    address.suburb,
    address.neighbourhood,
    address.quarter,
    address.hamlet,
    ...extra,
    address.city_district,
    address.village,
    address.town,
    address.city,
    address.municipality,
    strip(address.county),
    strip(address.state),
  ].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);

  // Most Conakry streets are unnamed in OSM: fall back to "sous-quartier,
  // commune" so the field says where the station is rather than nothing.
  const fallbackAddress = [extra[0] ?? neighborhood, address.city_district]
    .filter(Boolean)
    .join(", ");

  const details = {
    // Only a fuel station's own name is worth proposing as the station name.
    name: payload.type === "fuel" && payload.name ? payload.name : null,
    neighborhood,
    city,
    address: street || fallbackAddress || null,
    localities,
  };

  reverseCache.set(cacheKey, details);
  return { latitude, longitude, ...details };
}
