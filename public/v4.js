/* VIEWLY V4 / Original music-industry workspace. Data from live API only. */
(()=>{
'use strict';
const Y={discover:'campaigns',studio:'overview',campaigns:'live',campaignDetail:'brief',settings:'account',range:'all'};
const nav=(page,label,glyph)=>'<button type="button" class="v-nav '+(S.page===page?'is-active':'')+'" data-page="'+page+'">'+ico(glyph,17)+'<span>'+label+'</span></button>';
const action=(label,target,icon='arrow',kind='quiet')=>'<button class="v-action '+kind+'" type="button" data-page="'+target+'">'+ico(icon,16)+' '+label+'</button>';
const row=(name,value,sub='')=>'<div class="v-data-row"><span>'+name+(sub?'<small>'+sub+'</small>':'')+'</span><strong>'+value+'</strong></div>';
const title=(eyebrow,main,sub='',buttons='')=>'<div class="v-page-header"><div><div class="v-overline">'+eyebrow+'</div><h1>'+main+'</h1>'+(sub?'<p>'+sub+'</p>':'')+'</div><div class="v-page-actions">'+buttons+'</div></div>';
const tabs=(key,values)=>'<div role="tablist" class="v-tabs" aria-label="'+key+' sections">'+values.map(([k,label])=>'<button class="v-tab '+(Y[key]===k?'is-current':'')+'" role="tab" aria-selected="'+(Y[key]===k)+'" data-v-tab="'+key+':'+k+'">'+label+'</button>').join('')+'</div>';
const empty=(heading,sub='',btn='')=>'<div class="v-no-data"><div class="v-no-data-icon">'+ico('releases',27)+'</div><h3>'+heading+'</h3><p>'+sub+'</p>'+btn+'</div>';
const money=x=>eur(Number(x)||0);
const surface=(label,content,sub='')=>'<section class="v-section"><div class="v-section-head"><div><h2>'+label+'</h2>'+(sub?'<p>'+sub+'</p>':'')+'</div></div>'+content+'</section>';
const role=()=>S.user ? (isCreator()?'ARTIST WORKSPACE':'VIEWER WORKSPACE'):'EXPLORE THE MUSIC';
const myRelease=()=>S.releases.filter(x=>x.owner_id===S.user?.id);
const campaignRows=arr=>arr.length?'<div class="v-campaign-table">'+arr.map(c=>'<button class="v-campaign-entry" data-action="'+(S.user?.id===c.owner_id?'manage-campaign':'campaign')+'" data-id="'+esc(c.id)+'"><span class="v-campaign-avatar">'+(c.cover_url?'<img alt="" src="'+esc(c.cover_url)+'">':ico('releases',20))+'</span><span class="v-campaign-name"><b>'+esc(c.title)+'</b><small>'+esc(c.artist_name)+' / '+esc(c.release_title)+'</small></span><span class="v-campaign-status">'+esc((c.status||'draft').replace(/_/g,' '))+'</span><span class="v-campaign-reward"><b>'+money(c.reward_cents)+'</b><small>per clip</small></span><span class="v-campaign-chevron">'+ico('arrow',17)+'</span></button>').join('')+'</div>':empty('There are no campaigns yet.','Paid opportunities appear after verified funding. Artist drafts remain private.',isCreator()?'<button class="v-button is-primary" data-action="create-campaign">Create campaign brief '+ico('arrow',16)+'</button>':'');
const headerNav=()=>'<nav class="v-rail" aria-label="Primary navigation"><div class="v-rail-group"><div class="v-rail-label">BROWSE</div>'+nav('discover','Home','discover')+nav('campaigns','Campaigns','campaigns')+nav('releases','Music library','releases')+'</div><div class="v-rail-group"><div class="v-rail-label">WORKSPACE</div>'+nav('studio','Artist studio','studio')+nav('clips','Clip editor','scissors')+nav('wallet','Rewards & ledger','wallet')+'</div><div class="v-rail-group"><div class="v-rail-label">ACCOUNT</div>'+nav('profile','Settings','user')+'</div></nav>';
const userTop=()=>S.user?'<button class="v-user" data-page="profile"><span class="v-user-avatar">'+esc(S.user.display_name?.[0]||'V').toUpperCase()+'</span><span class="v-user-info"><b>'+esc(S.user.display_name)+'</b><small>@'+esc(S.user.username)+'</small></span>'+ico('arrow',14)+'</button>':'<div class="v-top-auth"><button class="v-button is-subtle" data-action="login">Sign in</button><button class="v-button is-primary" data-action="register">Get started '+ico('arrow',14)+'</button></div>';
renderShell=function(content){
 return '<div class="v-app-shell"><aside class="v-sidebar"><div class="v-sidebar-head"><a href="/" class="v-logo" data-page="discover" aria-label="Viewly home"><span class="v-logo-identity">V<span class="v-logo-dot">.</span></span><span class="v-logo-word">VIEWLY<small>MUSIC NETWORK</small></span></a></div>'+headerNav()+'<div class="v-sidebar-bottom"><div class="v-system-indicator"><span class="v-led"></span><span>LIVE CONTENT <b> / STAGING</b></span></div><div class="v-sidebar-profile">'+userTop()+'</div></div></aside><div class="v-workspace"><header class="v-topbar"><div class="v-top-left"><span class="v-top-location">VIEWLY <span>/</span> '+esc(({discover:'Discover',campaigns:'Campaigns',releases:'Music library',clips:'Clip editor',studio:'Artist studio',wallet:'Rewards',profile:'Settings'})[S.page]||'Home')+'</span></div><div class="v-top-right"><button class="v-search-trigger" type="button" data-ux-command="open" aria-label="Search Viewly">'+ico('search',17)+'<span>Search anything</span><kbd>⌘ K</kbd></button>'+(S.user?'<button class="v-icon-button" type="button" data-ux-command="activity" title="Notifications" aria-label="Notifications">'+ico('bell',17)+'</button>':'')+userTop()+'</div></header><main class="v-main" id="main-content">'+content+'<footer class="v-footer"><span>VIEWLY MUSIC © 2026</span><span>Independent artists. Real releases. Real data.</span></footer></main></div><nav class="v-bottom-nav" aria-label="Mobile navigation">'+[['discover','Home','discover'],['campaigns','Campaigns','campaigns'],['releases','Music','releases'],['clips','Clip','scissors'],['profile','Account','user']].map(([p,l,i])=>nav(p,l,i)).join('')+'</nav></div>';
};
const originalReleaseCard=releaseCard;
releaseCard=function(r){
 return '<article class="v-release"><button type="button" class="v-release-art" data-action="play" data-id="'+esc(r.id)+'" aria-label="Play '+esc(r.title)+'">'+(r.cover_url?'<img alt="" loading="lazy" src="'+esc(r.cover_url)+'">':'<span class="v-cover-fallback">V<span>.</span></span>')+'<span class="v-release-play">'+ico('play',20)+'</span></button><div class="v-release-info"><div class="v-release-genre">'+esc(r.genre)+'</div><h3>'+esc(r.title)+'</h3><p>'+esc(r.artist_name)+'</p><div class="v-release-footer"><button type="button" class="v-text-button" data-action="play" data-id="'+esc(r.id)+'">Listen '+ico('arrow',14)+'</button><button type="button" class="v-icon-button v-share" data-ux-share="'+esc(r.id)+'" aria-label="Share release">'+ico('arrow',14)+'</button></div></div></article>';
};
campaignCard=function(c){
 const remaining=Number(c.remaining_cents ?? Math.max(0,Number(c.budget_cents||0)-Number(c.spent_cents||0)));
 const budget=Number(c.budget_cents||0),progress=budget>0?Math.max(0,Math.min(100,100*(budget-remaining)/budget)):0;
 return '<article class="v-campaign-card"><div class="v-campaign-cover">'+(c.cover_url?'<img src="'+esc(c.cover_url)+'" loading="lazy" alt="">':'<div class="v-campaign-cover-blank">'+ico('releases',43)+'</div>')+'<div class="v-campaign-platform">'+esc(c.platform||'Music')+'</div></div><div class="v-campaign-content"><span class="v-campaign-eyebrow">ARTIST CAMPAIGN</span><h3>'+esc(c.title)+'</h3><p class="v-campaign-artist">'+esc(c.artist_name)+' <span>·</span> '+esc(c.release_title)+'</p><div class="v-reward-bar"><div><span>Reward per approved clip</span><strong>'+money(c.reward_cents)+'</strong></div><div><span>Spots remaining</span><strong>'+Number(c.eligible_spots||0)+'</strong></div></div><div class="v-progress-info"><span>Campaign budget</span><b>'+money(budget-remaining)+' <span>/ '+money(budget)+'</span></b></div><div class="v-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.round(progress)+'" aria-label="Campaign budget spent"><i style="width:'+progress+'%"></i></div><button type="button" class="v-card-cta" data-action="campaign" data-id="'+esc(c.id)+'">Explore campaign '+ico('arrow',16)+'</button></div></article>';
};
function openCards(cards){return cards.length?'<div class="v-campaign-grid">'+cards.map(campaignCard).join('')+'</div>':empty('No funded campaigns available.','Only creator-funded, verified opportunities are shown. Nothing here is simulated.');}
function featuredRelease(releases){
 if(!releases.length)return '<div class="v-featured-empty"><div class="v-featured-disc"><div></div></div><div><span>THE FIRST DROP</span><h2>Discover what comes next.</h2><p>New releases will appear here as artists publish original music.</p><button class="v-button is-primary" data-page="releases">Explore music '+ico('arrow',14)+'</button></div></div>';
 const [first,...rest]=releases;
 return '<div class="v-featured-release"><button class="v-featured-image" data-action="play" data-id="'+esc(first.id)+'">'+(first.cover_url?'<img src="'+esc(first.cover_url)+'" alt="">':'<div class="v-featured-placeholder">V.</div>')+'<span class="v-featured-play">'+ico('play',23)+'</span></button><div class="v-featured-copy"><span class="v-overline">FEATURED RELEASE · '+esc(first.genre)+'</span><h2>'+esc(first.title)+'</h2><p>'+esc(first.artist_name)+'</p><button class="v-button is-primary" data-action="play" data-id="'+esc(first.id)+'">Listen to release '+ico('arrow',15)+'</button></div></div>';
}
discover=function(){
 const releases=S.releases.slice(0,8),campaigns=S.campaigns;
 const selected=Y.discover==='campaigns'?campaigns:releases;
 const content=Y.discover==='campaigns'?
   (campaigns.length?openCards(campaigns):'<div class="v-home-empty"><div class="v-home-empty-mark">'+ico('campaigns',20)+'</div><div><strong>No active campaigns yet</strong><p>Artist campaigns will appear here after verified funding.</p></div><button type="button" class="v-mini-link" data-page="campaigns">Campaign desk '+ico('arrow',14)+'</button></div>'):
   (releases.length?'<div class="v-releases-grid">'+releases.map(releaseCard).join('')+'</div>':'<div class="v-home-empty"><div class="v-home-empty-mark">'+ico('releases',20)+'</div><div><strong>No tracks published yet</strong><p>Artists can upload their own original music videos.</p></div><button type="button" class="v-mini-link" data-page="releases">Music library '+ico('arrow',14)+'</button></div>');
 const top='<section class="v-home-top v-home-top-v2"><div><span class="v-overline">VIEWLY / MUSIC NETWORK</span><h1>Move the music<span class="v-title-punct">.</span></h1><p>Artists, releases and creator opportunities — all in one place.</p></div><div class="v-home-actions"><button type="button" class="v-button is-primary" data-action="'+(isCreator()?'upload':S.user?'role':'register')+'">'+ico('plus',16)+' '+(isCreator()?'Upload release':'Get started')+'</button></div></section>';
 const snapshot='<div class="v-home-snapshot"><div><span>RELEASES</span><b>'+S.releases.length+'</b></div><div><span>FUNDED CAMPAIGNS</span><b>'+S.campaigns.length+'</b></div><div><span>YOUR CLIPS</span><b>'+(S.user?Number(S.stats.clips||0):'—')+'</b></div><button type="button" data-page="studio">'+ico('arrow',16)+' Studio</button></div>';
 const stage=releases.length?featuredRelease(releases):'';
 const sectionBody='<section class="v-home-discover"><div class="v-home-section-heading"><div><span class="v-overline">DISCOVER</span><h2>Explore opportunities</h2></div><button class="v-mini-link" data-page="'+(Y.discover==='campaigns'?'campaigns':'releases')+'">View all '+ico('arrow',14)+'</button></div>'+tabs('discover',[['campaigns','Campaigns'],['releases','Music']])+content+'</section>';
 const shortcuts='<section class="v-home-tools"><div class="v-home-tool"><span class="v-home-tool-icon">'+ico('releases',18)+'</span><div><b>Discover releases</b><small>Browse real artist uploads</small></div><button data-page="releases" aria-label="Browse releases">'+ico('arrow',16)+'</button></div><div class="v-home-tool"><span class="v-home-tool-icon">'+ico('scissors',18)+'</span><div><b>Clip editor</b><small>Export original MP4 clips</small></div><button data-page="clips" aria-label="Open clip editor">'+ico('arrow',16)+'</button></div><div class="v-home-tool"><span class="v-home-tool-icon">'+ico('studio',18)+'</span><div><b>Artist studio</b><small>Manage uploads and briefs</small></div><button data-page="studio" aria-label="Open artist studio">'+ico('arrow',16)+'</button></div></section>';
 return top+snapshot+sectionBody+stage+shortcuts;
};
campaignsPage=function(){
 const list=Y.campaigns==='mine'?(S.user?S.myCampaigns:[]):S.campaigns;
 return title('PROMOTION / CAMPAIGNS','Campaigns','Music promotion, built around real releases and verified creator funding.','<button class="v-button is-primary" data-action="'+(isCreator()?'create-campaign':S.user?'role':'register')+'">'+ico('plus',15)+' New campaign</button>')+
 '<div class="v-campaign-toolbar">'+tabs('campaigns',[['live','Discover campaigns'],['mine','Your campaigns']])+'<span class="v-results">'+list.length+' results</span></div>'+
 (Y.campaigns==='mine'?campaignRows(list):openCards(list))+
 '<div class="v-integrity"><span>'+ico('shield',18)+'</span><div><b>Only legitimate campaigns.</b><p>Campaign payouts and third-party view verification are not currently enabled. Drafts do not appear as funded campaigns.</p></div></div>';
};
studioPage=function(){
 if(!S.user||!isCreator())return title('CREATOR WORKSPACE','Artist studio','Your workspace for music releases and campaign operations.')+'<div class="v-studio-gate">'+(S.user?'<button class="v-button is-primary" data-action="role">Enable artist tools</button>':'<button class="v-button is-primary" data-action="register">Create your artist account</button>')+'</div>';
 const own=myRelease(),all=S.myCampaigns;
 const metrics='<div class="v-kpi-row">'+[
 ['Published releases',String(S.stats.releases||0),'Recorded releases'],
 ['Unique plays',String(S.stats.plays||0),'Signed-in listeners'],
 ['Campaigns',String(S.stats.campaigns||0),'Including private drafts'],
 ['Clip exports',String(S.stats.clips||0),'Produced videos']
 ].map(([label,note,foot])=>'<div class="v-kpi"><span>'+label+'</span><b>'+note+'</b><small>'+foot+'</small></div>').join('')+'</div>';
 const releases=own.length?'<div class="v-releases-grid">'+own.map(releaseCard).join('')+'</div>':empty('Your music library is empty.','Start with an original video or visualizer.','<button class="v-button is-primary" data-action="upload">Upload your first release '+ico('arrow',14)+'</button>');
 return title('ARTIST / OPERATIONS','Artist studio','Your music, campaign performance and creative workflow — in one place.','<button class="v-button is-subtle" data-action="upload">'+ico('plus',15)+' Upload release</button><button class="v-button is-primary" data-action="create-campaign">New campaign '+ico('arrow',15)+'</button>')+metrics+
 tabs('studio',[['overview','Overview'],['releases','Releases'],['campaigns','Campaigns']])+
 (Y.studio==='overview'?'<div class="v-workspace-two"><div>'+surface('Your releases',releases)+'</div><div>'+surface('Campaign status','<div class="v-operation-panel">'+row('Campaign drafts',String(all.filter(c=>c.status==='draft').length))+row('Active campaigns',String(all.filter(c=>c.status==='active').length))+row('Published releases',String(own.length))+'</div>')+'</div></div>'+surface('Campaign workspace',campaignRows(all)):
 Y.studio==='releases'?surface('Music catalogue',releases):surface('Your campaign portfolio',campaignRows(all)));
};
const originalProfile=profilePage;
profilePage=function(){
 if(!S.user)return title('ACCOUNT','Settings','Account preferences and security controls.')+'<div class="v-studio-gate"><button class="v-button is-primary" data-action="login">Sign in to manage your account</button></div>';
 const original=originalProfile();
 const form=original.match(/<form class="form-panel" id="profile-form">[\s\S]*?<\/form>/)?.[0]||'';
 const account='<div class="v-settings-panel"><h2>Profile details</h2><p>Edit the identity shown to other Viewly members.</p>'+form+'</div>';
 const security='<div class="v-settings-panel"><h2>Sign-in & security</h2>'+row('Session','Active','This browser is signed in')+row('Password recovery','Not available','Account recovery is not yet launched')+'<div class="v-settings-actions"><button class="v-button is-subtle" data-v-security="sessions">View active sessions</button><button class="v-button is-subtle" data-v-security="revoke">Sign out of other devices</button><button class="v-button is-subtle" data-action="logout">Sign out here</button></div></div>';
 const privacy='<div class="v-settings-panel"><h2>Privacy & data</h2><p>Download a portable JSON copy of your account details, published metadata, clips, campaign drafts, activity and ledger. Original media files are downloaded separately.</p><button class="v-button is-primary" data-v-security="export">'+ico('arrow',15)+' Download my data</button><div class="v-integrity">'+ico('shield',17)+'<div><b>Staging account</b><p>A production-grade storage and backup system is not configured yet. Do not store irreplaceable uploads.</p></div></div></div>';
 const payments='<div class="v-settings-panel"><h2>Payments</h2><p>Creator funding and payouts are not enabled. No payment details will be requested until a verified provider is configured.</p><button class="v-button is-subtle" disabled>Payment methods unavailable</button></div>';
 const moderation='<div class="v-settings-panel"><h2>Content moderation</h2><p>Review genuine user reports, make a documented decision, and keep an audit trail. This console is available to administrators only.</p><button type="button" class="v-button is-subtle" data-v-moderation="load">Load pending reports</button><div class="v-admin-reports" id="v-admin-reports" aria-live="polite"></div></div>';
 return title('MY ACCOUNT','Settings','Manage identity, privacy and account access.')+'<div class="v-settings-wrap"><nav class="v-settings-nav" aria-label="Settings">'+[['account','Account'],['security','Security'],['privacy','Privacy & data'],['payments','Payments'],...(S.user.role==='admin'?[['moderation','Moderation']]:[])].map(([id,name])=>'<button class="'+(Y.settings===id?'is-current':'')+'" data-v-tab="settings:'+id+'">'+name+'</button>').join('')+'</nav><div class="v-settings-content">'+({account,security,privacy,payments,moderation}[Y.settings])+'</div></div>';
};
const originalDetail=campaignDetail;
campaignDetail=function(id){
 const c=[...S.campaigns,...S.myCampaigns].find(x=>x.id===id);
 if(!c)return toast('Campaign not found.',true);
 originalDetail(id);
 const overlay=document.querySelector('.modal');
 if(overlay)overlay.classList.add('v-detail-modal');
 const heading=overlay?.querySelector('h2');
 if(heading)heading.classList.add('v-detail-title');
};
const originalRender=render;
render=function(){originalRender();const h=document.querySelector('#main-content');if(h)h.setAttribute('tabindex','-1');document.title='Viewly Music — '+(({discover:'Discover',campaigns:'Campaigns',releases:'Music',studio:'Artist studio',clips:'Clip editor',wallet:'Rewards',profile:'Settings'})[S.page]||'Music');};


async function viewModerationReports(){
 const root=document.querySelector('#v-admin-reports');if(!root)return;
 root.textContent='Loading reports…';
 try{
  const result=await api('/admin/reports');
  const reports=result.reports||[];
  root.innerHTML=reports.length?reports.map(r=>'<article class="v-report-entry"><div><small>'+esc(r.reason)+' · '+esc(r.review_status)+'</small><b>'+esc(r.release_title)+'</b><p>'+esc(r.details||'No description provided')+'</p></div>'+(r.review_status==='pending'?'<button class="v-button is-subtle" data-v-moderation="review" data-report-id="'+esc(r.id)+'" data-release-title="'+esc(r.release_title)+'">Review</button>':'')+'</article>').join(''):'<div class="v-no-data">No reports to review.</div>';
 }catch(err){root.textContent=err.message||'Unable to load reports.'}
}
document.addEventListener('click',e=>{
 const btn=e.target.closest('[data-v-moderation]');if(!btn)return;
 e.preventDefault();e.stopPropagation();
 if(btn.dataset.vModeration==='load'){viewModerationReports();return}
 if(btn.dataset.vModeration==='review'){
  showOverlay('<div class="v-overline">ADMIN / CONTENT MODERATION</div><h2>Review a report</h2><p class="intro">This decision is written to an audit log. Hiding a release also blocks its direct video URL.</p><form id="v-review-report" data-id="'+esc(btn.dataset.reportId)+'"><div class="field"><label>DECISION</label><select name="decision" required><option value="hide">Hide release</option><option value="dismiss">Dismiss report</option></select></div><div class="field"><label>DOCUMENTED REASON</label><textarea name="reason" required minlength="10" maxlength="500" placeholder="Explain the evidence and grounds for this action"></textarea></div><button class="v-button is-primary" type="submit">Record decision</button></form>','medium');
 }
},true);
document.addEventListener('submit',async e=>{
 if(e.target.id!=='v-review-report')return;
 e.preventDefault();e.stopPropagation();
 const btn=e.target.querySelector('[type=submit]');if(btn)btn.disabled=true;
 const fd=new FormData(e.target);
 try{
  await api('/admin/reports/'+e.target.dataset.id+'/review','POST',{decision:fd.get('decision'),reason:fd.get('reason')});
  closeOverlay();toast('Moderation decision recorded.');viewModerationReports();await refresh(true);
 }catch(err){toast(err.message||'Review failed.',true)}
 finally{if(btn)btn.disabled=false}
},true);

document.addEventListener('click',async e=>{
 const button=e.target.closest('[data-v-security]');if(!button)return;
 e.preventDefault();e.stopPropagation();
 if(button.dataset.vSecurity==='export'){window.location.assign('/api/account/export');return}
 if(button.dataset.vSecurity==='sessions'){
  try{const r=await api('/account/sessions');showOverlay('<div class="v-overline">ACCOUNT / SESSIONS</div><h2>Active sessions</h2><p class="intro">Your account currently has <b>'+r.active_session_count+'</b> active sessions. You can revoke other sessions using your current password.</p><button class="v-button is-subtle" data-v-security="revoke">Sign out other devices</button>','medium')}
  catch(err){toast(err.message,true)}return;
 }
 if(button.dataset.vSecurity==='revoke'){
  showOverlay('<div class="v-overline">SECURITY / RE-AUTHENTICATE</div><h2>Sign out other devices</h2><p class="intro">Keep this session active and revoke every other device. This action requires your current password and cannot be undone.</p><form id="v-revoke-form"><div class="field"><label>CURRENT PASSWORD</label><input type="password" required minlength="1" name="password" autocomplete="current-password"></div><button class="v-button is-primary" type="submit">Revoke other sessions</button></form>','medium');
 }
},true);
document.addEventListener('submit',async e=>{
 if(e.target.id!=='v-revoke-form')return;
 e.preventDefault();e.stopPropagation();
 const btn=e.target.querySelector('[type=submit]');if(btn)btn.disabled=true;
 try{await api('/account/revoke-other-sessions','POST',{password:new FormData(e.target).get('password')});closeOverlay();toast('All other sessions have been signed out.')}
 catch(err){toast(err.message,true)}
 finally{if(btn)btn.disabled=false}
},true);

document.addEventListener('click',e=>{
 const btn=e.target.closest('[data-v-tab]');if(!btn)return;
 const [group,val]=btn.dataset.vTab.split(':');if(!Y.hasOwnProperty(group)||Y[group]===val)return;
 e.stopPropagation();e.preventDefault();Y[group]=val;render();
},true);
})();
