"""Timed presentation pauses keep rules and deadlines on the server."""
import copy
import time
from unittest.mock import patch
from django.test import SimpleTestCase, TestCase
from . import engine, services
from .models import SecretRoom


class DiscussionTests(SimpleTestCase):
    def state(self):
        state = engine.new_state('Host')
        for i in range(1, 5):
            state['players'].append(engine.player(f'Guest {i}', i))
        state.update(phase='chancellor_discard', president_id=state['players'][0]['id'],
                     chancellor_id=state['players'][1]['id'], round=1)
        for person in state['players']:
            person['role'] = 'liberal'
        return state

    def test_policy_starts_thirty_second_discussion_then_rotates_exactly_once(self):
        state = self.state()
        old_president = state['president_id']
        with patch('secret_hitler.engine.time.time', return_value=100):
            engine.enact(state, 'liberal')
        self.assertEqual(state['phase'], 'discussion')
        self.assertEqual(state['discussion_ends_at'], 130)
        self.assertEqual(state['president_id'], old_president)
        before = copy.deepcopy(state)
        self.assertFalse(engine.advance_due(state, 129.99))
        self.assertEqual(state, before)
        self.assertTrue(engine.advance_due(state, 130))
        self.assertEqual(state['phase'], 'nomination')
        self.assertEqual(state['president_id'], state['players'][1]['id'])
        self.assertEqual(state['round'], 2)
        self.assertFalse(engine.advance_due(state, 160))
        self.assertEqual(state['round'], 2)

    def test_power_waits_for_discussion_and_remains_assigned_to_same_president(self):
        state = self.state()
        state['fascist_policies'] = 2
        president = state['president_id']
        engine.enact(state, 'fascist')
        self.assertEqual(state['phase'], 'discussion')
        self.assertEqual(state['power'], 'policy_peek')
        engine.advance_due(state, state['discussion_ends_at'])
        self.assertEqual(state['phase'], 'executive')
        self.assertEqual(state['president_id'], president)
        self.assertEqual(state['power'], 'policy_peek')
        self.assertEqual(state['round'], 1)

    def test_players_cannot_skip_discussion_or_act_on_power_early(self):
        state = self.state()
        state['fascist_policies'] = 2
        engine.enact(state, 'fascist')
        before = copy.deepcopy(state)
        for action in ('nominate', 'discard', 'acknowledge', 'power', 'continue', 'start'):
            with self.assertRaises(engine.RuleError):
                engine.apply(state, state['president_id'], dict(action=action, action_id=action, index=0,
                             target_id=state['players'][1]['id']))
            self.assertEqual(state, before)
        public = engine.snapshot(state, state['host_id'], 'ROOMAA')
        self.assertNotIn('discussion_next', public)
        self.assertEqual(public['hand'], [])
        self.assertEqual(public['eligible_targets'], [])

    def test_wins_are_immediate_chaos_without_elected_government_does_not_pause(self):
        state = self.state()
        state['liberal_policies'] = 4
        engine.enact(state, 'liberal')
        self.assertEqual(state['phase'], 'finished')
        self.assertIsNone(state['discussion_ends_at'])
        state = self.state()
        engine.enact(state, 'fascist', chaos=True)
        self.assertEqual(state['phase'], 'nomination')
        self.assertIsNone(state['power'])

    def test_veto_discussion_preserves_tracker_and_chaos_rules(self):
        for tracker in (0, 2):
            state = self.state()
            state.update(election_tracker=tracker, deck=['liberal'] * 4)
            engine.inactive_government(state, discussion=True)
            self.assertEqual(state['phase'], 'discussion')
            self.assertEqual(state['election_tracker'], 1 if tracker == 0 else 0)
            self.assertEqual(state['liberal_policies'], 0 if tracker == 0 else 1)
            engine.advance_due(state, state['discussion_ends_at'])
            self.assertEqual(state['phase'], 'nomination')
            self.assertIsNone(state['power'])


class DiscussionRecoveryTests(TestCase):
    def test_read_recovers_expired_persisted_discussion_without_connected_clients(self):
        session = services.create_room('Host')
        room = SecretRoom.objects.get(code=session['code'])
        state = room.state
        state['players'].append(engine.player('Guest', 1))
        state.update(president_id=session['player_id'], round=1)
        engine.begin_discussion(state)
        state['discussion_ends_at'] = time.time() - 1
        room.save()
        snapshot = services.read(session['code'], session['token'])
        self.assertEqual(snapshot['phase'], 'nomination')
        self.assertEqual(snapshot['president_id'], state['players'][1]['id'])
        self.assertIsNone(snapshot['discussion_ends_at'])
        self.assertFalse(services.advance(session['code']))
        self.assertEqual(services.read(session['code'], session['token'])['round'], 2)
