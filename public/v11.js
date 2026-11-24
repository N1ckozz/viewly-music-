/* VIEWLY V11 — database-backed creator analytics; no mock charts or money. */
(()=>{
'use strict';
const A={days:30,campaignId:null,portfolio:null,detail:null,mode:'views',busy:false,
 error:'',owner:null,request:0,loadedAt:0};
const icon=(k,n=16)=>ico(k,n);
const fmt=n=>new Intl.NumberFormat('en-GB',{notation:Math.abs(Number(n||0))>=10000?'compact':'standard',maximumFractionDigits:1}).format(Number(n)||0);
const money=c=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format((Number(c)||0)/100);
const val=(v,max=150)=>esc(String(v??'').slice(0,max));
const dayLabel=iso=>new Date(iso+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});
const rawDate=d=>d?new Date(d).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Never';
const pct=(a,b)=>b?Math.max(0,Math.min(100,a/b*100)):0;
const sentence=(text)=>'<p class="v11-note">'+text+'</p>';
function metric(label,value,foot,type){
 return '<div class="v11-kpi"><div class="v11-kpi-top"><span>'+val(label)+'</span>'+icon(type,18)+'</div>'+
  '<strong>'+value+'</strong><small>'+foot+'</small></div>';
}
function track(b,compact=false){
 const funded=Number(b.funded_cents)||0,allocated=Number(b.allocated_cents)||0,available=Number(b.available_cents)||0;
 const pieces=[
  {key:'pending',label:'CPM on hold',amt:b.pending_cpm_cents||0,color:'hold'},
  {key:'settled',label:'CPM test settled',amt:b.settled_cpm_cents||0,color:'settled'},
  {key:'other',label:'Other allocations',amt:b.other_allocated_cents||0,color:'other'},
  {key:'available',label:'Available',amt:available,color:'available'}
 ].filter(x=>x.amt>0);
 const visual=funded?pieces.map(p=>'<span class="v11-progress-piece '+p.color+'" style="width:'+pct(p.amt,funded).toFixed(3)+'%"></span>').join(''):'';
 return '<div class="v11-budget '+(compact?'compact':'')+'">'+
  '<div class="v11-budget-head"><b>Budget allocation</b><span>'+val(b.utilization_percent)+'% allocated</span></div>'+
  '<div class="v11-progress-track" role="progressbar" aria-label="Budget allocated" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+val(b.utilization_percent)+'">'+
  (visual||'<span class="v11-progress-empty"></span>')+'</div>'+
  (compact?'<div class="v11-budget-mini">'+money(allocated)+' allocated · '+money(available)+' available</div>':
   '<div class="v11-budget-legend">'+pieces.map(p=>'<div><span class="v11-swatch '+p.color+'"></span><span>'+p.label+'</span><strong>'+money(p.amt)+'</strong></div>').join('')+'</div>')+
  '</div>';
}
function graph(data,mode){
 const views=mode==='views',key=views?'observed_view_delta':'credit_cents';
 const rows=data.series||[],points=rows.map((r,i)=>({i,x:r.day,y:r[key]}));
 const observed=points.filter(p=>p.y!==null&&Number.isFinite(Number(p.y))&&(views||p.y>0));
 if(!observed.length){
  return '<div class="v11-chart-empty">'+icon('chart-no-axes-combined',27)+
   '<b>'+(views?'No API checks during this period':'No credit allocation recorded')+'</b>'+
   '<p>'+(views?'A blank day means we do not know how many TikTok views arrived that day.':'The chart will populate when actual test credit events are recorded.')+'</p></div>';
 }
 const width=880,height=280,pl=62,pr=20,pt=25,pb=41;
 const plotWidth=width-pl-pr,plotHeight=height-pt-pb;
 const upper=Math.max(1,...observed.map(p=>Number(p.y)));
 const yPosition=v=>pt+plotHeight-(Math.min(upper,Math.max(0,Number(v)))/upper*plotHeight);
 const xPosition=i=>pl+((rows.length===1?.5:i/(rows.length-1))*plotWidth);
 const guide=[0,0.25,.5,.75,1].map(v=>{
  const y=yPosition(upper*v);
  const label=views?fmt(Math.round(upper*v)):money(Math.round(upper*v));
  return '<line x1="'+pl+'" x2="'+(width-pr)+'" y1="'+y+'" y2="'+y+'" class="v11-gridline"/>'+
   '<text x="'+(pl-10)+'" y="'+(y+4)+'" text-anchor="end" class="v11-graph-label">'+val(label)+'</text>';
 }).join('');
 const lines=[];
 let segment=[];
 for(const p of points){
  if(p.y===null||!Number.isFinite(Number(p.y))){
   if(segment.length)lines.push(segment);
   segment=[];continue;
  }
  segment.push(p);
 }
 if(segment.length)lines.push(segment);
 const shapes=lines.map(seg=>seg.length>1?
  '<polyline class="v11-line-path" points="'+seg.map(p=>xPosition(p.i)+','+yPosition(p.y)).join(' ')+'"/>':'').join('');
 const dots=observed.map(p=>'<circle cx="'+xPosition(p.i)+'" cy="'+yPosition(p.y)+'" r="4" class="v11-point">'+
  '<title>'+val(dayLabel(p.x))+' · '+(views?fmt(p.y)+' newly observed views':money(p.y)+' test credits')+'</title></circle>').join('');
 const ticks=[0,Math.floor((rows.length-1)/3),Math.floor(2*(rows.length-1)/3),rows.length-1];
 const xlabels=[...new Set(ticks)].map(i=>'<text x="'+xPosition(i)+'" y="'+(height-11)+'" text-anchor="middle" class="v11-graph-label">'+
   val(dayLabel(rows[i].day))+'</text>').join('');
 return '<div class="v11-chart-wrap"><svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="'+(views?'New views observed by TikTok API check date':'Sandbox test credits allocated per day')+'" preserveAspectRatio="xMidYMid meet" class="v11-chart">'+
  '<title>'+(views?'Positive reported view changes recorded on check dates':'Credits allocated, never actual withdrawals')+'</title>'+
  guide+shapes+dots+xlabels+'</svg></div>';
}
function detail(d){
 const c=d.campaign,b=d.budget,n=d.counts,s=d.series_summary;
 const checked=Number(s.provider_checks)||0;
 const alerts=d.alerts||[];
 return '<section class="v11-campaign-detail" aria-label="Campaign analytics">'+
  '<div class="v11-detail-top"><div><span class="v11-kicker">SELECTED CAMPAIGN / '+val(c.pricing_model==='cpm'?'CPM CREATOR REWARDS':'POST-BASED REWARDS')+'</span>'+
   '<h2>'+val(c.title)+'</h2><p>'+val(c.status).replaceAll('_',' ')+' · '+val(c.platform)+' · '+val(c.pricing_model==='cpm'?'Rate '+money(c.rate_cents)+' per 1K TikTok views':'Per approved post '+money(c.rate_cents))+'</p></div>'+
   '<button class="v11-button subtle" data-v11-brief="'+val(c.id)+'">'+icon('external-link',15)+' Open campaign</button></div>'+
  '<div class="v11-detail-stats">'+
   metric('Latest reported TikTok views',fmt(n.reported_views_latest),'Across submitted clips; not independently verified','eye')+
   metric('Views newly observed',checked?fmt(s.observed_delta_in_range):'—',checked?'Across '+s.checked_days+' days with API checks':'No checks in this period','trending-up')+
   metric('Submissions',fmt(n.submissions),n.pending+' awaiting review','layers')+
   metric('Clippers',fmt(n.clipper_count),'Unique participating accounts','users')+'</div>'+
  '<div class="v11-panels"><section class="v11-panel v11-budget-panel">'+
   '<div class="v11-panel-head"><div><span class="v11-kicker">FUNDING / TRANSPARENT</span><h3>Budget control</h3></div>'+
    '<span class="v11-status '+(b.mode==='sandbox'?'sandbox':'provider')+'">'+(b.mode==='sandbox'?'SANDBOX · €0 CHARGED':'PROVIDER RECORD')+'</span></div>'+
   '<div class="v11-budget-big"><b>'+money(b.available_cents)+'</b><span>available budget</span></div>'+
   track(b)+
   '<div class="v11-budget-numbers"><div><span>Funded reference</span><b>'+money(b.funded_cents)+'</b></div>'+
    '<div><span>Already allocated</span><b>'+money(b.allocated_cents)+'</b></div>'+
    '<div><span>Platform fee (5%)</span><b>'+money(b.platform_fee_cents)+'</b></div>'+
    '<div><span>Total checkout quote</span><b>'+money(b.reference_total_cents)+'</b></div></div>'+
   (b.projected_remaining_days!==null?'<p class="v11-forecast">'+icon('trending-up',16)+' At the recorded 7-day allocation rate: approx. <b>'+b.projected_remaining_days+' days</b> of budget remaining. Estimate, not a promise.</p>':
    '<p class="v11-forecast muted">'+icon('info',16)+' Budget runway estimate unavailable until enough actual allocation events are recorded.</p>')+
   '<p class="v11-money-disclosure">'+icon('shield',15)+' '+val(b.note,400)+'</p>'+
   '</section>'+
   '<section class="v11-panel v11-review-panel"><div class="v11-panel-head"><div><span class="v11-kicker">CONTENT REVIEW</span><h3>Submission pipeline</h3></div></div>'+
   '<div class="v11-review-total"><strong>'+fmt(n.submissions)+'</strong><span>total submitted clips</span></div>'+
   '<div class="v11-review-list">'+[
    ['Approved',n.approved,'approved'],['Pending / appeals',n.pending,'pending'],['Rejected',n.rejected,'rejected'],['Flagged',n.flagged,'flagged']
   ].map(item=>'<div><span class="v11-review-dot '+item[2]+'"></span><span>'+item[0]+'</span><b>'+fmt(item[1])+'</b></div>').join('')+'</div>'+
   '<div class="v11-review-rate"><span>Approval rate (reviewed clips only)</span><b>'+(n.approval_rate_percent===null?'Not yet available':n.approval_rate_percent+'%')+'</b></div>'+
   '<p class="v11-review-fresh">Latest official TikTok check: <b>'+val(rawDate(n.last_tiktok_check))+'</b></p>'+
   '</section></div>'+
  (alerts.length?'<div class="v11-alerts">'+alerts.map(a=>'<div class="v11-alert '+val(a.kind)+'">'+icon(a.kind==='warning'?'alert-triangle':'info',17)+'<span>'+val(a.text,240)+'</span></div>').join('')+'</div>':'')+
  '<section class="v11-panel v11-chart-panel"><div class="v11-panel-head"><div><span class="v11-kicker">ANALYTICS / FROM THE DATABASE</span><h3>Performance over time</h3></div>'+
   '<div class="v11-chart-modes" role="group" aria-label="Chart series">'+
    '<button data-v11-mode="views" aria-pressed="'+(A.mode==='views')+'" class="'+(A.mode==='views'?'current':'')+'">API views</button>'+
    '<button data-v11-mode="credits" aria-pressed="'+(A.mode==='credits')+'" class="'+(A.mode==='credits'?'current':'')+'">Test credits</button></div></div>'+
   graph(d,A.mode)+
   '<div class="v11-chart-foot"><p>'+val(A.mode==='views'?d.methodology.trend:d.methodology.credit_history||'Credits are non-withdrawable sandbox allocations, not real revenue.',500)+'</p>'+
    '<button type="button" class="v11-button subtle" data-v11-csv>'+icon('download',15)+' Export CSV</button></div></section>'+
  '<section class="v11-panel v11-leaderboard"><div class="v11-panel-head"><div><span class="v11-kicker">CREATOR PERFORMANCE</span><h3>Top clippers</h3></div>'+
  '<span class="v11-muted">Latest checked API views</span></div>'+
  ((d.top_clippers||[]).length?'<div class="v11-rankings">'+d.top_clippers.map((x,i)=>
   '<div class="v11-ranking"><span class="v11-rank-num">'+String(i+1).padStart(2,'0')+'</span>'+
    '<div class="v11-rank-identity"><b>@'+val(x.username)+'</b><small>'+x.clips+' posts · '+x.approved_clips+' approved'+(x.flagged_clips?' · '+x.flagged_clips+' flagged':'')+'</small></div>'+
    '<span class="v11-ranking-views">'+fmt(x.reported_views_latest)+' <small>views</small></span>'+
    '<span class="v11-ranking-credits">'+money(x.test_credits_cents)+' <small>test credits</small></span></div>'
   ).join('')+'</div>':
    '<div class="v11-empty-small">No connected clippers have submitted a TikTok CPM post yet.</div>')+
  '</section><div class="v11-methodology">'+icon('shield-check',17)+
   '<span>'+val(d.methodology.views,450)+' <b>No fake data, no real payout enabled.</b></span></div></section>';
}
function portfolioCard(c){
 const b=c.budget,n=c.counts,selected=A.campaignId===c.id;
 return '<article class="v11-portfolio-card '+(selected?'selected':'')+'"><div class="v11-portfolio-head">'+
  '<div><span class="v11-card-kind">'+val(c.pricing_model==='cpm'?'CPM / TIKTOK':'PER POST')+' · '+val(c.status)+'</span>'+
   '<h3>'+val(c.title)+'</h3></div><span class="v11-card-type">'+(b.mode==='sandbox'?'TEST':'PROVIDER')+'</span></div>'+
  '<div class="v11-card-numbers"><span>'+fmt(n.reported_views_latest)+' API views</span><b>'+money(b.available_cents)+' available</b></div>'+
  track(b,true)+
  '<div class="v11-card-foot"><span>'+n.pending+' pending · '+n.flagged+' flagged</span>'+
  '<button class="v11-button '+(selected?'primary':'subtle')+'" data-v11-campaign="'+val(c.id)+'">'+(selected?'Selected':'View analytics')+' '+icon('arrow',14)+'</button></div></article>';
}
function page(){
 if(!S.user)return '<div class="v11-page v11-locked"><h1>Campaign analytics</h1><p>Sign in as an artist or label to view your actual campaign performance.</p>'+
  '<button class="v11-button primary" data-action="login">Sign in</button></div>';
 if(!isCreator())return '<div class="v11-page v11-locked"><h1>Artist analytics</h1><p>Enable artist tools to manage your own campaign performance.</p>'+
  '<button class="v11-button primary" data-action="role">Enable artist tools</button></div>';
 return '<div class="v11-page"><header class="v11-hero"><div><span class="v11-kicker">'+icon('chart-no-axes-combined',16)+' VIEWLY / REAL PERFORMANCE</span>'+
  '<h1>Creator <em>intelligence.</em></h1><p>Your budget, clips, submissions and TikTok API observations — one workspace, no fabricated metrics.</p></div>'+
  '<button class="v11-button subtle" data-v11-refresh>'+icon('refresh-cw',15)+' Refresh records</button></header>'+
  '<div class="v11-toolbar"><div class="v11-range" role="group" aria-label="Analytics reporting period">'+
   [7,30,90].map(n=>'<button class="'+(A.days===n?'active':'')+'" data-v11-days="'+n+'" aria-pressed="'+(A.days===n)+'">'+n+' days</button>').join('')+'</div>'+
   '<span class="v11-data-note"><span class="v11-live-dot"></span> DB-backed reporting'+(A.loadedAt?' · refreshed '+rawDate(A.loadedAt):'')+'</span></div>'+
  (A.error?'<div class="v11-alert warning">'+icon('alert-triangle',16)+val(A.error)+' <button class="v11-button subtle" data-v11-refresh>Retry</button></div>':'')+
  (A.busy&&!A.portfolio?'<div class="v11-skeleton">Loading campaign records and server-side analytics…</div>':
   A.portfolio?portfolio():!A.error?'<div class="v11-skeleton">Connecting to analytics…</div>':'')+
  '</div>';
}
function portfolio(){
 const p=A.portfolio,t=p.totals;
 return '<div class="v11-overview-stats">'+
 metric('Latest reported TikTok views',fmt(t.latest_reported_views),'All your CPM campaigns · API-reported','eye')+
 metric('Recorded total funding',money(t.funded_cents),'Includes simulated test allocations','wallet')+
 metric('Budget still available',money(t.available_cents),'Unallocated budget only','coins')+
 metric('Needs review',fmt(t.pending+t.flagged),t.pending+' pending · '+t.flagged+' flagged','list-checks')+
 '</div>'+
 '<div class="v11-section-title"><div><span class="v11-kicker">CAMPAIGN PORTFOLIO</span><h2>Your campaigns <small>('+p.campaigns.length+')</small></h2></div>'+
 '<button class="v11-button subtle" data-page="studio">'+icon('plus',14)+' New campaign</button></div>'+
 (p.campaigns.length?'<div class="v11-portfolio-grid">'+p.campaigns.map(portfolioCard).join('')+'</div>':
  '<div class="v11-empty"><h3>Your first analytics will appear here.</h3><p>Create a campaign in Artist Studio, then fund it in sandbox. Views remain blank until real TikTok API checks occur.</p>'+
  '<button class="v11-button primary" data-page="studio">Open Artist Studio</button></div>')+
 (A.campaignId?A.detail?detail(A.detail):A.busy?'<div class="v11-skeleton">Calculating selected campaign metrics…</div>':
  A.error?'<div class="v11-empty-small">Unable to load this campaign.</div>':'':'')+
 '<footer class="v11-footer">'+icon('info',14)+val(p.source_note,350)+
  '<span>All amounts labeled TEST are non-withdrawable; real payment rails remain disabled.</span></footer>';
}
const baseContent=content;
content=function(){return S.page==='analytics'?page():baseContent()};
const baseStudio=studioPage;
studioPage=function(){
 const output=baseStudio();
 if(!S.user||!isCreator())return output;
 return '<div class="v11-studio-banner"><div><span class="v11-kicker">CREATOR INTELLIGENCE</span><b>Know where every view and euro goes.</b>'+
  '<p>Budget charts, review pipeline and real recorded performance for your campaigns.</p></div>'+
  '<button class="v11-button primary" data-page="analytics">'+icon('chart-no-axes-combined',16)+' Open Analytics</button></div>'+output;
};
const baseOwner=ownerControls;
ownerControls=function(c){return '<button type="button" class="v10-button v10-primary" data-v11-open="'+val(c.id)+'">'+
 icon('chart-no-axes-combined',15)+' Analytics & budget</button>'+baseOwner(c)};
const baseShell=renderShell;
renderShell=function(html){
 let output=baseShell(html);
 const item='<div class="v-rail-group v11-sidebar"><div class="v-rail-label">ANALYTICS</div>'+
  '<button class="v-nav v7-side-link '+(S.page==='analytics'?'is-active':'')+'" data-page="analytics">'+
  '<span class="v7-side-icon">'+icon('chart-no-axes-combined',18)+'</span><span class="v7-side-label">Creator analytics</span></button></div>';
 return output.replace('</nav><div class="v-sidebar-bottom">',item+'</nav><div class="v-sidebar-bottom">');
};
const previousRender=render;
render=function(){
 previousRender();
 if(S.page==='analytics'&&S.user&&isCreator()&&!A.busy&&(!A.portfolio||A.owner!==S.user.id)&&!A.error)load();
};
async function load(){
 if(A.busy)return;
 const seq=++A.request;A.busy=true;A.error='';
 const user=S.user?.id;
 try{
  const p=await api('/analytics/overview?days='+A.days);
  if(seq!==A.request||S.user?.id!==user)return;
  A.portfolio=p;A.owner=user;
  if(!p.campaigns.some(c=>c.id===A.campaignId))A.campaignId=p.campaigns[0]?.id||null;
  A.detail=A.campaignId?await api('/analytics/campaigns/'+encodeURIComponent(A.campaignId)+'?days='+A.days):null;
  A.loadedAt=new Date().toISOString();
 }catch(e){if(seq===A.request)A.error=e.message||'Unable to load analytics.';}
 finally{
  if(seq===A.request){A.busy=false;if(S.page==='analytics')render();}
 }
}
async function selectCampaign(id){
 if(A.busy||!A.portfolio?.campaigns.some(x=>x.id===id))return;
 A.campaignId=id;A.detail=null;A.error='';A.busy=true;
 const seq=++A.request;
 render();
 try{A.detail=await api('/analytics/campaigns/'+encodeURIComponent(id)+'?days='+A.days);A.loadedAt=new Date().toISOString();}
 catch(e){A.error=e.message||'Could not fetch campaign.'}
 finally{if(seq===A.request){A.busy=false;render()}}
}
function exportCSV(){
 const d=A.detail;if(!d||!d.series?.length)return toast('No analytics data available to export.',true);
 const lines=[['date_utc','new_views_observed_at_check','number_of_provider_checks','sandbox_credit_allocated_eur','views_fraud_certified']];
 for(const r of d.series)lines.push([r.day,r.observed_view_delta===null?'':r.observed_view_delta,r.provider_checks,(Number(r.credit_cents||0)/100).toFixed(2),'no']);
 const content=lines.map(row=>row.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\r\n');
 const blob=new Blob(['\ufeff',content],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob);
 const link=document.createElement('a');link.href=url;link.download='viewly-analytics-'+d.campaign.id+'-'+A.days+'d.csv';
 document.body.appendChild(link);link.click();link.remove();
 URL.revokeObjectURL(url);
 toast('CSV exported from real database observations. Missing checks are blank, not zero.');
}
document.addEventListener('click',e=>{
 const days=e.target.closest('[data-v11-days]');
 if(days){e.preventDefault();e.stopImmediatePropagation();A.days=Number(days.dataset.v11Days);A.portfolio=null;A.detail=null;A.error='';render();return;}
 const refresh=e.target.closest('[data-v11-refresh]');
 if(refresh){e.preventDefault();e.stopImmediatePropagation();A.error='';A.portfolio=null;A.detail=null;load();return;}
 const campaign=e.target.closest('[data-v11-campaign]');
 if(campaign){e.preventDefault();e.stopImmediatePropagation();selectCampaign(campaign.dataset.v11Campaign);return;}
 const open=e.target.closest('[data-v11-open]');
 if(open){e.preventDefault();e.stopImmediatePropagation();closeOverlay();A.campaignId=open.dataset.v11Open;S.page='analytics';A.error='';render();load();return;}
 const mode=e.target.closest('[data-v11-mode]');
 if(mode){e.preventDefault();e.stopImmediatePropagation();A.mode=mode.dataset.v11Mode;render();return;}
 const brief=e.target.closest('[data-v11-brief]');
 if(brief){e.preventDefault();e.stopImmediatePropagation();window.ViewlyCreatorRewards?.openCampaign(brief.dataset.v11Brief);return;}
 const csv=e.target.closest('[data-v11-csv]');
 if(csv){e.preventDefault();e.stopImmediatePropagation();exportCSV();}
},true);
window.ViewlyAnalytics={open(id){if(id)A.campaignId=id;S.page='analytics';A.error='';render();},reload(){A.error='';A.portfolio=null;A.detail=null;load()}};
})();
