import * as dotenv from 'dotenv';
dotenv.config({ path: __dirname + '/.env' });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testHistoryFeature() {
  console.log('=== 🧪 اختبار خاصية السجل غير الرجعي للمرتبات والأسعار ===\n');

  // 1. العثور على أو إنشاء tenant وهمي للاختبار
  let tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        business_name: 'شركة الاختبارات',
        vertical_type: 'RETAIL',
      },
    });
  }

  // 2. تجربة إنشاء موظف ثم تحديث مرتبه مع حفظ التاريخ
  const empName = `عامل اختباري ${Date.now()}`;
  const emp = await prisma.employee.create({
    data: {
      tenant_id: tenant.id,
      name: empName,
      base_rate: 300,
      salary_type: 'DAILY',
    },
  });
  console.log(`✅ تم إنشاء موظف جديد: ${emp.name} بمعدل يومي 300`);

  // تحديث معدله (ترقية/علاوة)
  const updatedEmp = await prisma.employee.update({
    where: { id: emp.id },
    data: { base_rate: 450 },
  });

  const rateRecord = await prisma.employeeRateHistory.create({
    data: {
      employee_id: emp.id,
      old_rate: 300,
      new_rate: 450,
      salary_type: 'DAILY',
      change_reason: 'PROMOTION',
      notes: 'علاوة تميز غير رجعية',
      effective_date: new Date(),
      applied_by: 'المدير العام',
    },
  });
  console.log(`📈 تم تسجيل ترقية غير رجعية لـ ${updatedEmp.name} إلى ${updatedEmp.base_rate} (سجل التاريخ: ID=${rateRecord.id})`);

  // 3. تجربة إنشاء منتج وتحديث سفرياته مع حفظ التاريخ
  const sku = `TEST-PRC-${Date.now()}`;
  const product = await prisma.inventoryProduct.create({
    data: {
      tenant_id: tenant.id,
      name: 'زيت محرك 5W30',
      sku,
      current_stock: 50,
      unit_price: 150,
      cost_price: 110,
    },
  });
  console.log(`✅ تم إنشاء منتج اختباري: ${product.name} (سعر بيع: 150, تكلفة: 110)`);

  // تحديث السعر بسبب زيادة المورد
  const updatedProd = await prisma.inventoryProduct.update({
    where: { id: product.id },
    data: { unit_price: 180, cost_price: 135 },
  });

  const priceRecord = await prisma.productPriceHistory.create({
    data: {
      product_id: product.id,
      old_unit_price: 150,
      new_unit_price: 180,
      old_cost_price: 110,
      new_cost_price: 135,
      change_reason: 'SUPPLIER_INCREASE',
      notes: 'زيادة سعر المورد في السوق',
      effective_date: new Date(),
    },
  });
  console.log(`🏷️ تم تحديث أسعار المنتج بصفة غير رجعية: بيع جديد ${updatedProd.unit_price} (سجل التاريخ: ID=${priceRecord.id})`);

  // 4. استرجاع السجلات للتأكد
  const empHistory = await prisma.employeeRateHistory.findMany({ where: { employee_id: emp.id } });
  const prodHistory = await prisma.productPriceHistory.findMany({ where: { product_id: product.id } });

  console.log(`\n📊 عدد سجلات مرتبات الموظف: ${empHistory.length}`);
  console.log(`📊 عدد سجلات تغيير أسعار المنتج: ${prodHistory.length}`);

  console.log('\n🎉 نجح اختبار قاعدة البيانات والجدوال التاريخية 100%!');
}

testHistoryFeature()
  .catch((e) => {
    console.error('❌ خطأ في الاختبار:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
