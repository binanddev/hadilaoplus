export type Person={id:string;name:string;avatar:number;gentle:boolean};
export type Effect={id:string;actor:string;kind:string;at:number};
export type State={players:Person[];queue:string[];phase:'waiting'|'arrival'|'confession'|'verdict';speaker:string|null;deadline:number;round:number;text:string;effects:Effect[];result:null|{kind:'heaven'|'hell'|'tie';heaven:number;hell:number;same:number};now:number;heaven:number|null;hell:number|null;same:number};
export type Session={id:string;token:string;code:string};
export const avatars=[{name:'Mèo phán quan',icon:'🐱',color:'#ef8dba'},{name:'Ếch chill',icon:'🐸',color:'#92d9a0'},{name:'Quỷ văn phòng',icon:'😈',color:'#bc8df6'},{name:'Thiên thần lỗi',icon:'😇',color:'#ffe5a1'},{name:'Robot hóng hớt',icon:'🤖',color:'#85d8ed'},{name:'Nấm biết tuốt',icon:'🍄',color:'#ff8b79'},{name:'Gấu mất ngủ',icon:'🐻',color:'#c6a182'},{name:'Thỏ drama',icon:'🐰',color:'#e7d6ff'}];
export const reactions=[{id:'water',icon:'💦',label:'Nước thánh'},{id:'egg',icon:'🥚',label:'Khó bênh!'},{id:'heart',icon:'🙏',label:'Cầu nguyện'},{id:'lightning',icon:'⚡',label:'Sét nhẹ'},{id:'same',icon:'🫣',label:'Tui cũng vậy'},{id:'doubt',icon:'💬',label:'Dối lòng!'}];
