"""Outcome checks transcribed from the supplied printed cards, not UI fixtures."""
import time
from unittest.mock import patch
from django.test import SimpleTestCase
from . import engine as e


class PrintedCardTests(SimpleTestCase):
    def setUp(self):
        self.s = e.new_state('A', {})
        for i in range(1, 8):
            p = e.player(f'P{i}', i)
            p['ready'] = True
            self.s['players'].append(p)
        self.act(self.s['host_id'], 'start')
        self.king = self.s['king_id']
        self.nobles = [p['id'] for p in self.s['players'] if p['id'] != self.king]
        self.s['round'] = 3

    def act(self, pid, action, **kw):
        e.apply(self.s, pid, dict(action=action, action_id=str(time.time_ns()), **kw))

    def p(self, pid):
        return e.get_player(self.s, pid)

    def play(self, pid, kind, **kw):
        p = self.p(pid)
        card = next((c for c in p['hand'] if c['type'] == kind), None)
        if card is None:
            zones = [q['hand'] for q in self.s['players']] + list(self.s['decks'].values()) + list(self.s['discards'].values())
            for zone in zones:
                card = next((c for c in zone if c['type'] == kind), None)
                if card:
                    zone.remove(card)
                    p['hand'].append(card)
                    break
        self.assertIsNotNone(card, kind)
        self.s.update(phase='playing', current_player_id=pid, turn_seat=p['seat'], actions_left=3, pending=None, deadline=None)
        self.act(pid, 'play', card_id=card['id'], **kw)

    def answer_all(self, choice='yes'):
        for _ in range(20):
            q = self.s.get('pending')
            if not q:
                return
            choices = [c['id'] for c in q['choices']]
            answer = choice if choice in choices else choices[-1]
            waiting = [pid for pid in q['eligible_ids'] if pid not in q['votes']]
            if not waiting:
                self.fail('Pending decision has no eligible unanswered player')
            self.act(waiting[0], 'respond', choice_id=answer)
        self.fail('Pending responses did not terminate')

    def test_mad_king_one_costs_king_500_and_nobles_300(self):
        with patch('game.effects.random.randint', return_value=1):
            self.play(self.king, 'k_mad_king')
        self.assertEqual(self.p(self.king)['gold'], 500)
        self.assertTrue(all(self.p(pid)['gold'] == 300 for pid in self.nobles))

    def test_original_bomb_costs_all_nobles_800_including_actor(self):
        self.s['settings']['bomb_mode'] = 'original'
        self.play(self.nobles[0], 'n_royal_bomb')
        self.assertEqual(self.p(self.king)['gold'], 1000)
        self.assertTrue(all(self.p(pid)['gold'] == 0 for pid in self.nobles))

    def test_beggars_blessing_threshold_and_subsidy_brackets(self):
        self.p(self.nobles[1])['gold'] = 300
        self.p(self.nobles[2])['gold'] = 400
        self.play(self.nobles[0], 'n_beggars_blessing')
        self.assertEqual(self.p(self.nobles[1])['gold'], 500)
        self.assertEqual(self.p(self.nobles[2])['gold'], 400)
        self.assertEqual(self.p(self.king)['gold'], 1000)
        for pid, amount in zip(self.nobles, [0, 100, 300, 400, 500, 600, 700]):
            self.p(pid)['gold'] = amount
        self.play(self.nobles[0], 'n_subsidies')
        self.assertEqual([self.p(pid)['gold'] for pid in self.nobles], [300, 300, 500, 500, 600, 600, 700])

    def test_helping_hand_matches_printed_three_more_example(self):
        self.play(self.nobles[0], 'n_helping_hand')
        # Fixture starts with three actions: playing the card and adding two leaves four.
        self.assertEqual(self.s['actions_left'], 4)

    def test_wrath_option_is_not_both_effects(self):
        actor, victim = self.nobles[:2]
        self.play(actor, 'n_wrath', option_id='sacrifice', target_id=victim)
        self.assertEqual((self.p(actor)['gold'], self.p(victim)['gold']), (500, 300))

    def test_betrayal_requires_support_and_transfers_entire_wallet(self):
        actor, victim = self.nobles[:2]
        self.play(actor, 'n_betrayal', target_id=victim)
        self.assertEqual(self.p(victim)['gold'], 600)
        self.answer_all('yes')
        self.assertEqual(self.p(victim)['gold'], 0)
        self.assertEqual(self.p(actor)['gold'], 1200)
        self.assertEqual(self.s['king_id'], actor)

    def test_betrayal_without_support_does_not_take_gold(self):
        actor, victim = self.nobles[:2]
        self.play(actor, 'n_betrayal', target_id=victim)
        self.answer_all('no')
        self.assertEqual((self.p(actor)['gold'], self.p(victim)['gold']), (600, 600))

    def test_sub_rosa_hand_is_private_to_inspector(self):
        actor, victim, bystander = self.nobles[:3]
        with patch('game.effects.random.randint', return_value=4):
            self.play(actor, 'n_sub_rosa', option_id='hand', target_id=victim)
        private = e.snapshot(self.s, actor, 'ROOM')
        public = e.snapshot(self.s, bystander, 'ROOM')
        ids = [c['id'] for c in self.p(victim)['hand']]
        self.assertTrue(any(cid in str(private['pending']) for cid in ids))
        self.assertTrue(all(cid not in str(public) for cid in ids))

    def test_invalid_early_restricted_card_rolls_back(self):
        self.s['round'] = 1
        before = self.p(self.nobles[0])['gold']
        with self.assertRaises(e.RuleError):
            self.play(self.nobles[0], 'n_betrayal', target_id=self.nobles[1])
        self.assertEqual(self.p(self.nobles[0])['gold'], before)

    def test_champion_wins_throne_without_swapping_wallets(self):
        actor, nominee = self.nobles[:2]
        self.s['round'] = 4
        wallets = {p['id']: p['gold'] for p in self.s['players']}
        self.play(actor, 'n_peoples_champion', target_id=nominee)
        with patch('game.effects.random.randint', side_effect=[6, 1]):
            self.answer_all('yes')
        self.assertEqual(self.s['king_id'], nominee)
        self.assertEqual({p['id']: p['gold'] for p in self.s['players']}, wallets)
        e.crown(self.s)
        self.assertEqual(self.s['king_id'], nominee)
        e.gain(self.s, self.p(self.nobles[2]), 1)
        e.crown(self.s)
        self.assertEqual(self.s['king_id'], self.king)

    def test_king_maker_changes_roll_and_penalizes_wrong_side(self):
        for side, die, expected_king, expected_gold in (
            ('support', 3, 'incumbent', 600),
            ('oppose', 3, 'challenger', 600),
            ('support', 2, 'challenger', 300),
            ('oppose', 5, 'incumbent', 300),
        ):
            with self.subTest(side=side):
                self.setUp()
                actor, helper = self.nobles[:2]
                owner = self.p(helper)
                zones = [p['hand'] for p in self.s['players']] + list(self.s['decks'].values())
                card = next(c for zone in zones for c in zone if c['type'] == 'n_king_maker')
                next(zone for zone in zones if card in zone).remove(card)
                owner['hand'].append(card)
                self.play(actor, 'n_betray_the_king')
                while self.s['pending']['kind'] == 'support':
                    q = self.s['pending']
                    pid = next(pid for pid in q['eligible_ids'] if pid not in q['votes'])
                    self.act(pid, 'respond', choice_id='yes')
                self.act(helper, 'kingmaker', card_id=card['id'], side=side)
                with patch('game.effects.random.randint', return_value=die):
                    self.answer_all('pass')
                self.assertEqual(self.s['king_id'], self.king if expected_king == 'incumbent' else actor)
                self.assertEqual(self.p(helper)['gold'], expected_gold)
                self.assertNotIn(card['id'], [c['id'] for c in self.p(helper)['hand']])

    def test_eight_players_finish_four_rounds_in_both_negotiation_modes(self):
        for final_negotiation in (False, True):
            with self.subTest(final_negotiation=final_negotiation):
                self.setUp()
                self.s['settings']['final_negotiation'] = final_negotiation
                self.s['round'] = 1
                for _ in range(50):
                    if self.s['phase'] == 'finished':
                        break
                    if self.s['phase'] == 'playing':
                        self.act(self.s['current_player_id'], 'end_turn')
                    else:
                        self.s['deadline'] = time.time() - 1
                        e.advance_expired(self.s)
                self.assertEqual(self.s['phase'], 'finished')
                self.assertEqual(self.s['round'], 4)
                self.assertEqual(len(self.s['players']), 8)
                self.assertEqual(self.s['winner_id'], self.s['king_id'])

    def test_every_playable_catalog_option_can_finish_its_decision_window(self):
        from .catalog import CARDS
        for key, spec in CARDS.items():
            if key == 'n_king_maker':
                continue  # Reaction-only card has a separate response-window test.
            for option in spec['options']:
                with self.subTest(card=key, option=option['id']):
                    self.setUp()
                    actor = self.king if spec['role'] == 'king' else self.nobles[0]
                    if key == 'n_divine_right':
                        self.p(actor)['gold'] = 300
                    if key == 'n_peoples_champion':
                        self.s['round'] = 4
                    other = [pid for pid in self.nobles if pid != actor]
                    kw = dict(option_id=option['id'])
                    mode = option['target']
                    if mode != 'none':
                        kw['target_id'] = self.king if mode == 'king' else other[0]
                    if mode in ('two_nobles', 'two_players'):
                        kw['second_target_id'] = other[1]
                    if option.get('amounts'):
                        kw['amount'] = option['amounts'][0]
                    if key == 'n_sub_rosa' and option['id'] == 'knight':
                        victim = self.p(kw['target_id'])
                        card = next(c for c in victim['hand'] if c['type'] != 'n_royal_bomb')
                        victim['hand'].remove(card)
                        victim['attachments']['knights'] = [card | {'owner_id': victim['id']}]
                        e.refill(self.s, victim)
                    self.play(actor, key, **kw)
                    for _ in range(12):
                        if not self.s['pending']:
                            break
                        self.s['deadline'] = time.time() - 1
                        e.advance_expired(self.s)
                    self.assertIsNone(self.s['pending'], key)
                    self.assertTrue(all(0 <= p['gold'] <= 2000 for p in self.s['players']))
                    for p in self.s['players']:
                        expected = e.role(self.s, p)
                        self.assertTrue(all(CARDS[c['type']]['role'] == expected for c in p['hand']))
