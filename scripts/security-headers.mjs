import fs from 'node:fs'
import { productionHeaders } from './header-policy.mjs'

// Public project identity only. No environment/credential files are read.
const target = JSON.parse(fs.readFileSync(new URL('../deployment/target.json', import.meta.url), 'utf8'))
if (target.supabaseOrigin !== `https://${target.projectRef}.supabase.co`) throw new Error('Release project identity does not match its API origin.')
const headers = productionHeaders(target.supabaseOrigin)
const deployment = new URL('../deployment/security-headers.json', import.meta.url)
const output = new URL('../public/_headers', import.meta.url)
fs.mkdirSync(new URL('../public/', import.meta.url), { recursive: true })
fs.writeFileSync(deployment, JSON.stringify(headers, null, 2) + '\n')
fs.writeFileSync(output, '/*\n' + Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`).join('\n') + '\n')
