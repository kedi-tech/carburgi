import Link from "next/link";

import Icon from "@/components/icon";
import RefreshButton from "@/components/refresh-button";
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  PageHeader,
  RateBar,
  SectionHeader,
  StatCard,
  TableShell,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { fetchAccounts, fetchReports, fetchStations, fetchThreads } from "@/lib/api";
import { STALE_AFTER_HOURS, consolidate } from "@/lib/consolidate";
import { elapsedLabel, grouped, percent, phoneLabel } from "@/lib/format";
import { linkStation } from "@/lib/link";
import { safe } from "@/lib/safe";
import { productLabels } from "@/lib/types";

/** The three queues that make up the job, as the banner across the top. */
function TriageCard({
  href,
  icon,
  eyebrow,
  headline,
  detail,
  count,
  accent,
}: {
  href: string;
  icon: string;
  eyebrow: string;
  headline: string;
  detail: string;
  count: number;
  accent: "amber" | "crimson" | "slate";
}) {
  const bar = {
    amber: "bg-secondary-container",
    crimson: "bg-error",
    slate: "bg-surface-tint",
  }[accent];
  const iconTone = {
    amber: "bg-secondary-fixed text-secondary",
    crimson: "bg-error-container text-error",
    slate: "bg-surface-container-high text-surface-tint",
  }[accent];

  return (
    <Link
      href={href}
      className="group relative flex items-start gap-3 overflow-hidden rounded border border-outline-variant/40 bg-surface-container-lowest p-4 transition-colors hover:bg-surface-container-low"
    >
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1.5 ${bar}`} />
      <span className={`flex size-9 shrink-0 items-center justify-center rounded ${iconTone}`}>
        <Icon name={icon} size={22} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center justify-between gap-2">
          <span className="text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
            {eyebrow}
          </span>
          <Chip tone={count > 0 ? (accent === "crimson" ? "bad" : "warn") : "neutral"}>
            {count > 0 ? `${count} en attente` : "à jour"}
          </Chip>
        </span>
        <span className="text-title-md text-on-surface">{headline}</span>
        <span className="text-body-sm text-outline">{detail}</span>
      </span>
    </Link>
  );
}

export default async function OverviewPage() {
  // Independent reads: run them together, and let each panel fail on its own.
  const [stationsResult, pendingResult, reportsResult, threadsResult] = await Promise.all([
    safe(() => fetchStations()),
    safe(() => fetchAccounts()),
    safe(() => fetchReports()),
    safe(() => fetchThreads()),
  ]);

  // Whole lists, filtered here: these are the same four calls the shell makes,
  // so they cost one request between them rather than eight.
  const stations = stationsResult.data ?? [];
  const pendingAccounts = (pendingResult.data ?? []).filter(
    (account) => account.role === "STATION" && account.status === "PENDING",
  );
  const pendingReports = (reportsResult.data ?? []).filter(
    (report) => report.status === "PENDING",
  );
  const escalated = (threadsResult.data ?? []).filter((thread) => thread.status === "ESCALATED");

  const view = consolidate(stations);
  const declaringRate = view.total > 0 ? view.declaring / view.total : null;
  const publishedRate = view.total > 0 ? view.published / view.total : null;
  const unverified = stations.filter((station) => station.verifiedAt === null).length;

  // Which station is each pending agent asking for? The API does not say, so
  // this is the login-code heuristic — labelled as such wherever it shows.
  const inscriptions = [...pendingAccounts]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5)
    .map((account) => ({ account, link: linkStation(account, stations) }));

  return (
    <>
      <PageHeader
        eyebrow="Supervision nationale"
        title="Tableau de bord opérationnel"
        description="Synthèse du réseau de distribution de carburant en Guinée, telle que les stations la déclarent."
        actions={<RefreshButton />}
      />

      <div className="flex flex-col gap-4 p-6">
        {stationsResult.error ? (
          <ErrorState title="Catalogue illisible">{stationsResult.error}</ErrorState>
        ) : null}

        <section className="grid gap-3 md:grid-cols-3">
          <TriageCard
            href="/validations"
            icon="verified_user"
            eyebrow="Validations bloquées"
            headline={
              pendingAccounts.length > 0
                ? `${pendingAccounts.length} équipe(s) en attente d’approbation`
                : "Aucune équipe en attente"
            }
            detail="Accès gestionnaire verrouillés tant qu’un administrateur ne tranche pas."
            count={pendingAccounts.length}
            accent="amber"
          />
          <TriageCard
            href="/reports"
            icon="report_problem"
            eyebrow="Signalements usagers"
            headline={
              pendingReports.length > 0
                ? `${pendingReports.length} contestation(s) à arbitrer`
                : "Aucune contestation en attente"
            }
            detail="Écarts entre ce qu’une station publie et ce que les conducteurs constatent."
            count={pendingReports.length}
            accent="crimson"
          />
          <TriageCard
            href="/support"
            icon="support_agent"
            eyebrow="Support escaladé"
            headline={
              escalated.length > 0
                ? `${escalated.length} conversation(s) transmise(s)`
                : "Aucune escalade en cours"
            }
            detail="Échanges que l’assistant automatique a passés à un agent."
            count={escalated.length}
            accent="slate"
          />
        </section>

        {/*
          Coverage, stated honestly. "Sans produit déclaré" is the figure that
          matters most and the one a prettier dashboard would bury: it is why
          the driver app reads "Non renseigné" across most of the map.
        */}
        <section className="grid gap-3 md:grid-cols-3">
          <StatCard
            label="Stations publiées"
            value={grouped(view.published)}
            unit={`/ ${grouped(view.total)}`}
            badge={{ text: percent(publishedRate), tone: "good" }}
            hint={`${grouped(view.total - view.published)} station(s) retirée(s) du public`}
            footer={<RateBar rate={publishedRate} width={140} />}
          />
          <StatCard
            label="Stations jamais vérifiées"
            value={grouped(unverified)}
            unit={`/ ${grouped(view.total)}`}
            badge={unverified > 0 ? { text: "Audit terrain requis", tone: "info" } : undefined}
            tone={unverified > view.total / 2 ? "warn" : "neutral"}
            hint="Aucun passage terrain n’a confirmé ces points de distribution."
          />
          <StatCard
            label="Stations sans produit déclaré"
            value={grouped(view.silent)}
            unit={`/ ${grouped(view.total)}`}
            badge={view.silent > 0 ? { text: "Alerte couverture", tone: "bad" } : undefined}
            tone={view.silent > 0 ? "bad" : "good"}
            hint="Affichées « Non renseigné » côté conducteur — ce n’est pas une rupture."
          />
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <StatCard
            label="Ont déclaré"
            value={grouped(view.declaring)}
            hint={`${percent(declaringRate)} du réseau`}
            tone={declaringRate !== null && declaringRate < 0.3 ? "warn" : "neutral"}
          />
          <StatCard
            label="Ouvertes"
            value={grouped(view.open)}
            hint={`sur ${grouped(view.total)} stations`}
            tone="good"
          />
          <StatCard
            label="Déclarations périmées"
            value={grouped(view.stale)}
            hint={`plus de ${STALE_AFTER_HOURS} h sans mise à jour`}
            tone={view.stale > 0 ? "warn" : "neutral"}
          />
          <StatCard
            label="Zones couvertes"
            value={grouped(view.byArea.length)}
            hint="zones distinctes au catalogue"
          />
        </section>

        <section>
          <SectionHeader
            title="Disponibilité par produit"
            icon="water_drop"
            subtitle="Ce que les stations déclarent aujourd’hui, produit par produit."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {view.products.map((tally) => {
              const declaring = tally.available + tally.empty;
              const rate = declaring > 0 ? tally.available / declaring : null;
              return (
                <Card key={tally.product} padded>
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-title-md text-on-surface">{productLabels[tally.product]}</p>
                    <RateBar rate={rate} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[
                      { value: tally.available, label: "disponible", tone: "text-on-tertiary-container" },
                      { value: tally.empty, label: "rupture", tone: "text-error" },
                      { value: tally.unknown, label: "non renseigné", tone: "text-outline" },
                    ].map((cell) => (
                      <div
                        key={cell.label}
                        className="rounded bg-surface-container-low px-2 py-2 text-center"
                      >
                        <p className={`font-display text-headline-sm tnum ${cell.tone}`}>
                          {grouped(cell.value)}
                        </p>
                        <p className="text-label-sm text-on-surface-variant">{cell.label}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <section>
            <SectionHeader
              title="Dernières inscriptions station"
              icon="person_add"
              subtitle="Équipes inscrites depuis l’application, en attente d’un arbitrage."
              action={
                pendingAccounts.length > 0 ? (
                  <Link
                    href="/validations"
                    className="flex items-center gap-1 text-label-md font-semibold text-secondary hover:underline"
                  >
                    Tout voir ({pendingAccounts.length})
                    <Icon name="chevron_right" size={16} />
                  </Link>
                ) : undefined
              }
            />
            {pendingResult.error ? (
              <ErrorState title="File d’approbation illisible">{pendingResult.error}</ErrorState>
            ) : inscriptions.length === 0 ? (
              <EmptyState icon="task_alt">
                Aucune inscription en attente. Les nouvelles demandes apparaissent ici dès qu’une
                équipe s’inscrit depuis l’application station.
              </EmptyState>
            ) : (
              <TableShell minWidth={620}>
                <thead>
                  <tr>
                    <Th>Demandeur</Th>
                    <Th>Station présumée</Th>
                    <Th align="right">Délai</Th>
                    <Th align="right">Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {inscriptions.map(({ account, link }) => (
                    <Tr key={account.id}>
                      <Td>
                        <p className="text-title-md text-on-surface">
                          {account.fullName ?? "Sans nom"}
                        </p>
                        <p className="text-body-sm tnum text-outline">
                          {phoneLabel(account.phoneNumber)}
                        </p>
                      </Td>
                      <Td>
                        {link.kind === "matched" ? (
                          <>
                            <p className="text-body-md text-on-surface">{link.station.name}</p>
                            <p className="text-body-sm text-outline">
                              {link.station.neighborhood ?? link.station.city}
                            </p>
                          </>
                        ) : (
                          <Chip tone="warn">Non identifiable</Chip>
                        )}
                      </Td>
                      <Td align="right" className="text-body-sm text-outline">
                        {elapsedLabel(account.createdAt)}
                      </Td>
                      <Td align="right">
                        <Link href="/validations" className="text-label-md font-semibold text-secondary hover:underline">
                          Instruire
                        </Link>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableShell>
            )}
          </section>

          <section>
            <SectionHeader
              title="Zones sous tension"
              icon="local_fire_department"
              subtitle="Zones d’au moins trois stations déclarantes, du taux de service le plus bas au plus haut."
            />
            {view.tension.length === 0 ? (
              <EmptyState icon="query_stats">
                Pas assez de déclarations pour comparer les zones. Le signal apparaît dès que trois
                stations d’une même zone publient un statut.
              </EmptyState>
            ) : (
              <Card className="divide-y divide-surface-container-low">
                {view.tension.map((area) => (
                  <div key={area.key} className="flex flex-col gap-2 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-title-md text-on-surface">{area.label}</span>
                      <Chip tone={(area.rate ?? 1) < 0.3 ? "bad" : "warn"}>
                        {area.dry} à sec / {area.stations - area.silent} déclarantes
                      </Chip>
                    </div>
                    <RateBar rate={area.rate} width={160} />
                  </div>
                ))}
              </Card>
            )}
          </section>
        </div>

        <section>
          <SectionHeader
            title="Répartition de la couverture nationale"
            icon="map"
            subtitle="Stations répertoriées, publiées et déclarantes, par zone de recherche."
          />
          {view.byArea.length === 0 ? (
            <EmptyState icon="map">Aucune station au catalogue.</EmptyState>
          ) : (
            <TableShell minWidth={780}>
              <thead>
                <tr>
                  <Th>Zone</Th>
                  <Th align="right">Total</Th>
                  <Th align="right">Ouvertes</Th>
                  <Th align="right">Servent</Th>
                  <Th align="right">À sec</Th>
                  <Th align="right">Jamais déclaré</Th>
                  <Th align="right">Taux de service</Th>
                </tr>
              </thead>
              <tbody>
                {view.byArea.map((area) => (
                  <Tr key={area.key}>
                    <Td className="text-title-md text-on-surface">{area.label}</Td>
                    <Td align="right" className="tnum text-on-surface-variant">
                      {area.stations}
                    </Td>
                    <Td align="right" className="tnum text-on-surface-variant">
                      {area.open}
                    </Td>
                    <Td align="right" className="tnum text-on-tertiary-container">
                      {area.serving}
                    </Td>
                    <Td align="right" className="tnum text-error">
                      {area.dry}
                    </Td>
                    <Td align="right" className="tnum text-outline">
                      {area.silent}
                    </Td>
                    <Td align="right">
                      <RateBar rate={area.rate} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </section>

        <section>
          <SectionHeader
            title="Couverture par opérateur"
            icon="storefront"
            subtitle="Enseignes présentes au catalogue et part de leur réseau qui déclare."
          />
          <TableShell minWidth={620}>
            <thead>
              <tr>
                <Th>Opérateur</Th>
                <Th align="right">Stations</Th>
                <Th align="right">Servent</Th>
                <Th align="right">Jamais déclaré</Th>
                <Th align="right">Taux de service</Th>
              </tr>
            </thead>
            <tbody>
              {view.byBrand.map((brand) => (
                <Tr key={brand.key}>
                  <Td className="text-title-md text-on-surface">{brand.label}</Td>
                  <Td align="right" className="tnum text-on-surface-variant">
                    {brand.stations}
                  </Td>
                  <Td align="right" className="tnum text-on-tertiary-container">
                    {brand.serving}
                  </Td>
                  <Td align="right" className="tnum text-outline">
                    {brand.silent}
                  </Td>
                  <Td align="right">
                    <RateBar rate={brand.rate} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>
        </section>
      </div>
    </>
  );
}
