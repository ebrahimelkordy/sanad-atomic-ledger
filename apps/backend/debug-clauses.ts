import { GeminiProvider } from './src/ai-orchestrator/gemini.provider';
import { ConfigService } from '@nestjs/config';

const testMessage = `يا باشا سجل عندك بقى شغل النهاردة كله دفعة واحدة عشان نخلص:  أولاً العمالة والحضور: سجل عامل جديد اسمه (عاطف الشرقاوي) وظيفته فني كهرباء، ورقم تليفونه 01198765432. بالنسبة للحضور: الأسطة عاطف ده حضر، وحسن كمال حضر وأخد 3 ساعات أفرتايم، ومحمود جابر غاب بدون إذن واخصم منه يوم، وأبو علي (اللي هو سيف الدين) حضر بس استأذن الساعة 2 العصر، وأخد سلفة 400 جنيه من الخزنة كاش.  ثانياً المخزن والبضاعة: دخلنا شحنة جديدة: 5 كراتين محولات 12 فولت (الكرتونة فيها 10 قطع، سعر شراء الكرتونة 1200 جنيه وسعر بيع القطعة القطاعي 150 جنيه، اعطِ المنتج ده كود PWR-12). وكمان دخلنا 3 أطقم شانيور توتال 750 واط بسعر شراء 1100 وبيع 1400 للواحد.  ثالثاً المسحوبات والهالك: الأسطة عاطف أخد طقم شانيور و2 محول عشان "مشروع فندق الأهرامات"، بس بعد ساعة رجّع محول منهم للمخزن عشان طلع محروق وسحب بداله واحد جديد، وسجل المحول التالف ده في قائمة الهالك/التالف (Scrap).  رابعاً طلبات الخدمة والماليات: افتح طلب خدمة جديد باسم 'صيانة محولات فندق الأهرامات'، التصنيف: صيانات كهرباء، الأولوية: عاجل، عيّن له عاطف كفني رئيسي وسيف مساعد. صرفنا من الخزنة 150 جنيه غداء للعمال في الموقع، وشحنا كارت بنزين لعربية الشغل بـ 200 جنيه. استلمنا من مدير الفندق 'أستاذ سامح' مبلغ 4000 جنيه كاش دفعة تحت الحساب، وعملنا له خصم 200 جنيه بسبب المحول اللي اتأخر، وتستحق باقي الفاتورة 1500 جنيه مؤجل. وأخيراً حولنا للمورد 'شركة التقنية' 3000 جنيه من حساب فودافون كاش سداد جزء من حساب الشحنة القديمة.`;

const config = new ConfigService();
const provider = new GeminiProvider(config);

const clauses = (provider as any).splitIntoClauses(testMessage);
console.log('TOTAL CLAUSES:', clauses.length);
console.log('====================\n');
clauses.forEach((c: string, i: number) => {
  console.log(`--- Clause #${i + 1} ---`);
  console.log(c);
  console.log('');
  const products = (provider as any).parseInventoryProducts(c);
  if (products.length > 0) {
    console.log('  -> Inventory products:', JSON.stringify(products, null, 2).split('\n').join('\n     '));
  }
  const withdraws = (provider as any).parseMultipleWithdrawalsFromClause(c);
  if (withdraws.length > 0) {
    console.log('  -> Withdrawals:', JSON.stringify(withdraws, null, 2).split('\n').join('\n     '));
  }
  console.log('');
});
