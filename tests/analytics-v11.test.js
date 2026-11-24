import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {budgetMetrics,buildObservedSeries} from '../analytics-core.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const guid=()=>crypto.randomUUID();
const utcOffset=(days)=>{
 const date=new Date();date.setUTCDate(date.getUTCDate()+days);
 date.setUTCHours(12,0,0,0);return date.toISOString();
};
test('V11 budget data strictly partitions pending, settled and other allocations without inventing funds',()=>{
 const b=budgetMetrics({status:'sandbox_active',sandbox_funded_cents:10000,sandbox_spent_cents:350,
  budget_cents:10000,fee_cents:500,paid_cents:0,spent_cents:0},
  {pendingCpm:200,settledCpm:100,periodAllocated:200});
 assert.equal(b.funded_cents,10000);
 assert.equal(b.allocated_cents,350);
 assert.equal(b.pending_cpm_cents,200);
 assert.equal(b.settled_cpm_cents,100);
 assert.equal(b.other_allocated_cents,50);
 assert.equal(b.available_cents,9650);
 assert.equal(b.utilization_percent,3.5);
 assert.equal(b.actual_paid_cents,0);
 assert.equal(b.reference_total_cents,10500);
 assert.equal(b.credit_kind,'non_withdrawable_test_credits');
 const zero=budgetMetrics({status:'draft',sandbox_funded_cents:0,sandbox_spent_cents:0,paid_cents:0,spent_cents:0,budget_cents:10000,fee_cents:500});
 assert.equal(zero.available_cents,0);
 assert.equal(zero.utilization_percent,0);
});
test('V11 API returns only real owner records, keeps missing check days unknown and prevents cross-account analytics',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'viewly-v11-'));
 const dbDir=path.join(dir,'db'),port=33000+Math.floor(Math.random()*14500),base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['--disable-warning=ExperimentalWarning',path.join(root,'server.js')],{
  cwd:root,stdio:'pipe',
  env:{...process.env,PORT:String(port),APP_URL:base,VIEWLY_DATA_DIR:dbDir,VIEWLY_UPLOAD_DIR:path.join(dir,'uploads'),
   VIEWLY_BILLING_MODE:'sandbox',VIEWLY_BILLING_SANDBOX_ALLOWED:'true',TIKTOK_CLIENT_KEY:'',TIKTOK_CLIENT_SECRET:''}
 });
 t.after(()=>{child.kill('SIGTERM');fs.rmSync(dir,{recursive:true,force:true})});
 let alive=false;
 for(let i=0;i<160;i++){await new Promise(r=>setTimeout(r,90));try{if((await fetch(base+'/api/health')).ok){alive=true;break}}catch{}}
 assert.ok(alive,'analytics test server healthy');
 let cookie='';
 async function get(endpoint,useCookie=true){
  const res=await fetch(base+'/api'+endpoint,{headers:useCookie&&cookie?{Cookie:cookie}:{}});
  return {status:res.status,body:await res.json()};
 }
 async function register(email,name,role){
  const res=await fetch(base+'/api/register',{method:'POST',headers:{'X-Viewly-Request':'1','Content-Type':'application/json'},
   body:JSON.stringify({email,username:name,display_name:name,role,password:'V11LongSecurePassword#123'})});
  const body=await res.json();
  const session=res.headers.getSetCookie().find(s=>s.startsWith('viewly_session='));
  cookie=session?.split(';')[0]||'';
  assert.equal(res.status,201,JSON.stringify(body));
  return {id:body.user.id,cookie};
 }
 assert.equal((await get('/analytics/overview',false)).status,401);
 const owner=await register('v11owner@example.test','v11owner','artist');
 const clipper=await register('v11clipper@example.test','v11clipper','viewer');
 assert.equal((await get('/analytics/overview')).status,403,'viewer role has no artist analytics access');
 cookie=owner.cookie;
 const db=new DatabaseSync(path.join(dbDir,'viewly.sqlite'));
 db.exec('PRAGMA busy_timeout=3000');
 const release=guid(),cid=guid(),connection=guid(),sid=guid(),sid2=guid();
 db.prepare('INSERT INTO releases(id,owner_id,title,description,genre,file_name,created_at) VALUES (?,?,?,?,?,?,?)')
  .run(release,owner.id,'V11 Original Track','Original test music','Trap',crypto.randomBytes(20).toString('hex')+'.mp4',utcOffset(-15));
 db.prepare("INSERT INTO campaigns(id,owner_id,release_id,title,brief,platform,reward_cents,budget_cents,fee_cents,paid_cents,spent_cents,status,created_at,pricing_model,cpm_rate_cents,max_clip_cents,min_views,tracking_days,sandbox_funded_cents,sandbox_spent_cents) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
  .run(cid,owner.id,release,'Analytics Campaign','A real original campaign with measured observations','TikTok',100,10000,500,0,0,'sandbox_active',utcOffset(-14),'cpm',100,2500,1000,30,10000,350);
 db.prepare("INSERT INTO social_connections(id,user_id,provider,provider_user_id,display_name,avatar_url,scopes,status,encrypted_token,token_expires_at,connected_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
  .run(connection,clipper.id,'tiktok','test-tiktok-openid','Clipper','','video.list','active','encrypted-test-string',Date.now()+200000,utcOffset(-12),utcOffset(-12));
 const submissions=[[sid,'sandbox_approved','7234567890123456789'],[sid2,'sandbox_pending','7234567890123456790']];
 for(const [sub,status,video] of submissions){
  db.prepare('INSERT INTO submissions(id,campaign_id,user_id,post_url,status,created_at) VALUES(?,?,?,?,?,?)')
   .run(sub,cid,clipper.id,'https://www.tiktok.com/@v11clipper/video/'+video,status,utcOffset(-3));
 }
 const monitoring=utcOffset(20);
 db.prepare("INSERT INTO cpm_submissions(submission_id,campaign_id,clipper_id,connection_id,tiktok_video_id,post_url,posted_at,submitted_at,review_status,reported_views,highest_views,accrued_cents,settled_cents,last_checked_at,monitoring_until) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
  .run(sid,cid,clipper.id,connection,'7234567890123456789','https://www.tiktok.com/@v11clipper/video/7234567890123456789',utcOffset(-12),utcOffset(-3),'approved',200,200,300,100,utcOffset(0),monitoring);
 db.prepare("INSERT INTO cpm_submissions(submission_id,campaign_id,clipper_id,connection_id,tiktok_video_id,post_url,posted_at,submitted_at,review_status,reported_views,highest_views,accrued_cents,settled_cents,last_checked_at,monitoring_until,risk_flag) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
  .run(sid2,cid,clipper.id,connection,'7234567890123456790','https://www.tiktok.com/@v11clipper/video/7234567890123456790',utcOffset(-3),utcOffset(-3),'pending',500,500,0,0,utcOffset(0),monitoring,'UNUSUAL_VIEW_SPIKE');
 const snapshot=(sub,day,views)=>db.prepare('INSERT INTO cpm_view_snapshots VALUES (?,?,?,?,?,?,?)')
  .run(guid(),sub,views,'visible',utcOffset(day),'tiktok','Official owner-scoped API observation, test fixture');
 snapshot(sid,-31,60);
 snapshot(sid,-2,100);
 snapshot(sid,-1,150);
 snapshot(sid,0,200);
 snapshot(sid2,0,500);
 db.prepare('INSERT INTO cpm_events VALUES (?,?,?,?,?,?,?,?)')
 .run(guid(),sid,0,200,200,100,utcOffset(-1),'Test credit event');
 db.prepare('INSERT INTO cpm_events VALUES (?,?,?,?,?,?,?,?)')
 .run(guid(),sid,200,300,100,200,utcOffset(0),'Test credit event');
 db.prepare('INSERT INTO sandbox_creator_rewards VALUES (?,?,?,?,?,?,?)')
 .run(guid(),sid2,clipper.id,cid,50,0,utcOffset(0));
 const overview=await get('/analytics/overview?days=7');
 assert.equal(overview.status,200,JSON.stringify(overview.body));
 assert.equal(overview.body.totals.campaigns,1);
 assert.equal(overview.body.totals.funded_cents,10000);
 assert.equal(overview.body.totals.allocated_cents,350);
 assert.equal(overview.body.totals.available_cents,9650);
 assert.equal(overview.body.totals.latest_reported_views,700);
 assert.equal(overview.body.totals.creator_count,1);
 const report=await get('/analytics/campaigns/'+cid+'?days=7');
 assert.equal(report.status,200,JSON.stringify(report.body));
 assert.equal(report.body.counts.reported_views_latest,700);
 assert.equal(report.body.counts.submissions,2);
 assert.equal(report.body.counts.flagged,1);
 assert.equal(report.body.counts.pending,1);
 assert.equal(report.body.counts.approved,1);
 assert.equal(report.body.budget.mode,'sandbox');
 assert.equal(report.body.budget.available_cents,9650);
 assert.equal(report.body.budget.pending_cpm_cents,200);
 assert.equal(report.body.budget.settled_cpm_cents,100);
 assert.equal(report.body.budget.other_allocated_cents,50);
 assert.equal(report.body.budget.actual_paid_cents,0);
 assert.equal(report.body.top_clippers[0].username,'v11clipper');
 assert.equal(report.body.top_clippers[0].reported_views_latest,700);
 assert.equal(report.body.series.length,7);
 const days=report.body.series;
 assert.equal(days.at(-1).observed_view_delta,550,'newly observed first full check and increments, not repeated snapshot sums');
 assert.equal(days.at(-2).observed_view_delta,50);
 assert.equal(days.at(-3).observed_view_delta,40);
 assert.equal(days.at(-4).observed_view_delta,null,'no API check is unknown, not zero');
 assert.equal(report.body.series_summary.observed_delta_in_range,640);
 assert.equal(report.body.series_summary.credit_allocation_in_range_cents,350);
 assert.equal(report.body.methodology.external_view_fraud_certified,false);
 assert.equal((await get('/analytics/campaigns/'+cid+'?days=10')).status,422);
 assert.equal((await get('/analytics/campaigns/'+guid())).status,404);
 // Stale daily view deltas do NOT double count after a repeated observation.
 const series=buildObservedSeries(db,cid,7);
 assert.equal(series.length,7);
 cookie=clipper.cookie;
 assert.equal((await get('/analytics/campaigns/'+cid+'?days=30')).status,403);
 const other=await register('v11other@example.test','v11other','artist');
 assert.equal((await get('/analytics/overview')).body.totals.campaigns,0);
 assert.equal((await get('/analytics/campaigns/'+cid)).status,404,'owner authorization prevents cross-account disclosure');
 assert.equal(db.prepare('SELECT count(*) AS n FROM payment_orders').get().n,0);
 assert.equal(db.prepare('SELECT count(*) AS n FROM wallet_ledger').get().n,0);
 assert.equal(db.prepare('SELECT count(*) AS n FROM cpm_events').get().n,2);
 db.close();
});
