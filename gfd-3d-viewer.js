/* GoldFireDragon automatic image 3D/panorama enhancement.
   No extra button. Original image stays visible if rendering fails. */
(function(){
'use strict';
const active=new WeakSet();
let threePromise;
const loadThree=()=>threePromise ||= import('https://cdn.jsdelivr.net/npm/three@0.181.2/build/three.module.js').catch(e=>{threePromise=null;throw e;});
const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
let running=0;
const LIMIT=3;
const observer=new IntersectionObserver(entries=>{
 for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);void enhance(entry.target);}
},{rootMargin:'180px'});
function eligible(img){
 if(active.has(img)||!img.isConnected||!img.complete||!img.naturalWidth)return false;
 if(img.closest('button,a,nav,header,footer,[role="button"],[data-no-3d],#gfd-pia-widget'))return false;
 if(img.naturalWidth<320||img.naturalHeight<160||img.clientWidth<240||img.clientHeight<120)return false;
 return true;
}
async function enhance(img){
 if(!eligible(img)||running>=LIMIT)return;
 active.add(img);running++;
 let renderer,texture,mesh,resize,frame,wrapper,scene,camera,visible=true;
 try{
  const THREE=await loadThree();
  if(!img.isConnected)return;
  wrapper=document.createElement('span');
  wrapper.className='gfd-auto-3d';
  wrapper.style.cssText='display:inline-block;position:relative;vertical-align:middle;max-width:100%;width:'+img.clientWidth+'px;height:'+img.clientHeight+'px;';
  const parent=img.parentNode;
  parent.insertBefore(wrapper,img);wrapper.appendChild(img);
  img.style.width='100%';img.style.height='100%';img.style.objectFit='contain';
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(70,1,0.1,1100);
  renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  const canvas=renderer.domElement;
  canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;touch-action:pan-y;cursor:grab;';
  wrapper.appendChild(canvas);
  const url=img.currentSrc||img.src;
  texture=await new THREE.TextureLoader().loadAsync(url);
  if(!wrapper.isConnected)return;
  const panoramic=texture.image.width/texture.image.height>=1.9;
  const geometry=panoramic?new THREE.SphereGeometry(500,48,32):new THREE.PlaneGeometry(5*texture.image.width/texture.image.height,5);
  if(panoramic)geometry.scale(-1,1,1);
  camera.position.z=panoramic?0:Math.max(6,3*texture.image.width/texture.image.height);
  mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
  scene.add(mesh);
  const size=()=>{const w=wrapper.clientWidth,h=wrapper.clientHeight;if(w&&h){camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);}};
  resize=new ResizeObserver(size);resize.observe(wrapper);size();
  let dragging=false,lastX=0,lastY=0;
  canvas.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!dragging)return;mesh.rotation.y+=(e.clientX-lastX)*0.004;mesh.rotation.x+=(e.clientY-lastY)*0.004;lastX=e.clientX;lastY=e.clientY;});
  canvas.addEventListener('pointerup',()=>dragging=false);
  canvas.addEventListener('pointercancel',()=>dragging=false);
  const render=()=>{if(!wrapper.isConnected){cleanup();return;}frame=requestAnimationFrame(render);if(!dragging&&!reduceMotion&&!panoramic)mesh.rotation.y+=0.001;renderer.render(scene,camera);};
  function cleanup(){cancelAnimationFrame(frame);resize?.disconnect();mesh?.geometry.dispose();mesh?.material.dispose();texture?.dispose();renderer?.dispose();}
  img.style.visibility='hidden';
  render();
 }catch(err){
  console.warn('[GFD auto 3D] original image preserved:',err);
  if(img)img.style.visibility='';
  if(wrapper?.isConnected){wrapper.parentNode.insertBefore(img,wrapper);wrapper.remove();}
  resize?.disconnect();if(mesh){mesh.geometry.dispose();mesh.material.dispose();}texture?.dispose();renderer?.dispose();
 }finally{running--;}
}
function scan(root=document){
 const images=root.querySelectorAll?.('img')||[];
 for(const img of images)if(!active.has(img)){
  if(img.complete){if(eligible(img))observer.observe(img);}
  else img.addEventListener('load',()=>{if(eligible(img))observer.observe(img);},{once:true});
 }
}
const mutations=new MutationObserver(changes=>{for(const change of changes)for(const node of change.addedNodes)if(node.nodeType===1){if(node.matches?.('img')&&!active.has(node))scan(node.parentElement||document);else scan(node);}});
function init(){scan();mutations.observe(document.body,{childList:true,subtree:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.GFD3DEngine=Object.freeze({rescan:()=>scan()});
})();
