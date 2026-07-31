import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  ShieldCheck,
  MessageCircle,
  Package,
  BookLock,
  Zap,
  CheckCircle2,
  ArrowLeft,
  Sparkles,
  Lock,
  HeadphonesIcon,
  DatabaseBackup,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "سند — بوت واتساب ذكي لأوردراتك وحساباتك" },
      {
        name: "description",
        content:
          "بوت واتساب AI يرد على عملاءك، ينفّذ أوردراتك على المخزون الحي، ويمسك دفتر حساباتك بأمان — سند حقيقي لمحلك.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <Hero />
      <TrustStrip />
      <HowItWorks />
      <FeatureShowcase />
      <Pricing />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold tracking-tight">سند</span>
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          <a href="#how" className="text-sm text-muted-foreground transition hover:text-foreground">
            كيف يشتغل
          </a>
          <a href="#features" className="text-sm text-muted-foreground transition hover:text-foreground">
            المميزات
          </a>
          <a href="#pricing" className="text-sm text-muted-foreground transition hover:text-foreground">
            الأسعار
          </a>
          <a href="#faq" className="text-sm text-muted-foreground transition hover:text-foreground">
            الأسئلة الشائعة
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/dashboard"
            className="hidden text-sm text-muted-foreground transition hover:text-foreground sm:inline"
          >
            دخول
          </Link>
          <Button asChild size="sm" className="rounded-lg">
            <Link to="/dashboard">جرّب مجانًا</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="gradient-hero relative overflow-hidden">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 md:grid-cols-2 md:py-28">
        <div className="flex flex-col justify-center">
          <Badge
            variant="secondary"
            className="mb-6 w-fit gap-1.5 border border-primary/20 bg-primary-soft px-3 py-1 text-primary"
          >
            <Sparkles className="h-3.5 w-3.5" />
            جديد · مدعوم بالذكاء الاصطناعي
          </Badge>
          <h1 className="text-4xl font-bold leading-[1.15] tracking-tight md:text-6xl">
            بوت واتساب يرد على عملاءك <br />
            <span className="text-gradient-brand">وانت مركّز في محلك</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg text-muted-foreground">
            سند يستقبل أوردرات عملاءك من واتساب، ينفّذها على المخزون الحي، ويمسك دفتر حساباتك
            بأمان تام — مفيش أوردر يضيع، ومفيش قرش يخش أو يخرج من غير ما يتسجّل.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="h-12 rounded-lg px-6 text-base shadow-lg shadow-primary/20">
              <Link to="/dashboard">
                ابدأ 14 يوم مجاني
                <ArrowLeft className="mr-2 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="h-12 rounded-lg px-6 text-base">
              شاهد الديمو · 60 ثانية
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-success" />
              مفيش بطاقة ائتمان
            </div>
            <div className="flex items-center gap-1.5">
              <Lock className="h-4 w-4 text-primary" />
              رقم واتساب مشفّر
            </div>
            <div className="flex items-center gap-1.5">
              <DatabaseBackup className="h-4 w-4 text-primary" />
              نسخ احتياطي يومي
            </div>
          </div>
        </div>

        <div className="relative flex items-center justify-center">
          <PhoneMockup />
        </div>
      </div>
    </section>
  );
}

