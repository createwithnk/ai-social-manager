import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
if (existsSync('.env')) process.loadEnvFile('.env')
const connections = new Set(["'self'"])
const media = new Set(["'self'",'blob:','data:'])
if (process.env.VITE_SUPABASE_URL) {
  const url = new URL(process.env.VITE_SUPABASE_URL)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Production Supabase URL must be a clean HTTPS origin.')
  connections.add(url.origin);media.add(url.origin)
  connections.add(url.origin.replace('https:','wss:'))
}
const policy = [`default-src 'self'`,`script-src 'self'`,`style-src 'self' 'unsafe-inline'`,`connect-src ${[...connections].join(' ')}`,`img-src ${[...media].join(' ')}`,`media-src ${[...media].join(' ')}`,`font-src 'self'`,`object-src 'none'`,`base-uri 'none'`,`frame-ancestors 'none'`,`form-action 'self'`,`upgrade-insecure-requests`].join('; ')
const headers = {'Content-Security-Policy':policy,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'microphone=(self), camera=(), geolocation=(), payment=()','X-Frame-Options':'DENY','Strict-Transport-Security':'max-age=31536000; includeSubDomains','Cross-Origin-Opener-Policy':'same-origin'}
mkdirSync('public',{recursive:true})
mkdirSync('deployment',{recursive:true})
writeFileSync('public/_headers',`/*\n${Object.entries(headers).map(([key,value]) => `  ${key}: ${value}`).join('\n')}\n  Cache-Control: no-store\n\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n`)
writeFileSync('deployment/security-headers.json',JSON.stringify(headers,null,2)+'\n')
// Files only: the script never configures a host or deploys a website.
console.log('Prepared production security headers for this app origin.')
