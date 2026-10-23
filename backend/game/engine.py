"""Authoritative rules; clients receive personalized snapshots only."""
import copy
import random
import secrets
import time
import uuid

CHARACTERS = ('regent', 'rogue', 'scholar', 'knight', 'merchant', 'jester')
DEFAULTS = dict(rounds=4, negotiation_seconds=120, turn_seconds=0, starting_gold='roles', hand_size=8, allow_transfers=True, allow_trades=True, challenge_cards=True, bomb_mode='fixed', final_negotiation=False, map_id='tavern')

class RuleError(ValueError):
    pass

def require(condition, message):
    if not condition:
        raise RuleError(message)

def settings_from(raw):
    require(isinstance(raw, dict), 'Thiết lập không hợp lệ.')
    result = DEFAULTS | {k: v for k, v in raw.items() if k in DEFAULTS}
    for key, values in [('rounds', (3, 4, 5)), ('negotiation_seconds', (60, 120, 180)), ('turn_seconds', (0, 45, 60)), ('hand_size', (5, 8))]:
        require(type(result[key]) is int and result[key] in values, f'Thiết lập {key} không hợp lệ.')
    require(result['starting_gold'] in ('roles', 'random', 'equal'), 'Kiểu vàng không hợp lệ.')
    require(result['bomb_mode'] in ('fixed', 'half', 'original'), 'Kiểu bom không hợp lệ.')
    require(isinstance(result['map_id'], str) and result['map_id'] in ('tavern', 'island', 'garden', 'abbey'), 'Bản đồ không hợp lệ.')
    for key in ('allow_transfers', 'allow_trades', 'challenge_cards', 'final_negotiation'):
        require(type(result[key]) is bool, 'Thiết lập phải là đúng hoặc sai.')
    return result

def validate_character(character):
    require(isinstance(character, str) and character in CHARACTERS, 'Nhân vật không hợp lệ.')
    return character

def player(name, seat, character='regent'):
    require(isinstance(name, str) and 1 <= len(name.strip()) <= 24, 'Tên cần từ 1 đến 24 ký tự.')
    return dict(id=uuid.uuid4().hex, token=secrets.token_urlsafe(32), name=name.strip(), seat=seat, gold=0, ready=False, hand=[], shield=False, attachments={}, gold_received=0, character=validate_character(character))

def new_state(name, settings, character='regent'):
    p = player(name, 0, character)
    return dict(schema_version=2, settings=settings_from(settings), players=[p], host_id=p['id'], phase='lobby', round=0, king_id=None, current_player_id=None, actions_left=0, offers=[], pending=None, deadline=None, winner_id=None, log=['Tửu quán mở cửa.'], version=1, seen=[], turn_seat=None, visited_seats=[], direction='clockwise', decks={'king': [], 'noble': []}, discards={'king': [], 'noble': []}, effects=[])

def upgrade(s):
    if s.get('schema_version') == 2:
        return False
    s.pop('forced_crown', None)
    s.update(schema_version=2, phase='lobby', round=0, king_id=None, current_player_id=None, actions_left=0, offers=[], pending=None, deadline=None, winner_id=None, seen=[], turn_seat=None, visited_seats=[], direction='clockwise', decks={'king': [], 'noble': []}, discards={'king': [], 'noble': []}, effects=[])
    s['settings'] = settings_from(s.get('settings', {}))
    s['last_event'] = None
    s['settings'].update(hand_size=8, starting_gold='roles')
    s['version'] = s.get('version', 0)+1
    for p in s['players']:
        p.update(gold=0, hand=[], ready=False, shield=False, attachments={}, gold_received=0)
    log(s, 'Luật mới đã cập nhật. Phòng trở về trạng thái chờ để chia lại bài.')
    return True

def get_player(s, pid):
    return next((p for p in s['players'] if p['id'] == pid), None)

def authenticate(s, token):
    if not isinstance(token, str) or not token.isascii() or not 1 <= len(token) <= 128:
        return None
    return next((p['id'] for p in s['players'] if secrets.compare_digest(p['token'], token)), None)

def log(s, message):
    s['log'] = (s['log']+[message])[-60:]

def role(s, p):
    return 'king' if p['id'] == s['king_id'] else 'noble'

def gain(s, p, amount):
    amount = max(0, min(int(amount), 2000-p['gold']))
    p['gold'] += amount
    return amount

