"""Server-owned, 5 / 20 / 5 second rounds. No client can choose a verdict."""
import secrets

REACTIONS = ('water', 'egg', 'heart', 'lightning', 'same', 'doubt')


def player(name, avatar=0, gender='male'):
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 24:
        raise ValueError('Tên cần từ 1 đến 24 ký tự.')
    if type(avatar) is not int or not 0 <= avatar < 8:
        raise ValueError('Nhân vật không hợp lệ.')
    if gender not in ('male', 'female'):
        raise ValueError('Hãy chọn Nam hoặc Nữ.')
    return dict(id=secrets.token_hex(8), token=secrets.token_urlsafe(32), name=name.strip(),
                avatar=avatar, gender=gender, seat=0, draft='', gentle=True, seen=0, last_batch=0)


def new_state(person):
    return dict(players=[person], queue=[], phase='waiting', speaker=None, deadline=0,
                round=0, text='', votes={}, empathy=[], effects=[], result=None)


def advance(s, now):
    online = {p['id'] for p in s['players'] if now - p['seen'] < 35}
    s['queue'] = [pid for pid in s['queue'] if pid in online]
    if s['phase'] == 'waiting' and s['queue']:
        s.update(phase='arrival', speaker=s['queue'].pop(0), deadline=now+5,
                 round=s['round']+1, text='', votes={}, empathy=[], effects=[], result=None)
    # After a suspended worker, finish the old round without replaying stale turns.
    if s['phase'] == 'arrival' and now >= s['deadline']:
        p = next(p for p in s['players'] if p['id'] == s['speaker'])
        s.update(phase='confession', deadline=s['deadline']+20, text=p['draft'])
    if s['phase'] == 'confession' and now >= s['deadline']:
        heaven = sum(v == 'heaven' for v in s['votes'].values())
        hell = sum(v == 'hell' for v in s['votes'].values())
        s.update(phase='verdict', deadline=s['deadline']+5,
                 result=dict(heaven=heaven, hell=hell, same=len(s['empathy']),
                             kind='heaven' if heaven > hell else 'hell' if hell > heaven else 'tie'))
    if s['phase'] == 'verdict' and now >= s['deadline']:
        if s.get('shared') and s['speaker'] in online and s['speaker'] not in s['queue']:
            s['queue'].append(s['speaker'])
        s.update(phase='waiting', speaker=None, deadline=0, text='', effects=[])
    s['effects'] = [e for e in s['effects'] if now-e['at'] < 2][-60:]


def act(s, p, data, now):
    advance(s, now)
    p['seen'] = now
    action = data.get('action')
    if action == 'ping':
        return
    if action == 'leave':
        p['seen'] = 0
        s['queue'] = [pid for pid in s['queue'] if pid != p['id']]
        return
    if action == 'draft':
        value = data.get('text', '')
        if not isinstance(value, str) or len(value) > 3000 or len(value.split()) > 150:
            raise ValueError('Lời xưng tội tối đa 150 chữ / 3.000 ký tự.')
        p['draft'] = value.strip()
        if type(data.get('gentle')) is bool:
            p['gentle'] = data['gentle']
        return
    if action == 'queue':
        if p['id'] != s['speaker'] and p['id'] not in s['queue']:
            s['queue'].append(p['id'])
        advance(s, now)
        return
    if action == 'unqueue':
        s['queue'] = [pid for pid in s['queue'] if pid != p['id']]
        return
    if action != 'batch' or s['phase'] != 'confession' or data.get('round') != s['round']:
        raise ValueError('Hành động đã hết lượt hoặc chưa đến giờ.')
    if p['id'] == s['speaker']:
        raise ValueError('Bạn không thể tự phán xét mình.')
    if now-p['last_batch'] < .4:
        return
    p['last_batch'] = now
    vote = data.get('vote')
    if vote in ('heaven', 'hell'):
        s['votes'][p['id']] = vote
    reactions = data.get('reactions', [])
    if not isinstance(reactions, list):
        raise ValueError('Tương tác không hợp lệ.')
    speaker = next(q for q in s['players'] if q['id'] == s['speaker'])
    for kind in reactions[:4]:
        if kind not in REACTIONS or (speaker['gentle'] and kind in ('egg', 'lightning')):
            continue
        if kind == 'same' and p['id'] not in s['empathy']:
            s['empathy'].append(p['id'])
        s['effects'].append(dict(id=secrets.token_hex(5), actor=p['id'], kind=kind, at=now))
    s['effects'] = s['effects'][-60:]


def public(s, now):
    hidden = s['phase'] == 'confession' and s['deadline']-now <= 5
    return dict(players=[dict({k:p[k] for k in ('id', 'name', 'avatar', 'gentle')}, gender=p.get('gender', 'male'), seat=p.get('seat', i)) for i,p in enumerate(s['players'])
                         if now-p['seen'] < 35 or p['id'] == s['speaker']],
                queue=s['queue'], phase=s['phase'], speaker=s['speaker'], deadline=s['deadline'],
                round=s['round'], text=s['text'], effects=s['effects'], result=s['result'], now=now,
                heaven=None if hidden else sum(v == 'heaven' for v in s['votes'].values()),
                hell=None if hidden else sum(v == 'hell' for v in s['votes'].values()), same=len(s['empathy']))
