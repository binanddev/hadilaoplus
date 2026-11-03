import {useEffect,useRef,useState} from 'react';
import * as pc from 'playcanvas';
import {configureSceneRendering,SCENE_GRAPHICS_OPTIONS} from '../sceneRendering';
import {avatars,reactions,type State} from './types';

export default function Room({state,reduced}:{state:State;reduced:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null),latest=useRef(state),reduce=useRef(reduced),[failed,setFailed]=useState(false);
 latest.current=state;reduce.current=reduced;
 useEffect(()=>{
  let app:pc.Application;try{app=new pc.Application(canvas.current!,{graphicsDeviceOptions:SCENE_GRAPHICS_OPTIONS})}catch{setFailed(true);return}
  const dispose=configureSceneRendering(app);app.setCanvasResolution(pc.RESOLUTION_AUTO);app.scene.ambientLight=new pc.Color(.65,.58,.8);
  const materials:pc.StandardMaterial[]=[],textures:pc.Texture[]=[];
  const material=(hex:string,glow=false)=>{const m=new pc.StandardMaterial();m.diffuse=new pc.Color().fromString(hex);if(glow){m.emissive=m.diffuse.clone();m.emissiveIntensity=.7}m.update();materials.push(m);return m};
  const dark=material('#211a36'),floor=material('#352846'),pink=material('#fa76bd',true),mint=material('#8affe0',true),gold=material('#ffe1a1',true),white=material('#fff2e5'),ink=material('#261a38');
  const colors=avatars.map(a=>material(a.color));const skin=['#f6d0ae','#a46d4d','#d99e79','#815439'].map(c=>material(c));
  function mesh(type:'box'|'sphere'|'cylinder'|'cone'|'capsule',pos:number[],scale:number[],m:pc.StandardMaterial,parent=app.root){const e=new pc.Entity();e.addComponent('render',{type,material:m});e.setLocalPosition(pos[0],pos[1],pos[2]);e.setLocalScale(scale[0],scale[1],scale[2]);parent.addChild(e);return e}
  const camera=new pc.Entity();camera.addComponent('camera',{clearColor:new pc.Color(.055,.035,.09),fov:52});camera.setPosition(0,12,22);camera.lookAt(0,2,0);app.root.addChild(camera);
  const sun=new pc.Entity();sun.addComponent('light',{type:'directional',intensity:1.8,color:new pc.Color(1,.88,.96)});sun.setEulerAngles(45,25,0);app.root.addChild(sun);
  mesh('cylinder',[0,-.3,0],[28,.5,26],floor);mesh('box',[0,5,-8],[25,11,.5],dark);
  for(const x of [-11,11])for(let z=-6;z<10;z+=4){mesh('cylinder',[x,3,z],[.55,6,.55],x<0?mint:pink);mesh('sphere',[x,6,z],[1.1,1.1,1.1],gold)}
  for(let i=0;i<3;i++){mesh('cylinder',[0,.2+i*.2,-3],[7-i*.55,.25,7-i*.55],i%2?pink:dark)}
  const trap=mesh('cylinder',[0,.85,-3],[3.8,.15,3.8],gold);
  for(const side of [-1,1]){mesh('cone',[side*7,2,-5],[2.5,4,2.5],side<0?mint:pink);for(let j=0;j<3;j++)mesh('sphere',[side*(6.2+j*.6),4.2+Math.sin(j),-5],[1.4,.8,1],side<0?white:pink)}
  const screen=document.createElement('canvas');screen.width=1024;screen.height=512;const ctx=screen.getContext('2d')!;
  const texture=new pc.Texture(app.graphicsDevice,{width:1024,height:512,mipmaps:false});texture.setSource(screen);textures.push(texture);
  const sm=material('#ffffff',true);sm.diffuseMap=texture;sm.emissiveMap=texture;sm.update();mesh('box',[0,5.1,-7.5],[10.8,5.4,.12],sm);
  const spot=new pc.Entity();spot.addComponent('light',{type:'spot',color:new pc.Color(1,.88,.7),intensity:5,range:20,innerConeAngle:15,outerConeAngle:30});spot.setPosition(0,9,-3);app.root.addChild(spot);
  const people=new Map<string,pc.Entity>();const labels=new Map<string,HTMLDivElement>();const overlay=canvas.current!.parentElement!;
  const makePerson=(id:string,avatar:number)=>{const root=new pc.Entity();app.root.addChild(root);const c=colors[avatar];mesh('capsule',[0,.7,0],[.65,.85,.48],c,root);mesh('sphere',[0,1.4,0],[.83,.78,.72],avatar===4?c:skin[avatar%4],root);for(const side of [-1,1]){mesh('box',[side*.18,.12,0],[.22,.26,.32],ink,root);mesh('sphere',[side*.15,1.44,.33],[.09,.12,.055],ink,root);mesh('capsule',[side*.4,.7,0],[.16,.65,.18],c,root)}
   if([0,2,6,7].includes(avatar))for(const side of [-1,1])mesh(avatar===6?'sphere':'cone',[side*.28,1.85,0],[.26,avatar===7?.8:.4,.25],c,root);
   if(avatar===1)for(const side of [-1,1])mesh('sphere',[side*.25,1.75,.1],[.35,.3,.3],c,root);
   if(avatar===3){mesh('cylinder',[0,2,0],[.7,.06,.7],gold,root);for(const side of [-1,1])mesh('sphere',[side*.5,1,.0],[.6,.65,.1],white,root)}
   if(avatar===4){mesh('cylinder',[0,1.95,0],[.05,.35,.05],gold,root);mesh('sphere',[0,2.13,0],[.17,.17,.17],pink,root)}
   if(avatar===5)mesh('sphere',[0,1.85,0],[1.25,.5,1.1],pink,root);
   const label=document.createElement('div');label.className='ct-person-label';overlay.append(label);labels.set(id,label);people.set(id,root);return root};
  let lastScreen='',elapsed=0;
  app.on('update',(dt:number)=>{
   elapsed+=dt;const s=latest.current;const ids=new Set(s.players.map(p=>p.id));
   for(const [id,e] of people)if(!ids.has(id)){e.destroy();people.delete(id);labels.get(id)?.remove();labels.delete(id)}
   s.players.forEach((p,i)=>{const e=people.get(p.id)||makePerson(p.id,p.avatar);const stage=p.id===s.speaker;const row=Math.floor(i/25),angle=(-77+(i%25)*154/24)*Math.PI/180,r=7+row*1.7;
    let x=stage?0:Math.sin(angle)*r,z=stage?-3:Math.cos(angle)*r-3,y=stage?1:.1+row*.25;
    if(stage&&s.phase==='verdict'&&!reduce.current){const progress=Math.max(0,Math.min(1,(s.now-(s.deadline-5))/5));if(s.result?.kind==='heaven')y+=progress*5;else if(s.result?.kind==='hell'){y-=Math.sin(progress*Math.PI)*2;x=Math.sin(elapsed*18)*.1}else e.setLocalEulerAngles(0,elapsed*100,0)}else e.setLocalEulerAngles(0,stage?0:180+angle*180/Math.PI,0);
    const effect=[...s.effects].reverse().find(f=>f.actor===p.id);e.setLocalPosition(x,y+(reduce.current?0:Math.sin(elapsed*2+i)*.035),z);
    const point=camera.camera!.worldToScreen(new pc.Vec3(x,y+2.3,z));const label=labels.get(p.id)!;label.style.left=`${point.x/app.graphicsDevice.width*100}%`;label.style.top=`${point.y/app.graphicsDevice.height*100}%`;label.textContent=effect?`${reactions.find(r=>r.id===effect.kind)?.icon||''} ${p.name}`:p.name;label.classList.toggle('active',stage);label.style.display=point.z>0?'block':'none';
   });
   trap.setLocalScale(s.phase==='verdict'&&s.result?.kind==='hell'?1:3.8,.15,s.phase==='verdict'&&s.result?.kind==='hell'?1:3.8);
   const key=JSON.stringify([s.phase,s.text,s.heaven,s.hell,s.round,s.result,Math.ceil(s.deadline-s.now)]);
   if(key!==lastScreen){lastScreen=key;ctx.fillStyle='#1a142c';ctx.fillRect(0,0,1024,512);ctx.strokeStyle='#b895ed';ctx.lineWidth=8;ctx.strokeRect(12,12,1000,488);ctx.textAlign='center';ctx.fillStyle='#e8c8ff';ctx.font='bold 42px sans-serif';ctx.fillText('THÚ TỘI',512,76);ctx.font='26px sans-serif';ctx.fillStyle='#f9efdf';const text=s.phase==='waiting'?'Có chuyện gì? Lên đây kể nghe!':s.phase==='arrival'?'Mời nhân chứng drama lên bục…':s.phase==='verdict'?s.result?.kind==='heaven'?'ĐƯỢC ÂN XÁ ✦':s.result?.kind==='hell'?'CÓ TỘI · VẪN LÀ NGƯỜI NHÀ':'CHƯA ĐỦ BẰNG CHỨNG':s.text||'Đang xưng tội bằng mic…';
    const words=text.split(/\s+/);let line='',y=140;for(const word of words){if(ctx.measureText(line+' '+word).width>920){ctx.fillText(line,512,y);line=word;y+=35;if(y>350){line+='…';break}}else line+=(line?' ':'')+word}ctx.fillText(line,512,y);ctx.font='bold 32px sans-serif';ctx.fillStyle='#8affe0';ctx.fillText(s.phase==='waiting'?'ĐĂNG KÝ LÊN BỤC ↓':`${Math.max(0,Math.ceil(s.deadline-s.now))}s  •  ${s.heaven===null?'ĐANG CHỐT PHIẾU':`${s.heaven} ÂN XÁ  /  ${s.hell} CÓ TỘI`}`,512,452);texture.setSource(screen);
   }
  });
  // Bounded, pooled visual-only projectiles; no rigid bodies or networked physics.
  const projectiles=Array.from({length:24},()=>{const e=mesh('sphere',[0,-10,0],[.16,.16,.16],gold);e.enabled=false;return e});
  app.on('update',()=>{const s=latest.current;projectiles.forEach((e,i)=>{const effect=reduce.current?undefined:s.effects.slice(-24)[i],actor=effect?people.get(effect.actor):null;const age=effect?s.now-effect.at:3;e.enabled=!!actor&&age<1.5;if(e.enabled&&actor){const p=actor.getPosition(),t=Math.min(1,age/1.5);e.setPosition(p.x*(1-t),p.y+2+Math.sin(t*Math.PI)*3,p.z*(1-t)-3*t)}})});
  let resizeFrame=0;
  const resize=new ResizeObserver(()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{const width=overlay.clientWidth,height=overlay.clientHeight;if(width&&height)app.resizeCanvas(width,height)})});resize.observe(overlay);app.start();
  return()=>{resize.disconnect();cancelAnimationFrame(resizeFrame);dispose();labels.forEach(e=>e.remove());app.root.destroy();materials.forEach(m=>m.destroy());textures.forEach(t=>t.destroy());app.destroy()};
 },[]);
 return <div className="ct-world">{failed?<div className="ct-scene-error">Máy chưa mở được 3D. Bạn vẫn có thể xưng tội và phán xét bằng bảng điều khiển.</div>:<canvas ref={canvas} aria-label="Phòng thú tội 3D, sân khấu neon và khán đài bán nguyệt"/>}<div className="ct-world-tag">LIVE FROM THE AFTERLIFE <span>✦</span> PHIÊN TÒA #{state.round.toString().padStart(3,'0')}</div></div>
}
