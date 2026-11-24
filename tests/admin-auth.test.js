import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {newTotpSecret,encryptSeed,totpAt} from '../mfa.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('real administrator controls require verified identity, MFA, permissions and audit every mutation',async t=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'viewly-admin-')),data=path.join(folder,'data');
 const port=42000+Math.floor(Math.random()*12000),base='http://127.0.0.1:'+port,key=crypto.randomBytes(32).toString('hex');
 const child=spawn(process.execPath,['--disable-warning=ExperimentalWarning',path.join(root,'server.js')],{
  cwd:root,env:{...process.env,PORT:String(port),APP_URL:base,VIEWLY_MFA_MASTER_KEY:key,
   VIEWLY_DATA_DIR:data,VIEWLY_UPLOAD_DIR:path.join(folder,'uploads'),RESEND_API_KEY:'',VIEWLY_MAIL_FROM:''},stdio:'pipe'
 });
 t.after(()=>{child.kill('SIGTERM');fs.rmSync(folder,{force:true,recursive:true})});
 let live=false;
 for(let i=0;i<180;i++){await new Promise(r=>setTimeout(r,80));try{if((await fetch(base+'/api/health')).ok){live=true;break}}catch{}}
 assert.ok(live,'test server is healthy');
 async function request(endpoint,method='GET',body,cookie=''){
  const headers={};
  if(method!=='GET')headers['X-Viewly-Request']='1';
  if(cookie)headers.Cookie=cookie;
  if(body!==undefined)headers['content-type']='application/json';
  const res=await fetch(base+'/api'+endpoint,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const json=await res.json();
  return {status:res.status,body:json,cookies:res.headers.getSetCookie()};
 }
 const password='OwnerPassword-Secure#123';
 const owner=await request('/register','POST',{email:'owner@example.test',username:'owner',display_name:'Owner',password,role:'artist'});
 assert.equal(owner.status,201,JSON.stringify(owner.body));
 const ownerId=owner.body.user.id,oldCookie=owner.cookies.find(s=>s.startsWith('viewly_session=')).split(';')[0];
 const viewer=await request('/register','POST',{email:'viewer@example.test',username:'viewer',display_name:'Viewer',password:'ViewerPassword-Secure#123',role:'viewer'});
 assert.equal(viewer.status,201,JSON.stringify(viewer.body));
 const viewerId=viewer.body.user.id,viewerCookie=viewer.cookies.find(s=>s.startsWith('viewly_session=')).split(';')[0];
 assert.equal((await request('/admin/overview')).status,401);
 assert.equal((await request('/admin/users','GET',undefined,viewerCookie)).status,403);
 const db=new DatabaseSync(path.join(data,'viewly.sqlite'));db.exec('PRAGMA busy_timeout=3000');
 const secret=newTotpSecret();
 db.prepare("UPDATE users SET role='admin',email_verified=1 WHERE id=?").run(ownerId);
 db.prepare('INSERT INTO mfa_methods(user_id,seed_cipher,enabled,last_step,created_at) VALUES(?,?,1,-1,?)')
   .run(ownerId,encryptSeed(secret,key),new Date().toISOString());
 assert.equal((await request('/admin/overview','GET',undefined,oldCookie)).status,403,'a pre-MFA session must not be accepted');
 const login=await request('/login','POST',{email:'owner@example.test',password});
 assert.equal(login.status,200);assert.equal(login.body.mfa_required,true);
 const ticket=login.cookies.find(s=>s.startsWith('viewly_mfa_ticket=')).split(';')[0];
 const auth=await request('/security/mfa/login','POST',{code:totpAt(secret,Math.floor(Date.now()/30000))},ticket);
 assert.equal(auth.status,200,JSON.stringify(auth.body));
 const adminCookie=auth.cookies.find(s=>s.startsWith('viewly_session=')).split(';')[0];
 const overview=await request('/admin/overview','GET',undefined,adminCookie);
 assert.equal(overview.status,200,JSON.stringify(overview.body));
 assert.equal(overview.body.counts.users,2);
 const list=await request('/admin/users','GET',undefined,adminCookie);
 assert.equal(list.status,200);assert.equal(list.body.rows.length,2);
 const elevate=await request('/admin/users/'+viewerId,'PATCH',{role:'admin'},adminCookie);
 assert.equal(elevate.status,422,'admins cannot grant other admin roles over the network');
 const manageOwner=await request('/admin/users/'+ownerId,'PATCH',{status:'suspended'},adminCookie);
 assert.equal(manageOwner.status,403);
 const role=await request('/admin/users/'+viewerId,'PATCH',{role:'artist'},adminCookie);
 assert.equal(role.status,200);assert.equal(role.body.record.role,'artist');
 const suspend=await request('/admin/users/'+viewerId,'PATCH',{status:'suspended'},adminCookie);
 assert.equal(suspend.status,200);
 assert.equal((await request('/me','GET',undefined,viewerCookie)).body.user,null);
 assert.equal((await request('/login','POST',{email:'viewer@example.test',password:'ViewerPassword-Secure#123'})).status,403);
 const restore=await request('/admin/users/'+viewerId,'PATCH',{status:'active'},adminCookie);
 assert.equal(restore.status,200);
 const up=await request('/admin/settings','PATCH',{key:'announcement_text',value:'New artist drops this week'},adminCookie);
 assert.equal(up.status,200);
 await request('/admin/settings','PATCH',{key:'announcement_enabled',value:'true'},adminCookie);
 const site=await request('/site');
 assert.equal(site.body.announcement_enabled,true);
 assert.equal(site.body.announcement_text,'New artist drops this week');
 // Seed real data only in this isolated test database to exercise public moderation.
 const releaseId=crypto.randomUUID(),campaignId=crypto.randomUUID(),commentId=crypto.randomUUID();
 const file=crypto.randomBytes(20).toString('hex')+'.mp4';
 db.prepare('INSERT INTO releases(id,owner_id,title,description,genre,file_name,created_at) VALUES(?,?,?,?,?,?,?)')
 .run(releaseId,viewerId,'Owned test release','Original work','Trap',file,new Date().toISOString());
 db.prepare('INSERT INTO campaigns(id,owner_id,release_id,title,brief,platform,reward_cents,budget_cents,fee_cents,paid_cents,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
 .run(campaignId,viewerId,releaseId,'Campaign one','Original music clipper brief','TikTok',100,1000,50,1000,'active',new Date().toISOString());
 db.prepare('INSERT INTO release_comments VALUES (?,?,?,?,?)').run(commentId,releaseId,viewerId,'A test comment',new Date().toISOString());
 assert.equal((await request('/releases')).body.releases.length,1);
 assert.equal((await request('/campaigns')).body.campaigns.length,1);
 const hide=await request('/admin/releases/'+releaseId,'PATCH',{visibility:'hidden'},adminCookie);
 assert.equal(hide.status,200);assert.equal((await request('/releases')).body.releases.length,0);
 assert.equal((await request('/releases/'+releaseId)).status,404,'hidden records are inaccessible to public users');
 assert.equal((await request('/campaigns')).body.campaigns.length,0);
 const show=await request('/admin/releases/'+releaseId,'PATCH',{visibility:'public'},adminCookie);
 assert.equal(show.status,200);assert.equal((await request('/releases')).body.releases.length,1);
 const hideCampaign=await request('/admin/campaigns/'+campaignId,'PATCH',{moderation_status:'hidden',paid_cents:98765},adminCookie);
 assert.equal(hideCampaign.status,422,'manual payment fields must be rejected');
 const hideCampaignValid=await request('/admin/campaigns/'+campaignId,'PATCH',{moderation_status:'hidden'},adminCookie);
 assert.equal(hideCampaignValid.status,200);assert.equal((await request('/campaigns')).body.campaigns.length,0);
 assert.equal(db.prepare('SELECT paid_cents FROM campaigns WHERE id=?').get(campaignId).paid_cents,1000);
 const remove=await request('/admin/comments/'+commentId,'DELETE',undefined,adminCookie);
 assert.equal(remove.status,200);assert.equal(db.prepare('SELECT count(*) AS n FROM release_comments WHERE id=?').get(commentId).n,0);
 const payments=await request('/admin/payments','GET',undefined,adminCookie);
 assert.equal(payments.status,200);assert.equal(payments.body.read_only,true);
 assert.equal((await request('/admin/payments','PATCH',{paid_cents:100},adminCookie)).status,404);
 const audit=await request('/admin/audit','GET',undefined,adminCookie);
 assert.equal(audit.status,200);assert.ok(audit.body.rows.length>=6);
 db.close();
});
test('email recovery is unavailable safely without a verified transactional email provider',async t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'viewly-mail-')),port=42000+Math.floor(Math.random()*12000),base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['--disable-warning=ExperimentalWarning',path.join(root,'server.js')],{
  cwd:root,env:{...process.env,PORT:String(port),APP_URL:base,VIEWLY_DATA_DIR:path.join(tmp,'db'),
   VIEWLY_UPLOAD_DIR:path.join(tmp,'uploads'),RESEND_API_KEY:'',VIEWLY_MAIL_FROM:''},stdio:'pipe'
 });
 t.after(()=>{child.kill('SIGTERM');fs.rmSync(tmp,{recursive:true,force:true})});
 let live=false;
 for(let i=0;i<180;i++){await new Promise(r=>setTimeout(r,80));try{if((await fetch(base+'/api/health')).ok){live=true;break}}catch{}}
 assert.ok(live);
 const capabilities=await (await fetch(base+'/api/auth/capabilities')).json();
 assert.equal(capabilities.email_delivery_ready,false);
 const res=await fetch(base+'/api/auth/password/forgot',{method:'POST',
  headers:{'X-Viewly-Request':'1','Content-Type':'application/json'},body:JSON.stringify({email:'unknown@example.test'})});
 assert.equal(res.status,503);
 const secret=await fetch(base+'/api/auth/password/reset',{method:'POST',
  headers:{'X-Viewly-Request':'1','Content-Type':'application/json'},body:JSON.stringify({token:'bad-token',password:'SaferPassword-Long#123'})});
 assert.equal(secret.status,400);
});
