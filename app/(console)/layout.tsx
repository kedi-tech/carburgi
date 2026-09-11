import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/actions/auth";
import Clock from "@/components/console/clock";
import SidebarNav, { type NavGroup } from "@/components/console/sidebar-nav";
import Icon from "@/components/icon";
import { fetchAccounts, fetchReports, fetchStations, fetchThreads } from "@/lib/api";
import { phoneLabel } from "@/lib/format";
import { safe } from "@/lib/safe";
import { readIdentity } from "@/lib/session";

/**
 * The shell: dark institutional chrome — a 56px header and a 260px sidebar —
 * framing a light work surface. Both are fixed, so only the canvas scrolls.
 *
 * The three counters in the sidebar are the whole job of this console: station
 * teams locked out of their dashboard, drivers contesting a published status,
 * and conversations the bot handed over. They are read here, once, rather than
 * on each page.
 */
export default async function ConsoleLayout({ children }: LayoutProps<"/">) {
  // The token is httpOnly and server-only; no session, no console.
  const identity = await readIdentity();
  if (!identity) {
    redirect("/login");
  }

  /*
    Read the four lists whole and count in memory rather than asking the API
    for one filtered count per badge. These are the exact same calls the pages
    below make, so `cache()` in `lib/api.ts` collapses the shell and the page
    into one request each — which is what keeps the console under the API's
    rate limit.
  */
  const [accounts, reports, threads, stations] = await Promise.all([
    safe(() => fetchAccounts()),
    safe(() => fetchReports()),
    safe(() => fetchThreads()),
    safe(() => fetchStations()),
  ]);

  const pendingAccounts = (accounts.data ?? []).filter(
    (account) => account.role === "STATION" && account.status === "PENDING",
  ).length;
  const pendingReports = (reports.data ?? []).filter(
    (report) => report.status === "PENDING",
  ).length;
  const escalatedThreads = (threads.data ?? []).filter(
    (thread) => thread.status === "ESCALATED",
  ).length;
  const stationCount = (stations.data ?? []).length;

  const groups: NavGroup[] = [
    {
      title: "Supervision réseau",
      items: [
        { href: "/", label: "Accueil", icon: "dashboard" },
        {
          href: "/validations",
          label: "Validations",
          icon: "verified",
          badge: { count: pendingAccounts, tone: "amber" },
        },
        {
          href: "/reports",
          label: "Signalements",
          icon: "warning",
          badge: { count: pendingReports, tone: "crimson" },
        },
        {
          href: "/support",
          label: "Support",
          icon: "support_agent",
          badge: { count: escalatedThreads, tone: "slate" },
        },
      ],
    },
    {
      title: "Répertoire & gouvernance",
      items: [
        {
          href: "/stations",
          label: "Stations",
          icon: "local_gas_station",
          meta: stationCount > 0 ? String(stationCount) : undefined,
        },
        { href: "/accounts", label: "Comptes", icon: "manage_accounts" },
        { href: "/catalogue", label: "Catalogue", icon: "layers" },
      ],
    },
    {
      title: "Communication",
      items: [{ href: "/messages", label: "Messagerie", icon: "campaign" }],
    },
  ];

  return (
    <div className="min-h-dvh bg-surface">
      <header className="fixed inset-x-0 top-0 z-50 flex h-header items-center justify-between gap-4 bg-primary-container px-6 text-on-primary shadow-[0_1px_8px_rgba(0,0,0,0.12)]">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded bg-secondary-container">
            <Icon name="local_gas_station" size={20} className="text-on-secondary-fixed" filled />
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-headline-sm font-bold tracking-tight text-white">
              CARBUGUI
            </span>
            <span className="mt-0.5 text-label-sm uppercase tracking-wider text-on-primary-container">
              Back-office administrateur
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-4">
          <Clock />

          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-black">
              <Icon name="person" size={18} className="text-on-primary" />
            </span>
            <span className="hidden flex-col leading-tight sm:flex">
              <span className="text-title-md text-white">
                {identity.fullName ?? "Administrateur"}
              </span>
              <span className="text-label-sm text-on-primary-container">
                {identity.phoneNumber ? phoneLabel(identity.phoneNumber) : "Compte administrateur"}
              </span>
            </span>
          </div>

          <span aria-hidden="true" className="h-6 w-px bg-outline-variant/30" />

          <form action={signOut}>
            <button
              type="submit"
              className="flex items-center gap-1 text-label-md text-on-primary-container transition-colors hover:text-white"
            >
              <Icon name="logout" size={18} />
              <span className="hidden sm:inline">Se déconnecter</span>
            </button>
          </form>
        </div>
      </header>

      <aside className="fixed bottom-0 left-0 top-header z-40 hidden w-sidebar flex-col bg-inverse-surface pb-3 pt-4 text-inverse-on-surface lg:flex">
        <div className="flex-1 overflow-y-auto px-2">
          <SidebarNav groups={groups} />
        </div>
      </aside>

      <div className="pt-header lg:pl-sidebar">
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
