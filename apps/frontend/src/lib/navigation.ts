import {
  LayoutDashboard,
  ShoppingCart,
  BookLock,
  ShieldCheck,
  Package,
  Users,
  Users2,
  MessageSquareCode,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  badge?: string;
  urgent?: boolean;
}

// عناصر السايدبار الكامل (شاشات سطح المكتب + الموبايل)
export const mainItems: NavItem[] = [
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

// روابط الشريط العلوي للشاشات الكبيرة
export const navItems: NavItem[] = [
  { title: "التينانت", url: "/tenants", icon: LayoutDashboard },
  { title: "الأوردرات", url: "/orders", icon: ShoppingCart, badge: "٨" },
  { title: "دفتر الحسابات", url: "/finance", icon: BookLock },
  {
    title: "تسويات بانتظارك",
    url: "/finance",
    icon: ShieldCheck,
    badge: "٣",
    urgent: true,
  },
];

// كل الصفحات المتاحة لشاشات الموبايل (السايدبار الكامل + التينانت)
export const mobileItems: NavItem[] = [
  ...mainItems,
  { title: "التينانت", url: "/tenants", icon: LayoutDashboard },
];

