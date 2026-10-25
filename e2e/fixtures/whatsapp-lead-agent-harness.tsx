import { createRoot } from 'react-dom/client'
import WhatsAppLeadAgent from '../../src/features/whatsapp-lead-agent/WhatsAppLeadAgent.tsx'
const locale = new URLSearchParams(location.search).get('lang') === 'ar' ? 'ar' : 'en'
createRoot(document.getElementById('root')!).render(<main style={{ padding: 12, maxWidth: 1000, margin: '0 auto' }}><WhatsAppLeadAgent initialLocale={locale}/></main>)
