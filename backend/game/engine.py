"""Authoritative rules. Only personalized snapshots may leave the server."""
import copy
import random
import secrets
import time
import uuid

DEFAULTS = dict(rounds=4, negotiation_seconds=120, turn_seconds=0, starting_gold='random', allow_transfers=True, allow_trades=True, challenge_cards=True, bomb_mode='fixed')
CHARACTERS = ('regent', 'rogue', 'scholar', 'knight', 'merchant', 'jester')
CARDS = {
    'theft': ('Đâm sau lưng', 'Cướp tối đa 250 vàng của một người.', 'player'),
    'tax': ('Thuế hoàng gia', 'Thu tối đa 100 vàng từ mỗi đối thủ.', 'none'),
    'loyal_dog': ('Chó trung thành', 'Tặng 200 vàng từ ngân khố và yêu cầu lời thề trung thành.', 'player'),
    'parrot': ('Vẹt hoàng gia', 'Đọc lời thú nhận hoặc chịu phạt 200 vàng.', 'player'),
    'mad_king': ('Vua điên', 'Mỗi người tung xúc xắc; số 1 hoặc 2 mất 300 vàng.', 'none'),
    'bomb': ('Bom hoàng gia', 'Mọi người trừ vua chịu thiệt hại; khiên có thể bảo vệ.', 'none'),
    'shield': ('Khiên bí mật', 'Chặn một lần mất vàng do bài đối thủ.', 'none'),
    'gift': ('Quà có dụng ý', 'Chuyển tối đa 200 vàng của mình cho một người.', 'player'),
}

class RuleError(ValueError):
    pass

def require(condition, message):
    if not condition:
        raise RuleError(message)

def settings_from(raw):
    require(isinstance(raw, dict), 'Thiết lập không hợp lệ.')
    result = DEFAULTS | {k: v for k, v in raw.items() if k in DEFAULTS}
    require(type(result['rounds']) is int and 3 <= result['rounds'] <= 5, 'Chọn 3–5 vòng.')
    require(type(result['negotiation_seconds']) is int and result['negotiation_seconds'] in (60, 120, 180), 'Thương lượng 60, 120 hoặc 180 giây.')
    require(type(result['turn_seconds']) is int and result['turn_seconds'] in (0, 45, 60), 'Thời gian lượt không hợp lệ.')
    require(result['starting_gold'] in ('random', 'equal'), 'Kiểu vàng không hợp lệ.')
    require(result['bomb_mode'] in ('fixed', 'half'), 'Kiểu bom không hợp lệ.')
    for key in ('allow_transfers', 'allow_trades', 'challenge_cards'):
        require(type(result[key]) is bool, 'Thiết lập phải là đúng hoặc sai.')
    return result

def validate_character(character):
    require(isinstance(character, str) and character in CHARACTERS, 'Nhân vật không hợp lệ.')
    return character

def player(name, seat, character='regent'):
    require(isinstance(name, str) and 1 <= len(name.strip()) <= 24, 'Tên cần từ 1 đến 24 ký tự.')
    return dict(id=uuid.uuid4().hex, token=secrets.token_urlsafe(32), name=name.strip(), seat=seat, gold=0, ready=False, hand=[], shield=False, character=validate_character(character))

def new_state(name, settings, character='regent'):
    p = player(name, 0, character)
    return dict(settings=settings_from(settings), players=[p], host_id=p['id'], phase='lobby', round=0, king_id=None, current_player_id=None, actions_left=0, offers=[], pending=None, deadline=None, winner_id=None, log=['Tửu quán mở cửa.'], version=1, seen=[], order=[], turn_index=0)

def get_player(s, pid):
    return next((p for p in s['players'] if p['id'] == pid), None)

def authenticate(s, token):
    if not isinstance(token, str) or not token.isascii() or not 1 <= len(token) <= 128:
        return None
    return next((p['id'] for p in s['players'] if secrets.compare_digest(p['token'], token)), None)

def log(s, message):
    s['log'] = (s['log'] + [message])[-40:]

