import type { Metric, Publication } from './integrations'
export function latestMetrics(metrics:Metric[]) {
  const latest = new Map<string,Metric>()
  for (const metric of metrics) if (!latest.has(metric.job_id) || Date.parse(metric.observed_at) > Date.parse(latest.get(metric.job_id)!.observed_at)) latest.set(metric.job_id,metric)
  return latest
}
export function observedPostingTime(jobs:Publication[],metrics:Metric[],provider:Metric['source'],timeZone:string) {
  const formatter = new Intl.DateTimeFormat('en',{timeZone,hour:'numeric',hourCycle:'h23'})
  const samples:{hour:string;engagement:number}[] = []
  for (const job of jobs) {
    if (job.status !== 'published' || !job.published_at) continue
    const published = Date.parse(job.published_at)
    const matching = metrics.filter(m => m.job_id === job.id && m.source === provider && m.reactions !== null && m.comments !== null && Math.abs(Date.parse(m.observed_at) - published - 24 * 3600000) <= 3600000)
      .sort((a,b) => Math.abs(Date.parse(a.observed_at)-published-24*3600000)-Math.abs(Date.parse(b.observed_at)-published-24*3600000))[0]
    if (matching) samples.push({hour:formatter.format(new Date(published)),engagement:matching.reactions! + matching.comments!})
  }
  if (samples.length < 10) return null
  const groups = new Map<string,number[]>()
  for (const sample of samples) groups.set(sample.hour,[...(groups.get(sample.hour) ?? []),sample.engagement])
  const eligible = [...groups].filter(([,values]) => values.length >= 3).map(([hour,values]) => {
    values.sort((a,b) => a-b); const middle = Math.floor(values.length/2)
    return {hour,median:values.length % 2 ? values[middle] : (values[middle-1]+values[middle])/2,samples:values.length,total:samples.length}
  }).sort((a,b) => b.median-a.median || b.samples-a.samples)
  // A single observed time cannot establish which time performs better.
  return eligible.length >= 2 && eligible[0].median > eligible[1].median ? eligible[0] : null
}
