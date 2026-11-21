"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/context/ThemeContext";
import { SearchSessionProvider } from "@/context/SearchSessionContext";
import { WorkspaceProvider } from "@/context/WorkspaceContext";

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider refetchOnWindowFocus={false}>
            <ThemeProvider>
                <SearchSessionProvider>
                    <WorkspaceProvider>
                        {children}
                    </WorkspaceProvider>
                </SearchSessionProvider>
            </ThemeProvider>
        </SessionProvider>
    );
}
