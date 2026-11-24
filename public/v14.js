(()=>{'use strict';
const V={catalog:[],featured:[],loaded:0,busy:false};
const e=esc,m=n=>eur(Number(n)||0),icon=(n,s=16)=>ico(n,s);
const url=(cid,s='')=>'/promotions/'+cid+s;
const field=(n,label,type='text',attrs='')=>'<label>'+label+'<input name="'+n+'" type="'+type+'" '+attrs+'></label>';
const ta=(n,label,attrs='')=>'<label>'+label+'<textarea name="'+n+'" '+attrs+'></textarea></label>';
const stepNames=['Campaign','Rewards','Branding','Media kit','Promotions','Preview','Checkout'];
let draft=null, objectUrls=[];
function clearUrls(){objectUrls.forEach(x=>URL.revokeObjectURL(x));objectUrls=[];}
function currentForm(){return document.querySelector('#v14-form');}
function state(msg,bad=false){const x=document.querySelector('#v14-state');if(x){x.textContent=msg;x.classList.toggle('is-error',bad);}}
const product=p=>'<label class="v14-product '+(!p.available?'unavailable':'')+'"><input type="checkbox" name="promo" value="'+e(p.id)+'" '+(!p.available?'disabled':'')+'><span><b>'+e(p.label)+'</b><small>'+e(p.placement==='package'?p.components.length+' placements':p.hours+' hours · '+p.placement)+'</small>'+(p.savings_cents?'<small>Save '+m(p.savings_cents)+'</small>':'')+(!p.available?'<small>Currently unavailable</small>':'')+'</span><strong>'+m(p.price_cents)+'</strong></label>';
function selected(f){return [...f.querySelectorAll('input[name=promo]:checked')].map(x=>x.value);}
function previewHTML(title,headline,iconUrl,bgUrl,rate,remaining,sandbox=true){
 return '<article class="v14-promo-card"><div class="v14-art">'+(bgUrl?'<img class="v14-background" alt="" src="'+e(bgUrl)+'">':'')+'</div><div class="v14-shade"></div><div class="v14-promo-copy"><div class="v14-promo-kicker">'+(sandbox?'SPONSORED · TEST':'SPONSORED')+'</div><div class="v14-promo-identity">'+(iconUrl?'<img alt="" src="'+e(iconUrl)+'">':'<span>V.</span>')+'<div><h3>'+e(title||'Your campaign')+'</h3><p>'+e(headline||'Campaign promotion')+'</p></div></div><div class="v14-promo-meta"><span>'+m(rate)+' / 1K views</span><span>'+m(remaining)+' '+(sandbox?'test budget':'remaining')+'</span></div></div></article>';
}
function preview(f){const val=n=>f.elements[n]?.value||'';const image=n=>{const file=f.elements[n]?.files?.[0];if(!file)return draft?.branding?.[n+'_url']||'';const u=URL.createObjectURL(file);objectUrls.push(u);return u;};clearUrls();const el=f.querySelector('#v14-preview');if(el)el.innerHTML=previewHTML(val('title')||draft?.title,val('headline'),image('icon'),image('background'),Math.round(Number(val('rate_eur_per_1000')||draft?.rate||0)*100),Math.round(Number(val('budget_eur')||draft?.budget||0)*100));}
function updateEstimate(f){const cost= Math.round(Number(f.elements.budget_eur?.value||draft?.budget||0)*100);const ids=selected(f),promo=ids.reduce((s,k)=>s+(V.catalog.find(p=>p.id===k)?.price_cents||0),0);f.querySelector('#v14-estimate').textContent='Estimated total '+m(cost+Math.round(cost*.05)+promo)+' · final price verified by server';}
function step(n){
 const f=currentForm();if(!f||!draft)return;
 draft.step=n;
 f.querySelectorAll('.v14-step').forEach((x,i)=>{x.hidden=i!==n;});
 f.querySelectorAll('.v14-progress li').forEach((x,i)=>{x.classList.toggle('active',i===n);x.classList.toggle('complete',i<n);});
 f.querySelector('[data-v14-back]').hidden=n===0||n===6;
 f.querySelector('[data-v14-next]').hidden=n===6;
 f.querySelector('[data-v14-next]').textContent=n===5?'Save & review final checkout':'Continue';
 if(n===5)preview(f);
 updateEstimate(f);
}
async function getCatalog(){const x=await api('/promotions/catalog');V.catalog=x.products||[];return x;}
function wizardHTML(releases,info,catalog){
 const c=info?.campaign,b=info?.branding;
 const locked=!!c;
 const basics='<div class="v14-grid"><label>Original music release<select name="release_id" required>'+releases.map(r=>'<option value="'+e(r.id)+'">'+e(r.title)+'</option>').join('')+'</select></label>'+field('title','Campaign title','text','minlength="3" maxlength="100" required')+'</div>'+ta('brief','Full brief & deliverables','minlength="60" maxlength="4500" required rows="5"')+field('spotify_track_url','Spotify track (optional)','url')+field('mandatory_hashtags','Mandatory hashtags','text','maxlength="180"')+field('sample_caption','Suggested caption','text','maxlength="280"')+ta('rules','Creative rules','maxlength="2000" rows="3"')+ta('prohibited_content','Prohibited edits','maxlength="800" rows="2"');
 const rewards='<div class="v14-grid">'+field('rate_eur_per_1000','CPM (€ / 1,000 TikTok views)','number','min=".5" max="10" step=".01" value="1" required')+field('budget_eur','Clipper reward pool (€)','number','min="10" max="100000" step=".01" value="100" required')+field('max_per_clip_eur','Maximum per clip (€)','number','min=".5" step=".01" value="25" required')+field('min_views','Minimum views','number','min="100" max="1000000" step="1" value="1000" required')+field('tracking_days','Tracking days','number','min="7" max="60" value="30" required')+'</div><p>Promotion fees never reduce the clipper reward pool.</p>';
 const branding='<div class="v14-grid">'+['icon','background'].map(n=>'<label class="v14-upload"><b>'+(n==='icon'?'Campaign icon · 1:1':'Background · 16:9')+'</b><span>'+(n==='icon'?'1024 × 1024 minimum · 10 MB':'1600 × 900 minimum · 15 MB')+'</span><input name="'+n+'" type="file" accept="image/jpeg,image/png,image/webp" '+(!b?.[n+'_url']?'required':'')+'><small data-v14-image="'+n+'">'+(b?.[n+'_url']?'Saved image ✓':'JPEG, PNG or WebP')+'</small></label>').join('')+'</div>'+field('headline','Promo headline','text','maxlength="120"');
 const kit='<label class="v14-upload">Creative pack (optional)<input name="assets" type="file" multiple accept="video/mp4,video/webm,image/jpeg,image/png,image/webp,audio/mpeg,audio/wav,application/pdf"><small>Up to 16 assets / 200 MB. Original release is included.</small></label><label class="v14-check"><input name="rights_confirmed" type="checkbox" required '+(locked?'checked disabled':'')+'> I have the rights to distribute the music and uploaded assets, and agree that recorded evidence cannot be erased later.</label>';
 const promos='<p>Optional sponsored placements. Exposure is not guaranteed. Prices and inventory are verified at checkout.</p><div class="v14-products">'+V.catalog.map(product).join('')+'</div>';
 const parts=[basics,rewards,branding,kit,promos,'<div id="v14-preview"></div><p>Preview uses your actual chosen artwork. Prices are confirmed after saving the draft and files.</p>','<div id="v14-final"></div>'];
 return '<div class="v14-wizard"><span class="v14-eyebrow">VIEWLY / CAMPAIGN LAUNCHPAD</span><h2>'+(locked?'Continue campaign':'Build your campaign')+'</h2><p>Complete every step. Checkout comes last.</p><ol class="v14-progress">'+stepNames.map((n,i)=>'<li><span>'+String(i+1).padStart(2,'0')+'</span>'+n+'</li>').join('')+'</ol><form id="v14-form">'+parts.map((body,i)=>'<section class="v14-step" '+(i?'hidden':'')+'><h3>'+stepNames[i]+'</h3>'+body+'</section>').join('')+'<div class="v14-footer"><span id="v14-estimate"></span><div><button type="button" class="v10-button v10-outlined" data-v14-back>Back</button><button type="button" class="v10-button v10-primary" data-v14-next>Continue</button></div></div><p id="v14-state" role="status"></p></form></div>';
}
async function wizard(cid){
 if(!S.user)return authModal('register');if(!isCreator())return roleModal();
 const releases=(S.releases||[]).filter(r=>r.owner_id===S.user.id);
 if(!releases.length)return showOverlay('<h2>Publish your original music first.</h2><button class="v10-button v10-primary" data-action="upload">Upload music</button>');
 showOverlay('<div class="v14-wizard"><h2>Opening campaign builder…</h2></div>','large');
 try{
 const [cat,info,detail]=await Promise.all([getCatalog(),cid?api(url(cid)):null,cid?api('/campaigns/'+cid+'/v10'):null]);
 if(cid&&!['draft','awaiting_payment'].includes(info.status))throw Error('Campaign is already funded.');
 const c=detail?.campaign;
 draft={cid:cid||null,branding:info?.branding||null,step:0,uploaded:new Set(),title:c?.title,rate:c?.cpm_rate_cents/100,budget:c?.budget_cents/100};
 showOverlay(wizardHTML(releases,info?{...info,campaign:c}:null,cat),'large');
 const f=currentForm();
 if(c){
  for(const k of ['release_id','title','brief','spotify_track_url','mandatory_hashtags','sample_caption','rules','prohibited_content','min_views','tracking_days'])if(f.elements[k])f.elements[k].value=c[k]??'';
  f.elements.rate_eur_per_1000.value=c.cpm_rate_cents/100;f.elements.budget_eur.value=c.budget_cents/100;f.elements.max_per_clip_eur.value=c.max_clip_cents/100;
  f.elements.headline.value=info.branding.headline||'';
  for(const x of f.querySelectorAll('input[name=promo]'))x.checked=info.selections.includes(x.value)&&!x.disabled;
  for(const x of f.querySelectorAll('.v14-step:nth-child(-n+2) input,.v14-step:nth-child(-n+2) textarea,.v14-step:nth-child(-n+2) select'))x.disabled=true;
 }
 step(cid?2:0);
 }catch(err){showOverlay('<h2>Campaign builder unavailable</h2><p>'+e(err.message)+'</p>');}
}
campaignModal=function(){void wizard()};
function validate(f,n){
 for(const x of f.querySelectorAll('.v14-step')[n].querySelectorAll('input,textarea,select'))if(!x.disabled&&!x.reportValidity())return false;
 if(n===1&&Number(f.elements.max_per_clip_eur.value)>Number(f.elements.budget_eur.value)){state('Maximum per clip must fit the reward pool.',true);return false;}
 if(n===4){const placements=new Set();for(const k of selected(f)){const p=V.catalog.find(x=>x.id===k);for(const x of p.components.length?p.components.map(id=>V.catalog.find(p=>p.id===id)):[p]){if(placements.has(x.placement)){state('Choose one option per placement, including packages.',true);return false;}placements.add(x.placement);}}}
 return true;
}
async function save(f){
 if(!draft.cid){
  const body={};for(const k of ['release_id','title','brief','spotify_track_url','mandatory_hashtags','sample_caption','rules','prohibited_content'])body[k]=f.elements[k].value;
  for(const k of ['rate_eur_per_1000','max_per_clip_eur','budget_eur','min_views','tracking_days'])body[k]=Number(f.elements[k].value);
  body.rights_confirmed=f.elements.rights_confirmed.checked;
  state('Creating private campaign draft…');const x=await api('/campaigns/v14','POST',body);draft.cid=x.campaign.id;draft.title=body.title;
 }
 for(const kind of ['icon','background']){
  const file=f.elements[kind].files[0];if(file&&!draft.uploaded.has(file)){state('Validating and uploading '+kind+'…');const fd=new FormData();fd.append('image',file,file.name);const x=await api(url(draft.cid,'/image/'+kind),'POST',fd);draft.branding=x.branding;draft.uploaded.add(file);}
 }
 const files=[...f.elements.assets.files];if(files.length>16)throw Error('Choose no more than 16 assets.');
 for(const file of files){if(draft.uploaded.has(file))continue;state('Uploading '+file.name+'…');const fd=new FormData();fd.append('asset',file,file.name);await api('/campaigns/'+draft.cid+'/assets','POST',fd);draft.uploaded.add(file);}
 await api(url(draft.cid,'/settings'),'POST',{headline:f.elements.headline.value,selections:selected(f)});
 const x=await api(url(draft.cid,'/quote'));draft.quote=x.quote;
 const q=x.quote;
 f.querySelector('#v14-final').innerHTML='<div class="v14-invoice"><div><span>Clipper reward pool</span><b>'+m(q.budget_cents)+'</b></div><div><span>Platform fee · 5%</span><b>'+m(q.fee_cents)+'</b></div>'+q.lines.map(p=>'<div><span>'+e(p.label)+(p.hours?' · '+p.hours+'h':'')+'</span><b>'+m(p.price_cents)+'</b></div>').join('')+'<div class="v14-total"><span>Quoted total</span><b>'+m(q.total_cents)+'</b></div><div><span>Actual charge</span><b>€0.00</b></div></div><p>Real payments are disabled. '+(x.sandbox?'You can confirm a clearly labeled sandbox launch.':'Your campaign is saved privately until checkout is available.')+'</p>'+(x.sandbox?'<label class="v14-check"><input type="checkbox" id="v14-confirm"> I confirm the final quote and understand this is a noncash test.</label><button type="button" class="v10-button v10-primary" data-v14-pay>Confirm test checkout · €0</button>':'')+'<button type="button" class="v10-button v10-outlined" data-v14-save>Save & close</button>';
 step(6);state('Final server quote ready. Nothing has been charged.');
}
document.addEventListener('click',async ev=>{
 const t=ev.target.closest('[data-v14-next],[data-v14-back],[data-v14-pay],[data-v14-save],[data-v14-resume],[data-v14-open]');
 if(!t)return;ev.preventDefault();ev.stopImmediatePropagation();
 if(t.hasAttribute('data-v14-resume'))return void wizard(t.dataset.v14Resume);
 if(t.hasAttribute('data-v14-open')){const cid=t.dataset.v14Open;try{const x=await api('/campaigns/'+cid);if(!S.campaigns.some(c=>c.id===cid))S.campaigns.push(x.campaign);campaignDetail(cid);}catch(err){errorToast(err);}return;}
 if(t.hasAttribute('data-v14-save')){clearUrls();closeOverlay();await refresh(true);return;}
 const f=currentForm();if(!f||!draft||V.saving)return;
 if(t.hasAttribute('data-v14-back')){state('');step(Math.max(0,draft.step-1));return;}
 V.saving=true;t.disabled=true;
 try{
 if(t.hasAttribute('data-v14-pay')){
  if(!f.querySelector('#v14-confirm').checked)throw Error('Confirm the final quote first.');
  const x=await api(url(draft.cid,'/checkout'),'POST',{confirm:true,quote_hash:draft.quote.quote_hash});if(x.charged_cents!==0)throw Error('Unexpected charge state.');
  const cid=draft.cid;clearUrls();closeOverlay();toast('TEST campaign launched · €0 charged');await refresh(true);V.loaded=0;void loadFeatured(true);campaignDetail(cid);
 }else{
  state('');if(!validate(f,draft.step))return;
  if(draft.step===5)await save(f);else step(draft.step+1);
 }
 }catch(err){state(err.message+(draft.cid?' · Draft saved; retry or resume from Artist Studio.':''),true);}
 finally{V.saving=false;t.disabled=false;}
},true);
document.addEventListener('input',ev=>{const f=ev.target.closest('#v14-form');if(f)updateEstimate(f);},true);
document.addEventListener('submit',ev=>{if(ev.target.id==='v14-form'){ev.preventDefault();ev.stopImmediatePropagation();}},true);
async function loadFeatured(force=false){if(V.busy||!force&&Date.now()-V.loaded<60000)return;V.busy=true;try{const x=await api('/promotions/featured');V.featured=x.items||[];V.loaded=Date.now();if(['discover','campaigns'].includes(S.page)&&!currentForm())render();}catch{V.loaded=Date.now();}finally{V.busy=false;}}
function sponsored(items,title){if(!items.length)return '';const unique=[...new Map(items.map(x=>[x.id,x])).values()].slice(0,8);
 return '<section class="v14-sponsored"><div class="v14-section-title"><div><span class="v14-eyebrow">SPONSORED PLACEMENT · SANDBOX</span><h2>'+title+'</h2></div></div><div class="v14-feature-grid">'+unique.map(x=>'<div>'+previewHTML(x.title,x.headline||x.artist_name,x.icon_url,x.background_url,x.cpm_rate_cents,x.remaining_cents,true)+'<div class="v14-promo-bottom"><span>'+e(x.artist_name)+' · until '+e(new Date(x.ends_at).toLocaleDateString())+'</span><button type="button" data-v14-open="'+e(x.id)+'">View campaign '+icon('arrow',14)+'</button></div></div>').join('')+'</div></section>';
}
const oldDiscover=discover;discover=function(){return sponsored(V.featured.filter(x=>['home','creator','recommended','launch'].includes(x.placement)),'Featured campaigns')+oldDiscover();};
const oldCampaigns=campaignsPage;campaignsPage=function(){return sponsored(V.featured.filter(x=>['spotlight','top','category','card','recommended','launch'].includes(x.placement)),'Promoted opportunities')+oldCampaigns();};
const oldStudio=studioPage;studioPage=function(){const drafts=(S.myCampaigns||[]).filter(x=>x.branding&&['draft','awaiting_payment'].includes(x.status));return (drafts.length?'<section class="v14-resume-list"><h2>Continue campaign setup</h2>'+drafts.map(x=>'<button class="v14-resume" data-v14-resume="'+e(x.id)+'"><span>'+e(x.title)+'</span>Continue '+icon('arrow',14)+'</button>').join('')+'</section>':'')+oldStudio();};
const oldCard=campaignCard;campaignCard=function(c){return oldCard(c.branding?.background_url?{...c,cover_url:c.branding.background_url}:c);};
const oldRender=render;render=function(){oldRender();if(['discover','campaigns'].includes(S.page))void loadFeatured();};
})();
