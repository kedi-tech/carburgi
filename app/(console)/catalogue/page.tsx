import {
  AreaCreator,
  AreaEditor,
  BrandCreator,
  BrandEditor,
} from "@/components/catalogue-editors";
import Icon from "@/components/icon";
import RefreshButton from "@/components/refresh-button";
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  NoteBanner,
  PageHeader,
} from "@/components/ui";
import { fetchAreas, fetchBrands, fetchStations } from "@/lib/api";
import { grouped } from "@/lib/format";
import { safe } from "@/lib/safe";

/**
 * The two reference tables everything else points at.
 *
 * Zones are not decoration: they are the fallback the driver app offers when a
 * phone refuses to give its position, and `sortOrder` is the order that picker
 * uses. Adding the regions outside Conakry — the pilot's stated scope — is done
 * here and nowhere else.
 */
export default async function CataloguePage() {
  const [brandsResult, areasResult, stationsResult] = await Promise.all([
    safe(() => fetchBrands()),
    safe(() => fetchAreas()),
    safe(() => fetchStations()),
  ]);

  const brands = [...(brandsResult.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const areas = [...(areasResult.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const stations = stationsResult.data ?? [];

  const stationsPerBrand = new Map<string, number>();
  const stationsPerArea = new Map<string, number>();
  let unbranded = 0;
  let unzoned = 0;

  for (const station of stations) {
    if (station.brandId) {
      stationsPerBrand.set(station.brandId, (stationsPerBrand.get(station.brandId) ?? 0) + 1);
    } else {
      unbranded += 1;
    }
    if (station.areaId) {
      stationsPerArea.set(station.areaId, (stationsPerArea.get(station.areaId) ?? 0) + 1);
    } else {
      unzoned += 1;
    }
  }

  const inactiveAreas = areas.filter((area) => !area.isActive).length;
  const nextSortOrder = areas.reduce((highest, area) => Math.max(highest, area.sortOrder), -1) + 1;

  return (
    <>
      <PageHeader
        eyebrow="Référentiel"
        title="Catalogue"
        description="Enseignes et zones de recherche : les deux tables auxquelles chaque station est rattachée."
        actions={
<RefreshButton label="Actualiser" />
        }
      />

      <div className="flex flex-col gap-4 p-6">
        <NoteBanner icon="warning" title="Portée d’une modification">
          Ces deux tables sont lues par l’application conducteur. Renommer une enseigne change ce
          que voient les conducteurs immédiatement ; désactiver une zone la retire du sélecteur
          proposé quand un téléphone refuse sa position. La suppression détache les stations
          concernées au lieu d’échouer — préférez la désactivation.
        </NoteBanner>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Zones */}
          <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-headline-sm text-on-surface">
                <Icon name="map" size={20} className="text-secondary" />
                Zones de recherche
              </h2>
              <div className="flex items-center gap-1.5">
                <Chip tone="info">{grouped(areas.length)} zones</Chip>
                {inactiveAreas > 0 ? (
                  <Chip tone="neutral">{inactiveAreas} inactive(s)</Chip>
                ) : null}
                {unzoned > 0 ? <Chip tone="warn">{unzoned} station(s) sans zone</Chip> : null}
              </div>
            </div>

            {areasResult.error ? (
              <ErrorState title="Zones illisibles">{areasResult.error}</ErrorState>
            ) : (
              <Card className="overflow-hidden">
                {areas.length === 0 ? (
                  <EmptyState icon="map">
                    Aucune zone. L’application conducteur n’aura rien à proposer si un téléphone
                    refuse sa position.
                  </EmptyState>
                ) : (
                  areas.map((area) => (
                    <AreaEditor
                      key={area.id}
                      area={area}
                      stationCount={stationsPerArea.get(area.id) ?? 0}
                    />
                  ))
                )}
                <AreaCreator nextSortOrder={nextSortOrder} />
              </Card>
            )}

            <p className="text-body-sm text-outline">
              L’ordre définit la position dans le sélecteur de l’application. Les zones hors Conakry
              se créent ici.
            </p>
          </section>

          {/* Enseignes */}
          <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-headline-sm text-on-surface">
                <Icon name="storefront" size={20} className="text-secondary" />
                Enseignes
              </h2>
              <div className="flex items-center gap-1.5">
                <Chip tone="info">{grouped(brands.length)} enseignes</Chip>
                {unbranded > 0 ? (
                  <Chip tone="neutral">{unbranded} station(s) indépendante(s)</Chip>
                ) : null}
              </div>
            </div>

            {brandsResult.error ? (
              <ErrorState title="Enseignes illisibles">{brandsResult.error}</ErrorState>
            ) : (
              <Card className="overflow-hidden">
                {brands.length === 0 ? (
                  <EmptyState icon="storefront">
                    Aucune enseigne enregistrée. Les stations s’afficheront comme indépendantes.
                  </EmptyState>
                ) : (
                  brands.map((brand) => (
                    <BrandEditor
                      key={brand.id}
                      brand={brand}
                      stationCount={stationsPerBrand.get(brand.id) ?? 0}
                    />
                  ))
                )}
                <BrandCreator />
              </Card>
            )}

            <p className="text-body-sm text-outline">
              Le regroupement par opérateur du tableau de bord repose sur cette table.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
