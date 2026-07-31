import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Bell, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "لوحة التحكم — سند" },
      { name: "description", content: "غرفة التحكم في محلك: أوردرات، حسابات، تسويات." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardLayout,
});

function DashboardLayout() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-md md:px-6">
            <SidebarTrigger className="shrink-0" />
            <div className="relative hidden max-w-md flex-1 md:block">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="ابحث في الأوردرات، المنتجات، الحسابات..."
                className="h-10 rounded-lg border-border bg-secondary/50 pr-9 text-sm focus-visible:bg-card"
              />
            </div>
            <div className="flex-1 md:hidden" />
            <Button
              variant="ghost"
              size="icon"
              className="relative h-10 w-10 rounded-lg"
              aria-label="الإشعارات"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-2 w-2 animate-pulse-dot rounded-full bg-destructive" />
            </Button>
            <Avatar className="h-9 w-9 border border-border">
              <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                أح
              </AvatarFallback>
            </Avatar>
          </header>
          <main className="flex-1 overflow-x-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
