import Link from "next/link";

import ActionButton from "@/components/action-button";
import { markStationVerified, updateStationPublication } from "@/app/actions/admin";
import DeleteStation from "@/components/delete-station";
import Icon from "@/components/icon";
import IssueAccess from "@/components/issue-access";
import OsmSync from "@/components/osm-sync";
import Pagination from "@/components/pagination";
import StationForm from "@/components/station-form";
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  NoteBanner,
  PageHeader,
  TableShell,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { fetchAccounts, fetchAreas, fetchBrands, fetchStations } from "@/lib/api";
import { STALE_AFTER_HOURS } from "@/lib/consolidate";
import { dateLabel, elapsedLabel, grouped, phoneLabel, placeLabel } from "@/lib/format";
import { accountsForStation } from "@/lib/link";
import { paginate, parsePage } from "@/lib/paginate";
import { safe } from "@/lib/safe";
import {
  STATION_FILTERS,
  countMatching,
  filterStations,
  isStale,
  isStationFilter,
  type StationFilter,
} from "@/lib/stations";
import { accountStatusLabels, productLabels, type Product, type Station } from "@/lib/types";

/** Dense rows at 44px: this fits a 1080p viewport without the inspector scrolling away. */
const STATIONS_PER_PAGE = 20;

function ProductChips({ station }: { station: Station }) {
  const products = station.products ?? [];
  if (products.length === 0) {
    return <Chip tone="neutral">Aucun produit</Chip>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {(["ESSENCE", "GASOIL"] as Product[]).map((product) => {
        const entry = products.find((candidate) => candidate.product === product);
        if (!entry) {
          return null;
        }
        return (
          <Chip key={product} tone={entry.availability === "AVAILABLE" ? "good" : "bad"} dot>
            {productLabels[product]}
          </Chip>
        );
      })}
    </span>
  );
}

/**
 * The Maps Embed key is public by design (it rides in an iframe URL) and is
 * expected to be referrer-restricted to this console in Google Cloud. Missing
 * key means no map, not a broken page.
 */
const MAPS_API_KEY: string | null = process.env.GOOGLE_MAPS_API_KEY?.trim() || null;

