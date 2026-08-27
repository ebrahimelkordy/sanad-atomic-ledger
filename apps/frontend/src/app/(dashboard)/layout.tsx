"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarProvider,
  SidebarInset,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Navbar } from "@/components/navbar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const redirectUrl = pathname ? `/login?redirect=${encodeURIComponent(pathname)}` : "/login";
      router.replace(redirectUrl);
    }
  }, [isLoading, isAuthenticated, router, pathname]);

  // أثناء التحقق من المصادقة أو إذا لم يكن المستخدم مسجل دخول، لا نعرض محتوى لوحة التحكم أبداً
  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <span className="text-lg font-bold">س</span>
          </div>
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Navbar />
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}


