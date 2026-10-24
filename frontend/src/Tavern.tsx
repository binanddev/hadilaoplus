
import { useEffect, useRef, useState } from 'react';
import * as pc from 'playcanvas';
import { presentationKind } from './cardPresentation.ts';
import { mapById, type MapId } from './maps';
import { buildWorld } from './worlds';
import { detailCharacter } from './characterDetail';
import { configureSceneRendering, SCENE_GRAPHICS_OPTIONS } from './sceneRendering';
import { batchStaticGeometry, configureSceneLighting, createDetailPrimitives } from './sceneGeometry';
type Player={id:string;name:string;seat:number;gold:number;ready:boolean;hand_count:number;shield?:boolean;character?:string;role?:string;knight_count?:number};
type Event={id:string;type:string;name?:string;actor_id?:string;target_id?:string};
type Props={mapId?:MapId;kingSeat?:number;reduced?:boolean;event?:Event;players?:Player[];myId?:string;selectedTargetId?:string;targeting?:boolean;previewCharacter?:string;currentPlayerId?:string;winnerId?:string;onSelectPlayer?:(id:string)=>void;onDropCard?:(cardId:string,id:string)=>void};
type Shape='box'|'sphere'|'cylinder'|'cone'|'plane';
const titles:Record<string,string>={theft:'ĐÂM SAU LƯNG',tax:'THUẾ HOÀNG GIA',loyal_dog:'CHÓ TRUNG THÀNH',parrot:'VẸT HOÀNG GIA',mad_king:'VUA ĐIÊN',bomb:'BOM HOÀNG GIA',shield:'KHIÊN BÍ MẬT',gift:'QUÀ CÓ DỤNG Ý'};
export function Tavern(props:Props){
 const {players=[],myId,kingSeat=0,targeting,selectedTargetId,onSelectPlayer,onDropCard}=props;
 const ref=useRef<HTMLCanvasElement>(null),labels=useRef(new Map<string,HTMLButtonElement>()),latest=useRef(props);latest.current=props;
 const [failed,setFailed]=useState(false);
 const sceneId=mapById(props.mapId).id;
 useEffect(()=>{
  const canvas=ref.current!;let app:pc.Application;
  try{app=new pc.Application(canvas,{graphicsDeviceOptions:{...SCENE_GRAPHICS_OPTIONS}});}catch{setFailed(true);return;}
  const disposeRendering=configureSceneRendering(app);app.setCanvasResolution(pc.RESOLUTION_AUTO);app.scene.ambientLight=new pc.Color(.12,.075,.045);app.scene.exposure=.85;
  setFailed(false);
  const ownedMaterials=new Set<pc.StandardMaterial>(),ownedTextures:pc.Texture[]=[];
  const mat=(hex:string,metal=0,emissive=false)=>{const m=new pc.StandardMaterial();ownedMaterials.add(m);m.diffuse=new pc.Color().fromString(hex);m.useMetalness=true;m.metalness=metal;m.gloss=metal?.45:.15;if(emissive){m.emissive=m.diffuse.clone();m.emissiveIntensity=.65;}m.update();return m;};
  const wood=mat('#75492f'),oak=mat('#a97846'),timber=mat('#35251f'),stone=mat('#62606a'),stoneAlt=mat('#76717b'),dark=mat('#25232c'),gold=mat('#d9ae60',.6),cream=mat('#eadaba'),felt=mat('#304c47'),wine=mat('#713b46'),iron=mat('#32333c',.4),night=mat('#253449',0,true),fire=mat('#ffbc65',0,true),skin=mat('#d5a17e'),hair=mat('#3c2d29'),eye=mat('#1f2028');
  const surfaceTexture=(woven:boolean)=>{const source=document.createElement('canvas');source.width=128;source.height=128;const c=source.getContext('2d')!;c.fillStyle='#c9c9c9';c.fillRect(0,0,128,128);for(let i=0;i<128;i++){const v=Math.round(170+Math.sin(i*2.31)*20);c.strokeStyle=`rgb(${v},${v},${v})`;c.lineWidth=woven?1:.6;c.beginPath();c.moveTo(i,0);if(woven)c.lineTo(i,128);else for(let y=0;y<=128;y+=4)c.lineTo(i+Math.sin(y*.07+i*.13)*2,y);c.stroke();if(woven){c.strokeStyle=i%2?'#b0b0b0':'#e5e5e5';c.beginPath();c.moveTo(0,i);c.lineTo(128,i);c.stroke();}}const tex=new pc.Texture(app.graphicsDevice,{width:128,height:128,mipmaps:true});tex.setSource(source);ownedTextures.push(tex);return tex;};
  const grain=surfaceTexture(false),weave=surfaceTexture(true);for(const material of [wood,oak,timber]){material.diffuseMap=grain;material.diffuseMapTiling.set(3,3);material.update();}felt.diffuseMap=weave;felt.diffuseMapTiling.set(12,12);felt.update();
  const group=(name:string,parent:pc.Entity=app.root)=>{const e=new pc.Entity(name);parent.addChild(e);return e;};
  const primitives=createDetailPrimitives(app),staticMeshes:pc.Entity[]=[];let collectStatic=true;
  const mesh=(name:string,type:Shape,p:number[],s:number[],m:pc.StandardMaterial,parent:pc.Entity=app.root)=>{const e=group(name,parent);primitives.addRender(e,type,s,m,['torso','chair back','chair seat','helmet dome','thick oak table'].includes(name),name!=='smoke');e.setLocalPosition(p[0],p[1],p[2]);e.setLocalScale(s[0],s[1],s[2]);if(collectStatic)staticMeshes.push(e);return e;};
  const beam=(a:number[],b:number[],w:number,m:pc.StandardMaterial,parent:pc.Entity=app.root)=>{const av=new pc.Vec3(a[0],a[1],a[2]),bv=new pc.Vec3(b[0],b[1],b[2]);const e=mesh('carved beam','box',[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2],[w,w,av.distance(bv)],m,parent);e.lookAt(parent.getWorldTransform().transformPoint(bv));return e;};
  const light=(p:number[],color:string,intensity:number,range:number)=>{const e=group('light');e.addComponent('light',{type:'omni',color:new pc.Color().fromString(color),intensity,range,falloffMode:pc.LIGHTFALLOFF_INVERSESQUARED});e.setPosition(p[0],p[1],p[2]);return e;};
  const kit={app,mat,group,mesh,beam,light},world=buildWorld(sceneId,kit),isIndoor=sceneId==='tavern',isDay=sceneId==='island'||sceneId==='garden';
  const flames:pc.Entity[]=[];
  let hearthLight:pc.Entity|undefined;
  if(isIndoor){
  // Furnished room is actual geometry, including floor, masonry, beams and windows.
  mesh('floor','box',[0,-.12,0],[22,.2,22],dark);
  for(let i=-5;i<=5;i++)mesh('floor boards','box',[i*1.9,0,0],[1.87,.04,19],i%2?wood:timber);
  for(const z of [-9,9])for(let row=0;row<7;row++)for(let x=-6;x<=6;x++)mesh('stone blocks','box',[x*1.6+(row%2)*.6,row*.75+.38,z],[1.55,.7,.4],(x+row)%3?stone:stoneAlt);
  for(const x of [-10,10])mesh('side wall','box',[x,2.8,0],[.4,5.6,18],stone);
  mesh('ceiling','box',[0,5.6,0],[21,.25,19],timber);
  for(const x of [-9,-5,0,5,9]){mesh('wall post','box',[x,2.8,-8.7],[.28,5.6,.4],timber);mesh('roof beam','box',[x,5.1,0],[.3,.45,18],timber);}mesh('lintel','box',[0,4.5,-8.6],[19,.35,.4],timber);
  for(const x of [-6,5.7]){mesh('window frame','box',[x,3.15,-8.65],[2.4,2.7,.25],timber);mesh('blue night glass','box',[x,3.15,-8.45],[2.1,2.4,.08],night);for(let i=-1;i<=1;i++)mesh('window bars','box',[x+i*.65,3.15,-8.36],[.065,2.4,.12],iron);mesh('crossbar','box',[x,3.2,-8.35],[2.1,.08,.12],iron);light([x,3,-7.7],'#8197c2',.45,8);}
  mesh('fireplace opening','box',[-1.5,1.3,-8.25],[3.2,2.6,.5],dark);for(const x of [-3.3,.3])mesh('fireplace pillar','box',[x,1.15,-7.8],[.6,2.3,1.1],stoneAlt);mesh('mantel','box',[-1.5,2.6,-7.8],[4.3,.4,1.5],stoneAlt);mesh('chimney','box',[-1.5,4,-8.2],[3.2,2.5,1],stone);mesh('hearth','box',[-1.5,.13,-7.6],[4.2,.25,1.8],stoneAlt);
  for(let i=0;i<4;i++){const e=mesh('firewood','cylinder',[-2.1+i*.4,.35,-7.6],[.26,1.5,.26],timber);e.setEulerAngles(0,i*22,90);}
  for(let i=0;i<7;i++)flames.push(mesh('hearth flames','cone',[-2.4+i*.3,.72,-7.5+Math.sin(i)*.2],[.3,.8,.3],fire));
  hearthLight=light([-1.5,1.6,-6.7],'#ff9e4f',4,10);
  for(const y of [1,2,3]){mesh('shelf','box',[8.1,y,-8.1],[2.5,.13,1],wood);for(let i=0;i<6;i++){const x=7.15+i*.37;mesh('bottle body','cylinder',[x,y+.24,-8],[.18,.4,.18],i%2?felt:wine);mesh('bottle neck','cylinder',[x,y+.52,-8],[.075,.17,.075],gold);}}
  for(const [x,z] of [[-8,-6],[-7,-7],[8,-6],[7,6]]){mesh('barrel','cylinder',[x,.7,z],[1,1.4,1],wood);for(const y of [.2,.7,1.2])mesh('barrel hoop','cylinder',[x,y,z],[1.025,.065,1.025],iron);mesh('barrel lid','cylinder',[x,1.42,z],[.9,.04,.9],oak);}
  mesh('rug edge','box',[0,.045,0],[10.8,.025,10.8],wine);mesh('rug gold border','box',[0,.06,0],[10.3,.015,10.3],gold);mesh('rug field','box',[0,.075,0],[10,.015,10],wine);
  for(let i=-4;i<=4;i++)for(const z of [-4.9,4.9]){const e=mesh('rug motif','box',[i,.09,z],[.15,.01,.15],cream);e.setEulerAngles(0,45,0);}
  }
  // The round table is at seated elbow height.
  mesh('thick oak table','cylinder',[0,1.25,0],[6.7,.24,6.7],wood);mesh('brass table rim','cylinder',[0,1.38,0],[6.72,.03,6.72],gold);mesh('oak inset','cylinder',[0,1.4,0],[6.5,.025,6.5],oak);mesh('green felt','cylinder',[0,1.425,0],[5.5,.025,5.5],felt);
  for(let i=0;i<24;i++){const a=i*Math.PI/12,e=mesh('brass rim engraving','box',[Math.sin(a)*3.12,1.42,Math.cos(a)*3.12],[.06,.008,.16],timber);e.setLocalEulerAngles(0,i*15,0);}
  for(const x of [-1.9,1.9])for(const z of [-1.9,1.9])mesh('table leg','box',[x,.6,z],[.36,1.2,.36],timber);
  for(const [x,z] of [[-1.4,-.7],[1.4,-.7],[0,1.35]]){mesh('candle foot','cylinder',[x,1.47,z],[.25,.06,.25],gold);mesh('brass stem','cylinder',[x,1.63,z],[.06,.3,.06],gold);mesh('wax candle','cylinder',[x,1.93,z],[.12,.34,.12],cream);flames.push(mesh('candle flame','sphere',[x,2.17,z],[.07,.17,.07],fire));}
  // One shared candle light limits the lighting budget.
  const candleLight=light([0,2.6,0],'#ffc587',2.8,9);
  if(isIndoor){const chandelier=group('chandelier');chandelier.setPosition(0,4.15,0);mesh('chain','cylinder',[0,.6,0],[.04,1.2,.04],iron,chandelier);
  for(let i=0;i<8;i++){const a=i*Math.PI/4,x=Math.sin(a)*1.5,z=Math.cos(a)*1.5;beam([0,0,0],[x,0,z],.06,iron,chandelier);mesh('chandelier candle','cylinder',[x,.14,z],[.1,.3,.1],cream,chandelier);mesh('chandelier flame','sphere',[x,.37,z],[.055,.14,.055],fire,chandelier);}
  }
  const fill=group('moonlight');fill.addComponent('light',{type:'directional',color:new pc.Color(.53,.61,.79),intensity:isIndoor?.12:0});fill.setEulerAngles(45,25,0);
  const cardMaterial=(back:boolean,text='')=>{const source=document.createElement('canvas');source.width=256;source.height=384;const c=source.getContext('2d')!;c.fillStyle=back?'#552c3a':'#eadabc';c.fillRect(0,0,256,384);c.strokeStyle='#cea45e';c.lineWidth=9;c.strokeRect(12,12,232,360);c.lineWidth=2;c.strokeRect(24,24,208,336);c.fillStyle=back?'#d4b271':'#5d3829';c.textAlign='center';c.font='90px Georgia';c.fillText(back?'♛':'⚜',128,195);if(back){for(let x=40;x<230;x+=28)for(let y=45;y<350;y+=28){c.save();c.translate(x,y);c.rotate(Math.PI/4);c.strokeRect(-4,-4,8,8);c.restore();}}else{c.font='bold 18px Georgia';const words=text.split(' ');let line='',y=260;for(const word of words){if(c.measureText(line+' '+word).width>195){c.fillText(line,128,y);y+=25;line=word;}else line+=(line?' ':'')+word;}c.fillText(line,128,y);}const texture=new pc.Texture(app.graphicsDevice,{width:256,height:384,mipmaps:true});texture.setSource(source);ownedTextures.push(texture);const m=mat('#ffffff');m.diffuseMap=texture;m.update();return m;};
  collectStatic=false;batchStaticGeometry(app,staticMeshes.filter(e=>!flames.includes(e)),'table and room');
  const cardBack=cardMaterial(true),playedMaterials=new Map<string,pc.StandardMaterial>();
  type Actor={root:pc.Entity;head:pc.Entity;upper:pc.Entity;arms:pc.Entity[];royal:pc.Entity;turnMarker:pc.Entity;cards:pc.Entity;count:number;anchor:pc.Vec3;detail:(t:number,reduced:boolean,index:number)=>void;materials:pc.StandardMaterial[]};
  const actors=new Map<string,Actor>(),actorBatch=app.batcher?.addGroup('articulated costumes',true,30),furnitureBatch=app.batcher?.addGroup('seated furniture',false,8);
  const variants=['regent','rogue','scholar','knight','merchant','jester'];
  const clothes:Record<string,string>={regent:'#51334e',rogue:'#293c35',scholar:'#34425b',knight:'#535a65',merchant:'#65442c',jester:'#6f303c'};
  const makeActor=(id:string,index:number,count:number,isMe:boolean,choice='regent')=>{const initialMaterials=new Set(ownedMaterials);const kind=variants.includes(choice)?choice:'regent',a=index*Math.PI*2/count,root=group('seated '+kind+' '+id);root.setPosition(Math.sin(a)*4.05,0,Math.cos(a)*4.05);root.setEulerAngles(0,a*180/Math.PI,0);
   mesh('chair seat','box',[0,.63,.1],[.9,.16,.85],wood,root);mesh('chair back','box',[0,1.3,.48],[.9,1.4,.15],timber,root);mesh('velvet cushion','box',[0,.75,.04],[.78,.1,.7],wine,root);for(const x of [-.35,.35])for(const z of [-.22,.4])mesh('chair leg','box',[x,.3,z],[.1,.6,.1],timber,root);
   const royal=group('royal throne',root);mesh('tall throne back','box',[0,1.75,.52],[1.05,2.15,.19],wine,royal);for(const side of [-1,1]){mesh('gilded throne pillar','box',[side*.56,1.7,.48],[.08,2.45,.22],gold,royal);mesh('throne finial','cone',[side*.56,3,.48],[.2,.3,.2],gold,royal);mesh('gilded armrest','box',[side*.6,1.12,-.1],[.15,.15,1],gold,royal);}mesh('throne crest','box',[0,2.83,.47],[1.18,.12,.25],gold,royal);mesh('throne jewel','sphere',[0,2.94,.43],[.22,.25,.15],gold,royal);
   const auraMat=mat('#b58638',0,true);auraMat.opacity=.055;auraMat.blendType=pc.BLEND_NORMAL;auraMat.depthWrite=false;auraMat.update();mesh('subtle royal aura','sphere',[0,2.4,.6],[1.6,1.7,.12],auraMat,royal);royal.enabled=false;
   const markerMat=mat('#9c7434',.15,true);markerMat.opacity=.22;markerMat.blendType=pc.BLEND_NORMAL;markerMat.depthWrite=false;markerMat.update();const turnMarker=mesh('turn sigil','cylinder',[0,.105,0],[1.25,.015,1.25],markerMat,root);turnMarker.enabled=false;
   const body=group('body',root),upper=group('shoulder and torso pose',body);upper.setLocalPosition(0,1.35,0);const cloth=mat(clothes[kind],kind==='knight'?.3:0),flesh=index%3?mat(index%3===1?'#b98160':'#e3b99a'):skin;
   cloth.diffuseMap=weave;cloth.diffuseMapTiling.set(3,4);cloth.update();
   mesh('torso','sphere',[0,.02,0],[.66,.8,.43],cloth,upper);mesh('belt','box',[0,-.33,0],[.68,.12,.45],timber,upper);mesh('buckle','box',[0,-.33,-.25],[.14,.1,.04],gold,upper);mesh('collar','box',[0,.43,-.03],[.37,.14,.4],kind==='rogue'?cloth:cream,upper);mesh('neck','cylinder',[0,.55,0],[.2,.22,.2],flesh,upper);
   const head=group('head',upper);head.setLocalPosition(0,.83,-.015);mesh('face','sphere',[0,0,0],[.48,.58,.46],flesh,head);mesh('hair cap','sphere',[0,.19,.025],[.51,.29,.47],hair,head);for(const side of [-1,1]){mesh('side hair','sphere',[side*.23,.08,.03],[.08,.28,.35],hair,head);mesh('ear','sphere',[side*.25,-.015,0],[.1,.16,.11],flesh,head);mesh('eye white','sphere',[side*.105,.035,-.212],[.1,.07,.045],cream,head);mesh('pupil','sphere',[side*.105,.035,-.24],[.04,.045,.023],eye,head);mesh('brow','box',[side*.105,.11,-.22],[.13,.026,.03],hair,head);}mesh('nose','sphere',[0,-.015,-.255],[.09,.13,.12],flesh,head);mesh('mouth','box',[0,-.15,-.215],[.12,.025,.025],hair,head);
   if(kind==='regent'){mesh('regent beard','sphere',[0,-.19,-.07],[.36,.22,.32],hair,head);mesh('fur mantle','box',[0,.35,.05],[.85,.15,.53],cream,upper);for(const side of [-1,1])mesh('royal clasp','sphere',[side*.22,.29,-.28],[.09,.09,.05],gold,upper);}
   if(kind==='rogue'){mesh('hood','sphere',[0,.16,.12],[.65,.66,.54],cloth,head);mesh('dark face mask','box',[0,-.12,-.23],[.4,.16,.09],cloth,head);mesh('cloak','box',[0,-.1,.24],[.8,1.05,.09],cloth,upper);mesh('silver brooch','sphere',[.2,.33,-.25],[.09,.09,.04],iron,upper);}
   if(kind==='scholar'){mesh('wide scholar brim','cylinder',[0,.31,0],[.8,.07,.7],cloth,head);mesh('pointed scholar hat','cone',[0,.59,0],[.55,.62,.5],cloth,head);for(let i=0;i<5;i++)mesh('braid','sphere',[.27,-.08-i*.1,.1],[.13,.14,.13],oak,head);mesh('robe front','box',[0,-.16,-.25],[.12,.65,.04],gold,upper);mesh('book at belt','box',[.29,-.4,-.27],[.21,.3,.09],wine,upper);}
   if(kind==='knight'){mesh('helmet dome','sphere',[0,.2,.025],[.6,.4,.55],iron,head);mesh('helmet brow','box',[0,.1,-.25],[.57,.07,.12],iron,head);for(const side of [-1,1]){mesh('cheek guard','box',[side*.23,-.09,-.17],[.09,.28,.13],iron,head);mesh('pauldron','sphere',[side*.4,.32,0],[.38,.24,.47],iron,upper);}mesh('chest plate','box',[0,.04,-.24],[.56,.59,.07],iron,upper);mesh('crest','box',[0,.08,-.29],[.08,.3,.03],gold,upper);}
   if(kind==='merchant'){mesh('soft merchant cap','sphere',[0,.31,.04],[.65,.25,.55],wine,head);mesh('cap button','sphere',[.3,.31,0],[.12,.12,.12],gold,head);for(const side of [-1,1]){const m=mesh('moustache','box',[side*.09,-.115,-.255],[.18,.045,.045],hair,head);m.setLocalEulerAngles(0,0,side*15);}mesh('coin purse','sphere',[.35,-.35,-.17],[.3,.35,.22],oak,upper);mesh('vest stripe','box',[0,-.05,-.25],[.07,.65,.04],gold,upper);}
   if(kind==='jester'){for(const side of [-1,1]){const h=mesh('jester horn','cone',[side*.2,.43,0],[.34,.5,.3],side===1?wine:felt,head);h.setLocalEulerAngles(0,0,-side*30);mesh('jester bell','sphere',[side*.34,.66,0],[.1,.1,.1],gold,head);}mesh('two tone tunic','box',[.17,.02,-.005],[.31,.8,.44],felt,upper);for(let i=0;i<5;i++)mesh('ruff','sphere',[(i-2)*.13,.45,-.08],[.2,.15,.4],cream,upper);}
   const arms:pc.Entity[]=[];for(const side of [-1,1]){const arm=group('gesturing arm',upper);arm.setLocalPosition(side*.37,.3,0);arms.push(arm);beam([0,0,0],[side*.15,-.31,-.25],.23,cloth,arm);beam([side*.15,-.31,-.25],[0,-.23,-.7],.17,cloth,arm);mesh('hand','sphere',[0,-.22,-.8],[.19,.13,.23],flesh,arm);beam([side*.2,.86,0],[side*.23,.8,-.6],.27,cloth,body);beam([side*.23,.8,-.6],[side*.23,.2,-.63],.2,dark,body);mesh('boot','box',[side*.23,.12,-.77],[.25,.18,.43],dark,body);}
   const detail=detailCharacter(kit,kind,head,upper,arms,root,flesh,cloth);
   body.enabled=!isMe;for(const part of body.find(e=>Boolean((e as pc.Entity).render))) (part as pc.Entity).render!.batchGroupId=actorBatch?.id??-1;
   const cards=group('concealed cards',root);cards.setLocalPosition(0,1.57,-.72);cards.setLocalEulerAngles(-55,0,0);cards.enabled=!isMe;
   if(isMe)for(const side of [-1,1])mesh('your hand','sphere',[side*.4,1.48,-.98],[.2,.13,.26],flesh,root);
   for(const child of root.children){const entity=child as pc.Entity;if(entity.render&&entity!==turnMarker)entity.render.batchGroupId=furnitureBatch?.id??-1;}
   return {root,head,upper,arms,royal,turnMarker,cards,detail,materials:[...ownedMaterials].filter(m=>!initialMaterials.has(m)),count:-1,anchor:new pc.Vec3(Math.sin(a)*4.05,3.15,Math.cos(a)*4.05)};};
  const camera=group('seated camera');camera.addComponent('camera',{clearColor:new pc.Color().fromString(isIndoor?'#070504':isDay?(sceneId==='island'?'#b9d8d8':'#cad7ca'):'#172638'),fov:68,nearClip:.08,farClip:110});camera.camera!.toneMapping=pc.TONEMAP_FILMIC;camera.camera!.gammaCorrection=pc.GAMMA_SRGB;
  const crown=group('crown');mesh('crown band','cylinder',[0,0,0],[.62,.12,.62],gold,crown);for(let i=0;i<7;i++){const a=i*Math.PI*2/7;mesh('crown point','cone',[Math.sin(a)*.25,.17,Math.cos(a)*.25],[.16,.35,.16],gold,crown);mesh('ruby','sphere',[Math.sin(a)*.3,.035,Math.cos(a)*.3],[.07,.07,.07],wine,crown);}
  const played=mesh('last played card','box',[0,1.47,0],[.65,.018,.95],cream);played.enabled=false;
  const dice=mesh('rolling die','box',[0,1.8,0],[.42,.42,.42],cream);dice.enabled=false;for(const x of [-.12,.12])for(const y of [-.12,0,.12])mesh('die pip','sphere',[x*2.4,y*2.4,-.51],[.13,.13,.06],eye,dice);
  const bomb=mesh('bomb','sphere',[0,1.8,0],[.5,.5,.5],iron);bomb.enabled=false;mesh('fuse','box',[.25,.6,0],[.12,.5,.12],oak,bomb);
  const smokeMat=mat('#80717c');smokeMat.opacity=.25;smokeMat.blendType=pc.BLEND_NORMAL;smokeMat.depthWrite=false;smokeMat.update();const smoke=Array.from({length:10},()=>mesh('smoke','sphere',[0,0,0],[.1,.1,.1],smokeMat));smoke.forEach(e=>e.enabled=false);
  const sparkleMat=mat('#f5d68f',0,true),glints=Array.from({length:16},()=>mesh('crown sparks','sphere',[0,0,0],[.035,.035,.035],sparkleMat));glints.forEach(e=>e.enabled=false);
  const impact=Array.from({length:12},()=>mesh('action spark','sphere',[0,0,0],[.045,.045,.045],sparkleMat));impact.forEach(e=>e.enabled=false);
  const coins=Array.from({length:20},()=>mesh('flying coin','cylinder',[0,0,0],[.1,.025,.1],gold));coins.forEach(e=>e.enabled=false);
  const flameScales=flames.map(f=>f.getLocalScale().clone());
  const embers=Array.from({length:12},()=>mesh('rising ember','sphere',[0,0,0],[.025,.025,.025],fire));
  let layout='',cameraAngle=0,look=0,pitch=0,time=0,lastEvent='',effect=0,lastKing='',flight=0;
  const projected=new pc.Vec3(),crownFrom=new pc.Vec3(),crownTo=new pc.Vec3();
  const down=(e:PointerEvent)=>{if(e.button===2)canvas.setPointerCapture(e.pointerId);};const move=(e:PointerEvent)=>{if(e.buttons&2){look=pc.math.clamp(look-e.movementX*.004,-1.2,1.2);pitch=pc.math.clamp(pitch+e.movementY*.003,-.3,.4);}};const context=(e:globalThis.Event)=>e.preventDefault();canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('contextmenu',context);
  app.on('update',(dt:number)=>{time+=dt;const data=latest.current,list=data.players||[],key=list.map(p=>p.id+':'+p.character).join('|')+'|'+data.myId+'|'+data.previewCharacter;
   if(key!==layout){layout=key;actors.forEach(a=>{a.root.destroy();a.materials.forEach(m=>{m.destroy();ownedMaterials.delete(m);});});actors.clear();const n=list.length||6;for(let i=0;i<n;i++){const p=list[i];actors.set(p?.id||'decorative'+i,makeActor(p?.id||'decorative'+i,i,n,p ? p.id===data.myId : i===0,p?(p.character||'regent'):((i===3?data.previewCharacter:variants[i%6])||'regent')));}app.batcher?.generate([actorBatch,furnitureBatch].flatMap(batch=>batch?[batch.id]:[]));cameraAngle=Math.max(0,list.findIndex(p=>p.id===data.myId))*Math.PI*2/n;look=0;}
   world.update(time,Boolean(data.reduced));
   const ca=cameraAngle,kind=presentationKind(data.event?.type);effect=Math.max(0,effect-dt);const shake=!data.reduced&&kind==='bomb'&&effect>.8&&effect<1.6?Math.sin(time*70)*.05:0;camera.setPosition(Math.sin(ca)*4.55+shake,2.4,Math.cos(ca)*4.55);camera.lookAt(Math.sin(ca)*4.55-Math.sin(ca+look)*6,1.27+pitch*4,Math.cos(ca)*4.55-Math.cos(ca+look)*6);
   list.forEach(p=>{const actor=actors.get(p.id);if(!actor)return;if(actor.count!==p.hand_count){actor.cards.children.slice().forEach(c=>c.destroy());actor.count=p.hand_count;const n=Math.min(9,p.hand_count);for(let i=0;i<n;i++){const c=mesh('card back','box',[(i-(n-1)/2)*.1,0,i*.012],[.38,.018,.55],cardBack,actor.cards);c.setLocalEulerAngles(0,0,(i-(n-1)/2)*-7);}}actor.head.setLocalEulerAngles(0,data.reduced?0:Math.sin(time*.65+p.seat)*7,0);const label=labels.current.get(p.id);if(label){camera.camera!.worldToScreen(actor.anchor,projected);const visible=projected.z>0&&projected.x>15&&projected.x<canvas.clientWidth-15&&projected.y>70&&projected.y<canvas.clientHeight-160&&p.id!==data.myId;label.style.display=visible?'flex':'none';label.style.left=projected.x+'px';label.style.top=projected.y+'px';}});
   const king=list.find(p=>p.seat===data.kingSeat),actor=king?actors.get(king.id):actors.get('decorative3');
   // Gestures are presentation only; the authoritative state and private hand stay untouched.
   actors.forEach((guest,id)=>{const p=list.find(p=>p.id===id),royal=p?p.seat===data.kingSeat:id==='decorative3';guest.royal.enabled=royal&&id!==data.myId;guest.turnMarker.enabled=id===data.currentPlayerId;
    const winner=id===data.winnerId,isActor=id===data.event?.actor_id,isTarget=id===data.event?.target_id;
    const gesture=!data.reduced&&effect>0?Math.sin((1-effect/2.2)*Math.PI):0;
    let lean=0,raiseLeft=0,raiseRight=0,spread=0;
    if(winner){raiseLeft=65;raiseRight=65;spread=20;if(!data.reduced)lean=Math.sin(time*3)*3;}
    else if(gesture>0){if(kind==='bomb'){lean=gesture*17;raiseLeft=gesture*25;raiseRight=gesture*25;}
     else if(isTarget&&['parrot','loyal_dog'].includes(kind||'')){lean=-gesture*20;}
     else if(isActor){if(kind==='theft'){lean=-gesture*12;raiseRight=gesture*28;spread=-gesture*10;}
      else if(['gift','transfer','loyal_dog','tax'].includes(kind||'')){raiseRight=gesture*35;spread=gesture*12;}
      else if(['shield','mad_king'].includes(kind||'')){raiseLeft=gesture*48;raiseRight=gesture*48;spread=gesture*17;}
      else if(kind==='parrot'){raiseRight=gesture*45;lean=-gesture*5;}}}
    guest.detail(time,Boolean(data.reduced),p?.seat||0);
    guest.upper.setLocalPosition(0,1.35+(data.reduced?0:Math.sin(time*1.6+(p?.seat||0))*.008),0);
    guest.upper.setLocalEulerAngles(lean,0,0);guest.arms[0].setLocalEulerAngles(raiseLeft,0,-spread);guest.arms[1].setLocalEulerAngles(raiseRight,0,spread);
    if(!data.reduced&&id===data.currentPlayerId&&!gesture&&!winner)guest.head.setLocalEulerAngles(Math.sin(time*1.8)*2,Math.sin(time*.65)*5,0);
   });
   if(actor){const royalCharacter=king?.character||data.previewCharacter;const crownHeight=royalCharacter==='scholar'?3.15:royalCharacter==='jester'?2.97:2.61;crownTo.set(actor.anchor.x,crownHeight,actor.anchor.z);const k=king?.id||'decorative';if(k!==lastKing){crownFrom.copy(crown.getPosition());if(!lastKing)crownFrom.copy(crownTo);lastKing=k;flight=1;}flight=Math.max(0,flight-dt*.85);const u=data.reduced?1:1-flight,v=u*u*(3-2*u);crown.setPosition(pc.math.lerp(crownFrom.x,crownTo.x,v),pc.math.lerp(crownFrom.y,crownTo.y,v)+(data.reduced?0:Math.sin(u*Math.PI)*1.3),pc.math.lerp(crownFrom.z,crownTo.z,v));crown.setEulerAngles(0,data.reduced?0:time*15,0);crown.enabled=!king||king.id!==data.myId;}
   const ev=data.event;if(ev?.id&&ev.id!==lastEvent){lastEvent=ev.id;effect=2.2;if(ev.type!=='transfer'){played.enabled=true;if(!playedMaterials.has(ev.type))playedMaterials.set(ev.type,cardMaterial(false,ev.name||titles[presentationKind(ev.type)]||'SẮC LỆNH'));played.render!.material=playedMaterials.get(ev.type)!;played.setEulerAngles(0,Math.sin(time)*25,0);}}
   const u=1-effect/2.2;
   glints.forEach((g,i)=>{g.enabled=!data.reduced&&flight>0&&crown.enabled;if(g.enabled){const a=i*2.4+time*2,r=(1-flight)*.8;g.setPosition(crown.getPosition().x+Math.sin(a)*r,crown.getPosition().y-.1+Math.cos(a)*r,crown.getPosition().z+Math.cos(a)*r);g.setLocalScale(.025*flight,.04*flight,.025*flight);}});
   const targetActor=ev?.target_id?actors.get(ev.target_id):undefined;
   impact.forEach((g,i)=>{g.enabled=!data.reduced&&effect>0&&['shield','theft','gift','parrot'].includes(kind);if(g.enabled){const a=i*Math.PI/6+u*2,center=targetActor?.anchor||new pc.Vec3(0,2,0),r=.2+u*.7;g.setPosition(center.x*.82+Math.sin(a)*r,1.9+Math.cos(a)*r,center.z*.82+Math.sin(a*2)*.2);g.setLocalScale(.05*(1-u),.1*(1-u),.05*(1-u));}});
   if(played.enabled&&data.reduced){played.setPosition(0,1.47,0);played.setEulerAngles(0,0,0);}
   if(played.enabled&&effect>0&&!data.reduced){const from=ev?.actor_id?actors.get(ev.actor_id)?.anchor:undefined,v=Math.min(1,u*4);played.setPosition((from?.x||0)*.65*(1-v),1.47+Math.sin(v*Math.PI)*.6,(from?.z||0)*.65*(1-v));played.setEulerAngles(v<1?Math.sin(v*Math.PI)*25:0,Math.sin(time-u*2.2)*25+(1-v)*90,0);}
   dice.enabled=kind==='mad_king'&&effect>0;if(dice.enabled){dice.setPosition(0,1.7+(data.reduced?0:Math.abs(Math.sin(u*20))*(1-u)*.8),0);dice.setEulerAngles(data.reduced?0:u*720,data.reduced?0:u*540,data.reduced?0:u*360);}bomb.enabled=kind==='bomb'&&effect>1.4;if(bomb.enabled)bomb.setPosition(0,1.75+(data.reduced?0:Math.abs(Math.sin(u*12))*.5),0);
   smoke.forEach((s,i)=>{s.enabled=!data.reduced&&kind==='bomb'&&effect>0&&effect<1.5;const g=Math.max(0,u-.25);s.setPosition(Math.sin(i*2.4)*g*3,1.5+g*(i%3+1),Math.cos(i*2.4)*g*3);s.setLocalScale(.1+g*1.5,.1+g*1.5,.1+g*1.5);});
   const source=ev?.actor_id?actors.get(ev.actor_id):undefined,dest=ev?.target_id?actors.get(ev.target_id):undefined;
   coins.forEach((c,i)=>{c.enabled=!data.reduced&&effect>0&&['transfer','theft','tax','gift','loyal_dog'].includes(kind||'');if(c.enabled){const center=new pc.Vec3(0,1.5,0),from=kind==='theft'?(dest?.anchor||center):['tax','loyal_dog'].includes(kind||'')?center:(source?.anchor||center),to=['theft','tax'].includes(kind||'')?(source?.anchor||center):(dest?.anchor||center),v=pc.math.clamp(u*1.4-i*.013,0,1);c.setPosition(pc.math.lerp(from.x*.7,to.x*.7,v)+Math.sin(i)*.15,1.6+Math.sin(v*Math.PI)*1.2,pc.math.lerp(from.z*.7,to.z*.7,v));c.setEulerAngles(v*500,i*40,v*200);}});
   const flicker=data.reduced?0:Math.sin(time*8.3)*.09+Math.sin(time*13.7)*.045+Math.sin(time*4.1)*.06;
   flames.forEach((f,i)=>{const scale=flameScales[i],local=data.reduced?1:1+Math.sin(time*9+i*1.7)*.17+Math.sin(time*15+i)*.07;f.setLocalScale(scale.x*(2-local),scale.y*local,scale.z*(2-local));f.setLocalEulerAngles(0,0,data.reduced?0:Math.sin(time*7+i)*5);});if(hearthLight)hearthLight.light!.intensity=4*(1+flicker);candleLight.light!.intensity=(isDay?.45:2.8)*(1+flicker*.6);
   embers.forEach((e,i)=>{e.enabled=isIndoor&&!data.reduced;const u=(time*.23+i/12)%1;e.setPosition(-1.5+Math.sin(i*4+time*.6)*(.3+u*.5),.6+u*2.5,-7.5+Math.cos(i*3)*.3);e.setLocalScale(.018*(1-u),.035*(1-u),.018*(1-u));});
  });
  configureSceneLighting(app);
  const resize=()=>app.resizeCanvas(canvas.clientWidth||window.innerWidth,canvas.clientHeight||window.innerHeight);const observer=new ResizeObserver(resize);observer.observe(canvas);app.start();resize();return()=>{disposeRendering();primitives.dispose();observer.disconnect();canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('contextmenu',context);ownedMaterials.forEach(m=>m.destroy());ownedTextures.forEach(t=>t.destroy());app.destroy();};
 },[sceneId]);
 return <div className="tavern-stage" style={{position:'fixed',inset:0,pointerEvents:'none'}}><canvas className="tavern" ref={ref} style={{width:'100%',height:'100%',pointerEvents:'auto'}} aria-label={`${mapById(sceneId).name}: cảnh 3D và những người chơi ngồi quanh bàn`}/>{failed&&<div role="alert" style={{position:'absolute',top:'35%',left:'30%',right:'30%',padding:24,background:'#271d20',color:'#f2dfb2',pointerEvents:'auto'}}>Trình duyệt chưa mở được bàn 3D. Hãy bật tăng tốc đồ họa trong cài đặt trình duyệt rồi tải lại trang.</div>}<div className="world-labels">{players.filter(p=>p.id!==myId).map(p=><button key={p.id} ref={el=>{if(el)labels.current.set(p.id,el);else labels.current.delete(p.id);}} className={`world-player-label ${p.seat===kingSeat?'royal':''} ${targeting?'target':''} ${selectedTargetId===p.id?'chosen':''}`} style={{position:'absolute',display:'none',transform:'translate(-50%, -100%)',pointerEvents:'auto'}} onClick={()=>onSelectPlayer?.(p.id)} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='move';}} onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('card');if(id)onDropCard?.(id,p.id);}}><strong>{p.seat===kingSeat?'♛ ':''}{p.name}</strong><span>◆ {p.gold.toLocaleString('vi-VN')}{p.knight_count?` · ⛨ ${p.knight_count}`:''}</span></button>)}</div></div>;
}
