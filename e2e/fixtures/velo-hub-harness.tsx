import { createRoot } from 'react-dom/client'
import VeloWorkspaceHub from '../../src/features/velo-hub/VeloWorkspaceHub.tsx'
createRoot(document.getElementById('root')!).render(<VeloWorkspaceHub initialLocale={new URLSearchParams(location.search).get('lang')==='ar'?'ar':'en'} ownerId="a1111111-1111-4111-8111-111111111111" />)
