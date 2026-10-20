/* Automatic 3D image renderer for images already present in GoldFireDragonBrowser.html. */
(function(){
'use strict';
const source='https://cdn.jsdelivr.net/npm/three@0.181.2/build/three.module.js';
let threePromise;
const active=new WeakSet();
function loadThree(){return threePromise ||= import(source).catch(e=>{threePromise=null;throw e;});}
async function enhance(img){
 if(active.has(img)||img.closest('[data-gfd-3d-container]'))return;
 active.add(img);
 if(!img.complete)await new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});});
 if(!img.isConnected||!img.naturalWidth||!img.naturalHeight)return;
 let THREE,renderer,texture;
 try{
  THREE=await loadThree();
  if(!img.isConnected)return;
  const ratio=img.naturalWidth/img.naturalHeight;
  const isPanorama=ratio>=1.9;
  const rect=img.getBoundingClientRect();
  if(rect.width<24||rect.height<24)return;
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
  if(!img.isConnected){texture.dispose();renderer.dispose();return;}
  const geometry=isPanorama?new THREE.SphereGeometry(500,48,32):new THREE.PlaneGeometry(5*ratio,5);
  if(isPanorama)geometry.scale(-1,1,1);
  camera.position.z=isPanorama?0:Math.max(4,3.4*ratio);
  const material=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,transparent:true});
  const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);
  holder.appendChild(renderer.domElement);
  img.parentNode.insertBefore(holder,img);
  holder.appendChild(img);
  img.style.position='absolute';img.style.inset='0';img.style.opacity='0';img.style.pointerEvents='none';
  let dragging=false,x=0,y=0,frame=0;
  holder.addEventListener('pointerdown',e=>{dragging=true;x=e.clientX;y=e.clientY;holder.setPointerCapture(e.pointerId);});
  holder.addEventListener('pointermove',e=>{if(!dragging)return;mesh.rotation.y+=(e.clientX-x)*.005;mesh.rotation.x+=(e.clientY-y)*.005;x=e.clientX;y=e.clientY;});
  holder.addEventListener('pointerup',()=>dragging=false);
  holder.addEventListener('pointercancel',()=>dragging=false);
  const observer=new ResizeObserver(()=>{const w=holder.clientWidth,h=holder.clientHeight;if(w&&h){camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);}});observer.observe(holder);
  function tick(){
   if(!holder.isConnected){observer.disconnect();cancelAnimationFrame(frame);geometry.dispose();material.dispose();texture.dispose();renderer.dispose();return;}
   frame=requestAnimationFrame(tick);
   if(!dragging)mesh.rotation.y+=isPanorama?.0008:.002;
   renderer.render(scene,camera);
  }
  tick();
 }catch(err){
  console.warn('[GFD auto 3D] original image retained:',err);
  if(renderer)renderer.dispose();
  if(texture)texture.dispose();
  img.style.opacity='';img.style.position='';img.style.inset='';img.style.pointerEvents='';
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
