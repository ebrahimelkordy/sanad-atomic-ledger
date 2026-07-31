'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

// دالة مساعدة لتعيين الكوكي
function setCookie(name: string, value: string, days = 7) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

// دالة مساعدة لحذف الكوكي
function removeCookie(name: string) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
}

interface AuthContextType {
  token: string | null;
  user: { phone_number?: string; role?: string } | null;
  login: (token: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    // محاولة قراءة التوكن من localStorage أولاً، ثم من cookies كـ fallback
    const stored = localStorage.getItem('cipher_token');
    if (stored) {
      setToken(stored);
      // مزامنة مع الكوكيز للميدل وير
      setCookie('cipher_token', stored);
    }
  }, []);

  const login = (newToken: string) => {
    localStorage.setItem('cipher_token', newToken);
    setCookie('cipher_token', newToken);
    setToken(newToken);
  };

  const logout = () => {
    localStorage.removeItem('cipher_token');
    removeCookie('cipher_token');
    setToken(null);
    router.push('/login');
  };

  // دائمًا نغلف children بـ Provider حتى لا يحدث خطأ useAuth must be used inside AuthProvider
  // قبل التحميل، القيمة تكون token = null (غير مصادق)
  return (
    <AuthContext.Provider value={{ token, user: token ? { phone_number: 'التاجر', role: 'تاجر' } : null, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
