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

## ☁️ 3. النشر على السحابة (بدون فيزا)

### 3.1 Frontend → Vercel (مجاني — مش محتاج فيزا)

1. ارفع الكود على GitHub (خلصناها ✅)
2. روح على [vercel.com](https://vercel.com) وسجل دخول بـ GitHub
3. اضغط **Add New → Project** واختار `sanad-atomic-ledger`
4. في **Environment Variables**، أضف:
   - `NEXT_PUBLIC_API_BASE_URL` = رابط الباك إند (هتعرفه من الخطوة اللي بعد كده)
5. **Vercel مش محتاج فيزا للـ free tier** — يشتغل على طول

### 3.2 Backend → بدائل مجانية (مش محتاجة فيزا)

#### 🅰️ الطريقة الأولى: Oracle Cloud Free Tier (الأفضل — دائم مجاني)
- مش محتاج فيزا (فقط حساب بريد إلكتروني)
- يعطيك VM مجاني ARM بـ 4 CPUs + 24GB RAM + PostgreSQL تقدر تنصبه بنفسك
- تقدر تنصب Docker وتشغل الـ docker-compose.yml بتاعنا بالكامل
- شرح: [oracle.com/cloud/free](https://www.oracle.com/cloud/free/)

#### 🅱️ الطريقة الثانية: Koyeb (بديل Render — مجاني بدون فيزا)
1. سجل على [koyeb.com](https://koyeb.com) بـ GitHub (مش محتاج فيزا)
2. اعمل **App** جديد من المستودع بتاعنا
3. اختار **Docker** كطريقة بناء
4. أضف متغيرات البيئة
5. خدمة PostgreSQL من Koyeb مجانية 1GB

#### 🅲 الطريقة الثالثة: Fly.io (مجاني بدون فيزا للحسابات الأولى)
1. سجل على [fly.io](https://fly.io) بـ GitHub
2. `flyctl launch` من terminal
3. `flyctl postgres create` لعمل PostgreSQL
4. `flyctl deploy` للباك إند

### 3.3 خدمات مجانية للمساعدة

| الخدمة | الشرح | الرابط |
|--------|-------|--------|
| **Upstash Redis** | Redis مجاني 100MB — مش محتاج فيزا | [upstash.com](https://upstash.com) |
| **Neon.tech** | PostgreSQL مجاني — مش محتاج فيزا | [neon.tech](https://neon.tech) |
| **Aiven** | PostgreSQL مجاني — محتاج فيزا للتفعيل | [aiven.io](https://aiven.io) |

### 3.4 الطريقة الرابعة: Tunnel (Localhost → Internet) — أسهل حاجة للتجربة

لو عايز تختبر المشروع بسرعة من غير ما تنشر على سحابة:

```bash
# شغل الباك إند محلياً (localhost:3001)
cd apps/backend && npm run start:dev

# في Terminal تاني، استخدم bore (بديل ngrok مجاني مفتوح المصدر)
npx bore local 3001 --to bore.pub

# هيطلعلك رابط زي: https://cipher-xxxx.bore.pub
# حط الرابط ده في Vercel كـ NEXT_PUBLIC_API_BASE_URL
```

**أدوات Tunnel مجانية (مش محتاجة فيزا):**
- **bore** — مجاني، مفتوح المصدر، ما فيه أي تسجيل — `npx bore local 3001 --to bore.pub`
- **localtunnel** — مجاني — `npx lt --port 3001`
- **cloudflared** — مجاني من Cloudflare — `cloudflared tunnel --url http://localhost:3001`
- **Ngrok** — مجاني (بس محتاج تسجيل بسيط) — `ngrok http 3001`

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
