import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// المسارات المحمية التي تتطلب تسجيل الدخول
const protectedPaths = [
  '/dashboard',
  '/tenants',
  '/orders',
  '/finance',
  '/inventory',
  '/sales',
  '/customers',
  '/employees',
  '/settings',
  '/chat',
];

// المسارات العامة (auth) التي يمكن الوصول إليها بدون تسجيل
const authPaths = ['/login', '/register'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // السماح بالوصول إلى المسار الرئيسي والصفحة الرئيسية
  if (pathname === '/' || pathname === '') {
    return NextResponse.next();
  }

  // التحقق مما إذا كان المسار الحالي يحتاج إلى حماية
  const isProtectedPath = protectedPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  // المسارات العامة للـ auth
  const isAuthPath = authPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  // قراءة التوكن من الـ cookies
  const token = request.cookies.get('cipher_token')?.value;

  // إذا كان المسار محمياً ولا يوجد توكن → إعادة توجيه إلى /login
  if (isProtectedPath && !token) {
    const loginUrl = new URL('/login', request.url);
    // حفظ المسار الأصلي للعودة إليه بعد تسجيل الدخول
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // إذا كان المسار auth (login/register) ويوجد توكن → إعادة توجيه إلى /dashboard
  if (isAuthPath && token) {
    const dashboardUrl = new URL('/tenants', request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // استثناء الملفات الثابتة والـ API routes من المعالجة
    '/((?!_next/static|_next/image|favicon.ico|api/).*)',
  ],
};

