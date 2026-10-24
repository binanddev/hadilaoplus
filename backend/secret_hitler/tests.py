import copy
import json
import secrets
from unittest.mock import patch
from django.test import TestCase
from . import engine, services
from .models import SecretRoom


class RulesTests(TestCase):
    def make(self, n=5):
        s = engine.new_state('A')
        for i in range(1, n):
            p = engine.player(f'Player {i}', i)
            p['ready'] = True
            s['players'].append(p)
        self.act(s, s['host_id'], 'start')
        return s

    def act(self, s, pid, action, **data):
        return engine.apply(s, pid, dict(action=action, action_id=secrets.token_hex(8), **data))

    def elect(self, s, nominee=None, yes=True):
        nominee = nominee or engine.eligible_chancellors(s)[0]
        self.act(s, s['president_id'], 'nominate', target_id=nominee)
        for p in list(engine.living(s)):
            self.act(s, p['id'], 'vote', vote=yes)

    def force_roles(self, s):
        for p in s['players']:
            p['role'] = 'liberal'
        s['players'][-1]['role'] = 'hitler'
        s['players'][-2]['role'] = 'fascist'

    def test_distribution_all_counts_and_deck(self):
        for n, liberals, fascists in [(5, 3, 1), (6, 4, 1), (7, 4, 2), (8, 5, 2), (9, 5, 3), (10, 6, 3)]:
            s = self.make(n)
            roles = [p['role'] for p in s['players']]
            self.assertEqual(roles.count('hitler'), 1)
            self.assertEqual(roles.count('liberal'), liberals)
            self.assertEqual(roles.count('fascist'), fascists)
            self.assertEqual(s['deck'].count('liberal'), 6)
            self.assertEqual(s['deck'].count('fascist'), 11)

    def test_start_requires_five_and_readiness(self):
        s = engine.new_state('A')
        with self.assertRaises(engine.RuleError):
            self.act(s, s['host_id'], 'start')
        for i in range(4):
            s['players'].append(engine.player(str(i), i + 1))
        with self.assertRaises(engine.RuleError):
            self.act(s, s['host_id'], 'start')

    def test_private_roles_knowledge_by_size(self):
        for n in (5, 6, 7, 10):
            s = self.make(n)
            for p in s['players']:
                snap = engine.snapshot(s, p['id'], 'SECRET')
                self.assertEqual(snap['role'], p['role'])
                self.assertNotIn('token', json.dumps(snap))
                self.assertNotIn('deck', snap)
                self.assertNotIn('discard', snap)
                for person in snap['players']:
                    self.assertNotIn('role', person)
                expected = p['role'] == 'fascist' or (p['role'] == 'hitler' and n <= 6)
                self.assertEqual(bool(snap['known_roles']), expected)

    def test_nomination_term_limits_and_five_survivors_exception(self):
        s = self.make(7)
        remaining = [p for p in s['players'] if p['id'] != s['president_id']]
        s['last_president_id'], s['last_chancellor_id'] = remaining[0]['id'], remaining[1]['id']
        self.assertNotIn(remaining[0]['id'], engine.eligible_chancellors(s))
        self.assertNotIn(remaining[1]['id'], engine.eligible_chancellors(s))
        remaining[-1]['alive'] = remaining[-2]['alive'] = False
        self.assertIn(remaining[0]['id'], engine.eligible_chancellors(s))
        self.assertNotIn(remaining[1]['id'], engine.eligible_chancellors(s))

    def test_votes_hidden_and_duplicate_vote_rejected(self):
        s = self.make()
        self.act(s, s['president_id'], 'nominate', target_id=engine.eligible_chancellors(s)[0])
        voter = s['players'][0]['id']
        self.act(s, voter, 'vote', vote=False)
        for p in s['players']:
            snap = engine.snapshot(s, p['id'], 'SECRET')
            self.assertEqual(snap['votes'], {})
            self.assertEqual(snap['voted_ids'], [voter])
        with self.assertRaises(engine.RuleError):
            self.act(s, voter, 'vote', vote=True)

    def test_tie_is_failed_election_and_preserves_limits(self):
        s = self.make(6)
        old = s['president_id']
        s['last_chancellor_id'] = 'previous'
        self.act(s, old, 'nominate', target_id=engine.eligible_chancellors(s)[0])
        for i, p in enumerate(s['players']):
            self.act(s, p['id'], 'vote', vote=i < 3)
        self.assertEqual(s['phase'], 'nomination')
        self.assertEqual(s['election_tracker'], 1)
        self.assertNotEqual(s['president_id'], old)
        self.assertEqual(s['last_chancellor_id'], 'previous')
        self.assertEqual(len(s['last_votes']), 6)

    def test_legislative_hands_are_private_and_policy_conserved(self):
        s = self.make()
        self.elect(s)
        self.assertEqual(s['phase'], 'president_discard')
        for p in s['players']:
            self.assertEqual(len(engine.snapshot(s, p['id'], 'SECRET')['hand']), 3 if p['id'] == s['president_id'] else 0)
        president, chancellor = s['president_id'], s['chancellor_id']
        self.act(s, president, 'discard', index=0)
        self.assertEqual(s['phase'], 'chancellor_discard')
        for p in s['players']:
            self.assertEqual(len(engine.snapshot(s, p['id'], 'SECRET')['hand']), 2 if p['id'] == chancellor else 0)
        self.act(s, chancellor, 'discard', index=0)
        self.assertEqual(s['liberal_policies'] + s['fascist_policies'], 1)
        self.assertEqual(len(s['deck']) + len(s['discard']) + len(s['hand']) + s['liberal_policies'] + s['fascist_policies'], 17)

    def test_chaos_resets_limits_and_never_grants_power(self):
        s = self.make(9)
        s['last_president_id'], s['last_chancellor_id'] = 'oldP', 'oldC'
        s['deck'][0] = 'fascist'
        for _ in range(3):
            self.elect(s, yes=False)
        self.assertEqual(s['fascist_policies'], 1)
        self.assertEqual(s['phase'], 'nomination')
        self.assertEqual(s['election_tracker'], 0)
        self.assertIsNone(s['power'])
        self.assertIsNone(s['last_president_id'])
        self.assertIsNone(s['last_chancellor_id'])

    def test_hitler_election_win_only_after_third_fascist_policy(self):
        for policies in (2, 3):
            s = self.make()
            self.force_roles(s)
            s['president_id'] = s['players'][0]['id']
            s['fascist_policies'] = policies
            self.elect(s, s['players'][-1]['id'])
            self.assertEqual(s['phase'], 'finished' if policies == 3 else 'president_discard')
            self.assertEqual(s['winner'], 'fascist' if policies == 3 else None)

    def test_board_powers_fixed_by_initial_player_count(self):
        self.assertEqual(engine.board(self.make(5)), [None, None, 'policy_peek', 'execution', 'execution', None])
        s = self.make(9)
        s['players'][0]['alive'] = False
        self.assertEqual(engine.board(s), ['investigate', 'investigate', 'special_election', 'execution', 'execution', None])

    def test_investigation_shows_party_not_hitler_and_once_per_game(self):
        s = self.make(9)
        self.force_roles(s)
        president, target = s['players'][0]['id'], s['players'][-1]['id']
        s.update(phase='executive', president_id=president, power='investigate')
        self.act(s, president, 'power', target_id=target)
        self.assertEqual(engine.snapshot(s, president, 'SECRET')['private_info'], [dict(type='investigate', target_id=target, party='fascist')])
        self.assertEqual(engine.snapshot(s, s['players'][1]['id'], 'SECRET')['private_info'], [])
        self.act(s, president, 'acknowledge')
        s.update(phase='executive', president_id=president, power='investigate', power_used=False)
        with self.assertRaises(engine.RuleError):
            self.act(s, president, 'power', target_id=target)

    def test_peek_keeps_exact_deck_order_private(self):
        s = self.make()
        pid = s['president_id']
        s.update(phase='executive', power='policy_peek')
        before = list(s['deck'])
        self.act(s, pid, 'power')
        self.assertEqual(s['deck'], before)
        self.assertEqual(engine.snapshot(s, pid, 'SECRET')['private_info'][-1]['policies'], before[:3])
        self.assertTrue(s['power_used'])
        self.act(s, pid, 'acknowledge')
        self.assertEqual(s['phase'], 'nomination')

    def test_special_election_restores_normal_rotation_even_same_next_player(self):
        s = self.make(7)
        president, target = s['players'][0]['id'], s['players'][1]['id']
        s.update(phase='executive', power='special_election', president_id=president)
        self.act(s, president, 'power', target_id=target)
        self.assertEqual(s['president_id'], target)
        self.elect(s, yes=False)
        self.assertEqual(s['president_id'], target)
        self.elect(s, yes=False)
        self.assertEqual(s['president_id'], s['players'][2]['id'])

    def test_execution_hides_regular_role_and_excludes_dead(self):
        s = self.make()
        self.force_roles(s)
        president, target = s['players'][0]['id'], s['players'][1]['id']
        s.update(phase='executive', power='execution', president_id=president)
        self.act(s, president, 'power', target_id=target)
        self.assertFalse(engine.get_player(s, target)['alive'])
        self.assertNotIn(target, engine.eligible_chancellors(s))
        self.assertNotIn('role', engine.snapshot(s, president, 'SECRET')['players'][1])
        with self.assertRaises(engine.RuleError):
            self.act(s, target, 'vote', vote=True)

    def test_hitler_execution_wins_and_reveals_all_roles(self):
        s = self.make()
        self.force_roles(s)
        president, target = s['players'][0]['id'], s['players'][-1]['id']
        s.update(phase='executive', power='execution', president_id=president)
        self.act(s, president, 'power', target_id=target)
        self.assertEqual(s['winner'], 'liberal')
        self.assertEqual(len(engine.snapshot(s, president, 'SECRET')['known_roles']), 5)

    def test_veto_preserves_failed_election_tracker_and_causes_chaos(self):
        s = self.make()
        self.force_roles(s)
        s['president_id'] = s['players'][0]['id']
        s['fascist_policies'] = 5
        s['election_tracker'] = 2
        self.elect(s, s['players'][1]['id'])
        self.assertEqual(s['election_tracker'], 2)
        president, chancellor = s['president_id'], s['chancellor_id']
        self.act(s, president, 'discard', index=0)
        self.act(s, chancellor, 'request_veto')
        s['hand'] = ['liberal', 'liberal']
        s['deck'] = []  # last three draw tiles, all discarded under veto
        s['discard'] = ['liberal'] * 4
        self.act(s, president, 'respond_veto', accept=True)
        self.assertEqual(s['election_tracker'], 0)
        self.assertEqual(s['liberal_policies'], 1)
        self.assertIsNone(s['last_chancellor_id'])

    def test_veto_denial_forces_policy_and_cannot_repeat(self):
        s = self.make()
        self.force_roles(s)
        s.update(president_id=s['players'][0]['id'], fascist_policies=5)
        self.elect(s, s['players'][1]['id'])
        president, chancellor = s['president_id'], s['chancellor_id']
        self.act(s, president, 'discard', index=0)
        self.act(s, chancellor, 'request_veto')
        self.act(s, president, 'respond_veto', accept=False)
        self.assertEqual(s['phase'], 'chancellor_discard')
        with self.assertRaises(engine.RuleError):
            self.act(s, chancellor, 'request_veto')
        self.act(s, chancellor, 'discard', index=0)

    def test_policy_track_victories(self):
        for team, count in [('liberal', 4), ('fascist', 5)]:
            s = self.make()
            s[f'{team}_policies'] = count
            engine.enact(s, team)
            self.assertEqual(s['winner'], team)

    def test_replay_is_idempotent_rejected_action_atomic_and_types_strict(self):
        s = self.make()
        pid = s['president_id']
        data = dict(action='nominate', action_id='same', target_id=engine.eligible_chancellors(s)[0])
        self.assertTrue(engine.apply(s, pid, data))
        before = copy.deepcopy(s)
        self.assertFalse(engine.apply(s, pid, data))
        self.assertEqual(s, before)
        with self.assertRaises(engine.RuleError):
            self.act(s, pid, 'vote', vote=1)
        self.assertEqual(s, before)

    def test_rematch_keeps_credentials_resets_secrets_and_requires_readiness(self):
        s = self.make()
        tokens = [p['token'] for p in s['players']]
        engine.win(s, 'liberal', 'test')
        self.act(s, s['host_id'], 'rematch')
        self.assertEqual(s['phase'], 'lobby')
        self.assertEqual(tokens, [p['token'] for p in s['players']])
        self.assertTrue(all(p['role'] is None and not p['ready'] for p in s['players']))
        self.assertEqual(s['deck'], [])


