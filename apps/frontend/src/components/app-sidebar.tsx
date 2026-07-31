"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  LayoutDashboard,
  ShoppingCart,
  BookLock,
  ShieldCheck,
  Package,
  Settings,
  LogOut,
  Users,
  Users2,
  MessageSquareCode,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";

const mainItems = [
  { title: "الرئيسية", url: "/dashboard", icon: LayoutDashboard },
  { title: "المساعد الذكي", url: "/chat", icon: MessageSquareCode, badge: "جديد" },
  { title: "المبيعات والذمم", url: "/sales", icon: ShoppingCart },
  { title: "العملاء", url: "/customers", icon: Users2 },
  { title: "الأوردرات", url: "/orders", icon: ShoppingCart },
  { title: "المخزن", url: "/inventory", icon: Package },
  { title: "الموظفين والعمال", url: "/employees", icon: Users },
  { title: "دفتر الحسابات", url: "/finance", icon: BookLock },
  {
    title: "تسويات بانتظارك",
    url: "/finance",
    icon: ShieldCheck,
    urgent: true,
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const currentPath = usePathname();
  const { logout } = useAuth();
  const router = useRouter();
  const isActive = (path: string) =>
    path === "/dashboard" ? currentPath === "/dashboard" : currentPath.startsWith(path);

  return (
    <Sidebar collapsible="icon" side="right">
      <SidebarHeader className="border-b border-sidebar-border">
        <Link href="/" className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold text-gold-foreground">
            <ShieldCheck className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="flex-1 overflow-hidden">
              <div className="text-base font-bold text-sidebar-foreground">سند</div>
              <div className="truncate text-[10px] text-sidebar-foreground/60">
                سوبرماركت النور
              </div>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>القائمة</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link href={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && (
                        <>
                          <span className="flex-1">{item.title}</span>
                          {item.badge && (
                            <Badge
                              className={`h-5 min-w-5 justify-center px-1.5 text-[10px] ${item.urgent
                                ? "bg-destructive text-destructive-foreground"
                                : "bg-sidebar-primary text-sidebar-primary-foreground"
                                }`}
                            >
                              {item.badge}
                            </Badge>
                          )}
                        </>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="الإعدادات">
              <Link href="/settings">
                <Settings className="h-4 w-4" />
                {!collapsed && <span>الإعدادات</span>}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="خروج" onClick={() => { logout(); router.push('/login'); }}>
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>خروج</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
