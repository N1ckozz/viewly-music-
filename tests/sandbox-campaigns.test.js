import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('real campaign sandbox: quote plus 5% fee, zero charge, test submissions and non-withdrawable rewards',async t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'viewly-sandbox-campaign-'));
 const port=35500+Math.floor(Math.random()*14000),base='http://127.0.0.1:'+port,folder=path.join(temp,'db');
 const child=spawn(process.execPath,['--disable-warning=ExperimentalWarning',path.join(root,'server.js')],{
  cwd:root,env:{...process.env,VIEWLY_DATA_DIR:folder,VIEWLY_UPLOAD_DIR:path.join(temp,'uploads'),PORT:String(port),APP_URL:base,
   VIEWLY_BILLING_MODE:'sandbox',VIEWLY_BILLING_SANDBOX_ALLOWED:'true'},stdio:'pipe'
 });
 t.after(()=>{child.kill('SIGTERM');fs.rmSync(temp,{recursive:true,force:true})});
 let live=false;for(let n=0;n<120;n++){await new Promise(r=>setTimeout(r,100));try{if((await fetch(base+'/api/health')).ok){live=true;break}}catch{}}
 assert.equal(live,true);
 let cookie='';
 async function call(url,method='GET',body){
  const headers={};if(cookie)headers.cookie=cookie;
  if(method!=='GET')headers['X-Viewly-Request']='1';
  if(body!==undefined)headers['Content-Type']='application/json';
  const res=await fetch(base+'/api'+url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const set=res.headers.getSetCookie().find(x=>x.startsWith('viewly_session='));
  if(set)cookie=set.split(';')[0];
  return {status:res.status,json:await res.json()};
 }
 const creator=await call('/register','POST',{email:'campaignmaker@example.test',username:'campaignmaker',display_name:'Campaign maker',role:'artist',password:'CampaignPassword-Secure#123'});
 assert.equal(creator.status,201,JSON.stringify(creator.json));
 const creatorCookie=cookie;
 const owner=creator.json.user.id,db=new DatabaseSync(path.join(folder,'viewly.sqlite'));
 const releaseId=crypto.randomUUID();
 db.prepare('INSERT INTO releases(id,owner_id,title,description,genre,file_name,created_at) VALUES (?,?,?,?,?,?,?)')
 .run(releaseId,owner,'Authorized original','Original clip source','Trap',crypto.randomBytes(20).toString('hex')+'.mp4',new Date().toISOString());
 const created=await call('/campaigns','POST',{release_id:releaseId,title:'Creator Rewards test',brief:'Cut a positive 15 second original video for social.',platform:'TikTok',reward_eur:1,budget_eur:100});
 assert.equal(created.status,201,JSON.stringify(created.json));
 const id=created.json.campaign.id;
 assert.equal(created.json.campaign.budget_cents,10000);
 assert.equal(created.json.campaign.fee_cents,500);
 assert.equal(created.json.campaign.status,'draft');
 const funded=await call('/campaigns/'+id+'/sandbox-fund','POST',{});
 assert.equal(funded.status,201,JSON.stringify(funded.json));
 assert.equal(funded.json.charged_cents,0);
 assert.equal(funded.json.quoted_amount_cents,10500);
 assert.equal(funded.json.campaign_status,'sandbox_active');
 const again=await call('/campaigns/'+id+'/sandbox-fund','POST',{});
 assert.equal(again.status,200);assert.equal(again.json.already_active,true);
 assert.equal(db.prepare('SELECT count(*) AS n FROM payment_orders').get().n,0);
 assert.equal(db.prepare('SELECT paid_cents FROM campaigns WHERE id=?').get(id).paid_cents,0);
 const discovered=await call('/campaigns');
 assert.equal(discovered.status,200);
 const entry=discovered.json.campaigns.find(c=>c.id===id);
 assert.ok(entry);assert.equal(entry.is_sandbox,true);
 assert.equal(entry.remaining_cents,10000);
 assert.equal(entry.eligible_spots,100);
 assert.equal(entry.paid_cents,0);
 assert.equal(entry.reward_type,'sandbox_non_withdrawable');
 const submitAsOwner=await call('/campaigns/'+id+'/submit','POST',{post_url:'https://www.tiktok.com/@tester/video/123'});
 assert.equal(submitAsOwner.status,403);
 const participant=await call('/register','POST',{email:'clipper@example.test',username:'testclipper',display_name:'Clipper',role:'viewer',password:'ClipperPassword-Secure#123'});
 assert.equal(participant.status,201);
 const userCookie=cookie,userId=participant.json.user.id;
 const sent=await call('/campaigns/'+id+'/submit','POST',{post_url:'https://www.tiktok.com/@tester/video/456'});
 assert.equal(sent.status,201,JSON.stringify(sent.json));
 assert.equal(sent.json.status,'sandbox_pending');
 const sid=sent.json.submission_id;
 assert.equal((await call('/submissions/'+sid+'/review','POST',{status:'approved'})).status,403);
 cookie=creatorCookie;
 const approved=await call('/submissions/'+sid+'/review','POST',{status:'approved'});
 assert.equal(approved.status,200,JSON.stringify(approved.json));
 assert.equal(approved.json.status,'sandbox_approved');
 assert.equal(approved.json.reward_quote_cents,100);
 assert.equal(approved.json.withdrawable_cents,0);
 assert.equal((await call('/submissions/'+sid+'/review','POST',{status:'approved'})).status,503);
 assert.equal(db.prepare('SELECT sandbox_spent_cents FROM campaigns WHERE id=?').get(id).sandbox_spent_cents,100);
 assert.equal(db.prepare('SELECT count(*) AS n FROM wallet_ledger').get().n,0);
 assert.equal(db.prepare('SELECT count(*) AS n FROM payment_orders').get().n,0);
 assert.equal(db.prepare('SELECT count(*) AS n FROM sandbox_campaign_orders WHERE charged_cents<>0').get().n,0);
 cookie=userCookie;
 const own=await call('/sandbox/rewards');
 assert.equal(own.status,200);assert.equal(own.json.test_earned_cents,100);
 assert.equal(own.json.withdrawable_cents,0);
 const wallet=await call('/wallet');
 assert.equal(wallet.json.available_to_withdraw_cents,0);
 assert.equal(wallet.json.earned_cents,0);
 assert.equal(wallet.json.sandbox_earned_cents,100);
 assert.equal(db.prepare('SELECT user_id FROM sandbox_creator_rewards LIMIT 1').get().user_id,userId);
 db.close();
});
