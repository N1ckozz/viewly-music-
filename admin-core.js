import {catalog} from './promotions-core.js';
/* Viewly Admin Control Plane: all actions audited and secured server-side.
   Never adjusts verified funding, balances or payouts. */
const short=(v,max=500)=>String(v??'').trim().slice(0,max);
const UUID=/^[a-f0-9-]{36}$/i;
function addColumn(db,table,col,type){
 if(!db.prepare('PRAGMA table_info('+table+')').all().some(x=>x.name===col))
  db.exec('ALTER TABLE '+table+' ADD COLUMN '+col+' '+type);
}
export function initAdmin(db){
 addColumn(db,'users','status',"TEXT NOT NULL DEFAULT 'active'");
 addColumn(db,'users','email_verified','INTEGER NOT NULL DEFAULT 0');
 addColumn(db,'sessions','mfa_verified','INTEGER NOT NULL DEFAULT 0');
 addColumn(db,'releases','visibility',"TEXT NOT NULL DEFAULT 'public'");
 addColumn(db,'campaigns','moderation_status',"TEXT NOT NULL DEFAULT 'visible'");
 addColumn(db,'content_reports','status',"TEXT NOT NULL DEFAULT 'open'");
 addColumn(db,'content_reports','resolved_by','TEXT');
 addColumn(db,'content_reports','resolved_at','TEXT');
 addColumn(db,'submissions','moderation_flag',"TEXT NOT NULL DEFAULT 'clear'");
 addColumn(db,'submissions','moderation_note',"TEXT NOT NULL DEFAULT ''");
 db.exec("CREATE TABLE IF NOT EXISTS site_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_by TEXT,updated_at TEXT NOT NULL);");
 db.exec("CREATE TABLE IF NOT EXISTS admin_audit(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,action TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT NOT NULL,before_json TEXT,after_json TEXT,created_at TEXT NOT NULL);");
 db.exec('CREATE INDEX IF NOT EXISTS idx_admin_audit ON admin_audit(created_at DESC)');
 for(const [key,value] of [['announcement_enabled','false'],['announcement_text',''],['homepage_featured_release_id',''],['support_email','']])
  db.prepare('INSERT OR IGNORE INTO site_settings(key,value,updated_at) VALUES(?,?,?)').run(key,value,new Date().toISOString());
}
export function siteSettings(db){
 const entries=db.prepare('SELECT key,value FROM site_settings').all();
 const obj=Object.fromEntries(entries.map(x=>[x.key,x.value]));
 return {announcement_enabled:obj.announcement_enabled==='true',announcement_text:obj.announcement_text||'',
  homepage_featured_release_id:obj.homepage_featured_release_id||'',support_email:obj.support_email||''};
}
export function createAdminHandler({db,requireUser,fail,json,send,now,id,broadcast,cookieValue,sha}){
 function authorized(req,write){
  const u=requireUser(req);
  if(u.role!=='admin')throw fail(403,'Administrator access required.');
  const owner=db.prepare("SELECT status,email_verified FROM users WHERE id=?").get(u.id);
  if(owner?.status!=='active'||owner.email_verified!==1)throw fail(403,'Verified administrator required.');
  if(db.prepare('SELECT enabled FROM mfa_methods WHERE user_id=?').get(u.id)?.enabled!==1)
   throw fail(403,'Enable MFA in Account Security before accessing Admin.');
  const token=cookieValue(req,'viewly_session');
  const sess=token?db.prepare('SELECT mfa_verified,created_at FROM sessions WHERE token_hash=?').get(sha(token)):null;
  if(sess?.mfa_verified!==1)throw fail(403,'Sign in again with your authenticator to unlock Admin.');
  if(write&&sess.created_at<Date.now()-30*60000)throw fail(403,'Reauthenticate with MFA to change administrator data.');
  return u;
 }
 function log(actor,action,type,target,before,after){
  db.prepare('INSERT INTO admin_audit VALUES (?,?,?,?,?,?,?,?)').run(id(),actor.id,action,type,target,
   JSON.stringify(before??null),JSON.stringify(after??null),now());
 }
 function transaction(work){
  db.exec('BEGIN IMMEDIATE');
  try{const value=work();db.exec('COMMIT');return value}catch(e){db.exec('ROLLBACK');throw e;}
 }
 function fetchRecord(table,identifier,columns='*'){
  const row=db.prepare('SELECT '+columns+' FROM '+table+' WHERE id=?').get(identifier);
  if(!row)throw fail(404,'Record not found.');
  return row;
 }
 const audit=limit=>db.prepare('SELECT a.id,a.actor_id,u.username AS actor,a.action,a.target_type,a.target_id,a.before_json,a.after_json,a.created_at FROM admin_audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT ?').all(limit);
 function list(sql,args=[]){return db.prepare(sql).all(...args);}
 function count(name,where=''){return db.prepare('SELECT count(*) AS n FROM '+name+' '+where).get().n;}
 return async function handleAdmin(req,res,url){
  const path=url.pathname;
  if(!path.startsWith('/api/admin/'))return false;
  const verb=req.method,admin=authorized(req,verb!=='GET');
  if(path==='/api/admin/promotions'&&verb==='GET')return send(res,200,{products:catalog(db)});
  if(path==='/api/admin/promotions'&&verb==='PATCH'){
   const b=await json(req),before=db.prepare('SELECT * FROM promo_products WHERE id=?').get(String(b.id||''));
   if(!before)throw fail(404,'Promotion not found.');
   const price=b.price_cents,hours=b.hours,capacity=b.capacity,enabled=b.enabled;
   if(!Number.isSafeInteger(price)||price<0||price>1000000||!Number.isSafeInteger(hours)||hours<(before.placement==='package'?0:1)||hours>720||!Number.isSafeInteger(capacity)||capacity<(before.placement==='package'?0:1)||capacity>10000||typeof enabled!=='boolean')throw fail(422,'Invalid promotion terms.');
   transaction(()=>{db.prepare('UPDATE promo_products SET price_cents=?,hours=?,capacity=?,enabled=? WHERE id=?').run(price,before.placement==='package'?0:hours,before.placement==='package'?0:capacity,enabled?1:0,before.id);log(admin,'promo.update','promotion',before.id,before,db.prepare('SELECT * FROM promo_products WHERE id=?').get(before.id));});
   broadcast('promo-settings');return send(res,200,{products:catalog(db)});
  }
  const q='%'+short(url.searchParams.get('q')||'',90)+'%';
  const offset=Math.max(0,Math.min(10000,Number.parseInt(url.searchParams.get('offset')||'0',10)||0));
  if(path==='/api/admin/overview'&&verb==='GET'){
   return send(res,200,{counts:{users:count('users'),active_users:count('users',"WHERE status='active'"),
    releases:count('releases'),public_releases:count('releases',"WHERE visibility='public'"),
    campaigns:count('campaigns'),funded_campaigns:count('campaigns',"WHERE paid_cents>0"),
    clips:count('clips'),submissions:count('submissions'),reports_open:count('content_reports',"WHERE status='open'"),
    active_sessions:count('sessions','WHERE expires_at>'+Date.now()),comments:count('release_comments'),
    internal_plays:count('release_views'),payment_orders:count('payment_orders')},
    recent:audit(12),note:'Internal events are not externally verified social views or spendable earnings.'});
  }
  if(path==='/api/admin/users'&&verb==='GET'){
   const rows=list("SELECT u.id,u.email,u.username,u.display_name,u.role,u.status,u.email_verified,u.created_at,EXISTS(SELECT 1 FROM ecosystem_profile_reviews p WHERE p.user_id=u.id) AS profile_reviewed,(SELECT count(*) FROM releases r WHERE r.owner_id=u.id) AS releases_count FROM users u WHERE u.username LIKE ? OR u.display_name LIKE ? OR u.email LIKE ? ORDER BY u.created_at DESC LIMIT 50 OFFSET ?",[q,q,q,offset]);
   return send(res,200,{rows});
  }
  if(path==='/api/admin/releases'&&verb==='GET'){
   const rows=list("SELECT r.id,r.owner_id,r.title,r.description,r.genre,r.visibility,r.created_at,u.username,u.status AS owner_status FROM releases r JOIN users u ON u.id=r.owner_id WHERE r.title LIKE ? OR u.username LIKE ? ORDER BY r.created_at DESC LIMIT 50 OFFSET ?",[q,q,offset]);
   return send(res,200,{rows});
  }
  if(path==='/api/admin/campaigns'&&verb==='GET'){
   const rows=list("SELECT c.id,c.owner_id,c.title,c.brief,c.platform,c.status,c.moderation_status,c.reward_cents,c.budget_cents,c.paid_cents,c.spent_cents,c.created_at,u.username FROM campaigns c JOIN users u ON u.id=c.owner_id WHERE c.title LIKE ? OR u.username LIKE ? ORDER BY c.created_at DESC LIMIT 50 OFFSET ?",[q,q,offset]);
   return send(res,200,{rows,note:'Funding and balances cannot be modified by administrators.'});
  }
  if(path==='/api/admin/submissions'&&verb==='GET'){
   const rows=list("SELECT s.id,s.campaign_id,s.user_id,s.post_url,s.status,s.moderation_flag,s.moderation_note,s.created_at,c.title AS campaign_title,u.username FROM submissions s JOIN campaigns c ON c.id=s.campaign_id JOIN users u ON u.id=s.user_id WHERE c.title LIKE ? OR u.username LIKE ? ORDER BY s.created_at DESC LIMIT 50 OFFSET ?",[q,q,offset]);
   return send(res,200,{rows,note:'Administrative moderation does not approve payouts or create rewards.'});
  }
  if(path==='/api/admin/comments'&&verb==='GET'){
   const rows=list("SELECT c.id,c.release_id,c.user_id,c.body,c.created_at,u.username,r.title AS release_title FROM release_comments c JOIN users u ON u.id=c.user_id JOIN releases r ON r.id=c.release_id WHERE c.body LIKE ? OR u.username LIKE ? ORDER BY c.created_at DESC LIMIT 50 OFFSET ?",[q,q,offset]);
   return send(res,200,{rows});
  }
  if(path==='/api/admin/reports'&&verb==='GET'){
   const rows=list("SELECT x.id,x.release_id,x.reason,x.details,x.status,x.created_at,x.resolved_at,r.title AS release_title,u.username AS reporter FROM content_reports x JOIN releases r ON r.id=x.release_id JOIN users u ON u.id=x.reporter_id ORDER BY CASE x.status WHEN 'open' THEN 0 ELSE 1 END,x.created_at DESC LIMIT 100");
   return send(res,200,{rows,reports:rows});
  }
  if(path==='/api/admin/payments'&&verb==='GET'){
   const rows=list('SELECT o.id,o.campaign_id,o.provider,o.status,o.amount_cents,o.created_at,c.title AS campaign_title FROM payment_orders o JOIN campaigns c ON c.id=o.campaign_id ORDER BY o.created_at DESC LIMIT 100');
   const sandbox_orders=list('SELECT o.id,o.campaign_id,o.user_id,o.quoted_amount_cents,o.charged_cents,o.created_at,c.title AS campaign_title FROM sandbox_campaign_orders o JOIN campaigns c ON c.id=o.campaign_id ORDER BY o.created_at DESC LIMIT 100');
   return send(res,200,{rows,sandbox_orders,read_only:true,note:'Provider orders are separate from sandbox campaign quotes (charged €0). No manual credits, refunds, fake campaign funding or payout overrides.'});
  }
  if(path==='/api/admin/subscriptions'&&verb==='GET'){
   const rows=list("SELECT s.user_id,u.username,u.email,s.plan_id,s.period,s.status,s.provider,s.period_start_at,s.period_end_at,s.auto_renew,s.updated_at,(SELECT count(*) FROM subscription_events e WHERE e.user_id=s.user_id) AS events_count FROM account_subscriptions s JOIN users u ON u.id=s.user_id ORDER BY s.updated_at DESC LIMIT 100");
   const recent=list("SELECT e.id,e.user_id,u.username,e.action,e.plan_id,e.period,e.quoted_price_cents,e.charged_cents,e.provider,e.created_at FROM subscription_events e JOIN users u ON u.id=e.user_id ORDER BY e.created_at DESC LIMIT 40");
   return send(res,200,{rows,recent,read_only:true,note:'Sandbox subscription entitlements, not real payments. No manual credits or ledger mutation allowed.'});
  }
  if(path==='/api/admin/cpm'&&verb==='GET'){
   const rows=list("SELECT c.submission_id,c.campaign_id,c.clipper_id,c.tiktok_video_id,c.post_url,c.review_status,c.reported_views,c.highest_views,c.accrued_cents,c.settled_cents,c.post_access,c.risk_flag,c.last_checked_at,c.submitted_at,c.review_reason,c.appeal_reason,u.username AS clipper_name,camp.title AS campaign_title FROM cpm_submissions c JOIN users u ON u.id=c.clipper_id JOIN campaigns camp ON camp.id=c.campaign_id ORDER BY CASE WHEN c.risk_flag<>'' OR c.review_status='disputed' OR c.post_access<>'visible' THEN 0 ELSE 1 END,c.submitted_at DESC LIMIT 150");
   return send(res,200,{rows,note:'Provider metrics are API-reported, not independently certified. All balances here are sandbox-only and non-withdrawable.'});
  }
  const cmp=path.match(/^\/api\/admin\/cpm\/([a-f0-9-]{36})\/risk$/);
  if(cmp&&verb==='POST'){
   const row=db.prepare('SELECT * FROM cpm_submissions WHERE submission_id=?').get(cmp[1]);
   if(!row)throw fail(404,'CPM review not found.');
   const body=await json(req),decision=String(body.decision||''),note=short(body.note,700);
   if(!['hold','clear'].includes(decision)||note.length<15)throw fail(422,'Select hold or clear with an evidence-based note of at least 15 characters.');
   if(decision==='clear'&&(row.post_access!=='visible'||!row.last_checked_at||Date.now()-Date.parse(row.last_checked_at)>2*3600000))
    throw fail(409,'A visible post and a recent official TikTok check are required before clearing a hold.');
   transaction(()=>{
    db.prepare('UPDATE cpm_submissions SET risk_flag=? WHERE submission_id=?').run(decision==='hold'?'HUMAN_REVIEW_HOLD':'',row.submission_id);
    db.prepare('INSERT INTO campaign_review_audit VALUES(?,?,?,?,?,?,?)').run(id(),row.campaign_id,row.submission_id,admin.id,
     'admin.cpm.'+decision,note,now());
    log(admin,'cpm.risk.'+decision,'cpm_submission',row.submission_id,{risk_flag:row.risk_flag},{risk_flag:decision==='hold'?'HUMAN_REVIEW_HOLD':'',reason:note});
   });
   broadcast('cpm-admin-review');return send(res,200,{ok:true,decision,credited_cents:0,note:'Risk review recorded; official views, test accrual and real money were not altered.'});
  }
  if(path==='/api/admin/audit'&&verb==='GET')return send(res,200,{rows:audit(150)});
  if(path==='/api/admin/settings'){
   if(verb==='GET')return send(res,200,{settings:siteSettings(db)});
   if(verb==='PATCH'){
    const body=await json(req),key=String(body.key||'');
    if(!['announcement_enabled','announcement_text','homepage_featured_release_id','support_email'].includes(key))throw fail(422,'Setting is not supported.');
    let value=String(body.value??'');
    if(key==='announcement_enabled'&&!['true','false'].includes(value))throw fail(422,'Invalid announcement state.');
    if(key==='announcement_text')value=short(value,180);
    if(key==='support_email'){value=short(value,254);if(value&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw fail(422,'Invalid support email.');}
    if(key==='homepage_featured_release_id'){
     if(value&&!UUID.test(value))throw fail(422,'Invalid release id.');
     if(value&&!db.prepare("SELECT 1 FROM releases r JOIN users u ON u.id=r.owner_id WHERE r.id=? AND r.visibility='public' AND u.status='active'").get(value))
      throw fail(422,'Featured release must be publicly available.');
    }
    const old=db.prepare('SELECT value FROM site_settings WHERE key=?').get(key)?.value;
    transaction(()=>{db.prepare('UPDATE site_settings SET value=?,updated_at=?,updated_by=? WHERE key=?').run(value,now(),admin.id,key);
     log(admin,'site.setting','setting',key,{value:old},{value});});
    broadcast('site-settings');return send(res,200,{ok:true,settings:siteSettings(db)});
   }
  }
  const profileMatch=path.match(/^\/api\/admin\/profile-review\/([a-f0-9-]{36})$/);
  if(profileMatch&&verb==='POST'){
   const target=fetchRecord('users',profileMatch[1],'id,role,status,email_verified'),b=await json(req);
   if(target.role==='admin'||target.id===admin.id||typeof b.enabled!=='boolean'||typeof b.note!=='string'||b.note.trim().length<15||b.note.length>500)throw fail(422,'Provide a review decision and evidence note.');
   if(b.enabled&&(target.status!=='active'||target.email_verified!==1))throw fail(409,'Account must be active and email verified.');
   transaction(()=>{const prior=db.prepare('SELECT * FROM ecosystem_profile_reviews WHERE user_id=?').get(target.id);
    if(b.enabled)db.prepare('INSERT INTO ecosystem_profile_reviews VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at').run(target.id,admin.id,now());
    else db.prepare('DELETE FROM ecosystem_profile_reviews WHERE user_id=?').run(target.id);
    log(admin,'profile.review','user',target.id,{reviewed:!!prior},{reviewed:b.enabled,note:b.note.trim()});});
   broadcast('profile-review');return send(res,200,{ok:true});
  }
  const m=path.match(/^\/api\/admin\/(users|releases|campaigns|submissions|reports|comments)\/([a-f0-9-]{36})$/i);
  if(!m||!['PATCH','DELETE'].includes(verb))throw fail(404,'Admin operation not found.');
  const [,type,key]=m;let before;
  if(type==='users'&&verb==='PATCH'){
   before=fetchRecord('users',key,'id,role,status,username');
   if(before.role==='admin'||before.id===admin.id)throw fail(403,'Admin role cannot be changed through the website.');
   const b=await json(req);if(Object.keys(b).some(k=>!['role','status'].includes(k)))throw fail(422,'Unsupported account field.');
   const role='role' in b?b.role:before.role,status='status' in b?b.status:before.status;
   if(!['viewer','artist','label'].includes(role)||!['active','suspended'].includes(status))throw fail(422,'Invalid account change.');
   transaction(()=>{
    db.prepare('UPDATE users SET role=?,status=? WHERE id=?').run(role,status,key);
    if(status==='suspended')db.prepare('DELETE FROM sessions WHERE user_id=?').run(key);
    log(admin,'user.update','user',key,{role:before.role,status:before.status},{role,status});
   });
   broadcast('account-management');return send(res,200,{ok:true,record:fetchRecord('users',key,'id,username,role,status')});
  }
  if(type==='releases'&&verb==='PATCH'){
   before=fetchRecord('releases',key,'id,title,description,genre,visibility');
   const b=await json(req);if(Object.keys(b).some(k=>!['title','description','genre','visibility'].includes(k)))throw fail(422,'Unsupported release field.');
   const title='title' in b?short(b.title,90):before.title,
    description='description' in b?short(b.description,900):before.description,
    genre='genre' in b?b.genre:before.genre,visibility='visibility' in b?b.visibility:before.visibility;
   if(title.length<2||!['Trap','Rap','Drill','Hip-Hop','Freestyle','Other'].includes(genre)||!['public','hidden'].includes(visibility))throw fail(422,'Invalid release update.');
   transaction(()=>{
    db.prepare('UPDATE releases SET title=?,description=?,genre=?,visibility=? WHERE id=?').run(title,description,genre,visibility,key);
    log(admin,'release.update','release',key,{title:before.title,genre:before.genre,visibility:before.visibility},{title,genre,visibility});
   });
   broadcast('release');return send(res,200,{ok:true,record:fetchRecord('releases',key,'id,title,genre,visibility')});
  }
  if(type==='campaigns'&&verb==='PATCH'){
   before=fetchRecord('campaigns',key,'id,title,brief,platform,moderation_status,status,paid_cents,spent_cents');
   const b=await json(req);if(Object.keys(b).some(k=>!['title','brief','platform','moderation_status'].includes(k)))throw fail(422,'Financial and system fields cannot be changed here.');
   const title='title' in b?short(b.title,100):before.title,brief='brief' in b?short(b.brief,1200):before.brief,
    platform='platform' in b?b.platform:before.platform,moderation='moderation_status' in b?b.moderation_status:before.moderation_status;
   if(title.length<2||brief.length<15||!['Any','TikTok','Instagram Reels','YouTube Shorts'].includes(platform)||!['visible','hidden'].includes(moderation))
    throw fail(422,'Invalid campaign update.');
   transaction(()=>{db.prepare('UPDATE campaigns SET title=?,brief=?,platform=?,moderation_status=? WHERE id=?').run(title,brief,platform,moderation,key);
    log(admin,'campaign.update','campaign',key,{title:before.title,moderation_status:before.moderation_status},{title,moderation_status:moderation});});
   broadcast('campaign');return send(res,200,{ok:true,record:fetchRecord('campaigns',key,'id,title,status,moderation_status,paid_cents,spent_cents')});
  }
  if(type==='submissions'&&verb==='PATCH'){
   before=fetchRecord('submissions',key,'id,moderation_flag,moderation_note,status');
   const b=await json(req);if(Object.keys(b).some(k=>!['moderation_flag','moderation_note'].includes(k)))throw fail(422,'Reward status cannot be changed manually.');
   const flag=String(b.moderation_flag||''),note=short(b.moderation_note||'',400);
   if(!['clear','flagged'].includes(flag))throw fail(422,'Invalid submission flag.');
   transaction(()=>{db.prepare('UPDATE submissions SET moderation_flag=?,moderation_note=? WHERE id=?').run(flag,note,key);
    log(admin,'submission.flag','submission',key,{moderation_flag:before.moderation_flag},{moderation_flag:flag,note});});
   broadcast('submission');return send(res,200,{ok:true,record:fetchRecord('submissions',key,'id,status,moderation_flag,moderation_note')});
  }
  if(type==='reports'&&verb==='PATCH'){
   before=fetchRecord('content_reports',key,'id,status');
   const b=await json(req);
   if(Object.keys(b).some(k=>k!=='status'))throw fail(422,'Unsupported report field.');
   if(!['open','reviewed','dismissed'].includes(b.status))throw fail(422,'Invalid report state.');
   transaction(()=>{db.prepare('UPDATE content_reports SET status=?,resolved_by=?,resolved_at=? WHERE id=?')
     .run(b.status,b.status==='open'?null:admin.id,b.status==='open'?null:now(),key);
    log(admin,'report.review','report',key,before,{status:b.status});});
   broadcast('content-report');return send(res,200,{ok:true,record:fetchRecord('content_reports',key,'id,status,resolved_at')});
  }
  if(type==='comments'&&verb==='DELETE'){
   before=fetchRecord('release_comments',key,'id,release_id,body');
   transaction(()=>{db.prepare('DELETE FROM release_comments WHERE id=?').run(key);
    log(admin,'comment.remove','comment',key,{release_id:before.release_id,body:before.body.slice(0,80)},{removed:true});});
   broadcast('comment');return send(res,200,{ok:true});
  }
  throw fail(404,'Admin operation not supported.');
 };
}
