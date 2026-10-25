import type { SocialConnectionState, SocialLocale, SocialPlatform, SocialQueueState } from './types.ts'
const en = {
  title: 'Social publishing', intro: 'Review account connections and manage scheduled publishing jobs.',
  paused: 'Social publishing is not configured. No provider account was contacted.',
  connections: 'Platform connections', queue: 'Publishing queue', refresh: 'Refresh', connect: 'Connect account',
  connected: 'Connected', disconnected: 'Not connected', 'reauthorization-required': 'Reconnect required',
  'not-configured': 'Not configured', error: 'Connection error', account: 'Account', checked: 'Checked',
  empty: 'No scheduled posts in the queue.', scheduled: 'Scheduled', publishing: 'Publishing', published: 'Published',
  failed: 'Failed', cancelled: 'Cancelled', cancel: 'Cancel scheduled post', cancelConfirm: 'Cancel this scheduled post?',
  cancelDone: 'Scheduled post cancelled.', refreshError: 'Could not load social publishing status.',
  actionError: 'The requested action could not be completed.', noAccount: 'No account label provided.',
  platform: 'Platform', time: 'Scheduled time', caption: 'Post', status: 'Status', errorDetail: 'Details',
  safeNote: 'This panel does not publish posts itself. Live publishing depends on a separately configured provider API and server-side queue.',
  unsupported: 'This action is unavailable until the provider connection is configured.',
  instagram: 'Instagram Business', tiktok: 'TikTok', 'youtube-shorts': 'YouTube Shorts',
  snapchat: 'Snapchat', 'google-business': 'Google Business Profile',
  direction: 'Interface language',
}
const ar: typeof en = {
  title: 'النشر عبر المنصات الاجتماعية', intro: 'راجع اتصالات الحسابات وأدر مهام النشر المجدولة.',
  paused: 'النشر الاجتماعي غير مُعدّ. لم يتم الاتصال بأي حساب لدى مزود الخدمة.',
  connections: 'اتصالات المنصات', queue: 'قائمة النشر', refresh: 'تحديث', connect: 'ربط الحساب',
  connected: 'متصل', disconnected: 'غير متصل', 'reauthorization-required': 'يلزم إعادة الربط',
  'not-configured': 'غير مُعدّ', error: 'خطأ في الاتصال', account: 'الحساب', checked: 'آخر فحص',
  empty: 'لا توجد منشورات مجدولة في القائمة.', scheduled: 'مجدول', publishing: 'جارٍ النشر', published: 'تم النشر',
  failed: 'فشل', cancelled: 'أُلغي', cancel: 'إلغاء المنشور المجدول', cancelConfirm: 'هل تريد إلغاء هذا المنشور المجدول؟',
  cancelDone: 'تم إلغاء المنشور المجدول.', refreshError: 'تعذّر تحميل حالة النشر الاجتماعي.',
  actionError: 'تعذّر إكمال الإجراء المطلوب.', noAccount: 'لم يتم توفير اسم الحساب.',
  platform: 'المنصة', time: 'موعد النشر', caption: 'المنشور', status: 'الحالة', errorDetail: 'التفاصيل',
  safeNote: 'هذه اللوحة لا تنشر المحتوى بنفسها. يتطلب النشر الفعلي إعداد واجهة المزود وقائمة انتظار آمنة على الخادم بشكل منفصل.',
  unsupported: 'هذا الإجراء غير متاح حتى يتم إعداد اتصال المزود.',
  instagram: 'إنستغرام للأعمال', tiktok: 'تيك توك', 'youtube-shorts': 'يوتيوب شورتس',
  snapchat: 'سناب شات', 'google-business': 'الملف التجاري على Google',
  direction: 'لغة الواجهة',
}
export function socialLabels(locale: SocialLocale) { return locale === 'ar' ? ar : en }
export function platformLabel(locale: SocialLocale, platform: SocialPlatform) { return socialLabels(locale)[platform] }
export function connectionLabel(locale: SocialLocale, status: SocialConnectionState) { return socialLabels(locale)[status] }
export function queueLabel(locale: SocialLocale, status: SocialQueueState) { return socialLabels(locale)[status] }
