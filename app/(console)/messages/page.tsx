import Link from "next/link";

import ActionButton from "@/components/action-button";
import { cancelNotification } from "@/app/actions/admin";
import Icon from "@/components/icon";
import MessageComposer from "@/components/message-composer";
import Pagination from "@/components/pagination";
import RefreshButton from "@/components/refresh-button";
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  NoteBanner,
  PageHeader,
  SectionHeader,
  TableShell,
  Td,
  Th,
  Tr,
  type Tone,
} from "@/components/ui";
import { fetchAccounts, fetchMessage, fetchMessages } from "@/lib/api";
import { dateLabel, elapsedLabel, grouped, phoneLabel } from "@/lib/format";
import { audienceRecipients, reachablePeople, type Audience } from "@/lib/messages";
import { paginate, parsePage } from "@/lib/paginate";
import { safe } from "@/lib/safe";
import {
  messageStatusLabels,
  recipientStatusLabels,
  roleLabels,
  type AdminMessage,
  type AdminMessageRecipient,
  type MessageStatus,
  type RecipientStatus,
} from "@/lib/types";

const TABS: { key: MessageStatus | "ALL"; label: string }[] = [
  { key: "ALL", label: "Tous" },
  { key: "SCHEDULED", label: "Programmés" },
  { key: "SENT", label: "Envoyés" },
  { key: "CANCELED", label: "Annulés" },
];

const MESSAGES_PER_PAGE = 10;
const RECIPIENTS_PER_PAGE = 25;

/** Failures first: they are what an administrator opens the detail for. */
const RECIPIENT_ORDER: Record<RecipientStatus, number> = {
  FAILED: 0,
  SKIPPED: 1,
  PENDING: 2,
  SENT: 3,
};

function isMessageStatus(value: unknown): value is MessageStatus | "ALL" {
  return value === "SCHEDULED" || value === "SENT" || value === "CANCELED" || value === "ALL";
}

function messageTone(status: MessageStatus): Tone {
  return status === "SCHEDULED" ? "warn" : status === "SENT" ? "good" : "neutral";
}

function recipientTone(status: RecipientStatus): Tone {
  return status === "SENT"
    ? "good"
    : status === "FAILED"
      ? "bad"
      : status === "SKIPPED"
        ? "neutral"
        : "warn";
}

/** `counts` comes on the detail route; the list only carries the total. */
function tally(message: AdminMessage): Record<RecipientStatus, number> {
  const base: Record<RecipientStatus, number> = { PENDING: 0, SENT: 0, FAILED: 0, SKIPPED: 0 };
  if (message.counts) {
    return { ...base, ...message.counts };
  }
  for (const recipient of message.recipients ?? []) {
    base[recipient.status] += 1;
  }
  return base;
}

