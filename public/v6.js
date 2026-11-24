/* VIEWLY V6 — native campaign discovery + real submission status + higher-intent actions.
   No invented campaign metrics, simulated payments, or fake social view totals. */
(()=>{
'use strict';
const M={scope:'explore',query:'',platform:'All',sort:'recent'};
const icon=(k,n=16)=>ico(k,n);
const fmt=cents=>eur(Number(cents)||0);
const cap=x=>String(x||'').replace(/(^|_|\s)\w/g,a=>a.toUpperCase());
function card(c,mine=false){
 const id=esc(c.id), reward=Number(c.reward_cents||0), funded=Number(c.is_sandbox?c.sandbox_funded_cents:c.paid_cents||0), spent=Number(c.is_sandbox?c.sandbox_spent_cents:c.spent_cents||0);
 const remaining=Math.max(0,funded-spent),budget=Number(c.budget_cents||0);
 const pct=funded>0?Math.max(0,Math.min(100,Math.round(100*spent/funded))):0;
 const spots=reward>0?Math.floor(remaining/reward):0;
 const platform=esc(c.platform||'Any');
 const status=c.is_sandbox?'TEST · €0 PAID':c.status==='active'?'Active':cap(c.status||'draft');
 const cta=mine?'Manage campaign':'See brief';
 const action=mine?'manage-campaign':'campaign';
 return '<article class="v6-campaign-card'+(c.is_sandbox?' is-sandbox':'')+'" data-v6-card>'+
   '<div class="v6-card-image">'+(c.cover_url?'<img loading="lazy" alt="" src="'+esc(c.cover_url)+'">':'<div class="v6-card-placeholder"><span>V.</span></div>')+
     '<span class="v6-platform-tag">'+icon('video',13)+' '+platform+'</span><span class="v6-card-ordinal">VIEWLY / CAMPAIGN</span></div>'+
   '<div class="v6-card-content">'+
    '<div class="v6-card-artist"><span class="v6-artist-dot"></span><span>'+esc(c.artist_name||'Independent artist')+'</span><span class="v6-card-status">'+status+'</span></div>'+
    '<h3>'+esc(c.title)+'</h3><p class="v6-release-name">'+esc(c.release_title||'Original release')+'</p>'+
    '<div class="v6-card-metrics"><div><small>'+(c.is_sandbox?'TEST REWARD / NOT CASH':'REWARD / APPROVED CLIP')+'</small><strong>'+fmt(reward)+'</strong></div>'+
    '<div><small>'+(mine?'PLANNED BUDGET':'AVAILABLE SPOTS')+'</small><strong>'+(mine?fmt(budget):String(spots))+'</strong></div></div>'+
    '<div class="v6-budget-title"><span>'+(c.is_sandbox?'SANDBOX CREDIT / €0 CHARGED':funded?'Funded campaign':'Awaiting verified funding')+'</span><b>'+(funded?fmt(spent)+' / '+fmt(funded):fmt(0)+' funded')+'</b></div>'+
    '<div class="v6-budget-track" role="progressbar" aria-label="Funded budget allocated" aria-valuenow="'+pct+'" aria-valuemin="0" aria-valuemax="100"><i style="width:'+pct+'%"></i></div>'+
    '<div class="v6-card-footer"><button type="button" class="v6-btn v6-btn-primary v6-btn-full" data-action="'+action+'" data-id="'+id+'">'+cta+' '+icon('arrow',15)+'</button></div>'+
   '</div></article>';
}
function sorted(){
 const q=M.query.toLocaleLowerCase().trim();
 let rows=(M.scope==='mine'?(S.user?S.myCampaigns:[]):S.campaigns).filter(c=>{
  const matches=!q||[c.title,c.artist_name,c.release_title,c.platform,c.brief].some(v=>String(v||'').toLocaleLowerCase().includes(q));
  const platform=M.platform==='All'||c.platform===M.platform;
  return matches&&platform;
 });
 return [...rows].sort((a,b)=>{
  if(M.sort==='reward')return (b.reward_cents||0)-(a.reward_cents||0);
  if(M.sort==='remaining')return (b.remaining_cents||0)-(a.remaining_cents||0);
  if(M.sort==='budget')return (b.budget_cents||0)-(a.budget_cents||0);
  return String(b.created_at||'').localeCompare(String(a.created_at||''));
 });
}
function campaignResults(){
 const data=sorted();
 if(M.scope==='explore'&&!S.campaigns.length&&!M.query&&M.platform==='All'){
  return '<section class="v6-empty-market"><div class="v6-empty-art" aria-hidden="true"><div class="v6-empty-disc"><span>V.</span></div><span class="v6-empty-art-label">ORIGINAL MUSIC / REAL REWARDS</span></div>'+
   '<div class="v6-empty-copy"><span class="v6-overline"><i></i> 0 FUNDED CAMPAIGNS LIVE</span><h2>The next wave starts here.</h2>'+
   '<p>There are no funded campaigns to join yet. Artists can publish original music and prepare a campaign now; rewards activate only after verified funding and payouts are available.</p>'+
   '<div class="v6-empty-actions"><button type="button" class="v6-btn v6-btn-primary" data-action="'+(isCreator()?'upload':S.user?'role':'register')+'">'+(isCreator()?'Upload original music':S.user?'Enable artist tools':'Get started')+' '+icon('arrow',15)+'</button>'+
   '<button type="button" class="v6-btn v6-btn-quiet" data-page="releases">'+icon('releases',15)+' Explore music</button></div>'+
   '<div class="v6-launch-steps"><span><b>01</b> Publish</span><span><b>02</b> Create brief</span><span><b>03</b> Verified funding</span></div></div></section>';
 }
 if(!data.length)return '<div class="v6-zero"><div class="v6-zero-icon">'+icon('search',27)+'</div><h3>'+(M.scope==='mine'?'No campaigns in this view':'No campaigns match these filters')+'</h3>'+
  '<p>'+(M.scope==='mine'?'Create an original promotion brief from your artist workspace.':'Try another platform, reward sort or search term. Only verified active campaigns appear in Explore.')+'</p>'+
  (M.scope==='mine'?'<button class="v6-btn v6-btn-primary" data-action="'+(S.user?(isCreator()?'create-campaign':'role'):'register')+'">Create campaign '+icon('arrow',15)+'</button>':
  '<button class="v6-btn v6-btn-quiet" data-v6-reset>Clear filters '+icon('arrow',14)+'</button>')+'</div>';
 return '<div class="v6-cards-grid">'+data.map(c=>card(c,M.scope==='mine')).join('')+'</div>';
}
function platformOptions(){
 const choices=[...new Set((M.scope==='mine'?(S.user?S.myCampaigns:[]):S.campaigns).map(c=>c.platform||'Any'))];
 return ['All',...choices];
}
function toolbar(){
 const opts=platformOptions();
 return '<div class="v6-discover-controls"><div class="v6-input-wrap">'+icon('search',18)+
   '<input type="search" id="v6-campaign-search" aria-label="Search campaigns and artists" placeholder="Search artists, songs, campaigns..." value="'+esc(M.query)+'" autocomplete="off">'+
   (M.query?'<button type="button" class="v6-clear" data-v6-reset aria-label="Clear campaign search">×</button>':'')+'</div>'+
   '<label class="v6-sort-label"><span>Sort</span><select id="v6-campaign-sort" aria-label="Sort campaigns">'+[
    ['recent','Newest'],['reward','Highest reward'],['remaining','Most available funding'],['budget','Largest budget']
   ].map(([k,v])=>'<option value="'+k+'" '+(M.sort===k?'selected':'')+'>'+v+'</option>').join('')+'</select>'+icon('arrow',14)+'</label></div>'+
   '<div class="v6-filters" role="group" aria-label="Campaign platform filters">'+opts.map(p=>'<button type="button" class="v6-filter '+(M.platform===p?'is-active':'')+'" data-v6-platform="'+esc(p)+'" aria-pressed="'+(M.platform===p?'true':'false')+'">'+esc(p)+'</button>').join('')+
   '<span class="v6-result-count" id="v6-result-count">'+sorted().length+' campaigns</span></div>';
}
const previousCampaigns=campaignsPage;
campaignsPage=function(){
 const explore=M.scope==='explore';
 if(M.scope==='mine'&&!S.user)M.scope='explore';
 const h='<header class="v6-page-head"><div><span class="v6-overline"><i></i> VIEWLY / CAMPAIGN DISCOVERY</span>'+
   '<h1>Find your next <em>move.</em></h1><p>Browse music campaigns and open a real artist brief. Reward amounts are per approved clip, not per 1,000 views.</p></div>'+
   '<button type="button" class="v6-btn v6-btn-primary v6-create-btn" data-action="'+(isCreator()?'create-campaign':S.user?'role':'register')+'">'+icon('plus',17)+' Create campaign</button></header>';
 const scope='<div class="v6-main-tabs" role="tablist" aria-label="Campaigns"><button type="button" role="tab" aria-selected="'+(M.scope==='explore')+'" data-v6-scope="explore" class="'+(M.scope==='explore'?'is-current':'')+'">'+icon('discover',16)+' Explore campaigns</button>'+
  '<button type="button" role="tab" aria-selected="'+(M.scope==='mine')+'" data-v6-scope="mine" class="'+(M.scope==='mine'?'is-current':'')+'">'+icon('studio',16)+' My campaigns</button></div>';
 const hint='<div class="v6-integrity-note">'+icon('shield',18)+' <span>'+(S.config?.billing_sandbox_enabled?'SANDBOX: test campaigns use €0 payments and non-withdrawable reward quotes. Real paid campaigns require verified provider funding and compliant payouts.':'Only genuinely funded campaigns appear publicly. External social views and creator payouts are not automated or certified until their integrations are enabled.')+'</span></div>';
 return h+scope+toolbar()+'<section id="v6-results" aria-live="polite">'+campaignResults()+'</section>'+hint;
};
const previousClips=clipsPage;
clipsPage=function(){
 const s=previousClips();
 if(!S.user)return s;
 const action='<div class="v6-clip-summary"><div><span class="v6-overline">REAL CAMPAIGN ACTIVITY</span><h3>Track every clip submission.</h3><p>Review the status of links you actually submitted to an artist campaign.</p></div>'+
 '<button type="button" class="v6-btn v6-btn-quiet" data-v6-submissions>'+icon('campaigns',17)+' My submissions '+icon('arrow',14)+'</button></div>';
 return action+s;
};
const previousWallet=walletPage;
walletPage=function(){
 const s=previousWallet();
 if(!S.user)return s;
 return s+'<div class="v6-clip-summary v6-wallet-activity"><div><span class="v6-overline">REWARD ACTIVITY</span><h3>Submission tracker</h3><p>Pending, approved and rejected posts are recorded separately from spendable balance.</p></div>'+
  '<button type="button" class="v6-btn v6-btn-quiet" data-v6-submissions>'+icon('campaigns',16)+' View submissions '+icon('arrow',14)+'</button></div>';
};
function renderSubmissions(data){
 const list=data?.submissions||[];
 if(!list.length)return '<div class="v6-zero v6-empty-sub"><h3>No submissions yet</h3><p>When you submit a real public video link to an eligible campaign, its review status appears here.</p><button class="v6-btn v6-btn-primary" type="button" data-page="campaigns">Find campaigns '+icon('arrow',15)+'</button></div>';
 const statuses=['pending','approved','rejected'];
 const totals=statuses.map(s=>'<div><span>'+cap(s)+'</span><strong>'+list.filter(x=>x.status===s).length+'</strong></div>').join('');
 const rows=list.map(item=>
  '<article class="v6-sub-row"><div><small>'+esc(item.platform||'Clip')+' · '+esc(item.release_title||'Original release')+'</small><h3>'+esc(item.campaign_title)+'</h3>'+
   '<a target="_blank" rel="noopener noreferrer" href="'+esc(item.post_url)+'">'+icon('arrow',13)+' View submitted post</a></div>'+
   '<div class="v6-sub-right"><span class="v6-sub-status v6-status-'+esc(item.status)+'">'+cap(item.status)+'</span><small>Submitted '+esc(String(item.created_at||'').slice(0,10))+'</small>'+
   (item.status==='approved'?'<small>Listed reward: '+fmt(item.reward_cents)+'; see ledger for recorded earnings</small>':'')+'</div></article>'
 ).join('');
 return '<div class="v6-status-overview">'+totals+'</div><div class="v6-sub-list">'+rows+'</div>'+
 '<p class="v6-sub-note">An approval is a campaign review decision. It does not independently verify social views or guarantee cash withdrawal.</p>';
}
async function openSubmissions(){
 if(!S.user)return authModal('login');
 showOverlay('<div class="v6-submission-dialog"><span class="v6-overline">MY CREATOR ACTIVITY</span><h2>Submission tracker</h2>'+
 '<p>Every item below comes from your signed-in Viewly account.</p><div id="v6-submission-body" aria-live="polite"><div class="v6-loading-bar"></div>Fetching your submission history...</div></div>','medium');
 const target=document.querySelector('#v6-submission-body');
 try{
  const data=await api('/my-submissions');
  const current=document.querySelector('#v6-submission-body');
  if(current)current.innerHTML=renderSubmissions(data);
 }catch(err){
  const current=document.querySelector('#v6-submission-body');
  if(current)current.innerHTML='<div class="v6-zero"><h3>Could not load submissions</h3><p>'+esc(err.message||'Network error')+'</p><button type="button" class="v6-btn v6-btn-quiet" data-v6-submissions>Retry '+icon('arrow',14)+'</button></div>';
 }
}
document.addEventListener('click',e=>{
 const platform=e.target.closest('[data-v6-platform]');
 if(platform){M.platform=platform.dataset.v6Platform;render();return}
 const scope=e.target.closest('[data-v6-scope]');
 if(scope){if(scope.dataset.v6Scope==='mine'&&!S.user){e.preventDefault();e.stopPropagation();authModal('login');return}M.scope=scope.dataset.v6Scope;M.platform='All';M.query='';render();return}
 const reset=e.target.closest('[data-v6-reset]');
 if(reset){M.query='';M.platform='All';render();return}
 const submissions=e.target.closest('[data-v6-submissions]');
 if(submissions){e.preventDefault();e.stopPropagation();openSubmissions();return}
},true);
document.addEventListener('input',e=>{
 if(e.target.id!=='v6-campaign-search')return;
 M.query=e.target.value;
 const results=document.querySelector('#v6-results');
 if(results)results.innerHTML=campaignResults();
 const count=document.querySelector('#v6-result-count');
 if(count)count.textContent=sorted().length+' campaigns';
},true);
document.addEventListener('change',e=>{
 if(e.target.id!=='v6-campaign-sort')return;
 M.sort=e.target.value;const results=document.querySelector('#v6-results');
 if(results)results.innerHTML=campaignResults();
},true);
})();
