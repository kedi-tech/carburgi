import { redirect } from "next/navigation";

import LoginForm from "./login-form";
import Icon from "@/components/icon";
import { readAccessToken } from "@/lib/session";

/**
 * The front door. The design system covers the console but not this screen, so
 * it is built from the same parts: dark institutional panel on the left stating
 * what the tool is, light work surface on the right holding the only form.
 */
export default async function LoginPage(props: PageProps<"/login">) {
  const { expired } = await props.searchParams;

  /*
    A signed-in administrator has no business on this screen — unless they were
    sent here because their token was rejected. Without that second condition a
    stale cookie loops: /login bounces to /, / gets a 401 and bounces back.
    `?expired=1` always renders the form, whatever the cookie jar still holds.
  */
  if (!expired && (await readAccessToken())) {
    redirect("/");
  }

  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-primary-container p-10 text-on-primary lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-secondary-container/10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-inverse-surface/40"
        />

        <div className="relative flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded bg-secondary-container">
            <Icon name="local_gas_station" size={22} className="text-on-secondary-fixed" filled />
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-headline-sm font-bold tracking-tight text-white">
              CARBUGUI
            </span>
            <span className="mt-0.5 text-label-sm uppercase tracking-wider text-on-primary-container">
              Back-office administrateur
            </span>
          </span>
        </div>

        <div className="relative max-w-md">
          <h1 className="font-display text-display leading-tight text-white">
            Supervision du réseau de distribution.
          </h1>
          <p className="mt-4 text-body-md leading-relaxed text-on-primary-container">
            Validation des équipes station, arbitrage des signalements usagers, catalogue national
            et consolidation de la disponibilité par zone, opérateur et produit.
          </p>
        </div>

        <ul className="relative flex flex-col gap-2 text-body-sm text-on-primary-container">
          {[
            { icon: "verified", text: "Les équipes station restent en lecture seule jusqu’à validation." },
            { icon: "warning", text: "Les contestations des conducteurs sont regroupées par station." },
            { icon: "map", text: "La couverture est mesurée sur ce que les stations déclarent." },
          ].map((entry) => (
            <li key={entry.icon} className="flex items-center gap-2">
              <Icon name={entry.icon} size={18} className="text-secondary-container" />
              {entry.text}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex items-center justify-center bg-surface px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded bg-secondary-container">
                <Icon name="local_gas_station" size={20} className="text-on-secondary-fixed" filled />
              </span>
              <span className="font-display text-headline-sm text-on-surface">CARBUGUI</span>
            </span>
          </div>

          <h2 className="font-display text-headline-lg text-on-surface">Connexion</h2>
          <p className="mt-1 text-body-md text-outline">
            Accès réservé aux comptes administrateurs.
          </p>

          {expired ? (
            <p className="mt-5 flex items-start gap-2 rounded border border-surface-container-highest bg-surface-container-low px-3 py-2.5 text-body-sm text-on-surface-variant">
              <Icon name="schedule" size={18} className="mt-px text-secondary" />
              Votre session a expiré. Reconnectez-vous pour reprendre là où vous en étiez.
            </p>
          ) : null}

          <div className="mt-6">
            <LoginForm />
          </div>

          <p className="mt-8 border-t border-outline-variant/40 pt-4 text-body-sm leading-relaxed text-outline">
            Les identifiants sont délivrés par l’équipe CARBUGUI. Aucun compte administrateur ne
            peut être créé depuis cette interface.
          </p>
        </div>
      </section>
    </main>
  );
}
