import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {calculateCpmDelta} from '../creator-campaigns.js';
import {parseTikTokUrl} from '../social-oauth.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fail=(status,message)=>Object.assign(new Error(message),{status});
test('CPM uses server-computed view tiers, minimums, max per clip and remaining budget',()=>{
 const p={rate_cents:100,min_views:1000,max_clip_cents:2500,already_accrued_cents:0,available_budget_cents:99999};
 assert.equal(calculateCpmDelta({...p,views:999}),0);
 assert.equal(calculateCpmDelta({...p,views:1000}),100);
 assert.equal(calculateCpmDelta({...p,views:10000}),1000);
 assert.equal(calculateCpmDelta({...p,views:10000,already_accrued_cents:250}),750);
 assert.equal(calculateCpmDelta({...p,views:999999}),2500);
 assert.equal(calculateCpmDelta({...p,views:999999,available_budget_cents:53}),53);
 assert.equal(calculateCpmDelta({...p,views:3000,already_accrued_cents:500}),0);
 assert.equal(calculateCpmDelta({...p,views:10000,already_accrued_cents:1000}),0);
});
test('TikTok posting identity URL validation rejects forged hosts and short links',()=>{
 const id='7234567890123456789';
 const result=parseTikTokUrl('https://www.tiktok.com/@originalcreator/video/'+id+'?share_id=abc',fail);
 assert.equal(result.videoId,id);
 assert.equal(result.canonical,'https://www.tiktok.com/@originalcreator/video/'+id);
 for(const url of ['http://www.tiktok.com/@x/video/'+id,'https://tiktok.com.attacker.test/@user/video/'+id,
  'https://vm.tiktok.com/AbCdEf/','https://www.tiktok.com/@user/video/not-a-number',
  'javascript:alert(1)','https://www.tiktok.com.evil.test/@name/video/'+id]){
  assert.throws(()=>parseTikTokUrl(url,fail));
 }
});

