import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../public/'+p,import.meta.url),'utf8');
const v5=read('v5.js'), v7=read('v7.js');
function boot(saved='0'){
 const storage=new Map([['viewly.navigation.hidden',saved]]);
 const cls=new Set(), attrs=new Map(), railAttrs=new Map();
 const shell={classList:{toggle:(name,state)=>state?cls.add(name):cls.delete(name)}};
 const toggle={setAttribute:(k,v)=>attrs.set(k,v)};
 const rail={setAttribute:(k,v)=>railAttrs.set(k,v)};
 let click, renders=0;
 const ctx=vm.createContext({
  S:{page:'discover',user:null,releases:[],campaigns:[]},
  ico:()=>'<svg></svg>',esc:s=>String(s),releasesPage:()=>'',discover:()=>'',renderShell:()=>'',render:()=>renders++,
  localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
  document:{addEventListener:(event,fn)=>{if(event==='click')click=fn},querySelector:s=>({'.v-app-shell':shell,'[data-v7-sidebar-toggle]':toggle,'#viewly-desktop-navigation':rail})[s]}
 });
 const end=v5.indexOf('releaseCard=function');
 assert.ok(end>0);
 vm.runInContext(v5.slice(0,end)+'})();',ctx);
 vm.runInContext(v7,ctx);
 return {html:()=>ctx.renderShell('<section>Content</section>'),toggle:()=>click({target:{closest:s=>s==='[data-v7-sidebar-toggle]'?toggle:null},preventDefault(){},stopImmediatePropagation(){}}),storage,cls,attrs,rail,railAttrs,renders:()=>renders};
}
test('V12 places a single shared header outside workspace and preserves both navs',()=>{
 const b=boot(),html=b.html();
 assert.match(html,/^<div class="v-app-shell[^"]*"><header class="v-topbar">/);
 assert.equal((html.match(/class="v-topbar"/g)||[]).length,1);
 assert.match(html,/aria-controls="viewly-desktop-navigation"/);
 assert.match(html,/id="viewly-desktop-navigation" aria-hidden="false"/);
 assert.match(html,/aria-expanded="true"/);
 assert.match(html,/class="v-bottom-nav"/);
 assert.match(html,/data-page="connections"/);
 assert.match(html,/<section>Content<\/section>/);
});
test('V12 hides rail without a full app render and restores preference',()=>{
 const b=boot();
 b.toggle();
 assert.ok(b.cls.has('v7-nav-mini'));
 assert.equal(b.attrs.get('aria-expanded'),'false');
 assert.equal(b.railAttrs.get('aria-hidden'),'true');
 assert.equal(b.rail.inert,true);
 assert.equal(b.storage.get('viewly.navigation.hidden'),'1');
 assert.equal(b.renders(),0);
 assert.match(boot('1').html(),/aria-hidden="true" inert/);
 b.toggle();
 assert.equal(b.cls.has('v7-nav-mini'),false);
 assert.equal(b.attrs.get('aria-expanded'),'true');
 assert.equal(b.rail.inert,false);
 assert.equal(b.storage.get('viewly.navigation.hidden'),'0');
});