function PhoneMockup() {
  return (
    <div className="relative">
      <div className="absolute -inset-8 -z-10 rounded-[3rem] bg-gradient-to-br from-primary/20 via-transparent to-gold/20 blur-2xl" />
      <div className="w-[320px] rounded-[2rem] border-8 border-foreground/90 bg-foreground/90 p-2 shadow-2xl">
        <div className="overflow-hidden rounded-2xl bg-[#e5ddd5]">
          <div className="flex items-center gap-3 bg-primary px-4 py-3 text-primary-foreground">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-foreground/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold">سوبرماركت النور</div>
              <div className="flex items-center gap-1.5 text-[10px] opacity-80">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-dot" />
                متصل الآن
              </div>
            </div>
          </div>
          <div className="space-y-2 p-3">
            <ChatBubble side="right">أهلاً، عايز 2 كيلو سكر و 1 زيت عين.</ChatBubble>
            <ChatBubble side="left" delay>
              أهلاً بيك 🌿 <br />
              تمام، طلبك:
              <br />
              • سكر ٢ كيلو — ٧٠ ج<br />
              • زيت عين ١ لتر — ٩٥ ج<br />
              <strong>الإجمالي: ١٦٥ ج</strong>
              <br />
              تحب تأكّد؟
            </ChatBubble>
            <ChatBubble side="right">أكّد.</ChatBubble>
            <ChatBubble side="left" delay>
              ✅ اتسجّل الأوردر رقم <strong>#١٠٢٣</strong>
              <br />
              هيوصلك خلال ٣٠ دقيقة.
            </ChatBubble>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({
  children,
  side,
  delay,
}: {
  children: React.ReactNode;
  side: "left" | "right";
  delay?: boolean;
}) {
  const isLeft = side === "left";
  return (
    <div
      className={`flex ${isLeft ? "justify-start" : "justify-end"} animate-slide-in-top`}
      style={delay ? { animationDelay: "0.2s" } : undefined}
    >
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed shadow-sm ${
          isLeft
            ? "rounded-tr-sm bg-white text-foreground"
            : "rounded-tl-sm bg-[#dcf8c6] text-foreground"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function TrustStrip() {
  return (
    <section className="border-y border-border/60 bg-secondary/40">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-8 px-6 py-8">
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 animate-pulse-dot rounded-full bg-success" />
          <div>
            <div className="tabular text-2xl font-bold text-foreground">١٢,٤٨٧</div>
            <div className="text-xs text-muted-foreground">أوردر تم معالجته اليوم</div>
          </div>
        </div>
        <Divider />
        <Stat value="+٥٠٠" label="محل شغّال دلوقتي" />
        <Divider />
        <Stat value="٩٩.٩٪" label="جاهزية الخدمة" />
        <Divider />
        <Stat value="< ٢ث" label="متوسط سرعة الرد" />
        <Divider />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <HeadphonesIcon className="h-4 w-4 text-primary" />
          دعم مصري ٢٤/٧
        </div>
      </div>
    </section>
  );
}

function Divider() {
  return <div className="hidden h-8 w-px bg-border md:block" />;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="tabular text-2xl font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "١",
      icon: MessageCircle,
      title: "اربط رقم الواتساب",
      body: "امسح QR code واحد وخلاص — رقمك المعتاد يبقى قناة البيع.",
    },
    {
      n: "٢",
      icon: Package,
      title: "ضيف منتجاتك ومخزونك",
      body: "ارفع Excel أو أضف يدوي بسرعة. أسعارك ومخزونك في مكان واحد.",
    },
    {
      n: "٣",
      icon: Zap,
      title: "البوت يبيع تلقائيًا",
      body: "عميلك يطلب على واتساب، البوت يرد، ينفّذ، ويسجّل الحركة في دفترك.",
    },
  ];
  return (
    <section id="how" className="mx-auto max-w-7xl px-6 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <Badge variant="outline" className="mb-4 border-primary/30 text-primary">
          ٣ خطوات
        </Badge>
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          من الصفر لأول أوردر في ١٠ دقايق
        </h2>
        <p className="mt-4 text-muted-foreground">من غير تعقيد، من غير تركيب، من غير مبرمج.</p>
      </div>

      <div className="mt-14 grid gap-6 md:grid-cols-3">
        {steps.map((s, i) => (
          <div key={i} className="card-elevated p-8">
            <div className="flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <s.icon className="h-6 w-6" />
              </div>
              <div className="tabular text-5xl font-bold text-primary/10">{s.n}</div>
            </div>
            <h3 className="mt-6 text-xl font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FeatureShowcase() {
  const items = [
    {
      icon: BookLock,
      title: "دفتر حسابات لا يُمحى",
      body: "كل قرش يخش أو يخرج مسجّل بقيد مالي دائم. مفيش تعديل، مفيش مسح — تصحيح الغلط بقيد عكسي زي المحاسبة الحقيقية.",
      tag: "Append-Only",
    },
    {
      icon: ShieldCheck,
      title: "تسويات بتأكيد إلزامي",
      body: "أي أمر تسوية مالية من الواتساب بيوقف عندك للمراجعة. مفيش قرار مالي يتنفّذ من غير ضغطة زرار منك.",
      tag: "Two-Step",
    },
    {
      icon: MessageCircle,
      title: "الرسالة الأصلية دايمًا محفوظة",
      body: "لكل أوردر ولكل قيد مالي، تقدر ترجع بضغطة زرار للرسالة الأصلية اللي جت من الواتساب. Audit trail كامل.",
      tag: "Full Trace",
    },
    {
      icon: Package,
      title: "مخزون حي، لحظة بلحظة",
      body: "لما البوت يبيع، المخزون بينزل تلقائيًا. تنبيه فوري لما منتج يقرب يخلص.",
      tag: "Real-time",
    },
  ];
  return (
    <section id="features" className="border-y border-border/60 bg-secondary/30 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="outline" className="mb-4 border-gold/40 text-gold-foreground">
            مبني للثقة
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            حاجات محدش غيرنا بيعملها زينا
          </h2>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {items.map((it, i) => (
            <Card
              key={i}
              className="group relative overflow-hidden border-border bg-card p-8 transition hover:shadow-lift"
            >
              <div className="flex items-start gap-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <it.icon className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">{it.title}</h3>
                    <Badge className="bg-gold/15 text-gold-foreground hover:bg-gold/20">
                      {it.tag}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{it.body}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const plans = [
    {
      name: "المبتدئ",
      price: "٢٩٩",
      desc: "لمحل صغير بيبدأ",
      features: ["حتى ٥٠٠ أوردر/شهر", "منتجات غير محدودة", "دفتر حسابات كامل", "دعم عبر البريد"],
      cta: "ابدأ مجانًا",
      featured: false,
    },
    {
      name: "المحترف",
      price: "٧٩٩",
      desc: "للأنشطة النشطة",
      features: [
        "حتى ٣٠٠٠ أوردر/شهر",
        "تسويات مالية بالـ AI",
        "تنبيهات مخزون ذكية",
        "دعم واتساب سريع",
        "٣ مستخدمين",
      ],
      cta: "الأكثر اختيارًا",
      featured: true,
    },
    {
      name: "المؤسسات",
      price: "خاص",
      desc: "لسلاسل المحلات",
      features: ["أوردرات غير محدودة", "فروع متعددة", "API مخصّص", "مدير حساب مخصّص"],
      cta: "تواصل معنا",
      featured: false,
    },
  ];
  return (
    <section id="pricing" className="mx-auto max-w-7xl px-6 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">أسعار واضحة، بدون مفاجآت</h2>
        <p className="mt-4 text-muted-foreground">
          جرّب ١٤ يوم مجانًا. مفيش بطاقة ائتمان مطلوبة، الغِ في أي وقت.
        </p>
      </div>

      <div className="mt-14 grid gap-6 md:grid-cols-3">
        {plans.map((p, i) => (
          <div
            key={i}
            className={`relative rounded-2xl border p-8 transition ${
              p.featured
                ? "border-gold/40 bg-card shadow-lift ring-1 ring-gold/30 md:-translate-y-3"
                : "border-border bg-card shadow-card hover:shadow-lift"
            }`}
          >
            {p.featured && (
              <Badge className="absolute -top-3 right-6 bg-gold text-gold-foreground hover:bg-gold">
                الأكثر شيوعًا
              </Badge>
            )}
            <div className="text-sm font-medium text-muted-foreground">{p.name}</div>
            <div className="mt-1 text-xs text-muted-foreground">{p.desc}</div>
            <div className="mt-6 flex items-baseline gap-2">
              <span className="tabular text-5xl font-bold">{p.price}</span>
              {p.price !== "خاص" && <span className="text-sm text-muted-foreground">ج/شهر</span>}
            </div>
            <ul className="mt-6 space-y-3 text-sm">
              {p.features.map((f, j) => (
                <li key={j} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button
              className={`mt-8 h-11 w-full rounded-lg ${
                p.featured ? "bg-primary text-primary-foreground shadow-md" : ""
              }`}
              variant={p.featured ? "default" : "outline"}
              asChild
            >
              <Link to="/dashboard">{p.cta}</Link>
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

function FAQ() {
  const qs = [
    {
      q: "هل رقم الواتساب بتاعي آمن؟",
      a: "نعم. رقمك مشفّر ومحفوظ في جلسة معزولة خاصة بيك بس. مفيش حد يوصله ولا يقرأ رسايلك، والاتصال مع واتساب end-to-end encrypted.",
    },
    {
      q: "هل أقدر أعدّل قيد مالي غلط؟",
      a: "لا — وده مقصود. دفتر سند append-only زي المحاسبة الحقيقية: تصحيح الغلط بقيد عكسي جديد، عشان تفضل عندك تاريخ كامل وصادق لكل حركة.",
    },
    {
      q: "لو البوت فهم أوردر غلط؟",
      a: "كل رسالة بتتخزن كاملة مع القيد. ولو الأمر مالي (زي تسوية دين)، البوت مش هيسجّل حاجة إلا بعد تأكيد صريح منك من الداشبورد.",
    },
    {
      q: "هل يشتغل مع كل الأنشطة؟",
      a: "متخصّصين في محلات البيع (سوبرماركت، صيدلية، مطعم) في السوق المصري بالتحديد — الأسعار بالجنيه، الواجهة عربي RTL، والدعم مصري.",
    },
  ];
  return (
    <section id="faq" className="border-y border-border/60 bg-secondary/30 py-24">
      <div className="mx-auto max-w-3xl px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">أسئلة بتتسأل كتير</h2>
        <div className="mt-12 space-y-3">
          {qs.map((item, i) => (
            <details
              key={i}
              className="group card-elevated overflow-hidden p-0"
            >
              <summary className="flex cursor-pointer items-center justify-between p-6 text-base font-semibold">
                {item.q}
                <span className="text-xl text-primary transition group-open:rotate-45">+</span>
              </summary>
              <p className="px-6 pb-6 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24">
      <div className="relative overflow-hidden rounded-3xl bg-primary p-12 text-primary-foreground md:p-20">
        <div className="bg-grid-soft absolute inset-0 opacity-30" />
        <div className="relative mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
            محلك يستاهل سند حقيقي
          </h2>
          <p className="mt-4 text-lg opacity-90">
            انضم لأكتر من ٥٠٠ صاحب محل بيبيعوا وينظّموا حساباتهم من غير مجهود.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              asChild
              size="lg"
              className="h-12 rounded-lg bg-gold px-8 text-base text-gold-foreground shadow-lg hover:bg-gold/90"
            >
              <Link to="/dashboard">
                ابدأ ١٤ يوم مجاني
                <ArrowLeft className="mr-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="mt-6 text-xs opacity-80">مفيش بطاقة ائتمان · الغِ في أي وقت</div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 md:flex-row">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <span className="font-semibold text-foreground">سند</span>
          <span>· © ٢٠٢٦</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5 text-success" />
          آخر نسخة احتياطية: من ساعة
        </div>
      </div>
    </footer>
  );
}
