import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const script=fs.readFileSync(path.join(root,'public','experience.js'),'utf8');

test('Viewly Experience renders real-data states and switches navigation and tabs',()=>{
 const events={};
 const S={page:'studio',user:{id:'u1',role:'artist',display_name:'Artist'},stats:{releases:0,plays:0,clips:0,campaigns:0},config:{},releases:[],campaigns:[],myCampaigns:[],myClips:[],wallet:{entries:[],earned_cents:0,available_to_withdraw_cents:0},q:'',genre:'All'};
 const document={addEventListener(n,f){(events[n]??=[]).push(f)},querySelector(){return null},createElement(){return {innerHTML:'',querySelector(){return null}}},body:{append(){}},title:''};
 const ctx={document,S,URL,URLSearchParams,window:{scrollTo(){}},location:{search:'',origin:'https://viewly.example'},navigator:{},ico:()=>'<svg/>',esc:x=>String(x||''),eur:c=>'€'+c/100,date:x=>String(x),
  isCreator:()=>['artist','label','admin'].includes(S.user?.role),
  renderShell:x=>'<main class="main" id="main-content">'+x+'</main>',render(){},refresh:async()=>{},
  discover:()=>'<section class="stage-intro"></section>',releasesPage:()=>'',campaignsPage:()=>'',studioPage:()=>'',clipsPage:()=>'',walletPage:()=>'',clipEditor:()=>'',releaseCard:()=>'<article><div><div class="card-footer"></div></div></article>',campaignCard:()=>'<article></article>',authModal(){},gate:x=>'<div>'+x+'</div>',showOverlay(){},toast(){},playModal(){},section:(h,s,c)=>'<section><h2>'+h+'</h2>'+c+'</section>'
 };
 vm.createContext(ctx);vm.runInContext(script,ctx,{filename:'experience.js'});
 const click=(selector,val)=>{
  const target={dataset:{},closest(s){return s===selector?this:null}};
  if(selector==='[data-ux-tab]')target.dataset.uxTab=val;
  else if(selector==='[data-ux-nav]')target.dataset.uxNav=val;
  const ev={target,preventDefault(){},stopPropagation(){}};
  for(const handler of events.click||[])handler(ev);
 };
 assert.match(ctx.renderShell('body'),/x-quickbar/,'quick search exists');
 const before=ctx.studioPage();assert.match(before,/Your releases/);
 click('[data-ux-tab]','studio:campaigns');assert.doesNotMatch(ctx.studioPage(),/Your releases/);
 click('[data-ux-nav]','clips');assert.equal(S.page,'clips');
 click('[data-ux-tab]','clips:source');assert.match(ctx.clipsPage(),/Waiting for the first artist/);
 click('[data-ux-tab]','campaigns:mine');assert.match(ctx.campaignsPage(),/Your campaign desk is empty/);
 click('[data-ux-tab]','wallet:history');assert.match(ctx.walletPage(),/No reward events recorded/);
 S.user=null;assert.match(ctx.walletPage(),/Reward ledger/,'guest is gated');
});
