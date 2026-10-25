import { useState } from 'react'
import type { Post } from '../../types.ts'
import GoogleDriveImport from '../drive-import/GoogleDriveImport.tsx'
import type { PickerConfig } from '../drive-import/types.ts'
import CanvaCreativeBridge from '../canva-bridge/CanvaCreativeBridge.tsx'
import type { CanvaCatalog } from '../canva-bridge/types.ts'
import SocialPublishingDashboard from '../social-publishing/SocialPublishingDashboard.tsx'
import type { SocialPublishingApi } from '../social-publishing/types.ts'
import WhatsAppLeadAgent from '../whatsapp-lead-agent/WhatsAppLeadAgent.tsx'
import { moduleTitle, veloModules, type VeloHubLocale, type VeloModuleId } from './modules.ts'
import './velo-hub.css'

export interface VeloWorkspaceHubProps {
 ownerId?: string
 posts?: readonly Post[]
 initialLocale?: VeloHubLocale
 driveConfig?: PickerConfig
 driveEnabled?: boolean
 canvaEnabled?: boolean
 canvaCatalog?: CanvaCatalog
 socialEnabled?: boolean
 socialApi?: SocialPublishingApi
}
const text = {
 en:{brand:'VELO WORKSPACE',tagline:'Your tools. One workspace.',intro:'Switch between your connected creative and customer workflows.',modules:'Workspace modules',open:'Open module',status:'Connection and publishing actions remain disabled until explicitly configured.',language:'العربية',back:'All modules',safe:'This hub does not change saved posts, authentication, database schema, or provider permissions.'},
 ar:{brand:'مساحة عمل VELO',tagline:'أدواتك في مساحة واحدة.',intro:'انتقل بين أدوات المحتوى والتصميم والعملاء.',modules:'وحدات مساحة العمل',open:'فتح الوحدة',status:'تبقى الاتصالات وإجراءات النشر معطّلة حتى يتم إعدادها صراحةً.',language:'English',back:'كل الوحدات',safe:'لا تغيّر هذه المساحة المنشورات المحفوظة أو المصادقة أو مخطط قاعدة البيانات أو أذونات المزوّدين.'}
} as const
export default function VeloWorkspaceHub({ ownerId='', posts=[], initialLocale='en', driveConfig, driveEnabled=false, canvaEnabled=false, canvaCatalog, socialEnabled=false, socialApi }: VeloWorkspaceHubProps) {
 const [locale,setLocale]=useState<VeloHubLocale>(initialLocale)
 const [active,setActive]=useState<VeloModuleId|null>(null)
 const t=text[locale]
 return <main className="velo-hub" dir={locale==='ar'?'rtl':'ltr'} lang={locale} data-testid="velo-workspace-hub">
  <header className="velo-hub-header"><div className="velo-hub-brand"><span className="velo-hub-mark" aria-hidden="true">V</span><div><p className="velo-hub-eyebrow">{t.brand}</p><h1>Velo</h1></div></div><button type="button" className="velo-hub-language" data-testid="velo-hub-language" onClick={()=>{setActive(null);setLocale(value=>value==='en'?'ar':'en')}}>{t.language}</button><p className="velo-hub-tagline">{t.tagline}</p><p className="velo-hub-intro">{t.intro}</p></header>
  {active===null ? <section aria-labelledby="velo-hub-modules-title"><div className="velo-hub-section-heading"><h2 id="velo-hub-modules-title">{t.modules}</h2><span>04</span></div><div className="velo-hub-grid">{veloModules.map((module,index)=><article className="velo-hub-card" key={module.id} data-testid={`velo-hub-card-${module.id}`}><div className="velo-hub-card-top"><span className="velo-hub-card-index">{String(index+1).padStart(2,'0')}</span><span className="velo-hub-card-dot" aria-hidden="true" /></div><h3>{module.title[locale]}</h3><p>{module.description[locale]}</p><button type="button" data-testid={`velo-hub-open-${module.id}`} onClick={()=>setActive(module.id)}>{t.open}<span aria-hidden="true"> ↗</span></button></article>)}</div><p className="velo-hub-safe">{t.safe}</p></section> : <section className="velo-hub-active" data-testid="velo-hub-active-panel"><div className="velo-hub-active-heading"><button type="button" className="velo-hub-back" data-testid="velo-hub-back" onClick={()=>setActive(null)}>← {t.back}</button><h2>{moduleTitle(active,locale)}</h2></div>{active==='drive-import'&&<GoogleDriveImport ownerId={ownerId} config={driveConfig??{clientId:'',apiKey:'',projectNumber:''}} enabled={Boolean(driveEnabled&&driveConfig)} locale={locale}/ >}{active==='canva-bridge'&&<CanvaCreativeBridge ownerId={ownerId} posts={posts} enabled={canvaEnabled} catalog={canvaCatalog} locale={locale}/ >}{active==='social-publishing'&&<SocialPublishingDashboard enabled={Boolean(socialEnabled&&socialApi)} api={socialApi} locale={locale}/ >}{active==='whatsapp-lead-agent'&&<WhatsAppLeadAgent initialLocale={locale}/ >}<p className="velo-hub-safe">{t.status}</p></section>}
 </main>
}
