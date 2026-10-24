import * as pc from 'playcanvas';
import type {MapId} from './maps';

export type SceneKit={
 app:pc.Application;
 mat:(hex:string,metal?:number,emissive?:boolean)=>pc.StandardMaterial;
 group:(name:string,parent?:pc.Entity)=>pc.Entity;
 mesh:(name:string,type:'box'|'sphere'|'cylinder'|'cone'|'plane',p:number[],s:number[],m:pc.StandardMaterial,parent?:pc.Entity)=>pc.Entity;
 beam:(a:number[],b:number[],w:number,m:pc.StandardMaterial,parent?:pc.Entity)=>pc.Entity;
 light:(p:number[],color:string,intensity:number,range:number)=>pc.Entity;
};

/** World animation stays local: no game state, audio loop or network traffic. */
export function buildWorld(id:MapId,k:SceneKit){
 const {app,mat,group,mesh,beam,light}=k;
 const root=group('environment '+id),updates:((t:number,reduced:boolean)=>void)[]=[];
 const moving=(name:string,parent=root)=>{const e=group(name,parent);e.tags.add('moving-scenery');return e;};
 const stone=mat('#8b8778'),pale=mat('#b5ad94'),darkStone=mat('#555b59'),wood=mat('#66503a'),bark=mat('#564431'),leaf=mat('#536b3c'),grass=mat('#6b7c48'),gold=mat('#b69858',.55),iron=mat('#333b40',.5),linen=mat('#dfceb0'),wine=mat('#733b46'),water=mat(id==='abbey'?'#253f4d':'#478b8a',.35),flame=mat('#ffb25a',0,true);
 const block=(name:string,p:number[],s:number[],m=stone,parent=root)=>mesh(name,'box',p,s,m,parent);
 const orb=(name:string,p:number[],s:number[],m:pc.StandardMaterial,parent=root)=>mesh(name,'sphere',p,s,m,parent);
 const round=(name:string,p:number[],s:number[],m:pc.StandardMaterial,parent=root)=>mesh(name,'cylinder',p,s,m,parent);
 const alpha=(hex:string,opacity:number)=>{const m=mat(hex,0,true);m.opacity=opacity;m.blendType=pc.BLEND_NORMAL;m.depthWrite=false;m.update();return m;};
 const tree=(x:number,z:number,size=1)=>{const tree=group('old oak',root);tree.setPosition(x,0,z);tree.setLocalScale(size,size,size);round('oak trunk',[0,1.8,0],[.55,3.6,.55],bark,tree);for(let i=0;i<4;i++){const a=i*2.4;beam([0,1.7,0],[Math.sin(a)*1.4,3.1,Math.cos(a)*1.4],.24,bark,tree);orb('oak canopy',[Math.sin(a)*1.1,3.7+(i%2)*.6,Math.cos(a)*1.1],[2.6,2.2,2.7],i%2?leaf:grass,tree);}for(let i=0;i<3;i++)beam([0,.1,0],[Math.sin(i*2.1)*.8,.05,Math.cos(i*2.1)*.8],.22,bark,tree);};
 const flag=(x:number,z:number,color=wine,height=5)=>{round('banner pole',[x,height/2,z],[.08,height,.08],iron);orb('pole finial',[x,height+.1,z],[.2,.25,.2],gold);const banner=moving('windblown heraldic pennant');banner.setPosition(x,height-.3,z);for(let i=0;i<6;i++){const panel=block('stitched flag panel',[.14+i*.24,-.5,0],[.25,1,.035],color,banner);updates.push((t,r)=>{panel.setLocalPosition(.14+i*.24,-.5+(r?0:Math.sin(t*2-i*.65)*.025*i),r?0:Math.sin(t*2-i*.65)*.055*i);});}block('heraldic cross',[.55,-.5,-.025],[.09,.58,.018],linen,banner);block('heraldic cross arms',[.55,-.4,-.027],[.4,.09,.02],linen,banner);};
 const tower=(x:number,z:number,height=8,radius=1.6)=>{round('castle tower',[x,height/2,z],[radius*2,height,radius*2],stone);round('tower cornice',[x,height-.2,z],[radius*2.2,.4,radius*2.2],pale);for(let i=0;i<8;i++){const a=i*Math.PI/4;block('tower battlement',[x+Math.sin(a)*radius*.9,height+.3,z+Math.cos(a)*radius*.9],[.5,.8,.5],pale);}for(const y of [height*.4,height*.7])block('arrow slit',[x,y,z-radius-.01],[.16,.7,.04],darkStone);};
 const lantern=(x:number,z:number,y=1.5)=>{round('lantern pedestal',[x,y/2,z],[.15,y,.15],iron);block('lantern glow',[x,y+.3,z],[.22,.48,.22],flame);for(const side of [-1,1])block('lantern bars',[x+side*.15,y+.3,z],[.035,.6,.32],iron);mesh('lantern roof','cone',[x,y+.68,z],[.55,.25,.55],iron,root);};
 const brazier=(x:number,z:number)=>{round('brazier stem',[x,.5,z],[.2,1,.2],iron);round('brazier bowl',[x,1,z],[.7,.2,.7],iron);const f=moving('brazier flame');f.setPosition(x,1.4,z);for(let i=0;i<3;i++)mesh('tongues of fire','cone',[(i-1)*.15,0,0],[.24,.8,.24],flame,f);const l=light([x,1.8,z],'#ffae62',2.7,8);l.reparent(root);updates.push((t,r)=>{f.setLocalScale(1,r?1:1+Math.sin(t*9+x)*.16,1);l.light!.intensity=2.7*(r?1:1+Math.sin(t*7+z)*.08);});};
 const bird=(index:number,night=false)=>{const b=moving(night?'hunting owl':'circling seagull'),m=night?mat('#9b8c77'):linen;
  orb('bird breast',[0,0,0],[.23,.2,.42],m,b);orb('bird head',[0,.09,-.2],[.18,.18,.18],m,b);mesh('beak','cone',[0,.05,-.32],[.065,.15,.065],gold,b).setLocalEulerAngles(-90,0,0);
  const wings=[-1,1].map(s=>{const w=group('feathered wing',b);w.setLocalPosition(s*.1,0,0);for(let i=0;i<3;i++)block('wing feather',[s*(.15+i*.12),0,i*.04],[.2,.035,.3-i*.035],m,w);return w;});
  updates.push((t,r)=>{const a=t*(night?.09:.12)+index*2.1,rad=night?12:15+index*2;b.setPosition(Math.sin(a)*rad,6+index*.65+Math.sin(a*2)*.5,Math.cos(a)*rad);b.setEulerAngles(0,a*180/Math.PI+90,Math.sin(a)*8);wings.forEach((w,i)=>w.setLocalEulerAngles(0,0,r?i?15:-15:Math.sin(t*4+index)*(i?28:-28)));});};
 const rabbit=(x:number,z:number,index:number)=>{const r=moving('garden rabbit'),fur=mat(index%2?'#a29177':'#ded4bb');orb('rabbit body',[0,.24,0],[.42,.45,.65],fur,r);orb('rabbit head',[0,.47,-.3],[.29,.3,.3],fur,r);for(const side of [-1,1]){orb('rabbit ear',[side*.08,.72,-.26],[.09,.38,.1],fur,r);orb('rabbit eye',[side*.12,.49,-.39],[.04,.045,.03],iron,r);orb('rabbit paw',[side*.16,.09,-.22],[.17,.12,.24],fur,r);}orb('cotton tail',[0,.29,.36],[.18,.18,.18],linen,r);updates.push((t,reduced)=>{const a=t*.25+index,hop=reduced?0:Math.max(0,Math.sin(t*2+index))*.12;r.setPosition(x+Math.sin(a)*.7,hop,z+Math.cos(a)*.45);r.setEulerAngles(0,Math.sin(a)*35,0);});};
 const platform=()=>{round('council stone dais',[0,-.13,0],[13,.3,13],pale);round('dais dark inset',[0,.025,0],[11.8,.025,11.8],stone);for(let i=0;i<24;i++){const a=i*Math.PI/12;const tile=block('radial mosaic',[Math.sin(a)*5.7,.05,Math.cos(a)*5.7],[.42,.025,.7],i%2?darkStone:pale);tile.setLocalEulerAngles(0,i*15,0);}for(let i=0;i<4;i++){const a=i*Math.PI/2;block('dais steps',[Math.sin(a)*6.3,-.25,Math.cos(a)*6.3],[i%2?1.4:3,.25,i%2?3:1.4],stone);}};
 const stars=()=>{const star=mat('#b8c6db',0,true);for(let i=0;i<70;i++){const a=i*2.39996,y=12+(i%9)*1.5;orb('distant star',[Math.sin(a)*43,y,Math.cos(a)*43],[.045,.045,.045],star);}};
 if(id==='tavern')return {update:(_t:number,_r:boolean)=>{},root};
 const daytime=id!=='abbey';
 app.scene.ambientLight=new pc.Color().fromString(daytime?'#879494':'#344256');app.scene.exposure=daytime?.95:.9;
 app.scene.fog.type=pc.FOG_LINEAR;app.scene.fog.color=new pc.Color().fromString(id==='island'?'#b9d8d8':daytime?'#cad7ca':'#172638');app.scene.fog.start=25;app.scene.fog.end=daytime?85:60;
 const sun=group('soft directional '+(daytime?'sun':'moon'),root);sun.addComponent('light',{type:'directional',color:new pc.Color().fromString(daytime?'#ffe3ae':'#9caed2'),intensity:daytime?1.35:.5,castShadows:true,shadowDistance:24,shadowResolution:1024,shadowBias:.25,normalOffsetBias:.06});sun.setEulerAngles(48,-32,0);
 if(daytime){
  orb('soft sun',[-27,28,-48],[3,3,1],mat('#efe2b8',0,true));
  const cloudMat=alpha('#f1eee0',.35);for(let i=0;i<5;i++){const cloud=moving('slow high cloud');for(let j=0;j<3;j++)orb('cloud wisp',[(j-1)*2,0,0],[5,1.2+(j%2)*.5,2.4],cloudMat,cloud);updates.push((t,r)=>cloud.setPosition(Math.sin(i*2.4)*32+(r?0:Math.sin(t*.015+i)*3),14+i%3*2,-25+Math.cos(i*2)*14));}
 }
 platform();
 if(id==='island'){
  const sea=moving('tide'),sand=mat('#c3af7b'),rock=mat('#7a8176');round('ocean',[0,-1.3,0],[170,.2,170],water,sea);round('island sand',[0,-.9,0],[29,1.1,27],sand);round('grassy headland',[0,-.5,1],[23,.7,22],grass);
  for(let i=0;i<20;i++){const a=i*2.4;orb('weathered coastal rock',[Math.sin(a)*12,-.65,Math.cos(a)*11],[2+(i%3),1.8,2],rock);}
  const foam=alpha('#c5e1d7',.24);for(let i=0;i<10;i++){const ripple=round('foam ribbon',[0,0,0],[1,1,1],foam,moving('shore foam'));updates.push((t,r)=>{const u=((r?0:t*.07)+i/10)%1,a=i*2.4;ripple.setPosition(Math.sin(a)*(14+u*3),-1.13,Math.cos(a)*(13+u*3));ripple.setLocalScale(2+u*3,.012,.14+u*.25);ripple.setLocalEulerAngles(0,-a*180/Math.PI,0);});}
  for(let i=0;i<16;i++){const stripe=block('sunlit sea glint',[0,0,0],[1,.015,.06],alpha('#e1e7c2',.23),sea);updates.push((t,r)=>{stripe.setLocalPosition(Math.sin(i*7.3)*35,-1.185,Math.cos(i*2.3)*30);stripe.setLocalScale(.8+(r?.3:Math.sin(t*.8+i)*.7+1),.015,.06);});}
  // A small medieval quay and a clinker-built sailing boat.
  for(let i=0;i<13;i++)block('quay planks',[8+i*.55,-.05,4],[.5,.16,2.1],wood);for(let i=0;i<5;i++)for(const z of [3.1,4.9])round('dock post',[8+i*1.65,-.65,z],[.15,1.9,.15],bark);
  const boat=moving('moored sailboat');for(let i=0;i<5;i++)block('clinker hull strake',[0,i*.1,0],[1.1+i*.17,.12,3-i*.1],i%2?wood:bark,boat);beam([0,.3,1.4],[0,.45,1.9],.12,wood,boat);round('boat mast',[0,2,0],[.09,3.5,.09],wood,boat);block('square linen sail',[0,2.3,0],[2,2.25,.045],linen,boat);beam([-1.15,3.4,0],[1.15,3.4,0],.08,wood,boat);beam([0,3.75,0],[-.7,.4,1],.025,linen,boat);updates.push((t,r)=>{boat.setPosition(16,-.85+(r?0:Math.sin(t)*.08),4);boat.setEulerAngles(0,25,r?0:Math.sin(t*.8)*2);});
  for(const [x,z,s] of [[-9,-5,1],[-8,7,.8],[7,-7,1.1]])tree(x,z,s);
  tower(-14,-20,7,1.5);block('distant keep',[-9,2,-22],[7,5,5],stone);mesh('keep roof','cone',[-9,5.8,-22],[9,3,7],mat('#5a696d'),root);flag(-12,-18,wine,9);flag(7,7,wine,4);flag(-7,-7,wine,4);
  for(let i=0;i<4;i++)bird(i);
 }else if(id==='garden'){
  round('castle lawns',[0,-.3,0],[90,.5,90],grass);block('garden path',[0,-.015,0],[3,.06,38],pale);block('cross path',[0,-.01,0],[35,.06,2.4],pale);
  for(const x of [-12,12]){block('castle curtain wall',[x,2.8,-17],[12,5.6,1.3],stone);for(let i=0;i<10;i++)block('wall crenellation',[x-5.5+i*1.2,5.9,-17],[.7,.8,1.4],pale);tower(x+6,-17,8);}
  for(const x of [-3.5,3.5]){block('gatehouse pier',[x,3.5,-17],[2,7,2.3],pale);flag(x,-15.6,wine,7.5);}block('gate lintel',[0,6.5,-17],[6,1.3,2.2],stone);
  const leaves=[mat('#344f35'),leaf],rose=mat('#a95165');for(const x of [-8.2,8.2])for(const z of [-7.5,7.5]){block('raised rose bed',[x,.18,z],[3.5,.35,2.8],stone);block('clipped box hedge',[x,.6,z],[3.3,.7,2.6],leaves[0]);for(let i=0;i<8;i++){const a=i*2.4;orb('rose blossom',[x+Math.sin(a)*1.3,.99+(i%2)*.14,z+Math.cos(a)],[.23,.18,.23],i%3?rose:linen);}}
  const fx=0,fz=-10;round('fountain basin',[fx,.2,fz],[3.6,.55,3.6],pale);round('fountain pool',[fx,.51,fz],[3.25,.03,3.25],water);round('fountain pillar',[fx,1.05,fz],[.45,1.2,.45],stone);round('upper fountain bowl',[fx,1.6,fz],[1.65,.25,1.65],pale);orb('fountain finial',[fx,1.9,fz],[.38,.5,.38],gold);
  const dropMat=alpha('#b3dde0',.65);for(let i=0;i<18;i++){const drop=orb('falling fountain droplet',[0,0,0],[.04,.12,.04],dropMat,moving('water jet'));updates.push((t,r)=>{const u=((r?.35:t*.65)+i/18)%1,a=i*2.4;drop.setPosition(fx+Math.sin(a)*u*1.5,1.7+Math.sin(u*Math.PI)*1.1-u*.9,fz+Math.cos(a)*u*1.5);});}
  for(const [x,z,s] of [[-13,-7,1.2],[14,8,1.1],[-13,10,1],[11,-10,.9]])tree(x,z,s);
  for(const x of [-7,7])for(const z of [-3,3]){block('garden bench',[x,.65,z],[1.4,.15,.55],wood);for(const d of [-.5,.5])block('bench foot',[x+d,.3,z],[.14,.6,.42],stone);}
  rabbit(8,4,0);rabbit(-8,-3,1);bird(0);
  const butterflyColors=[mat('#dca85d'),mat('#b47791')];for(let i=0;i<7;i++){const b=moving('rose garden butterfly'),wings=[-1,1].map(side=>{const wing=orb('butterfly wing',[side*.08,0,0],[.16,.025,.17],butterflyColors[i%2],b);return wing;});updates.push((t,r)=>{const a=t*.4+i;b.setPosition(Math.sin(i*2)*8+Math.sin(a)*1.2,1.5+Math.sin(a*2)*.5,Math.cos(i*2)*8+Math.cos(a)*1.2);wings.forEach((w,j)=>w.setLocalEulerAngles(0,0,r?0:Math.sin(t*13+i)*(j?60:-60)));});}
 }else{
  round('moonlit moss ground',[0,-.3,0],[110,.5,110],mat('#384941'));for(let i=0;i<35;i++){const a=i*2.4,d=7+(i%7)*2;block('broken courtyard paving',[Math.sin(a)*d,.01,Math.cos(a)*d],[1.3,.07,1.1],i%3?darkStone:stone).setLocalEulerAngles(0,i*17,0);}
  for(const x of [-10,-5,0,5,10]){const h=x===0?5.8:7;round('abbey column',[x,h/2,-12],[.65,h,.65],stone);round('column base',[x,.25,-12],[1.1,.5,1.1],pale);round('column capital',[x,h,-12],[1.1,.4,1.1],pale);}
  for(let x=-10;x<10;x+=5){for(let i=0;i<9;i++){const a=i*Math.PI/8;const e=block('gothic arch stone',[x+2.5-Math.cos(a)*2.5,7+Math.sin(a)*2.2,-12],[.85,.48,.8],stone);e.setLocalEulerAngles(0,0,a*180/Math.PI-90);}}
  for(const x of [-13,13]){block('ruined cloister wall',[x,1.3,-3],[.7,2.6,16],darkStone);for(let i=0;i<4;i++)round('cloister pillar',[x,2.8,-9+i*4],[.65,5.6,.65],stone);}
  for(let i=0;i<12;i++)orb('fallen masonry',[Math.sin(i*2.4)*10,.2,-9+Math.cos(i*2)*2],[.8,.5,1],stone);
  for(const [x,z] of [[-7,-6],[7,-6],[-7,6],[7,6]]){brazier(x,z);lantern(x*.8,z*1.5,1.2);}
  tree(-17,-6,1.4);tree(17,8,1.2);flag(-9,2,wine,5);flag(9,2,wine,5);
  orb('moon disc',[-22,22,-35],[3.5,3.5,.4],mat('#d4d8c2',0,true));orb('moon halo',[-22,22,-35.5],[7,7,.15],alpha('#97acc3',.07));stars();bird(0,true);
  const glow=mat('#c5d79a',0,true);for(let i=0;i<26;i++){const f=orb('firefly',[0,0,0],[.035,.035,.035],glow,moving('firefly trail'));updates.push((t,r)=>{const a=i*2.4;f.setPosition(Math.sin(a)*8+Math.sin(t*.5+i),.8+(i%5)*.35+Math.sin(t*.7+i)*.3,Math.cos(a)*8+Math.cos(t*.4+i));const s=r?.025:.02+(Math.sin(t*2+i)*.5+.5)*.025;f.setLocalScale(s,s,s);});}
  const mist=alpha('#9cadb6',.035);for(let i=0;i<5;i++){const cloud=orb('low drifting mist',[0,.4,-7],[6,.4,2.5],mist,moving('mist drift'));updates.push((t,r)=>cloud.setPosition(Math.sin((r?0:t*.035)+i*2)*11,.3+i*.07,-6+Math.cos(i*2)*6));}
 }
 // Static architecture batches separately from flags, wildlife, water and particles.
 const batch=app.batcher?.addGroup('static '+id,false,12);
 const batchWalk=(e:pc.Entity,dynamic=false)=>{const animated=dynamic||e.tags.has('moving-scenery');if(e.render&&!animated){e.render.batchGroupId=batch?.id??-1;e.render.castShadows=true;}for(const child of e.children)batchWalk(child as pc.Entity,animated);};
 batchWalk(root);app.batcher?.generate();
 return {root,update:(time:number,reduced:boolean)=>{for(const update of updates)update(reduced?0:time,reduced);}};
}
