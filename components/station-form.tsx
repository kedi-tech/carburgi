"use client";

import { useActionState, useRef, useState, useTransition } from "react";

import { lookupPlace, saveStation, type ActionState } from "@/app/actions/admin";
import Icon from "@/components/icon";
import { Field, buttonClass, inputClass, selectClass } from "@/components/ui";
import type { Area, Brand, Station } from "@/lib/types";

const initialState: ActionState = {};

/** Where a new station's map opens before any coordinates are typed. */
const CONAKRY = { latitude: 9.5092, longitude: -13.7122 };

function parseCoordinate(raw: string): number | null {
  const value = Number(raw.trim().replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

/** Beyond this, the nearest zone is too far to be the station's own. */
const AREA_MATCH_KM = 50;

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The zone a place belongs to: first by name — the most specific OSM place
 * whose name is a zone's label (or contains it, "Hafia Minière 2" → "Hafia") —
 * then, failing any name, the nearest zone. Active zones win a tie.
 */
function matchArea(
  areas: Area[],
  place: { latitude: number; longitude: number; localities: string[] },
): Area | null {
  const ordered = [...areas].sort((a, b) => Number(b.isActive) - Number(a.isActive));
  for (const locality of place.localities) {
    const wanted = normalize(locality);
    if (!wanted) {
      continue;
    }
    const exact = ordered.find((area) => normalize(area.label) === wanted);
    if (exact) {
      return exact;
    }
    const partial = ordered.find((area) => {
      const label = normalize(area.label);
      return label.length >= 4 && (` ${wanted} `.includes(` ${label} `) || ` ${label} `.includes(` ${wanted} `));
    });
    if (partial) {
      return partial;
    }
  }
  return nearestArea(areas, place);
}

function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

function nearestArea(areas: Area[], point: { latitude: number; longitude: number }): Area | null {
  let best: Area | null = null;
  let bestDistance = AREA_MATCH_KM;
  for (const area of areas) {
    if (!Number.isFinite(area.latitude) || !Number.isFinite(area.longitude)) {
      continue;
    }
    const distance = distanceKm(point, area);
    if (distance < bestDistance) {
      best = area;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The station on a Google map, driven by the coordinates in the form.
 *
 * The Maps Embed API is used rather than the JavaScript SDK: an iframe needs
 * no bundle, no loader and no script, and the console only ever shows one
 * marker. Its key is public by design — it travels in the iframe URL — so it
 * must be restricted to this console's origin in the Google Cloud console.
 */
function StationMap({
  apiKey,
  latitude,
  longitude,
  name,
}: {
  apiKey: string | null;
  latitude: number;
  longitude: number;
  name: string;
}) {
  const query = `${latitude},${longitude}`;
  const openHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

  return (
    <div className="flex flex-col gap-2">
      {apiKey ? (
        <iframe
          title={`Position de ${name}`}
          src={`https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&zoom=16&maptype=roadmap&language=fr&region=GN`}
          className="aspect-[16/10] w-full rounded border border-surface-dim bg-surface-container-low"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      ) : (
        <div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-1 rounded border border-dashed border-outline-variant bg-surface-container-low text-center">
          <Icon name="map" size={24} className="text-outline-variant" />
          <p className="px-4 text-body-sm text-outline">
            Carte indisponible : aucune clé Google Maps n’est configurée pour le back-office.
          </p>
        </div>
      )}
      <a
        href={openHref}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 text-label-md font-semibold text-secondary hover:underline"
      >
        <Icon name="open_in_new" size={16} />
        Ouvrir dans Google Maps
      </a>
    </div>
  );
}

/**
 * Identity and position of a station, on one form.
 *
 * `PUT /admin/stations/{id}` accepts a partial body, so this posts every field
 * it shows and leaves the rest — `isPublished`, `verifiedAt` — to the controls
 * that own them. Creating and editing are the same shape, so they are the same
 * form: an empty `station` means `POST`.
 */
export default function StationForm({
  station,
  brands,
  areas,
  onCancelHref,
  mapsApiKey,
}: {
  station?: Station;
  brands: Brand[];
  areas: Area[];
  onCancelHref?: string;
  /** Google Maps Embed key, or null when the console has none. */
  mapsApiKey: string | null;
}) {
  const [state, submit, pending] = useActionState(saveStation, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [link, setLink] = useState("");
  const [looking, startLookup] = useTransition();
  const [lookup, setLookup] = useState<{ filled?: string; error?: string } | null>(null);

  /**
   * Writes a looked-up place into the form. `overwrite` is the explicit
   * « Remplir » button; the automatic fill after typing coordinates only
   * completes empty fields, so it never undoes something typed by hand.
   */
  const fill = (input: Parameters<typeof lookupPlace>[0], overwrite: boolean) => {
    startLookup(async () => {
      const result = await lookupPlace(input);
      const form = formRef.current;
      const place = result.place;
      if (!form || !place) {
        setLookup({ error: result.error });
        return;
      }

      const filled: string[] = [];
      const write = (name: string, value: string | null, label: string, force = overwrite) => {
        const field = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
        if (!field || !value || (!force && field.value.trim() !== "")) {
          return;
        }
        if (field.value !== value) {
          field.value = value;
          filled.push(label);
        }
      };

      write("latitude", place.latitude.toFixed(6), "position", true);
      write("longitude", place.longitude.toFixed(6), "position", true);
      write("name", place.name, "nom", false);
      write("neighborhood", place.neighborhood, "quartier");
      // « Conakry » is only the form's default, not something an admin chose.
      const cityField = form.elements.namedItem("city") as HTMLInputElement | null;
      write("city", place.city, "ville", overwrite || cityField?.value === "Conakry");
      write("address", place.address, "adresse");
      write("areaId", matchArea(areas, place)?.id ?? null, "zone");

      setPreview({ latitude: place.latitude, longitude: place.longitude });
      const labels = [...new Set(filled)];
      setLookup({
        filled: labels.length > 0 ? `Rempli depuis la carte : ${labels.join(", ")}.` : "Rien à compléter.",
        error: result.error,
      });
    });
  };

  // The map follows the coordinate fields, but only once a field is left:
  // reloading an iframe on every keystroke would make the form crawl.
  const [preview, setPreview] = useState<{ latitude: number; longitude: number }>({
    latitude: station?.latitude ?? CONAKRY.latitude,
    longitude: station?.longitude ?? CONAKRY.longitude,
  });

  const previewFrom = (event: React.FocusEvent<HTMLFormElement>) => {
    const form = event.currentTarget;
    const latitude = parseCoordinate((form.elements.namedItem("latitude") as HTMLInputElement).value);
    const longitude = parseCoordinate((form.elements.namedItem("longitude") as HTMLInputElement).value);
    if (latitude !== null && longitude !== null) {
      if (preview.latitude === latitude && preview.longitude === longitude) {
        return;
      }
      setPreview({ latitude, longitude });
      // New coordinates typed by hand: complete what is still empty.
      fill({ latitude, longitude }, false);
    }
  };

  return (
    <form ref={formRef} action={submit} onBlur={previewFrom} className="flex flex-col gap-3 p-4">
      <input type="hidden" name="id" value={station?.id ?? ""} />

      <div className="flex flex-col gap-1.5 rounded border border-outline-variant/40 bg-surface-container-low/60 p-3">
        <span className="text-label-md font-semibold text-on-surface-variant">
          Remplir depuis Google Maps
        </span>
        <div className="flex gap-2">
          {/* No `name`: this is a tool for the form, not one of its fields. */}
          <input
            value={link}
            onChange={(event) => setLink(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (link.trim()) {
                  fill(link, true);
                }
              }
            }}
            placeholder="Lien « Partager » de Google Maps, ou 9.5092, -13.7122"
            className={`${inputClass} min-w-0 flex-1`}
          />
          <button
            type="button"
            disabled={looking || link.trim() === ""}
            onClick={() => fill(link, true)}
            className={buttonClass("ghost")}
          >
            <Icon name="travel_explore" size={16} />
            {looking ? "Recherche…" : "Remplir"}
          </button>
        </div>
        {lookup?.error ? (
          <p className="text-body-sm font-semibold text-error">{lookup.error}</p>
        ) : null}
        {lookup?.filled ? (
          <p className="text-body-sm text-on-tertiary-container">{lookup.filled}</p>
        ) : looking ? null : (
          <p className="text-body-sm text-outline">
            Position, quartier, ville, adresse et zone sont remplis d’après la carte
            (OpenStreetMap). Vérifiez avant d’enregistrer.
          </p>
        )}
      </div>

      <Field label="Nom de la station">
        <input
          name="name"
          required
          minLength={2}
          defaultValue={station?.name ?? ""}
          placeholder="Station TotalEnergies Kaloum Port"
          className={inputClass}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Enseigne">
          <select name="brandId" defaultValue={station?.brandId ?? ""} className={selectClass}>
            <option value="">Sans enseigne</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Zone de recherche">
          <select name="areaId" defaultValue={station?.areaId ?? ""} className={selectClass}>
            <option value="">Aucune zone</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Quartier">
          <input
            name="neighborhood"
            defaultValue={station?.neighborhood ?? ""}
            placeholder="Almamy"
            className={inputClass}
          />
        </Field>

        <Field label="Ville">
          <input
            name="city"
            defaultValue={station?.city ?? "Conakry"}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Adresse">
        <input
          name="address"
          defaultValue={station?.address ?? ""}
          placeholder="Presqu’île de Kaloum"
          className={inputClass}
        />
      </Field>

      <Field label="Téléphone de la station" hint="Utilisé pour joindre le gérant depuis un signalement.">
        <input
          name="phoneNumber"
          type="tel"
          defaultValue={station?.phoneNumber ?? ""}
          placeholder="+224 6XX XX XX XX"
          className={inputClass}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Latitude">
          <input
            name="latitude"
            required
            inputMode="decimal"
            defaultValue={station ? String(station.latitude) : ""}
            placeholder="9.5092"
            className={`${inputClass} tnum`}
          />
        </Field>
        <Field label="Longitude">
          <input
            name="longitude"
            required
            inputMode="decimal"
            defaultValue={station ? String(station.longitude) : ""}
            placeholder="-13.7122"
            className={`${inputClass} tnum`}
          />
        </Field>
      </div>

      <StationMap
        apiKey={mapsApiKey}
        latitude={preview.latitude}
        longitude={preview.longitude}
        name={station?.name ?? "la nouvelle station"}
      />

      {state.error ? (
        <p className="rounded border border-[#fecaca] bg-error-container px-3 py-2 text-body-sm font-semibold text-on-error-container">
          {state.error}
        </p>
      ) : state.done ? (
        <p className="text-body-sm font-semibold text-on-tertiary-container">{state.done}</p>
      ) : null}

      <div className="flex items-center justify-end gap-2 border-t border-outline-variant/30 pt-3">
        {onCancelHref ? (
          <a href={onCancelHref} className={buttonClass("ghost")}>
            Annuler
          </a>
        ) : null}
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          <Icon name="save" size={16} />
          {pending ? "Enregistrement…" : station ? "Enregistrer" : "Créer la station"}
        </button>
      </div>
    </form>
  );
}
