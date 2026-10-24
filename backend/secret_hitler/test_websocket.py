"""Exercise the real ASGI routes and channel layer entirely in process.

No HTTP/WebSocket listener, browser, or development server is started.
"""
from urllib.parse import quote

from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from django.test import TransactionTestCase

from . import services
from .models import SecretRoom


class SecretHitlerWebsocketTests(TransactionTestCase):
    def socket_client(self, code, token, legacy=False):
        from crown.asgi import application
        namespace = '' if legacy else 'secret-hitler/'
        return WebsocketCommunicator(
            application,
            f'/ws/{namespace}rooms/{code}/?token={quote(token)}',
            headers=[(b'origin', b'http://localhost:5173')],
        )

    async def room(self, count=5):
        host = await database_sync_to_async(services.create_room)('Host')
        sessions = [host]
        for i in range(1, count):
            sessions.append(await database_sync_to_async(services.join_room)(host['code'], f'Guest {i}'))
        return sessions

    async def receive_states(self, clients):
        states = []
        for client in clients:
            message = await client.receive_json_from(timeout=3)
            self.assertEqual(message['type'], 'state')
            states.append(message['state'])
        # Every subscriber receives the same committed room version.
        self.assertEqual(len({s['version'] for s in states}), 1)
        return states

    async def action(self, clients, actor_index, action, action_id, **fields):
        await clients[actor_index].send_json_to(dict(type='action', action=action, action_id=action_id, **fields))
        return await self.receive_states(clients)

    async def test_five_players_ready_start_private_roles_hands_votes_and_reconnect(self):
        sessions = await self.room()
        clients = [self.socket_client(s['code'], s['token']) for s in sessions]
        disconnected = set()
        try:
            for client in clients:
                self.assertTrue((await client.connect())[0])
                initial = (await client.receive_json_from())['state']
                self.assertEqual(initial['phase'], 'lobby')
                self.assertEqual(len(initial['players']), 5)
                self.assertIsNone(initial['role'])

            for i in range(1, 5):
                states = await self.action(clients, i, 'ready', f'ready-{i}', ready=True)
                for state in states:
                    self.assertTrue(state['players'][i]['ready'])
                    self.assertEqual(sum(p['ready'] for p in state['players']), i)

            states = await self.action(clients, 0, 'start', 'start')
            self.assertEqual({s['phase'] for s in states}, {'nomination'})
            self.assertEqual(sorted(s['role'] for s in states), ['fascist', 'hitler', 'liberal', 'liberal', 'liberal'])
            persisted = await database_sync_to_async(lambda: SecretRoom.objects.get(code=sessions[0]['code']).state)()
            by_id = {p['id']: p for p in persisted['players']}
            for session, state in zip(sessions, states):
                me = by_id[session['player_id']]
                self.assertEqual(state['role'], me['role'])
                self.assertEqual(state['party'], 'liberal' if me['role'] == 'liberal' else 'fascist')
                expected = [] if me['role'] == 'liberal' else [
                    dict(id=p['id'], role=p['role']) for p in persisted['players']
                    if p['id'] != me['id'] and p['role'] != 'liberal'
                ]
                self.assertEqual(state['known_roles'], expected)
                for person in state['players']:
                    self.assertNotIn('role', person)
                    self.assertNotIn('token', person)
                for key in ('deck', 'discard', 'seen_actions'):
                    self.assertNotIn(key, state)

            president_id = states[0]['president_id']
            president_index = next(i for i, s in enumerate(sessions) if s['player_id'] == president_id)
            nominee_id = states[0]['eligible_chancellors'][0]
            states = await self.action(clients, president_index, 'nominate', 'nominate', target_id=nominee_id)
            for i in range(5):
                states = await self.action(clients, i, 'vote', f'vote-{i}', vote=True)
                if i < 4:
                    for state in states:
                        self.assertEqual(state['phase'], 'voting')
                        self.assertEqual(state['votes'], {})
                        self.assertEqual(len(state['voted_ids']), i + 1)
                        self.assertEqual(state['hand'], [])
                else:
                    for index, state in enumerate(states):
                        self.assertEqual(state['phase'], 'president_discard')
                        self.assertEqual(state['last_votes'], {s['player_id']: True for s in sessions})
                        self.assertEqual(len(state['hand']), 3 if index == president_index else 0)

            states = await self.action(clients, president_index, 'discard', 'president-discard', index=0)
            chancellor_index = next(i for i, s in enumerate(sessions) if s['player_id'] == nominee_id)
            for index, state in enumerate(states):
                self.assertEqual(state['phase'], 'chancellor_discard')
                self.assertEqual(len(state['hand']), 2 if index == chancellor_index else 0)

            # Reconnect with the existing seat token while a private hand is pending.
            before = states[chancellor_index]
            await clients[chancellor_index].disconnect()
            disconnected.add(chancellor_index)
            resumed = self.socket_client(sessions[chancellor_index]['code'], sessions[chancellor_index]['token'])
            self.assertTrue((await resumed.connect())[0])
            clients[chancellor_index] = resumed
            disconnected.remove(chancellor_index)
            after = (await resumed.receive_json_from())['state']
            self.assertEqual(after, before)

            # A replayed request cannot discard another card after reconnect.
            states = await self.action(clients, chancellor_index, 'discard', 'chancellor-discard', index=0)
            version = states[0]['version']
            enacted = states[0]['liberal_policies'] + states[0]['fascist_policies']
            self.assertEqual(enacted, 1)
            replayed = await self.action(clients, chancellor_index, 'discard', 'chancellor-discard', index=0)
            self.assertEqual(replayed[0]['version'], version)
            self.assertEqual(replayed[0]['liberal_policies'] + replayed[0]['fascist_policies'], 1)
        finally:
            for i, client in enumerate(clients):
                if i not in disconnected:
                    await client.disconnect()

    async def test_invalid_tokens_and_cross_game_tokens_rejected_even_same_room_code(self):
        from game import services as old_services
        from game.models import Room

        secret = await database_sync_to_async(services.create_room)('Secret host')
        old = await database_sync_to_async(old_services.create_room)('Crown host', {})
        await database_sync_to_async(lambda: Room.objects.filter(code=old['code']).update(code=secret['code']))()

        attempts = [
            (secret['token'], True),
            (old['token'], False),
            ('', False),
            ('invalid-token', False),
            ('Tiếng Việt', False),
        ]
        for token, legacy in attempts:
            client = self.socket_client(secret['code'], token, legacy=legacy)
            try:
                connected, close_code = await client.connect()
                self.assertFalse(connected)
                self.assertEqual(close_code, 4403)
            finally:
                await client.disconnect()

        # Both legitimate tokens still work in their corresponding namespace.
        for token, legacy in [(secret['token'], False), (old['token'], True)]:
            client = self.socket_client(secret['code'], token, legacy=legacy)
            try:
                self.assertTrue((await client.connect())[0])
                self.assertEqual((await client.receive_json_from())['state']['phase'], 'lobby')
            finally:
                await client.disconnect()

    async def test_broadcast_groups_are_independent_and_invalid_action_does_not_broadcast(self):
        from game import services as old_services
        from game.models import Room

        secret = await database_sync_to_async(services.create_room)('Secret host')
        old = await database_sync_to_async(old_services.create_room)('Crown host', {})
        await database_sync_to_async(lambda: Room.objects.filter(code=old['code']).update(code=secret['code']))()
        secret_client = self.socket_client(secret['code'], secret['token'])
        old_client = self.socket_client(secret['code'], old['token'], legacy=True)
        try:
            for client in (secret_client, old_client):
                self.assertTrue((await client.connect())[0])
                await client.receive_json_from()

            await secret_client.send_json_to(dict(type='action', action='ready', ready=True, action_id='secret-ready'))
            self.assertTrue((await secret_client.receive_json_from())['state']['players'][0]['ready'])
            self.assertTrue(await old_client.receive_nothing(timeout=0.1))

            await old_client.send_json_to(dict(type='action', action='ready', action_id='crown-ready'))
            self.assertTrue((await old_client.receive_json_from())['state']['players'][0]['ready'])
            self.assertTrue(await secret_client.receive_nothing(timeout=0.1))

            before = await database_sync_to_async(services.read)(secret['code'], secret['token'])
            await secret_client.send_json_to(dict(type='action', action='vote', vote=True, action_id='invalid-vote'))
            self.assertEqual((await secret_client.receive_json_from())['type'], 'error')
            self.assertTrue(await secret_client.receive_nothing(timeout=0.1))
            self.assertTrue(await old_client.receive_nothing(timeout=0.1))
            after = await database_sync_to_async(services.read)(secret['code'], secret['token'])
            self.assertEqual(after, before)
        finally:
            await secret_client.disconnect()
            await old_client.disconnect()