function MessageRow({
  message,
  selected,
  query,
}: {
  message: AdminMessage;
  selected: boolean;
  query: Record<string, string | undefined>;
}) {
  const total = message.recipientCount ?? message.recipients?.length ?? 0;
  const when =
    message.status === "SCHEDULED"
      ? `prévu le ${dateLabel(message.scheduledAt)}`
      : message.status === "SENT"
        ? `parti ${elapsedLabel(message.dispatchedAt ?? message.scheduledAt)}`
        : `annulé · créé le ${dateLabel(message.createdAt)}`;

  return (
    <Link
      href={{ pathname: "/messages", query: { ...query, message: message.id } }}
      aria-current={selected ? "true" : undefined}
      className={`flex flex-col gap-1.5 border-b border-surface-container-low px-4 py-3 transition-colors last:border-b-0 ${
        selected
          ? "bg-surface-container-low"
          : "bg-surface-container-lowest hover:bg-surface-container-low/60"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <Chip tone={messageTone(message.status)} dot>
          {messageStatusLabels[message.status]}
        </Chip>
        <span className="text-body-sm tnum text-on-surface-variant">
          {grouped(total)} destinataire{total > 1 ? "s" : ""}
        </span>
      </span>
      <span className="line-clamp-2 text-body-md text-on-surface">{message.body}</span>
      <span className="text-body-sm text-outline">
        {when}
        {message.sender?.fullName ? ` · par ${message.sender.fullName}` : ""}
      </span>
    </Link>
  );
}

function RecipientRow({ recipient }: { recipient: AdminMessageRecipient }) {
  return (
    <Tr>
      <Td>
        <span className="block text-title-md text-on-surface">
          {recipient.account?.fullName ?? "Sans nom"}
        </span>
        <span className="block text-body-sm text-outline">
          {recipient.account ? roleLabels[recipient.account.role] : "Compte supprimé"}
        </span>
      </Td>
      <Td className="text-body-md tnum text-on-surface-variant">
        {phoneLabel(recipient.phoneNumber ?? recipient.account?.phoneNumber ?? null)}
      </Td>
      <Td>
        <Chip tone={recipientTone(recipient.status)} dot>
          {recipientStatusLabels[recipient.status]}
        </Chip>
      </Td>
      <Td className="text-body-sm text-on-surface-variant">
        {recipient.status === "FAILED" && recipient.error ? (
          <span className="text-error">{recipient.error}</span>
        ) : recipient.status === "SKIPPED" ? (
          <span className="text-outline">Aucun numéro enregistré</span>
        ) : recipient.sentAt ? (
          dateLabel(recipient.sentAt)
        ) : (
          <span className="text-outline">—</span>
        )}
      </Td>
    </Tr>
  );
}

export default async function MessagesPage(props: PageProps<"/messages">) {
  const params = await props.searchParams;
  const status: MessageStatus | "ALL" = isMessageStatus(params.status) ? params.status : "ALL";
  const requestedMessage = typeof params.message === "string" ? params.message : null;
  // `?to=<accountId>` — the Comptes page's "SMS" shortcut lands here.
  const requestedPerson = typeof params.to === "string" ? params.to : null;
  const requestedPage = parsePage(params.page);
  const requestedRecipientPage = parsePage(params.rpage);

  // `fetchAccounts()` is the read the shell already made — `cache()` folds it.
  const [accountsResult, messagesResult] = await Promise.all([
    safe(() => fetchAccounts()),
    safe(() => fetchMessages()),
  ]);

  const accounts = accountsResult.data ?? [];
  const counts: Record<Audience, number> = {
    DRIVER: audienceRecipients(accounts, "DRIVER").length,
    STATION: audienceRecipients(accounts, "STATION").length,
    BOTH: audienceRecipients(accounts, "BOTH").length,
  };
  const people = reachablePeople(accounts);

  const allMessages = messagesResult.data ?? [];
  const messages = allMessages
    .filter((message) => (status === "ALL" ? true : message.status === status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const tabCounts = messagesResult.error
    ? undefined
    : {
        ALL: allMessages.length,
        SCHEDULED: allMessages.filter((message) => message.status === "SCHEDULED").length,
        SENT: allMessages.filter((message) => message.status === "SENT").length,
        CANCELED: allMessages.filter((message) => message.status === "CANCELED").length,
      };

  // A link to a campaign opens it whatever page of the history it sits on.
  const requested = messages.find((message) => message.id === requestedMessage) ?? null;
  const pageOfRequested = requested
    ? Math.floor(messages.indexOf(requested) / MESSAGES_PER_PAGE) + 1
    : requestedPage;
  const listing = paginate(messages, pageOfRequested, MESSAGES_PER_PAGE);
  // The history is capped at 100 by the route: a campaign older than that can
  // still be opened by id, it just has no row to highlight.
  const selectedId: string | null = requested?.id ?? requestedMessage ?? listing.rows[0]?.id ?? null;

  const detailResult = selectedId ? await safe(() => fetchMessage(selectedId)) : null;
  const detail = detailResult?.data ?? null;
  const detailCounts = detail ? tally(detail) : null;
  const recipients = [...(detail?.recipients ?? [])].sort(
    (a, b) => RECIPIENT_ORDER[a.status] - RECIPIENT_ORDER[b.status],
  );
  const recipientListing = paginate(recipients, requestedRecipientPage, RECIPIENTS_PER_PAGE);

  const currentQuery: Record<string, string | undefined> = {
    status: status !== "ALL" ? status : undefined,
    message: selectedId ?? undefined,
  };

  return (
    <>
      <PageHeader
        eyebrow="Communication réseau"
        title="Messagerie"
        description="Un SMS aux conducteurs, aux équipes station ou aux deux — immédiat ou programmé, avec le sort de chaque destinataire."
        actions={<RefreshButton label="Actualiser" />}
      />

      <div className="flex flex-col gap-4 p-6">
        {accountsResult.error ? (
          <ErrorState title="Destinataires illisibles">{accountsResult.error}</ErrorState>
        ) : null}

        <NoteBanner icon="sms" title="Ce que reçoit un destinataire">
          Le texte part par SMS, tel quel, sur le numéro enregistré du compte. Un envoi groupé
          n’adresse que les comptes <strong>actifs</strong> ayant un numéro — un compte en attente
          ou suspendu ne l’est pas, et un administrateur jamais ; un envoi individuel peut viser
          n’importe quel conducteur ou équipe joignable. Chaque destinataire est traité
          séparément : un échec isolé n’empêche pas les autres envois.
        </NoteBanner>

        <Card>
          <div className="border-b border-outline-variant/40 px-4 pt-4">
            <SectionHeader
              icon="campaign"
              title="Nouveau message"
              subtitle="Les effectifs sont ceux du répertoire à l’instant de l’envoi."
            />
          </div>
          <MessageComposer counts={counts} people={people} initialPersonId={requestedPerson} />
        </Card>

        {messagesResult.error ? (
          <ErrorState title="Historique illisible">{messagesResult.error}</ErrorState>
        ) : null}

        <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="flex flex-col gap-3">
            <SectionHeader
              icon="history"
              title="Historique"
              subtitle="Les 100 envois les plus récents."
            />

            <nav className="flex flex-wrap gap-1 border-b border-outline-variant/40">
              {TABS.map((tab) => (
                <Link
                  key={tab.key}
                  href={{
                    pathname: "/messages",
                    query: tab.key === "ALL" ? {} : { status: tab.key },
                  }}
                  className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-title-md transition-colors ${
                    tab.key === status
                      ? "border-primary-container text-on-surface"
                      : "border-transparent text-outline hover:text-on-surface"
                  }`}
                >
                  {tab.label}
                  {tabCounts ? (
                    <span className="rounded bg-surface-container-high px-1.5 py-0.5 text-label-sm font-bold tnum text-on-surface-variant">
                      {tabCounts[tab.key]}
                    </span>
                  ) : null}
                </Link>
              ))}
            </nav>

            {listing.rows.length === 0 ? (
              <EmptyState icon="outbox">
                {status === "ALL"
                  ? "Aucun message n’a encore été envoyé depuis ce back-office."
                  : "Aucun envoi dans cet état."}
              </EmptyState>
            ) : (
              <Card className="overflow-hidden">
                {listing.rows.map((message) => (
                  <MessageRow
                    key={message.id}
                    message={message}
                    selected={message.id === selectedId}
                    query={{ status: currentQuery.status }}
                  />
                ))}
              </Card>
            )}

            <Pagination
              page={listing}
              pathname="/messages"
              query={{ status: currentQuery.status }}
              noun="envoi"
            />
          </div>

          <div className="flex flex-col gap-3">
            <SectionHeader icon="receipt_long" title="Détail de l’envoi" />

            {detailResult?.error ? (
              <ErrorState title="Envoi illisible">{detailResult.error}</ErrorState>
            ) : !detail || !detailCounts ? (
              <EmptyState icon="mark_email_read">
                Sélectionnez un envoi dans l’historique pour voir le sort de chaque destinataire.
              </EmptyState>
            ) : (
              <>
                <Card padded className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip tone={messageTone(detail.status)} dot>
                        {messageStatusLabels[detail.status]}
                      </Chip>
                      <span className="text-body-sm text-outline">
                        {detail.status === "SCHEDULED"
                          ? `Départ prévu le ${dateLabel(detail.scheduledAt)}`
                          : detail.status === "SENT"
                            ? `Parti le ${dateLabel(detail.dispatchedAt ?? detail.scheduledAt)}`
                            : `Annulé · devait partir le ${dateLabel(detail.scheduledAt)}`}
                        {detail.sender?.fullName ? ` · par ${detail.sender.fullName}` : ""}
                      </span>
                    </div>
                    {detail.status === "SCHEDULED" ? (
                      <ActionButton
                        action={cancelNotification}
                        fields={{ id: detail.id }}
                        label="Annuler l’envoi"
                        confirm="Confirmer l’annulation"
                        tone="danger"
                        icon="cancel_schedule_send"
                      />
                    ) : null}
                  </div>

                  <p className="whitespace-pre-wrap rounded border border-surface-dim bg-surface-container-low/60 px-3 py-2.5 text-body-md leading-relaxed text-on-surface">
                    {detail.body}
                  </p>

                  <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(["SENT", "FAILED", "SKIPPED", "PENDING"] as RecipientStatus[]).map((key) => (
                      <div
                        key={key}
                        className="rounded border border-surface-dim bg-surface-container-lowest px-3 py-2"
                      >
                        <dt className="text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
                          {recipientStatusLabels[key]}
                        </dt>
                        <dd
                          className={`font-display text-headline-sm tnum ${
                            key === "FAILED" && detailCounts[key] > 0
                              ? "text-error"
                              : "text-on-surface"
                          }`}
                        >
                          {grouped(detailCounts[key])}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Card>

                {recipients.length === 0 ? (
                  <EmptyState icon="person_off">
                    Le serveur n’a renvoyé aucun destinataire pour cet envoi.
                  </EmptyState>
                ) : (
                  <>
                    <TableShell minWidth={560}>
                      <thead>
                        <tr>
                          <Th>Destinataire</Th>
                          <Th>Numéro</Th>
                          <Th>Statut</Th>
                          <Th>Remis le / motif</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {recipientListing.rows.map((recipient) => (
                          <RecipientRow key={recipient.id} recipient={recipient} />
                        ))}
                      </tbody>
                    </TableShell>
                    <Pagination
                      page={recipientListing}
                      pathname="/messages"
                      param="rpage"
                      query={{
                        ...currentQuery,
                        page: listing.page > 1 ? String(listing.page) : undefined,
                      }}
                      noun="destinataire"
                    />
                  </>
                )}
              </>
            )}
          </div>
        </section>

        <p className="flex items-center gap-1 text-body-sm text-outline">
          <Icon name="info" size={14} />
          L’historique est limité aux 100 derniers envois par l’API ; un envoi plus ancien reste
          consultable par son lien direct.
        </p>
      </div>
    </>
  );
}
