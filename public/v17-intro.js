/* VIEWLY V17 / self-contained WebGL cinematic. No external assets or tracking. */
(()=>{
'use strict';
const loader=document.getElementById('app-loader'),app=document.getElementById('app');
if(!loader||!app)return;
const canvas=loader.querySelector('canvas'),skip=loader.querySelector('[data-intro-skip]'),status=loader.querySelector('[data-intro-status]');
const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)');
const low=!!(navigator.connection?.saveData||reduce?.matches);
const start=performance.now(),minimum=low?0:4400;
let ready=false,skipped=false,ended=false,frame=0,delay=0,watchdog=0,dispose=()=>{},phase=-1;
const phases=['Sound in motion','Made for creators','Music moves here'];
function fallbackTick(now){if(ended||skipped)return;const t=(now-start)/1000;const next=t<1.4?0:t<3?1:2;loader.dataset.phase=String(next);status.textContent=phases[next];if(!ended&&!skipped)frame=requestAnimationFrame(fallbackTick);}
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
 const gl=canvas.getContext('webgl',{alpha:false,antialias:true,depth:true,powerPreference:'low-power',preserveDrawingBuffer:false});
 if(!gl)throw Error('WebGL unavailable');
 const objects=[],buffers=[],shaders=[];let program;
 function shader(kind,source){const s=gl.createShader(kind);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('Intro shader failed: '+gl.getShaderInfoLog(s));return s;}
 try{
 program=gl.createProgram();
 gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec3 aPos;attribute vec3 aNormal;uniform vec3 uRot,uOffset,uScale;uniform float uCamera,uAspect;varying vec3 vNormal,vWorld;vec3 rot(vec3 p){float a=cos(uRot.x),b=sin(uRot.x);p=vec3(p.x,a*p.y-b*p.z,b*p.y+a*p.z);a=cos(uRot.y);b=sin(uRot.y);p=vec3(a*p.x+b*p.z,p.y,-b*p.x+a*p.z);a=cos(uRot.z);b=sin(uRot.z);return vec3(a*p.x-b*p.y,b*p.x+a*p.y,p.z);}void main(){vec3 p=rot(aPos*uScale)+uOffset;vWorld=p;vNormal=rot(aNormal/max(uScale,vec3(.001)));float z=uCamera-p.z;gl_Position=vec4(p.x*2.45/uAspect,p.y*2.45,z*1.002-.202,z);}'));
 gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float;uniform vec3 uColor;uniform float uMetal,uGlow,uCamera;varying vec3 vNormal,vWorld;void main(){vec3 n=normalize(vNormal);vec3 v=normalize(vec3(0.,0.,uCamera)-vWorld);vec3 l=normalize(vec3(-.65,1.,1.2));vec3 r=normalize(vec3(.9,-.2,.6));float diffuse=max(0.,dot(n,l));float side=max(0.,dot(n,r));float spec=pow(max(0.,dot(n,normalize(l+v))),28.);float spec2=pow(max(0.,dot(n,normalize(r+v))),12.);float fres=pow(1.-max(0.,dot(n,v)),2.5);vec3 ref=reflect(-v,n);float stripe=exp(-pow((ref.y-.35)*4.,2.));vec3 col=uColor*(.21+.72*diffuse+.24*side)+vec3(.50,.72,1.)*(spec*.95+fres*.28)+vec3(.75,.48,1.)*spec2*.35;col+=uMetal*(stripe*.38+fres*.21)*vec3(.65,.82,1.);col=mix(col,uColor,uGlow);gl_FragColor=vec4(clamp(col,0.,1.),1.);}'));
 gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Intro shader link failed: '+gl.getProgramInfoLog(program));gl.useProgram(program);
 const A={p:gl.getAttribLocation(program,'aPos'),n:gl.getAttribLocation(program,'aNormal')};
 const U=Object.fromEntries(['Rot','Offset','Scale','Color','Camera','Aspect','Metal','Glow'].map(k=>[k,gl.getUniformLocation(program,'u'+k)]));
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
 const dot=extrude([[-.31,.22],[-.22,.31],[.22,.31],[.31,.22],[.31,-.22],[.22,-.31],[-.22,-.31],[-.31,-.22]],[[0,1,2],[0,2,3],[0,3,4],[0,4,5],[0,5,6],[0,6,7]],.33);
 const cube=extrude([[-.5,.5],[.5,.5],[.5,-.5],[-.5,-.5]],[[0,1,2],[0,2,3]],1);
 function torus(radius,tube,segments=72,sides=8){const out=[];const v=(i,j)=>{const a=2*Math.PI*i/segments,b=2*Math.PI*j/sides;return {p:[(radius+tube*Math.cos(b))*Math.cos(a),(radius+tube*Math.cos(b))*Math.sin(a),tube*Math.sin(b)],n:[Math.cos(b)*Math.cos(a),Math.cos(b)*Math.sin(a),Math.sin(b)]}};for(let i=0;i<segments;i++)for(let j=0;j<sides;j++){const p=[v(i,j),v(i+1,j),v(i+1,j+1),v(i,j+1)];for(const k of [0,1,2,0,2,3])out.push(...p[k].p,...p[k].n);}return mesh(out);}
 const ring=torus(2.05,.018),ring2=torus(2.48,.011),ring3=torus(1.68,.012);
 gl.enable(gl.DEPTH_TEST);gl.clearColor(.018,.027,.052,1);
 function draw(m,pos,rot,scale,color,metal=.5,glow=0){gl.bindBuffer(gl.ARRAY_BUFFER,m.b);gl.enableVertexAttribArray(A.p);gl.enableVertexAttribArray(A.n);gl.vertexAttribPointer(A.p,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(A.n,3,gl.FLOAT,false,24,12);vec('Offset',pos);vec('Rot',rot);vec('Scale',scale);vec('Color',color);scalar('Metal',metal);scalar('Glow',glow);gl.drawArrays(gl.TRIANGLES,0,m.n);}
 let seed=173;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 const small=innerWidth<700||navigator.hardwareConcurrency<=4;
 for(let i=0;i<(small?28:65);i++)objects.push([rand()*Math.PI*2,1.9+rand()*3.7,(rand()-.5)*4,.018+rand()*.045,rand()]);
 function resize(){const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,small?1.15:1.6,Math.sqrt(1450000/Math.max(1,r.width*r.height)));const w=Math.max(1,Math.round(r.width*d)),h=Math.max(1,Math.round(r.height*d));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gl.viewport(0,0,w,h);scalar('Aspect',w/h);}
 let last=0;
 function tick(now){
  if(ended||skipped)return;
  frame=requestAnimationFrame(tick);if(document.hidden||now-last<1000/(small?30:60)-1)return;last=now;
  const t=(now-start)/1000,assemble=ease((t-.18)/1.65),lock=ease((t-1.7)/1.55),pull=ease((t-3.25)/1.1);
  const aspect=canvas.clientWidth/Math.max(1,canvas.clientHeight);
  resize();gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  scalar('Camera',(aspect<1?10.4:7.4)+2.6*(1-assemble)+pull*.8);
  const yaw=(1-assemble)*2.1+Math.sin(t*.82)*.16*(1-lock),pitch=-.45*(1-assemble)+.12*Math.cos(t*.7)*(1-lock);
  for(const [a,r,z,size,s] of objects){const ang=a+t*(.13+s*.08);const radius=r+(1-assemble)*1.1;draw(cube,[Math.cos(ang)*radius,Math.sin(ang)*radius*.62,z-2],[t*.5+s,a+t*.3,s*3],[size,size,size],[.14+s*.25,.26+s*.29,.48+s*.45],.2,.24);}
  const ringFade=.55+lock*.22;
  draw(ring,[0,.05,-.2],[.8+t*.19,.35-t*.18,t*.2],[1,1,1],[.23*ringFade,.48*ringFade,.92*ringFade],.6,.32);
  draw(ring2,[0,0,-.55],[1.06,-.45+t*.16,-t*.25],[1,1,1],[.28,.24,.58],.5,.3);
  draw(ring3,[0,0,-.9],[-.5,.5,t*.25],[1,1,1],[.12,.39,.48],.3,.35);
  for(let i=0;i<(small?18:32);i++){const n=small?18:32,x=(i-(n-1)/2)*.22,h=.09+.48*Math.pow(Math.abs(Math.sin(i*.72+t*2.6)*Math.sin(i*.28-t*.8)),2);draw(cube,[x,-1.75+h/2,-1.7],[0,0,0],[.095,h,.10],[.13,.25,.48],.35,.12);}
  const offset=(1-assemble)*2.4;
  draw(logo,[-.25-offset,.10,0],[pitch,yaw,(1-assemble)*-.45],[1,1,1],[.47,.63,.91],1);
  draw(dot,[1.45+offset,-.80+offset*.35,.10],[pitch,yaw,(1-assemble)*1.3],[.75,.75,.75],[.20,.46,1.0],.95);
  const next=t<1.4?0:t<3?1:2;
  if(next!==phase){phase=next;loader.dataset.phase=String(next);status.textContent=phases[next];}
 }
 dispose=()=>{cancelAnimationFrame(frame);for(const b of buffers)gl.deleteBuffer(b);for(const s of shaders)gl.deleteShader(s);if(program)gl.deleteProgram(program);};
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(frame);loader.dataset.renderer='css';frame=requestAnimationFrame(fallbackTick);},{once:true});
 loader.dataset.renderer='webgl';frame=requestAnimationFrame(tick);
 }catch(e){for(const b of buffers)gl.deleteBuffer(b);for(const s of shaders)gl.deleteShader(s);if(program)gl.deleteProgram(program);throw e;}
}
try{cinematic();}catch(error){console.warn('VIEWLY cinematic fallback:',error.message);loader.dataset.renderer='css';frame=requestAnimationFrame(fallbackTick);}
})();
