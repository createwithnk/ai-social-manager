import { supabase } from './supabase'
export interface Connection { id:string; provider:'instagram'|'linkedin';account_name:string;status:'connected'|'expired'|'disconnected';expires_at:string;scopes:string[] }
export interface Publication { id:string;post_id:string|null;connection_id:string;status:string;due_at:string;published_at:string|null;error_code:string|null;provider_post_id:string|null }
export interface Metric { job_id:string;source:'instagram'|'linkedin';observed_at:string;impressions:number|null;reactions:number|null;comments:number|null;shares:number|null }
export interface IntegrationData {ready:boolean;connections:Connection[];jobs:Publication[];metrics:Metric[];attempts:number;credits:number;publishing:boolean;billing:boolean}
export const emptyIntegrations:IntegrationData = {ready:false,connections:[],jobs:[],metrics:[],attempts:0,credits:0,publishing:false,billing:false}
export async function integrationData(userId:string):Promise<IntegrationData> {
  if (!supabase) return emptyIntegrations
  const {data:gates,error:gateError} = await supabase.rpc('launch_status')
  if (gateError?.code === 'PGRST202') return emptyIntegrations
  if (gateError) throw new Error('Account setup could not be checked. Refresh or sign in again.')
  const results = await Promise.all([
    supabase.from('social_connections').select('id,provider,account_name,status,expires_at,scopes').eq('user_id',userId),
    supabase.from('publication_jobs').select('id,post_id,connection_id,status,due_at,published_at,error_code,provider_post_id').eq('user_id',userId).order('created_at',{ascending:false}).limit(100),
    supabase.from('post_metrics').select('job_id,source,observed_at,impressions,reactions,comments,shares').eq('user_id',userId).order('observed_at',{ascending:false}).limit(1000),
    supabase.rpc('usage_summary'),
  ])
  if (results.some(result => result.error)) throw new Error('Account information could not be loaded. Refresh or sign in again.')
  return {ready:true,connections:results[0].data as Connection[],jobs:results[1].data as Publication[],metrics:results[2].data as Metric[],attempts:results[3].data?.attempts ?? 0,credits:results[3].data?.credits ?? 0,publishing:gates?.publishing === true,billing:gates?.billing === true}
}
export async function serverAction<T>(name:string,body:Record<string,unknown>):Promise<T> {
  if (!supabase) throw new Error('Sign in with a configured account first.')
  const {data,error} = await supabase.functions.invoke(name,{body})
  if (error) {
    let detail = ''
    try { const context = 'context' in error ? error.context : null; if (context instanceof Response) detail = (await context.json()).error ?? '' } catch { /* Server text is optional. */ }
    throw new Error(detail || 'This integration is not available yet. The owner must complete its server setup.')
  }
  return data as T
}
export async function enqueuePublication(postId:string,connectionId:string,revision:number,whenDue:string) {
  if (!supabase) throw new Error('Sign in first.')
  const {error} = await supabase.rpc('enqueue_publication',{pid:postId,cid:connectionId,expected_revision:revision,when_due:whenDue})
  if (error) throw new Error(error.message)
}
export async function cancelPublication(id:string) {
  if (!supabase) throw new Error('Sign in first.')
  const {data,error} = await supabase.rpc('cancel_publication',{jid:id})
  if (error || !data) throw new Error('Only queued posts can be cancelled. Refresh to check its status.')
}
