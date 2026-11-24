/* Viewly V10: artist campaign wizard, rights-managed media assets and reviewable CPM submissions.
   No fake TikTok views. No financial payouts. Sandbox money is isolated from real ledgers. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {isSandboxBilling} from './billing-core.js';
import {parseTikTokUrl,verifyTikTokVideo,connectedTikTok} from './social-oauth.js';

const GUID=/^[a-f0-9-]{36}$/i;
const types={
 'video/mp4':{ext:'.mp4',max:55e6},'video/webm':{ext:'.webm',max:55e6},
 'image/jpeg':{ext:'.jpg',max:12e6},'image/png':{ext:'.png',max:12e6},
 'image/webp':{ext:'.webp',max:12e6},'audio/mpeg':{ext:'.mp3',max:25e6},
 'audio/wav':{ext:'.wav',max:25e6},'application/pdf':{ext:'.pdf',max:12e6}
};
const clampString=(v,n)=>String(v??'').trim().slice(0,n);
function assertAsset(part,fail){
 const kind=types[part?.type||''];
 if(!kind||!part.content?.length)throw fail(415,'Use MP4/WebM, JPG/PNG/WebP, MP3/WAV or PDF. Executables and archives are not accepted.');
 if(part.content.length>kind.max)throw fail(413,'This asset exceeds the allowed file size for its format.');
 const b=part.content,hex=(n)=>b.subarray(0,n).toString('hex');
 if(part.type==='video/mp4'&&!b.subarray(4,12).toString('latin1').includes('ftyp'))throw fail(415,'Invalid MP4 signature.');
 if(part.type==='video/webm'&&hex(4)!=='1a45dfa3')throw fail(415,'Invalid WebM signature.');
 if(part.type==='image/jpeg'&&hex(2)!=='ffd8')throw fail(415,'Invalid JPG signature.');
 if(part.type==='image/png'&&hex(8)!=='89504e470d0a1a0a')throw fail(415,'Invalid PNG signature.');
 if(part.type==='image/webp'&&(b.subarray(0,4).toString()!=='RIFF'||b.subarray(8,12).toString()!=='WEBP'))throw fail(415,'Invalid WebP signature.');
 if(part.type==='audio/mpeg'&&!(b.subarray(0,3).toString()==='ID3'||b[0]===255&&(b[1]&224)===224))throw fail(415,'Invalid MP3 signature.');
 if(part.type==='audio/wav'&&!(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WAVE'))throw fail(415,'Invalid WAV signature.');
 if(part.type==='application/pdf'&&b.subarray(0,5).toString()!=='%PDF-')throw fail(415,'Invalid PDF signature.');
 return kind;
}
export function calculateCpmDelta({views,rate_cents,min_views,max_clip_cents,already_accrued_cents,available_budget_cents}){
 if(!Number.isSafeInteger(views)||views<min_views||rate_cents<=0)return 0;
 const quoted=Math.min(max_clip_cents,Math.floor(views*rate_cents/1000));
 return Math.max(0,Math.min(quoted-already_accrued_cents,available_budget_cents));
}
function tx(db,fn){db.exec('BEGIN IMMEDIATE');try{const v=fn();db.exec('COMMIT');return v;}catch(e){db.exec('ROLLBACK');throw e;}}
function add(db,table,name,definition){
 if(!db.prepare('PRAGMA table_info('+table+')').all().some(x=>x.name===name))db.exec('ALTER TABLE '+table+' ADD COLUMN '+name+' '+definition);
}
export function initCreatorCampaigns(db){
 for(const [name,definition] of Object.entries({
  pricing_model:"TEXT NOT NULL DEFAULT 'per_post'",cpm_rate_cents:"INTEGER NOT NULL DEFAULT 0",
  max_clip_cents:"INTEGER NOT NULL DEFAULT 0",min_views:"INTEGER NOT NULL DEFAULT 0",
  tracking_days:"INTEGER NOT NULL DEFAULT 30",rules:"TEXT NOT NULL DEFAULT ''",
  mandatory_hashtags:"TEXT NOT NULL DEFAULT ''",sample_caption:"TEXT NOT NULL DEFAULT ''",
  prohibited_content:"TEXT NOT NULL DEFAULT ''",spotify_track_url:"TEXT NOT NULL DEFAULT ''",
  rights_confirmed:"INTEGER NOT NULL DEFAULT 0",launched_at:'TEXT',paused_at:'TEXT'
 }))add(db,'campaigns',name,definition);
 db.exec("CREATE TABLE IF NOT EXISTS campaign_assets(id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL REFERENCES campaigns(id),owner_id TEXT NOT NULL REFERENCES users(id),label TEXT NOT NULL,mime TEXT NOT NULL,storage_name TEXT NOT NULL UNIQUE,bytes INTEGER NOT NULL,sha256 TEXT NOT NULL,hidden_at TEXT,created_at TEXT NOT NULL);");
 db.exec("CREATE TABLE IF NOT EXISTS cpm_submissions(submission_id TEXT PRIMARY KEY REFERENCES submissions(id),campaign_id TEXT NOT NULL REFERENCES campaigns(id),clipper_id TEXT NOT NULL REFERENCES users(id),connection_id TEXT NOT NULL REFERENCES social_connections(id),tiktok_video_id TEXT NOT NULL UNIQUE,post_url TEXT NOT NULL,posted_at TEXT NOT NULL,submitted_at TEXT NOT NULL,review_status TEXT NOT NULL DEFAULT 'pending',review_reason TEXT NOT NULL DEFAULT '',reviewed_at TEXT,reported_views INTEGER NOT NULL DEFAULT 0,highest_views INTEGER NOT NULL DEFAULT 0,accrued_cents INTEGER NOT NULL DEFAULT 0,settled_cents INTEGER NOT NULL DEFAULT 0,last_checked_at TEXT,hold_until TEXT,post_access TEXT NOT NULL DEFAULT 'visible',risk_flag TEXT NOT NULL DEFAULT '',missing_checks INTEGER NOT NULL DEFAULT 0,monitoring_until TEXT NOT NULL,appeal_reason TEXT NOT NULL DEFAULT '');");
 db.exec("CREATE TABLE IF NOT EXISTS cpm_view_snapshots(id TEXT PRIMARY KEY,submission_id TEXT NOT NULL REFERENCES cpm_submissions(submission_id),provider_views INTEGER,post_access TEXT NOT NULL,checked_at TEXT NOT NULL,provider TEXT NOT NULL DEFAULT 'tiktok',note TEXT NOT NULL);");
 db.exec("CREATE TABLE IF NOT EXISTS cpm_events(id TEXT PRIMARY KEY,submission_id TEXT NOT NULL REFERENCES cpm_submissions(submission_id),prior_cents INTEGER NOT NULL,new_cents INTEGER NOT NULL,delta_cents INTEGER NOT NULL,observed_views INTEGER NOT NULL,created_at TEXT NOT NULL,note TEXT NOT NULL);");
 db.exec("CREATE TABLE IF NOT EXISTS campaign_review_audit(id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL REFERENCES campaigns(id),submission_id TEXT,actor_id TEXT NOT NULL REFERENCES users(id),action TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL);");
 db.exec('CREATE INDEX IF NOT EXISTS idx_cpm_by_artist ON cpm_submissions(campaign_id,submitted_at DESC)');
}
const publicAsset=(a)=>({id:a.id,label:a.label,mime:a.mime,bytes:a.bytes,sha256:a.sha256,created_at:a.created_at,download_url:'/api/campaigns/'+a.campaign_id+'/assets/'+a.id,preview_url:['image/jpeg','image/png','image/webp','video/mp4','video/webm'].includes(a.mime)?'/api/campaigns/'+a.campaign_id+'/assets/'+a.id+'?preview=1':null});
const publicSubmission=(r)=>({submission_id:r.submission_id,campaign_id:r.campaign_id,clipper_id:r.clipper_id,
 clipper_name:r.clipper_name,tiktok_video_id:r.tiktok_video_id,post_url:r.post_url,posted_at:r.posted_at,
 submitted_at:r.submitted_at,review_status:r.review_status,review_reason:r.review_reason,
 reported_views:r.reported_views,highest_views:r.highest_views,accrued_cents:r.accrued_cents,
 settled_cents:r.settled_cents,hold_until:r.hold_until,last_checked_at:r.last_checked_at,post_access:r.post_access,
 risk_flag:r.risk_flag,appeal_reason:r.appeal_reason,monitoring_until:r.monitoring_until,
 payable_cents:0,source:'TikTok API reported views only; no independent fraud certification; sandbox credits are non-withdrawable'});
export function applyOfficialObservation({db,sid,remote,id,now,fail}){
 const row=db.prepare('SELECT * FROM cpm_submissions WHERE submission_id=?').get(sid);
 if(!row)throw fail(404,'Submission not found.');
 const camp=db.prepare('SELECT * FROM campaigns WHERE id=?').get(row.campaign_id);
 if(!camp)throw fail(404,'Campaign not found.');
  return tx(db,()=>{
   const current=db.prepare('SELECT * FROM cpm_submissions WHERE submission_id=?').get(sid);
   const active=remote.owned&&remote.available;
   const missing=active?0:current.missing_checks+1;
   const max=active?Math.max(current.highest_views,remote.views):current.highest_views;
   const previousCheck=current.last_checked_at?Date.parse(current.last_checked_at):Date.parse(current.submitted_at);
   const elapsed=Math.max(1,Date.now()-previousCheck);
   const sudden=active&&remote.views>current.highest_views&&(remote.views-current.highest_views)>250000&&elapsed<6*3600000;
   const decline=active&&remote.views<current.highest_views;
   const risk=sudden?'UNUSUAL_VIEW_SPIKE':decline?'VIEW_COUNT_DECLINED':missing>=2?'POST_UNAVAILABLE':current.risk_flag;
   const access=active?'visible':missing>=2?'missing':'unconfirmed';
   const budget=Math.max(0,camp.sandbox_funded_cents-camp.sandbox_spent_cents);
   const eligible=current.review_status==='approved'&&active&&!risk&&Date.now()<=Date.parse(current.monitoring_until)&&camp.status==='sandbox_active';
   const delta=eligible?calculateCpmDelta({views:max,rate_cents:camp.cpm_rate_cents,min_views:camp.min_views,max_clip_cents:camp.max_clip_cents,already_accrued_cents:current.accrued_cents,available_budget_cents:budget}):0;
   if(delta){
    db.prepare('UPDATE campaigns SET sandbox_spent_cents=sandbox_spent_cents+? WHERE id=?').run(delta,camp.id);
    db.prepare('INSERT INTO cpm_events VALUES(?,?,?,?,?,?,?,?)').run(id(),sid,current.accrued_cents,current.accrued_cents+delta,delta,max,now(),'TikTok API-reported view increment; non-withdrawable sandbox reservation');
   }
   const hold=delta?new Date(Date.now()+72*3600000).toISOString():current.hold_until;
   db.prepare('UPDATE cpm_submissions SET reported_views=?,highest_views=?,accrued_cents=accrued_cents+?,last_checked_at=?,hold_until=?,post_access=?,risk_flag=?,missing_checks=? WHERE submission_id=?')
    .run(active?remote.views:current.reported_views,max,delta,now(),hold,access,risk,missing,sid);
   db.prepare('INSERT INTO cpm_view_snapshots VALUES(?,?,?,?,?,?,?)').run(id(),sid,active?remote.views:null,access,now(),'tiktok',
    active?'Official TikTok API video.query; not fraud-certified':'No video returned by owner-scoped TikTok API');
   return {owned:active,reported_views:active?remote.views:null,highest_views:max,new_test_credit_cents:delta,
    total_test_credit_cents:current.accrued_cents+delta,available_budget_cents:budget-delta,post_access:access,risk_flag:risk,
    charged_cents:0,withdrawable_cents:0,hold_until:hold,needs_human_review:!!risk};
  });

}
export function createCreatorCampaignHandler({db,requireUser,requireCreator,sessionUser,fail,json,send,now,id,broadcast,
 assertQuota,money,readBody,multipart,serveFile,UPLOADS,campaignRows}){
 const lookup=(cid)=>db.prepare('SELECT * FROM campaigns WHERE id=?').get(cid);
 const creator=(req,camp)=>{const u=requireCreator(req);if(camp.owner_id!==u.id)throw fail(403,'Only the campaign owner can manage this campaign.');return u;};
 const viewable=(req,camp)=>{
  if(!camp)throw fail(404,'Campaign not found.');
  const u=sessionUser(req);
  const visible=camp.moderation_status==='visible'&&(camp.status==='active'||camp.status==='sandbox_active'&&isSandboxBilling())&&
   db.prepare("SELECT 1 FROM releases r JOIN users owner ON owner.id=r.owner_id WHERE r.id=? AND r.visibility='public' AND owner.status='active'").get(camp.release_id);
  if(!visible&&u?.id!==camp.owner_id&&u?.role!=='admin')throw fail(404,'Campaign not found.');
  return u;
 };
 const log=(campaign,sub,actor,action,note)=>db.prepare('INSERT INTO campaign_review_audit VALUES(?,?,?,?,?,?,?)').run(id(),campaign,sub,actor,action,note,now());
 const params=(b)=>{
  const name=clampString(b.title,100),brief=clampString(b.brief,4500);
  const rate=money(b.rate_eur_per_1000),budget=money(b.budget_eur),cap=money(b.max_per_clip_eur);
  const min=Math.round(Number(b.min_views)),days=Math.round(Number(b.tracking_days||30));
  if(name.length<3||brief.length<60)throw fail(422,'Enter a title and detailed campaign brief (at least 60 characters).');
  if(!Number.isInteger(rate)||rate<50||rate>1000)throw fail(422,'CPM must be €0.50–€10.00 per 1,000 views.');
  if(!Number.isInteger(budget)||budget<1000||budget>10000000)throw fail(422,'Budget must be €10–€100,000.');
  if(!Number.isInteger(cap)||cap<rate||cap>budget)throw fail(422,'Maximum per clip must fit the budget and be at least one CPM unit.');
  if(!Number.isInteger(min)||min<100||min>1000000)throw fail(422,'Minimum verified views must be 100–1,000,000.');
  if(!Number.isInteger(days)||days<7||days>60)throw fail(422,'Tracking period must be between 7 and 60 days.');
  if(b.rights_confirmed!==true)throw fail(422,'Confirm you own or are licensed to distribute all promotional assets.');
  const hashtags=clampString(b.mandatory_hashtags,180),caption=clampString(b.sample_caption,280),
   prohibited=clampString(b.prohibited_content,800),rules=clampString(b.rules,2000);
  let spotify='';
  if(b.spotify_track_url){let u;try{u=new URL(String(b.spotify_track_url));}catch{throw fail(422,'Invalid Spotify track URL.');}
   if(u.protocol!=='https:'||u.hostname!=='open.spotify.com'||!/^\/(track|album)\/[A-Za-z0-9]{22}\/?$/.test(u.pathname))throw fail(422,'Use a Spotify track or album link.');
   spotify=u.origin+u.pathname;
  }
  return {name,brief,rate,budget,cap,min,days,hashtags,caption,prohibited,rules,spotify};
 };
 function settlement(sub,views,available,camp){
  return calculateCpmDelta({views,rate_cents:camp.cpm_rate_cents,min_views:camp.min_views,
   max_clip_cents:camp.max_clip_cents,already_accrued_cents:sub.accrued_cents,available_budget_cents:available});
 }
 async function refresh(req,res,sid){
  const actor=requireUser(req);
  const row=db.prepare('SELECT * FROM cpm_submissions WHERE submission_id=?').get(sid);
  if(!row)throw fail(404,'Submission not found.');
  const camp=lookup(row.campaign_id);
  if(!camp||![row.clipper_id,camp.owner_id].includes(actor.id)&&actor.role!=='admin')throw fail(403,'Not your submission.');
  if(!isSandboxBilling())throw fail(503,'No live payout verification has been enabled.');
  const remote=await verifyTikTokVideo(db,row.clipper_id,row.tiktok_video_id,fail);
  const answer=applyOfficialObservation({db,sid,remote,id,now,fail});
  broadcast('cpm-views');return send(res,200,answer);
 }
 return async function handle(req,res,url){
  const p=url.pathname;
  if((p==='/api/campaigns/v10'||p==='/api/campaigns/v14')&&req.method==='POST'){
   const u=requireCreator(req);
   assertQuota(db,u.id,'campaigns',fail,id,now);
   const b=await json(req),conf=params(b);
   const release=db.prepare("SELECT id FROM releases WHERE id=? AND owner_id=? AND visibility='public'").get(b.release_id,u.id);
   if(!release)throw fail(422,'Choose a published original music release you own.');
   const cid=id(),created=now(),fee=Math.round(conf.budget*.05);
   db.exec('BEGIN IMMEDIATE');try{
   db.prepare("INSERT INTO campaigns(id,owner_id,release_id,title,brief,platform,reward_cents,budget_cents,fee_cents,created_at,pricing_model,cpm_rate_cents,max_clip_cents,min_views,tracking_days,rules,mandatory_hashtags,sample_caption,prohibited_content,spotify_track_url,rights_confirmed) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)")
    .run(cid,u.id,release.id,conf.name,conf.brief,'TikTok',conf.rate,conf.budget,fee,created,'cpm',conf.rate,conf.cap,conf.min,conf.days,conf.rules,conf.hashtags,conf.caption,conf.prohibited,conf.spotify);
   if(p.endsWith('/v14'))db.prepare('INSERT INTO campaign_branding(campaign_id) VALUES(?)').run(cid);
   db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
   broadcast('cpm-campaign');return send(res,201,{campaign:campaignRows('WHERE c.id=?',[cid])[0],
    note:'Draft created. Review the assets and funding quote before test activation. No charge.'});
  }
  const assets=p.match(/^\/api\/campaigns\/([a-f0-9-]{36})\/assets(?:\/([a-f0-9-]{36}))?$/i);
  if(assets){
   const campaign=lookup(assets[1]);viewable(req,campaign);
   if(req.method==='GET'&&!assets[2]){
    const rows=db.prepare('SELECT * FROM campaign_assets WHERE campaign_id=? AND hidden_at IS NULL ORDER BY created_at DESC').all(campaign.id);
    return send(res,200,{assets:rows.map(publicAsset),campaign_id:campaign.id});
   }
   if(req.method==='GET'&&assets[2]){
    const asset=db.prepare('SELECT * FROM campaign_assets WHERE id=? AND campaign_id=?').get(assets[2],campaign.id);
    if(!asset||asset.hidden_at)throw fail(404,'Asset not available.');
    res.setHeader('Content-Disposition',url.searchParams.get('preview')==='1'&&asset.mime!=='application/pdf'?'inline':'attachment; filename="'+asset.label.replace(/[^a-zA-Z0-9 ._-]/g,'_').slice(0,70)+'"');
    res.setHeader('Cache-Control','private, no-store');
    return serveFile(req,res,path.join(UPLOADS,asset.storage_name));
   }
   const artist=creator(req,campaign);
   if(req.method==='POST'&&!assets[2]){
    if(!['draft','awaiting_payment','sandbox_active'].includes(campaign.status))throw fail(409,'Campaign cannot receive new assets.');
    const total=db.prepare('SELECT count(*) AS n,COALESCE(sum(bytes),0) AS bytes FROM campaign_assets WHERE campaign_id=? AND hidden_at IS NULL').get(campaign.id);
    if(total.n>=16||total.bytes>=200e6)throw fail(413,'Campaign media limit: 16 assets / 200 MB.');
    const parts=multipart(await readBody(req,58e6),req.headers['content-type']||'');
    const file=parts.find(x=>x.name==='asset');const kind=assertAsset(file,fail);
    if(total.bytes+file.content.length>200e6)throw fail(413,'Campaign total media exceeds 200 MB.');
    const basename=crypto.randomBytes(20).toString('hex')+kind.ext,filepath=path.join(UPLOADS,basename);
    const label=clampString(file.fileName,120).replace(/[/\\\x00-\x1f]/g,'_')||('Campaign asset'+kind.ext);
    fs.writeFileSync(filepath,file.content,{flag:'wx',mode:0o600});
    try{
     const aid=id();
     db.prepare('INSERT INTO campaign_assets VALUES(?,?,?,?,?,?,?,?,NULL,?)').run(aid,campaign.id,artist.id,label,file.type,basename,file.content.length,crypto.createHash('sha256').update(file.content).digest('hex'),now());
     log(campaign.id,null,artist.id,'asset.upload',label);
     broadcast('campaign-asset');return send(res,201,{asset:publicAsset(db.prepare('SELECT * FROM campaign_assets WHERE id=?').get(aid))});
    }catch(err){try{fs.unlinkSync(filepath)}catch{}throw err;}
   }
   if(req.method==='DELETE'&&assets[2]){
    const asset=db.prepare('SELECT * FROM campaign_assets WHERE id=? AND campaign_id=? AND hidden_at IS NULL').get(assets[2],campaign.id);
    if(!asset)throw fail(404,'Asset not found.');
    db.prepare('UPDATE campaign_assets SET hidden_at=? WHERE id=?').run(now(),asset.id);
    log(campaign.id,null,artist.id,'asset.hide','Asset hidden; source retained for outstanding evidence and dispute retention.');
    broadcast('campaign-asset');return send(res,200,{ok:true,retained_for_audit:true,
     note:'Hidden from new clippers. Past authorized uses and payout evidence are not erased.'});
   }
   throw fail(405,'Asset operation unavailable.');
  }
  const details=p.match(/^\/api\/campaigns\/([a-f0-9-]{36})\/v10$/i);
  if(details&&req.method==='GET'){
   const camp=lookup(details[1]);const actor=viewable(req,camp);
   const data=campaignRows('WHERE c.id=?',[camp.id])[0];
   const assets=db.prepare('SELECT * FROM campaign_assets WHERE campaign_id=? AND hidden_at IS NULL ORDER BY created_at DESC').all(camp.id).map(publicAsset);
   const isOwner=actor?.id===camp.owner_id||actor?.role==='admin';
   return send(res,200,{campaign:data,assets,social_required:camp.pricing_model==='cpm',
    social_provider:'tiktok',can_submit:isOwner?false:camp.pricing_model==='cpm'&&camp.status==='sandbox_active'&&!!actor&&!!connectedTikTok(db,actor.id),
    artist_has_spotify_oauth:!!db.prepare("SELECT 1 FROM social_connections WHERE user_id=? AND provider='spotify' AND status='active'").get(camp.owner_id),
    creator_eligibility:'Official TikTok ownership must be verified before a CPM submission can earn any sandbox credit.',
    policy:'No auto post deletion, no unverified cash payouts, and no retroactive change to reward terms.'});
  }
  const state=p.match(/^\/api\/campaigns\/([a-f0-9-]{36})\/(pause|resume)$/);
  if(state&&req.method==='POST'){
   const camp=lookup(state[1]);if(!camp)throw fail(404,'Campaign not found.');
   const user=creator(req,camp);
   if(camp.pricing_model!=='cpm'||!['sandbox_active','sandbox_paused'].includes(camp.status))throw fail(409,'This campaign cannot be paused or resumed.');
   const status=state[2]==='pause'?'sandbox_paused':'sandbox_active';
   db.prepare('UPDATE campaigns SET status=?,paused_at=? WHERE id=?').run(status,status==='sandbox_paused'?now():null,camp.id);
   log(camp.id,null,user.id,'campaign.'+state[2],'Future submissions paused; previously reserved test credits retained.');
   broadcast('campaign-state');return send(res,200,{ok:true,status});
  }
  const submissions=p.match(/^\/api\/campaigns\/([a-f0-9-]{36})\/cpm-submissions$/);
  if(submissions){
   const camp=lookup(submissions[1]);viewable(req,camp);
   if(camp.pricing_model!=='cpm')throw fail(422,'This campaign uses per-post rewards, not CPM.');
   if(req.method==='GET'){
    const user=requireUser(req);
    if(user.id!==camp.owner_id&&user.role!=='admin')throw fail(403,'Only the artist sees all submissions.');
    const rows=db.prepare('SELECT c.*,u.username AS clipper_name FROM cpm_submissions c JOIN users u ON u.id=c.clipper_id WHERE c.campaign_id=? ORDER BY c.submitted_at DESC').all(camp.id);
    return send(res,200,{submissions:rows.map(publicSubmission),all_credits_sandbox:true});
   }
   if(req.method==='POST'){
    const user=requireUser(req);
    if(camp.owner_id===user.id)throw fail(403,'You cannot enter your own campaign.');
    if(!isSandboxBilling()||camp.status!=='sandbox_active'||camp.sandbox_funded_cents<=camp.sandbox_spent_cents)
     throw fail(409,'Campaign has no active sandbox funding. Real payments remain disabled.');
    const data=await json(req),parsed=parseTikTokUrl(data.post_url,fail);
    const official=await verifyTikTokVideo(db,user.id,parsed.videoId,fail);
    if(!official.owned)throw fail(403,'This video was not found among videos owned by your connected TikTok account.');
    const activation=db.prepare('SELECT created_at FROM sandbox_campaign_orders WHERE campaign_id=?').get(camp.id);
    if(activation&&Date.parse(official.created_at)<Date.parse(activation.created_at)-60000)throw fail(422,'The video must be posted after this campaign is activated.');
    const existing=db.prepare('SELECT submission_id FROM cpm_submissions WHERE tiktok_video_id=?').get(parsed.videoId);
    if(existing)throw fail(409,'That TikTok video has already been submitted to Viewly.');
    const nowAt=now(),trackingUntil=new Date(Math.min(Date.now(),Date.parse(official.created_at))+camp.tracking_days*86400000).toISOString();
    if(Date.now()>Date.parse(trackingUntil))throw fail(409,'This video is outside the campaign tracking window.');
    const sid=id();
    tx(db,()=>{
     db.prepare("INSERT INTO submissions(id,campaign_id,user_id,post_url,status,created_at) VALUES(?,?,?,?,?,?)")
      .run(sid,camp.id,user.id,parsed.canonical,'sandbox_pending',nowAt);
     db.prepare("INSERT INTO cpm_submissions(submission_id,campaign_id,clipper_id,connection_id,tiktok_video_id,post_url,posted_at,submitted_at,reported_views,highest_views,last_checked_at,monitoring_until) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(sid,camp.id,user.id,official.connection_id,parsed.videoId,parsed.canonical,official.created_at,nowAt,official.views,official.views,nowAt,trackingUntil);
     db.prepare('INSERT INTO cpm_view_snapshots VALUES(?,?,?,?,?,?,?)').run(id(),sid,official.views,'visible',nowAt,'tiktok','First official TikTok ownership check, no reward issued.');
     log(camp.id,sid,user.id,'submission.created','Official TikTok account ownership checked.');
    });
    broadcast('cpm-submission');
    return send(res,201,{submission_id:sid,status:'pending_review',mode:'sandbox',
     verified_owner:true,provider_views:official.views,charged_cents:0,withdrawable_cents:0,
     note:'Post identity and current API view count confirmed. Artist must review the content; view counts are not independently fraud-certified.'});
   }
  }
  if(p==='/api/cpm-submissions/me'&&req.method==='GET'){
   const user=requireUser(req);
   const rows=db.prepare('SELECT c.*,u.username AS clipper_name FROM cpm_submissions c JOIN users u ON u.id=c.clipper_id WHERE c.clipper_id=? ORDER BY c.submitted_at DESC LIMIT 75').all(user.id);
   return send(res,200,{submissions:rows.map(publicSubmission),note:'Reported view counts and credits are sandbox-only; €0 withdrawable.'});
  }
  const cpm=p.match(/^\/api\/cpm-submissions\/([a-f0-9-]{36})(?:\/(refresh|review|settle|appeal))?$/);
  if(cpm){
   const sid=cpm[1],act=cpm[2]||'',r=db.prepare('SELECT * FROM cpm_submissions WHERE submission_id=?').get(sid);
   if(!r)throw fail(404,'CPM submission not found.');
   const camp=lookup(r.campaign_id),user=requireUser(req);
   if(user.id!==r.clipper_id&&user.id!==camp.owner_id&&user.role!=='admin')throw fail(403,'Access denied.');
   if(!act&&req.method==='GET')return send(res,200,{submission:publicSubmission(r),
    checks:db.prepare('SELECT provider_views,post_access,checked_at,note FROM cpm_view_snapshots WHERE submission_id=? ORDER BY checked_at DESC LIMIT 30').all(sid)});
   if(act==='refresh'&&req.method==='POST')return refresh(req,res,sid);
   if(act==='review'&&req.method==='POST'){
    if(user.id!==camp.owner_id&&user.role!=='admin')throw fail(403,'Only the artist or platform moderator may review.');
    if(r.review_status!=='pending'&&r.review_status!=='disputed')throw fail(409,'This submission was already reviewed.');
    const b=await json(req),decision=String(b.decision||''),reason=clampString(b.reason,500);
    if(!['approved','rejected'].includes(decision))throw fail(422,'Choose approve or reject.');
    if(decision==='rejected'&&reason.length<12)throw fail(422,'Explain the rejection so the clipper can appeal.');
    tx(db,()=>{
     db.prepare("UPDATE cpm_submissions SET review_status=?,review_reason=?,reviewed_at=? WHERE submission_id=?").run(decision,reason,now(),sid);
     db.prepare('UPDATE submissions SET status=?,reviewed_at=? WHERE id=?').run('sandbox_'+decision,now(),sid);
     log(camp.id,sid,user.id,'submission.'+decision,reason||'Approved against campaign rules.');
    });
    broadcast('cpm-review');return send(res,200,{ok:true,decision,needs_refresh:true,
     note:'Approval allows API-based test credit accounting only. It is not a real payout.'});
   }
   if(act==='appeal'&&req.method==='POST'){
    if(user.id!==r.clipper_id||r.review_status!=='rejected')throw fail(403,'Only a rejected clipper can appeal.');
    const b=await json(req),reason=clampString(b.reason,500);
    if(reason.length<20)throw fail(422,'Explain your appeal in at least 20 characters.');
    db.prepare("UPDATE cpm_submissions SET review_status='disputed',appeal_reason=? WHERE submission_id=?").run(reason,sid);
    log(camp.id,sid,user.id,'submission.appeal',reason);
    broadcast('cpm-appeal');return send(res,200,{ok:true,status:'disputed',note:'Artist and platform moderation can review the evidence.'});
   }
   if(act==='settle'&&req.method==='POST'){
    if(!isSandboxBilling())throw fail(503,'Settlements require approved payment infrastructure.');
    if(r.review_status!=='approved'||r.risk_flag||r.post_access!=='visible'||!r.hold_until||Date.now()<Date.parse(r.hold_until))
     throw fail(409,'Not eligible to settle. Wait for the hold and review all visibility or risk flags.');
    if(!r.last_checked_at||Date.now()-Date.parse(r.last_checked_at)>3600000)throw fail(409,'Refresh TikTok video ownership and views before finalizing.');
    const updated=tx(db,()=>{
     const current=db.prepare('SELECT * FROM cpm_submissions WHERE submission_id=?').get(sid);
     const amount=current.accrued_cents-current.settled_cents;
     if(amount<0)throw fail(409,'Invalid accounting state.');
     db.prepare('UPDATE cpm_submissions SET settled_cents=? WHERE submission_id=?').run(current.accrued_cents,sid);
     log(camp.id,sid,user.id,'sandbox.settle','Non-withdrawable test credit '+amount+' cents; no cash.');
     return amount;
    });
    broadcast('cpm-settled');return send(res,200,{ok:true,settled_test_credit_cents:updated,
     charged_cents:0,withdrawable_cents:0,notice:'Sandbox settlement is not a real payout.'});
   }
  }
  return false;
 };
}
