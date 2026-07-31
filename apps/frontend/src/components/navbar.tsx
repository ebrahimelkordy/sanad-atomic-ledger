"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  ShieldCheck,
  Bell,
  LogOut,
  Menu,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { navItems, mobileItems, type NavItem } from "@/lib/navigation";

interface NavbarProps {
  items?: NavItem[];
  showSidebarToggle?: boolean;
}

export function Navbar({ items = navItems, showSidebarToggle = true }: NavbarProps) {
  const currentPath = usePathname();
  const { logout, user } = useAuth();
  const router = useRouter();

  const isActive = (path: string) =>
    path === "/dashboard" ? currentPath === "/dashboard" : currentPath.startsWith(path);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-border/40 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:px-6">
      {/* الجزء الأيمن: زر القائمة الجانبية (إن وجد) + الشعار والروابط للشاشات الكبيرة */}
      <div className="flex items-center gap-4">
        {showSidebarToggle && (
          <SidebarTrigger className="hidden md:flex" />
        )}

        {/* الشعار للزائرين أو الأجهزة المحمولة */}
        <Link href="/" className="flex items-center gap-2 font-bold text-foreground">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold text-gold-foreground">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <span className="text-lg font-bold">سند</span>
        </Link>

        {/* روابط التنقل للشاشات الكبيرة (Desktop Nav) */}
        <nav className="hidden lg:flex items-center gap-1 mr-4">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.url);
            return (
              <Link
                key={item.title}
                href={item.url}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground ${active
                  ? "bg-accent/80 text-accent-foreground font-semibold"
                  : "text-muted-foreground"
                  }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.title}</span>
                {item.badge && (
                  <Badge
                    className={`h-4 min-w-4 justify-center px-1 text-[10px] ${item.urgent
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-primary text-primary-foreground"
                      }`}
                  >
                    {item.badge}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* الجزء الأيسر: الإشعارات، قائمة المستخدم، وزر المحمول */}
      <div className="flex items-center gap-2">
        {/* زر الإشعارات */}
        <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
          <span className="sr-only font-sans">الإشعارات</span>
        </Button>

        {/* قائمة حساب المستخدم */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full border border-border/50">
              <User className="h-5 w-5 text-muted-foreground" />
              <span className="sr-only">قائمة المستخدم</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">
                  {user?.phone_number || "المستخدم"}
                </p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user?.role || "تاجر"}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive cursor-pointer">
              <LogOut className="ml-2 h-4 w-4" />
              <span>تسجيل الخروج</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* زر الملاحة للأجهزة المحمولة (Mobile Drawer) */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="lg:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">فتح القائمة</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72 p-0">
            <SheetHeader className="border-b border-border p-4 text-right">
              <SheetTitle className="flex items-center gap-2 text-right">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold text-gold-foreground">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <span>منصة سند</span>
              </SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-1 p-4">
              {mobileItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.url);
                return (
                  <SheetClose asChild key={item.title}>
                    <Link
                      href={item.url}
                      className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${active
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent text-foreground/80 hover:text-foreground"
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </div>
                      {item.badge && (
                        <Badge
                          className={`h-5 min-w-5 justify-center px-1.5 text-[10px] ${item.urgent
                            ? "bg-destructive text-destructive-foreground"
                            : active
                              ? "bg-background text-foreground"
                              : "bg-muted text-muted-foreground"
                            }`}
                        >
                          {item.badge}
                        </Badge>
                      )}
                    </Link>
                  </SheetClose>
                );
              })}

              <div className="mt-6 border-t border-border pt-4">
                <Button
                  variant="destructive"
                  className="w-full justify-start gap-2"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                  <span>تسجيل الخروج</span>
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
