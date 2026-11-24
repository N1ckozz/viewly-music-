(()=>{
'use strict';
const G={account:null,info:null,busy:false,loaded:0,step:0,failed:false};
const slides=[
 {kind:'campaign',eyebrow:'01 / THE CREATOR ECONOMY',title:'Make music move.',body:'Artists publish original music, set a clipper reward pool and choose optional sponsored placements. Review the complete price before checkout.',visual:'MUSIC → CAMPAIGN'},
 {kind:'clip',eyebrow:'02 / VERIFIED REWARDS',title:'Clip. Submit. Verify.',body:'Connect TikTok, join a campaign and submit your own post. Official view checks and artist review determine eligible rewards. Cash payouts are not live yet.',visual:'CLIP → VERIFIED VIEWS'},
 {kind:'premium',eyebrow:'03 / PREMIUM ACCESS',title:'Your first big campaign is free.',body:'Campaigns funded above €2,000 require an active paid plan after your first free premium entry. The sandbox uses test plans only.',visual:'€2,000+ / FIRST FREE'},
 {kind:'referral',eyebrow:'04 / INVITE & SAVE',title:'Grow together. Pay less.',body:'Invite a friend. Once both accounts are verified and the new account is at least 24 hours old, each gets 20% off one campaign platform fee, valid for 30 days. Up to five qualified referrals per inviter.',visual:'20% OFF / PLATFORM FEE'}
];
const safeGet=k=>{try{return localStorage.getItem(k)}catch{return null}};
const safeSet=(k,v)=>{try{localStorage.setItem(k,v)}catch{}};
const key=()=>S.user?'viewly.welcome.v15.'+S.user.id:'viewly.welcome.v15.guest';
const welcomeVisible=()=>!safeGet(key())&&(!S.user||G.info?.onboarding!==15);
function scene(s){
 return '<div class="g15-scene g15-'+s.kind+'" aria-hidden="true"><div class="g15-floor"></div><div class="g15-orbit"></div><div class="g15-orbit second"></div><div class="g15-object"><div class="g15-object-front">'+({campaign:'♫',clip:'▷',premium:'V.',referral:'%'}[s.kind])+'</div><div class="g15-object-back"></div></div><div class="g15-float a"></div><div class="g15-float b"></div><div class="g15-scene-label">'+s.visual+'</div></div>';
}
function welcome(){
 const s=slides[G.step];
 return '<section class="g15-welcome" aria-label="Welcome to VIEWLY"><div class="g15-welcome-head"><span>VIEWLY / GET STARTED</span><button type="button" data-g15-dismiss>Skip introduction</button></div><div class="g15-welcome-grid">'+scene(s)+'<div class="g15-welcome-copy"><small>'+s.eyebrow+'</small><h2>'+s.title+'</h2><p>'+s.body+'</p><div class="g15-controls"><div class="g15-dots">'+slides.map((x,i)=>'<button type="button" data-g15-step="'+i+'" aria-label="Introduction '+(i+1)+'" aria-pressed="'+(i===G.step)+'"></button>').join('')+'</div><button type="button" class="v10-button v10-outlined" data-g15-next>'+(G.step===slides.length-1?'Get started':'Next')+' '+ico('arrow',14)+'</button></div></div></div></section>';
}
function pendingCode(){try{return sessionStorage.getItem('viewly.referral.pending')}catch{return null}}
function inviteNotice(){return S.user&&pendingCode()?'<section class="g15-panel"><h2>Friend invitation</h2><p>Accept this invitation to link your new account and become eligible for fee discounts.</p><button class="v10-button v10-primary" data-g15-accept>Accept invitation</button> <button class="v10-button v10-outlined" data-g15-decline>Decline</button></section>':'';}
function invitePanel(){
 const a=G.info;
 if(!S.user)return '';
 if(G.failed)return '<section class="g15-panel"><h2>Invite friends</h2><p>Referral information is currently unavailable.</p><button data-g15-reload>Retry</button></section>';
 if(!a)return '<section class="g15-panel"><h2>Invite friends</h2><p>Loading your referral benefits…</p></section>';
 const link=location.origin+'/?ref='+encodeURIComponent(a.code);
 return '<section class="g15-panel"><span class="g15-kicker">YOUR NETWORK</span><h2>Invite friends & save</h2><p>Share your personal invitation. Eligible friends unlock one 20% platform-fee discount for each of you. No cash reward; no discount on clipper funds.</p><div class="g15-metrics"><div><b>'+a.invited+'</b><span>Invited</span></div><div><b>'+a.qualified+'/5</b><span>Qualified</span></div><div><b>'+a.perks.length+'</b><span>Available perks</span></div></div><label>Personal invite link<input readonly id="g15-ref-link" value="'+esc(link)+'"></label><button class="v10-button v10-primary" data-g15-copy>Copy invitation link</button><p>'+ (a.perks.length?'Next perk expires '+esc(new Date(a.perks[0].expires_at).toLocaleDateString())+'.':'No active discounts yet.')+'</p><p>Premium free entry: '+(a.premium_pass_used?'Used':'Available')+' · current payment mode.</p><button type="button" class="v10-button v10-outlined" data-g15-replay>Replay welcome guide</button></section>';
}
const rawRef=new URLSearchParams(location.search).get('ref');
if(rawRef&&/^[a-f0-9]{32}$/.test(rawRef)){try{sessionStorage.setItem('viewly.referral.pending',rawRef)}catch{}}
async function load(force=false){
 if(!S.user){G.account=null;G.info=null;G.loaded=0;return;}
 const uid=S.user.id;if(G.busy||(!force&&G.account===uid&&Date.now()-G.loaded<60000))return;
 G.busy=true;G.failed=false;if(G.account!==uid){G.info=null;G.account=uid;}
 try{
  const answer=await api('/growth/me');
  if(S.user?.id!==uid)return;G.info=answer;
 }catch{G.failed=true;}finally{G.loaded=Date.now();G.busy=false;if(S.user?.id===uid&&['discover','profile'].includes(S.page))render();}
}
const oldDiscover=discover;discover=function(){return inviteNotice()+(welcomeVisible()?welcome():'')+oldDiscover();};
const oldProfile=profilePage;profilePage=function(){return oldProfile()+inviteNotice()+invitePanel();};
const oldRender=render;render=function(){oldRender();void load();};
const oldCard=campaignCard;campaignCard=function(c){
 const funded=c.is_sandbox?c.sandbox_funded_cents:c.paid_cents;
 const html=oldCard(c);
 return funded>200000?'<div class="g15-premium-card"><span>PREMIUM CAMPAIGN · €2K+ FUNDED</span>'+html+'</div>':html;
};
async function dismiss(){safeSet(key(),'1');if(S.user){try{await api('/growth/welcome','POST',{});if(G.info)G.info.onboarding=15;}catch{}}render();}
document.addEventListener('click',async ev=>{
 const t=ev.target.closest('[data-g15-dismiss],[data-g15-step],[data-g15-next],[data-g15-copy],[data-g15-replay],[data-g15-reload],[data-g15-join],[data-g15-accept],[data-g15-decline]');
 if(!t)return;ev.preventDefault();ev.stopImmediatePropagation();
 if(t.hasAttribute('data-g15-accept')||t.hasAttribute('data-g15-decline')){t.disabled=true;try{if(t.hasAttribute('data-g15-accept')){await api('/growth/claim','POST',{code:pendingCode()});toast('Invitation linked. Verify your email to qualify.');}sessionStorage.removeItem('viewly.referral.pending');G.loaded=0;render();}catch(err){errorToast(err);t.disabled=false;}return;}
 if(t.hasAttribute('data-g15-dismiss'))return void dismiss();
 if(t.hasAttribute('data-g15-step')){G.step=Number(t.dataset.g15Step);render();return;}
 if(t.hasAttribute('data-g15-next')){if(G.step===slides.length-1)return void dismiss();G.step++;render();return;}
 if(t.hasAttribute('data-g15-replay')){try{localStorage.removeItem(key())}catch{}if(G.info)G.info.onboarding=0;G.step=0;S.page='discover';render();return;}
 if(t.hasAttribute('data-g15-reload'))return void load(true);
 if(t.hasAttribute('data-g15-copy')){const field=document.querySelector('#g15-ref-link');try{await navigator.clipboard.writeText(field.value);toast('Invitation copied.');}catch{field.select();toast('Select and copy your invitation link.');}return;}
 if(t.hasAttribute('data-g15-join')){
  if(t.dataset.free==='true'&&!confirm('Use your one free premium campaign entry on this campaign?'))return;
  t.disabled=true;try{await api('/growth/campaigns/'+t.dataset.g15Join,'POST',{});toast('Campaign joined.');G.loaded=0;campaignDetail(t.dataset.g15Join);}catch(err){errorToast(err);t.disabled=false;}return;
 }
},true);
})();
