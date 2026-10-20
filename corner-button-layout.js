/* Assign stable classes to dynamically-created WebXR / 360 buttons and stack them. */
(()=>{'use strict';
const names=new Set(['🔄 360 VIEW','❌ EXIT','🥽 ENTER VR']);
let pending=false;
function update(){
 pending=false;
 const vpn=document.getElementById('gfd-vpn-widget-toggle');
 const history=document.getElementById('gfd-history-launch');
 const controls=[vpn,history].filter(Boolean);
 const vr=[...document.querySelectorAll('button')].filter(b=>names.has(b.textContent.trim())||b.classList.contains('gfd-corner-vr'));
 vr.forEach(b=>b.classList.add('gfd-corner-vr'));
 let offset=12;
 for(const b of [...controls,...vr]){
   if(!b.isConnected||getComputedStyle(b).display==='none')continue;
   b.style.setProperty('right','12px','important');
   b.style.setProperty('bottom',`calc(${offset}px + env(safe-area-inset-bottom))`,'important');
   offset+=Math.ceil(b.getBoundingClientRect().height||44)+10;
 }
 const panel=document.getElementById('gfd-pia-widget');
 if(panel){
   panel.style.setProperty('bottom',`calc(${offset}px + env(safe-area-inset-bottom))`,'important');
   panel.style.setProperty('max-height',`max(100px,calc(100dvh - ${offset+24}px))`,'important');
 }
}
function schedule(){if(pending)return;pending=true;requestAnimationFrame(update)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{update();observe()},{once:true});
else{update();observe()}
function observe(){
 const observer=new MutationObserver(records=>{if(records.some(r=>r.type==='childList'||r.type==='characterData'))schedule()});
 observer.observe(document.body,{childList:true,subtree:true,characterData:true});
 window.addEventListener('resize',schedule,{passive:true});
}
})();
