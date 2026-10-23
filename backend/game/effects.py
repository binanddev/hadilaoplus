"""Server-side effects and private decision windows for the printed card set.

Randomness and all gold changes are authoritative. Pending records contain
internal continuation data; only sanitize_pending may be sent to clients.
"""
import copy
import random
import time
import uuid
from .catalog import CARDS


def core():
    from . import engine
    return engine


def records(s):
    return s.setdefault('effects', [])


def nobles(s):
    return [p for p in s['players'] if p['id'] != s['king_id']]


def who(s, pid):
    p = core().get_player(s, pid)
    core().require(p is not None, 'Người chơi không hợp lệ.')
    return p


def choice(ident, label, **kwargs):
    return dict(id=ident, label=label, **kwargs)


YES_NO = [choice('yes', 'Đồng ý'), choice('no', 'Không đồng ý')]


def pending(s, kind, actor, eligible, text, choices=None, **internal):
    ids = [p['id'] if isinstance(p, dict) else p for p in eligible]
    s['pending'] = dict(id=uuid.uuid4().hex,kind=kind, actor_id=actor['id'], player_id=ids[0] if len(ids)==1 else None,
                        eligible_ids=ids, text=text, choices=choices or YES_NO,
                        votes={}, **internal)
    s['deadline'] = time.time() + 40


def mark(s, kind, owner, target=None, card=None, **kwargs):
    item = dict(id=uuid.uuid4().hex, kind=kind, owner_id=owner['id'],
                target_id=target['id'] if isinstance(target, dict) else target,
                **kwargs)
    if card:
        item['card'] = copy.deepcopy(card)
    records(s).append(item)
    return item


def roll(s, p):
    value = random.randint(1, 6)
    core().log(s, f"{p['name']} đổ {value}.")
    return value


def target(s, action, second=False):
    return who(s, action.get('second_target_id' if second else 'target_id'))


def knights(p):
    return p.setdefault('attachments', {}).setdefault('knights', [])


def metadata(card):
    return copy.deepcopy(card) | {k:copy.deepcopy(v) for k,v in CARDS[card['type']].items() if k not in ('id','count')}


def validate(s, p, card, action):
    """Run before consuming a card. No validation failure mutates the state."""
    definition = CARDS[card['type']]
    key = card['type']
    if action.get('as_knight'):
        core().require(p['id']!=s['king_id'],'Chỉ quý tộc có thể giả hiệp sĩ trước mình.')
        core().require(key != 'n_royal_bomb', 'Bom không được giả làm hiệp sĩ.')
        core().require(not action.get('target_id') or action['target_id']==p['id'],'Hiệp sĩ giả của quý tộc chỉ đặt trước mình.')
        validate_discard(s,p,card)
        return
    options = definition['options']
    selected = action.get('option_id', options[0]['id'])
    opt = next((o for o in options if o['id']==selected), None)
    core().require(opt is not None, 'Lựa chọn lá bài không hợp lệ.')
    t = opt['target']
    if t != 'none':
        a = who(s, s['king_id']) if t=='king' else target(s, action)
        if t in ('noble','two_nobles'):
            core().require(a['id'] != s['king_id'], 'Phải chọn quý tộc.')
        if not opt.get('allow_self'):
            core().require(a['id'] != p['id'], 'Hãy chọn người chơi khác.')
        if t in ('two_nobles','two_players'):
            b = target(s, action, True)
            core().require(a['id'] != b['id'], 'Phải chọn hai người khác nhau.')
            core().require(opt.get('allow_self_second',True) or b['id']!=p['id'],'Người trả vàng phải khác người nhận.')
            if t=='two_nobles':
                core().require(b['id'] != s['king_id'], 'Phải chọn hai quý tộc.')
            if key=='n_grudge':
                core().require(b['id']!=s['king_id'] and b['id']!=p['id'],'Chọn một quý tộc khác để lấy vàng.')
    if 'amounts' in opt:
        amount = action.get('amount', opt['amounts'][0])
        core().require(type(amount) is int and amount in opt['amounts'], 'Mức vàng không hợp lệ.')
    if key in ('n_betrayal','n_betray_the_king'):
        core().require(s['round']>1, 'Không được phản bội trong vòng đầu.')
    if key=='n_peoples_champion':
        core().require(s['round']==s['settings']['rounds'], 'Chỉ dùng Nhà vô địch nhân dân ở vòng cuối.')
    if key=='n_divine_right':
        core().require(s['round']>=s['settings']['rounds']-1 and p['gold']<=300, 'Thiên mệnh chỉ dùng trong hai vòng cuối khi có tối đa 300 vàng.')
    if key=='n_icarus':
        core().require(p['gold']>=100*len([q for q in nobles(s) if q['id']!=p['id']]), 'Không đủ vàng để trả kết quả xấu nhất.')
    if key=='n_king_maker':
        core().require(False, 'Kẻ dựng vua chỉ dùng ngoài lượt trong cửa sổ Phản vua.')
    if key in ('n_sub_rosa','k_sub_rosa'):
        _check_inspection(s, p, target(s, action), charge=False)
        if selected=='knight':
            core().require(knights(target(s, action)), 'Người đó không có hiệp sĩ úp.')


