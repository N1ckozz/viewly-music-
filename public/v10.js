/* VIEWLY V10 — Artist/Clipper campaign experience; all data comes from real APIs. */
(()=>{
'use strict';
const X={social:null,loadedFor:'',loading:false,accountError:'',currentCampaign:'',detail:null,submissions:[],ownSubmissions:[]};
const symbol=(n,size=16)=>ico(n,size);
const euro=c=>eur(Number(c)||0);
const value=(v,n=500)=>esc(String(v??'').slice(0,n));
const socialLink=()=>'<button type="button" class="v10-button v10-outlined" data-page="connections">'+symbol('shield',16)+' Manage social connections</button>';
const status=s=>'<span class="v10-status">'+value(String(s||'').replaceAll('_',' '),90)+'</span>';
function connection(name,description,connected,enabled){
 return '<article class="v10-connect-card '+(connected?'is-connected':'')+'"><div class="v10-connect-top">'+
  '<span class="v10-social-icon">'+(name==='TikTok'?symbol('video',23):symbol('play',23))+'</span>'+
  '<span class="v10-pill">'+(connected?'ACCOUNT LINKED':enabled?'READY TO CONNECT':'AWAITING API SETUP')+'</span></div>'+
  '<h3>'+name+'</h3><p>'+description+'</p>'+
  (connected?'<div class="v10-linked"><strong>'+value(connected.display_name,90)+'</strong><small>Connected using the official provider authorization</small></div>':
   '<div class="v10-linked pending"><strong>Not connected</strong><small>No username or screenshots accepted as proof</small></div>')+
  (enabled?'<a class="v10-button v10-primary" href="/connect/'+name.toLowerCase()+'">'+symbol('arrow',17)+
   (connected?'Reconnect':'Connect '+name)+'</a>':
   '<span class="v10-disabled">'+symbol('shield',14)+' Official API credentials/approval required</span>')+
  (connected?'<button class="v10-small" data-v10-disconnect="'+name.toLowerCase()+'">Disconnect account</button>':'')+
  '</article>';
}
function myPosts(){
 if(!S.user)return '';
 if(!X.ownSubmissions?.length)return '<div class="v10-empty"><h3>No verified CPM submissions yet</h3><p>Connect TikTok, open an eligible campaign and post an original clip. Your personal tracking history will appear here.</p></div>';
 return '<div class="v10-tracked-grid">'+X.ownSubmissions.map(s=>
  '<article class="v10-tracked"><div><b>'+value(s.tiktok_video_id)+'</b>'+status(s.review_status)+'</div>'+
  '<p>'+Number(s.highest_views||0).toLocaleString('en-GB')+' API-reported views · '+
  euro(s.accrued_cents)+' TEST credits · €0 withdrawable</p>'+
  (s.risk_flag?'<p class="v10-alert">'+value(s.risk_flag)+' — on hold for review</p>':'')+
  '<div class="v10-btn-row"><a class="v10-button v10-outlined" target="_blank" rel="noopener noreferrer" href="'+value(s.post_url)+'">View TikTok post</a>'+
  '<button class="v10-button v10-outlined" data-v10-refresh="'+value(s.submission_id)+'">Check latest views</button></div></article>').join('')+'</div>';
}
function connectionsPage(){
 if(!S.user)return '<div class="v10-page"><h1>Social connections</h1><p>Sign in to connect your TikTok and Spotify accounts.</p><button class="v10-button v10-primary" data-action="login">Sign in</button></div>';
 const rows=X.social?.connections||[];
 const t=rows.find(c=>c.provider==='tiktok'&&c.status==='active');
 const p=rows.find(c=>c.provider==='spotify'&&c.status==='active');
 const availability=X.social?.ready||{};
 const artistUrl=X.social?.spotify_artist_url||'';
 return '<div class="v10-page"><header class="v10-page-head"><span class="v10-kicker">'+symbol('shield',16)+' IDENTITY & ACCOUNT SAFETY</span>'+
  '<h1>Connect. <em>Create.</em></h1>'+
  '<p>A clip is only eligible for view-based rewards after the TikTok account that posted it has granted access and its ownership is confirmed through the official API.</p></header>'+
  (X.accountError?'<div class="v10-alert">'+value(X.accountError)+'</div>':'')+
  '<div class="v10-connect-grid">'+connection('TikTok','Required for creators submitting clips and receiving API-reported view checks.',t,availability.tiktok)+
  connection('Spotify','Connect your personal Spotify identity. Artist-page ownership is not confirmed by this connection.',p,availability.spotify)+'</div>'+
  '<section class="v10-panel"><div class="v10-section-head"><h2>Spotify artist profile</h2><span>PUBLIC REFERENCE · NOT VERIFIED OWNERSHIP</span></div>'+
  '<p>Add the actual Spotify artist page for your music. This link helps clippers find your songs; it is never displayed as a verified artist-ownership badge.</p>'+
  '<form id="v10-spotify-form" class="v10-inline-form"><label>Spotify artist page<input type="url" name="artist_url" value="'+value(artistUrl)+'" placeholder="https://open.spotify.com/artist/..."></label>'+
  '<button class="v10-button v10-primary" type="submit">Save artist link</button></form></section>'+
  '<section class="v10-panel"><div class="v10-section-head"><h2>Your TikTok submissions</h2><button type="button" class="v10-button v10-outlined" data-v10-reload-social>Refresh</button></div>'+
  '<p>Historical views, current review state and non-withdrawable sandbox credits. No screenshot-based rewards.</p>'+
  myPosts()+'</section></div>';
}
async function loadSocial(force=false){
 if(!S.user){X.social=null;X.loadedFor='guest';return}
 if(X.loading||!force&&X.loadedFor===S.user.id)return;
 X.loading=true;X.accountError='';
 try{const [social,posts]=await Promise.all([api('/social/connections'),api('/cpm-submissions/me')]);
  X.social=social;X.ownSubmissions=posts.submissions||[];X.loadedFor=S.user.id;
 }catch(e){X.accountError=e.message||'Social API unavailable.';X.loadedFor=S.user.id;}
 finally{X.loading=false;if(S.page==='connections')render();}
}
const baseContent=content;
content=function(){return S.page==='connections'?connectionsPage():baseContent()};
const baseRender=render;
render=function(){baseRender();if(S.page==='connections'&&S.user&&!X.loading&&X.loadedFor!==S.user.id)loadSocial()};
function wizard(){
 if(!S.user)return authModal('register');
 if(!isCreator())return roleModal();
 const releases=(S.releases||[]).filter(r=>r.owner_id===S.user.id);
 if(!releases.length)return showOverlay('<div class="v10-wizard"><span class="v10-kicker">FIRST STEP</span><h2>Publish your original music.</h2><p>Campaigns connect to a real song or video, so clippers always know which release they are promoting.</p><button class="v10-button v10-primary" data-action="upload">Upload music first</button></div>');
 const section=(num,title,sub)=>'<div class="v10-wizard-section"><span>'+num+'</span><div><b>'+title+'</b><small>'+sub+'</small></div></div>';
 const sandbox=!!S.config?.billing_sandbox_enabled;
 const form='<div class="v10-wizard"><header><span class="v10-kicker">VIEWLY / ARTIST LAUNCHPAD</span>'+
  '<h2>Your campaign.<br><em>Live in minutes.</em></h2><p>Upload a creative pack, explain the mission, and set your rate per 1,000 TikTok views. No scattered setup screens.</p></header>'+
  '<form id="v10-create-form">'+section('01','Select the music','Choose the original release clippers must promote')+
  '<div class="v10-fields"><label>Music release<select name="release_id" required>'+releases.map(r=>'<option value="'+value(r.id)+'">'+value(r.title)+'</option>').join('')+'</select></label>'+
  '<label>Campaign title<input name="title" maxlength="100" minlength="3" required placeholder="e.g. New single — TikTok clip campaign"></label></div>'+
  '<label>Spotify track or album (optional)<input name="spotify_track_url" type="url" placeholder="https://open.spotify.com/track/..."></label>'+
  section('02','Explain the mission','Clear campaign descriptions reduce unnecessary rejections')+
  '<label>Full brief and deliverables<textarea name="brief" minlength="60" maxlength="4500" required rows="5" placeholder="Describe the song, target audience, clip style, preferred scenes, video format, posting criteria, and examples of acceptable content."></textarea></label>'+
  '<div class="v10-fields"><label>Mandatory hashtags<input name="mandatory_hashtags" maxlength="180" placeholder="#NewMusic #Viewly"></label>'+
  '<label>Suggested caption<input name="sample_caption" maxlength="280" placeholder="Song name — out now ..."></label></div>'+
  '<label>Creative rules<textarea name="rules" rows="3" maxlength="2000" placeholder="Clip duration, hook timing, original edits, where to find official material, logo rules, brand disclosure..."></textarea></label>'+
  '<label>Prohibited edits<textarea name="prohibited_content" rows="2" maxlength="800" placeholder="No hate speech, copyright violations, fake engagement, misleading endorsements..."></textarea></label>'+
  section('03','Upload a media kit','Original videos, photos, cover art, audio and PDF briefing documents')+
  '<div class="v10-dropzone"><span>'+symbol('upload',25)+'</span><b>Drop your creative pack here</b><small>Choose up to 16 files: MP4, WebM, JPG, PNG, WebP, MP3, WAV, PDF · individual limits apply</small>'+
  '<input type="file" id="v10-assets-files" name="assets" multiple accept="video/mp4,video/webm,image/jpeg,image/png,image/webp,audio/mpeg,audio/wav,application/pdf"></div>'+
  '<div id="v10-selected-files" class="v10-selected-files">Your original release video is already included automatically.</div>'+
  section('04','Define rewards & budget','Rates are shown per 1,000 TikTok API-reported views')+
  '<div class="v10-money-grid"><label>Rate per 1,000 views (€)<input type="number" name="rate_eur_per_1000" step=".01" min=".50" max="10" value="1.00" required></label>'+
  '<label>Maximum per clip (€)<input type="number" name="max_per_clip_eur" step=".01" min="1" value="25" required></label>'+
  '<label>Campaign budget (€)<input type="number" name="budget_eur" step=".01" min="10" value="100" required></label>'+
  '<label>Minimum views<input type="number" name="min_views" step="100" min="100" max="1000000" value="1000" required></label>'+
  '<label>Tracking period (days)<select name="tracking_days"><option value="7">7 days</option><option value="14">14 days</option><option value="30" selected>30 days</option><option value="60">60 days</option></select></label></div>'+
  '<div id="v10-funding-preview" class="v10-quote">Budget €100.00 + 5% platform fee €5.00 = €105.00 quoted · Actual sandbox charge €0.00</div>'+
  '<label class="v10-checkbox"><input name="rights_confirmed" type="checkbox" required><span>I own or have permission to distribute this music and every uploaded asset, and I accept that valid, already-recorded view evidence cannot be erased by deleting media later.</span></label>'+
  '<label class="v10-checkbox"><input name="fund_test" type="checkbox" '+(sandbox?'checked':'disabled')+'><span>Automatically launch the campaign in sandbox when the files finish uploading ('+
  (sandbox?'€0 actually charged':'sandbox not configured')+').</span></label>'+
  '<button class="v10-button v10-primary v10-submit" type="submit">'+symbol('bolt',18)+' '+(sandbox?'Create & test-fund for €0':'Save campaign draft')+'</button>'+
  '<p id="v10-create-state" role="status">No payment details needed. TikTok verification and real payouts require approved integrations.</p>'+
  '</form></div>';
 showOverlay(form,'large');
}
const formerCampaignModal=campaignModal;
campaignModal=function(){wizard()};
function assetElement(a,canManage){
 const image=a.mime.startsWith('image/')&&a.preview_url;
 const video=a.mime.startsWith('video/')&&a.preview_url;
 return '<article class="v10-asset"><div class="v10-asset-art">'+
  (image?'<img alt="" loading="lazy" src="'+value(a.preview_url)+'">':video?'<video playsinline preload="none" controls src="'+value(a.preview_url)+'"></video>':
  '<span>'+symbol('scissors',24)+'</span>')+'</div>'+
  '<div class="v10-asset-info"><b>'+value(a.label)+'</b><small>'+value(a.mime)+' · '+(a.bytes/1048576).toFixed(1)+' MB</small>'+
  '<a class="v10-small" href="'+value(a.download_url)+'">Download original</a>'+
  (canManage?'<button class="v10-small is-danger" data-v10-hide-asset="'+value(a.id)+'">Hide asset</button>':'')+'</div></article>';
}
function subRow(s){
 const old=Number(s.highest_views||0),hold=s.risk_flag||s.post_access!=='visible';
 return '<div class="v10-sub-row"><div class="v10-sub-name"><b>@'+value(s.clipper_name||s.clipper_id)+'</b>'+status(s.review_status)+'</div>'+
 '<a href="'+value(s.post_url)+'" rel="noopener noreferrer" target="_blank">Open TikTok video</a>'+
 '<div class="v10-sub-stats"><span><b>'+old.toLocaleString('en-GB')+'</b> API views</span>'+
 '<span><b>'+euro(s.accrued_cents)+'</b> TEST credits</span><span><b>'+euro(s.settled_cents)+'</b> TEST settled</span></div>'+
 (hold?'<p class="v10-alert">'+value(s.risk_flag||s.post_access)+' — needs human verification; credits on hold.</p>':'')+
 (s.review_status==='rejected'?'<p>Rejection: '+value(s.review_reason,500)+'</p>':'')+
 '<div class="v10-btn-row">'+
 (s.review_status==='pending'||s.review_status==='disputed'?'<button class="v10-button v10-primary" data-v10-review="'+value(s.submission_id)+'" data-v10-decision="approved">Approve content</button>'+
 '<button class="v10-button v10-outlined" data-v10-review="'+value(s.submission_id)+'" data-v10-decision="rejected">Reject with reason</button>':'')+
 '<button class="v10-button v10-outlined" data-v10-refresh="'+value(s.submission_id)+'">Verify latest views</button>'+
 (s.review_status==='approved'?'<button class="v10-button v10-outlined" data-v10-settle="'+value(s.submission_id)+'">Test settle after hold</button>':'')+
 '</div></div>';
}
function viewCampaign(campaign,assets,submissions,social){
 const isOwner=S.user?.id===campaign.owner_id,eligible=campaign.status==='sandbox_active';
 const linked=(social?.connections||[]).find(x=>x.provider==='tiktok'&&x.status==='active');
 const baseRequired=campaign.pricing_model==='cpm';
 const budget=Number(campaign.is_sandbox?campaign.sandbox_funded_cents:campaign.paid_cents)||0;
 const spent=Number(campaign.is_sandbox?campaign.sandbox_spent_cents:campaign.spent_cents)||0;
 return '<div class="v10-detail"><header class="v10-detail-head"><span class="v10-kicker">CREATOR REWARDS / '+(campaign.is_sandbox?'SANDBOX':'DRAFT')+'</span>'+
  '<h2>'+value(campaign.title)+'</h2><p>'+value(campaign.artist_name)+' · '+value(campaign.release_title)+'</p>'+
  '<div class="v10-tags"><span> TikTok</span><span>'+euro(campaign.cpm_rate_cents)+' / 1K reported views</span>'+
  '<span>Max '+euro(campaign.max_clip_cents)+' / clip</span>'+status(campaign.status)+'</div></header>'+
  '<div class="v10-statcards"><div><small>CAMPAIGN BUDGET</small><b>'+euro(campaign.budget_cents)+'</b></div>'+
  '<div><small>PLATFORM FEE · 5%</small><b>'+euro(campaign.fee_cents)+'</b></div>'+
  '<div><small>QUOTED TOTAL</small><b>'+euro(campaign.budget_cents+campaign.fee_cents)+'</b></div>'+
  '<div><small>ACTUAL FUNDS RECEIVED</small><b>€0.00</b></div></div>'+
  '<div class="v10-amount-foot">TEST CREDIT: '+euro(Math.max(0,budget-spent))+' of '+euro(budget)+' · not backed by real money or eligible for withdrawal.</div>'+
  '<div class="v10-detail-grid"><section><div class="v10-section-head"><h3>Full mission brief</h3><span>Read before publishing</span></div>'+
  '<div class="v10-readonly">'+value(campaign.brief,4500)+'</div>'+
  '<div class="v10-guideline"><b>Creative requirements</b><p>'+value(campaign.rules||'Follow the artist’s brief and platform community guidelines.',2000)+'</p></div>'+
  (campaign.prohibited_content?'<div class="v10-guideline"><b>Do not include</b><p>'+value(campaign.prohibited_content,800)+'</p></div>':'')+
  '<div class="v10-guideline"><b>Posting requirements</b><p>Minimum '+Number(campaign.min_views).toLocaleString()+' API views · '+
  Number(campaign.tracking_days)+' days tracking · max '+euro(campaign.max_clip_cents)+' noncash test credits per clip.</p>'+
  (campaign.mandatory_hashtags?'<p>Hashtags: '+value(campaign.mandatory_hashtags,180)+'</p>':'')+
  (campaign.sample_caption?'<p>Caption example: '+value(campaign.sample_caption,280)+'</p>':'')+'</div>'+
  (campaign.spotify_track_url?'<a class="v10-button v10-outlined" href="'+value(campaign.spotify_track_url)+'" target="_blank" rel="noopener noreferrer">Listen on Spotify '+symbol('arrow',16)+'</a>':'')+
  '<div class="v10-section-head"><h3>Official media pack</h3><span>'+assets.length+' assets</span></div>'+
  '<div class="v10-assets">'+(assets.length?assets.map(a=>assetElement(a,isOwner)).join(''):'<div class="v10-empty">Original release media is available from the music library. No extra assets uploaded yet.</div>')+'</div>'+
  (isOwner?'<form id="v10-asset-upload" data-cid="'+value(campaign.id)+'" class="v10-asset-form">'+
   '<label>Add more original campaign assets<input type="file" name="asset" required accept="video/mp4,video/webm,image/jpeg,image/png,image/webp,audio/mpeg,audio/wav,application/pdf"></label>'+
   '<button class="v10-button v10-outlined" type="submit">Upload asset</button></form>':'')+
  '</section><aside><div class="v10-cta-panel"><span class="v10-kicker">'+(isOwner?'ARTIST OPERATIONS':'YOUR CLIPPER WORKFLOW')+'</span>'+
  (isOwner?ownerControls(campaign):clipperControls(campaign,linked,social))+'</div>'+
  '<div class="v10-steps"><h3>Payment & content safety</h3>'+
  ['Only officially linked TikTok video ownership can unlock view tracking.',
   'The artist reviews against the campaign rules and records a reason for rejection.',
   'View growth is rechecked through the official API; unusual activity is flagged.',
   'A 72-hour hold and current post-availability check precede test settlement.',
   'Deleting a post suspends future credit checks; old evidence is retained for disputes.',
   'Nothing in this sandbox is a cash payout, and artist asset removal cannot erase review evidence.'].map((v,i)=>'<div><span>0'+(i+1)+'</span><p>'+v+'</p></div>').join('')+
  '</div></aside></div>'+
  (isOwner?'<section class="v10-reviews"><div class="v10-section-head"><h3>Clipper submissions & approvals</h3><span>Evidence preserved on the server</span></div>'+
   (submissions.length?submissions.map(subRow).join(''):'<div class="v10-empty">No connected TikTok videos have been submitted to this campaign yet.</div>')+'</section>':'')+
  '</div>';
}
function ownerControls(c){
 const draft=['draft','awaiting_payment'].includes(c.status);
 const pause=c.status==='sandbox_active';
 return '<h3>Campaign control</h3><p>Your terms remain locked after funding so clippers are not surprised by a retroactive rate change.</p>'+
  (draft&&S.config?.billing_sandbox_enabled?'<button class="v10-button v10-primary" data-v10-fund="'+value(c.id)+'">'+symbol('bolt',18)+
   ' Test fund · €0 charged</button>':'')+
  (pause?'<button class="v10-button v10-outlined" data-v10-state="'+value(c.id)+'" data-v10-command="pause">Pause new submissions</button>':'')+
  (c.status==='sandbox_paused'?'<button class="v10-button v10-primary" data-v10-state="'+value(c.id)+'" data-v10-command="resume">Resume campaign</button>':'')+
  '<p class="v10-alert">Artists can remove their own provided media from new campaigns. They cannot delete TikTok posts from a clipper’s account or erase already recorded review evidence.</p>';
}
function clipperControls(c,linked,social){
 if(!S.user)return '<h3>Start clipping</h3><p>Sign in to link your TikTok account before posting.</p><button class="v10-button v10-primary" data-action="register">Create an account</button>';
 if(!linked)return '<h3>Step 1 · Connect TikTok</h3><p>You must connect the actual TikTok account you will use to publish your clip. A typed username is not enough.</p>'+
  (social?.ready?.tiktok?'<a class="v10-button v10-primary" href="/connect/tiktok">Connect TikTok securely</a>':
  '<div class="v10-alert">TikTok OAuth approval and credentials are not configured. Submissions cannot earn verified-view credits until the official integration is available.</div>')+
  socialLink();
 return '<h3>Step 2 · Publish & verify</h3><p>Connected identity: <b>'+value(linked.display_name)+'</b></p>'+
  '<a class="v10-button v10-outlined" target="_blank" rel="noopener noreferrer" href="https://www.tiktok.com/upload">Upload your clip on TikTok</a>'+
  (c.sample_caption?'<button class="v10-button v10-outlined" data-v10-copy-caption="'+value(c.sample_caption)+'">Copy sample caption</button>':'')+
  '<form id="v10-clip-submit" data-cid="'+value(c.id)+'"><label>TikTok video URL<input required type="url" name="post_url" placeholder="https://www.tiktok.com/@youraccount/video/123..."></label>'+
  '<button class="v10-button v10-primary" type="submit" '+(c.status==='sandbox_active'?'':'disabled')+'>'+
  symbol('shield',17)+' Verify ownership & submit</button></form>'+
  '<p>Submission checks TikTok ownership and public views through the official API. It does not automatically pay for unverified engagement.</p>';
}
async function openCampaign(id){
 const target=(S.myCampaigns||[]).concat(S.campaigns||[]).find(x=>x.id===id);
 if(target?.pricing_model!=='cpm')return previousDetail(id);
 X.currentCampaign=id;
 showOverlay('<div class="v10-detail" id="v10-detail"><h2>Opening real campaign…</h2><p>Loading artist brief, media and review data securely.</p></div>','large');
 try{
  const [data,submissions,social]=await Promise.all([
   api('/campaigns/'+id+'/v10'),
   S.user?.id===target.owner_id?api('/campaigns/'+id+'/cpm-submissions'):Promise.resolve({submissions:[]}),
   S.user?api('/social/connections'):Promise.resolve(null)
  ]);
  X.detail=data;X.submissions=submissions.submissions||[];
  const element=document.querySelector('#v10-detail');
  if(element&&X.currentCampaign===id)element.outerHTML=viewCampaign(data.campaign,data.assets||[],X.submissions,social);
 }catch(err){
  const element=document.querySelector('#v10-detail');if(element)element.innerHTML='<h2>Campaign unavailable</h2><p>'+value(err.message||'Refresh and try again.')+'</p>';
 }
}
const previousDetail=campaignDetail;
campaignDetail=function(id){openCampaign(id)};
const prevStudio=studioPage;
studioPage=function(){
 const html=prevStudio();
 if(!S.user)return html;
 return '<div class="v10-artist-banner"><div><span class="v10-kicker">NEW · CAMPAIGN LAUNCHPAD</span><h3>Publish the track. Drop the assets. Set CPM. Go.</h3>'+
  '<p>One campaign wizard for your source files, creative brief, rules, budget and creator reward rate.</p></div>'+
  '<button class="v10-button v10-primary" data-action="create-campaign">Launch a CPM campaign</button></div>'+html;
};
async function reloadCampaign(){
 if(X.currentCampaign){await refresh(true);await openCampaign(X.currentCampaign);}
}
function formState(form,msg){const el=form.querySelector('[role="status"]');if(el)el.textContent=msg;}
document.addEventListener('change',e=>{
 if(e.target?.id==='v10-assets-files'){
  const files=[...e.target.files||[]];
  const out=document.querySelector('#v10-selected-files');
  if(out)out.textContent=files.length?files.length+' selected file(s) · '+files.map(f=>f.name).join(', '):'Your original release is included automatically.';
 }
},true);
document.addEventListener('input',e=>{
 const form=e.target.closest('#v10-create-form');
 if(!form)return;
 const cost=Number(form.elements.budget_eur.value)||0;
 const el=form.querySelector('#v10-funding-preview');
 if(el)el.textContent='Budget €'+cost.toFixed(2)+' + 5% platform fee €'+(cost*.05).toFixed(2)+
  ' = €'+(cost*1.05).toFixed(2)+' quoted · Actual sandbox charge €0.00';
},true);
document.addEventListener('submit',async e=>{
 const f=e.target;
 if(!['v10-create-form','v10-asset-upload','v10-clip-submit','v10-spotify-form'].includes(f.id))return;
 e.preventDefault();e.stopImmediatePropagation();
 const button=f.querySelector('[type=submit]');
 if(button)button.disabled=true;
 try{
  if(f.id==='v10-create-form'){
   const data=new FormData(f),fields=['release_id','title','brief','spotify_track_url','mandatory_hashtags','sample_caption','rules','prohibited_content'];
   const body=Object.fromEntries(fields.map(k=>[k,String(data.get(k)||'').trim()]));
   for(const field of ['rate_eur_per_1000','max_per_clip_eur','budget_eur','min_views','tracking_days'])body[field]=Number(data.get(field));
   body.rights_confirmed=data.get('rights_confirmed')==='on';
   const files=[...(f.querySelector('#v10-assets-files')?.files||[])];
   if(files.length>16)throw Error('Choose no more than 16 files.');
   formState(f,'Saving the real campaign and your creative requirements…');
   const created=await api('/campaigns/v10','POST',body),cid=created.campaign.id;
   let uploaded=0;
   for(const file of files){
    formState(f,'Uploading '+file.name+' ('+(uploaded+1)+'/'+files.length+')…');
    const parts=new FormData();parts.append('asset',file,file.name);
    await api('/campaigns/'+cid+'/assets','POST',parts);uploaded++;
   }
   if(data.get('fund_test')==='on'){
    formState(f,'Starting the test campaign — €0 is being charged…');
    const funding=await api('/campaigns/'+cid+'/sandbox-fund','POST',{});
    if(funding.charged_cents!==0)throw Error('Sandbox charge check failed.');
   }
   closeOverlay();await refresh(true);
   toast('Campaign saved with '+uploaded+' assets. '+(data.get('fund_test')==='on'?'TEST funding active: €0 charged.':'Draft ready.'));
   openCampaign(cid);
  }else if(f.id==='v10-asset-upload'){
   const data=new FormData(f),cid=f.dataset.cid;await api('/campaigns/'+cid+'/assets','POST',data);
   toast('Media asset stored in your campaign.');await reloadCampaign();
  }else if(f.id==='v10-clip-submit'){
   const data=new FormData(f);
   const result=await api('/campaigns/'+f.dataset.cid+'/cpm-submissions','POST',{post_url:String(data.get('post_url')||'')});
   toast('TikTok ownership verified. Submission awaits artist review. '+Number(result.provider_views).toLocaleString()+' API views recorded.');
   await reloadCampaign();
  }else{
   const data=new FormData(f);
   await api('/social/spotify/artist','PATCH',{artist_url:String(data.get('artist_url')||'')});
   X.loadedFor='';await loadSocial(true);
   toast('Spotify artist reference saved. Ownership is not independently verified.');
  }
 }catch(err){toast(err.message||'Operation failed; no real money was charged.',true);formState(f,err.message||'Could not complete operation.');}
 finally{if(button?.isConnected)button.disabled=false;}
},true);
document.addEventListener('click',async e=>{
 const node=e.target.closest('[data-v10-disconnect],[data-v10-reload-social],[data-v10-copy-caption],[data-v10-review],[data-v10-refresh],[data-v10-settle],[data-v10-hide-asset],[data-v10-fund],[data-v10-state]');
 if(!node)return;
 e.preventDefault();e.stopImmediatePropagation();
 const action=node.dataset;
 if(action.v10CopyCaption){try{await navigator.clipboard.writeText(action.v10CopyCaption);toast('Caption copied.');}catch{toast('Copy is unavailable in this browser.',true);}return;}
 if(action.v10ReloadSocial!==undefined){X.loadedFor='';await loadSocial(true);return;}
 let message='',uri='',body={},method='POST',reload=true;
 if(action.v10Disconnect){message='Disconnect '+action.v10Disconnect+'? TikTok submissions will not be verifiable again until you reconnect.';
  uri='/social/disconnect';body={provider:action.v10Disconnect};reload=false;}
 else if(action.v10Fund){message='Fund this campaign in TEST mode? The quoted budget and 5% fee will be shown, but €0 is charged.';
  uri='/campaigns/'+action.v10Fund+'/sandbox-fund';body={};}
 else if(action.v10State){message=action.v10Command==='pause'?'Pause new submissions? Existing tracked views and evidence will remain.':'Resume the test campaign?';
  uri='/campaigns/'+action.v10State+'/'+action.v10Command;body={};}
 else if(action.v10HideAsset){message='Hide this uploaded asset from future clippers? Existing evidence will be retained.';
  uri='/campaigns/'+X.currentCampaign+'/assets/'+action.v10HideAsset;method='DELETE';}
 else if(action.v10Review){
  const decision=action.v10Decision;
  const reason=decision==='rejected'?window.prompt('Explain rejection clearly (minimum 12 characters):',''):window.prompt('Optional note explaining why this content meets the campaign requirements:','');
  if(reason===null)return;
  if(decision==='rejected'&&reason.trim().length<12)return toast('Give a specific rejection reason.',true);
  uri='/cpm-submissions/'+action.v10Review+'/review';body={decision,reason};
  message='Record '+decision+' decision? No cash will be credited.';
 }
 else if(action.v10Refresh){uri='/cpm-submissions/'+action.v10Refresh+'/refresh';body={};}
 else if(action.v10Settle){uri='/cpm-submissions/'+action.v10Settle+'/settle';body={};
  message='Finalize only eligible TEST credits after the 72-hour hold? €0 can be withdrawn.';}
 if(message&&!window.confirm(message))return;
 node.disabled=true;
 try{
  const result=await api(uri,method,method==='DELETE'?undefined:body);
  toast(result.note||result.notice||'Change saved successfully. No real payment made.');
  if(action.v10Disconnect){X.loadedFor='';await loadSocial(true);}
  else if(reload)await reloadCampaign();
 }catch(err){toast(err.message||'Action could not be completed.',true);}
 finally{if(node?.isConnected)node.disabled=false;}
},true);
const query=new URLSearchParams(location.search);
const socialResult=query.get('social');
if(socialResult){
 query.delete('social');history.replaceState(null,'',location.pathname+(query.toString()?'?'+query:''));
 window.addEventListener('load',()=>{if(socialResult.endsWith('_connected'))toast('Official '+socialResult.split('_')[0]+' account connected.');
  else toast('Social account connection was cancelled.',true);
  X.loadedFor='';S.page='connections';render();},{once:true});
}
window.ViewlyCreatorRewards={openWizard:wizard,openCampaign,refreshSocial:()=>loadSocial(true)};
})();