import asyncio
from urllib.parse import parse_qs
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from . import services, engine

class RoomConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.code = self.scope['url_route']['kwargs']['code'].upper()
        self.token = parse_qs(self.scope['query_string'].decode()).get('token', [''])[0]
        self.group = f'room_{self.code}'
        self.timer_task = None
        try:
            state = await database_sync_to_async(services.read)(self.code, self.token)
        except engine.RuleError:
            await self.close(code=4403)
            return
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        await self.send_json({'type': 'state', 'state': state})
        self.timer_task = asyncio.create_task(self.timer())

    async def disconnect(self, code):
        if getattr(self, 'timer_task', None):
            self.timer_task.cancel()
        if getattr(self, 'group', None):
            await self.channel_layer.group_discard(self.group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        if not isinstance(content, dict) or content.get('type') != 'action':
            await self.send_json({'type': 'error', 'message': 'Yêu cầu không hợp lệ.'})
            return
        try:
            message = await database_sync_to_async(services.mutate)(self.code, self.token, content)
            if message:
                await self.send_json({'type': 'error', 'message': message})
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

    async def timer(self):
        try:
            while True:
                await asyncio.sleep(1)
                if await database_sync_to_async(services.tick)(self.code):
                    await self.channel_layer.group_send(self.group, {'type': 'room.update'})
        except asyncio.CancelledError:
            pass
