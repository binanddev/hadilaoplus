"""Public presentation events must not reveal a secret vote, hand or inquiry."""
import copy
import secrets

from django.test import SimpleTestCase, TestCase

from . import engine, services


class PublicEventTests(SimpleTestCase):
    def action(self, state, actor, kind, **fields):
        data = dict(action=kind, action_id=secrets.token_hex(8), **fields)
        engine.apply(state, actor, data)
        return data

    def state(self):
        state = engine.new_state('Host')
        for seat in range(1, 5):
            person = engine.player(f'Guest {seat}', seat)
            person['ready'] = True
            state['players'].append(person)
        self.action(state, state['host_id'], 'start')
        state['president_id'] = state['players'][0]['id']
        return state

    def nominate(self, state):
        self.action(state, state['president_id'], 'nominate', target_id=engine.eligible_chancellors(state)[0])

    def elect(self, state):
        self.nominate(state)
        for person in list(engine.living(state)):
            self.action(state, person['id'], 'vote', vote=True)

    def assert_public_event(self, state, expected_keys):
        event = state['presentation_event']
        self.assertEqual(set(event), set(expected_keys) | {'id', 'kind', 'actor_id'})
        for person in state['players']:
            snapshot = engine.snapshot(state, person['id'], 'PUBLIC')
            self.assertEqual(snapshot['presentation_event'], event)
            snapshot['presentation_event']['kind'] = 'client-tampering'
            self.assertNotEqual(state['presentation_event']['kind'], 'client-tampering')

    def test_ballot_color_reveals_only_when_every_living_player_voted(self):
        state = self.state()
        self.nominate(state)
        expected = {}
        for i, person in enumerate(state['players']):
            expected[person['id']] = i % 2 == 0
            self.action(state, person['id'], 'vote', vote=expected[person['id']])
            self.assert_public_event(state, [])
            if i < len(state['players']) - 1:
                for observer in state['players']:
                    snapshot = engine.snapshot(state, observer['id'], 'PUBLIC')
                    self.assertIsNone(snapshot['ballot_event'])
                    self.assertEqual(snapshot['votes'], {})
            else:
                event = state['ballot_event']
                self.assertEqual(set(event), {'id', 'votes'})
                self.assertEqual(event['votes'], expected)
                for observer in state['players']:
                    self.assertEqual(engine.snapshot(state, observer['id'], 'PUBLIC')['ballot_event'], event)

    def test_failed_election_reveal_persists_but_new_pending_vote_stays_hidden(self):
        state = self.state()
        self.nominate(state)
        for person in state['players']:
            self.action(state, person['id'], 'vote', vote=False)
        event = copy.deepcopy(state['ballot_event'])
        self.assertEqual(state['phase'], 'nomination')
        self.nominate(state)
        first = state['players'][0]['id']
        self.action(state, first, 'vote', vote=True)
        self.assertEqual(state['ballot_event'], event)
        self.assertFalse(state['ballot_event']['votes'][first])
        self.assertEqual(engine.snapshot(state, first, 'PUBLIC')['votes'], {})

    def test_discard_narration_excludes_selected_index_and_secret_policies(self):
        state = self.state()
        self.elect(state)
        president, chancellor = state['president_id'], state['chancellor_id']
        state['hand'] = ['liberal', 'fascist', 'liberal']
        self.action(state, president, 'discard', index=2,
                    role='hitler', policy='liberal', hand=['liberal'])
        self.assert_public_event(state, [])
        self.assertEqual(state['presentation_event']['kind'], 'discard')
        self.assertNotIn('policy', state['presentation_event'])
        self.action(state, chancellor, 'discard', index=0)
        self.assert_public_event(state, ['policy'])
        self.assertEqual(state['presentation_event']['policy'], 'fascist')

    def test_private_power_narrates_public_action_but_never_result(self):
        state = self.state()
        self.elect(state)
        president = state['president_id']
        state.update(phase='executive', power='policy_peek', power_used=False)
        self.action(state, president, 'power', target_id='ignored', party='fascist')
        self.assert_public_event(state, ['power'])
        self.assertEqual(state['presentation_event']['power'], 'policy_peek')
        self.action(state, president, 'acknowledge')
        state.update(phase='executive', power='investigate', power_used=False, president_id=president)
        target = next(person['id'] for person in state['players'] if person['id'] != president)
        self.action(state, president, 'power', target_id=target)
        self.assert_public_event(state, ['power', 'target_id'])
        self.assertEqual(state['presentation_event']['target_id'], target)
        self.assertNotIn('party', state['presentation_event'])

    def test_replayed_or_rejected_action_cannot_create_new_events(self):
        state = self.state()
        self.nominate(state)
        first = state['players'][0]['id']
        data = self.action(state, first, 'vote', vote=True)
        before = copy.deepcopy(state)
        self.assertFalse(engine.apply(state, first, data))
        self.assertEqual(state, before)
        with self.assertRaises(engine.RuleError):
            self.action(state, first, 'vote', vote=False)
        self.assertEqual(state, before)

    def test_rematch_clears_old_ballots_and_only_narrates_safe_summary(self):
        state = self.state()
        self.elect(state)
        old = state['ballot_event']['id']
        engine.win(state, 'liberal', 'test')
        self.action(state, state['host_id'], 'rematch')
        self.assertIsNone(state['ballot_event'])
        self.assert_public_event(state, [])
        self.assertEqual(state['presentation_event']['kind'], 'rematch')
        self.assertNotEqual(state['presentation_event']['id'], old)

    def test_older_room_snapshot_defaults_events_without_mutating_state(self):
        state = self.state()
        del state['ballot_event']
        del state['presentation_event']
        before = copy.deepcopy(state)
        snapshot = engine.snapshot(state, state['host_id'], 'PUBLIC')
        self.assertIsNone(snapshot['ballot_event'])
        self.assertIsNone(snapshot['presentation_event'])
        self.assertEqual(state, before)


class JoinedRoomPresentationTests(TestCase):
    def test_join_event_names_only_public_joining_player(self):
        host = services.create_room('Host')
        guest = services.join_room(host['code'], 'Guest')
        event = services.read(host['code'], host['token'])['presentation_event']
        self.assertEqual(set(event), {'id', 'kind', 'actor_id'})
        self.assertEqual(event['kind'], 'join')
        self.assertEqual(event['actor_id'], guest['player_id'])
