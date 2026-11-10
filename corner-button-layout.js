/* Preserve every floating corner button. Reposition; never remove or hide controls. */
(()=>{'use strict';
const known=['gfd-vpn-widget-toggle','gfd-history-launch'];
const docked=new Set();
let scheduled=false;
const visible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};
function candidates(){
 const w=innerWidth,h=innerHeight;
 return [...document.querySelectorAll('button,[role="button"],input[type="button"],a')].filter(el=>{
  if(el.closest('#gfd-pia-widget,#gfd-history-panel')||!visible(el))return false;
  if(known.includes(el.id)||docked.has(el))return true;
  const s=getComputedStyle(el),r=el.getBoundingClientRect();
  return s.position==='fixed'&&r.right>w*.55&&r.bottom>h*.55&&r.width<Math.min(w*.65,300)&&r.height<110;
 });
}
function layout(){
 scheduled=false;
 const items=candidates();
 items.sort((a,b)=>{const ai=known.indexOf(a.id),bi=known.indexOf(b.id);return (ai<0?100:ai)-(bi<0?100:bi)});
 const gap=10,margin=12,available=Math.max(100,innerHeight-margin*2);
 let x=margin,y=margin,columnWidth=0;
 for(const el of items){
  docked.add(el);
  const rect=el.getBoundingClientRect(),width=Math.ceil(rect.width||100),height=Math.ceil(rect.height||44);
  if(y>margin&&y+height>available){x+=columnWidth+gap;y=margin;columnWidth=0;}
  el.style.setProperty('position','fixed','important');
  el.style.setProperty('right',x+'px','important');
  el.style.setProperty('left','auto','important');
  el.style.setProperty('bottom','calc('+y+'px + env(safe-area-inset-bottom))','important');
  el.style.setProperty('visibility','visible','important');
  columnWidth=Math.max(columnWidth,width);
  y+=height+gap;
 }
 const panel=document.getElementById('gfd-pia-widget');
 if(panel){
  panel.style.setProperty('right',Math.max(margin,x+columnWidth+gap)+'px','important');
  panel.style.setProperty('bottom','calc(12px + env(safe-area-inset-bottom))','important');
  panel.style.setProperty('max-height','calc(100dvh - 24px)','important');
 }
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(layout)}
function boot(){
 layout();
 const observer=new MutationObserver(records=>{if(records.some(r=>r.type==='childList'||(r.type==='attributes'&&['class','hidden'].includes(r.attributeName))))schedule()});
 observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden']});
 addEventListener('resize',schedule,{passive:true});
 setInterval(schedule,1500);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
