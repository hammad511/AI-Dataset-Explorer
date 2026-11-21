"use client";

import { useSession, signIn, signOut } from "next-auth/react";

export function useAuth() {
    const { data: session, status, update } = useSession();

    const hasValidUser = Boolean(
        status === "authenticated" &&
        session?.user &&
        (session.user.email || (session.user as any).id)
    );

    const user = hasValidUser && session?.user
        ? {
              id: ((session.user as any).id as string) || "",
              name: session.user.name || "",
              email: session.user.email || "",
              role: ((session.user as any).role as string) || "USER",
              instanceId: ((session.user as any).instanceId as string) || "",
          }
        : null;

    return {
        user,
        session: hasValidUser ? session : null,
        status: status === "authenticated" && !hasValidUser ? "unauthenticated" : status,
        isLoading: status === "loading",
        isAuthenticated: hasValidUser,
        isAdmin: user?.role === "ADMIN" || user?.role === "SUPER_ADMIN",
        signIn,
        signOut,
        refreshSession: update,
    };
}

export default useAuth;
