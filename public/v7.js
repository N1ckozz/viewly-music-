/* VIEWLY V7 — editorial typography, real genre shelves, one clear navigation system.
   Enhances current server-backed UI without changing API routes or inventing content. */
(()=>{
'use strict';
const V7={compact:false};
try{V7.compact=localStorage.getItem('viewly.navigation.hidden')==='1'}catch{}
const railIcon='<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/><path class="v12-toggle-arrow" d="m17 9-3 3 3 3"/></svg>';
function syncRail(){
 if(typeof document.querySelector!=='function')return false;
 const shell=document.querySelector('.v-app-shell');
 const toggle=document.querySelector('[data-v7-sidebar-toggle]');
 const rail=document.querySelector('#viewly-desktop-navigation');
 if(!shell||!toggle||!rail)return false;
 shell.classList.toggle('v7-nav-mini',V7.compact);
 toggle.setAttribute('aria-expanded',String(!V7.compact));
 toggle.setAttribute('aria-label',V7.compact?'Show navigation':'Hide navigation');
 toggle.title=V7.compact?'Show navigation':'Hide navigation';
 rail.inert=V7.compact;
 rail.setAttribute('aria-hidden',String(V7.compact));
 return true;
}
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
 html=html.replace('class="v-app-shell"','class="v-app-shell v7-app v16-left-nav'+(V7.compact?' v7-nav-mini':'')+'"');
 const newRail='<nav class="v-rail" aria-label="Desktop primary navigation">'+
  sideGroup('DISCOVER',[['discover','Home','discover'],['releases','Music library','releases',S.releases.length],['campaigns','Campaigns','campaigns',S.campaigns.length]])+
  sideGroup('YOUR WORKSPACE',[['clips','Clip studio','scissors'],['studio','Artist tools','studio'],['wallet','Rewards','wallet'],['connections','Social accounts','user']])+
  '</nav>';
 const navMatch=/<nav class="v-rail" aria-label="Desktop primary navigation">[\s\S]*?<\/nav>/;
 if(!navMatch.test(html))throw Error('Navigation layout unavailable');
 html=html.replace(navMatch,()=>newRail);
 // Desktop user entry is already in the top bar. Mobile primary tabs remain in the existing five-button dock.
 const topStart='<div class="v-top-left">';
 const desktopToggle='<button type="button" class="v7-sidebar-toggle" data-v7-sidebar-toggle aria-controls="viewly-desktop-navigation" aria-label="'+(V7.compact?'Show navigation':'Hide navigation')+'" title="'+(V7.compact?'Show navigation':'Hide navigation')+'" aria-expanded="'+(!V7.compact)+'">'+railIcon+'</button>';
 html=html.replace('<aside class="v-sidebar">','<aside class="v-sidebar" id="viewly-desktop-navigation" aria-hidden="'+V7.compact+'"'+(V7.compact?' inert':'')+'>');
 const logo=html.match(/<a href="\/" data-page="discover" aria-label="Viewly home" class="v-logo">[\s\S]*?<\/a>/);
 if(logo){
  html=html.replace(logo[0],'<div class="v12-rail-heading"><span>WORKSPACE</span><b>Navigation</b></div>');
  html=html.replace(topStart,topStart+logo[0]);
 }
 html=html.replace(topStart,topStart+desktopToggle);
 const mobileMenu='<button type="button" class="v7-tools-trigger" data-v7-tools aria-label="Open creator tools menu" aria-haspopup="dialog">'+
  railIcon+'</button>';
 html=html.replace(topStart,topStart+mobileMenu);
 const endMarker='<div class="v-sidebar-bottom">';
 const sidebarFooter='<div class="v7-sidebar-footer"><span class="v7-sidebar-marker">V.</span><span><b>MADE FOR SOUND.</b><small>Artists. Clips. Culture.</small></span></div>';
 html=html.replace(endMarker,endMarker+sidebarFooter);
 // The header spans the content and left rail; it is no longer nested in the content column.
 const header=html.match(/<header class="v-topbar">[\s\S]*?<\/header>/);
 if(header){
  html=html.replace(header[0],'');
  html=html.replace(/^(<div class="v-app-shell[^"]*">)/,'$1'+header[0]);
 }
 return html;
};
const tools=[
 {page:'feed',icon:'play',title:'Music feed',desc:'Discover published artist videos'},
 {page:'leaderboard',icon:'bolt',title:'Clipper rankings',desc:'Opt-in approved clip rankings'},
 {page:'community',icon:'user',title:'Community',desc:'Public music discussions'},
 {page:'saved',icon:'heart',title:'Saved library',desc:'Watchlists and saved music'},
 {page:'notifications',icon:'bell',title:'Notifications',desc:'Campaign invitations and reviews'},
 {page:'studio',icon:'studio',title:'Artist studio',desc:'Releases and campaign drafts'},
 {page:'analytics',icon:'campaigns',title:'Creator analytics',desc:'Real charts, TikTok views, spending and clipper performance'},
 {page:'wallet',icon:'wallet',title:'Rewards',desc:'Real earnings and activity'},
 {page:'connections',icon:'user',title:'Connected accounts',desc:'Link TikTok for verified clip ownership and Spotify'},
 {page:'plans',icon:'bolt',title:'Plans & pricing',desc:'Monthly and yearly plans · free test mode'},
 {action:'submissions',icon:'campaigns',title:'My submissions',desc:'Track campaign reviews'},
 {action:'security',icon:'shield',title:'Account security',desc:'Sessions and authenticator'}
];
function openTools(){
 const opts=[...tools,...(S.user?.role==='admin'?[{page:'admin',icon:'shield',title:'Admin control center',desc:'Real platform management'}]:[])].map(t=>'<button class="v7-tool-item" type="button" data-v7-go="'+esc(t.page||t.action)+'">'+
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
  try{localStorage.setItem('viewly.navigation.hidden',V7.compact?'1':'0')}catch{}
  if(!syncRail())render();
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
 if(!['studio','wallet','admin','plans','connections','analytics','feed','leaderboard','community','saved','notifications'].includes(place))return;
 S.page=place;render();
 if(S.user)refresh(true);
 window.scrollTo({top:0,behavior:'instant'});
},true);
})();