def crown(s):
    richest = max(s['players'], key=lambda p: p['gold'])
    current = get_player(s, s['king_id'])
    if current is None or richest['gold'] > current['gold']:
        s['king_id'] = richest['id']
        log(s, f"{richest['name']} đoạt vương miện!")

def draw(s):
    types = list(CARDS)
    if not s['settings']['challenge_cards']:
        types = [t for t in types if t not in ('loyal_dog', 'parrot')]
    return dict(id=uuid.uuid4().hex, type=random.choice(types))

def begin_turn(s):
    s['current_player_id'] = s['order'][s['turn_index']]
    s['actions_left'] = 3 if s['current_player_id'] == s['king_id'] else 2
    seconds = s['settings']['turn_seconds']
    s['deadline'] = time.time() + seconds if seconds else None

def begin_round(s):
    s['round'] += 1
    s['phase'] = 'playing'
    s['offers'] = []
    for p in s['players']:
        while len(p['hand']) < 5:
            p['hand'].append(draw(s))
    ids = [p['id'] for p in s['players']]
    offset = ids.index(s['king_id'])
    s['order'] = ids[offset:] + ids[:offset]
    s['turn_index'] = 0
    begin_turn(s)
    log(s, f"Bắt đầu vòng {s['round']}.")

def end_turn(s):
    s['pending'] = None
    s['turn_index'] += 1
    if s['turn_index'] < len(s['order']):
        begin_turn(s)
    elif s['round'] >= s['settings']['rounds']:
        s.update(phase='finished', winner_id=s['king_id'], current_player_id=None, deadline=None, actions_left=0)
        log(s, f"{get_player(s, s['king_id'])['name']} chiến thắng!")
    else:
        s.update(phase='negotiation', current_player_id=None, actions_left=0, deadline=time.time() + s['settings']['negotiation_seconds'])
        log(s, 'Chợ đen mở cửa. Mọi lời hứa đều có thể bị phản bội.')

def loss(p, amount, protect=True):
    if protect and p['shield']:
        p['shield'] = False
        return 0
    amount = min(p['gold'], amount)
    p['gold'] -= amount
    return amount

def advance_expired(s):
    if s['deadline'] is None or time.time() < s['deadline']:
        return False
    if s['pending']:
        p = get_player(s, s['pending']['player_id'])
        loss(p, s['pending']['penalty'], False)
        s['pending'] = None
        crown(s)
        if s['actions_left'] <= 0:
            end_turn(s)
        else:
            seconds = s['settings']['turn_seconds']
            s['deadline'] = time.time() + seconds if seconds else None
    elif s['phase'] == 'negotiation':
        begin_round(s)
    elif s['phase'] == 'playing':
        end_turn(s)
    else:
        return False
    s['version'] += 1
    return True