test('artist can create complete CPM brief and media kit while unlinked clippers are denied',async t=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'viewly-v10-'));
 const dir=path.join(folder,'db'),port=37000+Math.floor(Math.random()*11000),base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['--disable-warning=ExperimentalWarning',path.join(ROOT,'server.js')],{
  cwd:ROOT,stdio:'pipe',
  env:{...process.env,VIEWLY_DATA_DIR:dir,VIEWLY_UPLOAD_DIR:path.join(folder,'uploads'),PORT:String(port),APP_URL:base,
   VIEWLY_BILLING_MODE:'sandbox',VIEWLY_BILLING_SANDBOX_ALLOWED:'true',TIKTOK_CLIENT_KEY:'',TIKTOK_CLIENT_SECRET:'',
   SPOTIFY_CLIENT_ID:'',SPOTIFY_CLIENT_SECRET:'',VIEWLY_SOCIAL_TOKEN_KEY:''}
 });
 t.after(()=>{child.kill('SIGTERM');fs.rmSync(folder,{recursive:true,force:true})});
 let live=false;for(let i=0;i<180;i++){await new Promise(r=>setTimeout(r,75));try{if((await fetch(base+'/api/health')).ok){live=true;break}}catch{}}
 assert.ok(live,'server starts');
 let cookie='';
 async function request(resource,method='GET',data,overrideCookie){
  const headers={};
  if(method!=='GET')headers['X-Viewly-Request']='1';
  if(overrideCookie||cookie)headers.Cookie=overrideCookie||cookie;
  let body;
  if(data instanceof FormData)body=data;
  else if(data!==undefined){headers['Content-Type']='application/json';body=JSON.stringify(data);}
  const res=await fetch(base+resource,{method,headers,body});
  const set=res.headers.getSetCookie().find(x=>x.startsWith('viewly_session='));
  if(set)cookie=set.split(';')[0];
  let parsed;try{parsed=await res.json()}catch{parsed=null}
  return {status:res.status,body:parsed,headers:res.headers};
 }
 const availability=await request('/api/social/available');
 assert.equal(availability.status,200);
 assert.equal(availability.body.tiktok,false);
 assert.equal(availability.body.spotify,false);
 const register=await request('/api/register','POST',{email:'artistowner@example.test',username:'vtenartist',display_name:'A Viewly Artist',password:'TestingRealCampaign#123',role:'artist'});
 assert.equal(register.status,201,JSON.stringify(register.body));
 const artist=register.body.user.id,artistCookie=cookie;
 const db=new DatabaseSync(path.join(dir,'viewly.sqlite'));db.exec('PRAGMA busy_timeout=3000');
 const release=crypto.randomUUID();
 db.prepare('INSERT INTO releases(id,owner_id,title,description,genre,file_name,created_at) VALUES(?,?,?,?,?,?,?)')
  .run(release,artist,'Original viewly track','Original material for clip creators','Trap',crypto.randomBytes(20).toString('hex')+'.mp4',new Date().toISOString());
 const newCampaign={
  release_id:release,title:'Viewly Creator Rewards testing',
  brief:'Create an original high-quality short clip showing the chorus and follow the release’s creative direction. Use only approved media from the artist.',
  rate_eur_per_1000:1,max_per_clip_eur:20,budget_eur:100,min_views:1000,tracking_days:30,
  mandatory_hashtags:'#Viewly #NewMusic',sample_caption:'New track out now!',
  rules:'TikTok posts must remain public during the monitoring period.',
  prohibited_content:'No fake engagement or unrelated copyrighted footage.',
  rights_confirmed:true,spotify_track_url:'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'
 };
 const invalid=await request('/api/campaigns/v10','POST',{...newCampaign,rights_confirmed:false});
 assert.equal(invalid.status,422);
 const created=await request('/api/campaigns/v10','POST',newCampaign);
 assert.equal(created.status,201,JSON.stringify(created.body));
 const campaignId=created.body.campaign.id;
 assert.equal(created.body.campaign.pricing_model,'cpm');
 assert.equal(created.body.campaign.cpm_rate_cents,100);
 assert.equal(created.body.campaign.max_clip_cents,2000);
 assert.equal(created.body.campaign.budget_cents,10000);
 assert.equal(created.body.campaign.fee_cents,500);
 assert.equal(created.body.campaign.status,'draft');
 assert.equal(created.body.campaign.mandatory_hashtags,'#Viewly #NewMusic');
 const noAuth=await request('/api/campaigns/'+campaignId+'/v10','GET',undefined,'invalid_session=somevalue');
 // The anonymous request is intentionally made using a fresh fetch without a cookie instead.
 const publicDraft=await fetch(base+'/api/campaigns/'+campaignId+'/v10');
 assert.equal(publicDraft.status,404,'draft requirements not public');
 assert.equal((await request('/api/campaigns/'+campaignId+'/v10')).status,200);
 const png=Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000','hex');
 const fd=new FormData();
 fd.append('asset',new Blob([png],{type:'image/png'}),'cover-art.png');
 const uploaded=await request('/api/campaigns/'+campaignId+'/assets','POST',fd);
 assert.equal(uploaded.status,201,JSON.stringify(uploaded.body));
 assert.equal(uploaded.body.asset.mime,'image/png');
 assert.equal(uploaded.body.asset.bytes,png.length);
 assert.equal(uploaded.body.asset.sha256,crypto.createHash('sha256').update(png).digest('hex'));
 const assetId=uploaded.body.asset.id;
 const preview=await fetch(base+'/api/campaigns/'+campaignId+'/assets/'+assetId+'?preview=1',{headers:{Cookie:artistCookie}});
 assert.equal(preview.status,200);
 assert.equal(preview.headers.get('content-type'),'image/png');
 assert.equal(Buffer.from(await preview.arrayBuffer()).toString('hex'),png.toString('hex'));
 const funding=await request('/api/campaigns/'+campaignId+'/sandbox-fund','POST',{});
 assert.equal(funding.status,201,JSON.stringify(funding.body));
 assert.equal(funding.body.quoted_amount_cents,10500);
 assert.equal(funding.body.charged_cents,0);
 const publicCampaign=await fetch(base+'/api/campaigns/'+campaignId+'/v10');
 assert.equal(publicCampaign.status,200,'funded test campaign discoverable to clippers');
 const details=await publicCampaign.json();
 assert.equal(details.assets.length,1);
 assert.equal(details.social_required,true);
 assert.equal(details.artist_has_spotify_oauth,false);
 assert.equal(details.campaign.spotify_track_url,newCampaign.spotify_track_url);
 const linkArtist=await request('/api/social/spotify/artist','PATCH',{artist_url:'https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb'});
 assert.equal(linkArtist.status,200);
 assert.equal(linkArtist.body.artist_ownership_verified,false);
 assert.equal((await request('/connect/spotify')).status,503,'no fictional Spotify authorization');
 const actor=await request('/api/register','POST',{email:'actualclipper@example.test',username:'vtenclipper',display_name:'Clipper',password:'SecureClipperPassword#123',role:'viewer'});
 assert.equal(actor.status,201);
 const clipperCookie=cookie;
 const attempt=await request('/api/campaigns/'+campaignId+'/cpm-submissions','POST',{post_url:'https://www.tiktok.com/@actualclipper/video/7234567890123456789'});
 assert.equal(attempt.status,403,'no rewards without official linked TikTok identity');
 assert.match(attempt.body.error,/Link your TikTok/);
 const noOtherUpload=await request('/api/campaigns/'+campaignId+'/assets','POST',fd);
 assert.equal(noOtherUpload.status,403,'nonowners cannot upload media assets');
 const ownClips=await request('/api/cpm-submissions/me');
 assert.equal(ownClips.status,200);assert.deepEqual(ownClips.body.submissions,[]);
 const notConnected=await request('/connect/tiktok');
 assert.equal(notConnected.status,503,'OAuth must fail closed without approvals');
 cookie=artistCookie;
 const paused=await request('/api/campaigns/'+campaignId+'/pause','POST',{});
 assert.equal(paused.status,200);assert.equal(paused.body.status,'sandbox_paused');
 const resumed=await request('/api/campaigns/'+campaignId+'/resume','POST',{});
 assert.equal(resumed.status,200);assert.equal(resumed.body.status,'sandbox_active');
 const hidden=await request('/api/campaigns/'+campaignId+'/assets/'+assetId,'DELETE');
 assert.equal(hidden.status,200);
 assert.equal(hidden.body.retained_for_audit,true);
 assert.equal((await request('/api/campaigns/'+campaignId+'/assets')).body.assets.length,0);
 assert.equal((await fetch(base+'/api/campaigns/'+campaignId+'/assets/'+assetId)).status,404);
 assert.equal(db.prepare('SELECT count(*) AS n FROM campaign_assets WHERE id=?').get(assetId).n,1,'soft hide preserves evidence');
 assert.equal(db.prepare('SELECT count(*) AS n FROM payment_orders').get().n,0);
 assert.equal(db.prepare('SELECT count(*) AS n FROM wallet_ledger').get().n,0);
 assert.equal(db.prepare('SELECT count(*) AS n FROM cpm_events').get().n,0);
 db.close();
});
