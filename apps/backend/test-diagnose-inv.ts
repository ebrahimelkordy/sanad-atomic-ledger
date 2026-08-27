/**
 * تشخيص سريع: لماذا ADD_INVENTORY يظهر كصنف واحد فقط؟
 * وما هي حقول الكمية التي يستخدمها الموديل بالفعل؟
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: __dirname + '/.env' });

import OpenAI from 'openai';

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY || '',
  baseURL: 'https://api.groq.com/openai/v1',
});

// رسالة بسيطة بمخزون 3 أصناف واضحة
const MESSAGE = `سجل المخزن الجديد:
- 8 كراتين فلاتر زيت هوندا (الكرتونة فيها 12 فلتر، شراء 720 كرتونة، بيع 80 للقطعة، كود FLT-HON-01)
- 4 إطارات ميشلان 185/65/15 (شراء 2300 للإطار، بيع 2800، كود TIR-MIC-185)
- 1 علبة بوشات فرامل تويوتا (12 قطعة في العلبة، شراء العلبة 3600، بيع 400 للقطعة)`;

const SYSTEM = `أنت مساعد لنظام سند. 
قاعدة مهمة جداً: كل منتج له ADD_INVENTORY منفصل — لا تجمع المنتجات في أمر واحد!
مثال: 3 منتجات → 3 ADD_INVENTORY منفصلة.

أرجع JSON:
{
  "intent": "MULTI_ACTION",
  "extractedData": {
    "actions": [
      {
        "intent": "ADD_INVENTORY",
        "description": "اسم المنتج",
        "extractedData": {
          "productName": "...",
          "quantity": <عدد القطع الكلي>,
          "costPrice": <سعر الشراء للقطعة>,
          "salePrice": <سعر البيع للقطعة>,
          "sku": "..."
        }
      }
    ]
  }
}`;

async function main() {
  console.log('=== تشخيص ADD_INVENTORY ===\n');
  
  const resp = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: MESSAGE },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 2000,
  });

  const raw = resp.choices[0].message.content || '{}';
  const parsed = JSON.parse(raw);
  const actions = parsed?.extractedData?.actions || [];

  console.log(`عدد الـ Actions: ${actions.length}`);
  console.log('\n=== ADD_INVENTORY actions تفصيل الحقول ===');
  actions
    .filter((a: any) => a.intent === 'ADD_INVENTORY')
    .forEach((a: any, i: number) => {
      console.log(`\n[${i + 1}] ${a.description}`);
      console.log('  extractedData:', JSON.stringify(a.extractedData, null, 2));
    });

  console.log('\n=== الـ JSON الكامل ===');
  console.log(JSON.stringify(parsed, null, 2));
}

main().catch(console.error);
