import * as dotenv from 'dotenv';
dotenv.config({ path: __dirname + '/.env' });

import { ConfigService } from '@nestjs/config';
import { GroqProvider } from './src/ai-orchestrator/groq.provider';

const TEST_MESSAGE = `يا باشا سجل عندك بقى شغل النهاردة كله دفعة واحدة عشان نخلص:  أولاً العمالة والحضور: سجل عامل جديد اسمه (عاطف الشرقاوي) وظيفته فني كهرباء، ورقم تليفونه 01198765432. بالنسبة للحضور: الأسطة عاطف ده حضر، وحسن كمال حضر وأخد 3 ساعات أفرتايم، ومحمود جابر غاب بدون إذن واخصم منه يوم، وأبو علي (اللي هو سيف الدين) حضر بس استأذن الساعة 2 العصر، وأخد سلفة 400 جنيه من الخزنة كاش.  ثانياً المخزن والبضاعة: دخلنا شحنة جديدة: 5 كراتين محولات 12 فولت (الكرتونة فيها 10 قطع، سعر شراء الكرتونة 1200 جنيه وسعر بيع القطعة القطاعي 150 جنيه، اعطِ المنتج ده كود PWR-12). وكمان دخلنا 3 أطقم شانيور توتال 750 واط بسعر شراء 1100 وبيع 1400 للواحد.  ثالثاً المسحوبات والهالك: الأسطة عاطف أخد طقم شانيور و2 محول عشان "مشروع فندق الأهرامات"، بس بعد ساعة رجّع محول منهم للمخزن عشان طلع محروق وسحب بداله واحد جديد، وسجل المحول التالف ده في قائمة الهالك/التالف (Scrap).  رابعاً طلبات الخدمة والماليات: افتح طلب خدمة جديد باسم 'صيانة محولات فندق الأهرامات'، التصنيف: صيانات كهرباء، الأولوية: عاجل، عيّن له عاطف كفني رئيسي وسيف مساعد. صرفنا من الخزنة 150 جنيه غداء للعمال في الموقع، وشحنا كارت بنزين لعربية الشغل بـ 200 جنيه. استلمنا من مدير الفندق 'أستاذ سامح' مبلغ 4000 جنيه كاش دفعة تحت الحساب، وعملنا له خصم 200 جنيه بسبب المحول اللي اتأخر، وتستحق باقي الفاتورة 1500 جنيه مؤجل. وأخيراً حولنا للمورد 'شركة التقنية' 3000 جنيه من حساب فودافون كاش سداد جزء من حساب الشحنة القديمة.`;

const TENANT_CONTEXT = {
  tenantId: 'test-tenant',
  verticalType: 'تجارة / مخازن / صيانة',
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
