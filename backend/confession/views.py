import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from . import services
from .models import ConfessionRoom


@csrf_exempt
@require_POST
def enter(request, code=None):
    try:
        if len(request.body) > 4096:
            raise ValueError('Yêu cầu quá dài.')
        body = json.loads(request.body)
        if not isinstance(body, dict):
            raise ValueError('Yêu cầu không hợp lệ.')
        result = services.join(code.upper(), body.get('name'), body.get('avatar', 0)) if code else services.create(body.get('name'), body.get('avatar', 0))
        return JsonResponse(result)
    except ConfessionRoom.DoesNotExist:
        return JsonResponse({'error':'Không tìm thấy phòng.'}, status=404)
    except (ValueError, TypeError):
        return JsonResponse({'error':'Không thể vào phòng. Kiểm tra mã, tên (1–24 ký tự) hoặc phòng đã đầy.'}, status=400)
