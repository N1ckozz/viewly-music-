import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn,spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const ffmpeg=spawnSync('ffmpeg',['-version'],{encoding:'utf8'});

test('real authentication, public upload, video range, clips, comments, campaign funding gates', {skip:ffmpeg.status!==0},async t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'viewly-test-'));
 const port=42000+Math.floor(Math.random()*12000);
 const base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['--disable-warning=ExperimentalWarning',path.join(root,'server.js')],{env:{...process.env,PORT:String(port),APP_URL:base,VIEWLY_DATA_DIR:path.join(temp,'data'),VIEWLY_UPLOAD_DIR:path.join(temp,'uploads')},stdio:'pipe'});
 t.after(()=>{child.kill('SIGTERM');fs.rmSync(temp,{recursive:true,force:true});});
 let ready=false;
 for(let i=0;i<70;i++){await new Promise(r=>setTimeout(r,100));try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}}
 assert.ok(ready,'server should start');
 let cookie='';
 async function request(path,method='GET',obj,auth=true){const headers={};if(auth&&cookie)headers.Cookie=cookie;let body;if(obj instanceof FormData)body=obj;else if(obj!==undefined){headers['Content-Type']='application/json';body=JSON.stringify(obj);}const r=await fetch(base+'/api'+path,{method,headers,body});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,body:await r.json()};}
 let r=await request('/register','POST',{email:'artist@example.test',username:'artist_sample',display_name:'Test Artist',password:'1234567890Test!',role:'artist'},false);assert.equal(r.status,201);
 assert.equal((await request('/me')).body.user.role,'artist');
 const activity=await request('/my-submissions');assert.equal(activity.status,200);assert.deepEqual(activity.body.submissions,[],'a fresh account has no invented submissions');
 let invalid=await request('/register','POST',{email:'not-email',username:'z',display_name:'x',password:'bad',role:'admin'},false);assert.equal(invalid.status,422);
 const videoFile=path.join(temp,'video.mp4');const p=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:s=160x90:r=12:d=7','-f','lavfi','-i','sine=frequency=222:duration=7','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest','-y',videoFile],{timeout:25000});assert.equal(p.status,0);
 const form=new FormData();form.set('title','Test music release');form.set('description','Real local integration source');form.set('genre','Rap');form.set('rights','on');form.set('video',new Blob([fs.readFileSync(videoFile)],{type:'video/mp4'}),'test.mp4');
 r=await request('/releases','POST',form);assert.equal(r.status,201,JSON.stringify(r.body));const release=r.body.release;
 assert.ok((await request('/releases','GET',undefined,false)).body.releases.some(x=>x.id===release.id),'release public without user session');
 const range=await fetch(base+release.video_url,{headers:{Range:'bytes=0-31'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,32);
 await request(`/releases/${release.id}/view`,'POST');await request(`/releases/${release.id}/view`,'POST');assert.equal((await request(`/releases/${release.id}`)).body.release.plays,1);
 assert.equal((await request(`/releases/${release.id}/comments`,'POST',{body:'Valid persisted comment'})).status,201);
 assert.equal((await request(`/releases/${release.id}/comments`)).body.comments.length,1);
 assert.equal((await request(`/releases/${release.id}/like`,'POST')).body.release.likes,1);
 const clip=await request(`/releases/${release.id}/clip`,'POST',{start:0,end:5.5});assert.equal(clip.status,201,JSON.stringify(clip.body));assert.equal((await fetch(base+clip.body.clip.video_url)).status,200);
 const camp=await request('/campaigns','POST',{release_id:release.id,title:'Promotion brief',brief:'Create a clean music clip from the artist source material.',platform:'TikTok',reward_eur:1,budget_eur:100});assert.equal(camp.status,201,JSON.stringify(camp.body));assert.equal(camp.body.campaign.fee_cents,500);assert.equal(camp.body.campaign.status,'draft');
 assert.equal((await request('/campaigns','GET',undefined,false)).body.campaigns.length,0,'no fake active campaigns');
 assert.equal((await request('/payments/stripe/checkout','POST',{campaign_id:camp.body.campaign.id})).status,503,'no fake payment');
 const wallet=(await request('/wallet')).body;assert.equal(wallet.earned_cents,0);assert.equal(wallet.payout_enabled,false);
 await request('/logout','POST');assert.equal((await request('/me')).body.user,null);
 assert.equal((await request('/my-submissions')).status,401,'submission history is private to the signed-in account');
 assert.equal((await request('/releases','POST',{title:'Not authorized'})).status,401);
});