def _check_inspection(s, actor, victim, charge=True):
    for item in records(s):
        if item['kind']=='isolation_cards' and item['owner_id']==victim['id']:
            core().require(actor['id']==victim['id'], 'Người này đang được Cô lập bảo vệ bài.')
    if charge:
        _eye_fee(s, actor, victim)


def _eye_fee(s, actor, victim):
    if actor['id']==s['king_id'] or actor['id']==victim['id']:
        return
    for item in records(s):
        if item['kind']=='kings_eye' and item['target_id']==victim['id']:
            core().lose(s, actor, 100)
            core().log(s, f"{actor['name']} trả 100 vì Mắt của vua.")


def guard_transfer(s, source, recipient, amount, reason='take'):
    if reason in ('deal','negotiation','gift','settle'):
        return amount
    for item in records(s):
        if reason!='betrayal' and item['kind']=='isolation_gold' and item['owner_id']==source['id']:
            core().require(False, 'Cô lập đang bảo vệ vàng của người này.')
        if reason!='betrayal' and item['kind']=='shifting_tides':
            pair = [item['target_id'],item['other_id']]
            if recipient['id'] in pair:
                core().require(source['id'] in pair, 'Đổi chiều gió: chỉ được lấy vàng từ người cùng cặp.')
    _eye_fee(s, recipient, source)
    return amount


def _discard_record(s, item):
    if item.get('card'):
        core().discard(s, item['card'])
    if item in records(s):
        records(s).remove(item)


def _social(s, actor, victim, text, penalty=0, mandatory=False):
    if not s['settings'].get('challenge_cards',True):
        core().log(s,'Đã bỏ phần đọc lời theo cấu hình bàn; hiệu ứng vàng vẫn áp dụng.')
        return
    options = [choice('accept','Tôi đã đọc')]
    if not mandatory:
        options.append(choice('refuse',f'Từ chối · phạt {penalty} vàng'))
    pending(s,'social',actor,[victim],text,options,penalty=penalty,mandatory=mandatory)


def _prediction(s, p, victim, kind, card):
    mark(s,kind,p,victim,card,due_round=s['round']+1,hit=False)


def _support(s, p, victim, key):
    eligible = [q for q in nobles(s) if q['id']!=p['id']]
    pending(s,'support',p,eligible,'Bạn có ủng hộ cuộc phản bội này không?',target_id=victim['id'],card_type=key)


def _knight_blocks(s, victim):
    cards = knights(victim)
    if not cards:
        return False
    # Resolve exactly the oldest facedown protection per attempted betrayal.
    # A bluff is exposed and discarded but cannot consume a second protection.
    item = cards.pop(0)
    core().discard(s,dict(id=item['id'],type=item['type']))
    genuine = item['type'] in ('n_knight','k_knight')
    core().log(s,f"Hiệp sĩ của {victim['name']}: {'thật — chặn Phản bội' if genuine else 'giả — không chặn được'}.")
    return genuine


def _swap_crown_gold(s, challenger, king):
    challenger['gold'],king['gold'] = king['gold'],challenger['gold']
    # Role changes even on a wealth tie; normal crown checks then apply.
    core().crown(s,forced_id=challenger['id'])
    core().log(s,f"{challenger['name']} đổi ngôi và vàng với {king['name']}!")


def _duel(s,a,b):
    # Bound rerolls so deterministic tests with a constant die cannot hang.
    for _ in range(100):
        av,bv=roll(s,a),roll(s,b)
        if av!=bv:
            return a if av<bv else b
    core().require(False,'Xúc xắc hòa quá nhiều lần; hãy thử lại hành động.')


