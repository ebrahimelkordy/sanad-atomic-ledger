# نشر Cipher (Sanad) — Deployment Guide

## 📋 المتطلبات الأساسية

| المتطلب | النسخة | ملاحظات |
|---------|--------|---------|
| Node.js | ≥ 20 | |
| PostgreSQL | ≥ 14 | |
| Redis | ≥ 7 | أو Memurai على ويندوز |
| Docker (optional) | ≥ 24 | للتشغيل بـ docker-compose |

---

## 🐳 1. التشغيل المحلي بـ Docker (أسهل طريقة)

```bash
# 1. نسخ ملف البيئة
cp .env.example .env

# 2. تشغيل كل الخدمات
docker compose up -d

# 3. تشغيل الـ migrations
docker compose exec backend npx prisma migrate deploy
```

الخدمات اللي هتشتغل:
- **PostgreSQL** على port `5432`
- **Redis** على port `6379`
- **Backend (Nest.js)** على port `3001`

---

## 🖥️ 2. التشغيل المحلي بدون Docker

### 2.1 PostgreSQL و Redis
شغل PostgreSQL و Redis محلياً على جهازك.

### 2.2 Backend (Nest.js)

```bash
# نسخ متغيرات البيئة
cp .env.example apps/backend/.env

# تعديل .env حسب إعداداتك

# تثبيت الاعتماديات
npm install

# تشغيل الـ migrations
cd apps/backend
npx prisma generate
npx prisma migrate deploy
cd ../

# تشغيل الباك إند (development mode)
npm run dev:backend
```

### 2.3 Frontend (Next.js)

```bash
# نسخ متغيرات البيئة
cp apps/frontend/.env.example apps/frontend/.env.local

# تعديل NEXT_PUBLIC_API_BASE_URL لو الباك إند مش على localhost:3001

# تشغيل الفرونت إند
npm run dev:frontend
```

الفرونت إند هيكون على: `http://localhost:3000`

---

## ☁️ 3. النشر على السحابة

### 3.1 Frontend → Vercel

1. ارفع الكود على GitHub
2. اربط المستودع بـ Vercel
3. أضف متغير البيئة:
   - `NEXT_PUBLIC_API_BASE_URL` = رابط الباك إند (مثال: `https://cipher-api.onrender.com`)

### 3.2 Backend → Render.com (مجاني)

1. اعمل **New Web Service** واربط المستودع
2. اختار **Docker** كطريقة بناء
3. خلي **Root Directory** فاضي
4. Docker Command: (سيتم استعمال الـ Dockerfile تلقائياً)
5. أضف متغيرات البيئة (شوف `.env.example`)

#### خدمات مجانية إضافية:
- **PostgreSQL**: اعمل Database على Render (مجاني 1GB)
- **Redis**: استخدم [Upstash](https://upstash.com) (مجاني 100MB)

---

## 🔧 4. متغيرات البيئة (Environment Variables)

تحتاج لضبطها في `backend`:

| المتغير | الشرح |
|---------|--------|
| `DATABASE_URL` | رابط قاعدة PostgreSQL |
| `REDIS_HOST` | مضيف Redis |
| `REDIS_PORT` | منفذ Redis |
| `AI_PROVIDER` | مزود AI (`gemini`, `openai`, `local`) |
| `GEMINI_API_KEY` | مفتاح Gemini API |
| `OPENAI_API_KEY` | مفتاح OpenAI API |
| `JWT_SECRET` | مفتاح JWT السري |
| `CORS_ORIGINS` | النطاقات المسموح بها (مفصولة بفاصلة) |
| `PORT` | منفذ الباك إند |

للـ `frontend`:

| المتغير | الشرح |
|---------|--------|
| `NEXT_PUBLIC_API_BASE_URL` | رابط API الباك إند |

---

## ✅ 5. قائمة التأكد قبل النشر (Deployment Checklist)

### ما قبل النشر (Pre-launch)

- [ ] `npx prisma migrate deploy` تم على قاعدة البيانات
- [ ] الاختبارات شغالة: `cd apps/backend && npm test`
- [ ] متغيرات البيئة مضبوطة، مفيش placeholders أو test keys
- [ ] `CORS_ORIGINS` مضبوط عشان يسمح لدومين الفرونت
- [ ] PostgreSQL backup daily مفعل

### المراقبة (Monitoring)

- [ ] تنبيه لو queue backlog زاد عن حد معين
- [ ] تنبيه لو Baileys session انفصلت وفشل reconnect
- [ ] تسجيل logs لمحاولات settlement مرفوضة

### بعد الإطلاق (Post-launch)

- [ ] اختبار E2E: تسجيل تينانت جديد → ربط رقم واتساب → تنفيذ أوردر → تسوية
- [ ] مراجعة أول 24-48 ساعة من logs

---

## 📦 6. أوامر مهمة

```bash
# بناء الباك إند
cd apps/backend && npm run build

# بناء الفرونت إند
cd apps/frontend && npm run build

# تشغيل الاختبارات (باك إند)
cd apps/backend && npm test

# تشغيل migrations
cd apps/backend && npx prisma migrate deploy

# Docker: بناء وإعادة تشغيل
docker compose build backend
docker compose up -d
```

