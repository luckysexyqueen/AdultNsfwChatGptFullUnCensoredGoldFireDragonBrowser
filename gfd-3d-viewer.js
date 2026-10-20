/* Optional 3D image / 360 panorama viewer. Does not modify existing images or navigation. */
(function () {
  'use strict';
  const id='gfd-3d-viewer';
  let enginePromise;
  function engine(){
    return enginePromise ||= import('https://cdn.jsdelivr.net/npm/three@0.181.2/build/three.module.js');
  }
  function open(){
    let dialog=document.getElementById(id);
    if(dialog){dialog.hidden=false;return;}
    dialog=document.createElement('section');
    dialog.id=id;
    dialog.setAttribute('aria-label','3D 및 360도 이미지 뷰어');
    dialog.style.cssText='position:fixed;inset:8% 8%;z-index:2147483005;background:#10111b;color:#fff;border:1px solid #d4af37;border-radius:12px;padding:12px;box-sizing:border-box;display:flex;flex-direction:column;gap:8px;';
    dialog.innerHTML='<div style="display:flex;gap:8px;align-items:center"><strong>🌐 3D / 360° 이미지</strong><button type="button" data-close style="margin-left:auto">닫기</button></div><div style="display:flex;gap:8px"><input aria-label="이미지 URL" placeholder="https://... 이미지 주소" style="flex:1;min-width:0"><button type="button" data-load>열기</button></div><div data-canvas style="flex:1;min-height:120px;overflow:hidden;background:#000"></div><p data-status role="status" style="margin:0;font:12px system-ui">이미지 주소를 입력하세요.</p>';
    document.body.appendChild(dialog);
    const area=dialog.querySelector('[data-canvas]'), status=dialog.querySelector('[data-status]');
    let renderer,scene,camera,mesh,resize,raf,drag=false,lastX=0,lastY=0,THREE,panorama=false;
    function stop(){
      cancelAnimationFrame(raf);resize?.disconnect();
      if(mesh){mesh.material.map?.dispose();mesh.material.dispose();mesh.geometry.dispose();}
      renderer?.dispose();renderer?.domElement.remove();renderer=null;mesh=null;
    }
    dialog.querySelector('[data-close]').addEventListener('click',()=>{stop();dialog.remove();});
    dialog.querySelector('[data-load]').addEventListener('click',async()=>{
      const raw=dialog.querySelector('input').value.trim();
      let url;
      try{url=new URL(raw);if(!['http:','https:'].includes(url.protocol))throw Error('invalid');}
      catch{status.textContent='HTTP(S) 이미지 주소를 입력하세요.';return;}
      status.textContent='3D 엔진 로딩 중…';
      try{
        THREE=await engine();
        stop();scene=new THREE.Scene();
        camera=new THREE.PerspectiveCamera(75,1,0.1,1100);
        renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});
        renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
        area.appendChild(renderer.domElement);
        const texture=await new THREE.TextureLoader().loadAsync(url.href);
        panorama=texture.image.width/texture.image.height>1.9;
        const geometry=panorama?new THREE.SphereGeometry(500,60,40):new THREE.PlaneGeometry(5*texture.image.width/texture.image.height,5);
        if(panorama)geometry.scale(-1,1,1);
        camera.position.z=panorama?0:7;
        mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
        scene.add(mesh);
        function size(){const w=area.clientWidth,h=area.clientHeight;if(w&&h){camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);}}
        resize=new ResizeObserver(size);resize.observe(area);size();
        const tick=()=>{raf=requestAnimationFrame(tick);if(mesh&&!drag&&!panorama)mesh.rotation.y+=0.002;renderer.render(scene,camera);};tick();
        status.textContent=panorama?'360° 파노라마 표시 중':'이미지 3D 평면 표시 중';
      }catch(e){stop();status.textContent='표시 실패: 이미지 CORS 또는 WebGL 환경을 확인하세요.';console.warn('[GFD 3D]',e);}
    });
    area.addEventListener('pointerdown',e=>{drag=true;lastX=e.clientX;lastY=e.clientY;area.setPointerCapture(e.pointerId);});
    area.addEventListener('pointermove',e=>{if(drag&&mesh){mesh.rotation.y+=(e.clientX-lastX)*0.005;mesh.rotation.x+=(e.clientY-lastY)*0.005;lastX=e.clientX;lastY=e.clientY;}});
    area.addEventListener('pointerup',()=>{drag=false;});
    area.addEventListener('pointercancel',()=>{drag=false;});
  }
  window.GFD3DEngine=Object.freeze({open});
  function mount(){
    if(document.getElementById('gfd-3d-toggle'))return;
    const button=document.createElement('button');
    button.id='gfd-3d-toggle';button.type='button';button.textContent='🌐 3D / 360°';
    button.style.cssText='position:fixed;left:12px;bottom:12px;z-index:2147482998;background:#161925;color:#d4af37;border:1px solid #8c52ff;border-radius:12px;padding:10px 14px;font:600 14px system-ui;cursor:pointer';
    button.addEventListener('click',open);document.body.appendChild(button);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