class ServiceTests(TestCase):
    def test_api_room_token_is_required_and_isolated(self):
        a = services.create_room('Alice')
        b = services.create_room('Bob')
        self.assertEqual(services.read(a['code'], a['token'])['players'][0]['name'], 'Alice')
        for token in ('', 'wrong', 'không', 'a' * 10000, b['token']):
            with self.assertRaises(engine.RuleError):
                services.read(a['code'], token)
        self.assertEqual(SecretRoom.objects.count(), 2)

    def test_lobby_leave_reassigns_host_revokes_credentials(self):
        a = services.create_room('Alice')
        b = services.join_room(a['code'], 'Bob')
        services.mutate(a['code'], a['token'], dict(action='leave', action_id='leave'))
        state = services.read(a['code'], b['token'])
        self.assertEqual(state['host_id'], b['player_id'])
        self.assertEqual(state['players'][0]['seat'], 0)
        with self.assertRaises(engine.RuleError):
            services.read(a['code'], a['token'])

    @patch('secret_hitler.views.broadcast')
    def test_http_uses_namespaced_paths_and_no_store(self, broadcast):
        response = self.client.post('/api/secret-hitler/rooms/', data=json.dumps({'name': 'Alice'}), content_type='application/json')
        self.assertEqual(response.status_code, 201)
        session = response.json()
        read = self.client.get(f"/api/secret-hitler/rooms/{session['code']}/", {'token': session['token']})
        self.assertEqual(read.status_code, 200)
        self.assertEqual(read['Cache-Control'], 'no-store')
        self.assertEqual(read.json()['phase'], 'lobby')
        action = self.client.post(f"/api/secret-hitler/rooms/{session['code']}/action/", data=json.dumps(dict(token=session['token'], action='ready', ready=True, action_id='ready')), content_type='application/json')
        self.assertEqual(action.status_code, 200)
        self.assertTrue(action.json()['state']['players'][0]['ready'])
        broadcast.assert_called_once_with(session['code'])
