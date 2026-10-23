import copy
import time
from django.test import TestCase
from . import engine, services
from .models import Room
from django.test import TransactionTestCase
from channels.testing import WebsocketCommunicator
from channels.db import database_sync_to_async
from unittest.mock import patch
from .catalog import CARDS

class RulesTests(TestCase):
    def setUp(self):
        self.s = engine.new_state('A', {})
        for seat in range(1, 4):
            p = engine.player(chr(65+seat), seat)
            p['ready'] = True
            self.s['players'].append(p)
        self.act('start', self.s['host_id'])

    def act(self, kind, pid=None, **kw):
        engine.apply(self.s, pid or self.s['current_player_id'], dict(action=kind, action_id=str(time.time_ns()), **kw))

    def test_roles_gold_eight_cards_finite_decks(self):
        king = engine.get_player(self.s, self.s['king_id'])
        self.assertEqual(king['gold'], 1000)
        self.assertEqual(self.s['actions_left'], 2)  # four-player king exception
        self.assertEqual(sum(c['count'] for c in CARDS.values() if c['role']=='noble'), 74)
        self.assertEqual(sum(c['count'] for c in CARDS.values() if c['role']=='king'), 25)
        all_cards = []
        for p in self.s['players']:
            self.assertEqual(len(p['hand']), 8)
            self.assertEqual(p['gold'], 1000 if p['id']==king['id'] else 600)
            self.assertTrue(all(CARDS[c['type']]['role']==engine.role(self.s,p) for c in p['hand']))
            all_cards += p['hand']
        all_cards += self.s['decks']['king']+self.s['decks']['noble']
        self.assertEqual(len(all_cards),99)
        self.assertEqual(len({c['id'] for c in all_cards}),99)

    def test_snapshot_hides_other_hands_tokens_and_decks(self):
        me = self.s['host_id']
        snap = engine.snapshot(self.s,me,'ABCDEF')
        self.assertEqual(len(snap['hand']),8)
        self.assertNotIn('token',str(snap))
        self.assertNotIn('decks',snap)
        for p in self.s['players']:
            if p['id']!=me:
                for card in p['hand']:
                    self.assertNotIn(card['id'],str(snap))

    def test_crown_swaps_seats_hands_and_finishes_slot(self):
        king = engine.get_player(self.s,self.s['king_id'])
        challenger = next(p for p in self.s['players'] if p['id']!=king['id'])
        a,b = king['seat'],challenger['seat']
        old_hand,new_hand = copy.deepcopy(king['hand']),copy.deepcopy(challenger['hand'])
        challenger['gold']=1100
        engine.crown(self.s)
        self.assertEqual(self.s['king_id'],challenger['id'])
        self.assertEqual((king['seat'],challenger['seat']),(b,a))
        self.assertEqual(challenger['hand'],old_hand)
        self.assertEqual(king['hand'],new_hand)
        self.assertEqual(self.s['actions_left'],0)
        engine.after_effect(self.s)
        self.assertEqual(self.s['visited_seats'],[a])
        self.assertNotEqual(self.s['turn_seat'],a)

    def test_incumbent_wins_equal_gold(self):
        original=self.s['king_id']
        for p in self.s['players']:
            p['gold']=1000
        engine.crown(self.s)
        self.assertEqual(self.s['king_id'],original)

    def test_simultaneous_challengers_roll_loser_loses_hundred(self):
        challengers=[p for p in self.s['players'] if p['id']!=self.s['king_id']][:2]
        for p in challengers:
            p['gold']=1200
        with patch('game.engine.random.randint',side_effect=[2,5]):
            engine.crown(self.s)
        self.assertEqual(self.s['king_id'],challengers[1]['id'])
        self.assertEqual(challengers[0]['gold'],1100)

    def test_gold_limits_and_bank_covers_take_from_zero(self):
        a,b=self.s['players'][:2]
        a['gold'],b['gold']=0,1900
        engine.transfer(self.s,a,b,300)
        self.assertEqual((a['gold'],b['gold']),(0,2000))
        engine.lose(self.s,b,9999)
        self.assertEqual(b['gold'],0)

    def test_negotiation_received_cap_cannot_be_laundered(self):
        self.s['phase']='negotiation'
        a,b=self.s['players'][:2]
        a['gold']=1000
        b['gold']=600
        self.act('transfer',a['id'],target_id=b['id'],amount=400)
        self.act('transfer',b['id'],target_id=a['id'],amount=100)
        before=copy.deepcopy(self.s)
        with self.assertRaises(engine.RuleError):
            self.act('transfer',a['id'],target_id=b['id'],amount=1)
        self.assertEqual(self.s,before)

    def test_trade_atomic_role_restriction_and_discard_consent(self):
        self.s['phase']='negotiation'
        nobles=[p for p in self.s['players'] if p['id']!=self.s['king_id']]
        a,b=nobles[:2]
        aid,bid=a['id'],b['id']
        restricted=('n_divine_right','n_peoples_champion','n_royal_bomb')
        card=next(c['id'] for c in a['hand'] if c['type'] not in restricted)
        self.act('offer_trade',aid,target_id=bid,offered_card_id=card,gold=50)
        offer=self.s['offers'][0]['id']
        chosen=next(c['id'] for c in engine.get_player(self.s,bid)['hand'] if c['type'] not in restricted)
        self.act('accept_trade',bid,offer_id=offer,card_id=chosen)
        self.assertTrue(engine.own_card(engine.get_player(self.s,bid),card))
        king=self.s['king_id']
        with self.assertRaises(engine.RuleError):
            self.act('offer_trade',aid,target_id=king,offered_card_id=chosen)
        self.act('offer_discard',aid,target_id=bid,card_id=chosen)
        self.assertTrue(engine.own_card(engine.get_player(self.s,aid),chosen))
        self.act('accept_trade',bid,offer_id=self.s['offers'][0]['id'])
        self.assertFalse(engine.own_card(engine.get_player(self.s,aid),chosen))
        self.assertEqual(len(engine.get_player(self.s,aid)['hand']),8)

    def test_round_directions_expiry_and_final_negotiation_option(self):
        for _ in range(4):
            self.act('end_turn')
        self.assertEqual(self.s['phase'],'negotiation')
        self.s['deadline']=time.time()-1
        engine.advance_expired(self.s)
        self.assertEqual((self.s['round'],self.s['direction']),(2,'counterclockwise'))
        for _ in range(4):
            self.act('end_turn')
        self.s['round']=4
        self.s['deadline']=time.time()-1
        engine.advance_expired(self.s)
        self.assertEqual(self.s['phase'],'finished')

    def test_final_pending_does_not_finish_early(self):
        self.s.update(round=4,visited_seats=[p['seat'] for p in self.s['players'] if p['seat']!=self.s['turn_seat']],actions_left=0)
        self.s['pending']={'kind':'test','player_id':self.s['current_player_id']}
        engine.after_effect(self.s)
        self.assertEqual(self.s['phase'],'playing')
        self.s['pending']=None
        engine.after_effect(self.s)
        self.assertEqual(self.s['phase'],'finished')

    def test_end_turn_draws_replacements_not_round_start(self):
        p=engine.get_player(self.s,self.s['current_player_id'])
        card=p['hand'].pop()
        engine.discard(self.s,card)
        pid=p['id']
        self.act('end_turn')
        self.assertEqual(len(engine.get_player(self.s,pid)['hand']),8)

    def test_place_knight_is_hidden_and_consumes_one_action(self):
        actor=next(p for p in self.s['players'] if p['id']!=self.s['king_id'])
        victim=actor
        self.s.update(current_player_id=actor['id'],turn_seat=actor['seat'],actions_left=2)
        card=next(c for c in actor['hand'] if c['type']!='n_royal_bomb')
        budget=self.s['actions_left']
        self.act('place_knight',actor['id'],card_id=card['id'],target_id=victim['id'])
        self.assertEqual(self.s['actions_left'],budget-1)
        self.assertFalse(engine.own_card(engine.get_player(self.s,actor['id']),card['id']))
        placed=engine.get_player(self.s,victim['id'])['attachments']['knights'][0]
        self.assertEqual(placed['id'],card['id'])
        self.assertEqual(self.s['last_event']['type'],'face_down_knight')
        self.assertEqual(self.s['last_event']['name'],'Hiệp sĩ úp')

    def test_final_negotiation_configurable_and_four_rounds_terminate(self):
        for final_negotiation in (False,True):
            self.setUp()
            self.s['settings']['final_negotiation']=final_negotiation
            for round_number in range(1,5):
                self.assertEqual(self.s['round'],round_number)
                for _ in range(4):
                    self.act('end_turn')
                if round_number<4 or final_negotiation:
                    self.assertEqual(self.s['phase'],'negotiation')
                    self.s['deadline']=time.time()-1
                    engine.advance_expired(self.s)
            self.assertEqual(self.s['phase'],'finished')
            self.assertEqual(self.s['winner_id'],self.s['king_id'])

    def test_duplicate_action_id_and_rejected_action_rollback(self):
        pid=self.s['current_player_id']
        action={'action':'end_turn','action_id':'once'}
        engine.apply(self.s,pid,action)
        before=copy.deepcopy(self.s)
        engine.apply(self.s,pid,action)
        self.assertEqual(self.s,before)
        with self.assertRaises(engine.RuleError):
            self.act('play',card_id='missing')
        self.assertEqual(self.s,before)

    def test_legacy_room_resets_safely_preserves_auth_character(self):
        p=self.s['players'][0]
        token=p['token']
        p['character']='jester'
        del self.s['schema_version']
        self.assertTrue(engine.upgrade(self.s))
        self.assertEqual(self.s['phase'],'lobby')
        self.assertEqual(self.s['players'][0]['token'],token)
        self.assertEqual(self.s['players'][0]['character'],'jester')
        self.assertFalse(self.s['players'][0]['hand'])

class ApiTests(TestCase):
    def test_max_eight_players_enforced(self):
        auth=services.create_room('Host',{})
        for seat in range(1,8):
            services.join_room(auth['code'],f'Guest {seat}')
        response=self.client.post(f"/api/rooms/{auth['code']}/join/",{'name':'Ninth'},content_type='application/json')
        self.assertEqual(response.status_code,400)
        self.assertEqual(len(services.read(auth['code'],auth['token'])['players']),8)
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
            self.assertEqual(len(states[0]['hand']), 8)
            self.assertTrue(set(c['id'] for c in states[0]['hand']).isdisjoint(c['id'] for c in states[1]['hand']))
            await clients[0].send_json_to({'type': 'action', 'action': 'transfer', 'action_id': 'bad', 'amount': 100, 'target_id': second['player_id']})
            self.assertEqual((await clients[0].receive_json_from())['type'], 'error')
        finally:
            for c in clients:
                await c.disconnect()