def lose(s, p, amount):
    amount = max(0, min(int(amount), p['gold']))
    p['gold'] -= amount
    return amount

def effects():
    from . import effects as module
    return module

def hook(name, s, *args):
    fn = getattr(effects(), name, None)
    return fn(s, *args) if fn else None

def transfer(s, source, target, amount, reason='take'):
    amount = max(0, int(amount))
    guarded = hook('guard_transfer', s, source, target, amount, reason)
    if guarded is not None:
        amount = guarded
    if reason in ('deal', 'negotiation'):
        require(amount <= source['gold'], 'Không đủ vàng để giao dịch.')
        require(target.get('gold_received', 0)+amount <= 400, 'Mỗi người chỉ nhận tối đa 400 vàng trong một phiên thương lượng.')
        require(target['gold']+amount <= 2000, 'Người nhận vượt giới hạn 2000 vàng.')
        target['gold_received'] = target.get('gold_received', 0)+amount
    lose(s, source, amount)
    return gain(s, target, amount)

def catalog():
    from .catalog import CARDS
    return CARDS

def card_info(card):
    return catalog()[card['type']]

def card_view(card):
    return copy.deepcopy(card_info(card)) | copy.deepcopy(card)

def setup_decks(s):
    for deck in ('king', 'noble'):
        cards = []
        for key, spec in catalog().items():
            if spec['role'] == deck:
                for _ in range(spec['count']):
                    cards.append(dict(id=uuid.uuid4().hex, type=key))
        random.shuffle(cards)
        s['decks'][deck], s['discards'][deck] = cards, []

def draw(s, p, count=1):
    deck, drawn = role(s, p), []
    for _ in range(count):
        if not s['decks'][deck]:
            s['decks'][deck], s['discards'][deck] = s['discards'][deck], []
            random.shuffle(s['decks'][deck])
        if not s['decks'][deck]:
            break
        card = s['decks'][deck].pop()
        p['hand'].append(card)
        drawn.append(card)
    return drawn

def discard(s, card):
    s['discards'][card_info(card)['role']].append(card)

def refill(s, p):
    return draw(s, p, max(0, s['settings']['hand_size']-len(p['hand'])))

def crown(s, forced_id=None):
    if not s['players']:
        return
    # A successful People's Champion can take the throne without exchanging gold.
    # Its explicit coronation persists until a later actual gold change, rather
    # than being undone by a second bookkeeping check in the same turn.
    override = s.get('forced_crown')
    wallet = {p['id']: p['gold'] for p in s['players']}
    if not forced_id and override:
        if override['king_id'] == s['king_id'] and override['wallet'] == wallet:
            return
        s.pop('forced_crown', None)
    incumbent = get_player(s, s['king_id'])
    highest = max(p['gold'] for p in s['players'])
    contenders = [p for p in s['players'] if p['gold'] == highest]
    if forced_id:
        winner = get_player(s, forced_id)
        require(winner is not None, 'Người kế vị không hợp lệ.')
    elif incumbent and incumbent['gold'] >= highest:
        return
    else:
        attempts = 0
        while len(contenders) > 1:
            attempts += 1
            if attempts > 20:
                selected = random.choice(contenders)
                for p in contenders:
                    if p['id'] != selected['id']:
                        lose(s, p, 100)
                contenders = [selected]
                log(s, 'Xúc xắc hòa liên tiếp; bốc thăm phân định ngôi vua.')
                break
            rolls = {p['id']: random.randint(1, 6) for p in contenders}
            log(s, 'Tranh ngôi — '+', '.join(f"{p['name']}: {rolls[p['id']]}" for p in contenders))
            best = max(rolls.values())
            for p in contenders:
                if rolls[p['id']] < best:
                    lose(s, p, 100)
            contenders = [p for p in contenders if rolls[p['id']] == best]
        winner = contenders[0]
    if incumbent and winner['id'] != incumbent['id']:
        incumbent['seat'], winner['seat'] = winner['seat'], incumbent['seat']
        incumbent['hand'], winner['hand'] = winner['hand'], incumbent['hand']
        incumbent['attachments'], winner['attachments'] = winner.get('attachments', {}), incumbent.get('attachments', {})
    if winner['id'] != s['king_id']:
        old_id = s['king_id']
        s['king_id'] = winner['id']
        s['offers'] = []
        log(s, f"{winner['name']} đoạt vương miện! Đổi ghế và bài với vua cũ.")
        hook('on_crown_change', s, old_id, winner['id'])
        if s.get('turn_seat') is not None and s['phase'] == 'playing':
            active = next(p for p in s['players'] if p['seat'] == s['turn_seat'])
            s['current_player_id'] = active['id']
            s['actions_left'] = 0
    if forced_id:
        s['forced_crown'] = {'king_id': winner['id'], 'wallet': {p['id']: p['gold'] for p in s['players']}}