def resolve(s, p, card, action):
    """Apply a validated play. True means the physical card remains attached."""
    e=core(); key=card['type']; definition=CARDS[key]
    option_id=action.get('option_id',definition['options'][0]['id'])
    t=who(s,action['target_id']) if action.get('target_id') else None
    second=who(s,action['second_target_id']) if action.get('second_target_id') else None
    if action.get('as_knight') or key in ('n_knight','k_knight'):
        t=t or p
        knights(t).append(copy.deepcopy(card)|{'owner_id':p['id']})
        e.log(s,f"{p['name']} đặt một hiệp sĩ úp trước {t['name']}.")
        return True
    if key=='n_actors':
        text='Mọi người hãy cảm ơn Đức Vua dù ngài cai trị tàn nhẫn.' if option_id=='thanks' else f"Mọi người cùng cười {t['name']} trong cuộc gọi."
        if s['settings'].get('challenge_cards',True):pending(s,'social_group',p,s['players'],text,[choice('accept','Đã diễn xong')])
    elif key=='n_allies':
        pending(s,'allies',p,[t],f"Chọn số phận của {p['name']}.",[choice('grant','Cho nhận 100 từ ngân khố'),choice('loss','Làm mất 200')])
    elif key=='n_bad_blood':
        mark(s,'bad_blood',p,t,card,other_id=second['id'],next_round=s['round']+1);return True
    elif key=='n_beggars_blessing':
        for q in nobles(s):
            if q['gold']<=300:e.gain(s,q,200)
    elif key in ('n_betrayal','n_betray_the_king'):
        for item in records(s):
            if item['kind']=='hindsight' and item['target_id']==p['id'] and key=='n_betrayal':item['hit']=True
        _support(s,p,who(s,s['king_id']) if key=='n_betray_the_king' else t,key)
    elif key=='n_council_meeting':
        if option_id=='draw':
            e.draw(s,p,2);_social(s,p,p,'Hãy ca ngợi Đức Vua trong cuộc gọi.',mandatory=True)
        else:pending(s,'council',p,s['players'],'Có đồng ý cho người ra bài lấy 100 vàng của vua không?')
    elif key=='n_divine_right':
        if roll(s,p)>=5:e.gain(s,p,1200)
    elif key=='n_grudge':
        pending(s,'grudge',p,[t],f"Đồng ý cho {p['name']} lấy 200 vàng của {second['name']}?",target_id=second['id'])
    elif key in ('n_helping_hand','k_helping_hand'):
        e.draw(s,p,2);s['actions_left']+=2
    elif key in ('n_hindsight','n_scout'):
        _prediction(s,p,t,'hindsight' if key=='n_hindsight' else 'scout',card);return True
    elif key=='n_icarus':
        others=[q for q in nobles(s) if q['id']!=p['id']]
        success=roll(s,p)>=4
        for q in others:
            e.transfer(s,q,p,100,'take') if success else e.transfer(s,p,q,100,'gift')
    elif key=='n_indebted':
        if roll(s,p)>=3:
            mark(s,'indebted',p,t,card,next_round=s['round']+1);return True
    elif key=='n_isolation':
        mark(s,'isolation_'+option_id,p,p,card,expiry='end_next_turn',started=False);return True
    elif key=='n_loyalty':
        if option_id=='collect':pending(s,'loyalty',p,[t],'Ai sẽ trả 100 vàng?',[choice('self','Tôi trả'),choice('king','Vua trả')],target_id=t['id'])
        else:
            e.transfer(s,t,who(s,s['king_id']),100,'take');_social(s,p,t,'Hãy trả vua 100 vàng và tuyên thệ trung thành.',mandatory=True)
    elif key=='n_meat_for_meat':
        if roll(s,p)>roll(s,t):e.transfer(s,t,p,200,'take')
    elif key=='n_peoples_champion':
        voters=[q for q in nobles(s) if q['id']!=t['id']]
        pending(s,'champion',p,voters,f"Đồng ý đề cử {t['name']} đấu với vua?",target_id=t['id'])
    elif key=='n_royal_bomb':
        mode=s['settings'].get('bomb_mode','fixed')
        for q in s['players']:
            if q['id']!=s['king_id']:e.lose(s,q,q['gold']//2 if mode=='half' else 800 if mode=='original' else 500)
    elif key=='n_shadow_deal':e.gain(s,t,action.get('amount',100))
    elif key in ('n_sub_rosa','k_sub_rosa'):
        _check_inspection(s,p,t)
        if option_id=='knight':
            pending(s,'inspect_knight',p,[p],'Chọn một lá hiệp sĩ úp để xem riêng.',[choice('inspect','Xem lá đã chọn',requires_card=True)],target_id=t['id'])
        else:_open_hand(s,p,t,key)
    elif key=='n_subsidies':
        for q in nobles(s):
            amount=300 if q['gold']==0 else 200 if 100<=q['gold']<=300 else 100 if 400<=q['gold']<=500 else 0
            e.gain(s,q,amount)
    elif key=='n_suppress_rebellion':
        if roll(s,who(s,s['king_id']))<=3:
            for q in nobles(s):e.gain(s,q,200 if q['id']==p['id'] else 100)
    elif key in ('n_tithe','k_debt_collector'):
        pending(s,'choose_payer',p,[t],'Chọn người phải trả vàng.',[choice('choose','Xác nhận người trả',requires_target=True)],picker_type='noble' if key=='n_tithe' else 'player',followup='tithe' if key=='n_tithe' else 'debt_collector')
    elif key=='n_unprotected':
        if roll(s,p)>=5:
            for q in s['players']:
                if q['id']!=p['id']:
                    for knight in knights(q):e.discard(s,dict(id=knight['id'],type=knight['type']))
                    knights(q).clear()
    elif key in ('n_wrath','k_eye_for_an_eye'):
        if key=='n_wrath' and option_id=='fine':e.lose(s,t,100)
        else:e.lose(s,p,100);e.lose(s,t,300)
    elif key=='k_black_plague':
        people=nobles(s);random.shuffle(people)
        for i in range(0,len(people),2):
            a=people[i];b=people[i+1] if i+1<len(people) else who(s,s['king_id'])
            av,bv=roll(s,a),roll(s,b)
            if av==1 or bv==1:
                e.lose(s,a,200)
                if b['id']!=s['king_id']:e.lose(s,b,200)
    elif key=='k_bend_the_knee':_social(s,p,t,f"Cảm ơn {p['name']} vì tất cả những gì ngài đã làm cho tôi.",300,t['gold']<300)
    elif key=='k_anchor':pending(s,'anchor',p,[t],f"Trả ngân khố 200, hoặc để {second['name']} trả người ra bài 100?",[choice('bank','Trả ngân khố 200'),choice('other','Để người được chỉ định trả 100')],target_id=second['id'])
    elif key=='k_loyal_dog':
        e.gain(s,t,action.get('amount',100));_social(s,p,t,'Cảm ơn Đức Vua, tôi xin thề trung thành với ngài.',mandatory=True)
    elif key=='k_mad_king':
        for q in s['players']:
            if roll(s,q)==1:e.lose(s,q,500 if q['id']==p['id'] else 300)
    elif key=='k_royal_parrot':
        e.lose(s,t,100);text=action.get('text','Tôi là chú vẹt hoàng gia, xin tuân lệnh Đức Vua!')
        if not isinstance(text,str):text='Xin tuân lệnh Đức Vua!'
        _social(s,p,t,'Hãy đọc giọng cao: '+text[:240],300)
    elif key=='k_shifting_tides':
        mark(s,'shifting_tides',p,t,card,other_id=second['id'],expiry='start_next_turn');return True
    elif key=='k_snakes':pending(s,'snakes',p,nobles(s),'Giơ tay để người được chỉ định mất 300 vàng?',target_id=t['id'])
    elif key=='k_scapegoat':
        voters=nobles(s);seats=sorted(s['players'],key=lambda q:q['seat']);offset=seats.index(p);ordered=seats[offset+1:]+seats[:offset]
        voters=[q for q in ordered if q['id']!=s['king_id']]
        if voters:pending(s,'scapegoat',p,[voters[0]],'Chọn quý tộc khác làm vật tế thần.',[choice('vote','Bỏ phiếu',requires_target=True)],queue=[q['id'] for q in voters],ballots={})
    elif key=='k_kings_eye':
        mark(s,'kings_eye',p,t,card,expiry='start_next_turn');return True
    elif key=='k_we_ride_together':
        loser=_duel(s,t,second);pending(s,'ride',p,[t,second],f"{loser['name']} đổ thấp hơn. Cả hai đồng ý chia đều mỗi người 100?",loser_id=loser['id'])
    else:e.require(False,'Lá bài chưa có hiệu ứng hợp lệ.')
    return False


def _open_hand(s,actor,victim,key,revealed_knight=None):
    success=roll(s,actor)>=4
    choices=[choice('done','Xong, không lấy/bỏ bài')]
    role='king' if actor['id']==s['king_id'] else 'noble'
    if success and any(c['type']!='n_royal_bomb' and (key!='n_sub_rosa' or CARDS[c['type']]['role']==role) for c in victim['hand']):choices.insert(0,choice('take' if key=='n_sub_rosa' else 'discard','Lấy lá đã chọn' if key=='n_sub_rosa' else 'Bỏ lá đã chọn',requires_card=True))
    pending(s,'inspect_hand',actor,[actor],'Thông tin này chỉ bạn thấy. Bom hoàng gia không thể bị lấy/bỏ bằng cách này.',choices,target_id=victim['id'],card_type=key,success=success,revealed_knight=revealed_knight)


def _finish_support(s,q):
    e=core();actor=who(s,q['actor_id']);victim=who(s,q['target_id']);yes=sum(v=='yes' for v in q['votes'].values());needed=2 if q['card_type']=='n_betray_the_king' else 1
    s['pending']=None
    if yes<needed:e.log(s,'Cuộc phản bội không đủ người ủng hộ.');return
    if q['card_type']=='n_betrayal':
        if not _knight_blocks(s,victim):e.transfer(s,victim,actor,victim['gold'],'betrayal')
        return
    # Everyone receives the same window so it never reveals who holds King Maker.
    pending(s,'kingmaker',actor,s['players'],'Có thể dùng Kẻ dựng vua, rồi bấm Xong. Hết giờ sẽ tung xúc xắc.',[choice('pass','Xong, tung khi mọi người sẵn sàng')],target_id=victim['id'],modifiers=[])
    s['deadline']=time.time()+15


def extra_action(s,p,action):
    e=core();kind=action.get('action')
    if kind=='kingmaker':
        q=s.get('pending');e.require(q and q['kind']=='kingmaker','Chưa có cửa sổ Kẻ dựng vua.')
        e.require(p['id'] in q['eligible_ids'] and p['id'] not in q['votes'],'Bạn đã kết thúc cửa sổ này.')
        card=next((c for c in p['hand'] if c['id']==action.get('card_id') and c['type']=='n_king_maker'),None)
        e.require(card is not None,'Bạn không có Kẻ dựng vua này.')
        side=action.get('side');e.require(side in ('support','oppose'),'Chọn ủng hộ hoặc chống vua.')
        p['hand'].remove(card);e.discard(s,card);e.refill(s,p)
        q['modifiers'].append(dict(owner_id=p['id'],side=side,modifier=1 if side=='support' else -1))
        e.log(s,f"{p['name']} {'ủng hộ vua (+1)' if side=='support' else 'chống vua (−1)'}.")
        return True
    if kind=='place_knight':
        e.require(s['phase']=='playing' and s['current_player_id']==p['id'] and not s.get('pending') and s['actions_left']>0,'Chỉ giả hiệp sĩ trong lượt của bạn.')
        card=next((c for c in p['hand'] if c['id']==action.get('card_id')),None);e.require(card is not None,'Bạn không sở hữu lá này.')
        forwarded=action|{'as_knight':True,'target_id':p['id']};validate(s,p,card,forwarded);p['hand'].remove(card);s['actions_left']-=1;resolve(s,p,card,forwarded);e.refill(s,p)
        return True
    e.require(kind in ('settle_debt','reconcile'),'Hành động bổ sung không hợp lệ.')
    e.require(s['phase'] in ('playing','negotiation') and not s.get('pending'),'Chờ hiệu ứng hiện tại kết thúc để thanh toán.')
    item=next((i for i in records(s) if i['id']==action.get('debt_id')),None);e.require(item is not None,'Khoản giao kèo đã kết thúc.')
    e.require(p['gold']>=200,'Cần có đủ 200 vàng để thanh toán.')
    if kind=='settle_debt':
        e.require(item['kind']=='indebted' and p['id']!=item['owner_id'],'Phải là người khác trả chủ nợ 200.')
        receiver=who(s,item['owner_id'])
    else:
        e.require(item['kind']=='bad_blood' and p['id'] in (item['target_id'],item['other_id']),'Chỉ hai người có mối thù được hòa giải.')
        receiver=who(s,item['other_id'] if p['id']==item['target_id'] else item['target_id'])
    e.transfer(s,p,receiver,200,'settle');_discard_record(s,item);e.log(s,f"{p['name']} trả 200 để chấm dứt giao kèo.")
    return True


def expire(s):
    """Conservative defaults keep the game moving without inventing support."""
    q=s.get('pending')
    if not q:return
    kind=q['kind']
    if kind in ('support','council','champion','snakes','ride','kingmaker','social_group'):
        for pid in q['eligible_ids']:
            q['votes'].setdefault(pid,'pass' if kind=='kingmaker' else 'accept' if kind=='social_group' else 'no')
        if kind=='social_group':s['pending']=None
        else:_finish_votes(s,q)
        return
    actor=who(s,q['eligible_ids'][0]);chosen=q['choices'][0]['id'];action=dict(choice_id=chosen)
    if kind=='social':action['choice_id']='accept' if q.get('mandatory') else 'refuse'
    elif kind=='allies':action['choice_id']='grant'
    elif kind=='grudge':action['choice_id']='no'
    elif kind=='loyalty':action['choice_id']='self'
    elif kind=='anchor':action['choice_id']='bank'
    elif kind=='inspect_hand':action['choice_id']='done'
    elif kind=='inspect_knight':
        available=knights(who(s,q['target_id']))
        if not available:s['pending']=None;return
        action['card_id']=available[0]['id']
    elif kind in ('choose_payer','scapegoat'):
        available=_pending_players(s,q,actor['id'])
        if not available:s['pending']=None;return
        action['target_id']=available[0]['id']
    try:respond(s,actor,action)
    except core().RuleError:
        core().log(s,'Hết thời gian; hiệu ứng không còn mục tiêu hợp lệ được bỏ qua.');s['pending']=None


def _pending_players(s,q,viewer):
    if q['kind']=='choose_payer':
        people=nobles(s) if q.get('picker_type')=='noble' else s['players']
        if q.get('followup')!='debt_collector':people=[p for p in people if p['id']!=q['actor_id']]
        return people
    if q['kind']=='scapegoat':return [p for p in nobles(s) if p['id']!=viewer]
    return []


def sanitize_pending(s,pid):
    q=s.get('pending')
    if not q:return None
    can=pid in q['eligible_ids'] and pid not in q.get('votes',{})
    result={key:copy.deepcopy(q.get(key)) for key in ('id','kind','text','player_id','eligible_ids')}
    result.update(can_respond=can,choices=copy.deepcopy(q['choices']) if can else [],responses=len(q.get('votes',{})))
    if not can:return result
    people=_pending_players(s,q,pid)
    if people:result['players']=[dict(id=p['id'],name=p['name']) for p in people]
    if q['kind']=='inspect_knight':result['knights']=[dict(id=c['id'],name='Hiệp sĩ úp') for c in knights(who(s,q['target_id']))]
    if q['kind']=='inspect_hand':
        hand=who(s,q['target_id'])['hand']
        if q.get('revealed_knight'):
            result['revealed_knight']=copy.deepcopy(q['revealed_knight'])
            result['cards']=[dict(id=c['id'],type='hidden',name='Bài úp',description='Chọn một lá úp để lấy.',target='none') for c in hand]
        else:result['cards']=[metadata(c) for c in hand]
    return result


def public_attachments(s,p,viewer_id):
    concealed=[]
    for c in knights(p):
        concealed.append(metadata(c) if c.get('owner_id')==viewer_id else dict(id=c['id'],hidden=True))
    result=dict(knight_count=len(concealed),knights=concealed,effects=[])
    viewer=core().get_player(s,viewer_id)
    for item in records(s):
        if item['owner_id']!=p['id']:continue
        ident=item.get('card',{}).get('type');definition=CARDS.get(ident,{})
        public={k:copy.deepcopy(v) for k,v in item.items() if k in ('id','kind','owner_id','target_id','other_id','due_round')}
        public.update(name=definition.get('name',item['kind']),description=definition.get('description',''),
                      can_settle=bool(viewer and item['kind']=='indebted' and viewer_id!=item['owner_id']),
                      can_reconcile=bool(viewer and item['kind']=='bad_blood' and viewer_id in (item.get('target_id'),item.get('other_id'))))
        result['effects'].append(public)
    return result


def on_round_start(s):
    for item in records(s)[:]:
        if item['kind'] in ('bad_blood','indebted') and s['round']>=item.get('next_round',s['round']+1):
            owner=who(s,item['owner_id'])
            if item['kind']=='bad_blood':core().gain(s,owner,200)
            else:
                try:core().transfer(s,who(s,item['target_id']),owner,100,'take')
                except core().RuleError:core().log(s,'Khoản thu nợ vòng này bị hiệu ứng bảo vệ chặn.')
            item['next_round']=s['round']+1


def on_round_end(s):
    ending_king=s['king_id']
    due=[item for item in records(s)[:] if item['kind'] in ('hindsight','scout') and item['due_round']<=s['round']]
    for item in due:
        correct=item['hit'] if item['kind']=='hindsight' else item['target_id']==ending_king
        owner=who(s,item['owner_id'])
        core().gain(s,owner,300) if correct else core().lose(s,owner,100)
        core().log(s,f"Dự đoán của {owner['name']}: {'đúng, nhận 300' if correct else 'sai, mất 100'}.")
        _discard_record(s,item)


def on_turn_start(s,p):
    for item in records(s)[:]:
        if item['owner_id']!=p['id']:continue
        if item.get('expiry')=='start_next_turn':_discard_record(s,item)
        elif item.get('expiry')=='end_next_turn':item['started']=True


def on_turn_end(s,p):
    for item in records(s)[:]:
        if item['owner_id']==p['id'] and item.get('expiry')=='end_next_turn' and item.get('started'):_discard_record(s,item)


def on_crown_change(s,old_id,new_id):
    for item in records(s)[:]:
        if item['kind']=='indebted' and item['owner_id']==new_id:_discard_record(s,item)
    # The core swaps role-owned hands before invoking this hook. Scan all hands
    # and remove a bomb from the new king only, never from another noble.
    # Role hands have already been swapped: the ascending noble's former hand
    # now belongs to the old king. Its bomb must still be discarded on ascent.
    for pid in {new_id,old_id}:
        player=core().get_player(s,pid)
        if player:
            for card in player['hand'][:]:
                if card['type']=='n_royal_bomb':player['hand'].remove(card);core().discard(s,card)


def validate_discard(s,p,card):
    key=card['type'];e=core()
    if key=='n_divine_right':e.require(s['round']>=s['settings']['rounds']-1,'Chỉ được bỏ Thiên mệnh trong hai vòng cuối.')
    if key=='n_peoples_champion':e.require(s['round']==s['settings']['rounds'],'Chỉ được bỏ Nhà vô địch nhân dân ở vòng cuối.')
    if key=='n_royal_bomb':e.require(s['phase']=='negotiation','Chỉ được bỏ Bom hoàng gia trong thương lượng.')


def validate_trade(s,sender,receiver,offered,requested=None):
    for owner,card in ((sender,offered),(receiver,requested)):
        if card and card['type']=='n_royal_bomb':core().require(s['phase']=='negotiation','Bom chỉ được tặng/đổi trong thương lượng.')


def _king_roll(s,actor,king,modifiers):
    result=roll(s,king)+sum(m['modifier'] for m in modifiers)
    succeeded=result<=3
    core().log(s,f'Phản vua: kết quả sau điều chỉnh {result}.')
    if succeeded:_swap_crown_gold(s,actor,king)
    else:core().gain(s,king,200)
    for modifier in modifiers:
        if succeeded==(modifier['side']=='support'):core().lose(s,who(s,modifier['owner_id']),300)


def _finish_votes(s,q):
    e=core();actor=who(s,q['actor_id']);kind=q['kind'];votes=q['votes'];s['pending']=None
    if kind=='support':_finish_support(s,q)
    elif kind=='kingmaker':_king_roll(s,actor,who(s,q['target_id']),q['modifiers'])
    elif kind=='council':
        if all(votes.get(pid)=='yes' for pid in q['eligible_ids']):e.transfer(s,who(s,s['king_id']),actor,100,'take')
        else:e.lose(s,actor,100)
    elif kind=='champion':
        if all(votes.get(pid)=='yes' for pid in q['eligible_ids']):
            nominee=who(s,q['target_id']);king=who(s,s['king_id'])
            if _duel(s,nominee,king)['id']==king['id']:
                e.crown(s,forced_id=nominee['id'])
    elif kind=='snakes':
        if any(v=='yes' for v in votes.values()):e.lose(s,who(s,q['target_id']),300)
    elif kind=='ride':
        if all(votes.get(pid)=='yes' for pid in q['eligible_ids']):
            for pid in q['eligible_ids']:e.lose(s,who(s,pid),100)
        else:e.lose(s,who(s,q['loser_id']),200)


def respond(s,p,action):
    e=core();q=s.get('pending');e.require(q and p['id'] in q['eligible_ids'],'Không có yêu cầu dành cho bạn.')
    chosen=action.get('choice_id')
    if chosen is None and type(action.get('accept')) is bool:chosen='accept' if action['accept'] else 'refuse'
    e.require(isinstance(chosen,str) and any(c['id']==chosen for c in q['choices']),'Lựa chọn phản hồi không hợp lệ.')
    e.require(p['id'] not in q['votes'],'Bạn đã phản hồi.')
    actor=who(s,q['actor_id']);kind=q['kind']
    if kind in ('support','council','champion','snakes','ride','kingmaker','social_group'):
        q['votes'][p['id']]=chosen
        if all(pid in q['votes'] for pid in q['eligible_ids']):
            if kind=='social_group':s['pending']=None;e.log(s,'Mọi người đã hoàn tất màn diễn.')
            else:_finish_votes(s,q)
        return
    if kind=='social':
        if chosen=='refuse':e.lose(s,p,q['penalty'])
        e.log(s,f"{p['name']} {'đã đọc lời thoại' if chosen=='accept' else 'từ chối và chịu phạt'}.")
    elif kind=='allies':e.gain(s,actor,100) if chosen=='grant' else e.lose(s,actor,200)
    elif kind=='grudge':
        if chosen=='yes':e.transfer(s,who(s,q['target_id']),actor,200,'take')
        else:e.lose(s,actor,100)
    elif kind=='loyalty':e.transfer(s,p if chosen=='self' else who(s,s['king_id']),actor,100,'take')
    elif kind=='anchor':e.lose(s,p,200) if chosen=='bank' else e.transfer(s,who(s,q['target_id']),actor,100,'take')
    elif kind=='choose_payer':
        victim=target(s,action)
        e.require(q['picker_type']!='noble' or victim['id']!=s['king_id'],'Phải chọn quý tộc.')
        e.require(q['followup']=='debt_collector' or victim['id']!=actor['id'],'Không thể tự trả vàng cho mình.')
        if q['followup']=='debt_collector':e.lose(s,victim,200)
        else:e.transfer(s,victim,actor,200 if q['followup']=='grudge' else 100,'take')
    elif kind=='inspect_knight':
        victim=who(s,q['target_id']);selected=next((c for c in knights(victim) if c['id']==action.get('card_id')),None)
        e.require(selected is not None,'Chọn một hiệp sĩ úp hợp lệ.');_open_hand(s,actor,victim,'n_sub_rosa',metadata(selected));return
    elif kind=='inspect_hand':
        if chosen!='done':
            e.require(q['success'],'Lần đổ không cho phép lấy/bỏ bài.');victim=who(s,q['target_id']);selected=next((c for c in victim['hand'] if c['id']==action.get('card_id')),None)
            e.require(selected is not None and selected['type']!='n_royal_bomb','Lá bài không hợp lệ hoặc là Bom hoàng gia.')
            e.require(chosen!='take' or CARDS[selected['type']]['role']==('king' if actor['id']==s['king_id'] else 'noble'),'Không thể lấy bài thuộc vai trò khác.')
            victim['hand'].remove(selected)
            if chosen=='take':actor['hand'].append(selected)
            else:e.discard(s,selected)
            e.refill(s,victim)
    elif kind=='scapegoat':
        victim=target(s,action);e.require(victim['id']!=p['id'] and victim['id']!=s['king_id'],'Bầu một quý tộc khác.')
        q['ballots'][p['id']]=victim['id'];index=q['queue'].index(p['id'])+1
        if index<len(q['queue']):q['eligible_ids']=[q['queue'][index]];q['player_id']=q['queue'][index];s['deadline']=time.time()+40;return
        counts={pid:list(q['ballots'].values()).count(pid) for pid in q['ballots'].values()};best=max(counts.values());tied=[who(s,pid) for pid,count in counts.items() if count==best]
        attempts=0
        while len(tied)>1:
            attempts+=1;e.require(attempts<=100,'Xúc xắc hòa quá nhiều lần; hãy thử lại.')
            results=[(roll(s,c),c) for c in tied];high=max(v for v,_ in results);next_tied=[c for v,c in results if v==high]
            tied=next_tied
        e.lose(s,tied[0],300)
    else:e.require(False,'Yêu cầu không hợp lệ.')
    s['pending']=None
