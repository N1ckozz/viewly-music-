/* VIEWLY V4 / Progressive motion enhancement. All navigation and payment flows work without it. */
(()=>{
'use strict';
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const coarse=matchMedia('(pointer: coarse)');
if(reduce.matches)return;
let ro=null,seen=new WeakSet(),raf=0;
function connect(){
 if(!('IntersectionObserver' in window))return;
 if(!ro)ro=new IntersectionObserver(entries=>{
   for(const entry of entries){
     if(entry.isIntersecting){
       entry.target.classList.add('v-in-view');
       ro.unobserve(entry.target);
     }
   }
 },{rootMargin:'0px 0px -24px 0px',threshold:0.08});
 for(const el of document.querySelectorAll('.v-campaign-card,.v-release,.v-kpi,.v-feature-layout,.v-featured-release')){
   if(seen.has(el))continue;seen.add(el);el.classList.add('v-reveal');ro.observe(el);
 }
}
const app=document.getElementById('app');
if(app&&'MutationObserver' in window){
 const mutation=new MutationObserver(()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;connect()})});
 mutation.observe(app,{childList:true,subtree:false});
}
connect();
// Subtle pointer-linked depth only on the single hero artwork, not operational widgets.
document.addEventListener('pointermove',e=>{
 if(coarse.matches||reduce.matches)return;
 const stage=e.target.closest('.v-feature-object');
 if(!stage)return;
 const rect=stage.getBoundingClientRect();
 const x=((e.clientX-rect.left)/Math.max(rect.width,1)-0.5)*3;
 const y=((e.clientY-rect.top)/Math.max(rect.height,1)-0.5)*-3;
 stage.style.setProperty('--v-tilt-x',y.toFixed(2)+'deg');
 stage.style.setProperty('--v-tilt-y',x.toFixed(2)+'deg');
},{passive:true});
document.addEventListener('pointerout',e=>{const stage=e.target.closest('.v-feature-object');if(stage&&!stage.contains(e.relatedTarget)){stage.style.removeProperty('--v-tilt-x');stage.style.removeProperty('--v-tilt-y')}},{passive:true});
})();
