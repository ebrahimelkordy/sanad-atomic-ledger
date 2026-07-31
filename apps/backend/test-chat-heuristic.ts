import { GeminiProvider } from './src/ai-orchestrator/gemini.provider';
import { ConfigService } from '@nestjs/config';

const testMessage = `يا باشا سجل عندك بقى شغل النهاردة كله دفعة واحدة عشان نخلص:  أولاً العمالة والحضور: سجل عامل جديد اسمه (عاطف الشرقاوي) وظيفته فني كهرباء، ورقم تليفونه 01198765432. بالنسبة للحضور: الأسطة عاطف ده حضر، وحسن كمال حضر وأخد 3 ساعات أفرتايم، ومحمود جابر غاب بدون إذن واخصم منه يوم، وأبو علي (اللي هو سيف الدين) حضر بس استأذن الساعة 2 العصر، وأخد سلفة 400 جنيه من الخزنة كاش.  ثانياً المخزن والبضاعة: دخلنا شحنة جديدة: 5 كراتين محولات 12 فولت (الكرتونة فيها 10 قطع، سعر شراء الكرتونة 1200 جنيه وسعر بيع القطعة القطاعي 150 جنيه، اعطِ المنتج ده كود PWR-12). وكمان دخلنا 3 أطقم شانيور توتال 750 واط بسعر شراء 1100 وبيع 1400 للواحد.  ثالثاً المسحوبات والهالك: الأسطة عاطف أخد طقم شانيور و2 محول عشان "مشروع فندق الأهرامات"، بس بعد ساعة رجّع محول منهم للمخزن عشان طلع محروق وسحب بداله واحد جديد، وسجل المحول التالف ده في قائمة الهالك/التالف (Scrap).  رابعاً طلبات الخدمة والماليات: افتح طلب خدمة جديد باسم 'صيانة محولات فندق الأهرامات'، التصنيف: صيانات كهرباء، الأولوية: عاجل، عيّن له عاطف كفني رئيسي وسيف مساعد. صرفنا من الخزنة 150 جنيه غداء للعمال في الموقع، وشحنا كارت بنزين لعربية الشغل بـ 200 جنيه. استلمنا من مدير الفندق 'أستاذ سامح' مبلغ 4000 جنيه كاش دفعة تحت الحساب، وعملنا له خصم 200 جنيه بسبب المحول اللي اتأخر، وتستحق باقي الفاتورة 1500 جنيه مؤجل. وأخيراً حولنا للمورد 'شركة التقنية' 3000 جنيه من حساب فودافون كاش سداد جزء من حساب الشحنة القديمة.`;

async function main() {
  const config = new ConfigService();
  const provider = new GeminiProvider(config);
  const tenantContext = {
    tenantId: 'test-tenant-001',
    verticalType: 'RETAIL_WHOLESALE' as const,
  };

  try {
    const result = await (provider as any).heuristicChatFallback(testMessage);
    console.log('\n=========== FINAL RESULT ===========\n');
    console.log('Intent:', result.intent);
    console.log('Requires Confirmation:', result.requiresConfirmation);
    console.log('\nReply:\n');
    console.log(result.reply);
    if (result.extractedData && result.extractedData.actions) {
      console.log('\n\n===== STRUCTURED ACTIONS =====\n');
      for (let i = 0; i < result.extractedData.actions.length; i++) {
        const a = result.extractedData.actions[i];
        console.log(`${i + 1}. [${a.intent}]`);
        console.log(`   Desc: ${a.description}`);
        console.log(`   Data: ${JSON.stringify(a.extractedData, null, 2).split('\n').join('\n         ')}`);
        console.log('');
      }
      console.log(`\nTotal: ${result.extractedData.actions.length} actions`);
    }
  } catch (err: any) {
    console.error('Error:', err.message);
    console.error(err.stack);
  }
}

main().catch(console.error);
