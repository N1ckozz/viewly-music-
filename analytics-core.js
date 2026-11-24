/* VIEWLY V11 - OWNER-ONLY ACTUAL ANALYTICS.
 * TikTok views are provider-reported at the time checked, not certified eligible views.
 * New-observed deltas are recorded on CHECK dates, not necessarily on impression dates.
 * Sandbox allocations cannot be paid out, and are separate from actual deposits.
 */
import {isSandboxBilling} from './billing-core.js';
const periods=new Set([7,30,90]);
const nonneg=x=>Math.max(0,Math.floor(Number(x)||0));
const startDate=(n,date=new Date())=>{
 const d=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));
 d.setUTCDate(d.getUTCDate()-n+1);return d;
};
const field=(obj,k)=>nonneg(obj?.[k]);
export function budgetMetrics(c,{pendingCpm=0,settledCpm=0,periodAllocated=0}={}){
 const mode=c.sandbox_funded_cents>0||['sandbox_active','sandbox_paused'].includes(c.status)?'sandbox':'provider';
 const funded=field(c,mode==='sandbox'?'sandbox_funded_cents':'paid_cents');
 const allocated=field(c,mode==='sandbox'?'sandbox_spent_cents':'spent_cents');
 const pending=Math.min(allocated,nonneg(pendingCpm));
 const settled=Math.min(allocated-pending,nonneg(settledCpm));
 return {mode,funded_cents:funded,allocated_cents:allocated,available_cents:Math.max(0,funded-allocated),
  pending_cpm_cents:pending,settled_cpm_cents:settled,other_allocated_cents:Math.max(0,allocated-pending-settled),
  utilization_percent:funded?Math.min(100,Math.round(allocated/funded*1000)/10):0,
  overcommitted:allocated>funded,platform_fee_cents:field(c,'fee_cents'),
  reference_total_cents:field(c,'budget_cents')+field(c,'fee_cents'),
  actual_paid_cents:mode==='sandbox'?0:field(c,'paid_cents'),
  credit_kind:mode==='sandbox'?'non_withdrawable_test_credits':'verified_provider_only',
  allocation_rate_7d_cents:nonneg(periodAllocated),projected_remaining_days:null,
  note:mode==='sandbox'?'Sandbox allocation. €0 actually deposited; test credits cannot be withdrawn.':'Provider funding records, not sandbox credits. Real payouts remain disabled.'
 };
}
export function buildObservedSeries(db,campaignId,days,clock=new Date()){
 if(!periods.has(days))throw new Error('Invalid analytics period');
 const from=startDate(days,clock).toISOString();
 const until=new Date(Date.UTC(clock.getUTCFullYear(),clock.getUTCMonth(),clock.getUTCDate()+1)).toISOString();
 const base=db.prepare("SELECT s.submission_id,MAX(COALESCE(s.provider_views,0)) AS v FROM cpm_view_snapshots s JOIN cpm_submissions c ON c.submission_id=s.submission_id WHERE c.campaign_id=? AND s.checked_at<? AND s.provider_views IS NOT NULL GROUP BY s.submission_id").all(campaignId,from);
 const baseline=new Map(base.map(x=>[x.submission_id,nonneg(x.v)]));
 const observations=db.prepare("SELECT s.submission_id,substr(s.checked_at,1,10) AS day,MAX(s.provider_views) AS peak,COUNT(*) AS checks FROM cpm_view_snapshots s JOIN cpm_submissions c ON c.submission_id=s.submission_id WHERE c.campaign_id=? AND s.checked_at>=? AND s.checked_at<? AND s.provider_views IS NOT NULL GROUP BY s.submission_id,substr(s.checked_at,1,10) ORDER BY s.submission_id ASC,day ASC").all(campaignId,from,until);
 const daysMap=new Map();
 const dayStart=startDate(days,clock);
 for(let i=0;i<days;i++){
  const d=new Date(dayStart);d.setUTCDate(d.getUTCDate()+i);
  const day=d.toISOString().slice(0,10);
  daysMap.set(day,{day,observed_view_delta:null,provider_checks:0,credit_cents:0,verified_view_delta:null});
 }
 for(const row of observations){
  const day=daysMap.get(row.day);if(!day)continue;
  const peak=nonneg(row.peak),old=baseline.get(row.submission_id)||0;
  if(day.observed_view_delta===null)day.observed_view_delta=0;
  day.observed_view_delta+=Math.max(0,peak-old);
  day.provider_checks+=nonneg(row.checks);
  baseline.set(row.submission_id,Math.max(old,peak));
 }
 const credits=db.prepare("SELECT substr(e.created_at,1,10) AS day,SUM(e.delta_cents) AS amount FROM cpm_events e JOIN cpm_submissions c ON c.submission_id=e.submission_id WHERE c.campaign_id=? AND e.created_at>=? AND e.created_at<? GROUP BY substr(e.created_at,1,10)").all(campaignId,from,until);
 const rewards=db.prepare("SELECT substr(created_at,1,10) AS day,SUM(quoted_reward_cents) AS amount FROM sandbox_creator_rewards WHERE campaign_id=? AND created_at>=? AND created_at<? GROUP BY substr(created_at,1,10)").all(campaignId,from,until);
 for(const x of [...credits,...rewards])if(daysMap.has(x.day))daysMap.get(x.day).credit_cents+=nonneg(x.amount);
 return [...daysMap.values()];
}
function owned(db,userId,cid,fail){
 const campaign=db.prepare('SELECT * FROM campaigns WHERE id=? AND owner_id=?').get(cid,userId);
 if(!campaign)throw fail(404,'Campaign analytics not found.');
 return campaign;
}
function campaignCounts(db,cid){
 const c=db.prepare("SELECT COUNT(*) AS total,COUNT(DISTINCT clipper_id) AS clippers,COALESCE(SUM(highest_views),0) AS views,COALESCE(SUM(accrued_cents),0) AS accrued,COALESCE(SUM(settled_cents),0) AS settled,MAX(last_checked_at) AS latest_check,SUM(CASE WHEN review_status IN ('pending','disputed') THEN 1 ELSE 0 END) AS pending,SUM(CASE WHEN review_status='approved' THEN 1 ELSE 0 END) AS approved,SUM(CASE WHEN review_status='rejected' THEN 1 ELSE 0 END) AS rejected,SUM(CASE WHEN risk_flag<>'' OR post_access<>'visible' THEN 1 ELSE 0 END) AS flagged FROM cpm_submissions WHERE campaign_id=?").get(cid);
 const l=db.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status IN ('pending','sandbox_pending') THEN 1 ELSE 0 END) AS pending,SUM(CASE WHEN status IN ('approved','sandbox_approved') THEN 1 ELSE 0 END) AS approved,SUM(CASE WHEN status IN ('rejected','sandbox_rejected') THEN 1 ELSE 0 END) AS rejected FROM submissions WHERE campaign_id=? AND id NOT IN(SELECT submission_id FROM cpm_submissions)").get(cid);
 const result={
  submissions:field(c,'total')+field(l,'total'),
  pending:field(c,'pending')+field(l,'pending'),
  approved:field(c,'approved')+field(l,'approved'),
  rejected:field(c,'rejected')+field(l,'rejected'),
  flagged:field(c,'flagged'),
  clipper_count:db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM submissions WHERE campaign_id=?').get(cid).n||0,
  reported_views_latest:field(c,'views'),
  cpm_credits_cents:field(c,'accrued'),cpm_settled_cents:field(c,'settled'),
  last_tiktok_check:c.latest_check||null
 };
 result.reviewed=result.approved+result.rejected;
 result.approval_rate_percent=result.reviewed?Math.round(result.approved/result.reviewed*1000)/10:null;
 return result;
}
function topClippers(db,cid){
 return db.prepare("SELECT c.clipper_id,u.username,u.display_name,COUNT(*) AS clips,SUM(c.highest_views) AS views,SUM(c.accrued_cents) AS credits_cents,SUM(CASE WHEN c.review_status='approved' THEN 1 ELSE 0 END) AS approved,SUM(CASE WHEN c.risk_flag<>'' OR c.post_access<>'visible' THEN 1 ELSE 0 END) AS flagged FROM cpm_submissions c JOIN users u ON u.id=c.clipper_id WHERE c.campaign_id=? GROUP BY c.clipper_id ORDER BY views DESC,credits_cents DESC LIMIT 10").all(cid).map(r=>({
  user_id:r.clipper_id,username:r.username,display_name:r.display_name,clips:field(r,'clips'),
  reported_views_latest:field(r,'views'),test_credits_cents:field(r,'credits_cents'),
  approved_clips:field(r,'approved'),flagged_clips:field(r,'flagged')
 }));
}
function alertsFor(b,c,credits7){
 const notes=[];
 if(!b.funded_cents)notes.push({kind:'info',code:'unfunded',text:'This campaign has no recorded funding yet.'});
 else if(!b.available_cents)notes.push({kind:'warning',code:'exhausted',text:'The campaign has no available unallocated budget.'});
 else if(b.utilization_percent>=80)notes.push({kind:'warning',code:'budget_80',text:b.utilization_percent+'% of recorded campaign funding has been allocated.'});
 if(c.flagged)notes.push({kind:'warning',code:'risk_flags',text:c.flagged+' clip(s) need verification or availability review.'});
 if(c.pending)notes.push({kind:'info',code:'pending',text:c.pending+' submission(s) await a decision or appeal.'});
 if(c.submissions&&!c.last_tiktok_check)notes.push({kind:'info',code:'unobserved',text:'There are no recorded official TikTok view checks yet.'});
 const positiveDays=credits7.filter(x=>x.credit_cents>0).length;
 if(b.funded_cents&&credits7.length===7&&positiveDays>=2){
  const allocation=credits7.reduce((n,x)=>n+x.credit_cents,0);
  if(allocation>0)b.projected_remaining_days=Math.ceil(b.available_cents/(allocation/7));
 }
 return notes;
}
export function buildCampaignAnalytics(db,userId,cid,days,fail){
 const campaign=owned(db,userId,cid,fail),counts=campaignCounts(db,cid);
 const series=buildObservedSeries(db,cid,days),credits7=buildObservedSeries(db,cid,7);
 const b=budgetMetrics(campaign,{pendingCpm:Math.max(0,counts.cpm_credits_cents-counts.cpm_settled_cents),
  settledCpm:counts.cpm_settled_cents,periodAllocated:credits7.reduce((n,x)=>n+x.credit_cents,0)});
 const alerts=alertsFor(b,counts,credits7);
 return {campaign:{id:campaign.id,title:campaign.title,status:campaign.status,platform:campaign.platform,
  pricing_model:campaign.pricing_model,release_id:campaign.release_id,created_at:campaign.created_at,
  rate_cents:campaign.cpm_rate_cents||campaign.reward_cents,tracking_days:campaign.tracking_days},
  period_days:days,counts,budget:b,alerts,series,top_clippers:topClippers(db,cid),
  viewly_unique_plays:db.prepare('SELECT COUNT(*) AS n FROM release_views WHERE release_id=?').get(campaign.release_id).n||0,
  series_summary:{observed_delta_in_range:series.reduce((n,x)=>n+(x.observed_view_delta||0),0),
   checked_days:series.filter(x=>x.provider_checks>0).length,
   provider_checks:series.reduce((n,x)=>n+x.provider_checks,0),
   credit_allocation_in_range_cents:series.reduce((n,x)=>n+x.credit_cents,0)},
  methodology:{views:'Latest TikTok API-reported cumulative views per submitted clip. Not certified organic or eligible views.',
   trend:'Positive view growth observed at API CHECK time, not necessarily the actual day viewed. Missing check days are unknown, not zero.',
   budget:'Sandbox credits do not represent real deposits, cash balances or payouts.',
   freshness:counts.last_tiktok_check,external_view_fraud_certified:false,sandbox:isSandboxBilling()}
 };
}
export function buildPortfolio(db,userId,days){
 const campaigns=db.prepare('SELECT * FROM campaigns WHERE owner_id=? ORDER BY created_at DESC LIMIT 100').all(userId);
 const cards=campaigns.map(c=>{
  const counts=campaignCounts(db,c.id);
  const budget=budgetMetrics(c,{pendingCpm:Math.max(0,counts.cpm_credits_cents-counts.cpm_settled_cents),
   settledCpm:counts.cpm_settled_cents});
  return {id:c.id,title:c.title,status:c.status,platform:c.platform,created_at:c.created_at,
   pricing_model:c.pricing_model,rate_cents:c.cpm_rate_cents||c.reward_cents,budget,counts};
 });
 const totals={campaigns:cards.length,funded_cents:0,allocated_cents:0,available_cents:0,
  latest_reported_views:0,submissions:0,pending:0,flagged:0,approved:0,creator_count:0};
 for(const c of cards){
  totals.funded_cents+=c.budget.funded_cents;totals.allocated_cents+=c.budget.allocated_cents;
  totals.available_cents+=c.budget.available_cents;totals.latest_reported_views+=c.counts.reported_views_latest;
  totals.submissions+=c.counts.submissions;totals.pending+=c.counts.pending;
  totals.flagged+=c.counts.flagged;totals.approved+=c.counts.approved;
 }
 totals.creator_count=db.prepare('SELECT COUNT(DISTINCT s.user_id) AS n FROM submissions s JOIN campaigns c ON c.id=s.campaign_id WHERE c.owner_id=?').get(userId).n||0;
 const attention=cards.filter(c=>c.budget.utilization_percent>=80||c.counts.flagged||c.counts.pending)
  .slice(0,8).map(c=>({campaign_id:c.id,title:c.title,
   budget_used_percent:c.budget.utilization_percent,flagged:c.counts.flagged,pending:c.counts.pending}));
 return {period_days:days,totals,campaigns:cards,attention,sandbox:isSandboxBilling(),
  source_note:'Owner-only Viewly records. TikTok values are API-reported snapshots, never fake samples or certified organic views.'};
}
export function createAnalyticsHandler({db,requireCreator,fail,send}){
 return function analytics(req,res,url){
  if(req.method!=='GET')throw fail(405,'Analytics APIs are read-only.');
  const u=requireCreator(req),days=Number(url.searchParams.get('days')||30);
  if(!periods.has(days))throw fail(422,'Choose 7, 30 or 90 days.');
  if(url.pathname==='/api/analytics/overview')return send(res,200,buildPortfolio(db,u.id,days));
  const m=url.pathname.match(/^\/api\/analytics\/campaigns\/([a-f0-9-]{36})$/i);
  if(m)return send(res,200,buildCampaignAnalytics(db,u.id,m[1],days,fail));
  throw fail(404,'Analytics endpoint not found.');
 };
}
