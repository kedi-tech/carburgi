import Link from "next/link";

import ActionButton from "@/components/action-button";
import { closeThreadAction } from "@/app/actions/admin";
import Icon from "@/components/icon";
import LiveThreads from "@/components/live-threads";
import Pagination from "@/components/pagination";
import RefreshButton from "@/components/refresh-button";
import Transcript from "@/components/transcript";
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  NoteBanner,
  PageHeader,
} from "@/components/ui";
import { API_BASE_URL, fetchAccounts, fetchThreadMessages, fetchThreads } from "@/lib/api";
import { chatSocketUrl, threadsDigest } from "@/lib/chat-live";
import { dateLabel, elapsedLabel, phoneLabel } from "@/lib/format";
import { paginate, parsePage } from "@/lib/paginate";
import { safe } from "@/lib/safe";
import {
  accountStatusLabels,
  roleLabels,
  threadStatusLabels,
  type ChatThread,
  type ThreadStatus,
} from "@/lib/types";

const TABS: { key: ThreadStatus; label: string }[] = [
  { key: "ESCALATED", label: "Escaladés" },
  { key: "OPEN", label: "Ouverts" },
  { key: "CLOSED", label: "Clôturés" },
];

function isThreadStatus(value: unknown): value is ThreadStatus {
  return value === "OPEN" || value === "ESCALATED" || value === "CLOSED";
}

function threadTone(status: ThreadStatus) {
  return status === "ESCALATED" ? "bad" : status === "OPEN" ? "warn" : "neutral";
}

const THREADS_PER_PAGE = 20;

