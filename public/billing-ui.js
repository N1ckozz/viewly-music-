/* Viewly V9 — premium pricing, genuine sandbox subscriptions, zero money transfers. */
(()=>{
'use strict';
const B={cycle:'monthly',catalog:null,account:null,loadedFor:'',busy:false,loading:false,failed:false,error:''};
const icon=(type,n=18)=>ico(type,n);
const money=c=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR',minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(c||0)/100);
const longDate=d=>d?new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}):'—';
const shortDate=d=>d?new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'—';
function price(p){return money(p[B.cycle+'_cents'])}
function numberOrZero(n){return Number(n||0).toLocaleString('en-GB')}
function planCard(p,index){
 const current=B.account?.entitlement?.plan_id===p.id||(!B.account&&p.id==='free');
 const free=p.id==='free';
 const quote=p[B.cycle+'_cents'];
 const discount=p.yearly_discount_percent||0;
 const rank=['free','creator','pro','studio'].indexOf(p.id);
 const lead=free?'Your starting point':rank===1?'Our original €5 access plan':rank===2?'For active music creators':'For established collectives';
 let action=free?'Continue on Free':current?'Current test plan':'Test this plan for €0';
 if(!S.user&&!free)action='Create account to test';
 const cardClass='bill-card bill-rank-'+p.id+(rank===2?' bill-featured':'')+(current?' bill-current':'');
 return '<article class="'+cardClass+'">'+
  (rank===2?'<div class="bill-popular"><span>'+icon('bolt',13)+'</span> MOST POPULAR</div>':'')+
  '<div class="bill-tier"><span>0'+(index+1)+' / VIEWLY</span>'+ (current?'<span class="bill-active-label">YOUR PLAN</span>':'')+'</div>'+
  '<h3>'+esc(p.name)+'</h3><p class="bill-tagline">'+esc(p.tagline)+'</p>'+
  '<div class="bill-price"><strong>'+price(p)+'</strong><span>/ '+(B.cycle==='monthly'?'month':'year')+'</span></div>'+
  '<div class="bill-price-details">'+(free?'Free forever':B.cycle==='yearly'?
   'Save '+discount+'% compared with monthly pricing':'Annual option available · save '+discount+'%')+'</div>'+
  '<div class="bill-plan-lead">'+lead+'</div>'+
  '<button type="button" class="bill-cta '+(rank===2?'is-primary':'')+'" data-bill-plan="'+p.id+'" '+(current||B.busy?'disabled':'')+'>'+
  action+' '+icon('arrow',16)+'</button>'+
  '<ul class="bill-features">'+p.features.map(f=>'<li>'+icon('check',15)+'<span>'+esc(f)+'</span></li>').join('')+'</ul>'+
  '<div class="bill-cap"><span>Max releases</span><b>'+numberOrZero(p.limits.releases)+'</b></div>'+
  '<div class="bill-cap"><span>Monthly clips</span><b>'+numberOrZero(p.limits.clips_per_month)+'</b></div>'+
  '<div class="bill-cap"><span>Campaign drafts</span><b>'+numberOrZero(p.limits.campaigns)+'</b></div>'+
  '</article>';
}
function statePanel(){
 const account=B.account;
 if(!S.user)return '<div class="bill-state"><span>'+icon('user',19)+'</span><div><b>Create an account to test plans</b>'+
  '<p>You can see every price without signing in. Registration is required to activate a test subscription.</p></div>'+
  '<button class="bill-inline" data-bill-action="login">Sign up '+icon('arrow',15)+'</button></div>';
 if(!account)return '<div class="bill-state"><span>'+icon('shield',19)+'</span><div><b>Subscription status</b><p>Loading your plan and usage from the server…</p></div></div>';
 const e=account.entitlement;
 const u=account.usage||{};
 const active=e?.plan_id!=='free'&&e?.status==='active';
 const manage=active?'<div class="bill-manage-actions">'+
   (e.auto_renew?'<button class="bill-inline" data-bill-action="cancel">Cancel auto-renew</button>':
   '<button class="bill-inline" data-bill-action="resume">Resume auto-renew</button>')+
   '<button class="bill-inline" data-bill-action="free">Switch to Free now</button></div>':'';
 const limit=(type,title)=>'<div class="bill-usage-row"><div><b>'+title+'</b><span>'+numberOrZero(u[type])+' / '+numberOrZero(e.limits[type])+'</span></div>'+
  '<meter max="'+Number(e.limits[type])+'" value="'+Math.min(Number(u[type]),Number(e.limits[type]))+'">'+numberOrZero(u[type])+'</meter></div>';
 return '<section class="bill-subscription"><div class="bill-state-head"><div><span class="bill-overline">YOUR SUBSCRIPTION / REAL ACCOUNT STATE</span>'+
  '<h2>'+esc(e.plan_name)+' <small>'+ (active?'TEST ACTIVE':'FREE')+'</small></h2>'+
  '<p>'+esc(e.notice||'')+'</p></div>'+
  '<span class="bill-account-icon">'+icon('shield',22)+'</span></div>'+
  (active?'<div class="bill-period"><span>Billing reference</span><b>'+esc(e.period)+'</b><span>Next renewal / expiration</span><b>'+shortDate(e.current_period_end)+'</b>'+
   '<span>Sandbox auto-renewal</span><b>'+ (e.auto_renew?'On · €0 charged':'Off')+'</b></div>':'')+
  '<div class="bill-usage">'+limit('releases','Published releases')+limit('clips_per_month','Clips generated this month')+
  limit('campaigns','Campaign drafts')+'</div>'+manage+'</section>';
}
function eventPanel(){
 const items=B.account?.events||[];
 if(!S.user||!items.length)return '';
 return '<section class="bill-history"><div class="bill-history-head"><h3>Test billing history</h3>'+
  '<span>'+items.length+' event'+(items.length!==1?'s':'')+'</span></div>'+
  '<div class="bill-event-list">'+items.slice(0,8).map(t=>'<div class="bill-event">'+
   '<span class="bill-event-icon">'+icon('check',15)+'</span><div><b>'+esc(String(t.action).replaceAll('_',' '))+'</b>'+
   '<small>'+esc(t.plan_id)+' · '+esc(t.period||'')+' · '+shortDate(t.created_at)+'</small></div>'+
   '<span class="bill-event-charge">€0 charged</span></div>').join('')+'</div>'+
  '<p>These are sandbox events, not invoices, receipts or evidence of money transferred.</p></section>';
}
function page(){
 const plans=B.catalog?.plans||[];
 const sandbox=B.catalog?.mode==='sandbox';
 return '<div class="bill-page"><div class="bill-hero"><span class="bill-overline">'+icon('bolt',15)+' MUSIC COMES FIRST / PLANS</span>'+
  '<h1>Fuel what you<br><em>create.</em></h1>'+
  '<p>Real creator features. Clear pricing. Choose a plan, try the entire subscription lifecycle, and see real account limits change — without a payment.</p>'+
  '<div class="bill-mode-note">'+icon('shield',17)+' <span>'+ (sandbox?
   'SANDBOX MODE · all upgrades charge €0.00 · no cards stored':
   'Subscriptions are preview-only; sandbox activation is unavailable')+'</span></div></div>'+
  '<div class="bill-cycle"><div class="bill-cycle-selector" role="group" aria-label="Billing interval">'+
  '<button data-bill-cycle="monthly" aria-pressed="'+(B.cycle==='monthly')+'" class="'+(B.cycle==='monthly'?'current':'')+'">Monthly</button>'+
  '<button data-bill-cycle="yearly" aria-pressed="'+(B.cycle==='yearly')+'" class="'+(B.cycle==='yearly'?'current':'')+'">Yearly <span>SAVE 17%</span></button></div>'+
  '<span>Reference prices only · Actual charge today: €0.00</span></div>'+
  (B.error?'<div class="bill-notice error">'+esc(B.error)+' <button class="bill-inline" data-bill-action="retry">Retry</button></div>':'')+
  (plans.length?'<div class="bill-grid">'+plans.map((p,i)=>planCard(p,i)).join('')+'</div>':
    '<div class="bill-loading">Loading pricing from Viewly…</div>')+
  '<div class="bill-bottom"><section><span class="bill-overline">ACCOUNT / MANAGEMENT</span>'+statePanel()+eventPanel()+'</section>'+
  '<aside class="bill-faq"><span class="bill-overline">IMPORTANT DETAILS</span><h2>Test the flow.<br>Not the charge.</h2>'+
   '<div><b>Are these real subscriptions?</b><p>Yes: test entitlements are stored in your account, and real upload, clip and campaign limits respond to the plan. No money changes hands.</p></div>'+
   '<div><b>Does the system charge automatically?</b><p>No. Only a simulated zero-charge renewal can occur while sandbox mode is active.</p></div>'+
   '<div><b>How about card, Stripe and PayPal?</b><p>Those providers are disabled until verified live integrations, webhooks, tax/compliance settings and proper payment processing are configured.</p></div>'+
   '<div><b>Free lifetime access via promotion?</b><p>The previously discussed 10,000 verified promo-views route remains locked until trustworthy external view verification is available. We will not fake the result.</p></div>'+
  '</aside></div></div>';
}
const prevContent=content;
content=function(){return S.page==='plans'?page():prevContent()};
const prevShell=renderShell;
renderShell=function(inner){
 let h=prevShell(inner);
 const link='<div class="v-rail-group bill-rail"><div class="v-rail-label">MEMBERSHIP</div>'+
  '<button type="button" class="v-nav v7-side-link '+(S.page==='plans'?'is-active':'')+'" data-page="plans" aria-label="Viewly plans">'+
  '<span class="v7-side-icon">'+icon('bolt',18)+'</span><span class="v7-side-label">Plans & pricing</span></button></div>';
 return h.replace('</nav><div class="v-sidebar-bottom">',link+'</nav><div class="v-sidebar-bottom">');
};
let currentLoading=null;
async function load(force=false){
 if(B.loading&&!force)return;
 if(B.catalog&&!force&&B.loadedFor===(S.user?.id||'guest'))return;
 B.loading=true;B.error='';B.failed=false;
 try{
  const results=await Promise.all([api('/billing/plans'),S.user?api('/billing/me'):Promise.resolve(null)]);
  B.catalog=results[0];B.account=results[1];B.loadedFor=S.user?.id||'guest';
 }catch(err){B.error=err.message||'Pricing is currently unavailable.';B.failed=true;B.loadedFor=S.user?.id||'guest';}
 finally{
  B.loading=false;
  if(S.page==='plans')render();
 }
}
const prevRender=render;
render=function(){prevRender();if(S.page==='plans'&&!B.loading&&((!B.catalog&&!B.failed)||B.loadedFor!==(S.user?.id||'guest')))load()};
async function activate(plan){
 if(!S.user){authModal('register');return}
 if(!B.catalog||B.catalog.mode!=='sandbox'){toast('Subscription activation is unavailable until sandbox mode is enabled.',true);return}
 const p=B.catalog.plans.find(x=>x.id===plan);
 if(!p||p.id==='free')return;
 const reference=money(p[B.cycle+'_cents']);
 const message='Activate '+p.name+' ('+reference+' / '+B.cycle+') in sandbox?\n\nYou will be charged €0.00. No card is needed. Account entitlements and limits will update immediately.';
 if(!window.confirm(message))return;
 B.busy=true;
 try{
  const result=await api('/billing/sandbox/activate','POST',{plan_id:plan,period:B.cycle});
  if(result.charged_cents!==0)throw Error('Unexpected charge record. Contact support.');
  B.catalog=null;B.loadedFor='';
  await load(true);
  toast(p.name+' activated in test mode. €0.00 charged.');
 }catch(err){toast(err.message||'Could not change plan.',true)}
 finally{B.busy=false;if(S.page==='plans')render()}
}
async function operation(action){
 if(!S.user)return authModal('login');
 const sentences={
  cancel:'Stop sandbox auto-renewal? Your test plan stays active until its period ends.',
  resume:'Resume the zero-charge sandbox auto-renewal?',
  free:'Switch to Free immediately? Your paid-plan limits will stop applying.'
 };
 if(!window.confirm(sentences[action]))return;
 B.busy=true;
 try{await api('/billing/'+action,'POST',{});B.loadedFor='';await load(true);
  toast(action==='cancel'?'Test auto-renewal cancelled.':action==='resume'?'Sandbox auto-renewal resumed.':'Switched to Free.');
 }catch(err){toast(err.message||'Cannot change subscription.',true)}
 finally{B.busy=false;if(S.page==='plans')render()}
}
document.addEventListener('click',e=>{
 const cycle=e.target.closest('[data-bill-cycle]');
 if(cycle){e.preventDefault();e.stopImmediatePropagation();B.cycle=cycle.dataset.billCycle;render();return}
 const plan=e.target.closest('[data-bill-plan]');
 if(plan){e.preventDefault();e.stopImmediatePropagation();if(plan.dataset.billPlan==='free')operation('free');else activate(plan.dataset.billPlan);return}
 const command=e.target.closest('[data-bill-action]');
 if(command){e.preventDefault();e.stopImmediatePropagation();const op=command.dataset.billAction;
  if(op==='login'){authModal('register');return}if(op==='retry'){B.loadedFor='';B.failed=false;load(true);return}if(['cancel','resume','free'].includes(op))operation(op);
 }
},true);

