# CARBUGUI · Back-office administrateur

The regulator's console: what the network of stations is declaring, consolidated by product, zone
and operator, plus the decisions an administrator takes — validating station teams, arbitrating
drivers' contestations, answering escalated support, and keeping the catalogue.

Next.js 16 (App Router, Turbopack) · React 19 · Tailwind v4. Every call to the Carbugui API runs
on the server, so the admin token never reaches the browser.

## Running it

```bash
npm run dev     # http://localhost:3000
npm run build
npm run lint
```

**Every screen is served by the API.** There is no demonstration mode, no seeded data and no
offline path: what the console shows is what `/admin/*` returned, and a screen with nothing on it
means the network has nothing to show. Point it somewhere else in `.env.local`:

```bash
CARBUGUI_API_URL=https://carbugui.kedi-tech.com/api/v1   # already the default
```

Signing in needs an account whose role is `ADMIN`. `POST /admin/auth/login` refuses anything else
with a 403, which the login screen reports the same way as a wrong password — telling them apart
only helps someone guessing. The **first** administrator is provisioned directly in the database;
every next one is created from Comptes → *Nouvel administrateur*: `POST /admin/accounts/admins`
with a name and a phone number (normalised to `+224` + nine digits in `lib/format.ts`). The
**server generates the password** and returns it once in `data.password`, so the dialog is the
same deliberate dead end as a station's access: the credentials stay on screen until the button
saying they were handed over is pressed, and are never shown again. Every admin has the same
rights — the API has no "super admin".

Reads are isolated per panel (`lib/safe.ts`): a catalogue that fails to load leaves the approval
queue beside it working, and each panel renders the reason it has no data rather than blanking the
page.

**The API rate-limits, so the console reads each list once per page load.** Every read in
`lib/api.ts` is wrapped in React's `cache()`, and the shell and the page below it deliberately make
the *same* unfiltered calls — the sidebar's badge counts and a page's status tabs are counted in
memory rather than fetched per bucket. That is why `fetchAccounts` takes primitives instead of an
options object: `cache()` compares arguments by identity and an object literal would miss every
time. Measured against a counting stub, a page load costs 4 requests (6 on Stations and Catalogue,
which also read the two catalogue tables); before this it cost 10–11 and the API answered `429`.

A `429` is reported in plain language rather than as a bare error code. If you see it, wait a few
seconds before refreshing — hammering *Actualiser* is what provokes it.

**Pagination is the console's, not the API's.** Lists arrive whole and are cut into pages in
`lib/paginate.ts`; the page number rides in the URL (`?page=3`) so it survives a refresh and the
back button, changing a filter lands on page one, and a stale link past the end clamps to the last
page rather than an empty table. Stations page by 20, accounts by 25, signalement clusters by 8,
support threads by 20 — and a link straight to a thread opens it whatever page it sits on.

**Replying in Support is one request.** The transcript (`components/transcript.tsx`) appends the
message optimistically the instant Envoyer — or Enter — is pressed, then swaps in the copy the API
returns. The action deliberately revalidates nothing: the earlier version revalidated the whole
layout, so every reply waited for the entire console to re-render before the agent saw their own
message.

**Messagerie sends SMS, and only to phones that will ring.** `POST /admin/messages` takes bare
`accountIds`; the console resolves an *audience* — every driver, every station team, or both —
against the same `GET /admin/accounts` read the page displays, keeping only `ACTIVE` accounts
that carry a number (the API `SKIP`s the rest, and a pending or suspended team is not someone the
regulator addresses). The count shown on each audience is therefore the list that goes out. The
route caps a call at 1000 ids, so a larger audience is sent as consecutive campaigns rather than
refused. A fourth choice, *Un compte*, sends to one person picked by name, phone or station code
— any driver or team with a number, whatever its status, since telling a suspended team why is
what an individual message is for; the Comptes page's *SMS* button opens the composer on that
account (`/messages?to=<id>`). Sending is two clicks — the second one names the count or the
person — and a successful send clears the draft and the picked recipient. A message can be scheduled
(`scheduledAt`, at least a minute ahead, converted to UTC in the browser because the picker has no
zone) and withdrawn with `PUT /admin/messages/{id}/cancel` until the 60-second scheduler picks it
up. The history is the API's 100 most recent; the detail lists every recipient with `SENT` /
`FAILED` / `SKIPPED` / `PENDING`, failures first. An ADMIN in the list is never addressed — the
server reports it in `wrongRoleIds`, which cannot happen from here since the audience excludes
that role.

**Support is live, two ways.** The open transcript joins the API's WebSocket from the browser with
the same `{ threadId, accountId }` handshake the app uses — no token is involved, so nothing leaves the
server — and *listens only*: a `{ text }` frame on that handshake would post as the usager, so replies
still go through `POST /admin/chat/threads/{id}/messages`. Under the socket, the transcript re-reads
its thread every 5 s (`readThreadMessages`, one request), because the spec does not say which
messages the server broadcasts; both paths merge by id (`lib/chat-live.ts`). The list refreshes
itself when *another* conversation moves: every 20 s `LiveThreads` compares a fingerprint of the
thread list and calls `router.refresh()` on a change — the open thread contributes its status only,
so replying never re-renders the console. Both polls pause while the tab is hidden. Budget: the API
allows 500 requests per 10 minutes per address, and every console read leaves from the server's.

