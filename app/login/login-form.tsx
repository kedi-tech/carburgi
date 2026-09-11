"use client";

import { useActionState } from "react";

import { signIn, type LoginState } from "@/app/actions/auth";
import Icon from "@/components/icon";
import { Field, buttonClass, inputClass } from "@/components/ui";

const initialState: LoginState = {};

export default function LoginForm() {
  const [state, action, pending] = useActionState(signIn, initialState);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Numéro de téléphone">
        <input
          name="phoneNumber"
          type="tel"
          autoComplete="username"
          required
          placeholder="+224 6XX XX XX XX"
          className={`${inputClass} h-11 tnum`}
        />
      </Field>

      <Field label="Mot de passe">
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          className={`${inputClass} h-11`}
        />
      </Field>

      {state.error ? (
        <p className="flex items-start gap-2 rounded border border-[#fecaca] bg-error-container px-3 py-2 text-body-sm font-semibold text-on-error-container">
          <Icon name="error" size={18} className="mt-px" />
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className={`${buttonClass("primary")} mt-1 h-11 w-full`}
      >
        <Icon name={pending ? "sync" : "login"} size={18} className={pending ? "animate-spin" : undefined} />
        {pending ? "Connexion…" : "Ouvrir le back-office"}
      </button>
    </form>
  );
}
