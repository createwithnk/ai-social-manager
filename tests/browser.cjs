const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
 let executablePath=process.env.CHROMIUM_EXECUTABLE;let args=['--no-sandbox'];
 if(process.env.TEST_SERVERLESS_CHROMIUM==='true') {const packaged=await import('@sparticuz/chromium');executablePath=await packaged.default.executablePath();args=packaged.default.args.filter(arg=>arg!=='--single-process');}
 args.push('--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream');
 const browser = await chromium.launch({headless:true,executablePath,args});
 try {
 const page = await browser.newPage({viewport:{width:390,height:844},timezoneId:'Asia/Kolkata'});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.BASE_URL || 'http://127.0.0.1:5173');
 await page.getByRole('button',{name:'New post',exact:true}).click();
 await page.getByLabel('Content idea').fill('Five ways to improve small business content');
 await page.getByRole('button',{name:'Use local template'}).click();
 await page.getByLabel('I reviewed and approve this content').check();
 await page.getByLabel('Caption',{exact:true}).fill('An edited caption');
 assert.equal(await page.getByLabel('I reviewed and approve this content').isChecked(),false);
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 await page.getByText('Draft saved.',{exact:true}).waitFor();
 await page.reload();
 await page.getByRole('button',{name:'Continue draft'}).click();
 assert.equal(await page.getByLabel('Caption',{exact:true}).inputValue(),'An edited caption');
 await page.getByLabel('I reviewed and approve this content').check();
 await page.getByRole('button',{name:'Approve & save'}).click();
 await page.getByRole('button',{name:'View',exact:true}).click();
 await page.getByRole('button',{name:'Edit',exact:true}).click();
 assert.equal(await page.getByLabel('I reviewed and approve this content').isChecked(),false);
 await page.getByLabel('I reviewed and approve this content').check();
 await page.getByRole('button',{name:'Approve & save'}).click();
 await page.getByRole('button',{name:'Open navigation'}).click();
 await page.getByRole('button',{name:'Content calendar',exact:true}).click();
 await page.getByLabel('Schedule Five ways to improve small business content').fill('2020-01-01T10:00');
 await page.getByRole('button',{name:'Schedule',exact:true}).click();
 await page.getByText('Choose a future date and time.',{exact:true}).waitFor();
 await page.getByLabel('Schedule Five ways to improve small business content').fill('2099-01-01T10:00');
 await page.getByRole('button',{name:'Schedule',exact:true}).click();
 await page.getByRole('button',{name:'Unschedule',exact:true}).waitFor();
 await page.getByRole('button',{name:'View',exact:true}).click();
 await page.getByRole('button',{name:'Edit',exact:true}).click();
 const posts=await page.evaluate(()=>JSON.parse(localStorage.getItem('aasiflow-posts')));
 assert.equal(posts[0].status,'draft');assert.equal(posts[0].scheduledFor,undefined);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);
 await page.getByRole('button',{name:'Open navigation'}).click();
 await page.getByRole('button',{name:'Connections & setup',exact:true}).click();
 await page.getByRole('heading',{name:'Accounts & launch status'}).waitFor();
 await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=0);
 assert.equal(await page.getByRole('button',{name:'Queue approved publication'}).isDisabled(),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 fs.mkdirSync('/tmp/aasiflow-qa',{recursive:true});
 await page.screenshot({path:'/tmp/aasiflow-qa/mobile-connections.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});
 await page.screenshot({path:'/tmp/aasiflow-qa/desktop-connections.png',fullPage:true});
 if(process.env.CLOUD_BASE_URL) await cloudTest(browser,process.env.CLOUD_BASE_URL);
 console.log('PASS: mobile/desktop drafts, approval reset, calendar validation, disabled publication/payment, PKCE account-email requests, globally revoked recovery and native MediaRecorder using simulated microphone. No external network requests.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});

async function cloudTest(browser,base) {
 const context=await browser.newContext({viewport:{width:390,height:844},permissions:['microphone'],timezoneId:'Asia/Kolkata'});
 const page=await context.newPage();const errors=[],blocked=[],requests=[];let uploaded=null;
 const id='a1111111-1111-4111-8111-111111111111';
 const user={id,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{provider:'email'},user_metadata:{},identities:[],created_at:new Date().toISOString()};
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const token=`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:id,session_id:'a3333333-3333-4333-8333-333333333333',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})}.test-signature`;
 page.on('pageerror',error=>errors.push(error.message));
 await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin===base)return route.continue();
   if(url.origin!=='https://fixture.supabase.co'){blocked.push(url.toString());return route.fulfill({status:403,body:'Blocked by test'});}
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':base,'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-supabase-api-version'}});
   let body;try{body=req.postDataJSON()}catch{}
   requests.push({path:url.pathname,method:req.method(),query:url.searchParams.toString(),body});
   const send=data=>route.fulfill({json:data,headers:{'Access-Control-Allow-Origin':base}});
   if(url.pathname==='/auth/v1/token')return send({access_token:token,refresh_token:'test-refresh-token',token_type:'bearer',expires_in:3600,user});
   if(url.pathname==='/auth/v1/user')return send(user);
   if(url.pathname==='/auth/v1/signup')return send({user,session:null});
   if(url.pathname.startsWith('/auth/v1/'))return send({});
   if(url.pathname==='/rest/v1/rpc/launch_status')return send({publishing:false,billing:false});
   if(url.pathname==='/rest/v1/rpc/usage_summary')return send({attempts:2,credits:0});
   if(url.pathname.startsWith('/rest/v1/'))return send([]);
   if(url.pathname==='/functions/v1/social-account')return send({instagram:false,linkedin:false,publishing:false});
   if(url.pathname.startsWith('/storage/v1/object/post-media/')) {
     const type=req.headers()['content-type'];
     if(type?.startsWith('multipart/form-data')){
       const form=await new Response(req.postDataBuffer(),{headers:{'content-type':type}}).formData();const file=[...form.values()].find(value=>typeof value!=='string');
       uploaded={bytes:Buffer.from(await file.arrayBuffer()),mime:file.type};
     }else uploaded={bytes:req.postDataBuffer(),mime:type};
     return send({Key:url.pathname.split('/object/')[1]});
   }
   if(url.pathname.startsWith('/storage/v1/object/sign/post-media/')){
     if(req.method()==='POST')return send({signedURL:`/object/sign/post-media/${id}/voice?token=fixture`});
     return route.fulfill({body:uploaded?.bytes || Buffer.alloc(0),contentType:uploaded?.mime || 'audio/webm'});
   }
   blocked.push(url.toString());return route.fulfill({status:404,body:'Unexpected test request'});
 });
 await page.goto(base);
 await page.getByRole('button',{name:'Need an account? Sign up'}).click();
 await page.getByLabel('Email',{exact:true}).fill('fixture@example.invalid');
 await page.getByLabel('Password',{exact:true}).fill('short');
 await page.getByRole('button',{name:'Sign up',exact:true}).click();
 assert.equal(requests.filter(req=>req.path==='/auth/v1/signup').length,0);
 await page.getByLabel('Password',{exact:true}).fill('fixture passphrase only');
 await page.getByRole('button',{name:'Sign up',exact:true}).click();
 await page.getByText('Check your email to confirm your account, then sign in.').waitFor();
 const signup=requests.find(req=>req.path==='/auth/v1/signup');
 assert.equal(new URLSearchParams(signup.query).get('redirect_to'),`${base}/?flow=confirmed`);
 assert.equal(signup.body.code_challenge_method,'s256');
 await page.reload();await page.getByRole('button',{name:'Forgot password?'}).click();
 await page.getByLabel('Email',{exact:true}).fill('fixture@example.invalid');
 await page.getByRole('button',{name:'Send reset link',exact:true}).click();
 await page.getByText('If this account can receive the email, a link has been sent.',{exact:false}).waitFor();
 const recovery=requests.find(req=>req.path==='/auth/v1/recover');
 assert.equal(new URLSearchParams(recovery.query).get('redirect_to'),`${base}/?flow=recovery`);assert.equal(recovery.body.code_challenge_method,'s256');
 await page.reload();await page.getByRole('button',{name:'Resend confirmation email'}).click();
 await page.getByLabel('Email',{exact:true}).fill('fixture@example.invalid');await page.getByRole('button',{name:'Resend confirmation',exact:true}).click();
 await page.getByText('If this account can receive the email, a link has been sent.',{exact:false}).waitFor();
 await page.reload();await page.getByLabel('Email',{exact:true}).fill('fixture@example.invalid');await page.getByLabel('Password',{exact:true}).fill('fixture passphrase only');
 await page.getByRole('button',{name:'Log in',exact:true}).click();await page.getByRole('button',{name:'New post',exact:true}).waitFor();
 await page.getByRole('button',{name:'Open navigation'}).click();await page.getByRole('button',{name:'Connections & setup',exact:true}).click();
 await page.getByText('2 AI attempts today (UTC). Credit balance: 0.').waitFor();
 assert.equal(await page.getByRole('button',{name:'Queue approved publication'}).isDisabled(),true);
 assert.equal(await page.getByRole('button',{name:'Connect account',exact:true}).first().isDisabled(),true);
 assert.equal(requests.some(req=>req.path.includes('payment-checkout')),false);
 await page.getByRole('button',{name:'New post',exact:true}).click();
 await page.getByRole('button',{name:'Record voice (up to 60 seconds)'}).click();await page.getByRole('button',{name:'Stop recording'}).waitFor();
 await page.waitForTimeout(800);
 await page.getByRole('button',{name:'Stop recording'}).click();await page.getByText('voice-note',{exact:true}).waitFor();
 assert(uploaded && uploaded.bytes.length>0);assert(['audio/webm','audio/mp4'].includes(uploaded.mime));
 const sign=requests.find(req=>req.path.startsWith('/storage/v1/object/sign/') && req.method==='POST');assert.equal(sign.body.expiresIn,300);
 await page.evaluate(userId=>sessionStorage.setItem(`aasiflow-recovery-${userId}`,String(Date.now()+600000)),id);await page.reload();
 await page.getByRole('heading',{name:'Choose a new password'}).waitFor();
 await page.getByLabel('New password',{exact:true}).fill('new fixture passphrase only');await page.getByLabel('Confirm new password',{exact:true}).fill('new fixture passphrase only');
 await page.getByRole('button',{name:'Update password',exact:true}).click();
 await page.getByText('Password updated. Sign in again with your new password.').waitFor();
 assert(requests.some(req=>req.path==='/auth/v1/logout' && new URLSearchParams(req.query).get('scope')==='global'));
 assert.equal(await page.getByLabel('Password',{exact:true}).inputValue(),'');
 assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);
 await context.close();
}
