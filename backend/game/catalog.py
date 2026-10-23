"""Finite, role-specific catalog adapted from the supplied official print-and-play.

See docs for attribution and the documented web adaptations. The two Sub Rosa
variants intentionally remain distinct: the noble steals, the king discards.
"""

def opt(ident, label, target='none', amounts=None):
    value = dict(id=ident, label=label, target=target)
    if amounts:
        value['amounts'] = amounts
    return value


def entry(ident, name, english, count, description, *options):
    return dict(id=ident, name=name, name_en=english, count=count,
                role='king' if ident.startswith('k_') else 'noble',
                description=description, target=options[0]['target'], options=list(options))


_ROWS = [
    entry('n_actors','Diễn viên','Actors',3,'Mọi người cảm ơn vua dù bị cai trị tàn nhẫn, hoặc cùng cười một người.',opt('thanks','Cảm ơn vua'),opt('laugh','Cười một người','player')),
    entry('n_allies','Đồng minh','Allies',3,'Quý tộc chọn: bạn nhận 100 từ ngân khố hoặc bạn mất 200.',opt('default','Chọn đồng minh','noble')),
    entry('n_bad_blood','Mối thù','Bad Blood',3,'Chọn hai quý tộc. Bạn nhận 200 mỗi vòng đến khi một người trả người kia 200; hòa giải được ngoài lượt.',opt('default','Gây hiềm khích','two_nobles')),
    entry('n_beggars_blessing','Phúc cho kẻ nghèo','Beggar’s Blessing',3,'Mỗi quý tộc có tối đa 300 vàng nhận 200 từ ngân khố.',opt('default','Ban phúc')),
    entry('n_betrayal','Phản bội','Betrayal',4,'Lấy toàn bộ vàng một quý tộc khi có một quý tộc khác ủng hộ. Không dùng vòng đầu; hiệp sĩ thật chặn được.',opt('default','Kêu gọi phản bội','noble')),
    entry('n_betray_the_king','Phản vua','Betray the King',2,'Cần hai người ủng hộ; không dùng vòng đầu. Vua đổ 1–3: đổi vàng/ngôi; 4–6: vua nhận 200.',opt('default','Lật đổ vua','king')),
    entry('n_council_meeting','Hội đồng','Council Meeting',3,'Mọi người đồng ý: lấy 100 của vua. Có người phản đối: mất 100. Hoặc rút hai bài và ca ngợi vua.',opt('vote','Biểu quyết'),opt('draw','Rút hai và ca ngợi')),
    entry('n_divine_right','Thiên mệnh','Divine Right',1,'Có tối đa 300 và đổ 5–6: nhận 1200. Chỉ dùng/bỏ trong hai vòng cuối.',opt('default','Cầu thiên mệnh')),
    entry('n_grudge','Oán hận','Grudge',2,'Chọn người phê chuẩn lấy 200 từ một quý tộc; từ chối thì bạn mất 100.',opt('default','Xin phê chuẩn','player')),
    entry('n_helping_hand','Bàn tay trợ giúp','Helping Hand',3,'Rút hai bài và tăng một lần đánh trong lượt này.',opt('default','Nhận trợ giúp')),
    entry('n_hindsight','Tiên liệu','Hindsight',2,'Dự đoán quý tộc dùng Phản bội trước cuối vòng kế. Đúng nhận 300, sai mất 100.',opt('default','Dự đoán','noble')),
    entry('n_icarus','Icarus','Icarus',2,'Đổ 4–6: mỗi quý tộc trả bạn 100. Nếu không, trả mỗi người 100. Phải đủ cho kết quả xấu.',opt('default','Thử vận may')),
    entry('n_indebted','Mắc nợ','Indebted',2,'Đổ 3–6: quý tộc trả bạn 100 mỗi vòng đến khi người khác trả bạn 200; hết nợ khi chủ nợ làm vua.',opt('default','Ghi nợ','noble')),
    entry('n_isolation','Cô lập','Isolation',3,'Đến hết lượt kế: không ai xem bài, hoặc không ai lấy vàng của bạn (trừ Phản bội).',opt('cards','Giấu bài'),opt('gold','Giữ vàng')),
    entry('n_king_maker','Kẻ dựng vua','King Maker',2,'Dùng ngoài lượt khi có Phản vua: cộng/trừ 1 xúc xắc vua. Phe bạn thua thì mất 300.',opt('default','Dùng trong Phản vua')),
    entry('n_knight','Hiệp sĩ','Knight',2,'Đặt úp trước một người để chặn một Phản bội; người đó không được xem.',opt('default','Bố trí hiệp sĩ','player')),
    entry('n_loyalty','Lòng trung thành','Loyalty',3,'Quý tộc chọn trả bạn 100 hoặc ép vua trả. Hoặc ép người trả vua 100 và tuyên thệ.',opt('collect','Đòi trung thành','noble'),opt('pledge','Cống nạp vua','player')),
    entry('n_meat_for_meat','Ăn miếng trả miếng','Meat for Meat',4,'Bạn và quý tộc đổ xúc xắc. Bạn cao hơn thì lấy 200 từ họ.',opt('default','Đấu xúc xắc','noble')),
    entry('n_peoples_champion','Nhà vô địch nhân dân','People’s Champion',1,'Chỉ vòng cuối. Mọi quý tộc khác đồng ý thì ứng viên đấu xúc xắc với vua giành ngôi.',opt('default','Đề cử','noble')),
    entry('n_royal_bomb','Bom hoàng gia','Royal Bomb',1,'Mọi người trừ vua mất vàng. Không thể bị trộm; chỉ bỏ/tặng khi thương lượng; tự bỏ khi thành vua.',opt('default','Kích nổ')),
    entry('n_scout','Trinh sát','Scout',2,'Dự đoán quý tộc làm vua cuối vòng kế. Đúng nhận 300, sai mất 100.',opt('default','Dự đoán ngai vàng','noble')),
    entry('n_shadow_deal','Giao kèo bóng tối','Shadow Deal',5,'Tặng một người (kể cả vua) 100 hoặc 200 từ ngân khố.',opt('default','Tặng vàng','player',[100,200])),
    entry('n_sub_rosa','Mật thám','Sub Rosa',5,'Xem tay bài hoặc một hiệp sĩ úp; đổ 4+ được lấy một bài trên tay.',opt('hand','Xem tay bài','player'),opt('knight','Xem hiệp sĩ','player')),
    entry('n_subsidies','Trợ cấp','Subsidies',3,'Quý tộc có 0 nhận 300; có 100–300 nhận 200; có 400–500 nhận 100.',opt('default','Phát trợ cấp')),
    entry('n_suppress_rebellion','Đàn áp nổi loạn','Suppress Rebellion',2,'Vua đổ 1–3: ngân khố cho bạn 200 và quý tộc khác 100.',opt('default','Thách thức vua')),
    entry('n_tithe','Thuế thập phân','Tithe',2,'Chọn người để họ chỉ định quý tộc phải đưa bạn 100.',opt('default','Chỉ định người thu thuế','player')),
    entry('n_unprotected','Không còn bảo hộ','Unprotected',2,'Đổ 5–6: bỏ mọi hiệp sĩ úp, trừ hiệp sĩ trước bạn.',opt('default','Phá bảo hộ')),
    entry('n_wrath','Thịnh nộ','Wrath',4,'Mất 100 để một quý tộc mất 300; hoặc làm một người mất 100 cho ngân khố.',opt('sacrifice','Hy sinh 100','noble'),opt('fine','Phạt 100','player')),
    entry('k_black_plague','Dịch hạch','Black Plague',1,'Quý tộc ghép đôi: nếu một người đổ 1 thì cả đôi mất 200. Vua đổ với người lẻ nhưng vua không mất vàng.',opt('default','Gọi dịch hạch')),
    entry('k_eye_for_an_eye','Mắt đền mắt','Eye for an Eye',1,'Bạn mất 100 cho ngân khố; người bạn chọn mất 300.',opt('default','Trừng phạt','player')),
    entry('k_bend_the_knee','Quỳ gối','Bend the Knee',2,'Ép người cảm ơn bạn. Từ chối trả 300; không đủ thì buộc phải cảm ơn.',opt('default','Yêu cầu cảm ơn','player')),
    entry('k_helping_hand','Bàn tay trợ giúp','Helping Hand',1,'Rút hai bài và tăng một lần đánh trong lượt này.',opt('default','Nhận trợ giúp')),
    entry('k_knight','Hiệp sĩ','Knight',1,'Đặt úp trước một người để chặn một Phản bội; người đó không được xem.',opt('default','Bố trí hiệp sĩ','player')),
    entry('k_anchor','Mỏ neo','Anchor',2,'Người bị chọn mất 200 cho ngân khố hoặc để người bạn chỉ định trả bạn 100.',opt('default','Áp đặt lựa chọn','two_players')),
    entry('k_loyal_dog','Chó trung thành','Loyal Dog',3,'Tặng 100–300 từ ngân khố; người nhận phải đọc lời thề trung thành.',opt('default','Ban thưởng','player',[100,200,300])),
    entry('k_mad_king','Vua điên','Mad King',1,'Mọi người đổ: số 1 mất 300; riêng người dùng bài đổ 1 mất 500.',opt('default','Tung xúc xắc')),
    entry('k_debt_collector','Người đòi nợ','Debt Collector',2,'Chọn người để họ chỉ định ai phải mất 200 cho ngân khố.',opt('default','Cử người đòi nợ','player')),
    entry('k_royal_parrot','Vẹt hoàng gia','Royal Parrot',2,'Trả 100 rồi nhại câu vua giọng cao; từ chối phạt thêm 300.',opt('default','Bắt nhại lời','player')),
    entry('k_shifting_tides','Đổi chiều gió','Shifting Tides',1,'Hai quý tộc chỉ được lấy vàng của nhau đến lượt kế của bạn; Phản bội không bị giới hạn.',opt('default','Ràng buộc hai người','two_nobles')),
    entry('k_snakes','Bầy rắn','Snakes',1,'Chỉ cần một quý tộc giơ tay thì người được chọn mất 300.',opt('default','Xin biểu quyết','player')),
    entry('k_sub_rosa','Mật thám hoàng gia','Sub Rosa',2,'Xem tay người khác; đổ 4+ được bỏ một lá của họ.',opt('default','Xem và phá bài','player')),
    entry('k_scapegoat','Vật tế thần','Scapegoat',1,'Mỗi quý tộc lần lượt bầu quý tộc khác mất 300; hòa phân bằng xúc xắc.',opt('default','Bỏ phiếu')),
    entry('k_kings_eye','Mắt của vua','King’s Eye',2,'Bảo vệ người đến lượt kế: quý tộc xem bài hoặc lấy vàng của họ trả ngân khố 100.',opt('default','Đặt dưới mắt vua','player')),
    entry('k_we_ride_together','Cùng hội cùng thuyền','We Ride Together',2,'Hai người đổ lại nếu hòa; người thấp mất 200. Sau khi đổ có thể cùng đồng ý mỗi người mất 100.',opt('default','Chọn hai người','two_players')),
]
CARDS = {row['id']: row for row in _ROWS}
CARDS['n_knight']['target']='none'
CARDS['n_knight']['options']=[opt('default','Bố trí hiệp sĩ trước mình')]
CARDS['k_knight']['target']='noble'
CARDS['k_knight']['options']=[opt('default','Bảo vệ một quý tộc','noble')]
CARDS['n_grudge']['target']='two_players'
CARDS['n_grudge']['options']=[opt('default','Chọn người phê chuẩn và quý tộc bị lấy vàng','two_players')]
CARDS['n_grudge']['options'][0]['second_target']='noble'
CARDS['n_loyalty']['options'][0]['target']='player'
CARDS['n_loyalty']['target']='player'
for ident in ('n_helping_hand','k_helping_hand'):
    CARDS[ident]['description']='Rút hai bài; lá này không tính lượt và được đánh thêm một lá (ngân sách lượt tăng hai sau khi hạ bài).'
for ident in ('n_hindsight','n_scout','n_bad_blood','n_peoples_champion','k_shifting_tides','k_kings_eye','k_we_ride_together'):
    for option in CARDS[ident]['options']:
        option['allow_self']=True
for definition in CARDS.values():
    for option in definition['options']:
        if option['target'] in ('two_players','two_nobles'):
            option['allow_self_second']=True
CARDS['k_anchor']['options'][0]['allow_self_second']=False
CARDS['n_grudge']['options'][0]['allow_self_second']=False
assert len(CARDS) == 44
assert sum(c['count'] for c in _ROWS if c['role']=='noble') == 74
assert sum(c['count'] for c in _ROWS if c['role']=='king') == 25
