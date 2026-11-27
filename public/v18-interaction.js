/* V18.1: prevent accidental copying of application chrome. This is UX, not DRM. */
(()=>{
'use strict';
const editable='input,textarea,[contenteditable]:not([contenteditable="false"])';
const copyable='[data-viewly-selectable]';
function element(n){return n?.nodeType===1?n:n?.parentElement;}
function editing(n){const e=element(n)?.closest(editable);return !!e&&(e.matches('input,textarea')||e.isContentEditable);}
function allowedRange(r){
 const a=element(r.startContainer)?.closest(copyable),b=element(r.endContainer)?.closest(copyable);
 return !!a&&a===b&&a.contains(r.commonAncestorContainer);
}
document.addEventListener('copy',e=>{
 if(editing(e.target)||editing(document.activeElement))return;
 const s=window.getSelection();
 if(s&&!s.isCollapsed&&s.rangeCount>0&&Array.from({length:s.rangeCount},(_,i)=>s.getRangeAt(i)).every(allowedRange))return;
 e.preventDefault();
},true);
document.addEventListener('cut',e=>{if(!editing(e.target)&&!editing(document.activeElement))e.preventDefault();},true);
// Paste, native link menus, downloads, programmatic share/copy and assistive technology remain untouched.
})();
