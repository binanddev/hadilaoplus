export const characters = [
  {id:'regent',name:'Nhiếp chính',title:'Quyền lực sau bức màn',color:'#51334e',detail:'Áo choàng tím trầm · Cổ lông và râu',symbol:'⚜'},
  {id:'rogue',name:'Đạo chích',title:'Một nụ cười, một nhát dao',color:'#367b72',detail:'Mũ trùm xanh · Khăn che mặt',symbol:'🗡'},
  {id:'scholar',name:'Học giả',title:'Biết nhiều hơn những gì nói',color:'#596ca0',detail:'Áo xanh chàm · Mũ nhọn và bím tóc',symbol:'✧'},
  {id:'knight',name:'Hiệp sĩ',title:'Danh dự cũng có thể mua',color:'#84949c',detail:'Giáp bạc · Mũ vòm và giáp má',symbol:'⛨'},
  {id:'merchant',name:'Thương gia',title:'Mọi lời thề đều có giá',color:'#a5783c',detail:'Áo nâu · Mũ mềm và túi tiền',symbol:'◆'},
  {id:'jester',name:'Hề cung đình',title:'Kẻ cười cuối cùng',color:'#6f303c',detail:'Áo đỏ rượu và xanh · Mũ hai chóp',symbol:'♢'},
] as const;
export type CharacterId = typeof characters[number]['id'];
export function characterById(id?:string){return characters.find(c=>c.id===id)||characters[0]}
export function storedCharacter():CharacterId {try{return characterById(localStorage.getItem('ngai-vang-character')||'').id}catch{return 'regent'}}
