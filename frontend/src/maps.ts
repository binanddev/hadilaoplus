export const maps = [
 {id:'tavern',name:'Tửu quán Tro Hồng',time:'Đêm · Trong nhà',description:'Gỗ sồi, lò sưởi và những lời thì thầm.',colors:['#211b24','#a45f30','#e6b768']},
 {id:'island',name:'Đảo Hải Âu',time:'Ngày · Ngoài trời',description:'Hội đồng trên đảo, biển ngọc và thuyền buồm xa.',colors:['#a5d5de','#478c81','#d3bc83']},
 {id:'garden',name:'Vườn Lâu Đài',time:'Ngày · Ngoài trời',description:'Vườn hồng, đài phun nước và cờ gia tộc.',colors:['#bad5d2','#5a8051','#c0ae88']},
 {id:'abbey',name:'Tu Viện Trăng',time:'Đêm · Ngoài trời',description:'Phế tích đá, đom đóm và ánh lửa dưới trăng.',colors:['#121d38','#3c5161','#d79750']},
] as const;
export type MapId=typeof maps[number]['id'];
export function mapById(id?:string){return maps.find(map=>map.id===id)||maps[0]}
