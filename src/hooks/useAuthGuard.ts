"use client";

import { useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

export interface UseAuthGuardOptions {
    redirectTo?: string;
    requiredRole?: string;
}

/**
 * useAuthGuard
 * 
 * Defense-in-depth client-side route guard.
 * If the user's session expires, is invalidated (missing session.user), or lacks requiredRole,
 * automatically redirects them to /login (or /explore on role mismatch) with the target route
 * preserved in the redirect_to query parameter.
 */
export function useAuthGuard(options: UseAuthGuardOptions = {}) {
    const { data: session, status } = useSession();
    const router = useRouter();

    const hasValidUser = Boolean(
        status === "authenticated" &&
        session?.user &&
        (session.user.email || (session.user as any).id)
    );
    const isSessionInvalidated = status === "authenticated" && !hasValidUser;
    const isUnauthenticated = status === "unauthenticated" || isSessionInvalidated;

    useEffect(() => {
        if (isUnauthenticated) {
            const currentPath = typeof window !== "undefined"
                ? `${window.location.pathname}${window.location.search}`
                : "/settings";

            const isSafe = currentPath.startsWith("/") && !currentPath.startsWith("//") && !currentPath.includes("\\");
            const safeRedirect = isSafe ? currentPath : "/explore";
            const destination = options.redirectTo || `/login?redirect_to=${encodeURIComponent(safeRedirect)}`;

            if (isSessionInvalidated) {
                signOut({ redirect: false }).finally(() => {
                    router.push(destination);
                });
            } else {
                router.push(destination);
            }
            return;
        }

        if (hasValidUser && options.requiredRole) {
            const userRole = ((session?.user as any)?.role || "USER").toUpperCase();
            const required = options.requiredRole.toUpperCase();
            const roleAllowed =
                userRole === required ||
                userRole === "SUPER_ADMIN" ||
                (required === "ADMIN" && (userRole === "ADMIN" || userRole === "SUPER_ADMIN"));

            if (!roleAllowed) {
                router.push("/explore");
            }
        }
    }, [isUnauthenticated, isSessionInvalidated, hasValidUser, session, router, options.redirectTo, options.requiredRole]);

    return {
        session: hasValidUser ? session : null,
        status: isSessionInvalidated ? "unauthenticated" : status,
        isLoading: status === "loading",
        isAuthenticated: hasValidUser,
    };
}
