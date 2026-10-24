import type {Game} from './types';
type PublicStatus=Pick<Game,'players'|'phase'|'president_id'|'chancellor_id'|'nominee_id'|'host_id'|'voted_ids'|'power'|'power_used'>;

export function buildActionLabels(game:PublicStatus):Record<string,string> {
  const labels:Record<string,string>={};
  for(const player of game.players){
    const president=player.id===game.president_id;
    const chancellor=player.id===game.chancellor_id;
    const title=president?'Tổng thống':chancellor?'Thủ tướng':'Đại biểu';
    const subject=`${title} ${player.name}`;
    let action='đang quan sát hội đồng';
    if(!player.alive)action='đã bị loại · đang quan sát';
    else if(game.phase==='lobby')action=player.ready?'đã sẵn sàng':'đang chờ khai cuộc';
    else if(game.phase==='nomination'&&president)action='đang đề cử thủ tướng';
    else if(game.phase==='voting')action=game.voted_ids.includes(player.id)?'đã niêm phong phiếu':'đang bỏ phiếu tín nhiệm';
    else if(game.phase==='president_discard'&&president)action='đang chọn chính sách trong hồ sơ kín';
    else if(game.phase==='chancellor_discard'&&chancellor)action='đang chọn chính sách để ban hành';
    else if(game.phase==='veto'&&president)action='đang trả lời đề nghị phủ quyết';
    else if(game.phase==='veto'&&chancellor)action='đang chờ quyết định phủ quyết';
    else if(game.phase==='executive'&&president)action=game.power_used?'đang cất hồ sơ kín':game.power==='execution'?'đang chọn người hành quyết':game.power==='investigate'?'đang điều tra đảng tịch':game.power==='special_election'?'đang chỉ định tổng thống đặc biệt':'đang xem ba chính sách';
    else if(game.phase==='finished')action='đang xem kết quả ván chơi';
    labels[player.id]=`${subject} ${action}`;
  }
  return labels;
}
