"""Server-authoritative Secret Hitler. Rules: official Secret_Hitler_Rules.pdf.

Secrets exist only in persisted state; snapshot is an explicit public allowlist.
"""
import copy
import secrets


class RuleError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise RuleError(message)


def player(name, seat):
    require(isinstance(name, str) and 0 < len(name.strip()) <= 24, 'Tên cần từ 1 đến 24 ký tự.')
    return dict(id=secrets.token_hex(8), token=secrets.token_urlsafe(32), name=name.strip(),
                seat=seat, ready=False, alive=True, role=None,
                eliminated_office=None, eliminated_office_slot=None)


def new_state(name):
    p = player(name, 0)
    return dict(players=[p], host_id=p['id'], phase='lobby', version=1,
                president_id=None, chancellor_id=None, nominee_id=None,
                seated_president_id=None, seated_chancellor_id=None, execution_event=None,
                ballot_event=None, presentation_event=None,
                liberal_policies=0, fascist_policies=0, election_tracker=0,
                round=0, power=None, winner=None, win_reason='', votes={}, last_votes={},
                deck=[], discard=[], hand=[], private_info={}, investigated=[],
                last_president_id=None, last_chancellor_id=None, rotation_anchor=None,
                power_used=False, veto_rejected=False, log=[], seen_actions={})


def get_player(s, pid):
    p = next((p for p in s['players'] if p['id'] == pid), None)
    require(p is not None, 'Không có người chơi này.')
    return p


def authenticate(s, token):
    if not isinstance(token, str) or not token or not token.isascii() or len(token) > 128:
        return None
    return next((p['id'] for p in s['players'] if secrets.compare_digest(p['token'], token)), None)


def living(s):
    return [p for p in s['players'] if p['alive']]


def party(p):
    return 'liberal' if p['role'] == 'liberal' else 'fascist'


def note(s, text):
    s['log'].append(dict(id=secrets.token_hex(6), text=text))
    s['log'] = s['log'][-100:]


def board(s):
    n = len(s['players'])
    if n <= 6:
        return [None, None, 'policy_peek', 'execution', 'execution', None]
    if n <= 8:
        return [None, 'investigate', 'special_election', 'execution', 'execution', None]
    return ['investigate', 'investigate', 'special_election', 'execution', 'execution', None]


def eligible_chancellors(s):
    blocked = {s['president_id'], s['last_chancellor_id']}
    if len(living(s)) > 5:
        blocked.add(s['last_president_id'])
    return [p['id'] for p in living(s) if p['id'] not in blocked]


def eligible_targets(s):
    return [p['id'] for p in living(s) if p['id'] != s['president_id']
            and (s['power'] != 'investigate' or p['id'] not in s['investigated'])]


def shuffle_deck(s):
    if len(s['deck']) < 3 and s['discard']:
        s['deck'].extend(s['discard'])
        s['discard'] = []
        secrets.SystemRandom().shuffle(s['deck'])


def win(s, team, reason):
    s.update(phase='finished', winner=team, win_reason=reason, hand=[], power=None)
    note(s, reason)


def next_round(s, chosen=None):
    if s['phase'] == 'finished':
        return
    if chosen is None:
        anchor = s['rotation_anchor'] or s['president_id']
        seat = get_player(s, anchor)['seat']
        ordered = sorted(living(s), key=lambda p: (p['seat'] - seat - 1) % len(s['players']))
        chosen = ordered[0]['id']
        s['rotation_anchor'] = None
    s.update(phase='nomination', president_id=chosen, chancellor_id=None, nominee_id=None,
             votes={}, hand=[], power=None, power_used=False, veto_rejected=False)
    s['round'] += 1
    note(s, f"Lượt {s['round']}: {get_player(s, chosen)['name']} đề cử chính phủ.")


def enact(s, policy, chaos=False):
    s[f'{policy}_policies'] += 1
    s['election_tracker'] = 0
    note(s, ('Hỗn loạn: ' if chaos else '') + ('Luật Tự do được ban hành.' if policy == 'liberal' else 'Luật Phát xít được ban hành.'))
    shuffle_deck(s)
    if s['liberal_policies'] == 5:
        win(s, 'liberal', 'Phe Tự do thắng: đã ban hành 5 luật Tự do.')
    elif s['fascist_policies'] == 6:
        win(s, 'fascist', 'Phe Phát xít thắng: đã ban hành 6 luật Phát xít.')
    elif policy == 'fascist' and not chaos and board(s)[s['fascist_policies'] - 1]:
        s.update(phase='executive', power=board(s)[s['fascist_policies'] - 1], power_used=False)
    else:
        next_round(s)


