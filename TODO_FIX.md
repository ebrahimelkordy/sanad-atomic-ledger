# خطة إصلاح مشكلة Middleware و Upstash Redis

## ✅ المهام

### 1. إنشاء middleware.ts في Next.js Frontend
- [x] إنشاء `apps/frontend/src/middleware.ts` لحماية الصفحات على مستوى Server

### 2. تحديث AuthContext لدعم Cookies
- [x] تحديث `apps/frontend/src/lib/auth-context.tsx` لدعم التخزين في Cookies مع localStorage

### 3. تحديث Dashboard Layout
- [x] تحديث `apps/frontend/src/app/(dashboard)/layout.tsx` لتحسين تجربة الـ redirect

### 4. إصلاح إعدادات Upstash Redis في Backend
- [x] تحديث `apps/backend/src/queues/queue.module.ts` لاستخدام REDIS_URL بشكل صحيح

### 5. تحديث next.config.ts
- [x] تم التحقق — الإعدادات الحالية صحيحة (NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3001')

### 6. إضافة متغيرات Upstash Redis إلى `.env`
- [ ] المستخدم بحاجة لإضافة REDIS_URL إلى `apps/backend/.env`