def set_turn_deadline(s):
    seconds = s['settings']['turn_seconds']
    s['deadline'] = time.time()+seconds if seconds else None

def begin_turn(s, seat):
    p = next(p for p in s['players'] if p['seat'] == seat)
    s['turn_seat'], s['current_player_id'] = seat, p['id']
    s['turn_end_processed'] = False
    s['actions_left'] = 3 if role(s, p) == 'king' and len(s['players']) != 4 else 2
    set_turn_deadline(s)
    hook('on_turn_start', s, p)
    crown(s)
    if s['pending']:
        s['deadline'] = time.time()+30
    elif s['actions_left'] <= 0:
        end_turn(s)

def begin_round(s):
    s['round'] += 1
    s['phase'], s['offers'], s['pending'] = 'playing', [], None
    s['turn_seat'] = None
    s['direction'] = 'clockwise' if s['round'] % 2 else 'counterclockwise'
    s['visited_seats'] = []
    s['round_end_processed'] = False
    hook('on_round_start', s)
    crown(s)
    begin_turn(s, get_player(s, s['king_id'])['seat'])
    log(s, f"Bắt đầu vòng {s['round']}.")

def finish(s):
    crown(s)
    s.update(phase='finished', winner_id=s['king_id'], current_player_id=None, deadline=None, actions_left=0, pending=None, turn_seat=None)
    log(s, f"{get_player(s, s['king_id'])['name']} chiến thắng!")

def end_turn(s):
    p = get_player(s, s['current_player_id'])
    s['actions_left'] = 0
    if not s.get('turn_end_processed'):
        s['turn_end_processed'] = True
        hook('on_turn_end', s, p)
        crown(s)
    if s['pending']:
        return
    seat = s['turn_seat']
    p = next(p for p in s['players'] if p['seat'] == seat)
    refill(s, p)
    if seat not in s['visited_seats']:
        s['visited_seats'].append(seat)
    if len(s['visited_seats']) >= len(s['players']):
        if not s.get('round_end_processed'):
            s['round_end_processed'] = True
            hook('on_round_end', s)
            crown(s)
        if s['pending']:
            return
        if s['round'] >= s['settings']['rounds'] and not s['settings']['final_negotiation']:
            finish(s)
        else:
            s.update(phase='negotiation', current_player_id=None, turn_seat=None, actions_left=0, deadline=time.time()+s['settings']['negotiation_seconds'])
            s['offers'] = []
            for q in s['players']:
                q['gold_received'] = 0
            log(s, 'Chợ đen mở cửa. Mỗi người nhận tối đa 400 vàng.')
        return
    direction = 1 if s['direction'] == 'clockwise' else -1
    next_seat = (seat+direction) % len(s['players'])
    while next_seat in s['visited_seats']:
        next_seat = (next_seat+direction) % len(s['players'])
    begin_turn(s, next_seat)

def after_effect(s):
    crown(s)
    if s['pending']:
        s['deadline'] = time.time()+30
    elif s['phase'] == 'playing':
        if s['actions_left'] <= 0:
            end_turn(s)
        else:
            set_turn_deadline(s)

def advance_expired(s):
    if s['deadline'] is None or time.time() < s['deadline']:
        return False
    if s['pending']:
        hook('expire', s)
        after_effect(s)
    elif s['phase'] == 'negotiation':
        if s['round'] >= s['settings']['rounds']:
            finish(s)
        else:
            begin_round(s)
    elif s['phase'] == 'playing':
        end_turn(s)
    else:
        return False
    s['version'] += 1
    return True

def own_card(p, cid):
    return next((c for c in p['hand'] if c['id'] == cid), None)

def apply(s, pid, action):
    if action.get('action') == 'place_knight':
        action = action | {'action': 'play', 'as_knight': True}
    working = copy.deepcopy(s)
    _apply(working, pid, action)
    s.clear()
    s.update(working)

