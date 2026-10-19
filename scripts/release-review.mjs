import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

// Public identity and fixed source paths only. No environment files, credentials,
// networking, database calls or deployment commands are used by this review tool.
const target = JSON.parse(await readFile('deployment/target.json','utf8'))
if(target.projectRef !== 'nkfecpdegcmsapvbviky') throw new Error('Unexpected review target')
const paths = [
  'supabase/migrations/20261013000000_require_prior_approval.sql',
  'supabase/migrations/20261014000000_owner_monitoring.sql',
  'supabase/proposals/20261015000000_private_beta_safety.sql',
  'supabase/proposals/20261015000000_private_beta_safety.rollback.sql',
  'supabase/functions/generate-content/index.ts',
  'supabase/functions/generate-content/handler.ts',
  'supabase/functions/generate-content/gemini.ts',
  'supabase/functions/generate-content/monitoring.ts',
  'src/App.tsx', 'src/BetaGate.tsx', 'src/AdminDashboard.tsx', 'src/RuntimeBoundary.tsx',
  'src/lib/auth.ts', 'src/lib/ai.ts', 'src/lib/beta-policy.ts', 'src/lib/monitoring.ts',
  'src/lib/media.ts', 'src/lib/supabase.ts', 'src/lib/translations.ts', 'src/styles.css',
  'src/lib/posts.ts', 'src/lib/workflow.ts', 'src/types.ts', 'package.json', 'package-lock.json',
  'src/main.tsx', 'src/components/MediaInput.tsx', 'src/MediaLibrary.tsx',
  'scripts/release-review.mjs', 'deployment/target.json', 'public/_headers', 'deployment/security-headers.json',
]
const files=[]
for(const path of paths) files.push({path,sha256:createHash('sha256').update((await readFile(path,'utf8')).replace(/\r\n/g,'\n')).digest('hex')})
const manifest=JSON.stringify({projectRef:target.projectRef,branch:'chore/security-and-approval-hardening',approved:false,
  defaults:{aiEnabled:false,uploadsEnabled:false,dailyCallLimit:0,dailyBudgetUsd:0},
  firstApproval:'Review isolated staging/backup evidence before authorizing these exact SQL payloads. No blanket database push.',
  separateApprovals:['Hosted Auth settings','Owner UUID privileges','Test UUID membership','Frontend and generator release','Provider usage with verified no-charge configuration','Real user invitations'],
  normalization:'UTF-8 content with CRLF normalized to LF',files},null,2)+'\n'
if (process.argv.includes('--check')) {
  if ((await readFile('deployment/beta-review.json','utf8')).replace(/\r\n/g,'\n') !== manifest) {
    process.stderr.write('Beta review manifest does not match the current sources. Stop release review and regenerate it locally.\n')
    process.exitCode=1
  } else process.stdout.write('Beta review manifest verified without writes or networking.\n')
} else {
  await writeFile('deployment/beta-review.json',manifest)
  process.stdout.write('Prepared deployment/beta-review.json locally. No live action performed.\n')
}
