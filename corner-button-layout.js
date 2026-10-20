/* Stable dock for browser's bottom-right floating controls. */
(()=>{'use strict';
const known=['gfd-vpn-widget-toggle','gfd-history-launch'];
let scheduled=false;
const visible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};
function controls(){
 const w=innerWidth,h=innerHeight;
 return [...document.querySelectorAll('button,[role="button"],input[type="button"],a')].filter(el=>{
   if(el.closest('#gfd-pia-widget,#gfd-history-panel')||!visible(el))return false;
   if(known.includes(el.id)||el.dataset.gfdCornerDock==='yes')return true;
   const s=getComputedStyle(el),r=el.getBoundingClientRect();
   return s.position==='fixed'&&r.right>w*.6&&r.bottom>h*.55&&r.width<Math.min(w*.65,300)&&r.height<110;
 });
}
function layout(){
 scheduled=false;
 const items=controls();
 items.forEach(el=>{el.dataset.gfdCornerDock='yes'});
 items.sort((a,b)=>{const ai=known.indexOf(a.id),bi=known.indexOf(b.id);return (ai<0?100:ai)-(bi<0?100:bi)});
 let offset=12;
 for(const el of items){
   el.style.setProperty('right','12px','important');
   el.style.setProperty('left','auto','important');
   el.style.setProperty('bottom',`calc(${offset}px + env(safe-area-inset-bottom))`,'important');
   offset+=Math.ceil(el.getBoundingClientRect().height||44)+10;
 }
 const panel=document.getElementById('gfd-pia-widget');
 if(panel){
   panel.style.setProperty('bottom',`calc(${offset}px + env(safe-area-inset-bottom))`,'important');
   panel.style.setProperty('max-height',`max(80px,calc(100dvh - ${offset+24}px))`,'important');
 }
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(layout)}
function boot(){
 layout();
 const observer=new MutationObserver(records=>{if(records.some(r=>r.type==='childList'||r.type==='characterData'||(r.type==='attributes'&&['class','hidden'].includes(r.attributeName))))schedule()});
 observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','hidden']});
 addEventListener('resize',schedule,{passive:true});
 setInterval(schedule,1500);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
