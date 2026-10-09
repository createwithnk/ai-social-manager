const assert = require('node:assert/strict');
const fs = require('node:fs');
// This is a local widget double, not Cloudflare verification or Supabase server enforcement.
const widgetScript = `(() => {
 const test=window.__captchaFixture={widgets:[],serial:0};
 window.turnstile={ready:callback=>callback(),render:(element,options)=>{
   const id='isolated-'+(++test.serial);
   const text=document.createElement('div');text.textContent='Isolated widget fixture';
   text.style.cssText='width:150px;height:140px;display:grid;place-content:center;background:#eef2ff;color:#24304b;border:1px solid #b9c3d9';
   element.replaceChildren(text);test.widgets.push({id,options,element,removed:false});return id;
 },remove:id=>{const widget=test.widgets.find(value=>value.id===id);if(widget){widget.removed=true;widget.element.replaceChildren()}}};
})();`;
const currentWidget = page => page.evaluate(() => window.__captchaFixture.widgets.filter(widget=>!widget.removed).at(-1)?.id);
const waitWidget = (page,previous) => page.waitForFunction(old => {
  const current=window.__captchaFixture?.widgets.filter(widget=>!widget.removed).at(-1);
  return current && current.id!==old;
},previous);
const callback = (page,id,kind='callback',token=`proof-${id}`) => page.evaluate(({id,kind,token}) => {
  window.__captchaFixture.widgets.find(widget=>widget.id===id).options[kind](token);
},{id,kind,token});
const checkLayout = async page => assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);

