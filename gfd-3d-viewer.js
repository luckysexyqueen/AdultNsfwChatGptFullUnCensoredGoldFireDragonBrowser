/* Automatic 3D image renderer for images already present in GoldFireDragonBrowser.html. */
(function(){
'use strict';
const source='https://cdn.jsdelivr.net/npm/three@0.181.2/build/three.module.js';
let threePromise;
let depthPipelinePromise;
async function inferDepth(image){
 // Optional browser-side ONNX depth model; no API key or image upload required.
 const pipeline=await (depthPipelinePromise ||= import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1').then(m=>m.pipeline('depth-estimation','onnx-community/depth-anything-v2-small',{device:'wasm'})).catch(e=>{depthPipelinePromise=null;throw e;}));
 const result=await pipeline(image.currentSrc||image.src);
 const map=result.predicted_depth;
 if(!map||!map.data||!map.dims)throw Error('Depth model returned no map');
 const width=map.dims[map.dims.length-1],height=map.dims[map.dims.length-2];
 const values=map.data;
 let lo=Infinity,hi=-Infinity;
 for(const value of values){if(value<lo)lo=value;if(value>hi)hi=value;}
 const normalized=new Float32Array(128*128);
 for(let y=0;y<128;y++)for(let x=0;x<128;x++){
  const xx=Math.min(width-1,Math.floor(x*width/128));
  const yy=Math.min(height-1,Math.floor(y*height/128));
  normalized[y*128+x]=(values[yy*width+xx]-lo)/Math.max(hi-lo,1e-6);
 }
 return normalized;
}
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
  // Reconstruct a relief surface directly for on-screen 3D rendering.
  let geometry=isPanorama?new THREE.SphereGeometry(500,48,32):new THREE.PlaneGeometry(5*ratio,5,80,80);
  if(isPanorama)geometry.scale(-1,1,1);
  else {
   try {
    const canvas=document.createElement('canvas');
    canvas.width=canvas.height=128;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx)throw new Error('2D canvas unavailable');
    ctx.drawImage(texture.image,0,0,128,128);
    const data=ctx.getImageData(0,0,128,128).data;
    const samples=new Float32Array(128*128);
    for(let i=0;i<samples.length;i++){
     const j=i*4;
     samples[i]=((data[j]*0.2126+data[j+1]*0.7152+data[j+2]*0.0722)/255)*(data[j+3]/255);
    }
    // Prefer learned monocular depth; retain deterministic pixel-depth fallback offline.
    try { const predicted=await inferDepth(img);samples.set(predicted); }
    catch(modelError){console.warn('[GFD 3D] AI depth unavailable, using local relief:',modelError);}
    const positions=geometry.attributes.position,uvs=geometry.attributes.uv;
    for(let i=0;i<positions.count;i++){
     const u=uvs.getX(i),v=uvs.getY(i);
     const x=Math.max(1,Math.min(126,Math.round(u*127)));
     const y=Math.max(1,Math.min(126,Math.round((1-v)*127)));
     let total=0;
     for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)total+=samples[(y+dy)*128+x+dx];
     positions.setZ(i,0.75*total/9);
    }
    positions.needsUpdate=true;
    geometry.computeVertexNormals();
   }catch(error){console.warn('[GFD 3D] Depth estimation unavailable',error);}
  }
  if(!isPanorama){
   // Construct a closed mesh: reconstructed front, inferred back and connected sides.
   const front=geometry;
   const p=front.attributes.position,uv=front.attributes.uv;
   const n=p.count,verts=[],coords=[],triangles=[];
   for(let i=0;i<n;i++){
    verts.push(p.getX(i),p.getY(i),p.getZ(i));
    coords.push(uv.getX(i),uv.getY(i));
   }
   for(let i=0;i<n;i++){
    verts.push(p.getX(i),p.getY(i),-0.38);
    coords.push(1-uv.getX(i),uv.getY(i));
   }
   const idx=front.index;
   for(let i=0;i<idx.count;i+=3){
    const a=idx.getX(i),b=idx.getX(i+1),c=idx.getX(i+2);
    triangles.push(a,b,c,c+n,b+n,a+n);
   }
   const edge=[];
   const steps=80;
   for(let x=0;x<=steps;x++)edge.push(x);
   for(let y=1;y<=steps;y++)edge.push(y*(steps+1)+steps);
   for(let x=steps-1;x>=0;x--)edge.push(steps*(steps+1)+x);
   for(let y=steps-1;y>=1;y--)edge.push(y*(steps+1));
   for(let i=0;i<edge.length;i++){
    const a=edge[i],b=edge[(i+1)%edge.length];
    triangles.push(a,a+n,b,b,a+n,b+n);
   }
   geometry=new THREE.BufferGeometry();
   geometry.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
   geometry.setAttribute('uv',new THREE.Float32BufferAttribute(coords,2));
   geometry.setIndex(triangles);
   geometry.computeVertexNormals();
   front.dispose();
  }
  camera.position.z=isPanorama?0:Math.max(6,4.5*ratio);
  const material=isPanorama ? new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,transparent:true}) : new THREE.MeshStandardMaterial({map:texture,side:THREE.DoubleSide,roughness:.88,metalness:0,transparent:true});
  if(!isPanorama){
   scene.add(new THREE.AmbientLight(0xffffff,1.6));
   const keyLight=new THREE.DirectionalLight(0xffffff,1.8);
   keyLight.position.set(-3,4,8);
   scene.add(keyLight);
  }
  const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);
  holder.appendChild(renderer.domElement);
  renderer.domElement.style.cssText='position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none;display:block;';
  img.parentNode.insertBefore(holder,img);
  holder.appendChild(img);
  img.style.position='relative';img.style.opacity='0';
  img.style.pointerEvents='auto';
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
