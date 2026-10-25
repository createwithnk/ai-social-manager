import { useState } from 'react'
import type { Post } from '../../types'
import AssetBridge from '../assets/AssetBridge'
import PublisherPreview from '../publishing/PublisherPreview'
import LeadSandbox from '../leads/LeadSandbox'
import { useVeloLocale } from './locale'
import './modules.css'

const modules = ['Asset bridge', 'Publisher preview', 'Lead filter'] as const
export default function ModuleWorkspace({ ownerId, posts }: { ownerId: string; posts: readonly Post[] }) {
  const { t } = useVeloLocale()
  const [active, setActive] = useState<typeof modules[number]>('Asset bridge')
  return <section className="content velo-tools">
    <p>{t('New tools, separate from your saved content.')}</p>
    <div className="velo-tabs" role="group" aria-label={t('Velo tools')}>{modules.map(name => <button type="button" className={name === active ? 'primary' : 'ghost'} key={name} aria-pressed={name === active} onClick={() => setActive(name)}>{t(name)}</button>)}</div>
    {active === 'Asset bridge' && <AssetBridge key={ownerId} ownerId={ownerId} posts={posts} />}
    {active === 'Publisher preview' && <PublisherPreview posts={posts} />}
    {active === 'Lead filter' && <LeadSandbox />}
  </section>
}
