import json
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST
from . import services, engine

def broadcast(code):
    async_to_sync(get_channel_layer().group_send)(f'room_{code}', {'type': 'room.update'})

def payload(request):
    engine.require(len(request.body) < 16384, 'Yêu cầu quá lớn.')
    try:
        data = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        raise engine.RuleError('JSON không hợp lệ.')
    engine.require(isinstance(data, dict), 'Dữ liệu không hợp lệ.')
    return data

@require_GET
def health(request):
    return JsonResponse({'status': 'ok'})

@csrf_exempt
@require_POST
def create(request):
    try:
        data = payload(request)
        return JsonResponse(services.create_room(data.get('name', ''), data.get('settings', {}), data.get('character', 'regent')), status=201)
    except engine.RuleError as e:
        return JsonResponse({'message': str(e)}, status=400)

@csrf_exempt
@require_POST
def join(request, code):
    try:
        data = payload(request)
        result = services.join_room(code, data.get('name', ''), data.get('character', 'regent'))
        broadcast(result['code'])
        return JsonResponse(result, status=201)
    except engine.RuleError as e:
        return JsonResponse({'message': str(e)}, status=400)

@require_GET
def detail(request, code):
    response = None
    try:
        response = JsonResponse(services.read(code, request.GET.get('token', '')))
    except engine.RuleError as e:
        response = JsonResponse({'message': str(e)}, status=400)
    response['Cache-Control'] = 'no-store'
    return response
