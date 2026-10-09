import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { productionHeaders } from './header-policy.mjs'
if (existsSync('.env')) process.loadEnvFile('.env')
const headers = productionHeaders({supabaseUrl:process.env.VITE_SUPABASE_URL,turnstileSiteKey:process.env.VITE_TURNSTILE_SITE_KEY})
mkdirSync('public',{recursive:true})
mkdirSync('deployment',{recursive:true})
writeFileSync('public/_headers',`/*\n${Object.entries(headers).map(([key,value]) => `  ${key}: ${value}`).join('\n')}\n  Cache-Control: no-store\n\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n`)
writeFileSync('deployment/security-headers.json',JSON.stringify(headers,null,2)+'\n')
// Files only: the script never configures a host or deploys a website.
console.log('Prepared production security headers for this app origin.')
