import copy
import time
from django.test import TestCase
from . import engine, services
from .models import Room
from django.test import TransactionTestCase
from channels.testing import WebsocketCommunicator
from channels.db import database_sync_to_async

class RulesTests(TestCase):
    def setUp(self):
        self.s = engine.new_state('A', {})
        self.s['players'].append(engine.player('B', 1))
        self.s['players'][1]['ready'] = True
        self.host = self.s['host_id']
        self.act('start')

    def act(self, kind, pid=None, **kw):
        engine.apply(self.s, pid or self.host, dict(action=kind, action_id=str(time.time_ns()), **kw))

    def test_snapshot_hides_other_hands_and_all_tokens(self):
        snap = engine.snapshot(self.s, self.host, 'ABCDEF')
        self.assertEqual(len(snap['hand']), 5)
        self.assertNotIn('token', str(snap))
        for p in snap['players']:
            self.assertNotIn('hand', p)
        for card in self.s['players'][1]['hand']:
            self.assertNotIn(card['id'], str(snap))

    def test_duplicate_action_does_not_apply_twice(self):
        p = engine.get_player(self.s, self.s['current_player_id'])
        p['hand'] = [dict(id='one', type='shield')]
        action = dict(action='play', action_id='same', card_id='one')
        engine.apply(self.s, p['id'], action)
        before = copy.deepcopy(self.s)
        engine.apply(self.s, p['id'], action)
        self.assertEqual(self.s, before)

    def test_crown_tie_and_shift_without_extra_turn(self):
        a, b = self.s['players']
        a['gold'] = b['gold'] = 1000
        self.s['king_id'] = a['id']
        engine.crown(self.s)
        self.assertEqual(self.s['king_id'], a['id'])
        before = self.s['actions_left']
        b['gold'] += 1
        engine.crown(self.s)
        self.assertEqual(self.s['king_id'], b['id'])
        self.assertEqual(self.s['actions_left'], before)

    def test_bomb_exempts_incumbent_for_entire_event(self):
        a, b = self.s['players']
        a['gold'], b['gold'] = 1000, 900
        self.s.update(king_id=a['id'], current_player_id=b['id'], actions_left=2)
        b['hand'] = [dict(id='bomb', type='bomb')]
        self.act('play', b['id'], card_id='bomb')
        self.assertEqual((a['gold'], b['gold']), (1000, 400))

    def test_final_pending_resolved_before_winner(self):
        a, b = self.s['players']
        self.s.update(round=4, turn_index=1, order=[a['id'], b['id']], current_player_id=b['id'], actions_left=1)
        b['hand'] = [dict(id='parrot', type='parrot')]
        self.act('play', b['id'], card_id='parrot', target_id=a['id'])
        self.assertEqual(self.s['phase'], 'playing')
        self.act('respond', a['id'], accept=False)
        self.assertEqual(self.s['phase'], 'finished')

    def test_negotiation_expiry_and_no_negotiation_after_final(self):
        self.s.update(phase='negotiation', deadline=time.time()-1)
        engine.advance_expired(self.s)
        self.assertEqual(self.s['round'], 2)
        self.assertEqual(self.s['phase'], 'playing')

    def test_transfer_validation_and_idempotency(self):
        a, b = self.s['players']
        self.s['phase'] = 'negotiation'
        with self.assertRaises(engine.RuleError):
            self.act('transfer', a['id'], target_id=b['id'], amount=-1)
        before = a['gold'] + b['gold']
        self.act('transfer', a['id'], target_id=b['id'], amount=50)
        self.assertEqual(a['gold'] + b['gold'], before)

    def test_settings_reset_readiness(self):
        self.s['phase'] = 'lobby'
        self.act('configure', settings={'rounds': 5})
        self.assertEqual(self.s['settings']['rounds'], 5)
        self.assertFalse(self.s['players'][1]['ready'])

    def test_leave_reassigns_host_in_lobby(self):
        self.s['phase'] = 'lobby'
        other = self.s['players'][1]['id']
        self.act('leave')
        self.assertEqual(self.s['host_id'], other)
        self.assertEqual(self.s['players'][0]['seat'], 0)

    def test_trade_is_atomic_and_reveals_only_offered_card(self):
        a, b = self.s['players']
        self.s['phase'] = 'negotiation'
        offered = a['hand'][0]['id']
        self.act('offer_trade', a['id'], target_id=b['id'], offered_card_id=offered, gold=50)
        offer = self.s['offers'][0]
        snap = engine.snapshot(self.s, b['id'], 'ABCDEF')
        self.assertEqual(snap['offers'][0]['offered_card']['id'], offered)
        for card in a['hand'][1:]:
            self.assertNotIn(card['id'], str(snap))
        total = a['gold'] + b['gold']
        self.act('accept_trade', b['id'], offer_id=offer['id'])
        self.assertTrue(any(c['id'] == offered for c in b['hand']))
        self.assertEqual((len(a['hand']), len(b['hand'])), (5, 5))
        self.assertEqual(a['gold'] + b['gold'], total)

