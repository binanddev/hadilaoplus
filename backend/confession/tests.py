import time
from django.test import SimpleTestCase, TestCase, TransactionTestCase
from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from . import engine, services
from .models import ConfessionRoom


class RulesTests(SimpleTestCase):
    def setUp(self):
        self.a, self.b = engine.player('Kể chuyện'), engine.player('Khán giả', 2)
        self.a['seen'] = self.b['seen'] = 100
        self.s = engine.new_state(self.a)
        self.s['players'].append(self.b)

    def start(self):
        engine.act(self.s, self.a, {'action':'queue'}, 100)
        engine.advance(self.s, 105)

    def test_private_draft_published_only_at_twenty_second_window(self):
        engine.act(self.s, self.a, {'action':'draft', 'text':'Chuyện riêng'}, 100)
        engine.act(self.s, self.a, {'action':'queue'}, 100)
        visible = engine.public(self.s, 101)
        self.assertEqual(visible['text'], '')
        self.assertNotIn('draft', visible['players'][0])
        self.assertNotIn('token', visible['players'][0])
        engine.advance(self.s, 105)
        self.assertEqual(self.s['text'], 'Chuyện riêng')
        self.assertEqual(self.s['deadline'], 125)
        engine.advance(self.s, 125)
        self.assertEqual(self.s['phase'], 'verdict')
        self.assertEqual(self.s['result']['kind'], 'tie')
        engine.advance(self.s, 130)
        self.assertEqual(self.s['phase'], 'waiting')

    def test_word_limit_and_unicode(self):
        engine.act(self.s, self.a, {'action':'draft','text':'tội '*150}, 100)
        with self.assertRaises(ValueError):
            engine.act(self.s, self.a, {'action':'draft','text':'tội '*151}, 100)

    def test_one_vote_can_change_but_cannot_multiply(self):
        self.start()
        for now, vote in [(106,'hell'), (107,'hell'), (108,'heaven')]:
            engine.act(self.s, self.b, {'action':'batch','round':1,'vote':vote,'reactions':['same']}, now)
        self.assertEqual(engine.public(self.s, 108)['heaven'], 1)
        self.assertEqual(engine.public(self.s, 108)['hell'], 0)
        self.assertEqual(len(self.s['empathy']), 1)
        self.assertIsNone(engine.public(self.s, 121)['heaven'])
        engine.advance(self.s, 125)
        self.assertEqual(self.s['result']['kind'], 'heaven')

    def test_self_vote_stale_round_and_late_vote_rejected(self):
        self.start()
        for person, round_no, now in [(self.a,1,106), (self.b,0,106), (self.b,1,126)]:
            with self.assertRaises(ValueError):
                engine.act(self.s, person, {'action':'batch','round':round_no,'vote':'hell'}, now)

    def test_gentle_mode_and_effect_budget(self):
        self.start()
        engine.act(self.s, self.b, {'action':'batch','round':1,'reactions':['egg','lightning','heart','water']*100}, 106)
        self.assertEqual([e['kind'] for e in self.s['effects']], ['heart','water'])

    def test_queue_is_unique_fifo_and_offline_players_skipped(self):
        self.start()
        engine.act(self.s, self.b, {'action':'queue'}, 106)
        engine.act(self.s, self.b, {'action':'queue'}, 107)
        self.assertEqual(self.s['queue'], [self.b['id']])
        engine.advance(self.s, 130)
        engine.advance(self.s, 130.5)
        self.assertEqual(self.s['speaker'], self.b['id'])
        self.assertEqual(self.s['round'], 2)


class PersistenceTests(TestCase):
    def test_public_admission_uses_one_room_and_queues_both_genders(self):
        a = services.enter_public('Nam', 0, 'male')
        b = services.enter_public('Nữ', 1, 'female')
        self.assertEqual(a['code'], b['code'])
        self.assertEqual(ConfessionRoom.objects.count(), 1)
        state, _ = services.update(a['code'], a['token'], {'action':'ping'})
        self.assertEqual(state['speaker'], a['id'])
        self.assertEqual(state['queue'], [b['id']])
        self.assertEqual([p['gender'] for p in state['players']], ['male', 'female'])
        self.assertEqual([p['seat'] for p in state['players']], [0, 1])
        resumed = services.enter_public('Nam', 0, 'male', a['token'])
        self.assertEqual(resumed, a)
        self.assertEqual(len(ConfessionRoom.objects.get(code=a['code']).state['players']), 2)

    def test_public_capacity_departure_and_stable_seats(self):
        first = services.enter_public('First', 0, 'male')
        room = ConfessionRoom.objects.get(code=first['code'])
        for i in range(1, 100):
            p = engine.player(str(i)); p.update(seen=time.time(), seat=i); room.state['players'].append(p)
        room.save()
        with self.assertRaises(ValueError):
            services.enter_public('Full', 1, 'female')
        room.refresh_from_db()
        departing = room.state['players'][10]
        services.update(first['code'], departing['token'], {'action':'leave'})
        newcomer = services.enter_public('New', 2, 'female')
        room.refresh_from_db()
        self.assertEqual(len(room.state['players']), 100)
        self.assertEqual(next(p['seat'] for p in room.state['players'] if p['id']==newcomer['id']), 10)
        self.assertEqual(len({p['seat'] for p in room.state['players']}), 100)

    def test_shared_round_rotates_speaker_to_back_of_queue(self):
        a = services.enter_public('A', 0, 'male')
        b = services.enter_public('B', 1, 'female')
        room = ConfessionRoom.objects.get(code=a['code'])
        now = time.time()
        room.state.update(phase='verdict', speaker=a['id'], deadline=now, queue=[b['id']])
        engine.advance(room.state, now)
        self.assertEqual(room.state['queue'], [b['id'], a['id']])
        engine.advance(room.state, now+.1)
        self.assertEqual(room.state['speaker'], b['id'])

    def test_public_endpoint_requires_gender(self):
        response = self.client.post('/api/confession/enter/', {'name':'A', 'avatar':0}, content_type='application/json')
        self.assertEqual(response.status_code, 400)
        response = self.client.post('/api/confession/enter/', {'name':'A', 'avatar':0, 'gender':'female'}, content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['code'], 'PUBLIC')

    def test_capacity_authentication_and_game_isolation(self):
        session = services.create('Host', 0)
        room = ConfessionRoom.objects.get(code=session['code'])
        for i in range(99):
            p = engine.player(str(i)); p['seen'] = time.time(); room.state['players'].append(p)
        room.save()
        with self.assertRaises(ValueError):
            services.join(session['code'], 'Full', 1)
        with self.assertRaises(ValueError):
            services.update(session['code'], 'wrong', {'action':'queue'})
        state, p = services.update(session['code'], session['token'], {'action':'ping'})
        self.assertEqual(len(state['players']), 100)
        self.assertEqual(p['id'], session['id'])


class SocketTests(TransactionTestCase):
    async def test_real_route_private_draft_and_timed_broadcast(self):
        from crown.asgi import application
        session = await database_sync_to_async(services.create)('Host', 0)
        client = WebsocketCommunicator(application, f"/ws/confession/rooms/{session['code']}/?token={session['token']}", headers=[(b'origin',b'http://localhost:5173')])
        try:
            self.assertTrue((await client.connect())[0])
            self.assertEqual((await client.receive_json_from())['type'], 'state')
            self.assertEqual((await client.receive_json_from())['type'], 'draft')
            await client.send_json_to({'action':'queue'})
            message = await client.receive_json_from(timeout=2)
            self.assertEqual(message['state']['phase'], 'arrival')
        finally:
            await client.disconnect()