export default async function SupportPage(props: PageProps<"/support">) {
  const params = await props.searchParams;
  const status: ThreadStatus = isThreadStatus(params.status) ? params.status : "ESCALATED";
  const requestedThread = typeof params.thread === "string" ? params.thread : null;
  const requestedPage = parsePage(params.page);

  // One read of every conversation; the three tab counters come out of it.
  const [threadsResult, accountsResult] = await Promise.all([
    safe(() => fetchThreads()),
    safe(() => fetchAccounts()),
  ]);

  const allThreads = threadsResult.data ?? [];
  const threads = allThreads
    .filter((thread) => thread.status === status)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const accounts = accountsResult.data ?? [];
  const counts = threadsResult.error
    ? undefined
    : {
        ESCALATED: allThreads.filter((thread) => thread.status === "ESCALATED").length,
        OPEN: allThreads.filter((thread) => thread.status === "OPEN").length,
        CLOSED: allThreads.filter((thread) => thread.status === "CLOSED").length,
      };

  const accountsById = new Map(accounts.map((account) => [account.id, account]));

  // The selected thread is looked up across every page of the list, so a link
  // to a conversation opens it even when it sits on page three; the list then
  // shows the page that contains it.
  const requested = threads.find((thread) => thread.id === requestedThread) ?? null;
  const pageOfRequested = requested
    ? Math.floor(threads.indexOf(requested) / THREADS_PER_PAGE) + 1
    : requestedPage;
  const listing = paginate(threads, pageOfRequested, THREADS_PER_PAGE);
  const selected: ChatThread | null = requested ?? listing.rows[0] ?? null;

  const currentQuery: Record<string, string | undefined> = {
    status: status !== "ESCALATED" ? status : undefined,
  };

  const messagesResult = selected
    ? await safe(() => fetchThreadMessages(selected.id))
    : { data: [], error: null as string | null };
  const messages = messagesResult.data ?? [];
  const usager = selected ? accountsById.get(selected.accountId) : undefined;

  return (
    <>
      <PageHeader
        eyebrow="Support opérationnel"
        title="Escalades conversationnelles"
        description="Prise en charge des demandes que l’assistant automatique n’a pas su traiter."
        badge={
          counts && counts.ESCALATED > 0 ? (
            <Chip tone="bad" dot>
              {counts.ESCALATED} escalade(s)
            </Chip>
          ) : undefined
        }
        actions={
<RefreshButton label="Actualiser" />
        }
      />

      <div className="flex flex-col gap-4 p-6">
        {threadsResult.error ? (
          <ErrorState title="Conversations illisibles">{threadsResult.error}</ErrorState>
        ) : null}

        <NoteBanner icon="sync_alt" title="Conversations suivies en direct">
          La conversation ouverte reçoit les messages de l’usager au fil de l’eau, et la liste se
          met à jour d’elle-même quand une autre conversation bouge. Vos réponses parviennent
          instantanément à l’application mobile.
        </NoteBanner>
        {threadsResult.error ? null : (
          <LiveThreads
            digest={threadsDigest(allThreads, selected?.id ?? null)}
            openThreadId={selected?.id ?? null}
          />
        )}

        <nav className="flex flex-wrap gap-1 border-b border-outline-variant/40">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={{ pathname: "/support", query: { status: tab.key } }}
              className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-title-md transition-colors ${
                tab.key === status
                  ? "border-primary-container text-on-surface"
                  : "border-transparent text-outline hover:text-on-surface"
              }`}
            >
              {tab.label}
              {counts ? (
                <span className="rounded bg-surface-container-high px-1.5 py-0.5 text-label-sm font-bold tnum text-on-surface-variant">
                  {counts[tab.key]}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>

        {threads.length === 0 ? (
          <EmptyState icon="forum">
            Aucune conversation dans cette catégorie. Les échanges arrivent ici quand l’assistant
            automatique passe la main à un agent.
          </EmptyState>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_300px]">
            {/* Threads */}
            <Card className="flex max-h-[70vh] flex-col overflow-hidden">
              <div className="border-b border-surface-container-low px-3 py-2">
                <p className="text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
                  {threads.length} conversation{threads.length > 1 ? "s" : ""}
                  {listing.pageCount > 1 ? ` · page ${listing.page}/${listing.pageCount}` : ""}
                </p>
              </div>
              <ul className="flex-1 overflow-y-auto">
                {listing.rows.map((thread) => {
                  const account = accountsById.get(thread.accountId);
                  const active = selected?.id === thread.id;
                  return (
                    <li key={thread.id}>
                      <Link
                        href={{
                          pathname: "/support",
                          query: {
                            ...(status !== "ESCALATED" ? { status } : {}),
                            thread: thread.id,
                          },
                        }}
                        className={`flex flex-col gap-1 border-b border-surface-container-low px-3 py-2.5 transition-colors ${
                          active
                            ? "bg-surface-container-high"
                            : "hover:bg-surface-container-low"
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-title-md text-on-surface">
                            {account?.fullName ?? "Usager"}
                          </span>
                          <span className="shrink-0 text-body-sm text-outline">
                            {elapsedLabel(thread.updatedAt)}
                          </span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Chip tone={threadTone(thread.status)}>
                            {threadStatusLabels[thread.status]}
                          </Chip>
                          <span className="truncate text-body-sm tnum text-outline">
                            {phoneLabel(account?.phoneNumber ?? null)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {listing.pageCount > 1 ? (
                <div className="border-t border-surface-container-low p-2">
                  <Pagination
                    page={listing}
                    pathname="/support"
                    query={currentQuery}
                    noun="conversation"
                  />
                </div>
              ) : null}
            </Card>

            {/* Transcript */}
            {selected ? (
              <Card className="flex max-h-[70vh] flex-col overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-container-low px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-display text-headline-sm text-on-surface">
                      {usager?.fullName ?? "Usager"}
                    </p>
                    <p className="text-body-sm text-outline">
                      Ouvert le {dateLabel(selected.createdAt)}
                      {selected.escalatedAt
                        ? ` · escaladé ${elapsedLabel(selected.escalatedAt)}`
                        : ""}
                    </p>
                  </div>
                  {selected.status !== "CLOSED" ? (
                    <ActionButton
                      action={closeThreadAction}
                      fields={{ id: selected.id }}
                      label="Clôturer"
                      confirm="Confirmer la clôture"
                      tone="ghost"
                      icon="task_alt"
                    />
                  ) : (
                    <Chip tone="neutral">
                      Clôturé {selected.closedAt ? elapsedLabel(selected.closedAt) : ""}
                    </Chip>
                  )}
                </div>

                <Transcript
                  key={selected.id}
                  threadId={selected.id}
                  accountId={selected.accountId}
                  socketUrl={chatSocketUrl(API_BASE_URL)}
                  initialMessages={messages}
                  closed={selected.status === "CLOSED"}
                  error={messagesResult.error}
                />
              </Card>
            ) : null}

            {/* Usager */}
            <aside className="flex flex-col gap-3">
              <Card>
                <div className="flex items-center gap-2 border-b border-surface-container-low px-4 py-3">
                  <Icon name="account_circle" size={20} className="text-secondary" />
                  <span className="font-display text-headline-sm text-on-surface">
                    Fiche usager
                  </span>
                </div>
                {usager ? (
                  <dl className="flex flex-col gap-3 p-4">
                    {[
                      { label: "Nom", value: usager.fullName ?? "Non renseigné" },
                      { label: "Téléphone", value: phoneLabel(usager.phoneNumber) },
                      { label: "Profil", value: roleLabels[usager.role] },
                      { label: "Statut", value: accountStatusLabels[usager.status] },
                      { label: "Inscrit le", value: dateLabel(usager.createdAt) },
                      {
                        label: "Dernière activité",
                        value: elapsedLabel(usager.lastSeenAt ?? null),
                      },
                    ].map((entry) => (
                      <div key={entry.label} className="flex items-baseline justify-between gap-3">
                        <dt className="text-label-md text-on-surface-variant">{entry.label}</dt>
                        <dd className="text-right text-body-md text-on-surface">{entry.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="p-4 text-body-sm text-outline">
                    Le compte {selected?.accountId} n’apparaît pas dans la liste des comptes lue par
                    la console.
                  </p>
                )}
              </Card>

              {usager ? (
                <Card padded>
                  <p className="text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
                    Actions
                  </p>
                  <div className="mt-2 flex flex-col gap-2">
                    <Link
                      href={{ pathname: "/accounts", query: { role: usager.role } }}
                      className="flex items-center gap-1.5 text-label-md font-semibold text-secondary hover:underline"
                    >
                      <Icon name="manage_accounts" size={16} />
                      Ouvrir le compte dans Comptes
                    </Link>
                    {usager.phoneNumber ? (
                      <a
                        href={`tel:${usager.phoneNumber}`}
                        className="flex items-center gap-1.5 text-label-md font-semibold text-secondary hover:underline"
                      >
                        <Icon name="call" size={16} />
                        Appeler {phoneLabel(usager.phoneNumber)}
                      </a>
                    ) : null}
                  </div>
                </Card>
              ) : null}
            </aside>
          </div>
        )}
      </div>
    </>
  );
}
