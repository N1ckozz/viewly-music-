/* VIEWLY V6 motion — progressive enhancements only. App still works if this script fails. */
(()=>{
'use strict';
if(!window.matchMedia||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
const coarse=window.matchMedia('(pointer: coarse)').matches;
const selectors='.v6-btn,.v-button,.primary,.secondary,.outline,.v-action,.v-card-cta,.v5-search-bar,.v6-campaign-card,.v-bottom-nav .v-nav';
let lastElement=null,lastX=0,lastY=0,raf=0;
if(!coarse)document.addEventListener('pointermove',e=>{
 const target=e.target.closest(selectors);
 if(!target)return;
 lastElement=target;lastX=e.clientX;lastY=e.clientY;
 if(raf)return;
 raf=requestAnimationFrame(()=>{
  raf=0;if(!lastElement||!lastElement.isConnected)return;
  const r=lastElement.getBoundingClientRect();
  if(!r.width||!r.height)return;
  lastElement.style.setProperty('--v6-x',((lastX-r.left)/r.width*100).toFixed(1)+'%');
  lastElement.style.setProperty('--v6-y',((lastY-r.top)/r.height*100).toFixed(1)+'%');
 });
},{passive:true});
// Button ripples removed: native taps stay clean.
let pend=false;
const app=document.querySelector('#app');
if(app&&'MutationObserver'in window){
 const observer=new MutationObserver(()=>{
  if(pend)return;pend=true;
  requestAnimationFrame(()=>{
   pend=false;
   const targets=app.querySelectorAll('.v6-clip-summary,.v6-main-tabs,.v6-discover-controls');
   for(const node of targets){if(node.dataset.v6Motion)return;node.dataset.v6Motion='1';node.classList.add('v6-animate-in');}
  });
 });
 observer.observe(app,{childList:true,subtree:false});
}
})();
