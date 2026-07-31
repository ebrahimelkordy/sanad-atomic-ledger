import * as dotenv from 'dotenv';
dotenv.config({ path: __dirname + '/.env' });

import { ConfigService } from '@nestjs/config';
import { GroqProvider } from './src/ai-orchestrator/groq.provider';

const TEST_MESSAGE = `يا مساعد، السيستم عندنا لسه أبيض ومفيش أي بيانات قديمة خالص. ابدأ معايا من الصفر وسجل الداتا دي بالترتيب واربطها ببعض:  أولاً: تسجيل الحسابات الجديدة:  سجل داعم (متبرع) جديد باسم 'مؤسسة الأمل الخيرية'، رقم التواصل 01000001111.  سجل مقدم خدمة جديد باسم 'دكتور عادل إمام'، تخصصه 'عيون'، ومكانه في 'الدقي'.  سجل مستفيد جديد باسم 'ياسين محمود'، طفل عمره 10 سنين، تصنيفه 'حالة مرضية حرجة'.  سجل موظف/أدمن جديد في فريقنا اسمه 'عمر طارق' واديله صلاحية 'متابعة الطلبات'.  ثانياً: تأسيس المخزن: دخل عندنا منتج جديد لأول مرة: 'نظارة طبية أطفال'، الكمية المتاحة 10 قطع، تكلفة القطعة علينا 400 جنيه.  ثالثاً: فتح الطلبات والربط: افتح طلب 'سند' جديد للمستفيد 'ياسين محمود'، عنوان الطلب 'كشف نظر وعمل نظارة طبية'، التصنيف 'طبي'. اربط الطلب ده بمقدم الخدمة 'دكتور عادل إمام'، وخلي الأدمن 'عمر طارق' هو المسؤول عن متابعة الطلب. واصرف من المخزن 'نظارة طبية أطفال' واحدة للطلب ده.  رابعاً: الحركات المالية: 'مؤسسة الأمل الخيرية' بعتت تبرع جديد بقيمة 10,000 جنيه كاش. خصص من التبرع ده: 400 جنيه لتغطية تكلفة النظارة، و 600 جنيه رسوم كشف تتحول في رصيد 'دكتور عادل إمام'. وباقي مبلغ التبرع (9000 جنيه) ضيفه في حاجة اسمها 'صندوق الحالات الطبية'."`;

const TENANT_CONTEXT = {
  tenantId: 'test-tenant',
  verticalType: 'جمعية خيرية / مؤسسة خيرية / سند',
};

async function main() {
  const config = new ConfigService();
  const provider = new GroqProvider(config);

  console.log('Using AI_PROVIDER configured:', config.get('AI_PROVIDER'));

  const startTime = Date.now();
  const result = await provider.processChat(TEST_MESSAGE, TENANT_CONTEXT);
  console.log('Groq+normalize result received in', (Date.now() - startTime), 'ms');

  console.log('\n=========== FINAL RESULT ===========');
  console.log('intent:', result.intent);
  console.log('requiresConfirmation:', result.requiresConfirmation);

  console.log('\n--- REPLY (user-facing text) ---');
  console.log(result.reply);

  const extracted = result.extractedData;
  const actionsCount = (result.intent === 'MULTI_ACTION' && Array.isArray(extracted['actions'])) ? extracted['actions'].length : 0;
  if (actionsCount > 0) console.log('\n--- NORMALIZED ACTIONS LIST (' + actionsCount + ' actions):');

  const actions = (result.intent === 'MULTI_ACTION' && Array.isArray(extracted['actions']))
    ? extracted['actions'] as any[] : [];
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    console.log(`\n${i + 1}. [${a.intent}] ${a.description}`);
    console.log('   extractedData:', JSON.stringify(a.extractedData, null, 2).split('\n').map((l: string) => '   ' + l).join('\n'));
  }
  console.log('\n=========== DONE ===========');
}

main().catch(e => { console.error(e); process.exit(1); });
