/* Automatic 3D image renderer for images already present in GoldFireDragonBrowser.html. */
(function(){
'use strict';
const source='https://cdn.jsdelivr.net/npm/three@0.181.2/build/three.module.js';
let threePromise;
const active=new WeakSet();
const pending=new WeakSet();
function loadThree(){return threePromise ||= import(source).catch(e=>{threePromise=null;throw e;});}
async function enhance(img){
 if(active.has(img)||pending.has(img)||img.closest('[data-gfd-3d-container]'))return;
 pending.add(img);
 if(!img.complete)await new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});});
 if(!img.isConnected||!img.naturalWidth||!img.naturalHeight){pending.delete(img);return;}
 let THREE,renderer,texture;
 try{
  THREE=await loadThree();
  if(!img.isConnected){pending.delete(img);return;}
  const ratio=img.naturalWidth/img.naturalHeight;
  const isPanorama=ratio>=1.9;
  const rect=img.getBoundingClientRect();
  if(rect.width<24||rect.height<24){pending.delete(img);return;}
  const holder=document.createElement('span');
  holder.dataset.gfd3dContainer='true';
  holder.style.cssText='display:inline-block;position:relative;vertical-align:middle;max-width:100%;overflow:hidden;';
  holder.style.width=rect.width+'px';holder.style.height=rect.height+'px';
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(75,rect.width/rect.height,.1,1100);
  renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.setSize(rect.width,rect.height);
  texture=await new THREE.TextureLoader().loadAsync(img.currentSrc||img.src);
  if(!img.isConnected){texture.dispose();renderer.dispose();pending.delete(img);return;}
  const geometry=isPanorama?new THREE.SphereGeometry(500,48,32):new THREE.PlaneGeometry(5*ratio,5);
  if(isPanorama)geometry.scale(-1,1,1);
  camera.position.z=isPanorama?0:Math.max(4,3.4*ratio);
  const material=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,transparent:true});
  const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);
  holder.appendChild(renderer.domElement);
  renderer.domElement.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  img.parentNode.insertBefore(holder,img);
  holder.appendChild(img);
  img.style.position='relative';img.style.opacity='0.02';
  active.add(img);pending.delete(img);
  let dragging=false,x=0,y=0,frame=0;
  holder.addEventListener('pointerdown',e=>{if(e.target.closest('a,button,input'))return;dragging=true;x=e.clientX;y=e.clientY;holder.setPointerCapture(e.pointerId);});
  holder.addEventListener('pointermove',e=>{if(!dragging)return;mesh.rotation.y+=(e.clientX-x)*.005;mesh.rotation.x+=(e.clientY-y)*.005;x=e.clientX;y=e.clientY;});
  holder.addEventListener('pointerup',()=>dragging=false);
  holder.addEventListener('pointercancel',()=>dragging=false);
  const observer=new ResizeObserver(()=>{const w=holder.clientWidth,h=holder.clientHeight;if(w&&h){camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);}});observer.observe(holder);
  function tick(){
   if(!holder.isConnected){observer.disconnect();geometry.dispose();material.dispose();texture.dispose();renderer.dispose();return;}
   frame=requestAnimationFrame(tick);
   if(!dragging)mesh.rotation.y+=(isPanorama?0.0008:0.002);
   renderer.render(scene,camera);
  }
  tick();
 }catch(err){
  console.warn('[GFD auto 3D] original image retained:',err);
  if(renderer)renderer.dispose();
  if(texture)texture.dispose();
  pending.delete(img);
  img.style.opacity='';img.style.position='';
 }
}
function scan(){document.querySelectorAll('img[src]:not([data-gfd-no-3d])').forEach(img=>{void enhance(img);});}
function start(){
 scan();
 const observer=new MutationObserver(scan);
 observer.observe(document.body,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
window.GFD3DEngine=Object.freeze({refresh:scan});
})();
