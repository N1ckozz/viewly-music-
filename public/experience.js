/* VIEWLY EXPERIENCE — applies to the authenticated real-data app; no mock records or simulated payments. */
(()=>{
'use strict';
const X={studio:'overview',clips:'exports',campaigns:'live',wallet:'overview',sort:'newest',palette:false,paletteQuery:''};
const B=(id,label,icon='arrow',extra='')=>'<button class="x-button '+extra+'" type="button" data-ux-nav="'+id+'">'+ico(icon,16)+'<span>'+label+'</span></button>';
const tabs=(group,options)=>'<div class="x-tabs" role="tablist" aria-label="'+group+' views">'+options.map(([id,label,icon])=>'<button type="button" role="tab" aria-selected="'+(X[group]===id)+'" class="x-tab '+(X[group]===id?'selected':'')+'" data-ux-tab="'+group+':'+id+'">'+ico(icon,15)+' '+label+'</button>').join('')+'</div>';
const blank=(title,message,cta='',label='')=>'<div class="x-empty">'+ico('releases',33)+'<h3>'+title+'</h3><p>'+message+'</p>'+(cta?'<button class="primary tiny" data-action="'+cta+'">'+label+' '+ico('arrow',13)+'</button>':'')+'</div>';
const panel=(label,value,desc,icon='bolt')=>'<div class="x-metric">'+ico(icon,19)+'<div class="x-metric-meta"><span>'+label+'</span><b>'+value+'</b><small>'+desc+'</small></div></div>';
const quickbar=()=>'<div class="x-quickbar"><button type="button" data-ux-command="open" class="x-command">'+ico('search',17)+'<span>Search music, artists & actions</span><kbd>⌘ K</kbd></button><div class="x-quicklinks">'+B('releases','Discover','releases')+B('clips','Clip desk','scissors')+(isCreator()?'<button class="x-button accent" data-action="upload">'+ico('plus',16)+'<span>New release</span></button>':'<button class="x-button accent" data-action="'+(S.user?'role':'register')+'">'+ico('plus',16)+'<span>'+(S.user?'Artist tools':'Join')+'</span></button>')+'</div></div>';
function wrapIntro(label,title,description,actions=''){return '<header class="x-page-title"><span class="x-kicker">'+label+'</span><div class="x-heading-row"><div><h1>'+title+'</h1><p>'+description+'</p></div><div class="x-heading-actions">'+actions+'</div></div></header>'}
const originalShell=renderShell;
renderShell=function(inner){
 const base=originalShell(inner);return base.replace('<main class="main" id="main-content">','<main class="main" id="main-content">'+quickbar());
};
const originalDiscover=discover;
discover=function(){
 const base=originalDiscover();
 const realTop=S.releases.slice(0,3);
 const strip='<div class="x-ticker"><div><span class="x-live"></span> LIVE DISCOVERY <strong>'+S.releases.length+'</strong> RELEASES</div><div>ACTIVE CLIPPING OPPORTUNITIES <strong>'+S.campaigns.length+'</strong></div><button data-ux-nav="releases">EXPLORE '+ico('arrow',13)+'</button></div>';
 const releasePicks=realTop.length?'<div class="x-featured-strip">'+realTop.map(r=>'<button class="x-featured" data-action="play" data-id="'+r.id+'">'+(r.cover_url?'<img src="'+esc(r.cover_url)+'" loading="lazy" alt="">':'<span class="x-featured-fallback">'+ico('releases',30)+'</span>')+'<span><strong>'+esc(r.title)+'</strong><small>'+esc(r.artist_name)+'</small></span>'+ico('play',16)+'</button>').join('')+'</div>':'';
 return strip+releasePicks+base;
};
const originalReleases=releasesPage;
releasesPage=function(){
 const list=S.releases.filter(r=>(S.genre==='All'||r.genre===S.genre)&&(!S.q||String(r.title+' '+r.artist_name+' '+r.genre).toLowerCase().includes(S.q.toLowerCase())));
 list.sort((a,b)=>X.sort==='popular'?Number(b.plays)-Number(a.plays):X.sort==='liked'?Number(b.likes)-Number(a.likes):new Date(b.created_at)-new Date(a.created_at));
 return wrapIntro('THE LIBRARY','FIND YOUR SOUND.','Real videos. Independent voices. No generated music.','<button class="primary tiny" data-action="'+(isCreator()?'upload':S.user?'role':'register')+'">'+ico('plus',15)+' Publish music</button>')+
 '<div class="x-toolbar"><div class="x-filter-tabs">'+['All','Trap','Rap','Drill','Hip-Hop','Freestyle','Other'].map(g=>'<button class="x-filter '+(S.genre===g?'active':'')+'" data-genre="'+g+'">'+g+'</button>').join('')+'</div><div class="x-sort"><label for="x-sort">Sort</label><select id="x-sort" aria-label="Sort releases"><option value="newest"'+(X.sort==='newest'?' selected':'')+'>Newest</option><option value="popular"'+(X.sort==='popular'?' selected':'')+'>Most played</option><option value="liked"'+(X.sort==='liked'?' selected':'')+'>Most liked</option></select></div></div>'+
 '<div class="x-search-line"><label for="release-search">'+ico('search',18)+'</label><input type="search" id="release-search" autocomplete="off" value="'+esc(S.q)+'" placeholder="Search tracks, artists or genres..." aria-label="Search releases"><span>'+list.length+' results</span></div>'+
 (list.length?'<div class="cards-grid x-release-grid">'+list.map(releaseCard).join('')+'</div>':blank('Nothing in this selection.','Try another filter or upload the first real release.',isCreator()?'upload':'',isCreator()?'Upload':''));
};
campaignsPage=function(){
 const mine=X.campaigns==='mine' && Boolean(S.user);
 const list=mine?S.myCampaigns:S.campaigns;
 const intro=wrapIntro('CAMPAIGN ENGINE','MOVE THE CULTURE.','Create a brief, recruit real clippers and measure legitimate results. Artist rewards are disabled until funding and payouts are independently verified.',B('studio','Artist studio','studio'));
 const s=tabs('campaigns',[['live','Live opportunities','bolt'],['mine','My campaigns','campaigns']]);
 const content=list.length?'<div class="cards-grid x-release-grid">'+list.map(c=>mine?'<article class="x-draft"><div class="x-draft-top"><span class="status-pill '+esc(c.status)+'">'+esc(c.status.replace(/_/g,' '))+'</span><span>'+eur(c.reward_cents)+' / clip</span></div><h3>'+esc(c.title)+'</h3><p>'+esc(c.artist_name)+' · '+esc(c.release_title)+'</p><div class="x-draft-numbers"><span>Budget <b>'+eur(c.budget_cents)+'</b></span><span>Spent <b>'+eur(c.spent_cents)+'</b></span></div><button class="outline tiny" data-action="manage-campaign" data-id="'+c.id+'">View campaign '+ico('arrow',14)+'</button></article>':campaignCard(c)).join('')+'</div>':blank(mine?'Your campaign desk is empty.':'No funded clip campaigns yet.',mine?'Create a real brief from your uploaded release. Drafts stay private until payment is verified.':'Only paid and verified campaigns appear here. Never fabricated listings.',mine&&isCreator()?'create-campaign':'',mine?'Create a draft':'');
 return intro+s+'<div class="x-section-actions">'+(mine&&isCreator()?'<button class="primary tiny" data-action="create-campaign">'+ico('plus',14)+' New campaign</button>':'<div class="x-principle">'+ico('shield',15)+' Verified budgets only</div>')+'</div>'+content+
 '<div class="x-trust-note">'+ico('shield',18)+' <span><b>Real reach needs real verification.</b> Submission links alone never certify social views or authorize payment.</span></div>';
};
const originalStudio=studioPage;
studioPage=function(){
 if(!isCreator())return originalStudio();
 const mine=S.releases.filter(r=>r.owner_id===S.user.id);
 const intro=wrapIntro('ARTIST CONTROL ROOM','OWN YOUR DROP.','Create your releases, manage campaigns and see only your actual numbers.','<button class="primary tiny" data-action="upload">'+ico('plus',15)+' Upload release</button><button class="outline tiny" data-action="create-campaign">'+ico('campaigns',15)+' New brief</button>');
 const s=tabs('studio',[['overview','Overview','discover'],['releases','Releases','releases'],['campaigns','Campaigns','campaigns']]);
 const stats='<div class="x-metrics">'+panel('RELEASES',S.stats.releases||0,'Your published uploads','releases')+panel('SIGNED-IN PLAYS',S.stats.plays||0,'Unique listeners','play')+panel('CLIP EXPORTS',S.stats.clips||0,'Created from real videos','scissors')+panel('CAMPAIGNS',S.stats.campaigns||0,'Including private drafts','campaigns')+'</div>';
 const first=mine.length?'<div class="cards-grid x-release-grid">'+mine.map(releaseCard).join('')+'</div>':blank('No music uploaded yet.','Your first original video will appear publicly after successful upload.','upload','Publish a release');
 const second=S.myCampaigns.length?'<div class="x-draft-list">'+S.myCampaigns.map(c=>'<button class="x-row" data-action="manage-campaign" data-id="'+c.id+'"><span class="x-row-main"><b>'+esc(c.title)+'</b><small>'+esc(c.release_title)+' · '+esc(c.platform)+'</small></span><span class="status-pill '+esc(c.status)+'">'+esc(c.status.replace(/_/g,' '))+'</span><span class="x-row-money">'+eur(c.budget_cents)+'</span>'+ico('arrow',17)+'</button>').join('')+'</div>':blank('No campaigns yet.','Create a private campaign brief, then review its budget. Payments remain disabled until verified.','create-campaign','Create draft');
 const releases=section('Your releases','Your own published music',first,null);
 const campaigns=section('Your campaigns','Actual drafts and funded campaigns',second,null);
 const tips='<div class="x-workflow"><div><span>01</span><b>Upload</b><small>Publish authorized music footage.</small></div><div><span>02</span><b>Set the brief</b><small>Choose clip rules and a funded budget.</small></div><div><span>03</span><b>Review</b><small>Approve only legitimate submissions.</small></div></div>';
 return intro+s+(X.studio==='overview'?stats+tips+releases+campaigns:X.studio==='releases'?releases:campaigns);
};
clipsPage=function(){
 if(!S.user)return gate('Clipping desk','Sign in to create clips from artist-authorized videos.');
 const intro=wrapIntro('CLIP PRODUCTION','FIND THE MOMENT.','Turn a real uploaded music video into a downloadable MP4. Choose the cut precisely and publish wherever permitted.',B('releases','Browse footage','releases'));
 const s=tabs('clips',[['exports','My exports','scissors'],['source','Source videos','video']]);
 const clips=S.myClips;
 const content=X.clips==='exports'?(clips.length?'<div class="cards-grid x-release-grid">'+clips.map(c=>'<article class="x-clip-item"><video src="'+esc(c.video_url)+'" preload="metadata" playsinline muted></video><h3>'+esc(c.release_title)+'</h3><p>'+Math.round(c.start_sec)+'–'+Math.round(c.end_sec)+' sec · '+date(c.created_at)+'</p><div class="x-clip-buttons"><button class="secondary tiny" data-action="clip-play" data-url="'+esc(c.video_url)+'">'+ico('play',13)+' Preview</button><a class="primary tiny" download href="'+esc(c.video_url)+'">'+ico('arrow',13)+' MP4</a></div></article>').join('')+'</div>':blank('Your exports will live here.','Pick a real source video and cut a 5–90-second moment.')):(S.releases.length?'<div class="cards-grid x-release-grid">'+S.releases.map(releaseCard).join('')+'</div>':blank('Waiting for the first artist.','Once artists upload authorized footage, it will appear here.'));
 return intro+s+content;
};
walletPage=function(){
 if(!S.user)return gate('Reward ledger','Sign in to view your real financial activity.');
 const w=S.wallet||{entries:[],earned_cents:0,available_to_withdraw_cents:0};
 const intro=wrapIntro('YOUR ACCOUNT','REWARD LEDGER.','A transparent record of actual campaign events. No estimated balances or simulated payouts.');
 const s=tabs('wallet',[['overview','Overview','wallet'],['history','Transactions','campaigns']]);
 const data=(w.entries||[]);
 const overview='<div class="x-metrics x-two">'+panel('RECORDED REWARDS',eur(w.earned_cents||0),'Ledger entries, not spendable balance','wallet')+panel('AVAILABLE TO WITHDRAW',eur(w.available_to_withdraw_cents||0),'Payout integration currently unavailable','shield')+'</div>';
 const hist=data.length?'<div class="x-draft-list">'+data.map(a=>'<div class="x-row"><span class="x-row-main"><b>'+esc(a.campaign_title||'Campaign reward')+'</b><small>'+esc(a.type.replace(/_/g,' '))+' · '+date(a.created_at)+'</small></span><b class="x-row-money">'+eur(a.amount_cents)+'</b></div>').join('')+'</div>':blank('No reward events recorded.','Your ledger remains empty until a verified funded campaign approves a valid submission.');
 return intro+s+(X.wallet==='overview'?overview+'<div class="x-trust-note">'+ico('shield',18)+' <span><b>Payments are not enabled.</b> No deposits, withdrawals or rewards will be simulated. Eligible payment methods appear only after actual verification.</span></div>':hist);
};
const oldClipEditor=clipEditor;
clipEditor=function(r){
 if(!S.user)return authModal('register');
 const t=document.querySelector('#viewly-player')?.currentTime||0;
 const start=Math.floor(t),end=start+15;
 showOverlay('<div class="x-clip-studio"><div class="x-kicker">STUDIO / VIDEO EDITOR</div><h2>Cut it. Make it move.</h2><p class="intro">'+esc(r.title)+' — '+esc(r.artist_name)+'</p><video id="ux-clip-preview" controls playsinline preload="metadata" src="'+esc(r.video_url)+'" poster="'+esc(r.cover_url||'')+'"></video><form id="clip-form" data-id="'+r.id+'"><div class="x-clip-timeline"><span class="x-clip-timeline-track" aria-hidden="true"></span><div class="x-clip-time"><span>START <b id="ux-start-label">'+start.toFixed(1)+'s</b></span><span>END <b id="ux-end-label">'+end.toFixed(1)+'s</b></span></div><div class="x-editor-sliders"><label>IN <input type="range" id="ux-start-range" min="0" max="300" step=".1" value="'+start+'"></label><label>OUT <input type="range" id="ux-end-range" min="0" max="300" step=".1" value="'+end+'"></label></div></div><div class="row-fields"><div class="field"><label>START (SECONDS)</label><input name="start" type="number" min="0" step=".1" value="'+start+'" required></div><div class="field"><label>END (SECONDS)</label><input name="end" type="number" min="5" step=".1" value="'+end+'" required></div></div><div class="x-editor-shortcuts"><button class="outline tiny" type="button" data-ux-command="mark-in">Set IN at playhead</button><button class="outline tiny" type="button" data-ux-command="mark-out">Set OUT at playhead</button><span id="ux-range-length">15.0-second clip</span></div><div class="field"><label>EXPORT FRAMING</label><select name="format"><option value="vertical">Vertical 9:16 — blurred backdrop</option><option value="original">Original aspect ratio</option></select></div><div class="x-trust-note">'+ico('shield',15)+' <span>Exports are made from actual source footage, using the artist’s publishing permission. Duration: 5–90 seconds.</span></div><button class="primary x-full" type="submit">'+ico('scissors',16)+' Generate real MP4</button><div id="clip-status" role="status"></div></form></div>','medium');
 const v=document.querySelector('#ux-clip-preview');v?.addEventListener('loadedmetadata',()=>{const max=Math.max(5,Math.floor(v.duration||300));for(const input of document.querySelectorAll('#ux-start-range,#ux-end-range'))input.max=String(max);const e=document.querySelector('#clip-form [name=end]');if(e&&Number(e.value)>max){e.value=String(max);updateClipControls()}});
};
function updateClipControls(changed){
 const form=document.querySelector('#clip-form'),v=document.querySelector('#ux-clip-preview');if(!form)return;
 const start=form.querySelector('[name=start]'),end=form.querySelector('[name=end]'),a=document.querySelector('#ux-start-range'),b=document.querySelector('#ux-end-range');
 if(changed==='ux-start-range')start.value=a.value;
 if(changed==='ux-end-range')end.value=b.value;
 if(a&&changed!=='ux-start-range')a.value=start.value;
 if(b&&changed!=='ux-end-range')b.value=end.value;
 const s=Number(start.value),e=Number(end.value),valid=e-s>=5&&e-s<=90&&s>=0&&(!v?.duration||e<=v.duration+.1);
 const st=document.querySelector('#ux-start-label'),en=document.querySelector('#ux-end-label'),len=document.querySelector('#ux-range-length');
 if(st)st.textContent=s.toFixed(1)+'s';if(en)en.textContent=e.toFixed(1)+'s';
 if(len){len.textContent=(e-s).toFixed(1)+' sec'+(valid?'':' — adjust to 5–90s');len.classList.toggle('invalid',!valid);}
 const submit=form.querySelector('[type=submit]');if(submit)submit.disabled=!valid;
}
const originalRender=render;
render=function(){
 originalRender();
 const active=document.querySelector('.x-tab.selected');
 if(active&&active.getAttribute('aria-selected')!=='true')active.setAttribute('aria-selected','true');
 const brand=document.querySelector('.topbar .brand');
 if(brand)brand.setAttribute('title','Viewly home');
 const main=document.querySelector('#main-content');
 if(main)main.setAttribute('tabindex','-1');
 document.title=(S.page==='discover'?'Discover':S.page[0].toUpperCase()+S.page.slice(1))+' · VIEWLY MUSIC';
};
function options(){
 const items=[
 {label:'Discover music',sub:'Browse published artist videos',page:'releases',icon:'releases'},
 {label:'Explore clipping briefs',sub:'Real funded artist campaigns',page:'campaigns',icon:'campaigns'},
 {label:'Your clip desk',sub:'Create and download MP4 clips',page:'clips',icon:'scissors'},
 {label:'Artist studio',sub:'Releases and campaign management',page:'studio',icon:'studio'},
 {label:'Reward ledger',sub:'Real payout and reward status',page:'wallet',icon:'wallet'},
 {label:'Your profile',sub:'Account settings',page:'profile',icon:'user'}];
 for(const r of S.releases)items.push({label:r.title,sub:'Release by '+r.artist_name,action:'play',id:r.id,icon:'play'});
 return items.filter(x=>(x.label+' '+x.sub).toLowerCase().includes(X.paletteQuery.toLowerCase())).slice(0,12);
}
function openPalette(){
 X.palette=true;X.paletteQuery='';const existing=document.querySelector('#ux-palette');if(existing)existing.remove();
 const el=document.createElement('div');el.id='ux-palette';el.className='x-palette-overlay';el.innerHTML='<div class="x-palette" role="dialog" aria-modal="true" aria-label="Quick search"><div class="x-palette-search">'+ico('search',19)+'<input id="ux-palette-input" placeholder="Search releases or jump to a page..." autofocus autocomplete="off"><kbd>ESC</kbd></div><div id="ux-palette-items"></div><div class="x-palette-footer">Results come from real Viewly data • Ctrl/⌘ + K</div></div>';
 document.body.append(el);renderPalette();el.querySelector('input')?.focus();
}
function closePalette(){X.palette=false;document.querySelector('#ux-palette')?.remove()}
function renderPalette(){
 const el=document.querySelector('#ux-palette-items');if(!el)return;
 const all=options();el.innerHTML=all.length?all.map((o,i)=>'<button class="x-palette-item" data-ux-result="'+i+'">'+ico(o.icon,17)+'<span><b>'+esc(o.label)+'</b><small>'+esc(o.sub)+'</small></span>'+ico('arrow',15)+'</button>').join(''):'<div class="x-palette-zero">No matching releases or destinations.</div>';
}
document.addEventListener('click',e=>{
 const tab=e.target.closest('[data-ux-tab]');if(tab){const [group,value]=tab.dataset.uxTab.split(':');if(X[group]!==value){X[group]=value;render();}e.stopPropagation();return}
 const nav=e.target.closest('[data-ux-nav]');if(nav){S.page=nav.dataset.uxNav;S.genre='All';S.q='';render();window.scrollTo({top:0,behavior:'instant'});if(['wallet','clips','studio'].includes(S.page))refresh(true);e.stopPropagation();return}
 const cmd=e.target.closest('[data-ux-command]');if(cmd){e.preventDefault();e.stopPropagation();if(cmd.dataset.uxCommand==='open')openPalette();else if(cmd.dataset.uxCommand==='mark-in'||cmd.dataset.uxCommand==='mark-out'){const start=cmd.dataset.uxCommand==='mark-in';const v=document.querySelector('#ux-clip-preview'),target=document.querySelector('#clip-form [name='+(start?'start':'end')+']');if(v&&target){target.value=v.currentTime.toFixed(1);updateClipControls();}}return}
 const result=e.target.closest('[data-ux-result]');if(result){const item=options()[Number(result.dataset.uxResult)];closePalette();if(item){if(item.action==='play'){const rel=S.releases.find(r=>r.id===item.id);if(rel)playModal(rel);}else{S.page=item.page;S.q='';S.genre='All';render();window.scrollTo(0,0);if(['studio','clips','wallet'].includes(S.page))refresh(true)}}return}
 if(e.target.id==='ux-palette'){closePalette();return}
},true);
document.addEventListener('input',e=>{
 if(e.target.id==='ux-palette-input'){X.paletteQuery=e.target.value;renderPalette()}
 if(e.target.closest('#clip-form')&&['start','end'].includes(e.target.name))updateClipControls();
 if(e.target.id==='ux-start-range'||e.target.id==='ux-end-range')updateClipControls(e.target.id);
},true);
document.addEventListener('change',e=>{if(e.target.id==='x-sort'){X.sort=e.target.value;render();e.stopImmediatePropagation()}},true);
document.addEventListener('keydown',e=>{
 const typing=/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'')||document.activeElement?.isContentEditable;
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();X.palette?closePalette():openPalette()}
 else if(e.key==='/'&&!typing&&!e.altKey&&!e.ctrlKey&&!e.metaKey){e.preventDefault();openPalette()}
 else if(e.key==='Escape'&&X.palette){e.preventDefault();closePalette()}
 else if(e.key==='Enter'&&X.palette&&document.activeElement?.id==='ux-palette-input'){e.preventDefault();document.querySelector('[data-ux-result="0"]')?.click();}
},true);
})();
