"use client";

import { useActionState } from "react";

import {
  removeArea,
  removeBrand,
  saveArea,
  saveBrand,
  setAreaActive,
  type ActionState,
} from "@/app/actions/admin";
import Icon from "@/components/icon";
import { buttonClass, inputClass } from "@/components/ui";
import type { Area, Brand } from "@/lib/types";

const initialState: ActionState = {};

function Outcome({ state }: { state: ActionState }) {
  if (state.error) {
    return <p className="text-body-sm font-semibold text-error">{state.error}</p>;
  }
  if (state.done) {
    return <p className="text-body-sm font-semibold text-on-tertiary-container">{state.done}</p>;
  }
  return null;
}

/* ---------------------------------------------------------------- Brands */

/**
 * A brand is referenced by stations, and deleting one detaches them rather than
 * failing (`onDelete: SetNull`), so the count of affected stations is stated on
 * the button instead of being discovered afterwards.
 */
export function BrandEditor({ brand, stationCount }: { brand: Brand; stationCount: number }) {
  const [saveState, save, saving] = useActionState(saveBrand, initialState);
  const [deleteState, destroy, deleting] = useActionState(removeBrand, initialState);

  return (
    <details className="group border-b border-surface-container-low last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-surface-container-low">
        <span className="flex min-w-0 items-center gap-2">
          <Icon
            name="chevron_right"
            size={18}
            className="text-outline transition-transform group-open:rotate-90"
          />
          <span className="min-w-0">
            <span className="block truncate text-title-md text-on-surface">{brand.name}</span>
            <span className="block font-mono text-body-sm text-outline">{brand.slug}</span>
          </span>
        </span>
        <span className="shrink-0 text-body-sm tnum text-on-surface-variant">
          {stationCount} station{stationCount > 1 ? "s" : ""}
        </span>
      </summary>

      <div className="flex flex-col gap-3 bg-surface-container-low/60 p-4">
        <form action={save} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={brand.id} />
          <label className="flex min-w-48 flex-1 flex-col gap-1">
            <span className="text-label-md font-semibold text-on-surface-variant">Nom</span>
            <input name="name" defaultValue={brand.name} required className={inputClass} />
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1">
            <span className="text-label-md font-semibold text-on-surface-variant">Logo (URL)</span>
            <input
              name="logoUrl"
              defaultValue={brand.logoUrl ?? ""}
              placeholder="https://…"
              className={inputClass}
            />
          </label>
          <button type="submit" disabled={saving} className={buttonClass("primary")}>
            <Icon name="save" size={16} />
            {saving ? "…" : "Enregistrer"}
          </button>
        </form>
        <Outcome state={saveState} />

        <form action={destroy} className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/30 pt-3">
          <input type="hidden" name="id" value={brand.id} />
          <p className="text-body-sm text-on-surface-variant">
            {stationCount > 0
              ? `${stationCount} station(s) perdraient leur enseigne — elles ne seraient pas supprimées.`
              : "Aucune station ne référence cette enseigne."}
          </p>
          <button type="submit" disabled={deleting} className={buttonClass("danger")}>
            <Icon name="delete" size={16} />
            {deleting ? "…" : "Supprimer l’enseigne"}
          </button>
        </form>
        <Outcome state={deleteState} />
      </div>
    </details>
  );
}

export function BrandCreator() {
  const [state, submit, pending] = useActionState(saveBrand, initialState);

  return (
    <form action={submit} className="flex flex-wrap items-end gap-2 border-t border-surface-container-low bg-surface-container-low/40 p-4">
      <input type="hidden" name="id" value="" />
      <label className="flex min-w-48 flex-1 flex-col gap-1">
        <span className="text-label-md font-semibold text-on-surface-variant">Nouvelle enseigne</span>
        <input name="name" required placeholder="TotalEnergies" className={inputClass} />
      </label>
      <label className="flex min-w-48 flex-1 flex-col gap-1">
        <span className="text-label-md font-semibold text-on-surface-variant">Logo (URL)</span>
        <input name="logoUrl" placeholder="https://…" className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className={buttonClass("primary")}>
        <Icon name="add" size={16} />
        {pending ? "…" : "Ajouter"}
      </button>
      <div className="w-full">
        <Outcome state={state} />
      </div>
    </form>
  );
}

/* ----------------------------------------------------------------- Areas */

/**
 * A zone is what the driver app offers when the device refuses location, and
 * `sortOrder` is the order it offers them in. Deactivating is preferred to
 * deleting — a deleted zone detaches every station that referenced it.
 */
