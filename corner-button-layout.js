/* Bottom-right collision manager for fixed browser controls. */
(()=>{'use strict';
const known=new Set(['gfd-vpn-widget-toggle','gfd-history-launch']);
const excluded=new Set(['gfd-pia-widget','gfd-history-panel']);
let pending=false, lastSignature='';
const visible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};
function candidates(){
 const w=innerWidth,h=innerHeight;
 return [...document.querySelectorAll('button,[role="button"],input[type="button"],a')].filter(el=>{
   if(excluded.has(el.id)||el.closest('#gfd-pia-widget,#gfd-history-panel'))return false;
   if(!visible(el))return false;
   const s=getComputedStyle(el),r=el.getBoundingClientRect();
   if(known.has(el.id))return true;
   if(s.position!=='fixed')return false;
   // Only corner controls, never the main toolbar, overlays or page-wide buttons.
   return r.right>w*.58&&r.bottom>h*.55&&r.width<Math.min(w*.65,300)&&r.height<110;
 });
}
function update(){
 pending=false;
 const items=candidates();
 items.sort((a,b)=>(known.has(a.id)?-1:0)-(known.has(b.id)?-1:0)||a.id.localeCompare(b.id));
 let offset=12;
 for(const el of items){
   el.style.setProperty('right','12px','important');
   el.style.setProperty('bottom',`calc(${offset}px + env(safe-area-inset-bottom))`,'important');
   el.style.setProperty('left','auto','important');
   offset+=Math.ceil(el.getBoundingClientRect().height||44)+10;
 }
 const panel=document.getElementById('gfd-pia-widget');
 if(panel){
   panel.style.setProperty('bottom',`calc(${offset}px + env(safe-area-inset-bottom))`,'important');
   panel.style.setProperty('max-height',`max(80px,calc(100dvh - ${offset+20}px))`,'important');
 }
 lastSignature=items.map(el=>el.id||el.textContent.trim().slice(0,30)).join('|');
}
function schedule(){if(pending)return;pending=true;requestAnimationFrame(update)}
function boot(){
 update();
 const observer=new MutationObserver(records=>{
   if(records.some(r=>r.type==='childList'||r.type==='characterData'||(r.type==='attributes'&&r.attributeName==='class')))schedule();
 });
 observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','hidden']});
 addEventListener('resize',schedule,{passive:true});
 // Catch controls injected by third-party scripts after initial load.
 setInterval(()=>{const sig=candidates().map(el=>el.id||el.textContent.trim().slice(0,30)).join('|');if(sig!==lastSignature)schedule()},1500);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
