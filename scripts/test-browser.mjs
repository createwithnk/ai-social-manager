import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
const start = (port,cloud,captcha=false) => spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{env:{...process.env,VITE_SUPABASE_URL:cloud?'https://fixture.supabase.co':'',VITE_SUPABASE_ANON_KEY:cloud?'public-fixture-key':'',VITE_TURNSTILE_SITE_KEY:captcha?'1x00000000000000000000AA':''},stdio:['ignore','pipe','pipe']})
const servers=[start(5177,false),start(5178,true),start(5179,true,true)]
try {
  for(const [i,server] of servers.entries()) {
    let ready=false
    for(let attempt=0;attempt<80;attempt++) {
      if(server.exitCode !== null)throw new Error(`Local test server could not start on port ${5177+i}.`)
      try{if((await fetch(`http://127.0.0.1:${5177+i}`)).ok){ready=true;break}}catch{}
      await delay(100)
    }
    if(!ready)throw new Error('Local test server did not become ready.')
  }
  const result=await new Promise(resolve=>{const child=spawn(process.execPath,['tests/browser.cjs'],{stdio:'inherit',env:{...process.env,BASE_URL:'http://127.0.0.1:5177',CLOUD_BASE_URL:'http://127.0.0.1:5178',CAPTCHA_BASE_URL:'http://127.0.0.1:5179'}});child.on('exit',code=>resolve(code ?? 1))})
  process.exitCode=result
} finally {for(const server of servers)server.kill('SIGTERM')}