export default async function StationsPage(props: PageProps<"/stations">) {
  const params = await props.searchParams;
  const search = typeof params.q === "string" ? params.q : "";
  const filter: StationFilter = isStationFilter(params.filter) ? params.filter : "all";
  const areaId = typeof params.area === "string" && params.area.length > 0 ? params.area : null;
  const selectedId = typeof params.station === "string" ? params.station : null;
  const creating = params.new === "1";
  const requestedPage = parsePage(params.page);

  const [stationsResult, brandsResult, areasResult, accountsResult] = await Promise.all([
    safe(() => fetchStations()),
    safe(() => fetchBrands()),
    safe(() => fetchAreas()),
    safe(() => fetchAccounts()),
  ]);

  const stations = stationsResult.data ?? [];
  const brands = brandsResult.data ?? [];
  const areas = areasResult.data ?? [];
  const stationAccounts = (accountsResult.data ?? []).filter(
    (account) => account.role === "STATION",
  );

  // How much of the catalogue is actually classified. A bare OpenStreetMap
  // import carries no zone and no enseigne, which changes what this page can
  // honestly offer.
  const zonedStations = stations.filter((station) => station.areaId !== null).length;
  const brandedStations = stations.filter((station) => station.brandId !== null).length;

  const matched = filterStations(stations, { filter, search, areaId });
  const listing = paginate(matched, requestedPage, STATIONS_PER_PAGE);
  const rows = listing.rows;
  const selected = selectedId
    ? (stations.find((station) => station.id === selectedId) ?? null)
    : null;

  // Which accounts speak for the selected station — inferred from the login
  // code, since no admin route reads memberships.
  const linkedAccounts = selected ? accountsForStation(selected, stationAccounts) : [];

  // The filters as they stand, for links that must not lose them.
  const currentQuery: Record<string, string | undefined> = {
    q: search || undefined,
    filter: filter !== "all" ? filter : undefined,
    area: areaId ?? undefined,
    station: selectedId ?? undefined,
    page: listing.page > 1 ? String(listing.page) : undefined,
  };

  const query = (overrides: Record<string, string | undefined>) => ({
    pathname: "/stations" as const,
    query: Object.fromEntries(
      Object.entries({ ...currentQuery, ...overrides }).filter(
        ([, value]) => value !== undefined && value !== "",
      ),
    ),
  });

  return (
    <>
      <PageHeader
        eyebrow="Répertoire national"
        title="Catalogue des stations"
        description="Points de distribution, vérifications terrain, géolocalisation et attribution des accès équipe."
        badge={<Chip tone="info">{grouped(stations.length)} stations répertoriées</Chip>}
        actions={
          <>
            <OsmSync />
            <Link href={query({ new: "1", station: undefined })} className="inline-flex">
              <span className="inline-flex h-[34px] items-center gap-1.5 rounded border border-transparent bg-primary-container px-3 text-label-md font-semibold text-on-primary transition-colors hover:bg-primary">
                <Icon name="add" size={16} />
                Créer une station
              </span>
            </Link>
          </>
        }
      />

      <div className="flex flex-col gap-4 p-6">
        {stationsResult.error ? (
          <ErrorState title="Catalogue illisible">{stationsResult.error}</ErrorState>
        ) : null}

        {stations.length > 0 && zonedStations === 0 ? (
          <NoteBanner icon="rule" title="Catalogue non classé">
            Aucune des {grouped(stations.length)} stations n’est rattachée à une zone
            {brandedStations === 0 ? " ni à une enseigne" : ""}. Le catalogue provient d’un import
            OpenStreetMap brut : le filtre par zone et le regroupement par opérateur restent sans
            effet tant que ces champs ne sont pas renseignés, station par station depuis la fiche
            d’inspection.
          </NoteBanner>
        ) : null}

        <form className="flex flex-wrap items-end gap-2">
          {selectedId ? <input type="hidden" name="station" value={selectedId} /> : null}
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
                placeholder="Nom, enseigne ou quartier (ex : Total Kaloum, Kipé)…"
                className="h-[34px] w-full rounded border border-surface-dim bg-surface-container-lowest pl-9 pr-2.5 text-body-md text-on-surface outline-none transition placeholder:text-outline focus:border-primary-container focus:ring-2 focus:ring-primary-container/20"
              />
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-label-md font-semibold text-on-surface-variant">État</span>
            <select
              name="filter"
              defaultValue={filter}
              className="h-[34px] rounded border border-surface-dim bg-surface-container-lowest px-2.5 pr-8 text-body-md text-on-surface outline-none focus:border-primary-container"
            >
              {STATION_FILTERS.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.label} ({countMatching(stations, entry.key)})
                </option>
              ))}
            </select>
          </label>

          {/*
            Filtering by zone only works on stations that carry an `areaId`, and
            in a freshly imported catalogue none of them do. Offering a live
            control that silently returns nothing reads as a broken page, so it
            is disabled and says why.
          */}
          <label className="flex flex-col gap-1">
            <span className="text-label-md font-semibold text-on-surface-variant">Zone</span>
            <select
              name="area"
              defaultValue={areaId ?? ""}
              disabled={zonedStations === 0}
              className="h-[34px] rounded border border-surface-dim bg-surface-container-lowest px-2.5 pr-8 text-body-md text-on-surface outline-none focus:border-primary-container disabled:cursor-not-allowed disabled:bg-surface-container-low disabled:text-outline"
            >
              <option value="">
                {zonedStations === 0 ? "Aucune station rattachée" : "Toutes les zones"}
              </option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.label}
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

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
          <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-body-md text-on-surface-variant">
                <span className="font-semibold text-on-surface">{grouped(listing.total)}</span>{" "}
                station(s) correspondante(s)
                {listing.pageCount > 1 ? ` · page ${listing.page} sur ${listing.pageCount}` : ""}
              </p>
            </div>

            {rows.length === 0 ? (
              <EmptyState icon="search_off">
                Aucune station ne correspond à ce filtre. Élargissez la recherche ou choisissez «
                Toutes ».
              </EmptyState>
            ) : (
              <TableShell minWidth={640}>
                <thead>
                  <tr>
                    <Th>Station &amp; enseigne</Th>
                    <Th>Quartier &amp; zone</Th>
                    <Th>État</Th>
                    <Th>Produits</Th>
                    <Th align="right">Dernière déclaration</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((station) => {
                    const active = station.id === selected?.id;
                    const stale = isStale(station);
                    return (
                      <Tr
                        key={station.id}
                        className={active ? "bg-surface-container-high" : undefined}
                      >
                        <Td>
                          <Link
                            href={query({ station: station.id, new: undefined })}
                            className="block"
                          >
                            <span className="block text-title-md text-on-surface hover:underline">
                              {station.name}
                            </span>
                            <span className="block text-body-sm text-outline">
                              {station.brand?.name ?? "Sans enseigne"} · {station.slug}
                            </span>
                          </Link>
                        </Td>
                        <Td className="text-body-md text-on-surface-variant">
                          <span className="block">{station.neighborhood ?? "—"}</span>
                          <span className="block text-body-sm text-outline">
                            {station.area?.label ?? station.city}
                          </span>
                        </Td>
                        <Td>
                          <span className="flex flex-wrap gap-1">
                            <Chip tone={station.isOpen ? "good" : "neutral"} dot>
                              {station.isOpen ? "Ouverte" : "Fermée"}
                            </Chip>
                            {station.isPublished ? null : <Chip tone="warn">Non publiée</Chip>}
                            {station.verifiedAt ? (
                              <Chip tone="good">Vérifiée</Chip>
                            ) : (
                              <Chip tone="bad">Non vérifiée</Chip>
                            )}
                          </span>
                        </Td>
                        <Td>
                          <ProductChips station={station} />
                        </Td>
                        <Td align="right" className="text-body-sm">
                          {(station.products ?? []).length === 0 ? (
                            <span className="text-outline">jamais</span>
                          ) : (
                            <span className={stale ? "text-error" : "text-on-surface-variant"}>
                              {elapsedLabel(station.statusUpdatedAt)}
                            </span>
                          )}
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </TableShell>
            )}

            <Pagination page={listing} pathname="/stations" query={currentQuery} noun="station" />
          </section>

          {/* Inspector */}
          <aside className="flex flex-col gap-3 self-start xl:sticky xl:top-[calc(var(--spacing-header)+1rem)] xl:max-h-[calc(100dvh-var(--spacing-header)-2rem)] xl:overflow-y-auto">
            {creating ? (
              <Card>
                <div className="flex items-center gap-2 rounded-t bg-primary-container px-4 py-3 text-on-primary">
                  <Icon name="add_business" size={20} className="text-secondary-container" />
                  <span className="font-display text-headline-sm">Nouvelle station</span>
                </div>
                <StationForm
                  brands={brands}
                  areas={areas}
                  onCancelHref="/stations"
                  mapsApiKey={MAPS_API_KEY}
                />
              </Card>
            ) : selected ? (
              <>
                <Card>
                  <div className="flex items-start justify-between gap-2 rounded-t bg-primary-container px-4 py-3 text-on-primary">
                    <div className="min-w-0">
                      <p className="text-label-sm uppercase tracking-wider text-on-primary-container">
                        Fiche d’inspection
                      </p>
                      <p className="font-display text-headline-sm">{selected.name}</p>
                      <p className="text-body-sm text-on-primary-container">
                        {placeLabel([selected.address, selected.area?.label, selected.city])}
                      </p>
                    </div>
                    <Link
                      href={query({ station: undefined })}
                      className="text-on-primary-container transition-colors hover:text-white"
                      aria-label="Fermer la fiche"
                    >
                      <Icon name="close" size={20} />
                    </Link>
                  </div>

                  {/* État & conformité */}
                  <div className="flex flex-col gap-3 border-b border-surface-container-low p-4">
                    <p className="text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
                      État &amp; conformité
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-body-md text-on-surface">Publiée dans l’application</p>
                        <p className="text-body-sm text-outline">
                          Visible par les conducteurs et mototaxis.
                        </p>
                      </div>
                      <ActionButton
                        action={updateStationPublication}
                        fields={{
                          id: selected.id,
                          isPublished: selected.isPublished ? "false" : "true",
                        }}
                        label={selected.isPublished ? "Retirer du public" : "Publier"}
                        confirm={selected.isPublished ? "Confirmer le retrait" : undefined}
                        tone={selected.isPublished ? "danger" : "primary"}
                        icon={selected.isPublished ? "visibility_off" : "visibility"}
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/30 pt-3">
                      <div>
                        <p className="text-body-md text-on-surface">Vérification terrain</p>
                        <p className="text-body-sm text-outline">
                          {selected.verifiedAt
                            ? `Vérifiée le ${dateLabel(selected.verifiedAt)}`
                            : "Jamais confirmée sur place."}
                        </p>
                      </div>
                      {selected.verifiedAt ? (
                        <Chip tone="good" dot>
                          Certifiée
                        </Chip>
                      ) : (
                        <ActionButton
                          action={markStationVerified}
                          fields={{ id: selected.id }}
                          label="Certifier la station"
                          tone="primary"
                          icon="verified"
                        />
                      )}
                    </div>

                    {/*
                      isOpen belongs to the station's own dashboard. The admin
                      routes cannot write it, so it is shown, not offered.
                    */}
                    <div className="flex items-start gap-2 rounded bg-surface-container-low px-3 py-2">
                      <Icon name="lock" size={16} className="mt-0.5 text-outline" />
                      <p className="text-body-sm leading-relaxed text-on-surface-variant">
                        L’état <strong>{selected.isOpen ? "ouvert" : "fermé"}</strong> et les statuts
                        produits sont déclarés par l’équipe de la station depuis son tableau de
                        bord. Ils ne sont pas modifiables depuis le back-office.
                      </p>
                    </div>
                  </div>

                  {/* Produits */}
                  <div className="flex flex-col gap-2 border-b border-surface-container-low p-4">
                    <p className="text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
                      Produits déclarés
                    </p>
                    {(selected.products ?? []).length === 0 ? (
                      <p className="text-body-sm text-outline">
                        Aucun produit déclaré. Côté conducteur, cette station affiche « Non
                        renseigné » — ce qui n’est pas une rupture.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-1.5">
                        {(selected.products ?? []).map((entry) => (
                          <li
                            key={entry.id}
                            className="flex items-center justify-between gap-2 rounded bg-surface-container-low px-3 py-2"
                          >
                            <span className="flex items-center gap-2">
                              <Chip tone={entry.availability === "AVAILABLE" ? "good" : "bad"} dot>
                                {entry.availability === "AVAILABLE" ? "Disponible" : "Rupture"}
                              </Chip>
                              <span className="text-body-md text-on-surface">
                                {productLabels[entry.product]}
                              </span>
                            </span>
                            <span className="text-right">
                              <span className="block text-data tnum text-on-surface">
                                {entry.priceGnf
                                  ? `${grouped(entry.priceGnf)} GNF/L`
                                  : "Prix non publié"}
                              </span>
                              <span className="block text-body-sm text-outline">
                                {elapsedLabel(entry.updatedAt)}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {isStale(selected) ? (
                      <p className="text-body-sm font-semibold text-error">
                        Déclaration périmée : plus de {STALE_AFTER_HOURS} h sans mise à jour.
                      </p>
                    ) : null}
                  </div>

                  {/* Accès gestionnaire */}
                  <div className="flex flex-col gap-2 border-b border-surface-container-low p-4">
                    <p className="text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
                      Accès gestionnaire
                    </p>

                    {linkedAccounts.length === 0 ? (
                      <p className="text-body-sm text-outline">
                        Aucun compte ne correspond au code{" "}
                        <code className="font-mono">{selected.slug}</code>. Ce rapprochement reste
                        une déduction : le rattachement d’une équipe à sa station n’est pas
                        enregistré.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-1.5">
                        {linkedAccounts.map((account) => (
                          <li
                            key={account.id}
                            className="flex items-center justify-between gap-2 rounded bg-surface-container-low px-3 py-2"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-body-md text-on-surface">
                                {account.fullName ?? "Sans nom"}
                              </span>
                              <span className="block text-body-sm tnum text-outline">
                                {phoneLabel(account.phoneNumber)}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              <code className="font-mono text-label-md text-on-surface-variant">
                                {account.loginCode}
                              </code>
                              <Chip
                                tone={
                                  account.status === "ACTIVE"
                                    ? "good"
                                    : account.status === "PENDING"
                                      ? "warn"
                                      : "bad"
                                }
                              >
                                {accountStatusLabels[account.status]}
                              </Chip>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/*
                      Always mounted, never swapped: the creation revalidates
                      this page and the new account links to the station, and
                      the component holding the one-time password has to survive
                      that re-render. It shows the button or the note itself.
                    */}
                    <div className="pt-1">
                      <IssueAccess
                        stationId={selected.id}
                        stationName={selected.name}
                        alreadyIssued={linkedAccounts.length > 0}
                      />
                    </div>
                  </div>

                  {/* Identité & position */}
                  <div className="border-b border-surface-container-low px-4 pt-4">
                    <p className="text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
                      Identité &amp; position
                    </p>
                  </div>
                  <StationForm
                    key={selected.id}
                    station={selected}
                    brands={brands}
                    areas={areas}
                    mapsApiKey={MAPS_API_KEY}
                  />

                  <div className="border-t border-surface-container-low p-4">
                    <DeleteStation stationId={selected.id} stationName={selected.name} />
                  </div>
                </Card>
              </>
            ) : (
              <Card padded>
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <Icon name="ads_click" size={28} className="text-outline-variant" />
                  <p className="text-body-md text-on-surface-variant">
                    Sélectionnez une station pour ouvrir sa fiche d’inspection.
                  </p>
                  <p className="text-body-sm text-outline">
                    Identité, position, conformité, produits déclarés et accès de l’équipe.
                  </p>
                </div>
              </Card>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
