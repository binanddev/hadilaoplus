import json
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST
from . import engine, services


def broadcast(code):
    async_to_sync(get_channel_layer().group_send)(f'secret_hitler_{code.upper()}', {'type': 'room.update'})


def payload(request):
    engine.require(len(request.body) < 16384, 'Yêu cầu quá lớn.')
    try:
        data = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        raise engine.RuleError('JSON không hợp lệ.')
    engine.require(isinstance(data, dict), 'Dữ liệu không hợp lệ.')
    return data


def response(data, status=200):
    result = JsonResponse(data, status=status)
    result['Cache-Control'] = 'no-store'
    return result


@csrf_exempt
@require_POST
def create(request):
    try:
        return response(services.create_room(payload(request).get('name', '')), 201)
    except engine.RuleError as e:
        return response({'message': str(e)}, 400)


@csrf_exempt
@require_POST
def join(request, code):
    try:
        result = services.join_room(code, payload(request).get('name', ''))
        broadcast(code)
        return response(result, 201)
    except engine.RuleError as e:
        return response({'message': str(e)}, 400)


@require_GET
def detail(request, code):
    try:
        return response(services.read(code, request.GET.get('token', '')))
    except engine.RuleError as e:
        return response({'message': str(e)}, 400)


@csrf_exempt
@require_POST
def action(request, code):
    try:
        data = payload(request)
        result = services.mutate(code, data.get('token', ''), data)
        broadcast(code)
        return response({'state': result})
    except engine.RuleError as e:
        return response({'message': str(e)}, 400)