def _apply(s, pid, action):
    kind, aid = action.get('action'), action.get('action_id')
    require(isinstance(aid, str) and 1 <= len(aid) <= 100, 'Thiếu mã hành động.')
    key = f'{pid}:{aid}'
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
        if s['host_id'] == pid:
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
        require(2 <= len(s['players']) <= 8, 'Cần từ 2 đến 8 người.')
        if kind == 'start':
            require(all(q['ready'] or q['id'] == pid for q in s['players']), 'Hãy chờ mọi người sẵn sàng.')
        king = random.choice(s['players'])
        s.pop('forced_crown', None)
        s.update(round=0, king_id=king['id'], pending=None, winner_id=None, last_event=None, turn_seat=None, effects=[])
        setup_decks(s)
        for q in s['players']:
            gold = (1000 if q['id'] == king['id'] else 600) if s['settings']['starting_gold'] == 'roles' else (1000 if s['settings']['starting_gold'] == 'equal' else random.choice((800, 900, 1000, 1100, 1200)))
            q.update(gold=gold, hand=[], shield=False, attachments={}, gold_received=0)
        crown(s)
        for q in s['players']:
            refill(s, q)
        begin_round(s)
    elif kind == 'respond':
        require(s['pending'] is not None, 'Không có yêu cầu đang chờ.')
        hook('respond', s, p, action)
        after_effect(s)
    elif kind in ('play', 'end_turn'):
        require(s['phase'] == 'playing' and s['current_player_id'] == pid, 'Chưa đến lượt bạn.')
        require(not s['pending'], 'Đang chờ người chơi phản hồi.')
        if kind == 'end_turn':
            end_turn(s)
        else:
            card = own_card(p, action.get('card_id'))
            require(card is not None and s['actions_left'] > 0, 'Bạn không thể đánh lá bài này.')
            require(card_info(card)['role'] == role(s, p), 'Lá bài không đúng vai trò.')
            hook('validate', s, p, card, action)
            p['hand'].remove(card)
            s['actions_left'] -= 1
            concealed = action.get('as_knight') or card['type'] in ('n_knight', 'k_knight')
            event_type = 'face_down_knight' if concealed else card['type']
            event_name = 'Hiệp sĩ úp' if concealed else card_info(card)['name']
            s['last_event'] = dict(id=uuid.uuid4().hex, type=event_type, name=event_name, actor_id=pid, target_id=action.get('target_id'), target_ids=[value for value in (action.get('target_id'), action.get('second_target_id')) if value])
            retained = hook('resolve', s, p, card, action)
            if not retained:
                discard(s, card)
            log(s, f"{p['name']} dùng {event_name}.")
            after_effect(s)
    elif kind in ('transfer', 'offer_trade', 'offer_discard', 'accept_trade', 'reject_trade'):
        negotiate(s, p, action)
        crown(s)
    else:
        require(hook('extra_action', s, p, action), 'Hành động không hợp lệ.')
        after_effect(s)
    s['seen'] = (s['seen']+[key])[-500:]
    s['version'] += 1

