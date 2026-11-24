/* VIEWLY V7 — editorial typography, real genre shelves, one clear navigation system.
   Enhances current server-backed UI without changing API routes or inventing content. */
(()=>{
'use strict';
const V7={compact:false};
const GENRES=[
 {key:'All',label:'All sounds',sub:'Entire library',shape:'orbit',tone:'all'},
 {key:'Trap',label:'Trap',sub:'808 movement',shape:'bass',tone:'trap'},
 {key:'Rap',label:'Rap',sub:'Bars & verses',shape:'bars',tone:'rap'},
 {key:'Drill',label:'Drill',sub:'Dark energy',shape:'grid',tone:'drill'},
 {key:'Hip-Hop',label:'Hip-Hop',sub:'Rhythm & culture',shape:'rings',tone:'hiphop'},
 {key:'Freestyle',label:'Freestyle',sub:'Unfiltered talent',shape:'wave',tone:'freestyle'},
 {key:'Other',label:'Other',sub:'Beyond genres',shape:'stars',tone:'other'}
];
const icon=(name,size=18)=>ico(name,size);
function counts(){
 const tally=new Map(GENRES.map(g=>[g.key,0]));
 for(const release of S.releases||[]){
  if(tally.has(release.genre))tally.set(release.genre,tally.get(release.genre)+1);
  tally.set('All',tally.get('All')+1);
 }
 return tally;
}
function genreWidgets(compact=false){
 const tally=counts();
 const active=S.page==='releases'?S.genre:'';
 const items=GENRES.map((g,i)=>{
  const selected=active===g.key;
  const count=tally.get(g.key)||0;
  return '<button type="button" class="v7-genre-card v7-tone-'+g.tone+(selected?' is-selected':'')+'" data-v7-category="'+esc(g.key)+'" aria-label="'+esc(g.label)+', '+count+' '+(count===1?'release':'releases')+'" aria-pressed="'+selected+'">'+
   '<span class="v7-genre-no">0'+(i+1)+'</span>'+
   '<span class="v7-genre-visual v7-shape-'+g.shape+'" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></span>'+
   '<span class="v7-genre-content"><b>'+esc(g.label)+'</b><small>'+esc(g.sub)+'</small></span>'+
   '<span class="v7-genre-foot"><span>'+count+' '+(count===1?'release':'releases')+'</span>'+icon('arrow',15)+'</span></button>';
 }).join('');
 return '<section class="v7-categories'+(compact?' is-compact':'')+'" aria-label="Music categories">'+
  '<div class="v7-categories-head"><div><span class="v7-overline">THE SOUND DIRECTORY</span><h2>Find your frequency<span>.</span></h2></div>'+
  '<span class="v7-categories-caption">'+tally.get('All')+' published · Real artists only</span></div>'+
  '<div class="v7-genre-strip">'+items+'</div></section>';
}
const beforeRelease=releasesPage;
releasesPage=function(){
 let html=beforeRelease();
 // The previously horizontal pill row is superseded by a useful visual category selector.
 // The existing sorting and search controls are deliberately preserved.
 html=html.replace(/<div class="x-filter-tabs">[\s\S]*?<\/div>/,'');
 const searchAnchor='<div class="x-toolbar">';
 if(html.includes(searchAnchor)){
  html=html.replace(searchAnchor,genreWidgets(false)+searchAnchor);
 }else html=genreWidgets(false)+html;
 return html;
};
const beforeDiscover=discover;
discover=function(){
 const html=beforeDiscover();
 const section='<section class="v-home-discover">';
 return html.includes(section)?html.replace(section,genreWidgets(true)+section):html+genreWidgets(true);
};
function sideItem(page,label,glyph,count=null){
 const current=S.page===page;
 return '<button type="button" class="v-nav v7-side-link '+(current?'is-active':'')+'" data-page="'+page+'" aria-label="'+esc(label)+'" '+(current?'aria-current="page"':'')+'>'+
  '<span class="v7-side-icon">'+icon(glyph,18)+'</span><span class="v7-side-label">'+label+'</span>'+
  (count!==null?'<span class="v7-side-number">'+count+'</span>':'')+'</button>';
}
function sideGroup(label,entries){
 return '<div class="v-rail-group v7-nav-group"><div class="v-rail-label">'+label+'</div>'+
 entries.map(e=>sideItem(e[0],e[1],e[2],e[3]??null)).join('')+'</div>';
}
const baseShell=renderShell;
renderShell=function(inner){
 let html=baseShell(inner);
 html=html.replace('class="v-app-shell"','class="v-app-shell v7-app'+(V7.compact?' v7-nav-mini':'')+'"');
 const newRail='<nav class="v-rail" aria-label="Desktop primary navigation">'+
  sideGroup('DISCOVER',[['discover','Home','discover'],['releases','Music library','releases',S.releases.length],['campaigns','Campaigns','campaigns',S.campaigns.length]])+
  sideGroup('YOUR WORKSPACE',[['clips','Clip studio','scissors'],['studio','Artist tools','studio'],['wallet','Rewards','wallet']])+
  '</nav>';
 const navMatch=/<nav class="v-rail" aria-label="Desktop primary navigation">[\s\S]*?<\/nav>/;
 if(!navMatch.test(html))throw Error('Navigation layout unavailable');
 html=html.replace(navMatch,()=>newRail);
 // Desktop user entry is already in the top bar. Mobile primary tabs remain in the existing five-button dock.
 const topStart='<div class="v-top-left">';
 const desktopToggle='<button type="button" class="v7-sidebar-toggle" data-v7-sidebar-toggle aria-label="'+(V7.compact?'Expand navigation':'Collapse navigation')+'" aria-expanded="'+(!V7.compact)+'">'+
 icon('campaigns',17)+'</button>';
 html=html.replace(topStart,topStart+desktopToggle);
 const mobileMenu='<button type="button" class="v7-tools-trigger" data-v7-tools aria-label="Open creator tools menu" aria-haspopup="dialog">'+
  '<span class="v7-tools-line"></span><span class="v7-tools-line"></span><span class="v7-tools-line"></span></button>';
 const topRight='<div class="v-top-right">';
 html=html.replace(topRight,topRight+mobileMenu);
 const endMarker='<div class="v-sidebar-bottom">';
 const sidebarFooter='<div class="v7-sidebar-footer"><span class="v7-sidebar-marker">V.</span><span><b>MADE FOR SOUND.</b><small>Artists. Clips. Culture.</small></span></div>';
 html=html.replace(endMarker,endMarker+sidebarFooter);
 return html;
};
const tools=[
 {page:'studio',icon:'studio',title:'Artist studio',desc:'Releases and campaign drafts'},
 {page:'wallet',icon:'wallet',title:'Rewards',desc:'Real earnings and activity'},
 {action:'submissions',icon:'campaigns',title:'My submissions',desc:'Track campaign reviews'},
 {action:'security',icon:'shield',title:'Account security',desc:'Sessions and authenticator'}
];
function openTools(){
 const opts=tools.map(t=>'<button class="v7-tool-item" type="button" data-v7-go="'+esc(t.page||t.action)+'">'+
   '<span class="v7-tool-symbol">'+icon(t.icon,20)+'</span>'+
   '<span class="v7-tool-description"><b>'+t.title+'</b><small>'+t.desc+'</small></span>'+icon('arrow',16)+'</button>').join('');
 showOverlay('<div class="v7-tools-modal"><span class="v7-overline">YOUR WORKSPACE</span><h2>Creator tools<span>.</span></h2>'+
   '<p>Everything beyond the essentials, in one place.</p><div class="v7-tools-list">'+opts+'</div>'+
   '<div class="v7-tools-note"><span class="v7-status-light"></span>Live data only · Payments subject to verification</div></div>','medium');
}
document.addEventListener('click',e=>{
 const genre=e.target.closest('[data-v7-category]');
 if(genre){
  e.preventDefault();e.stopImmediatePropagation();
  const chosen=genre.dataset.v7Category;
  if(!GENRES.some(g=>g.key===chosen))return;
  S.genre=chosen;S.q='';S.page='releases';
  render();window.scrollTo({top:0,behavior:'instant'});
  return;
 }
 if(e.target.closest('[data-v7-sidebar-toggle]')){
  e.preventDefault();e.stopImmediatePropagation();
  V7.compact=!V7.compact;
  render();
  return;
 }
 if(e.target.closest('[data-v7-tools]')){
  e.preventDefault();e.stopImmediatePropagation();openTools();return;
 }
 const go=e.target.closest('[data-v7-go]');
 if(!go)return;
 e.preventDefault();e.stopImmediatePropagation();
 const place=go.dataset.v7Go;
 closeOverlay();
 if(place==='submissions'){
  S.page='clips';render();
  if(S.user){document.querySelector('[data-v6-submissions]')?.click()}else authModal('login');
  return;
 }
 if(place==='security'){
  S.page='profile';render();
  document.querySelector('[data-v-tab="settings:security"]')?.click();
  return;
 }
 if(!['studio','wallet'].includes(place))return;
 S.page=place;render();
 if(S.user)refresh(true);
 window.scrollTo({top:0,behavior:'instant'});
},true);
})();
