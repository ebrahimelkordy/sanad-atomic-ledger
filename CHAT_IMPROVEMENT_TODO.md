# تحسين معالجة الأوامر في ChatService و GeminiProvider

## خطة التنفيذ

### ✅ Step 1: تحسين `GeminiProvider.heuristicChatFallback`
- [x] 1.1 تحسين تقسيم الجمل (splitting): دعم "،" و "؛" و "\n" و (وأضف, وسجل, واخصم) كفواصل
- [x] 1.2 تحسين استخراج ADD_INVENTORY: دعم "ضف" بدون ألف، دعم "صدور دجاج" كاسم منتج، دعم SKU
- [x] 1.3 تحسين استخراج SALE/ORDER: استخراج اسم العميل من "للعميل محمود السيد"، استخراج منتجات متعددة الكلمات
- [x] 1.4 تحسين استخراج SETTLEMENT: دعم "مديونية تسوية على" و "سداد دفعة من"
- [x] 1.5 تحسين ADD_EMPLOYEE: دعم علامات تنصيص عربية للاسم
- [x] 1.6 تحسين EMPLOYEE_ADVANCE: دعم "اخصم له سلفة"
- [x] 1.7 إضافة EXPENSE: دعم فاتورة/مصروف/تحويل/فودافون كاش
- [x] 1.8 إضافة RETURN_TO_INVENTORY: دعم رجّع للمخزن
- [x] 1.9 إضافة INVENTORY_WITHDRAWAL: دعم عهدة/مسحوبات

### ✅ Step 2: تعديل `ChatService.confirmAction`
- [x] 2.1 تغيير EMPLOYEE_ADVANCE ليستخدم SettlementService (دفتر الحسابات)
- [x] 2.2 إضافة منطق ADD_CUSTOMER لإنشاء عميل جديد
- [x] 2.3 إضافة EXPENSE handler في confirmAction
- [x] 2.4 إضافة RETURN_TO_INVENTORY handler
- [x] 2.5 إضافة INVENTORY_WITHDRAWAL handler




- [ ] 4.3 (running) اختبار بناء المشروع
