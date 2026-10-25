export type VeloModuleId = 'drive-import' | 'canva-bridge' | 'social-publishing' | 'whatsapp-lead-agent'
export type VeloHubLocale = 'en' | 'ar'
export interface VeloModuleDefinition { id: VeloModuleId; title: Record<VeloHubLocale,string>; description: Record<VeloHubLocale,string> }
export const veloModules: readonly VeloModuleDefinition[] = [
 { id:'drive-import', title:{en:'Google Drive Import',ar:'استيراد Google Drive'}, description:{en:'Review Drive import setup and authorized media selection.',ar:'راجع إعداد الاستيراد واختيار الوسائط المصرّح بها من Drive.'} },
 { id:'canva-bridge', title:{en:'Canva Creative Bridge',ar:'جسر Canva الإبداعي'}, description:{en:'Review creative references and design-to-content workflows.',ar:'راجع مراجع التصميم وسير العمل من التصميم إلى المحتوى.'} },
 { id:'social-publishing', title:{en:'Social Publishing',ar:'النشر على المنصات الاجتماعية'}, description:{en:'Review platform connection status and scheduled publishing queue.',ar:'راجع حالة اتصال المنصات وقائمة المنشورات المجدولة.'} },
 { id:'whatsapp-lead-agent', title:{en:'WhatsApp Lead Agent',ar:'مساعد العملاء عبر واتساب'}, description:{en:'Classify inquiries and preview consent-safe lead routing.',ar:'صنّف الاستفسارات وراجع معاينة آمنة لتوجيه العملاء المحتملين.'} }
]
export function moduleTitle(id: VeloModuleId, locale: VeloHubLocale): string { return veloModules.find(item=>item.id===id)!.title[locale] }
