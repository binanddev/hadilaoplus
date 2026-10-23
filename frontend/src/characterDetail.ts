import * as pc from 'playcanvas';
import type {SceneKit} from './worlds';

/** Layered costume geometry on the existing articulated seated characters. */
export function detailCharacter(k:SceneKit,kind:string,head:pc.Entity,upper:pc.Entity,arms:pc.Entity[],root:pc.Entity,flesh:pc.StandardMaterial,cloth:pc.StandardMaterial){
 const {mesh,beam,mat,group}=k;
 const gold=mat('#c5a263',.65),silver=mat('#a8b0b0',.7),leather=mat('#49382c'),ivory=mat('#d9cbaa'),hair=mat(kind==='scholar'?'#9b7954':kind==='merchant'?'#49352a':'#352b28'),lip=mat('#a77663'),paleSkin=mat('#d4aa8b'),dark=mat('#272e31');
 const orb=(name:string,p:number[],s:number[],m:pc.StandardMaterial,parent=head)=>mesh(name,'sphere',p,s,m,parent);
 const box=(name:string,p:number[],s:number[],m:pc.StandardMaterial,parent=upper)=>mesh(name,'box',p,s,m,parent);
 // Cheek planes, chin, lips and a softly modelled nose replace a flat block face.
 for(const side of [-1,1]){
  orb('cheekbone',[side*.15,-.055,-.19],[.14,.13,.075],flesh);
  orb('ear inner',[side*.286,-.015,-.015],[.025,.09,.06],lip);
  orb('upper eyelid',[side*.105,.07,-.216],[.12,.035,.04],flesh);
  orb('lower eyelid',[side*.105,.002,-.217],[.105,.02,.03],flesh);
  orb('nostril',[side*.032,-.062,-.29],[.024,.017,.02],lip);
 }
 orb('nose tip',[0,-.04,-.302],[.085,.07,.075],flesh);
 orb('lower lip',[0,-.145,-.23],[.105,.026,.024],lip);
 orb('chin',[0,-.21,-.165],[.2,.09,.1],flesh);
 if(!['rogue','knight'].includes(kind))for(let i=0;i<11;i++){
  const a=(i/10-.5)*Math.PI;const lock=orb('swept hair lock',[Math.sin(a)*.22,.205+Math.cos(a)*.035,-.035-Math.cos(a)*.17],[.105,.13,.15],hair);lock.setLocalEulerAngles(0,i*13,25);
 }
 // Seams, closures and lacing give each garment a constructed silhouette.
 for(const side of [-1,1]){
  beam([side*.22,.3,-.225],[side*.2,-.25,-.23],.014,kind==='knight'?silver:gold,upper);
  for(let i=0;i<4;i++)box('belt stitching',[side*(.1+i*.06),-.33,-.231],[.018,.008,.008],ivory);
 }
 for(let i=0;i<5;i++)orb('tunic fastener',[.045,.24-i*.105,-.24],[.033,.033,.022],gold,upper);
 box('belt buckle inset',[0,-.33,-.275],[.08,.057,.012],leather);
 const chain=(x:number)=>{for(let i=0;i<8;i++)orb('chain link',[x+(i-3.5)*.05,.32-Math.sin(i/7*Math.PI)*.15,-.265],[.033,.035,.022],gold,upper);};
 if(kind==='regent'){
  chain(0);orb('ruby pendant',[0,.14,-.28],[.08,.1,.04],mat('#93434b',.4),upper);
  for(const side of [-1,1])for(let i=0;i<7;i++){orb('mantle fur tuft',[side*(.15+i*.04),.34-(i%2)*.045,.1-(i%3)*.16],[.14,.14,.15],ivory,upper);}
  for(let i=0;i<6;i++)orb('braided beard lock',[(i-2.5)*.05,-.22+Math.abs(i-2.5)*.01,-.2],[.06,.17,.08],hair);
  for(const side of [-1,1])box('velvet lapel',[side*.22,.02,-.24],[.075,.58,.025],mat('#83536c'));
 }else if(kind==='rogue'){
  for(const side of [-1,1])beam([side*.24,.26,-.15],[side*.28,-.27,-.2],.055,leather,upper);
  for(let i=0;i<4;i++)box('leather pouch',[(i-1.5)*.12,-.43,-.24],[.09,.15,.1],leather);
  const blade=group('sheathed dagger',upper);blade.setLocalPosition(-.36,-.3,-.02);blade.setLocalEulerAngles(0,0,-20);box('dagger sheath',[0,-.17,0],[.065,.35,.07],leather,blade);box('dagger crossguard',[0,.02,0],[.18,.035,.08],silver,blade);box('dagger grip',[0,.1,0],[.06,.15,.07],leather,blade);orb('dagger pommel',[0,.2,0],[.08,.08,.08],silver,blade);
  for(let i=0;i<5;i++)box('mask seam',[(i-2)*.065,-.12,-.282],[.025,.008,.007],ivory,head);
 }else if(kind==='scholar'){
  for(const side of [-1,1]){mesh('spectacle lens','cylinder',[side*.11,.035,-.25],[.15,.012,.15],gold,head).setLocalEulerAngles(90,0,0);orb('spectacle dark glass',[side*.11,.035,-.26],[.115,.1,.01],dark);orb('eye glint',[side*.1,.05,-.27],[.03,.027,.012],ivory);}
  beam([-.035,.04,-.265],[.035,.04,-.265],.012,gold,head);
  box('book pages',[.29,-.4,-.322],[.17,.25,.016],ivory);for(const y of [-.49,-.42,-.35])box('book page strokes',[.29,y,-.334],[.14,.006,.008],gold);
  for(let i=0;i<4;i++)orb('hat embroidered star',[(i-1.5)*.085,.42+(i%2)*.1,-.2],[.028,.035,.012],gold);
  for(const side of [-1,1])box('embroidered stole',[side*.21,.04,-.25],[.07,.65,.035],gold);
 }else if(kind==='knight'){
  for(const side of [-1,1]){
   for(let i=0;i<3;i++)box('overlapping shoulder lames',[side*(.32+i*.05),.29-i*.065,-.09],[.18,.08,.39],silver);
   for(let i=0;i<4;i++)orb('breastplate rivet',[side*.23,.23-i*.13,-.285],[.028,.028,.02],gold,upper);
   for(let i=0;i<5;i++)orb('chainmail coif link',[side*.22,-.13-i*.025,-.06],[.045,.036,.03],silver);
  }
  for(let i=0;i<5;i++)box('visor ventilation slit',[(i-2)*.07,.11,-.317],[.025,.026,.012],dark,head);
  const shield=group('heater shield',root);shield.setLocalPosition(.7,.9,.35);shield.setLocalEulerAngles(0,-25,8);orb('curved shield',[0,0,0],[.53,.8,.12],silver,shield);box('shield face',[0,.02,-.07],[.4,.55,.03],cloth,shield);box('shield cross',[0,.03,-.095],[.055,.4,.02],gold,shield);box('shield crossbar',[0,.08,-.1],[.27,.05,.02],gold,shield);
 }else if(kind==='merchant'){
  chain(0);for(const side of [-1,1])box('brocade waistcoat panel',[side*.18,-.04,-.25],[.17,.62,.04],mat('#986b3d'));
  for(let i=0;i<6;i++)orb('purse stitch',[.28+i*.026,-.25,-.275],[.017,.022,.012],ivory,upper);
  box('purse clasp',[.35,-.2,-.22],[.2,.06,.08],gold);
  for(const side of [-1,1])orb('curled moustache tip',[side*.17,-.1,-.26],[.09,.06,.05],hair);
  const feather=group('cap feather',head);for(let i=0;i<6;i++)orb('feather vane',[.26+i*.019,.37+i*.035,.04],[.07,.06,.045],ivory,feather);
 }else{
  for(let i=0;i<6;i++){const patch=box('jester diamond',[(i%2)*.22-.1,.25-Math.floor(i/2)*.19,-.235],[.09,.13,.025],i%2?gold:ivory);patch.setLocalEulerAngles(0,0,45);}
  for(const side of [-1,1])for(let i=0;i<4;i++)orb('ruff bell',[side*(.15+i*.055),.39,-.25],[.045,.055,.04],gold,upper);
  orb('painted nose',[0,-.025,-.33],[.09,.09,.07],mat('#a84d4f'));
 }
 for(const [i,arm] of arms.entries()){
  const side=i===0?-1:1;
  box('tailored cuff',[side*.025,-.23,-.65],[.21,.15,.1],kind==='knight'?silver:ivory,arm);
  for(let f=0;f<4;f++)orb('individual finger',[(f-1.5)*.039,-.225,-.91],[.035,.075,.14],flesh,arm);
  orb('thumb',[side*.1,-.21,-.81],[.06,.08,.12],flesh,arm);
  orb('signet ring',[-.02,-.19,-.91],[.045,.025,.035],kind==='merchant'||kind==='regent'?gold:leather,arm);
 }
 // Personal drinking vessel and plate stay on the table, not in the private hand.
 mesh('pewter goblet foot','cylinder',[.65,1.46,-1.15],[.15,.03,.15],silver,root);
 mesh('goblet stem','cylinder',[.65,1.54,-1.15],[.04,.16,.04],silver,root);
 mesh('goblet bowl','cone',[.65,1.69,-1.15],[.18,.21,.18],silver,root).setLocalEulerAngles(180,0,0);
 mesh('personal bread plate','cylinder',[-.72,1.45,-1.25],[.3,.02,.3],ivory,root);
 orb('bread roll',[-.72,1.49,-1.25],[.2,.09,.13],mat('#a87b4e'),root);
 const eyes=head.children.filter(c=>['eye white','pupil'].includes(c.name)).map(c=>({entity:c as pc.Entity,scale:c.getLocalScale().clone()}));
 return (t:number,reduced:boolean,index:number)=>{const blink=!reduced&&Math.sin(t*.72+index*1.7)>.996;for(const eye of eyes)eye.entity.setLocalScale(eye.scale.x,eye.scale.y*(blink?.08:1),eye.scale.z);};
}