def apply(s, pid, action):
    kind = action.get('action')
    action_id = action.get('action_id')
    require(isinstance(action_id, str) and 1 <= len(action_id) <= 100, 'Thiếu mã hành động.')
    key = f'{pid}:{action_id}'
    if key in s['seen']:
        return
    p = get_player(s, pid)
    require(p is not None, 'Phiên không hợp lệ.')
    if kind == 'choose_character':
        require(s['phase'] == 'lobby', 'Chỉ chọn nhân vật trong phòng chờ.')
        p['character'] = validate_character(action.get('character'))
    elif kind == 'leave':
        require(s['phase'] == 'lobby', 'Chỉ rời ghế trong phòng chờ.')
        s['players'] = [q for q in s['players'] if q['id'] != pid]
        for seat, q in enumerate(s['players']):
            q['seat'] = seat
        if pid == s['host_id']:
            s['host_id'] = s['players'][0]['id'] if s['players'] else None
    elif kind in ('configure', 'settings'):
        require(s['phase'] == 'lobby' and pid == s['host_id'], 'Chỉ chủ phòng được sửa luật ở phòng chờ.')
        s['settings'] = settings_from(action.get('settings', {}))
        for q in s['players']:
            q['ready'] = False
    elif kind == 'ready':
        require(s['phase'] == 'lobby', 'Ván đã bắt đầu.')
        p['ready'] = not p['ready']
    elif kind in ('start', 'restart'):
        require(pid == s['host_id'], 'Chỉ chủ phòng được bắt đầu.')
        require(s['phase'] == ('lobby' if kind == 'start' else 'finished'), 'Chưa thể bắt đầu.')
        require(len(s['players']) >= 2, 'Cần ít nhất 2 người.')
        if kind == 'start':
            require(all(q['ready'] or q['id'] == pid for q in s['players']), 'Hãy chờ mọi người sẵn sàng.')
        s.update(round=0, king_id=None, pending=None, winner_id=None)
        for q in s['players']:
            q.update(gold=random.choice((800, 900, 1000, 1100, 1200)) if s['settings']['starting_gold'] == 'random' else 1000, hand=[], shield=False)
        crown(s)
        begin_round(s)
    elif kind == 'respond':
        require(s['pending'] and s['pending']['player_id'] == pid, 'Không có yêu cầu dành cho bạn.')
        require(type(action.get('accept')) is bool, 'Phản hồi không hợp lệ.')
        if not action['accept']:
            loss(p, s['pending']['penalty'], False)
        log(s, f"{p['name']} {'đã đọc lời thoại' if action['accept'] else 'từ chối và chịu phạt'}.")
        s['pending'] = None
        crown(s)
        seconds = s['settings']['turn_seconds']
        s['deadline'] = time.time() + seconds if seconds else None
        if s['actions_left'] <= 0:
            end_turn(s)
    elif kind in ('play', 'end_turn'):
        require(s['phase'] == 'playing' and s['current_player_id'] == pid, 'Chưa đến lượt bạn.')
        require(not s['pending'], 'Đang chờ người chơi phản hồi.')
        if kind == 'end_turn':
            end_turn(s)
        else:
            require(s['actions_left'] > 0, 'Đã hết lượt đánh bài.')
            card = next((c for c in p['hand'] if c['id'] == action.get('card_id')), None)
            require(card is not None, 'Bạn không sở hữu lá bài này.')
            t = card['type']
            target = get_player(s, action.get('target_id'))
            if CARDS[t][2] == 'player':
                require(target is not None and target['id'] != pid, 'Chọn một người chơi khác.')
            p['hand'].remove(card)
            s['actions_left'] -= 1
            if t == 'theft':
                p['gold'] += loss(target, 250)
            elif t == 'tax':
                for q in s['players']:
                    if q['id'] != pid:
                        p['gold'] += loss(q, 100)
            elif t == 'gift':
                amount = loss(p, 200, False)
                target['gold'] += amount
            elif t == 'shield':
                p['shield'] = True
            elif t in ('loyal_dog', 'parrot'):
                if t == 'loyal_dog':
                    target['gold'] += 200
                s['pending'] = dict(player_id=target['id'], text='Cảm ơn Đức Vua, tôi xin thề trung thành với ngài.' if t == 'loyal_dog' else 'Tôi xin thú nhận: tài năng lớn nhất của tôi là đếm tiền của người khác!', penalty=200)
                s['deadline'] = time.time() + 30
            elif t == 'bomb':
                king = s['king_id']
                for q in s['players']:
                    if q['id'] != king:
                        loss(q, q['gold'] // 2 if s['settings']['bomb_mode'] == 'half' else 500)
            elif t == 'mad_king':
                rolls = []
                for q in s['players']:
                    roll = random.randint(1, 6)
                    rolls.append(f"{q['name']}: {roll}")
                    if roll <= 2:
                        loss(q, 300, False)
                log(s, 'Xúc xắc — ' + ', '.join(rolls))
            log(s, f"{p['name']} dùng {CARDS[t][0]}.")
            s['last_event'] = dict(id=uuid.uuid4().hex, type=t, actor_id=pid, target_id=action.get('target_id'))
            if t == 'mad_king':
                s['last_event']['rolls'] = rolls
            crown(s)
            if not s['pending'] and s['actions_left'] <= 0:
                end_turn(s)
    elif kind in ('transfer', 'offer_trade', 'accept_trade'):
        require(s['phase'] == 'negotiation', 'Chỉ giao dịch khi chợ đen mở.')
        if kind == 'accept_trade':
            require(s['settings']['allow_trades'], 'Đổi bài đã tắt.')
            offer = next((o for o in s['offers'] if o['id'] == action.get('offer_id')), None)
            require(offer is not None and offer['to_id'] == pid, 'Đề nghị không hợp lệ.')
            sender = get_player(s, offer['from_id'])
            offered = next((c for c in sender['hand'] if c['id'] == offer['offered_card_id']), None)
            requested = next((c for c in p['hand'] if c['id'] == offer['requested_card_id']), None) if offer['requested_card_id'] else (random.choice(p['hand']) if p['hand'] else None)
            require(offered is not None and requested is not None and sender['gold'] >= offer['gold'], 'Bài hoặc vàng trong đề nghị không còn đủ.')
            sender['hand'].remove(offered)
            p['hand'].remove(requested)
            sender['hand'].append(requested)
            p['hand'].append(offered)
            sender['gold'] -= offer['gold']
            p['gold'] += offer['gold']
            s['offers'] = [o for o in s['offers'] if o['id'] != offer['id']]
            log(s, f"{sender['name']} và {p['name']} đã đổi bài.")
        else:
            target = get_player(s, action.get('target_id'))
            require(target is not None and target['id'] != pid, 'Chọn một người khác.')
            if kind == 'transfer':
                require(s['settings']['allow_transfers'], 'Chuyển vàng đã tắt.')
                amount = action.get('amount')
                require(type(amount) is int and 0 < amount <= p['gold'], 'Số vàng không hợp lệ.')
                p['gold'] -= amount
                target['gold'] += amount
                s['last_event'] = dict(id=uuid.uuid4().hex, type='transfer', actor_id=pid, target_id=target['id'])
                log(s, f"{p['name']} chuyển {amount} vàng cho {target['name']}.")
            else:
                require(s['settings']['allow_trades'], 'Đổi bài đã tắt.')
                require(len(s['offers']) < 24, 'Có quá nhiều đề nghị đang chờ.')
                offered = next((c for c in p['hand'] if c['id'] == action.get('offered_card_id')), None)
                gold = action.get('gold', 0)
                require(offered is not None and type(gold) is int and 0 <= gold <= p['gold'], 'Bài hoặc vàng không hợp lệ.')
                requested = action.get('requested_card_id')
                require(requested is None or isinstance(requested, str), 'Bài yêu cầu không hợp lệ.')
                require(not requested or any(c['id'] == requested for c in target['hand']), 'Bài yêu cầu không hợp lệ.')
                s['offers'].append(dict(id=uuid.uuid4().hex, from_id=pid, to_id=target['id'], offered_card_id=offered['id'], requested_card_id=requested, gold=gold))
        crown(s)
    else:
        raise RuleError('Hành động không hợp lệ.')
    s['seen'] = (s['seen'] + [key])[-500:]
    s['version'] += 1

def snapshot(s, pid, code):
    result = {k: copy.deepcopy(s[k]) for k in ('phase', 'round', 'settings', 'host_id', 'king_id', 'current_player_id', 'actions_left', 'pending', 'deadline', 'winner_id', 'log', 'version')}
    result['code'] = code
    result['players'] = [{k: p[k] for k in ('id', 'name', 'seat', 'gold', 'ready', 'shield')} | {'hand_count': len(p['hand']), 'character': p.get('character', 'regent')} for p in s['players']]
    result['hand'] = [c | dict(zip(('name', 'description', 'target'), CARDS[c['type']])) for c in get_player(s, pid)['hand']]
    result['offers'] = [copy.deepcopy(o) for o in s['offers'] if pid in (o['from_id'], o['to_id'])]
    for offer in result['offers']:
        sender = get_player(s, offer['from_id'])
        card = next((c for c in sender['hand'] if c['id'] == offer['offered_card_id']), None)
        offer['offered_card'] = card | dict(zip(('name', 'description', 'target'), CARDS[card['type']])) if card else None
    result['last_event'] = s.get('last_event')
    return result
