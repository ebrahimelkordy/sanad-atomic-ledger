'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

// دالة مساعدة لتعيين الكوكي
export function setCookie(name: string, value: string, days = 7) {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

// دالة مساعدة لحذف الكوكي
export function removeCookie(name: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
}

export function clearAuthSession() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('cipher_token');
    removeCookie('cipher_token');
  }
}

interface AuthContextType {
  token: string | null;
  user: { phone_number?: string; role?: string } | null;
  login: (token: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    try {
      const stored = localStorage.getItem('cipher_token');
      if (stored && stored.trim() !== '' && stored !== 'undefined' && stored !== 'null') {
        setToken(stored);
        setCookie('cipher_token', stored);
      } else {
        setToken(null);
        clearAuthSession();
      }
    } catch {
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = (newToken: string) => {
    localStorage.setItem('cipher_token', newToken);
    setCookie('cipher_token', newToken);
    setToken(newToken);
  };

  const logout = () => {
    clearAuthSession();
    setToken(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user: token ? { phone_number: 'التاجر', role: 'تاجر' } : null,
        login,
        logout,
        isAuthenticated: !!token,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

