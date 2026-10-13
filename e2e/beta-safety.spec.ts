import { expect, test, type Page } from '@playwright/test'

const summary = { users:2,drafts:4,approved:1,aiCallsToday:2,publishingEnabled:false,billingEnabled:false,observedAt:'2026-10-13T10:00:00Z',
  operations:{attempts:2,pending:1,errors:0,missingUsage:0,inputTokens:100,outputTokens:200,estimatedUsd:0.0005,committedUsd:0.04,carryoverUsd:0,clientErrors:1,aiEnabled:false,uploadsEnabled:false,dailyCallLimit:5,dailyBudgetUsd:0.1} }

async function fixture(page: Page, component: 'gate' | 'admin' | 'boundary', locale = 'en') {
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort())
  await page.addInitScript(({ summary, locale }) => {
    localStorage.setItem('aasiflow-locale',locale)
    Object.assign(window,{betaAllowed:false,summary,reported:[]})
  }, { summary, locale })
  await page.route('**/src/lib/supabase.ts*',route=>route.fulfill({contentType:'application/javascript',body:`
    export const supabase={rpc(name,payload){
      if(name==='report_runtime_error') window.reported.push(payload);
      return {abortSignal:async()=>({data:name==='beta_access'?window.betaAllowed:name==='owner_monitoring'?window.summary:true,error:null})};
    }};
    export const isSupabaseConfigured=true;
    export const supabaseConfigurationError=null;
    export const isInvitationCallback=false;
  `}))
  const node = component==='admin' ? 'React.createElement(Admin)' : component==='gate' ?
    "React.createElement(Gate,{auth:{loading:false,signOut:async()=>{}},children:React.createElement('p',null,'Protected workspace')})" :
    'React.createElement(Boundary,null,React.createElement(Broken))'
  await page.route('**/src/main.tsx*',route=>route.fulfill({contentType:'application/javascript',body:`
    import React from '/node_modules/.vite/deps/react.js';
    import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    import Locale from '/src/LocaleProvider.tsx';
    import Admin from '/src/AdminDashboard.tsx';
    import Gate from '/src/BetaGate.tsx';
    import Boundary from '/src/RuntimeBoundary.tsx';
    import '/src/styles.css';
    function Broken(){throw new Error('fixture-error');}
    ReactDOM.createRoot(document.getElementById('root'),{onCaughtError:()=>{}}).render(React.createElement(Locale,null,${node}));
  `}))
  await page.goto('/')
}

test('Beta gate denies uninvited access and removes workspace after revocation',async({page})=>{
  await fixture(page,'gate')
  await expect(page.getByRole('alert')).toContainText('active invitation')
  await expect(page.getByText('Protected workspace')).toHaveCount(0)
  await page.evaluate(()=>Object.assign(window,{betaAllowed:true}))
  await page.getByRole('button',{name:'Retry access check'}).click()
  await expect(page.getByText('Protected workspace')).toBeVisible()
  await page.evaluate(()=>{Object.assign(window,{betaAllowed:false});window.dispatchEvent(new Event('focus'))})
  await expect(page.getByRole('alert')).toContainText('active invitation')
  await expect(page.getByText('Protected workspace')).toHaveCount(0)
})

test('Arabic owner monitoring is readable on mobile and keyboard accessible',async({page})=>{
  await fixture(page,'admin','ar')
  await expect(page.locator('html')).toHaveAttribute('dir','rtl')
  await expect(page.getByRole('heading',{name:'مراقبة المالك'})).toBeVisible()
  await expect(page.getByText('تكلفة الذكاء الاصطناعي التقديرية بالدولار')).toBeVisible()
  await expect(page.getByText('الذكاء الاصطناعي متوقف مؤقتًا.')).toBeVisible()
  const refresh=page.getByRole('button',{name:'تحديث',exact:true})
  await refresh.focus();await expect(refresh).toBeFocused();await page.keyboard.press('Enter')
  await expect(page.getByText('الذكاء الاصطناعي متوقف مؤقتًا.')).toBeVisible()
  const box=await refresh.boundingBox();expect(box?.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
})

test('render failure shows Arabic recovery and reports only a fixed code',async({page})=>{
  await fixture(page,'boundary','ar')
  await expect(page.getByRole('heading',{name:'تعذّر عرض مساحة العمل.'})).toBeVisible()
  await expect(page.getByRole('button',{name:'إعادة تحميل مساحة العمل'})).toBeVisible()
  const reports=await page.evaluate(()=>Reflect.get(window,'reported'))
  expect(reports).toEqual([{error_code:'render_failed'}])
  await expect(page.locator('body')).not.toContainText('fixture-error')
})

test('first Beta has no new upload or microphone controls',async({page})=>{
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort())
  await page.goto('/')
  await page.getByRole('button',{name:'Create with AI'}).click()
  await expect(page.getByRole('status')).toContainText('Uploads are paused')
  await expect(page.locator('input[type=file]')).toHaveCount(0)
  await expect(page.getByRole('button',{name:/Record voice/})).toHaveCount(0)
  await expect(page.getByLabel('Target market')).toHaveValue('UAE')
})
