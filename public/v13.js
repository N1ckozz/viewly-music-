/* VIEWLY V13 — live creator workspace. Account-scoped data; no simulated figures. */
(()=>{
'use strict';
const H={days:7,data:null,key:null,seq:0,busy:false,error:'',updated:0};
const identity=()=>S.user?.id||'guest';
const fmt=n=>Number(n||0).toLocaleString('en-GB');
const cash=n=>eur(Number(n)||0);
const ic=(name,n=18)=>ico(name,n);
const btn=(label,kind,target,glyph='arrow')=>'<button type="button" class="v13-action" data-'+kind+'="'+target+'">'+ic(glyph,17)+'<span>'+label+'</span>'+ic('arrow',14)+'</button>';
const box=(title,sub,body,extra='')=>'<section class="v13-panel '+extra+'"><div class="v13-panel-head"><div><h2>'+title+'</h2><p>'+sub+'</p></div></div>'+body+'</section>';
const metric=(label,value,note,glyph)=>'<article class="v13-metric"><div>'+ic(glyph,19)+'<span>'+label+'</span></div><strong>'+value+'</strong><small>'+note+'</small></article>';
const empty=(heading,detail,button='')=>'<div class="v13-empty"><span>'+ic('bolt',18)+'</span><div><b>'+heading+'</b><p>'+detail+'</p></div>'+button+'</div>';
function chart(d){
 const items=d.series||[];
 if(!items.length)return empty('No recorded data','The next successful refresh will populate this chart.');
 const max=Math.max(1,...items.map(x=>Number(x.views)||0));
 return '<div class="v13-chart-summary"><strong>'+fmt(d.views)+'</strong><span>Unique signed-in Viewly plays<br>during the selected UTC period</span></div>'+
 '<div class="v13-chart" role="img" aria-label="'+esc(items.map(x=>x.day+': '+x.views+' plays').join('; '))+'">'+items.map(x=>'<div class="v13-bar-slot" title="'+esc(x.day+' · '+x.views+' plays')+'"><i style="height:'+Math.max(2,Math.min(100,100*Number(x.views||0)/max))+'%;opacity:'+(x.views?1:.22)+'"></i></div>').join('')+'</div>'+
 '<div class="v13-chart-axis"><span>'+esc(items[0].day.slice(5))+'</span><span>'+esc(items.at(-1).day.slice(5))+'</span></div>'+
 (!d.views?'<p class="v13-note">No plays recorded in this period. Zero is not estimated traffic.</p>':'<p class="v13-note">First recorded play per signed-in listener and release; not TikTok views.</p>');
}
function trending(d){
 const rows=d.trending||[];
 return rows.length?'<div class="v13-ranking">'+rows.map((x,i)=>'<button type="button" data-action="play" data-id="'+esc(x.id)+'"><span class="v13-rank">'+String(i+1).padStart(2,'0')+'</span><span class="v13-rank-copy"><b>'+esc(x.title)+'</b><small>'+esc(x.artist_name)+' · '+esc(x.genre)+'</small></span><strong>'+fmt(x.views)+'</strong>'+ic('play',15)+'</button>').join('')+'</div>':empty('No ranked releases yet','Rankings appear when published tracks receive recorded plays.',btn('Browse music','page','releases','releases'));
}
function campaigns(p){
 const rows=p.campaigns||[];
 if(!rows.length)return empty('No campaigns created','Create a campaign brief and add your music.',btn('New campaign','action','create-campaign','plus'));
 return '<div class="v13-budget-list">'+rows.map(c=>{
  const funded=Number(c.funded_cents)||0,spent=Number(c.spent_cents)||0,percent=funded?Math.min(100,Math.max(0,100*spent/funded)):0;
  return '<article><div class="v13-budget-title"><b>'+esc(c.title)+'</b><span>'+esc(c.status.replaceAll('_',' '))+'</span></div><div class="v13-budget-meta"><span>'+cash(spent)+' / '+cash(funded)+' funded</span><span>'+(c.mode==='sandbox'?'TEST · noncash':'Recorded funding')+'</span></div><div class="v13-budget-track" role="progressbar" aria-label="'+esc(c.title)+' funded budget used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.round(percent)+'"><i style="width:'+percent+'%"></i></div><div class="v13-budget-meta"><span>'+cash(c.budget_cents)+' planned budget</span><button data-v11-open="'+esc(c.id)+'">Analytics '+ic('arrow',13)+'</button></div></article>';
 }).join('')+'</div>';
}
function next(p){
 if(!S.user)return box('Make your next move','Start in the right workspace.','<div class="v13-actions">'+btn('Create an account','action','register','user')+btn('Discover campaigns','page','campaigns','campaigns')+btn('Explore music','page','releases','releases')+'</div>');
 if(!p)return box('Your workspace','Account data is loading or unavailable.','<div class="v13-actions">'+btn('Open account','page','profile','user')+btn('Clip studio','page','clips','scissors')+'</div>');
 const actions=p.creator?[
 ['Upload a release','action','upload','upload'],['Create campaign','action','create-campaign','plus'],['Review submissions ('+fmt(p.review_queue)+')','page','studio','campaigns'],['Creator analytics','page','analytics','campaigns']
 ]:[['Browse campaigns','page','campaigns','campaigns'],['Open clip studio','page','clips','scissors'],['Your rewards','page','wallet','wallet']];
 actions.push([p.tiktok_connected?'Manage TikTok connection':'Connect TikTok','page','connections','shield']);
 return box('Your next steps',p.creator?'Manage releases, campaigns and creator submissions.':'Find a campaign and track your own progress.','<div class="v13-actions">'+actions.map(a=>btn(...a)).join('')+'</div>');
}
function hub(){
 const current=H.key===identity()&&H.data?.period_days===H.days?H.data:null;
 const d=current?.public;
 const p=current?.personal?.account_id===S.user?.id?current?.personal:null;
 const status=H.error?'Update unavailable':H.busy?'Refreshing…':current?'Live database':'Loading…';
 const stamp=current?new Date(current.generated_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):'';
 const heading=S.user?'Welcome back, '+esc(S.user.display_name||'creator'):'Music moves here';
 const header='<header class="v13-hero"><div><span class="v13-kicker"><i></i> VIEWLY / CREATOR HUB</span><h1>'+heading+'<em>.</em></h1><p>Discover music, manage campaigns and track real activity in one workspace.</p></div><div class="v13-controls"><span class="v13-status" role="status">'+status+(stamp?' · '+esc(stamp):'')+'</span><div class="v13-range" aria-label="Activity period">'+[7,30].map(n=>'<button type="button" data-v13-period="'+n+'" aria-pressed="'+(H.days===n)+'">'+n+'D</button>').join('')+'</div><button class="v13-refresh" type="button" data-v13-refresh aria-label="Refresh workspace" '+(H.busy?'disabled':'')+'>'+ic('bolt',17)+'</button></div></header>';
 const metrics='<div class="v13-metrics">'+[
 ['Published music',d?fmt(d.published):'—',d?fmt(d.artists)+' publishing artists':'Public catalogue','releases'],
 ['Verified funded campaigns',d?fmt(d.funded):'—','Real funded opportunities','campaigns'],
 ['Sandbox campaigns',d?fmt(d.sandbox):'—','Test mode · no cash','shield'],
 ['Recorded Viewly plays',d?fmt(d.views):'—',H.days+'-day total','play']
 ].map(a=>metric(...a)).join('')+'</div>';
 const personal=p?'<div class="v13-personal">'+(p.creator?[
 ['Your releases',fmt(p.releases),'All your releases','releases'],['Campaign drafts',fmt(p.drafts),'Draft or awaiting funding','campaigns'],['Review queue',fmt(p.review_queue),'Pending submissions','check'],['Your plays',fmt(p.own_views),'Selected period','play']
 ]:[
 ['Your clips',fmt(p.clips),'Exported clips','scissors'],['Submitted posts',fmt(p.submissions),'Your submissions','video'],['Awaiting review',fmt(p.awaiting_review),'Pending submissions','check'],['Test credits',cash(p.sandbox_reward_cents),'Non-withdrawable','wallet']
 ]).map(a=>metric(...a)).join('')+'</div>':'';
 return '<section class="v13-hub" aria-label="Creator hub">'+header+(H.error?'<p class="v13-error" role="alert">Could not refresh workspace. '+(current?'Showing last successful response.':'No figures shown until data is available.')+'</p>':'')+metrics+personal+
 '<div class="v13-grid">'+box('Viewly activity','Real recorded engagement',d?chart(d):empty('Loading activity','Figures appear after a successful database response.'),'v13-wide')+
 box('Trending releases','Ranked by recorded plays',d?trending(d):empty('Loading rankings','No placeholder artists or counts.'))+next(p)+
 (p?.creator?box('Campaign budget tracker','Actual recorded funding and test balances are separate.',campaigns(p),'v13-wide'):
 box('Rewards & eligibility','Cash payouts remain disabled.',p?'<div class="v13-wallet"><div><span>Recorded rewards</span><b>'+cash(p.recorded_reward_cents)+'</b></div><div><span>Test credits · noncash</span><b>'+cash(p.sandbox_reward_cents)+'</b></div><div><span>Withdrawable</span><b>'+cash(p.withdrawable_cents)+'</b></div></div>'+btn('Open rewards','page','wallet','wallet'):empty('No payout promises','Sign in to access your own ledger.',btn('Sign in','action','login','user')),'v13-wide'))+
 '</div></section>';
}
const originalDiscover=discover;
discover=function(){return hub()+originalDiscover()};
async function load(force=false){
 if(S.page!=='discover')return;
 const key=identity(),days=H.days;
 if(H.busy&&H.key===key&&!force)return;
 if(!force&&H.key===key&&Date.now()-H.updated<60000)return;
 const seq=++H.seq;
 if(H.key!==key){H.data=null;H.error='';}
 H.key=key;H.busy=true;H.error='';H.updated=Date.now();
 try{
  const data=await api('/workspace?days='+days);
  if(seq!==H.seq||identity()!==key||H.days!==days)return;
  if((data.personal?.account_id||'guest')!==key)throw Error('Account changed');
  H.data=data;
 }catch(e){if(seq===H.seq&&identity()===key)H.error='unavailable';}
 finally{if(seq===H.seq){H.busy=false;if(S.page==='discover')render();}}
}
const baseRender=render;
render=function(){baseRender();if(S.page==='discover'&&(H.key!==identity()||!H.updated||Date.now()-H.updated>=60000)&&!H.busy)void load();};
document.addEventListener('click',e=>{
 const period=e.target.closest('[data-v13-period]'),refresh=e.target.closest('[data-v13-refresh]');
 if(!period&&!refresh)return;
 e.preventDefault();e.stopImmediatePropagation();
 if(period){const n=Number(period.dataset.v13Period);if(![7,30].includes(n)||H.days===n)return;H.days=n;}
 void load(true);render();
},true);
})();