**The station map is Google's.** Each inspection sheet embeds a Google map of the station's
coordinates (Maps Embed API, an iframe — no SDK), which follows the latitude and longitude fields as
they are edited, plus an *Ouvrir dans Google Maps* link. It needs `GOOGLE_MAPS_API_KEY` in
`.env.local`; without one the sheet shows the link alone. The key travels in the iframe URL, so
restrict it by HTTP referrer in Google Cloud. The *catalogue* itself is still imported from
OpenStreetMap — that is the API's data source, and the *Synchroniser OpenStreetMap* button says so.

**One admin-issued access per station.** `POST /admin/stations/{id}/accounts` mints the login
code as the station's slug, and `loginCode` is unique in the schema — so a second call collides
and the live server answers a bodiless `409` (undocumented in the spec). The console offers the
button only while no account is visible for the station, and turns that 409 into a sentence. Several
people on one station is therefore not something this route can do: the issued account is the
*team's* shared login, and further members get their own by registering from the app, which lands
them in Validations attached to the same station. Giving the admin route the ability to mint
distinct codes per person is gap **A9**. Other bodiless statuses (400/403/404/422/5xx) get plain
sentences too, instead of "Erreur NNN".

## The design system

The console is built to `design/carbugui_back_office_core/DESIGN.md`: dark institutional chrome
(a 56px header, a 260px sidebar) framing a light, high-density work surface. The token names in
`app/globals.css` are the ones the design files use — `surface-container-lowest`,
`on-surface-variant`, `secondary-container` — so a class copied out of a design drop means the
same thing here. Outfit carries headline figures, Inter carries everything read in a grid, and
icons are Material Symbols ligatures.

## What is where

| Path | What it does |
| --- | --- |
| `app/login/` | The only public route. Server action → httpOnly cookies |
| `app/(console)/page.tsx` | Accueil: the three queues, coverage, availability per product, zones under tension |
| `app/(console)/validations/` | The approval queue — the one human bottleneck in the product |
| `app/(console)/reports/` | Contestations, grouped by station rather than listed by date |
| `app/(console)/support/` | Escalated conversations: transcript, reply as `AGENT`, close |
| `app/(console)/stations/` | The catalogue plus an inspector: identity, position, conformity, products, access |
| `app/(console)/accounts/` | Every account by role; validate, reactivate, suspend, delete |
| `app/(console)/catalogue/` | Enseignes and zones — the two reference tables everything points at |
| `app/(console)/messages/` | Messagerie: one SMS to drivers, station teams or both; history and per-recipient outcome |
| `app/actions/` | Server actions — the only writes in the app |
| `lib/api.ts` | Every `/admin/*` call, with the token read from the cookie. The only outbound I/O |
| `lib/link.ts` | The account → station heuristic, and why it has to be one |
| `lib/consolidate.ts` | The aggregation the API does not do: rates by zone, by operator, tension |
| `lib/reports.ts` | Clustering contestations by station, with a dominant motive and concordance |
| `lib/stations.ts` | Table filtering, including "périmée", which needs the clock |
| `lib/safe.ts` | Panel-level error isolation; re-throws `redirect()` rather than swallowing it |
| `lib/paginate.ts` | Page-cutting and the "1 … 6 7 8 … 12" window; the API has no pagination of its own |
| `lib/messages.ts` | The audience vocabulary (conducteurs / stations / both) and how it resolves to account ids |

## Four things worth knowing

**A silent station is not a station in rupture.** Most of the catalogue comes from an
OpenStreetMap import and has never had a team declare anything. The console counts those
separately everywhere, and a zone's service rate is computed over the stations that have actually
declared — otherwise the import would drown every real signal.

**The station behind an account is a guess.** `GET /admin/accounts` returns a name, a phone and a
login code, and no station: the link lives in `StationMembership`, which no admin route reads. The
console infers it from the code — the live server mints an account's login code as the station's
slug verbatim (`sonap-116269`), so the match is "code equals slug, or slug plus a suffix" — and labels it as inferred
everywhere it appears, including a banner on the approval queue. It also flags when two accounts
resolve to the same station, which is the case where a careless approval hands control of a public
status to a stranger. This is a stopgap for gap **A2** in `docs/admin-flow.md`, not a design.

**Retaining a contestation documents it, nothing more.** `PUT /admin/reports/{id}` records the
decision and dates it. It does not correct the station's published availability, notify the team,
or feed a reliability score — none of those exist server-side — and the screen says so rather than
implying an effect it cannot deliver.

**There is no admin refresh route.** `/app/auth/refresh` exists for drivers; the admin space has
none. An expired access token therefore ends the session and returns to the login screen with a
notice, rather than being silently renewed.

## What the API still owes this UI

Sized and sequenced in [`../docs/admin-flow.md`](../docs/admin-flow.md); the ones that shape the
console today:

- **A2** — no membership on `Account`, hence the heuristic above.
- **A3** — `StationReport` and `ChatThread` carry bare ids, so both screens join against the
  catalogue and the account list client-side.
- **A4** — no pagination or sorting on any list route. `GET /admin/stations` returns everything in
  one payload; the console pages it client-side, which is fine at 277 stations and worth revisiting
  at the 800 the pilot names.
- **A1** — no route creates an administrator; a new back-office access is a database write.
- **A5 / A6** — no admin read of `SearchEvent` or of `StationActivity` across stations, so demand
  signals and a cross-station audit trail have no source.
- **A8** — accepting a report has no side effect (see above).

## Still absent

**History over time.** Every figure here is "right now": the API exposes no time series, so
trends, repeated ruptures and the tension history the cahier des charges asks for (§6.3) need a
server-side store first.

**Live support.** The WebSocket at the API root pushes chat to the mobile app; this console reads
conversations by request, and says so on the support screen.