export function AreaEditor({ area, stationCount }: { area: Area; stationCount: number }) {
  const [saveState, save, saving] = useActionState(saveArea, initialState);
  const [activeState, toggle, toggling] = useActionState(setAreaActive, initialState);
  const [deleteState, destroy, deleting] = useActionState(removeArea, initialState);

  return (
    <details className="group border-b border-surface-container-low last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-surface-container-low">
        <span className="flex min-w-0 items-center gap-2">
          <Icon
            name="chevron_right"
            size={18}
            className="text-outline transition-transform group-open:rotate-90"
          />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-title-md text-on-surface">{area.label}</span>
              {area.isActive ? null : (
                <span className="rounded border border-outline-variant bg-surface-container-low px-1.5 text-label-sm font-semibold text-on-surface-variant">
                  Inactive
                </span>
              )}
            </span>
            <span className="block font-mono text-body-sm tnum text-outline">
              {area.latitude.toFixed(4)}, {area.longitude.toFixed(4)}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3 text-body-sm tnum text-on-surface-variant">
          <span>ordre {area.sortOrder}</span>
          <span>
            {stationCount} station{stationCount > 1 ? "s" : ""}
          </span>
        </span>
      </summary>

      <div className="flex flex-col gap-3 bg-surface-container-low/60 p-4">
        <form action={save} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={area.id} />
          <label className="flex min-w-40 flex-1 flex-col gap-1">
            <span className="text-label-md font-semibold text-on-surface-variant">Nom</span>
            <input name="label" defaultValue={area.label} required className={inputClass} />
          </label>
          <label className="flex w-32 flex-col gap-1">
            <span className="text-label-md font-semibold text-on-surface-variant">Latitude</span>
            <input
              name="latitude"
              defaultValue={String(area.latitude)}
              required
              inputMode="decimal"
              className={`${inputClass} tnum`}
            />
          </label>
          <label className="flex w-32 flex-col gap-1">
            <span className="text-label-md font-semibold text-on-surface-variant">Longitude</span>
            <input
              name="longitude"
              defaultValue={String(area.longitude)}
              required
              inputMode="decimal"
              className={`${inputClass} tnum`}
            />
          </label>
          <label className="flex w-24 flex-col gap-1">
            <span className="text-label-md font-semibold text-on-surface-variant">Ordre</span>
            <input
              name="sortOrder"
              defaultValue={String(area.sortOrder)}
              inputMode="numeric"
              className={`${inputClass} tnum`}
            />
          </label>
          <button type="submit" disabled={saving} className={buttonClass("primary")}>
            <Icon name="save" size={16} />
            {saving ? "…" : "Enregistrer"}
          </button>
        </form>
        <Outcome state={saveState} />

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/30 pt-3">
          <p className="text-body-sm text-on-surface-variant">
            {area.isActive
              ? "Désactiver retire la zone du sélecteur de l’application sans toucher aux stations."
              : "Cette zone n’est plus proposée aux conducteurs."}
          </p>
          <form action={toggle}>
            <input type="hidden" name="id" value={area.id} />
            <input type="hidden" name="isActive" value={area.isActive ? "false" : "true"} />
            <button type="submit" disabled={toggling} className={buttonClass("ghost")}>
              <Icon name={area.isActive ? "toggle_off" : "toggle_on"} size={16} />
              {toggling ? "…" : area.isActive ? "Désactiver" : "Réactiver"}
            </button>
          </form>
        </div>
        <Outcome state={activeState} />

        <form action={destroy} className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/30 pt-3">
          <input type="hidden" name="id" value={area.id} />
          <p className="text-body-sm text-on-surface-variant">
            {stationCount > 0
              ? `${stationCount} station(s) perdraient leur zone de recherche.`
              : "Aucune station ne référence cette zone."}
          </p>
          <button type="submit" disabled={deleting} className={buttonClass("danger")}>
            <Icon name="delete" size={16} />
            {deleting ? "…" : "Supprimer la zone"}
          </button>
        </form>
        <Outcome state={deleteState} />
      </div>
    </details>
  );
}

export function AreaCreator({ nextSortOrder }: { nextSortOrder: number }) {
  const [state, submit, pending] = useActionState(saveArea, initialState);

  return (
    <form action={submit} className="flex flex-wrap items-end gap-2 border-t border-surface-container-low bg-surface-container-low/40 p-4">
      <input type="hidden" name="id" value="" />
      <label className="flex min-w-40 flex-1 flex-col gap-1">
        <span className="text-label-md font-semibold text-on-surface-variant">Nouvelle zone</span>
        <input name="label" required placeholder="Kindia" className={inputClass} />
      </label>
      <label className="flex w-32 flex-col gap-1">
        <span className="text-label-md font-semibold text-on-surface-variant">Latitude</span>
        <input name="latitude" required inputMode="decimal" placeholder="10.0569" className={`${inputClass} tnum`} />
      </label>
      <label className="flex w-32 flex-col gap-1">
        <span className="text-label-md font-semibold text-on-surface-variant">Longitude</span>
        <input name="longitude" required inputMode="decimal" placeholder="-12.8658" className={`${inputClass} tnum`} />
      </label>
      <label className="flex w-24 flex-col gap-1">
        <span className="text-label-md font-semibold text-on-surface-variant">Ordre</span>
        <input
          name="sortOrder"
          defaultValue={String(nextSortOrder)}
          inputMode="numeric"
          className={`${inputClass} tnum`}
        />
      </label>
      <button type="submit" disabled={pending} className={buttonClass("primary")}>
        <Icon name="add" size={16} />
        {pending ? "…" : "Ajouter"}
      </button>
      <div className="w-full">
        <Outcome state={state} />
      </div>
    </form>
  );
}
