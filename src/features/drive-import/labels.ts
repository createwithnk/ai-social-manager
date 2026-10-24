import type { DriveImportCode, ImportState } from './types.ts'
const en = {
  title: 'Import from Google Drive', intro: 'Browse your own Drive and select product photos or media. Your 2 TB plan remains with Google.',
  limits: 'Up to 5 files per batch, 10 MiB per file and 25 MiB total. JPG, PNG, WebP, MP4, WebM and supported audio only.',
  prepare: 'Prepare Google Picker', browse: 'Browse Google Drive', import: 'Import selected files', cancel: 'Stop remaining work', clear: 'Clear selection and forget access',
  paused: 'Velo uploads are paused. Selection is available; importing stays disabled until the existing upload controls are approved.',
  privacy: 'Google consent is separate from Velo login. Access stays in memory, expires and is forgotten when this panel closes. Original Drive files are never changed.',
  select: 'Selected files', noFiles: 'No files selected.', loading: 'Working…', ready: 'Google Picker is ready. Use Browse to choose your account and files.',
  imported: 'Imported privately. Refresh the existing Media library to see the files. Posts and approvals were not changed.',
  uncertain: 'An upload result is unconfirmed. Check the Media library before retrying. This panel will not retry it automatically.',
  complete: 'Import finished. Review each file result below.',
  setup: 'Configure the Google Web client, restricted Picker browser key and project number first.',
  sdk: 'Google Picker could not load. Review the approved site policy, browser popup settings and Google setup.',
  consent: 'Google permission was not granted. Choose your own account and allow selected-file access.',
  expired: 'Google access expired. Select the files again through Google Picker.',
  selection: 'Select between 1 and 5 different media files.', unsupported: 'A file is unsupported or its contents do not match its type. Choose supported photos, video or audio.',
  size: 'A file or batch exceeds the existing media limits.', changed: 'A Drive file changed after selection. Select its latest version again.',
  download: 'The selected Drive file could not be read. Check its download permission and connection.',
  signin: 'Sign in to the correct Velo account before importing.', cancelled: 'Stopped. Completed imports remain saved; a current upload may still complete.', unconfirmed: 'Upload unconfirmed. Check the Media library before trying again.',
  selected: 'Selected', downloading: 'Downloading', uploading: 'Saving privately', failed: 'Failed',
}
type Labels = typeof en
const ar: Labels = {
  title: 'استيراد من Google Drive', intro: 'تصفّح Drive الخاص بك واختر صور المنتجات أو الوسائط. تبقى سعة 2 تيرابايت لدى Google.',
  limits: 'حتى 5 ملفات في الدفعة، و10 ميبيبايت لكل ملف و25 ميبيبايت إجمالًا. صور JPG وPNG وWebP وفيديو MP4 وWebM والصوت المدعوم فقط.',
  prepare: 'تجهيز منتقي Google', browse: 'تصفّح Google Drive', import: 'استيراد الملفات المحددة', cancel: 'إيقاف العمل المتبقي', clear: 'مسح التحديد ونسيان الوصول',
  paused: 'رفع الملفات في Velo متوقف مؤقتًا. يمكن التحديد، ويظل الاستيراد معطّلًا حتى اعتماد ضوابط الرفع الحالية.',
  privacy: 'موافقة Google منفصلة عن دخول Velo. يبقى الوصول في الذاكرة وينتهي ويُنسى عند إغلاق اللوحة. لا تُعدّل ملفات Drive الأصلية.',
  select: 'الملفات المحددة', noFiles: 'لم تُحدّد ملفات.', loading: 'جارٍ العمل…', ready: 'منتقي Google جاهز. استخدم التصفّح لاختيار حسابك وملفاتك.',
  imported: 'تم الاستيراد بشكل خاص. حدّث مكتبة الوسائط الحالية لرؤية الملفات. لم تُعدّل المنشورات أو الموافقات.',
  uncertain: 'نتيجة رفع ملف غير مؤكدة. افحص مكتبة الوسائط قبل المحاولة مجددًا. لن تعيد هذه اللوحة المحاولة تلقائيًا.', complete: 'انتهى الاستيراد. راجع نتيجة كل ملف أدناه.',
  setup: 'أعدّ عميل Google للويب ومفتاح المتصفح المقيّد للمنتقي ورقم المشروع أولًا.',
  sdk: 'تعذّر تحميل منتقي Google. راجع سياسة الموقع المعتمدة وإعدادات النوافذ المنبثقة وإعداد Google.',
  consent: 'لم تُمنح صلاحية Google. اختر حسابك واسمح بالوصول إلى الملفات المحددة.', expired: 'انتهى وصول Google. حدّد الملفات مجددًا عبر منتقي Google.',
  selection: 'اختر من ملف واحد إلى 5 ملفات وسائط مختلفة.', unsupported: 'ملف غير مدعوم أو محتواه لا يطابق نوعه. اختر صورًا أو فيديو أو صوتًا مدعومًا.',
  size: 'ملف أو دفعة يتجاوز حدود الوسائط الحالية.', changed: 'تغيّر ملف Drive بعد تحديده. حدّد أحدث نسخة مجددًا.', download: 'تعذّرت قراءة ملف Drive المحدد. افحص إذن التنزيل والاتصال.',
  signin: 'سجّل الدخول إلى حساب Velo الصحيح قبل الاستيراد.', cancelled: 'تم الإيقاف. تبقى الملفات المكتملة محفوظة، وقد يكتمل الرفع الجاري.', unconfirmed: 'الرفع غير مؤكّد. افحص مكتبة الوسائط قبل المحاولة مجددًا.',
  selected: 'محدد', downloading: 'جارٍ التنزيل', uploading: 'جارٍ الحفظ الخاص', failed: 'تعذّر',
}
export function driveLabels(locale: 'en' | 'ar') { return locale === 'ar' ? ar : en }
export function errorLabel(locale: 'en' | 'ar', code: DriveImportCode) { return driveLabels(locale)[code] }
export function stateLabel(locale: 'en' | 'ar', state: ImportState) { const labels = driveLabels(locale); return state === 'imported' ? labels.imported : labels[state] }
