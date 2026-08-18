/**
 * Custom hook for authentication
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  image?: string;
}

export function useAuth() {
  const { data: session, status } = useSession();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      setUser({
        id: session.user.email || '',
        email: session.user.email || '',
        name: session.user.name || undefined,
        image: session.user.image || undefined,
      });
    } else {
      setUser(null);
    }
    setLoading(status === 'loading');
  }, [session, status]);

  const login = useCallback(async () => {
    await signIn();
  }, []);

  const logout = useCallback(async () => {
    await signOut();
  }, []);

  return {
    user,
    isAuthenticated: !!user,
    isLoading: loading,
    login,
    logout,
  };
}
