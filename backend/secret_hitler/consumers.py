from urllib.parse import parse_qs
import asyncio
import time
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from . import engine, services


class SecretHitlerConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.discussion_timer = None
        self.code = self.scope['url_route']['kwargs']['code'].upper()
        self.token = parse_qs(self.scope['query_string'].decode()).get('token', [''])[0]
        self.group = f'secret_hitler_{self.code}'
        try:
            state = await database_sync_to_async(services.read)(self.code, self.token)
        except engine.RuleError:
            await self.close(code=4403)
            return
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        # Read after subscribing so a join/action cannot fall into a subscription gap.
        await self.room_update({})

    async def disconnect(self, code):
        if getattr(self, 'discussion_timer', None):
            self.discussion_timer.cancel()
            self.discussion_timer = None
        if getattr(self, 'group', None):
            await self.channel_layer.group_discard(self.group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        if not isinstance(content, dict) or content.get('type') != 'action':
            await self.send_json({'type': 'error', 'message': 'Yêu cầu không hợp lệ.'})
            return
        try:
            await database_sync_to_async(services.mutate)(self.code, self.token, content)
            await self.channel_layer.group_send(self.group, {'type': 'room.update'})
        except engine.RuleError as e:
            await self.send_json({'type': 'error', 'message': str(e)})

    async def room_update(self, event):
        try:
            state = await database_sync_to_async(services.read)(self.code, self.token)
        except engine.RuleError:
            await self.close(code=4403)
            return
        await self.send_json({'type': 'state', 'state': state})
        self.schedule_discussion(state)

    def schedule_discussion(self, state):
        deadline = state.get('discussion_ends_at') if state['phase'] == 'discussion' else None
        if getattr(self, 'timer_deadline', None) == deadline:
            return
        if self.discussion_timer:
            self.discussion_timer.cancel()
        self.timer_deadline = deadline
        self.discussion_timer = asyncio.create_task(self.finish_discussion(deadline)) if deadline else None

    async def finish_discussion(self, deadline):
        try:
            # Sleep only in this room's background task, never in message handling.
            await asyncio.sleep(max(0, deadline - time.time()))
            await database_sync_to_async(services.advance)(self.code)
            # A concurrent reconnect/read may already have advanced the row.
            # Refresh everyone even then, so connected clients never stay paused.
            await self.channel_layer.group_send(self.group, {'type': 'room.update'})
        except (asyncio.CancelledError, engine.RuleError):
            pass
