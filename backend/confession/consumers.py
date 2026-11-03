import asyncio
import time
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from urllib.parse import parse_qs
from . import services
from .models import ConfessionRoom


class ConfessionConsumer(AsyncJsonWebsocketConsumer):
    # One publisher per room/process; shared DB deadlines remain authoritative across workers.
    rooms = {}

    async def connect(self):
        self.code = self.scope['url_route']['kwargs']['code'].upper()
        self.token = parse_qs(self.scope['query_string'].decode()).get('token', [''])[0]
        self.group = 'confession.' + self.code
        self.bucket = time.monotonic()
        self.count = 0
        try:
            state, p = await database_sync_to_async(services.update)(self.code, self.token, {'action':'ping'})
        except (ValueError, ConfessionRoom.DoesNotExist):
            await self.close(code=4403)
            return
        self.pid = p['id']
        self.personal = self.group + '.' + self.pid
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.channel_layer.group_add(self.personal, self.channel_name)
        await self.accept()
        await self.send_json({'type':'state', 'state':state})
        await self.send_json({'type':'draft', 'text':p['draft']})
        entry = self.rooms.get(self.code)
        if entry is None:
            entry = self.rooms[self.code] = {'connections':set(), 'task':asyncio.create_task(self.publish())}
        entry['connections'].add(self.channel_name)

    async def publish(self):
        try:
            while True:
                await asyncio.sleep(.5)
                state, _ = await database_sync_to_async(services.update)(self.code)
                await self.channel_layer.group_send(self.group, {'type':'room.state', 'state':state})
        except asyncio.CancelledError:
            pass

    async def receive(self, text_data=None, bytes_data=None, **kwargs):
        if text_data is None or len(text_data) > 24000:
            await self.close(code=4400)
            return
        try:
            await super().receive(text_data=text_data, **kwargs)
        except (ValueError, TypeError, KeyError):
            await self.send_json({'type':'error', 'message':'Yêu cầu không hợp lệ.'})

    async def receive_json(self, data, **kwargs):
        if not isinstance(data, dict):
            return
        now = time.monotonic()
        if now-self.bucket >= 1:
            self.bucket, self.count = now, 0
        self.count += 1
        if self.count > 120:
            return
        try:
            if data.get('action') == 'signal':
                state, _ = await database_sync_to_async(services.update)(self.code, self.token)
                target = data.get('target')
                ids = {p['id'] for p in state['players']}
                if state['phase'] != 'confession' or data.get('round') != state['round'] or target not in ids:
                    return
                if self.pid != state['speaker'] and target != state['speaker']:
                    return
                payload = data.get('payload')
                if not isinstance(payload, dict):
                    return
                description = payload.get('description')
                if description:
                    expected = 'offer' if self.pid == state['speaker'] else 'answer'
                    if not isinstance(description, dict) or description.get('type') != expected:
                        return
                await self.channel_layer.group_send(self.group+'.'+target, {
                    'type':'voice.signal', 'sender':self.pid, 'payload':payload, 'round':state['round']})
            elif self.count <= 8:
                await database_sync_to_async(services.update)(self.code, self.token, data)
        except (ValueError, ConfessionRoom.DoesNotExist) as error:
            await self.send_json({'type':'error', 'message':str(error)})

    async def room_state(self, event):
        await self.send_json({'type':'state', 'state':event['state']})

    async def voice_signal(self, event):
        await self.send_json({'type':'signal', 'sender':event['sender'], 'payload':event['payload'], 'round':event['round']})

    async def disconnect(self, code):
        if not hasattr(self, 'pid'):
            return
        await self.channel_layer.group_discard(self.group, self.channel_name)
        await self.channel_layer.group_discard(self.personal, self.channel_name)
        entry = self.rooms.get(self.code)
        if entry:
            entry['connections'].discard(self.channel_name)
            if not entry['connections']:
                entry['task'].cancel()
                del self.rooms[self.code]