def inactive_government(s):
    s['election_tracker'] += 1
    if s['election_tracker'] == 3:
        s['last_president_id'] = s['last_chancellor_id'] = None
        require(bool(s['deck']), 'Bộ luật đã hết.')
        enact(s, s['deck'].pop(0), chaos=True)
    else:
        next_round(s)


def start(s):
    n = len(s['players'])
    require(5 <= n <= 10, 'Secret Hitler cần từ 5 đến 10 người.')
    require(all(p['ready'] or p['id'] == s['host_id'] for p in s['players']), 'Mọi người cần sẵn sàng trước.')
    s.update(seated_president_id=None, seated_chancellor_id=None, execution_event=None,
             ballot_event=None, presentation_event=None)
    fascists = (n - 3) // 2
    roles = ['hitler'] + ['fascist'] * fascists + ['liberal'] * (n - fascists - 1)
    secrets.SystemRandom().shuffle(roles)
    for p, role in zip(s['players'], roles):
        p.update(role=role, alive=True, eliminated_office=None, eliminated_office_slot=None)
    s['deck'] = ['liberal'] * 6 + ['fascist'] * 11
    secrets.SystemRandom().shuffle(s['deck'])
    note(s, 'Vai bí mật đã được chia. Hãy xem phong bì riêng của bạn.')
    next_round(s, secrets.choice(s['players'])['id'])


