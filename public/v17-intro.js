/* VIEWLY V17 / self-contained WebGL cinematic. No external assets or tracking. */
(()=>{
'use strict';
const loader=document.getElementById('app-loader'),app=document.getElementById('app');
if(!loader||!app)return;
const canvas=loader.querySelector('canvas'),skip=loader.querySelector('[data-intro-skip]'),status=loader.querySelector('[data-intro-status]');
const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)');
const low=!!(navigator.connection?.saveData||reduce?.matches);
const start=performance.now(),minimum=low?0:3600;
let ready=false,skipped=false,ended=false,frame=0,delay=0,watchdog=0,dispose=()=>{},phase=-1;
const phases=['Introducing VIEWLY','VIEWLY','Music moves here'];
function fallbackTick(now){if(ended||skipped)return;const t=(now-start)/1000;const next=t<1.15?0:t<2.55?1:2;loader.dataset.phase=String(next);status.textContent=phases[next];if(!ended&&!skipped)frame=requestAnimationFrame(fallbackTick);}
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x)};
function finish(){
 if(ended||!ready)return;
 const remaining=skipped?0:minimum-(performance.now()-start);
 if(remaining>0){clearTimeout(delay);delay=setTimeout(finish,remaining);return;}
 ended=true;clearTimeout(delay);clearTimeout(watchdog);cancelAnimationFrame(frame);dispose();
 loader.dataset.phase='exit';loader.setAttribute('aria-busy','false');
 const hadFocus=loader.contains(document.activeElement);
 app.inert=false;document.documentElement.classList.remove('viewly-intro-active');
 const animate=!low&&!reduce?.matches;
 if(animate){
  app.classList.add('v17-reveal');
  loader.classList.add('v17-exit');
 }else loader.hidden=true;
 setTimeout(()=>{loader.remove();app.classList.remove('v17-reveal');if(hadFocus){const target=app.querySelector('main')||app;target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}},animate?1250:0);
}
function markReady(){
 ready=true;
 if(!app.firstElementChild){app.innerHTML='<section class="v17-recovery"><h1>Unable to connect to VIEWLY</h1><p>Check your connection and try again.</p><a href="/">Retry</a></section>';}
 loader.dataset.ready='true';finish();
}
window.ViewlyIntro={finish:markReady};
document.documentElement.classList.add('viewly-intro-active');app.inert=true;
skip?.addEventListener('click',()=>{skipped=true;loader.dataset.skipped='true';if(!ready){status.textContent='Connecting to VIEWLY…';cancelAnimationFrame(frame);dispose();loader.dataset.phase='waiting';}finish();});
watchdog=setTimeout(()=>{skipped=true;markReady();},15000);
if(low){loader.dataset.phase='waiting';status.textContent='Connecting to VIEWLY…';return;}
function cinematic(){
 const gl=canvas.getContext('webgl',{alpha:true,antialias:true,depth:true,powerPreference:'low-power',preserveDrawingBuffer:false});
 if(!gl)throw Error('WebGL unavailable');
 const buffers=[],shaders=[];let program;
 function shader(kind,source){const s=gl.createShader(kind);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('Intro shader failed: '+gl.getShaderInfoLog(s));return s;}
 try{
 program=gl.createProgram();
 gl.attachShader(program,shader(gl.VERTEX_SHADER,'precision mediump float;attribute vec3 aPos;attribute vec3 aNormal;uniform vec3 uRot,uOffset,uScale;uniform float uCamera,uAspect;varying vec3 vNormal,vWorld;vec3 rot(vec3 p){float a=cos(uRot.x),b=sin(uRot.x);p=vec3(p.x,a*p.y-b*p.z,b*p.y+a*p.z);a=cos(uRot.y);b=sin(uRot.y);p=vec3(a*p.x+b*p.z,p.y,-b*p.x+a*p.z);a=cos(uRot.z);b=sin(uRot.z);return vec3(a*p.x-b*p.y,b*p.x+a*p.y,p.z);}void main(){vec3 p=rot(aPos*uScale)+uOffset;vWorld=p;vNormal=rot(aNormal/max(uScale,vec3(.001)));float z=uCamera-p.z;gl_Position=vec4(p.x*2.45/uAspect,p.y*2.45,z*1.002-.202,z);}'));
 gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float;uniform vec3 uColor;uniform float uMetal,uGlow,uCamera,uTime;varying vec3 vNormal,vWorld;void main(){vec3 n=normalize(vNormal);vec3 v=normalize(vec3(0.,0.,uCamera)-vWorld);vec3 l=normalize(vec3(-.65,1.,1.2));vec3 r=normalize(vec3(.9,-.2,.6));float diffuse=max(0.,dot(n,l));float side=max(0.,dot(n,r));float spec=pow(max(0.,dot(n,normalize(l+v))),28.);float spec2=pow(max(0.,dot(n,normalize(r+v))),12.);float fres=pow(1.-max(0.,dot(n,v)),2.5);vec3 ref=reflect(-v,n);float band=(ref.y-.35)*4.;float stripe=exp(-band*band);float beam=vWorld.x+.32*vWorld.y-(uTime-.85)*2.;float sweep=exp(-beam*beam*7.);vec3 col=uColor*(.32+.62*diffuse+.19*side)+vec3(.91,.95,1.)*(spec*.65+fres*.20)+vec3(.79,.85,.94)*spec2*.24;col+=uMetal*(stripe*.17+fres*.15+sweep*.24)*vec3(.92,.96,1.);col=mix(col,uColor,uGlow);gl_FragColor=vec4(clamp(col,0.,1.),1.);}'));
 gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Intro shader link failed: '+gl.getProgramInfoLog(program));gl.useProgram(program);
 const A={p:gl.getAttribLocation(program,'aPos'),n:gl.getAttribLocation(program,'aNormal')};
 const U=Object.fromEntries(['Rot','Offset','Scale','Color','Camera','Aspect','Metal','Glow','Time'].map(k=>[k,gl.getUniformLocation(program,'u'+k)]));
 const vec=(k,x)=>gl.uniform3fv(U[k],x),scalar=(k,x)=>gl.uniform1f(U[k],x);
 function mesh(vertices){const b=gl.createBuffer();buffers.push(b);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);return {b,n:vertices.length/6};}
 const cross=(a,b,c)=>{const x=b.map((v,i)=>v-a[i]),y=c.map((v,i)=>v-a[i]);const n=[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]],l=Math.hypot(...n)||1;return n.map(v=>v/l)};
 function tri(out,a,b,c,n=cross(a,b,c)){for(const p of [a,b,c])out.push(...p,...n);}
 function quad(out,a,b,c,d){tri(out,a,b,c);tri(out,a,c,d);}
 // Seven-point concave V, with beveled front and rear rims and true extruded side faces.
 function extrude(poly,faces,depth){const out=[],rim=(p,z,s)=>[p[0]*s,p[1]*s,z],front=poly.map(p=>rim(p,depth/2,.93)),back=poly.map(p=>rim(p,-depth/2,.93)),f=poly.map(p=>rim(p,depth*.34,1)),b=poly.map(p=>rim(p,-depth*.34,1));
  for(const [i,j,k] of faces){tri(out,front[i],front[k],front[j],[0,0,1]);tri(out,back[i],back[j],back[k],[0,0,-1]);}
  for(let i=0;i<poly.length;i++){const j=(i+1)%poly.length;quad(out,f[j],f[i],front[i],front[j]);quad(out,b[j],b[i],f[i],f[j]);quad(out,back[j],back[i],b[i],b[j]);}return mesh(out);}
 const logo=extrude([[-1.4,1.22],[-.78,1.22],[0,-.57],[.78,1.22],[1.4,1.22],[.29,-1.24],[-.29,-1.24]],[[0,1,2],[0,2,6],[2,5,6],[2,3,4],[2,4,5]],.40);
 gl.enable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);
 function draw(m,pos,rot,scale,color,metal=.5,glow=0){gl.bindBuffer(gl.ARRAY_BUFFER,m.b);gl.enableVertexAttribArray(A.p);gl.enableVertexAttribArray(A.n);gl.vertexAttribPointer(A.p,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(A.n,3,gl.FLOAT,false,24,12);vec('Offset',pos);vec('Rot',rot);vec('Scale',scale);vec('Color',color);scalar('Metal',metal);scalar('Glow',glow);gl.drawArrays(gl.TRIANGLES,0,m.n);}
 const small=innerWidth<700||navigator.hardwareConcurrency<=4;
 function resize(){const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,small?1.15:1.6,Math.sqrt(1450000/Math.max(1,r.width*r.height)));const w=Math.max(1,Math.round(r.width*d)),h=Math.max(1,Math.round(r.height*d));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gl.viewport(0,0,w,h);scalar('Aspect',w/h);}
 let last=0;
 function tick(now){
  if(ended||skipped)return;
  frame=requestAnimationFrame(tick);if(document.hidden||now-last<1000/(small?30:60)-1)return;last=now;
  const t=(now-start)/1000,settle=ease(t/1.1);
  resize();gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  scalar('Camera',5.1+.7*(1-settle));scalar('Time',Math.min(t,3.6));
  draw(logo,[0,0,0],[-.16*(1-settle),-.84*(1-settle),-.09*(1-settle)],[1,1,1],[.64,.67,.71],.86);
  const next=t<1.15?0:t<2.55?1:2;
  if(next!==phase){phase=next;loader.dataset.phase=String(next);status.textContent=phases[next];}
 }
 dispose=()=>{cancelAnimationFrame(frame);for(const b of buffers)gl.deleteBuffer(b);for(const s of shaders)gl.deleteShader(s);if(program)gl.deleteProgram(program);};
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(frame);loader.dataset.renderer='css';frame=requestAnimationFrame(fallbackTick);},{once:true});
 loader.dataset.renderer='webgl';frame=requestAnimationFrame(tick);
 }catch(e){for(const b of buffers)gl.deleteBuffer(b);for(const s of shaders)gl.deleteShader(s);if(program)gl.deleteProgram(program);throw e;}
}
try{cinematic();}catch(error){console.warn('VIEWLY cinematic fallback:',error.message);loader.dataset.renderer='css';frame=requestAnimationFrame(fallbackTick);}
})();
