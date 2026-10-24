"""Authoritative events for seats and the execution interaction; no server needed."""
import copy
import secrets

from django.test import SimpleTestCase

from . import engine


class ImmersivePresentationTests(SimpleTestCase):
    def state(self):
        state = engine.new_state('Host')
        for i in range(1, 7):
            person = engine.player(f'Player {i}', i)
            person['ready'] = True
            state['players'].append(person)
        self.action(state, state['host_id'], 'start')
        # Keep elections and executions deterministic without influencing shuffles.
        for person in state['players']:
            person['role'] = 'liberal'
        state['players'][-1]['role'] = 'hitler'
        state['players'][-2]['role'] = 'fascist'
        state['president_id'] = state['players'][0]['id']
        return state

    def action(self, state, actor, action, **fields):
        return engine.apply(state, actor, dict(action=action, action_id=secrets.token_hex(8), **fields))

    def vote(self, state, yes):
        for person in list(engine.living(state)):
            self.action(state, person['id'], 'vote', vote=yes)

    def elect(self, state):
        president = state['president_id']
        nominee = next(pid for pid in engine.eligible_chancellors(state)
                       if engine.get_player(state, pid)['role'] != 'hitler')
        self.action(state, president, 'nominate', target_id=nominee)
        self.vote(state, True)
        return president, nominee

    def execution_state(self):
        state = self.state()
        president, chancellor = self.elect(state)
        state.update(phase='executive', power='execution', hand=[], power_used=False)
        target = next(person for person in state['players']
                      if person['id'] != president and person['role'] == 'liberal')
        return state, president, chancellor, target

    def test_candidates_and_failed_votes_do_not_move_office_chairs(self):
        state = self.state()
        self.assertIsNone(state['seated_president_id'])
        self.assertIsNone(state['seated_chancellor_id'])
        candidate = engine.eligible_chancellors(state)[0]
        self.action(state, state['president_id'], 'nominate', target_id=candidate)
        self.assertIsNone(state['seated_president_id'])
        self.assertIsNone(state['seated_chancellor_id'])
        self.vote(state, False)
        self.assertIsNone(state['seated_president_id'])
        self.assertIsNone(state['seated_chancellor_id'])

    def test_only_successful_government_moves_chairs_and_stays_between_elections(self):
        state = self.state()
        president, chancellor = self.elect(state)
        self.assertEqual(state['phase'], 'president_discard')
        for person in state['players']:
            snapshot = engine.snapshot(state, person['id'], 'ROOMAA')
            self.assertEqual(snapshot['seated_president_id'], president)
            self.assertEqual(snapshot['seated_chancellor_id'], chancellor)
        engine.next_round(state)
        self.assertEqual(state['seated_president_id'], president)
        self.assertEqual(state['seated_chancellor_id'], chancellor)
        nominee = engine.eligible_chancellors(state)[0]
        self.action(state, state['president_id'], 'nominate', target_id=nominee)
        self.vote(state, False)
        self.assertEqual(state['seated_president_id'], president)
        self.assertEqual(state['seated_chancellor_id'], chancellor)

    def test_hitler_election_keeps_elected_office_positions(self):
        state = self.state()
        hitler = state['players'][-1]['id']
        state['president_id'] = state['players'][0]['id']
        state['fascist_policies'] = 3
        self.action(state, state['president_id'], 'nominate', target_id=hitler)
        self.vote(state, True)
        self.assertEqual(state['winner'], 'fascist')
        self.assertEqual(state['seated_president_id'], state['players'][0]['id'])
        self.assertEqual(state['seated_chancellor_id'], hitler)

    def test_illegal_shots_leave_state_and_event_unchanged(self):
        state, president, _, target = self.execution_state()
        before = copy.deepcopy(state)
        for actor, target_id in ((target['id'], president), (president, president), (president, 'missing')):
            with self.assertRaises(engine.RuleError):
                self.action(state, actor, 'power', target_id=target_id)
            self.assertEqual(state, before)
        state['phase'] = 'nomination'
        before = copy.deepcopy(state)
        with self.assertRaises(engine.RuleError):
            self.action(state, president, 'power', target_id=target['id'])
        self.assertEqual(state, before)

    def test_legal_shot_is_public_without_role_leak_and_cannot_repeat(self):
        state, president, chancellor, target = self.execution_state()
        action = dict(action='power', action_id='one-legal-shot', target_id=target['id'])
        self.assertTrue(engine.apply(state, president, action))
        self.assertFalse(engine.get_player(state, target['id'])['alive'])
        event = copy.deepcopy(state['execution_event'])
        self.assertEqual(set(event), {'id', 'actor_id', 'target_id'})
        self.assertTrue(event['id'])
        self.assertEqual(event['actor_id'], president)
        self.assertEqual(event['target_id'], target['id'])
        self.assertEqual(state['seated_president_id'], president)
        self.assertEqual(state['seated_chancellor_id'], chancellor)
        for person in state['players']:
            snapshot = engine.snapshot(state, person['id'], 'ROOMAA')
            self.assertEqual(snapshot['execution_event'], event)
            self.assertTrue(all('role' not in player for player in snapshot['players']))
        before = copy.deepcopy(state)
        self.assertFalse(engine.apply(state, president, action))
        self.assertEqual(state, before)
        with self.assertRaises(engine.RuleError):
            self.action(state, president, 'power', target_id=engine.living(state)[0]['id'])
        self.assertEqual(state, before)
        reconnect = engine.snapshot(state, target['id'], 'ROOMAA')
        self.assertEqual(reconnect['execution_event'], event)
        reconnect['execution_event']['target_id'] = 'tampered-client-copy'
        self.assertEqual(state['execution_event'], event)

    def test_hitler_shot_event_survives_finished_state_and_rematch_clears(self):
        state, president, _, _ = self.execution_state()
        hitler = state['players'][-1]['id']
        self.action(state, president, 'power', target_id=hitler)
        self.assertEqual(state['winner'], 'liberal')
        self.assertEqual(state['execution_event']['target_id'], hitler)
        self.action(state, state['host_id'], 'rematch')
        self.assertIsNone(state['execution_event'])
        self.assertIsNone(state['seated_president_id'])
        self.assertIsNone(state['seated_chancellor_id'])

    def test_older_room_snapshot_uses_safe_defaults(self):
        state = self.state()
        for key in ('seated_president_id', 'seated_chancellor_id', 'execution_event'):
            del state[key]
        snapshot = engine.snapshot(state, state['host_id'], 'ROOMAA')
        self.assertIsNone(snapshot['execution_event'])
        self.assertIsNone(snapshot['seated_president_id'])
        self.assertIsNone(snapshot['seated_chancellor_id'])
        state['last_president_id'], state['last_chancellor_id'] = state['players'][0]['id'], state['players'][1]['id']
        snapshot = engine.snapshot(state, state['host_id'], 'ROOMAA')
        self.assertEqual(snapshot['seated_president_id'], state['players'][0]['id'])
        self.assertEqual(snapshot['seated_chancellor_id'], state['players'][1]['id'])

    def test_dead_office_chair_persists_through_elections_reconnect_and_rematch(self):
        state, president, chancellor, _ = self.execution_state()
        self.action(state, president, 'power', target_id=chancellor)
        corpse = engine.get_player(state, chancellor)
        self.assertFalse(corpse['alive'])
        self.assertEqual(corpse['eliminated_office'], 'chancellor')
        self.assertEqual(corpse['eliminated_office_slot'], 0)
        self.elect(state)
        public_corpse = next(person for person in engine.snapshot(state, chancellor, 'ROOMAA')['players']
                             if person['id'] == chancellor)
        self.assertEqual(public_corpse['eliminated_office'], 'chancellor')
        self.assertEqual(public_corpse['eliminated_office_slot'], 0)
        self.assertNotIn('role', public_corpse)
        # A second execution at that office receives a distinct stable chair slot.
        second_chancellor = state['seated_chancellor_id']
        state.update(phase='executive', power='execution', power_used=False, hand=[])
        self.action(state, state['president_id'], 'power', target_id=second_chancellor)
        second_corpse = engine.get_player(state, second_chancellor)
        self.assertEqual(second_corpse['eliminated_office'], 'chancellor')
        self.assertEqual(second_corpse['eliminated_office_slot'], 1)
        engine.win(state, 'liberal', 'test')
        self.action(state, state['host_id'], 'rematch')
        self.assertTrue(all(person['eliminated_office'] is None and person['eliminated_office_slot'] is None
                            for person in state['players']))
