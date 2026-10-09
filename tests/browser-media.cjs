const assert = require('node:assert/strict');
const fs = require('node:fs');
const fixtures = require('./media-fixtures.cjs');

module.exports = async function mediaTests(browser,base) {
  const context = await browser.newContext({locale:'en-US',viewport:{width:360,height:800}});
  const page = await context.newPage();const errors=[],blocked=[],requests=[],uploads=new Map();let rows=[];
  const id='c1111111-1111-4111-8111-111111111111';
  const user={id,aud:'authenticated',role:'authenticated',email:'media-fixture@example.invalid',app_metadata:{provider:'email'},user_metadata:{},identities:[],created_at:new Date().toISOString()};
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const token=`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:id,session_id:'c3333333-3333-4333-8333-333333333333',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})}.test-signature`;
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===base)return route.continue();
    if(url.origin!=='https://fixture.supabase.co'){blocked.push(url.toString());return route.fulfill({status:403,body:'Blocked by isolated test'})}
    const headers={'Access-Control-Allow-Origin':base,'Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,OPTIONS','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-supabase-api-version,x-upsert,range'};
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
    let body;try{body=request.postDataJSON()}catch{}
    requests.push({path:url.pathname,method:request.method(),body});
    const send=data=>route.fulfill({json:data,headers});
    if(url.pathname==='/auth/v1/token')return send({access_token:token,refresh_token:'media-fixture-refresh',token_type:'bearer',expires_in:3600,user});
    if(url.pathname==='/auth/v1/user')return send(user);
    if(url.pathname==='/rest/v1/posts'){
      if(['POST','PATCH'].includes(request.method())){rows=[{...body,revision:(rows[0]?.revision || 0)+1}];return send(rows[0])}
      return send(rows);
    }
    if(url.pathname.startsWith('/storage/v1/object/post-media/')){
      assert.equal(request.method(),'POST','No overwrite or deletion request is made');
      assert.equal(request.headers()['x-upsert'],'false');
      const mime=request.headers()['content-type'];
      assert(mime.startsWith('multipart/form-data'));
      const form=await new Response(request.postDataBuffer(),{headers:{'content-type':mime}}).formData();
      const file=[...form.values()].find(value=>typeof value!=='string');assert(file);
      const path=url.pathname.split('/object/post-media/')[1];
      assert(path.startsWith(`${id}/`));assert.equal(path.split('/').length,2);
      uploads.set(path,{bytes:Buffer.from(await file.arrayBuffer()),mime:file.type});
      return send({Key:`post-media/${path}`});
    }
    if(url.pathname.startsWith('/storage/v1/object/sign/post-media/')){
      const path=url.pathname.split('/sign/post-media/')[1];assert(uploads.has(path));
      if(request.method()==='POST'){
        assert.equal(body.expiresIn,300);return send({signedURL:`/object/sign/post-media/${path}?token=isolated-fixture`});
      }
      const media=uploads.get(path);
      return route.fulfill({body:media.bytes,contentType:media.mime,headers:{...headers,'Accept-Ranges':'none','Cache-Control':'no-store'}});
    }
    blocked.push(url.toString());return route.fulfill({status:404,body:'Unexpected request',headers});
  });
  const checkPreview=async fixture=>{
    const selector=fixture.mime.startsWith('video/')?'video':'audio';
    await page.locator(`.media-preview ${selector}`).waitFor();
    await page.waitForFunction(selector=>{
      const media=document.querySelector(`.media-preview ${selector}`);
      return media && media.readyState>=2 && Number.isFinite(media.duration) && media.duration>0;
    },selector);
    const actual=await page.locator(`.media-preview ${selector}`).evaluate(async media=>{
      media.muted=true;await media.play();return {duration:media.duration,width:media.videoWidth,height:media.videoHeight};
    });
    assert(Math.abs(actual.duration-1)<0.1,`${fixture.name} has the expected playable duration`);
    if(selector==='video'){assert.equal(actual.width,48);assert.equal(actual.height,48)}
    await page.waitForFunction(selector=>document.querySelector(`.media-preview ${selector}`).currentTime>0.05,selector);
    await page.locator(`.media-preview ${selector}`).evaluate(media=>media.pause());
  };
  try {
    await page.goto(base);await page.getByLabel('Email',{exact:true}).fill(user.email);
    await page.getByLabel('Password',{exact:true}).fill('media fixture passphrase only');await page.getByRole('button',{name:'Log in',exact:true}).click();
    for(const [index,fixture] of fixtures.entries()){
      await page.getByRole('button',{name:'New post',exact:true}).click();
      const idea=`Isolated playable media test ${fixture.name}`;
      await page.getByLabel('Content idea',{exact:true}).fill(idea);await page.getByRole('button',{name:'Use local template',exact:true}).click();
      const fileInput=page.getByLabel('Photo, video or voice note (up to 10 MB)',{exact:true});
      if(index===0){
        const reads=requests.filter(request=>request.path==='/auth/v1/user').length;
        await fileInput.setInputFiles({name:'not-an-image.png',mimeType:'image/png',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')});
        await page.getByText('The file contents do not match its type. Export a supported media file and retry.',{exact:true}).waitFor();
        await fileInput.setInputFiles({name:'too-large.wav',mimeType:'audio/wav',buffer:Buffer.alloc(10*1024*1024+1)});
        await page.getByText('Use a supported image, video or audio file up to 10 MB.',{exact:true}).waitFor();
        assert.equal(uploads.size,0);assert.equal(requests.filter(request=>request.path==='/auth/v1/user').length,reads,'Rejected input does not ask Auth or Storage');
      }
      await page.getByLabel('I reviewed and approve this content',{exact:true}).check();
      await fileInput.setInputFiles({name:fixture.name,mimeType:`${fixture.mime}; codecs=${fixture.codec}`,buffer:fixture.buffer});
      await page.getByText(fixture.name,{exact:true}).waitFor();await checkPreview(fixture);
      assert.equal(await page.getByLabel('I reviewed and approve this content',{exact:true}).isChecked(),false,'Attachment change clears approval');
      const [path,uploaded]=[...uploads.entries()].at(-1);
      assert.equal(uploaded.mime,fixture.mime,'Multipart strips recorder-style codec parameters');assert.deepEqual(uploaded.bytes,fixture.buffer);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByText('Draft saved.',{exact:true}).waitFor();
      assert.equal(rows[0].user_id,id);assert.equal(rows[0].status,'draft');
      assert.deepEqual(rows[0].media,{path,name:fixture.name,type:fixture.mime,size:fixture.buffer.length});
      await page.reload();await page.getByRole('button',{name:'Continue draft',exact:true}).click();
      await page.getByText(fixture.name,{exact:true}).waitFor();await checkPreview(fixture);
      if(fixture.mime==='video/mp4'){
        await page.evaluate(()=>window.scrollTo(0,0));
        fs.mkdirSync('/tmp/aasiflow-qa',{recursive:true});await page.screenshot({path:'/tmp/aasiflow-qa/english-mobile-video.png',fullPage:true});
        await page.setViewportSize({width:1440,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        await page.evaluate(()=>window.scrollTo(0,0));
        await page.screenshot({path:'/tmp/aasiflow-qa/english-desktop-video.png',fullPage:true});
      }
      await page.getByLabel('I reviewed and approve this content',{exact:true}).check();await page.getByRole('button',{name:'Remove attachment',exact:true}).click();
      assert.equal(await page.getByLabel('I reviewed and approve this content',{exact:true}).isChecked(),false);
      await page.getByRole('button',{name:'Update draft',exact:true}).click();await page.getByText('Draft saved.',{exact:true}).waitFor();
      assert.equal(rows[0].media,null,'Detaching clears the saved reference');
      assert.equal(uploads.size,index+1,'Detaching does not issue an unsafe byte deletion');
      await page.setViewportSize({width:360,height:800});
    }
    assert.equal(await page.locator('.captcha-check').count(),0,'Existing unconfigured setup does not load CAPTCHA');
    assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
    console.log('PASS: actual PCM/WAV, VP8/WebM and H264/MP4 playback, normalized private upload bytes, 5-minute signed previews, save/reload and approval reset; spoof/oversize rejection before Auth/Storage. Storage/Auth are mocked, no real cloud upload or Gemini call.');
  } finally {await context.close()}
};