def negotiate(s, p, action):
    require(s['phase'] == 'negotiation', 'Chỉ giao dịch khi chợ đen mở.')
    require(not s['pending'], 'Đang chờ giải quyết lá bài.')
    kind = action['action']
    if kind in ('accept_trade', 'reject_trade'):
        offer = next((o for o in s['offers'] if o['id'] == action.get('offer_id')), None)
        require(offer is not None and offer['to_id'] == p['id'], 'Đề nghị không hợp lệ.')
        if kind == 'reject_trade':
            s['offers'].remove(offer)
            return
        require(s['settings']['allow_trades'], 'Đổi bài đã tắt.')
        sender = get_player(s, offer['from_id'])
        offered = own_card(sender, offer['offered_card_id'])
        require(offered is not None, 'Lá bài đã không còn.')
        if offer.get('kind') == 'discard':
            hook('validate_discard', s, sender, offered)
            sender['hand'].remove(offered)
            discard(s, offered)
            refill(s, sender)
            log(s, f"{p['name']} đồng ý cho {sender['name']} bỏ bài theo giao kèo.")
        else:
            require(role(s, sender) == role(s, p), 'Không được trao đổi bài khác vai trò.')
            selected = action.get('card_id') or offer.get('requested_card_id')
            requested = own_card(p, selected) if selected else (random.choice(p['hand']) if p['hand'] else None)
            require(requested is not None, 'Chọn bài của bạn để trao đổi.')
            require(not offer.get('requested_card_id') or requested['id'] == offer['requested_card_id'], 'Lá bài không khớp đề nghị.')
            hook('validate_trade', s, sender, p, offered, requested)
            transfer(s, sender, p, offer['gold'], 'deal')
            sender['hand'].remove(offered)
            p['hand'].remove(requested)
            sender['hand'].append(requested)
            p['hand'].append(offered)
            log(s, f"{sender['name']} và {p['name']} đã đổi bài.")
        s['offers'].remove(offer)
        return
    target = get_player(s, action.get('target_id'))
    require(target is not None and target['id'] != p['id'], 'Chọn một người khác.')
    if kind == 'transfer':
        require(s['settings']['allow_transfers'], 'Chuyển vàng đã tắt.')
        amount = action.get('amount')
        require(type(amount) is int and 0 < amount <= p['gold'], 'Số vàng không hợp lệ.')
        transfer(s, p, target, amount, 'deal')
        s['last_event'] = dict(id=uuid.uuid4().hex, type='transfer', actor_id=p['id'], target_id=target['id'])
        log(s, f"{p['name']} chuyển {amount} vàng cho {target['name']}.")
    else:
        require(s['settings']['allow_trades'], 'Đổi bài đã tắt.')
        require(len(s['offers']) < 24, 'Có quá nhiều đề nghị đang chờ.')
        offered = own_card(p, action.get('offered_card_id') or action.get('card_id'))
        gold = action.get('gold', 0)
        require(offered is not None and type(gold) is int and 0 <= gold <= p['gold'], 'Bài hoặc vàng không hợp lệ.')
        requested = action.get('requested_card_id')
        require(requested is None or isinstance(requested, str), 'Bài yêu cầu không hợp lệ.')
        require(not requested or own_card(target, requested), 'Bài yêu cầu không hợp lệ.')
        if kind == 'offer_trade':
            require(role(s, target) == role(s, p), 'Không được trao đổi bài khác vai trò.')
            hook('validate_trade', s, p, target, offered, own_card(target, requested) if requested else None)
        else:
            hook('validate_discard', s, p, offered)
        s['offers'].append(dict(id=uuid.uuid4().hex, kind='discard' if kind == 'offer_discard' else 'trade', from_id=p['id'], to_id=target['id'], offered_card_id=offered['id'], requested_card_id=requested, gold=gold if kind == 'offer_trade' else 0))

def snapshot(s, pid, code):
    result = {k: copy.deepcopy(s[k]) for k in ('phase', 'round', 'settings', 'host_id', 'king_id', 'current_player_id', 'actions_left', 'deadline', 'winner_id', 'log', 'version', 'direction')}
    result['code'], result['players'] = code, []
    for p in sorted(s['players'], key=lambda q: q['seat']):
        public = {k: p[k] for k in ('id', 'name', 'seat', 'gold', 'ready')}
        public.update(hand_count=len(p['hand']), character=p.get('character', 'regent'), role=role(s, p), gold_received=p.get('gold_received', 0), shield=False)
        public['attachments'] = hook('public_attachments', s, p, pid) or {}
        result['players'].append(public)
    result['hand'] = [card_view(c) for c in get_player(s, pid)['hand']]
    result['hand_size'] = s['settings']['hand_size']
    result['pending'] = hook('sanitize_pending', s, pid) if s['pending'] else None
    if s['pending'] and result['pending'] is None:
        keys = ('id', 'kind', 'title', 'text', 'eligible_ids', 'choices', 'votes', 'player_id')
        result['pending'] = {k: copy.deepcopy(s['pending'][k]) for k in keys if k in s['pending']}
    result['offers'] = [copy.deepcopy(o) for o in s['offers'] if pid in (o['from_id'], o['to_id'])]
    for offer in result['offers']:
        card = own_card(get_player(s, offer['from_id']), offer['offered_card_id'])
        offer['offered_card'] = card_view(card) if card else None
    result['last_event'] = copy.deepcopy(s.get('last_event'))
    result['deck_counts'] = {r: len(s['decks'][r]) for r in ('king', 'noble')}
    return result
