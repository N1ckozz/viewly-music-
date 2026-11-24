/* Personalized launch film. All content is derived from a confirmed, owner-only server snapshot. */
(()=>{
'use strict';
let active=null,request=0;
const money=n=>eur(Number(n)||0),escape=esc;
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const safePath=(url,cid,kind)=>url==='/api/promotions/'+cid+'/image/'+kind?url:'';
const split=(value,limit=250)=>{
 const out=[];let rest=String(value??'').trim();
 while(rest.length>limit){let cut=rest.lastIndexOf(' ',limit);if(cut<limit/2)cut=limit;out.push(rest.slice(0,cut));rest=rest.slice(cut).trimStart();}
 if(rest)out.push(rest);return out;
};
const valid=f=>f?.version===1&&f.mode==='sandbox'&&f.payment_status==='test_confirmed'&&f.charged_cents===0&&/^[a-f0-9-]{36}$/.test(f.campaign_id)&&/^[a-f0-9-]{36}$/.test(f.receipt_id)&&f.details&&f.quote&&Array.isArray(f.quote.lines);
function scenes(f){
 const d=f.details,q=f.quote,result=[];
 const add=(type,kicker,title,body,items=[],seconds=4)=>result.push({type,kicker,title,body,items,seconds});
 add('opening','01 / CAMPAIGN LAUNCH','Your music. Your moment.','TEST CAMPAIGN CONFIRMED',[],3.2);
 add('identity','02 / THE RELEASE',d.title,f.branding?.headline||f.release.title,[['Artist / label',f.artist],['Original release',f.release.title],['Genre',f.release.genre],['Platform',d.platform]],5);
 add('budget','03 / THE REWARD POOL',money(q.budget_cents),'Noncash test reward pool',[['CPM / 1,000 views',money(d.cpm_rate_cents)],['Minimum views',String(d.min_views)],['Maximum per clip',money(d.max_clip_cents)],['Tracking period',d.tracking_days+' days']],5);
 for(const [title,value] of [['Creative brief',d.brief],['Creative rules',d.rules],['Mandatory hashtags',d.mandatory_hashtags],['Suggested caption',d.sample_caption],['Prohibited edits',d.prohibited_content],['Spotify track',d.spotify_track_url]]){
  const pages=split(value);pages.forEach((text,i)=>add('brief','04 / THE CREATIVE DIRECTION',title+(pages.length>1?' · '+(i+1)+'/'+pages.length:''),text,[],Math.max(4,Math.min(10,text.length/24+2))));
 }
 const media=f.media||[];
 for(let i=0;i<Math.max(1,media.length);i+=4)add('media','05 / CREATIVE KIT','Ready for creators',media.length+' additional approved asset'+(media.length===1?'':'s')+' · original release included'+(d.rights_confirmed?' · rights declared by artist':''),media.slice(i,i+4).map(x=>[x.label,Math.max(1,Math.round(x.bytes/1024))+' KB']),5);
 const p=q.lines||[];
 for(let i=0;i<Math.max(1,p.length);i+=4)add('promotion','06 / PROMOTION PLAN',p.length?'More visibility.':'Organic launch.',p.length?'Selected sponsored products · test placements':'No paid promotion selected',p.slice(i,i+4).map(x=>[x.label+(x.hours?' · '+x.hours+'h':''),money(x.price_cents)]),5);
 add('receipt','07 / CHECKOUT SUMMARY','Thank you for creating with VIEWLY.','Sandbox order confirmation · no actual payment',[],8);
 return result;
}
function receipt(f){
 const q=f.quote,rows=[['Clipper reward pool',money(q.budget_cents)],['Platform fee (before discount)',money(q.base_fee_cents)],...(q.discount_cents?[['Referral discount','−'+money(q.discount_cents)]]:[]),...q.lines.map(x=>[x.label,money(x.price_cents)]),['Quoted total',money(q.total_cents)],['Actual charge',money(f.charged_cents)]];
 return '<div class="v17f-receipt"><span class="v17f-stamp">TEST CONFIRMED · €0 CHARGED</span><h3>Campaign order confirmation</h3><p>'+escape(f.details.title)+'</p><dl>'+rows.map(([k,v])=>'<div><dt>'+escape(k)+'</dt><dd>'+escape(v)+'</dd></div>').join('')+'</dl><small>Order '+escape(f.receipt_id)+'<br>'+escape(f.confirmed_at)+' UTC<br>Noncash test record · not a tax invoice or payment receipt.</small><div class="v17f-signature"><span>VIEWLY.</span><span>Thank you for trusting us with your music.</span></div></div>';
}
function shell(f){
 const bg=safePath(f.branding?.background_url,f.campaign_id,'background'),icon=safePath(f.branding?.icon_url,f.campaign_id,'icon');
 return '<section class="v17f" aria-label="Campaign launch film"><div class="v17f-top"><span>VIEWLY / ORIGINALS</span><span class="v17f-test">SANDBOX · NO REAL PAYMENT</span></div><div class="v17f-stage">'+(bg?'<img class="v17f-bg" src="'+escape(bg)+'" alt="">':'')+'<div class="v17f-grade"></div><div class="v17f-grid"></div><div class="v17f-orbit a"></div><div class="v17f-orbit b"></div><div class="v17f-flare"></div><div class="v17f-dust">'+Array.from({length:24},(_,i)=>'<i style="--x:'+((i*37+13)%100)+'%;--y:'+((i*61+9)%100)+'%;--d:'+((i%7)*-.6)+'s;--s:'+(i%4+1)+'px"></i>').join('')+'</div><div class="v17f-art">'+(icon?'<img src="'+escape(icon)+'" alt="">':'<span>V.</span>')+'</div><div class="v17f-content" aria-live="off"></div><div class="v17f-film-footer"><span>CAMPAIGN LAUNCH FILM</span><span class="v17f-scene-index"></span></div></div><div class="v17f-player"><div class="v17f-timeline" role="progressbar" aria-label="Film progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div><div class="v17f-controls"><span class="v17f-time"></span><button data-v17f="open" type="button">Open campaign</button></div></div>'+(f.invite_only?'<section class="v17f-share"><h3>Private campaign</h3><p>Invite creators from Artist Studio. Public video export and campaign sharing are disabled.</p></section>':'<section class="v17f-share"><div><span class="v17f-kicker">CAMPAIGN PROMO · 9:16</span><h3>Make your campaign seen.</h3><p>Share the 1080 × 1920 promotional video. Your private checkout confirmation is never included.</p></div><p class="v17f-export-state" role="status">Preparing your video…</p><div class="v17f-share-actions"><button type="button" data-v17f="share" disabled>Share video</button><button type="button" data-v17f="video" disabled>Download MP4</button><button type="button" data-v17f="copy">Copy campaign link</button><button type="button" data-v17f="retry" hidden>Retry video export</button></div><p>For Instagram Stories, select Instagram in your device share menu if available, or upload the downloaded MP4 and add the campaign link sticker.</p></section>')+'<details class="v17f-details"><summary>Full campaign information & order confirmation</summary>'+receipt(f)+'<div class="v17f-transcript">'+scenes(f).filter(s=>s.type!=='receipt').map(s=>'<section><h4>'+escape(s.title)+'</h4><p>'+escape(s.body)+'</p>'+s.items.map(([k,v])=>'<p>'+escape(k)+': '+escape(v)+'</p>').join('')+'</section>').join('')+'</div><button type="button" data-v17f="download">Download test confirmation</button></details></section>';
}
function audio(){
 try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;const ctx=new C();void ctx.resume().catch(()=>{});return ctx;}catch{return null;}
}
function soundCue(a,type){
 const ctx=a.ctx;if(!ctx||!a.sound||ctx.state!=='running')return;
 // Original synthesized sound design: a short low impact and rising filtered tonal sweep.
 try{
 const t=ctx.currentTime,g=ctx.createGain(),filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.setValueAtTime(500,t);filter.frequency.exponentialRampToValueAtTime(2600,t+.3);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.045,t+.025);g.gain.exponentialRampToValueAtTime(.0001,t+.55);filter.connect(g);g.connect(ctx.destination);
 for(const [i,hz] of (type==='receipt'?[196,294,392]:[82,164,246]).entries()){const o=ctx.createOscillator();o.type=i===0?'sine':'triangle';o.frequency.setValueAtTime(hz,t);o.frequency.exponentialRampToValueAtTime(hz*(type==='receipt'?1.015:.76),t+.46);o.connect(filter);o.start(t+i*.025);o.stop(t+.57);o.onended=()=>o.disconnect();}
 setTimeout(()=>{try{filter.disconnect();g.disconnect()}catch{}},700);
 }catch{}
}
function cleanup(){if(!active)return;const a=active;active=null;a.controller?.abort();a.video=null;cancelAnimationFrame(a.frame);a.observer?.disconnect();if(a.ctx)void a.ctx.close().catch(()=>{});}
function draw(a,i){
 a.index=i;const s=a.scenes[i],el=a.el,content=el.querySelector('.v17f-content');
 el.dataset.scene=s.type;content.replaceChildren();
 const wrap=document.createElement('div');wrap.className='v17f-scene';
 wrap.innerHTML=s.type==='receipt'?receipt(a.film):'<span class="v17f-kicker">'+escape(s.kicker)+'</span><h2>'+escape(s.title)+'</h2><p>'+escape(s.body)+'</p>'+(s.items.length?'<div class="v17f-cards">'+s.items.map(([k,v])=>'<div><small>'+escape(k)+'</small><strong>'+escape(v)+'</strong></div>').join('')+'</div>':'');
 content.append(wrap);el.querySelector('.v17f-scene-index').textContent=String(i+1).padStart(2,'0')+' / '+String(a.scenes.length).padStart(2,'0');
 soundCue(a,s.type);
}
function progress(a){
 const p=Math.min(100,a.elapsed/a.total*100);a.el.querySelector('.v17f-timeline i').style.width=p+'%';a.el.querySelector('.v17f-timeline').setAttribute('aria-valuenow',String(Math.round(p)));a.el.querySelector('.v17f-time').textContent=Math.floor(a.elapsed)+'s / '+Math.ceil(a.total)+'s';
}
function tick(a,t){
 if(active!==a)return;
 if(S.user?.id!==a.uid){cleanup();if(a.el.isConnected)closeOverlay();return;}
 if(!a.el.isConnected){cleanup();return;}
 a.frame=requestAnimationFrame(n=>tick(a,n));
 if(!a.last)a.last=t;
 const dt=Math.min(.25,(t-a.last)/1000);a.last=t;
 if(!a.playing||document.hidden)return;
 a.elapsed=Math.min(a.total,a.elapsed+dt);
 let acc=0,index=a.scenes.length-1;
 for(let i=0;i<a.scenes.length;i++){acc+=a.scenes[i].seconds;if(a.elapsed<acc){index=i;break;}}
 if(index!==a.index)draw(a,index);
 progress(a);if(a.elapsed>=a.total){a.playing=false;a.el.dataset.paused='true';}
}
function openFilm(f,ctx=null){
 if(!valid(f)||!S.user){if(ctx)void ctx.close().catch(()=>{});return false;}
 cleanup();
 showOverlay(shell(f),'large v17f-modal');
 const el=document.querySelector('.v17f');if(!el){if(ctx)void ctx.close().catch(()=>{});return false;}
 const list=scenes(f),a={film:f,uid:S.user.id,el,ctx,sound:!!ctx,index:-1,elapsed:0,total:list.reduce((n,s)=>n+s.seconds,0),scenes:list,playing:!reduced(),last:0,frame:0};
 active=a;
 if(!a.playing){a.elapsed=a.total;el.dataset.paused='true';draw(a,list.length-1);}else draw(a,0);
 progress(a);a.frame=requestAnimationFrame(t=>tick(a,t));
 a.observer=new MutationObserver(()=>{if(!el.isConnected&&active===a)cleanup();});a.observer.observe(document.querySelector('#overlay-root'),{childList:true,subtree:true});
 if(!f.invite_only)void prepareVideo(a);
 return true;
}
function campaignLink(a){return location.origin+'/?campaign='+encodeURIComponent(a.film.campaign_id);}
async function prepareVideo(a){
 if(a.loading||a.video||active!==a)return;
 a.loading=true;const status=a.el.querySelector('.v17f-export-state'),retry=a.el.querySelector('[data-v17f="retry"]');
 status.textContent='Rendering your vertical MP4…';retry.hidden=true;
 a.controller=new AbortController();
 try{
  const res=await fetch('/api/promotions/'+a.film.campaign_id+'/social-video',{method:'POST',headers:{'X-Viewly-Request':'1'},credentials:'same-origin',signal:a.controller.signal});
  if(!res.ok){let error;try{error=(await res.json()).error}catch{}throw Error(error||'Video export unavailable');}
  if(!res.headers.get('content-type')?.startsWith('video/mp4'))throw Error('Invalid video response');
  const blob=await res.blob();if(active!==a||S.user?.id!==a.uid)return;
  if(blob.size<1000||blob.size>24*1024*1024)throw Error('Invalid video size');
  a.video=new File([blob],'VIEWLY-campaign.mp4',{type:'video/mp4'});
  status.textContent='Your Story-ready video is ready.';
  a.el.querySelector('[data-v17f="share"]').disabled=false;a.el.querySelector('[data-v17f="video"]').disabled=false;
 }catch(e){if(active===a&&e.name!=='AbortError'){status.textContent=e.message;retry.hidden=false;}}
 finally{a.loading=false;}
}
function downloadVideo(a){const u=URL.createObjectURL(a.video),link=document.createElement('a');link.href=u;link.download=a.video.name;link.click();setTimeout(()=>URL.revokeObjectURL(u),30000);}
async function shareVideo(a){
 if(!a.video)return;
 try{if(navigator.share&&navigator.canShare?.({files:[a.video]})){const payload={files:[a.video],title:a.film.details.title,text:'Discover the campaign on VIEWLY · test campaign',url:campaignLink(a)};await navigator.share(navigator.canShare(payload)?payload:{files:[a.video]});return;}}
 catch(e){if(e.name==='AbortError')return;}
 downloadVideo(a);toast('Video downloaded. Upload it to Instagram Stories or another social app and add the campaign link.');
}
async function fetchFilm(cid){
 const seq=++request,uid=S.user?.id,ctx=reduced()?null:audio();
 try{const {film}=await api('/promotions/'+cid+'/film');if(seq!==request||S.user?.id!==uid){if(ctx)void ctx.close().catch(()=>{});return;}if(!openFilm(film,ctx))throw Error('Invalid launch film record');}catch(e){if(ctx&&ctx.state!=='closed')void ctx.close().catch(()=>{});errorToast(e);}
}
document.addEventListener('click',ev=>{
 const t=ev.target.closest('[data-v17f],[data-v17f-reopen]');if(!t)return;ev.preventDefault();ev.stopImmediatePropagation();
 if(t.hasAttribute('data-v17f-reopen')){void fetchFilm(t.dataset.v17fReopen);return;}
 const a=active;if(!a||!a.el.contains(t))return;
 const cmd=t.dataset.v17f;
 if(cmd==='retry'){void prepareVideo(a);return;}
 if(cmd==='video'&&a.video){downloadVideo(a);return;}
 if(cmd==='share'){void shareVideo(a);return;}
 if(cmd==='copy'){void Promise.resolve().then(()=>navigator.clipboard.writeText(campaignLink(a))).then(()=>toast('Campaign link copied.')).catch(()=>toast('Copy the campaign link from: '+campaignLink(a),true));return;}
 if(cmd==='open'){const cid=a.film.campaign_id;cleanup();closeOverlay();campaignDetail(cid);}
 if(cmd==='download'){const f=a.film,q=f.quote;const txt=['VIEWLY — TEST ORDER CONFIRMATION','No real payment. Not a tax invoice.',f.details.title,'Order: '+f.receipt_id,'Confirmed: '+f.confirmed_at,'Reward pool: '+money(q.budget_cents),'Fee: '+money(q.fee_cents),'Referral discount: '+money(q.discount_cents),...q.lines.map(x=>x.label+': '+money(x.price_cents)),'Quoted total: '+money(q.total_cents),'Actual charge: '+money(f.charged_cents),'Thank you for creating with VIEWLY.'].join('\n');const u=URL.createObjectURL(new Blob([txt],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');link.href=u;link.download='VIEWLY-test-'+f.receipt_id+'.txt';link.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
},true);
const oldStudio=studioPage;studioPage=function(){const rows=(S.myCampaigns||[]).filter(c=>c.launch_film_available);return (rows.length?'<section class="v17f-library"><h2>Campaign launch films</h2>'+rows.map(c=>'<button type="button" data-v17f-reopen="'+escape(c.id)+'"><span>'+escape(c.title)+'</span><b>Replay launch film →</b></button>').join('')+'</section>':'')+oldStudio();};
window.ViewlyLaunchFilm={prepare:()=>reduced()?null:audio(),open:openFilm,release:ctx=>{if(ctx&&ctx.state!=='closed')void ctx.close().catch(()=>{});}};
})();
