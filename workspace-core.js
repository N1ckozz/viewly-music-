import {publicOnly} from './campaign-privacy.js';
/* VIEWLY V13: exact, scoped dashboard aggregates; no invented views or financial balances. */
const num=x=>Number(x)||0;
const count=(db,sql,...args)=>num(db.prepare(sql).get(...args).n);
const visible="r.visibility='public' AND u.status='active'";
export function workspaceSummary(db, actor, days, sandboxEnabled, at=new Date()){
 const span=days===7?7:30;
 const today=new Date(Date.UTC(at.getUTCFullYear(),at.getUTCMonth(),at.getUTCDate()));
 const start=new Date(today.getTime()-(span-1)*86400000).toISOString();
 const end=new Date(today.getTime()+86400000).toISOString();
 const published=count(db,"SELECT count(*) AS n FROM releases r JOIN users u ON u.id=r.owner_id WHERE "+visible);
 const artists=count(db,"SELECT count(DISTINCT r.owner_id) AS n FROM releases r JOIN users u ON u.id=r.owner_id WHERE "+visible);
 const campaignVisibility="c.moderation_status='visible' AND r.visibility='public' AND u.status='active'";
 const campaignFrom=" FROM campaigns c JOIN releases r ON r.id=c.release_id JOIN users u ON u.id=c.owner_id WHERE "+campaignVisibility+publicOnly(db);
 const funded=count(db,"SELECT count(*) AS n"+campaignFrom+" AND c.status='active' AND c.paid_cents>c.spent_cents");
 const sandbox=sandboxEnabled?count(db,"SELECT count(*) AS n"+campaignFrom+" AND c.status='sandbox_active' AND c.sandbox_funded_cents>c.sandbox_spent_cents"):0;
 const events=db.prepare("SELECT substr(v.created_at,1,10) AS day,count(*) AS views FROM release_views v JOIN releases r ON r.id=v.release_id JOIN users u ON u.id=r.owner_id WHERE "+visible+" AND v.created_at>=? AND v.created_at<? GROUP BY day ORDER BY day").all(start,end);
 const eventMap=new Map(events.map(e=>[e.day,num(e.views)]));
 const series=Array.from({length:span},(_,i)=>{
  const day=new Date(Date.parse(start)+i*86400000).toISOString().slice(0,10);
  return {day,views:eventMap.get(day)||0};
 });
 const trending=db.prepare("SELECT r.id,r.title,r.genre,u.display_name AS artist_name,count(v.user_id) AS views FROM release_views v JOIN releases r ON r.id=v.release_id JOIN users u ON u.id=r.owner_id WHERE "+visible+" AND v.created_at>=? AND v.created_at<? GROUP BY r.id ORDER BY views DESC,r.created_at DESC,r.id LIMIT 5").all(start,end);
 const result={period_days:span,generated_at:at.toISOString(),scope:'public_viewly_plays',public:{published,artists,funded,sandbox,views:series.reduce((s,x)=>s+x.views,0),series,trending},personal:null};
 if(!actor)return result;
 const id=actor.id,creator=['artist','label','admin'].includes(actor.role);
 const mine={
  account_id:id,creator,
  clips:count(db,"SELECT count(*) AS n FROM clips WHERE user_id=?",id),
  submissions:count(db,"SELECT count(*) AS n FROM submissions WHERE user_id=?",id),
  awaiting_review:count(db,"SELECT count(*) AS n FROM submissions WHERE user_id=? AND status='pending'",id),
  tiktok_connected:!!count(db,"SELECT count(*) AS n FROM social_connections WHERE user_id=? AND provider='tiktok' AND status='active'",id),
  recorded_reward_cents:count(db,"SELECT COALESCE(sum(amount_cents),0) AS n FROM wallet_ledger WHERE user_id=?",id),
  sandbox_reward_cents:count(db,"SELECT COALESCE(sum(quoted_reward_cents),0) AS n FROM sandbox_creator_rewards WHERE user_id=?",id)+count(db,"SELECT COALESCE(sum(accrued_cents),0) AS n FROM cpm_submissions WHERE clipper_id=?",id),
  withdrawable_cents:0
 };
 if(creator){
  mine.releases=count(db,"SELECT count(*) AS n FROM releases WHERE owner_id=?",id);
  mine.drafts=count(db,"SELECT count(*) AS n FROM campaigns WHERE owner_id=? AND status IN ('draft','awaiting_payment')",id);
  mine.review_queue=count(db,"SELECT count(*) AS n FROM submissions s JOIN campaigns c ON c.id=s.campaign_id WHERE c.owner_id=? AND s.status='pending'",id);
  mine.own_views=count(db,"SELECT count(*) AS n FROM release_views v JOIN releases r ON r.id=v.release_id WHERE r.owner_id=? AND v.created_at>=? AND v.created_at<?",id,start,end);
  mine.campaigns=db.prepare("SELECT id,title,status,budget_cents,paid_cents,spent_cents,sandbox_funded_cents,sandbox_spent_cents FROM campaigns WHERE owner_id=? ORDER BY created_at DESC,id LIMIT 4").all(id).map(c=>{
   const test=['sandbox_active','sandbox_paused','sandbox_completed'].includes(c.status)||c.sandbox_funded_cents>0;
   const funded=num(test?c.sandbox_funded_cents:c.paid_cents),spent=num(test?c.sandbox_spent_cents:c.spent_cents);
   return {id:c.id,title:c.title,status:c.status,mode:test?'sandbox':'recorded',budget_cents:num(c.budget_cents),funded_cents:funded,spent_cents:spent};
  });
 }
 result.personal=mine;
 return result;
}