module.exports = async function captchaTests(browser,base) {
  const context = await browser.newContext({locale:'en-US',viewport:{width:360,height:800}});
  const page = await context.newPage();const errors=[],blocked=[],requests=[];
  let scriptAttempts=0,failNextScript=false,stallNextScript=false;
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===base)return route.continue();
    if(url.origin==='https://challenges.cloudflare.com' && url.pathname==='/turnstile/v0/api.js' && url.search==='?render=explicit') {
      scriptAttempts++;
      if(failNextScript){failNextScript=false;return route.abort('failed')}
      if(stallNextScript){stallNextScript=false;return route.fulfill({contentType:'application/javascript',body:widgetScript.replace('ready:callback=>callback()','ready:()=>{}')})}
      return route.fulfill({contentType:'application/javascript',body:widgetScript});
    }
    if(url.origin!=='https://fixture.supabase.co'){blocked.push(url.toString());return route.fulfill({status:403,body:'Blocked by test'})}
    const headers={'Access-Control-Allow-Origin':base};
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-supabase-api-version'}});
    const body=request.postDataJSON();requests.push({path:url.pathname,query:url.search,body});
    if(url.pathname==='/auth/v1/token')return route.fulfill({status:400,json:{code:'invalid_credentials',msg:'Invalid login credentials'},headers});
    if(url.pathname==='/auth/v1/signup')return route.fulfill({json:{user:{id:'a1111111-1111-4111-8111-111111111111',email:'fixture@example.invalid'},session:null},headers});
    if(['/auth/v1/recover','/auth/v1/resend'].includes(url.pathname))return route.fulfill({json:{},headers});
    blocked.push(url.toString());return route.fulfill({status:404,body:'Unexpected request',headers});
  });
  try {
    await page.goto(base);await waitWidget(page);
    await page.getByLabel('Email',{exact:true}).fill('fixture@example.invalid');
    await page.getByLabel('Password',{exact:true}).fill('fixture passphrase only');
    assert.equal(await page.getByRole('button',{name:'Log in',exact:true}).isDisabled(),true);
    // Even direct form submission must not bypass the proof check.
    await page.locator('form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    assert.equal(requests.length,0);
    let id=await currentWidget(page);await callback(page,id,'callback','');
    assert.equal(await page.getByRole('button',{name:'Log in',exact:true}).isDisabled(),true);
    await callback(page,id,'callback','x'.repeat(2049));
    assert.equal(await page.getByRole('button',{name:'Log in',exact:true}).isDisabled(),true);
    await callback(page,id);await page.getByRole('button',{name:'Log in',exact:true}).click();
    await waitWidget(page,id);
    assert.equal(requests.at(-1).path,'/auth/v1/token');
    assert.equal(requests.at(-1).body.gotrue_meta_security.captcha_token,`proof-${id}`);
    assert.equal(await page.getByRole('button',{name:'Log in',exact:true}).isDisabled(),true,'Failed login consumes client proof');
    // Old callbacks cannot restore a proof after the keyed widget was removed.
    await callback(page,id);assert.equal(await page.getByRole('button',{name:'Log in',exact:true}).isDisabled(),true);
    id=await currentWidget(page);await callback(page,id);await callback(page,id,'expired-callback');
    await page.getByText('Verification expired. Retry verification.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Log in',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Retry verification',exact:true}).click();await waitWidget(page,id);
    id=await currentWidget(page);await callback(page,id);await callback(page,id,'timeout-callback');
    assert.equal(await page.getByRole('button',{name:'Log in',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Retry verification',exact:true}).click();await waitWidget(page,id);
    id=await currentWidget(page);await callback(page,id);await callback(page,id,'error-callback');
    await page.getByText('Bot verification could not load. Retry verification.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Log in',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Retry verification',exact:true}).click();await waitWidget(page,id);
    id=await currentWidget(page);await callback(page,id);
    await page.getByRole('combobox',{name:'Interface language',exact:true}).selectOption('ar');await waitWidget(page,id);
    assert.equal(await page.getByLabel('البريد الإلكتروني',{exact:true}).inputValue(),'fixture@example.invalid');
    assert.equal(await page.getByLabel('كلمة المرور',{exact:true}).inputValue(),'fixture passphrase only');
    assert.equal(await page.getByRole('button',{name:'تسجيل الدخول',exact:true}).isDisabled(),true,'Locale changes invalidate the proof');
    const arabicWidget=await page.evaluate(()=>window.__captchaFixture.widgets.filter(widget=>!widget.removed).at(-1).options);
    assert.equal(arabicWidget.language,'ar');assert.equal(arabicWidget.size,'compact');
    await checkLayout(page);fs.mkdirSync('/tmp/aasiflow-qa',{recursive:true});
    await page.screenshot({path:'/tmp/aasiflow-qa/arabic-mobile-captcha.png',fullPage:true});
    id=await currentWidget(page);await page.getByRole('combobox',{name:'لغة الواجهة',exact:true}).selectOption('en');await waitWidget(page,id);
    await page.setViewportSize({width:1440,height:1000});await checkLayout(page);
    await page.screenshot({path:'/tmp/aasiflow-qa/english-desktop-captcha.png',fullPage:true});
    id=await currentWidget(page);await callback(page,id);
    await page.getByRole('button',{name:'Need an account? Sign up'}).click();await waitWidget(page,id);
    assert.equal(await page.getByRole('button',{name:'Sign up',exact:true}).isDisabled(),true,'Mode changes invalidate the proof');
    id=await currentWidget(page);await callback(page,id);
    await page.getByLabel('Password',{exact:true}).fill('short');await page.getByRole('button',{name:'Sign up',exact:true}).click();
    assert.equal(requests.filter(request=>request.path==='/auth/v1/signup').length,0);
    await page.getByLabel('Password',{exact:true}).fill('fixture passphrase only');await page.getByRole('button',{name:'Sign up',exact:true}).click();
    await page.getByText('Check your email to confirm your account, then sign in.',{exact:true}).waitFor();await waitWidget(page,id);
    const signup=requests.find(request=>request.path==='/auth/v1/signup');
    assert.equal(signup.body.gotrue_meta_security.captcha_token,`proof-${id}`);
    assert.equal(new URLSearchParams(signup.query).get('redirect_to'),`${base}/?flow=confirmed`);assert.equal(signup.body.code_challenge_method,'s256');
    await page.getByRole('button',{name:'Back to log in',exact:true}).click();await page.getByRole('button',{name:'Forgot password?'}).click();
    id=await currentWidget(page);await callback(page,id);await page.getByRole('button',{name:'Send reset link',exact:true}).click();
    await page.getByText('If this account can receive the email, a link has been sent.',{exact:false}).waitFor();await waitWidget(page,id);
    const recovery=requests.find(request=>request.path==='/auth/v1/recover');
    assert.equal(recovery.body.gotrue_meta_security.captcha_token,`proof-${id}`);
    assert.equal(new URLSearchParams(recovery.query).get('redirect_to'),`${base}/?flow=recovery`);assert.equal(recovery.body.code_challenge_method,'s256');
    const next=await currentWidget(page);await callback(page,next);await page.getByRole('button',{name:'Send reset link',exact:true}).click();
    await page.getByText('Please wait one minute before requesting another email.',{exact:true}).waitFor();
    assert.equal(requests.filter(request=>request.path==='/auth/v1/recover').length,1,'Email cooldown still applies after new proof');
    await page.reload();await waitWidget(page);
    await page.getByRole('button',{name:'Resend confirmation email'}).click();await page.getByLabel('Email',{exact:true}).fill('fixture@example.invalid');
    id=await currentWidget(page);await callback(page,id);await page.getByRole('button',{name:'Resend confirmation',exact:true}).click();
    await page.getByText('If this account can receive the email, a link has been sent.',{exact:false}).waitFor();await waitWidget(page,id);
    const resend=requests.find(request=>request.path==='/auth/v1/resend');assert.equal(resend.body.gotrue_meta_security.captcha_token,`proof-${id}`);
    assert.equal(new URLSearchParams(resend.query).get('redirect_to'),`${base}/?flow=confirmed`);
    failNextScript=true;await page.reload();
    await page.getByText('Bot verification could not load. Retry verification.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Log in',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Retry verification',exact:true}).click();await waitWidget(page);
    assert.equal(scriptAttempts,4,'One shared script per page, plus one failed load and successful retry');
    await page.clock.install();stallNextScript=true;await page.reload();
    await page.waitForFunction(()=>!!window.turnstile);
    await page.clock.fastForward(15_001);
    await page.getByText('Bot verification could not load. Retry verification.',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>!!window.turnstile),false,'A timed-out script does not leave its unusable API cached');
    assert.equal(await page.getByRole('button',{name:'Log in',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Retry verification',exact:true}).click();await waitWidget(page);
    assert.equal(scriptAttempts,6,'Readiness timeout retries with a fresh script');
    assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
    console.log('PASS: optional CAPTCHA proof on login/signup/reset/resend, single-use/expired/error/retry, stale callbacks, mode/locale invalidation, PKCE and minimum password. Widget and Auth are intercepted; server verification is not activated.');
  } finally {await context.close()}
};
