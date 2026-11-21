import { signIn, getCsrfToken } from "next-auth/react";

/**
 * Executes a NextAuth credentials sign-in with protection against concurrent
 * cold-boot CSRF cookie races (?csrf=true) during initial session hydration.
 */
export async function signInCredentialsSafe(email: string, password: string) {
  await getCsrfToken().catch(() => null);

  let res = await signIn("credentials", {
    redirect: false,
    email,
    password,
  });

  if (res?.url?.includes("csrf=true")) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await getCsrfToken().catch(() => null);
    res = await signIn("credentials", {
      redirect: false,
      email,
      password,
    });
  }

  const hasCsrfFailure = Boolean(res?.url?.includes("csrf=true"));
  const error = res?.error || (hasCsrfFailure ? "Session verification timed out. Please try signing in again." : null);
  const ok = Boolean(res?.ok && !error);

  return { res, ok, error };
}