/* Campaign test checkout: real campaign draft, zero-charge quoted funding, isolated rewards. */
const prevCampaignDetail=campaignDetail;
campaignDetail=function(id){
 prevCampaignDetail(id);
 const camp=[...(S.campaigns||[]),...(S.myCampaigns||[])].find(x=>x.id===id);
 const modal=document.querySelector('#overlay .modal');
 if(!camp||!modal)return;
 const own=S.user?.id===camp.owner_id;
 if(camp.is_sandbox){
  modal.insertAdjacentHTML('afterbegin','<div class="bill-campaign-test-flag">'+icon('shield',16)+
   ' TEST CAMPAIGN · €0 CHARGED · REWARDS ARE NOT CASH OR WITHDRAWABLE</div>');
  modal.innerHTML=modal.innerHTML.replace('Remaining funded balance','Remaining TEST campaign credits');
  modal.innerHTML=modal.innerHTML.replace("This draft is NOT public or rewarded until a real payment is verified.",
    "Sandbox campaign is publicly visible for testing. Test credits are not real money.");
  modal.innerHTML=modal.innerHTML.replace('The artist reviews submissions before any reward ledger credit.',
    'Approvals here produce ONLY non-withdrawable test credits, never cash or actual wallet earnings.');
 }
 if(own&&S.config?.billing_sandbox_enabled&&['draft','awaiting_payment'].includes(camp.status)){
  const button='<div class="bill-test-funding"><span class="bill-overline">CAMPAIGN TEST CHECKOUT</span>'+
   '<h3>'+money(camp.budget_cents+camp.fee_cents)+' quoted · €0 charged</h3>'+
   '<p>'+money(camp.budget_cents)+' campaign budget + '+money(camp.fee_cents)+
   ' platform fee (5%). This starts a simulated campaign with non-withdrawable rewards, no card or real payment.</p>'+
   '<button type="button" class="bill-cta is-primary" data-bill-test-fund="'+esc(camp.id)+'">'+icon('check',16)+
   ' Test fund this campaign for €0</button></div>';
  modal.insertAdjacentHTML('beforeend',button);
 }
};
const previousCampaignsPage=campaignsPage;
campaignsPage=function(){
 const html=previousCampaignsPage();
 const testing=(S.campaigns||[]).filter(c=>c.is_sandbox).length;
 return testing?'<div class="bill-test-banner">'+icon('shield',18)+'<span><b>SANDBOX / TEST REWARDS</b> · '+
  testing+' campaign'+(testing===1?'':'s')+' running with €0 actual funding. All rewards are non-withdrawable test credits.</span></div>'+html:html;
};
const previousWalletPage=walletPage;
walletPage=function(){
 const html=previousWalletPage();
 if(!S.user)return html;
 const testCredits=Number(S.wallet?.sandbox_earned_cents||0);
 return '<div class="bill-wallet-test"><span class="bill-overline">'+icon('shield',15)+' NON-CASH TEST CREDITS</span>'+
  '<h3>'+money(testCredits)+'</h3><p>Only approved sandbox submissions. Actual payable balance and withdrawal availability remain unchanged (€0).</p>'+
  '<button type="button" class="bill-inline" data-page="plans">Manage test subscriptions '+icon('arrow',14)+'</button></div>'+html;
};
document.addEventListener('click',async e=>{
 const button=e.target.closest('[data-bill-test-fund]');
 if(!button)return;
 e.preventDefault();e.stopImmediatePropagation();
 const id=button.dataset.billTestFund;
 const camp=(S.myCampaigns||[]).find(x=>x.id===id);
 if(!camp)return toast('Campaign no longer found. Refresh your studio.',true);
 const quote=money(camp.budget_cents+camp.fee_cents);
 if(!window.confirm('Start TEST campaign with a quoted total of '+quote+'?\n\nNo money will be charged, and approvals give only non-withdrawable test credits.'))return;
 button.disabled=true;
 try{
  const response=await api('/campaigns/'+encodeURIComponent(id)+'/sandbox-fund','POST',{});
  if(response.charged_cents!==0)throw Error('Sandbox funding safety check failed.');
  closeOverlay();await refresh(true);
  toast('TEST campaign active. '+quote+' reference price; €0 charged.');
 }catch(err){toast(err.message||'Could not start test campaign.',true);button.disabled=false;}
},true);

window.ViewlyBilling={open(){S.page='plans';render();},reload(){B.loadedFor='';return load(true)}};
})();