def _apply(s, pid, data):
    p = get_player(s, pid)
    action = data.get('action')
    phase = s['phase']
    if action == 'ready':
        require(phase == 'lobby', 'Ván đã bắt đầu.')
        require(type(data.get('ready')) is bool, 'Trạng thái sẵn sàng không hợp lệ.')
        p['ready'] = data['ready']
    elif action == 'leave':
        require(phase == 'lobby', 'Chỉ rời ghế trong phòng chờ. Trong ván hãy dùng phiên cũ để quay lại.')
        s['players'].remove(p)
        for i, remaining in enumerate(s['players']):
            remaining['seat'] = i
        if pid == s['host_id']:
            s['host_id'] = s['players'][0]['id'] if s['players'] else None
    elif action == 'start':
        require(phase == 'lobby' and pid == s['host_id'], 'Chỉ chủ phòng được bắt đầu.')
        start(s)
    elif action == 'rematch':
        require(phase == 'finished' and pid == s['host_id'], 'Chỉ chủ phòng được mở ván mới sau khi kết thúc.')
        old_players, old_host, old_version, seen = s['players'], s['host_id'], s['version'], s['seen_actions']
        fresh = new_state('temporary')
        fresh.update(players=old_players, host_id=old_host, version=old_version, seen_actions=seen)
        for person in old_players:
            person.update(role=None, alive=True, ready=False, eliminated_office=None, eliminated_office_slot=None)
        s.clear()
        s.update(fresh)
    else:
        require(p['alive'] and phase not in ('lobby', 'finished'), 'Bạn không thể hành động lúc này.')
        if action == 'nominate':
            require(phase == 'nomination' and pid == s['president_id'], 'Chỉ ứng viên Tổng thống được đề cử.')
            require(data.get('target_id') in eligible_chancellors(s), 'Ứng viên Thủ tướng không hợp lệ hoặc bị giới hạn nhiệm kỳ.')
            s.update(nominee_id=data['target_id'], phase='voting', votes={})
            note(s, f"{p['name']} đề cử {get_player(s, data['target_id'])['name']} làm Thủ tướng.")
        elif action == 'vote':
            require(phase == 'voting' and pid not in s['votes'], 'Bạn đã bỏ phiếu hoặc chưa đến lúc bỏ phiếu.')
            require(type(data.get('vote')) is bool, 'Phiếu phải là Ja hoặc Nein.')
            s['votes'][pid] = data['vote']
            if len(s['votes']) == len(living(s)):
                s['last_votes'] = dict(s['votes'])
                # Attendants may collect sealed envelopes earlier, but color
                # faces become public only at the simultaneous final reveal.
                s['ballot_event'] = dict(id=secrets.token_hex(12), votes=dict(s['votes']))
                yes = sum(s['votes'].values())
                note(s, f"Kết quả: {yes} Ja / {len(living(s)) - yes} Nein.")
                if yes * 2 <= len(living(s)):
                    inactive_government(s)
                else:
                    s['chancellor_id'] = s['nominee_id']
                    s['last_president_id'], s['last_chancellor_id'] = s['president_id'], s['chancellor_id']
                    # Physical office chairs belong to the elected government,
                    # never to a candidate or an unsuccessful nomination.
                    s['seated_president_id'], s['seated_chancellor_id'] = s['president_id'], s['chancellor_id']
                    if s['fascist_policies'] >= 3 and get_player(s, s['chancellor_id'])['role'] == 'hitler':
                        win(s, 'fascist', 'Phe Phát xít thắng: Hitler được bầu làm Thủ tướng sau luật Phát xít thứ ba.')
                    else:
                        if s['fascist_policies'] >= 3:
                            note(s, f"{get_player(s, s['chancellor_id'])['name']} không phải Hitler.")
                        shuffle_deck(s)
                        s['hand'], s['deck'] = s['deck'][:3], s['deck'][3:]
                        s['phase'] = 'president_discard'
        elif action == 'discard':
            require((phase == 'president_discard' and pid == s['president_id']) or
                    (phase == 'chancellor_discard' and pid == s['chancellor_id']), 'Chưa đến lượt bạn chọn luật.')
            index = data.get('index')
            require(type(index) is int and 0 <= index < len(s['hand']), 'Lá luật không hợp lệ.')
            s['discard'].append(s['hand'].pop(index))
            if phase == 'president_discard':
                s['phase'] = 'chancellor_discard'
            else:
                policy = s['hand'].pop()
                enact(s, policy)
        elif action == 'request_veto':
            require(phase == 'chancellor_discard' and pid == s['chancellor_id'] and s['fascist_policies'] >= 5
                    and not s['veto_rejected'], 'Chưa thể yêu cầu phủ quyết.')
            s['phase'] = 'veto'
            note(s, 'Thủ tướng yêu cầu phủ quyết chương trình lập pháp.')
        elif action == 'respond_veto':
            require(phase == 'veto' and pid == s['president_id'], 'Chỉ Tổng thống được trả lời phủ quyết.')
            require(type(data.get('accept')) is bool, 'Phản hồi phủ quyết không hợp lệ.')
            if data['accept']:
                s['discard'].extend(s['hand'])
                s['hand'] = []
                note(s, 'Tổng thống đồng ý phủ quyết. Tăng bộ đếm bầu cử.')
                shuffle_deck(s)
                # Keep existing tracker: an election alone does not enact a policy.
                inactive_government(s)
                shuffle_deck(s)
            else:
                s.update(phase='chancellor_discard', veto_rejected=True)
                note(s, 'Tổng thống từ chối phủ quyết. Thủ tướng phải chọn luật.')
        elif action == 'power':
            require(phase == 'executive' and pid == s['president_id'] and not s['power_used'], 'Không có quyền hành pháp khả dụng.')
            power = s['power']
            if power == 'policy_peek':
                s['private_info'].setdefault(pid, []).append(dict(type='policy_peek', policies=s['deck'][:3]))
                s['power_used'] = True
                note(s, 'Tổng thống đã xem ba luật trên cùng của bộ bài.')
            else:
                target_id = data.get('target_id')
                require(target_id in eligible_targets(s), 'Không thể chọn người này cho quyền hành pháp.')
                target = get_player(s, target_id)
                if power == 'investigate':
                    s['investigated'].append(target_id)
                    s['private_info'].setdefault(pid, []).append(dict(type='investigate', target_id=target_id, party=party(target)))
                    s['power_used'] = True
                    note(s, f"Tổng thống đã điều tra đảng tịch của {target['name']}.")
                elif power == 'special_election':
                    # Return to the seat left of the President who called this election.
                    s['rotation_anchor'] = pid
                    note(s, f"{target['name']} được chỉ định ứng viên Tổng thống đặc biệt.")
                    next_round(s, target_id)
                elif power == 'execution':
                    office = ('president' if target_id == s.get('seated_president_id') else
                              'chancellor' if target_id == s.get('seated_chancellor_id') else None)
                    slot = sum(1 for person in s['players'] if not person['alive']
                               and person.get('eliminated_office') == office) if office else None
                    # Preserve the corpse's last office chair through later
                    # elections and reconnects without disclosing its secret role.
                    target.update(eliminated_office=office, eliminated_office_slot=slot)
                    target['alive'] = False
                    # Broadcast only a committed, legal shot. No secret role is
                    # attached, and replayed action IDs preserve this event ID.
                    s['execution_event'] = dict(id=secrets.token_hex(12), actor_id=pid, target_id=target_id)
                    note(s, f"{target['name']} đã bị hành quyết.")
                    if target['role'] == 'hitler':
                        win(s, 'liberal', 'Phe Tự do thắng: Hitler đã bị hành quyết.')
                    else:
                        next_round(s)
        elif action == 'acknowledge':
            require(phase == 'executive' and pid == s['president_id'] and s['power_used'], 'Chưa có kết quả riêng cần xác nhận.')
            next_round(s)
        else:
            raise RuleError('Hành động không hợp lệ.')


