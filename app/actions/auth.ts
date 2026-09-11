"use server";

import { redirect } from "next/navigation";

import { ApiError, adminLogin } from "@/lib/api";
import { clearSession, createSession } from "@/lib/session";

export type LoginState = { error?: string };

/**
 * The console's front door. `POST /admin/auth/login` answers 401 for bad
 * credentials and 403 for an account that is not an admin; both are reported
 * the same way, since telling them apart only helps someone guessing.
 */
export async function signIn(_state: LoginState, formData: FormData): Promise<LoginState> {
  const phoneNumber = String(formData.get("phoneNumber") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!phoneNumber || !password) {
    return { error: "Entrez votre numéro et votre mot de passe." };
  }

  try {
    const result = await adminLogin(phoneNumber, password);
    await createSession(result.accessToken, result.account);
  } catch (caught) {
    if (caught instanceof ApiError && (caught.status === 401 || caught.status === 403)) {
      return { error: "Identifiants incorrects, ou compte sans accès administrateur." };
    }
    if (caught instanceof ApiError) {
      return { error: caught.message };
    }
    return { error: "Connexion impossible pour le moment." };
  }

  // Outside the try: `redirect` works by throwing, and must not be caught here.
  redirect("/");
}

export async function signOut(): Promise<void> {
  await clearSession();
  redirect("/login");
}
