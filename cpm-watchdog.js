/* In-process TikTok CPM monitoring for Viewly staging.
 * Uses official owner-scoped TikTok Display API, never scraped/guessed metrics.
 * Operations are idempotent through the atomic accrual calculation.
 * A dedicated scheduled worker/queue is still recommended before production.
 */
import {isSandboxBilling} from './billing-core.js';
import {verifyTikTokVideo,socialAvailability} from './social-oauth.js';
import {applyOfficialObservation} from './creator-campaigns.js';

const SIX_HOURS=6*60*60*1000;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function startCpmWatchdog({db,id,now,fail,broadcast}){
 let running=false;
 async function sweep(){
  if(running||!isSandboxBilling()||!socialAvailability().tiktok)return {skipped:true};
  running=true;
  let checked=0,failed=0,missing=0;
  try{
   const cutoff=new Date(Date.now()-SIX_HOURS).toISOString();
   const rows=db.prepare("SELECT s.submission_id,s.clipper_id,s.tiktok_video_id,c.status FROM cpm_submissions s JOIN campaigns c ON c.id=s.campaign_id WHERE s.review_status='approved' AND s.monitoring_until>? AND c.status IN ('sandbox_active','sandbox_paused') AND (s.last_checked_at IS NULL OR s.last_checked_at<?) ORDER BY COALESCE(s.last_checked_at,'') ASC LIMIT 40").all(now(),cutoff);
   for(const sub of rows){
    try{
     const remote=await verifyTikTokVideo(db,sub.clipper_id,sub.tiktok_video_id,fail);
     const observation=applyOfficialObservation({db,sid:sub.submission_id,remote,id,now,fail});
     checked++;
     if(!observation.owned)missing++;
     if(observation.new_test_credit_cents>0||observation.needs_human_review)broadcast('cpm-observation');
    }catch(err){
     failed++;
     // Invalid or revoked credentials are not evidence of video deletion; hold until reconnection.
     if(err?.status===403){
      db.prepare("UPDATE cpm_submissions SET risk_flag=CASE WHEN risk_flag='' THEN 'SOCIAL_RECONNECT_REQUIRED' ELSE risk_flag END WHERE submission_id=?")
       .run(sub.submission_id);
      broadcast('cpm-connection-risk');
     }
    }
    await sleep(800); // bounded provider call rate; no burst polling
   }
   return {checked,failed,missing};
  }catch{
   return {checked,failed:failed+1,missing};
  }finally{running=false}
 }
 const first=setTimeout(()=>{sweep().catch(()=>{});},55000);first.unref();
 const periodic=setInterval(()=>{sweep().catch(()=>{});},SIX_HOURS);periodic.unref();
 return {sweep,stop(){clearTimeout(first);clearInterval(periodic)}};
}
