import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const js=fs.readFileSync(path.join(root,'public/v7.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public/v7.css'),'utf8');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');

function boot(){
 const S={
  page:'discover',genre:'All',q:'',
  releases:[{id:'a',genre:'Trap'},{id:'b',genre:'Trap'},{id:'c',genre:'Drill'}],
  campaigns:[{id:'x'}],user:{id:'1',display_name:'Artist'}
 };
 const handlers={},output={overlay:''};
 const document={addEventListener(type,handler){(handlers[type]||=[]).push(handler)}};
 const shell='<div class="v-app-shell"><aside class="v-sidebar"><nav class="v-rail" aria-label="Desktop primary navigation"><button>Legacy</button></nav><div class="v-sidebar-bottom">Footer</div></aside><div class="v-workspace"><header><div class="v-top-left"><span>Home</span></div><div class="v-top-right"><button>Search</button></div></header><main>RENDER_BODY</main></div><nav class="v-bottom-nav" aria-label="Mobile primary navigation"><button>Mobile</button></nav></div>';
 const ctx={S,document,
  ico:(glyph)=>'<svg data-icon="'+glyph+'"></svg>',
  esc:x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
  releasesPage:()=>'<header>Find music</header><div class="x-toolbar"><div class="x-filter-tabs"><button data-genre="Trap">OLD</button></div><div class="x-sort"><select><option>Popular</option></select></div></div>',
  discover:()=>'<div class="v5-search-row">Search</div><section class="v-home-discover">Real featured music</section>',
  renderShell:()=>shell,render(){output.rendered=(output.rendered||0)+1},
  showOverlay(value){output.overlay=value},closeOverlay(){output.closed=true},
  refresh(){output.refreshed=true},authModal(){output.auth=true},
  window:{scrollTo(){output.scrolled=true}},
  };
 vm.createContext(ctx);vm.runInContext(js,ctx,{filename:'v7.js'});
 return {S,ctx,handlers,output};
}

test('V7 assets are linked and typography uses a consistent responsive system',()=>{
 assert.match(html,/\/v7\.css\?v=7\.0/);
 assert.match(html,/\/v7\.js\?v=7\.0/);
 assert.match(css,/Manrope/);
 assert.match(css,/Space\+Grotesk/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(css,/\.v7-genre-card/);
 assert.match(css,/\.v7-tools-modal/);
});
test('genre widgets use real counts and preserve search and sorting',()=>{
 const {ctx}=boot();
 let page=ctx.releasesPage();
 assert.match(page,/Find music/);
 assert.match(page,/Popular/);
 assert.doesNotMatch(page,/OLD/);
 assert.match(page,/Trap, 2 releases/);
 assert.match(page,/Drill, 1 release/); // accessible count is derived, never a guessed number
 assert.match(page,/Hip-Hop, 0 releases/);
 assert.equal((page.match(/data-v7-category=/g)||[]).length,7);
 const home=ctx.discover();
 assert.match(home,/Real featured music/);
 assert.match(home,/All sounds, 3 releases/);
});
test('one desktop rail, one mobile primary nav, real counts and working collapse toggle',()=>{
 const {ctx,handlers,output}=boot();
 const first=ctx.renderShell('CONTENT');
 assert.equal((first.match(/aria-label="Desktop primary navigation"/g)||[]).length,1);
 assert.equal((first.match(/aria-label="Mobile primary navigation"/g)||[]).length,1);
 assert.match(first,/Music library/);
 assert.match(first,/v7-side-number">3</);
 assert.match(first,/Open creator tools menu/);
 assert.doesNotMatch(first,/Legacy/);
 let cancelled=0;
 const click=(key,target)=>{
  const node={dataset:target,closest(sel){return sel===key?this:null}};
  handlers.click[0]({target:node,preventDefault(){cancelled++},stopImmediatePropagation(){}});
 };
 click('[data-v7-sidebar-toggle]',{});
 assert.match(ctx.renderShell('x'),/v7-nav-mini/);
 assert.ok(output.rendered);
 click('[data-v7-category]',{v7Category:'Drill'});
 assert.equal(ctx.S.page,'releases');
 assert.equal(ctx.S.genre,'Drill');
 assert.ok(output.scrolled);
 assert.ok(cancelled>=2);
});
test('mobile tools menu contains only secondary destinations and opens real routes',()=>{
 const {ctx,handlers,output}=boot();
 const el={dataset:{},closest(sel){return sel==='[data-v7-tools]'?this:null}};
 handlers.click[0]({target:el,preventDefault(){},stopImmediatePropagation(){}});
 assert.match(output.overlay,/Artist studio/);
 assert.match(output.overlay,/Rewards/);
 assert.match(output.overlay,/Account security/);
 assert.doesNotMatch(output.overlay,/data-v7-go="discover"/);
 assert.doesNotMatch(output.overlay,/data-v7-go="releases"/);
 const tool={dataset:{v7Go:'studio'},closest(sel){return sel==='[data-v7-go]'?this:null}};
 handlers.click[0]({target:tool,preventDefault(){},stopImmediatePropagation(){}});
 assert.equal(ctx.S.page,'studio');
 assert.ok(output.closed);
 assert.ok(output.refreshed);
});