def presentation_event(before, after, pid, data):
    """A public allowlist for short narration; never serialize action payloads."""
    action = data['action']
    event = dict(id=secrets.token_hex(12), kind=action, actor_id=pid)
    if action == 'ready':
        event['ready'] = data['ready']
    elif action == 'respond_veto':
        event['accept'] = data['accept']
    elif action == 'nominate':
        event['target_id'] = after['nominee_id']
    elif action == 'power':
        event['power'] = before['power']
        if before['power'] in ('investigate', 'special_election', 'execution'):
            event['target_id'] = data['target_id']
    # A selected/discarded policy is secret. Only a policy actually placed on a
    # public track by this action is safe to announce (including chaos).
    for team in ('liberal', 'fascist'):
        if after[f'{team}_policies'] > before[f'{team}_policies']:
            event['policy'] = team
    return event


def apply(s, pid, data):
    require(isinstance(data, dict), 'Hành động không hợp lệ.')
    action_id = data.get('action_id')
    require(isinstance(action_id, str) and 0 < len(action_id) <= 128, 'Thiếu mã hành động hợp lệ.')
    get_player(s, pid)
    if action_id in s['seen_actions'].get(pid, []):
        return False
    # A rejected action must never partially modify persisted room state.
    draft = copy.deepcopy(s)
    _apply(draft, pid, data)
    draft['presentation_event'] = presentation_event(s, draft, pid, data)
    draft['version'] += 1
    draft['seen_actions'].setdefault(pid, []).append(action_id)
    draft['seen_actions'][pid] = draft['seen_actions'][pid][-128:]
    s.clear()
    s.update(draft)
    return True


def snapshot(s, pid, code):
    me = get_player(s, pid)
    public_keys = ('host_id', 'phase', 'version', 'president_id', 'chancellor_id', 'nominee_id',
                   'liberal_policies', 'fascist_policies', 'election_tracker', 'round', 'power',
                   'winner', 'win_reason', 'last_votes', 'veto_rejected', 'power_used', 'log')
    result = {key: copy.deepcopy(s[key]) for key in public_keys}
    # Rooms created before the immersive presentation have no new fields yet.
    result.update(seated_president_id=s.get('seated_president_id', s.get('last_president_id')),
                  seated_chancellor_id=s.get('seated_chancellor_id', s.get('last_chancellor_id')),
                  execution_event=copy.deepcopy(s.get('execution_event')),
                  ballot_event=copy.deepcopy(s.get('ballot_event')),
                  presentation_event=copy.deepcopy(s.get('presentation_event')))
    people = []
    for p in s['players']:
        public_player = {k: p[k] for k in ('id', 'name', 'seat', 'ready', 'alive')}
        public_player.update(eliminated_office=p.get('eliminated_office'),
                             eliminated_office_slot=p.get('eliminated_office_slot'))
        people.append(public_player)
    result.update(code=code, players=people,
                  role=me['role'], party=party(me) if me['role'] else None,
                  known_roles=[], hand=[], private_info=copy.deepcopy(s['private_info'].get(pid, [])),
                  eligible_chancellors=eligible_chancellors(s) if s['phase'] == 'nomination' else [],
                  eligible_targets=eligible_targets(s) if s['phase'] == 'executive' and not s['power_used'] else [],
                  board_powers=board(s), veto_unlocked=s['fascist_policies'] >= 5,
                  deck_count=len(s['deck']), discard_count=len(s['discard']),
                  voted_ids=list(s['votes']), votes={} if s['phase'] == 'voting' else copy.deepcopy(s['last_votes']))
    if s['phase'] == 'finished':
        result['known_roles'] = [dict(id=p['id'], role=p['role']) for p in s['players']]
    elif me['role'] == 'fascist' or (me['role'] == 'hitler' and len(s['players']) <= 6):
        result['known_roles'] = [dict(id=p['id'], role=p['role']) for p in s['players'] if p['id'] != pid and party(p) == 'fascist']
    if (s['phase'] == 'president_discard' and pid == s['president_id']) or (
            s['phase'] in ('chancellor_discard', 'veto') and pid == s['chancellor_id']):
        result['hand'] = list(s['hand'])
    return result