class ApiTests(TestCase):
    def test_character_create_join_and_lobby_change_are_persisted(self):
        auth = self.client.post('/api/rooms/', {'name': 'An', 'character': 'knight'}, content_type='application/json').json()
        joined = self.client.post(f"/api/rooms/{auth['code']}/join/", {'name': 'Bình', 'character': 'jester'}, content_type='application/json')
        self.assertEqual(joined.status_code, 201)
        state = services.read(auth['code'], auth['token'])
        self.assertEqual([p['character'] for p in state['players']], ['knight', 'jester'])
        self.assertIsNone(services.mutate(auth['code'], auth['token'], {'action': 'choose_character', 'action_id': 'character1', 'character': 'scholar'}))
        self.assertEqual(services.read(auth['code'], auth['token'])['players'][0]['character'], 'scholar')

    def test_invalid_characters_rejected_without_adding_player(self):
        for character in ('wizard', None, ['rogue'], 5):
            response = self.client.post('/api/rooms/', {'name': 'An', 'character': character}, content_type='application/json')
            self.assertEqual(response.status_code, 400)
        auth = services.create_room('An', {})
        response = self.client.post(f"/api/rooms/{auth['code']}/join/", {'name': 'Bình', 'character': 'wizard'}, content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(len(services.read(auth['code'], auth['token'])['players']), 1)
        self.assertIsNotNone(services.mutate(auth['code'], auth['token'], {'action': 'choose_character', 'action_id': 'invalid', 'character': {}}))
        self.assertEqual(services.read(auth['code'], auth['token'])['players'][0]['character'], 'regent')

    def test_character_change_forbidden_after_start_and_old_rooms_have_default(self):
        auth = services.create_room('An', {}, 'rogue')
        other = services.join_room(auth['code'], 'Bình', 'rogue')
        services.mutate(auth['code'], other['token'], {'action': 'ready', 'action_id': 'ready'})
        services.mutate(auth['code'], auth['token'], {'action': 'start', 'action_id': 'start'})
        error = services.mutate(auth['code'], auth['token'], {'action': 'choose_character', 'action_id': 'late', 'character': 'merchant'})
        self.assertIsNotNone(error)
        self.assertEqual(services.read(auth['code'], auth['token'])['players'][0]['character'], 'rogue')
        room = Room.objects.get(code=auth['code'])
        del room.state['players'][1]['character']
        room.save()
        self.assertEqual(services.read(auth['code'], auth['token'])['players'][1]['character'], 'regent')

    def test_empty_lobby_can_be_reused_with_new_host(self):
        first = services.create_room('First', {})
        services.mutate(first['code'], first['token'], {'action': 'leave', 'action_id': 'leave'})
        newcomer = services.join_room(first['code'], 'New host')
        state = services.read(first['code'], newcomer['token'])
        self.assertEqual(state['host_id'], newcomer['player_id'])
        self.assertEqual(len(state['players']), 1)

    def test_create_join_auth_and_persist(self):
        response = self.client.post('/api/rooms/', {'name': 'An'}, content_type='application/json')
        self.assertEqual(response.status_code, 201)
        auth = response.json()
        self.assertEqual(self.client.get(f"/api/rooms/{auth['code']}/").status_code, 400)
        joined = self.client.post(f"/api/rooms/{auth['code']}/join/", {'name': 'Bình'}, content_type='application/json')
        self.assertEqual(joined.status_code, 201)
        state = self.client.get(f"/api/rooms/{auth['code']}/", {'token': auth['token']}).json()
        self.assertEqual(len(state['players']), 2)
        self.assertEqual(Room.objects.count(), 1)

    def test_unicode_token_rejected(self):
        auth = services.create_room('A', {})
        response = self.client.get(f"/api/rooms/{auth['code']}/", {'token': 'Tiếng Việt'})
        self.assertEqual(response.status_code, 400)

class WebsocketTests(TransactionTestCase):
    async def test_two_players_ready_start_and_private_hands(self):
        from crown.asgi import application
        first = await database_sync_to_async(services.create_room)('An', {})
        second = await database_sync_to_async(services.join_room)(first['code'], 'Bình')
        clients = [WebsocketCommunicator(application, f"/ws/rooms/{a['code']}/?token={a['token']}", headers=[(b'origin', b'http://localhost:5173')]) for a in (first, second)]
        try:
            for c in clients:
                connected, _ = await c.connect()
                self.assertTrue(connected)
                self.assertEqual((await c.receive_json_from())['state']['phase'], 'lobby')
            await clients[1].send_json_to({'type': 'action', 'action': 'ready', 'action_id': 'ready'})
            for c in clients:
                await c.receive_json_from()
            await clients[0].send_json_to({'type': 'action', 'action': 'start', 'action_id': 'start'})
            states = [(await c.receive_json_from())['state'] for c in clients]
            self.assertEqual(states[0]['phase'], 'playing')
            self.assertEqual(len(states[0]['hand']), 5)
            self.assertTrue(set(c['id'] for c in states[0]['hand']).isdisjoint(c['id'] for c in states[1]['hand']))
            await clients[0].send_json_to({'type': 'action', 'action': 'transfer', 'action_id': 'bad', 'amount': 100, 'target_id': second['player_id']})
            self.assertEqual((await clients[0].receive_json_from())['type'], 'error')
        finally:
            for c in clients:
                await c.disconnect()
