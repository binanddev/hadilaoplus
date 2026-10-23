# Vương miện & Phản bội

Tên kho mã: **hadilaoplus** · nhánh chính của dự án: `minhtien`.

Game nhóm bạn độc lập: React + Vite + TypeScript + PlayCanvas, Django + Channels.
Không phụ thuộc vào ứng dụng khác. Bàn chơi 3D đơn giản kết hợp giao diện bài và giao dịch 2D.

## Chạy trên Windows

Mở **run.bat** trong thư mục này. Lần đầu cần internet để tải thư viện.

File chạy sẽ tạo `backend/.venv`, cài thư viện Python/frontend khi cần,
tạo bảng dữ liệu rồi chạy backend tại cổng 8000 và frontend tại cổng 5173.
Mở **http://localhost:5173**. Nhấn **Ctrl+C** trong cửa sổ chạy để dừng cả hai.
Không cần kích hoạt môi trường ảo thủ công. Không cần Redis, Docker hoặc Neon để thử trên máy.

Chọn nhân vật trước khi tạo/vào phòng, hoặc đổi trong phòng chờ trước khi bắt đầu.
Giữ chuột phải trên cảnh 3D để nhìn quanh. Có thể thả bài vào tên nhân vật hoặc danh sách bên trái.
Âm thanh chỉ gồm hiệu ứng ngắn cho bài, tiền, xúc xắc, vương miện và bom; không có nhạc nền.
Trình duyệt yêu cầu thao tác chuột/phím trước khi cho phép phát tiếng. Dùng nút âm thanh để tắt/bật.

Chỉ chuẩn bị môi trường, không mở server: `py run.py --setup-only`.

Để thử nhiều người trên một máy: mở các hồ sơ trình duyệt khác nhau hoặc cửa sổ thường và riêng tư.
Mỗi hồ sơ lưu phiên ghế riêng. Tạo phòng ở cửa sổ thứ nhất, nhập mã phòng ở cửa sổ còn lại.
Đây là chế độ chạy trên máy cá nhân; muốn bạn bè ở xa cùng vào cần triển khai frontend/backend.

## Cấu trúc

- `frontend/`: giao diện tiếng Việt, bàn 3D và kết nối WebSocket.
- `backend/`: Django, xử lý luật trên máy chủ, trạng thái phòng và kiểm tra hành động.
- `backend/.venv/`: môi trường Python riêng, tự tạo khi chuẩn bị môi trường.
- `docs/`: ghi chú luật và vận hành.
- `run.py`, `run.bat`: điểm chạy duy nhất cho phát triển trên máy.
- `render.yaml`: mẫu triển khai, không tự tạo dịch vụ hoặc phát sinh tài khoản.

## Luật cốt lõi

- Mỗi phòng tối đa 8 người, từ 2 người để thử; nên chơi 4–8 người.
- Mặc định 4 vòng, thương lượng sau các vòng trừ vòng cuối.
- Rút bù lên 5 lá đầu vòng. Vua tối đa 3 lá/lượt, quý tộc 2 lá/lượt.
- Hạn mức chốt khi bắt đầu lượt; đổi vua giữa lượt không cấp thêm lượt.
- Người vượt vàng vua sẽ nhận vương miện ngay sau hành động; hòa giữ vua hiện tại.
- Vàng không âm, không ai bị loại chỉ vì hết vàng.
- Chuyển vàng và đổi bài trong thương lượng; hai bên có thể phản bội lời hứa tương lai.
- Kết thúc vòng cuối, người đang đội vương miện thắng. Có thể chơi lại cùng phòng.

Đọc [ghi chú thiết kế](docs/DESIGN.md) để biết giới hạn của bản đầu.

## Deploy lên Render: frontend + backend, không cần Neon/Redis

Với nhóm bạn chơi vui, chỉ cần **một Static Site cho frontend** và **một Web Service
chạy một tiến trình Daphne cho backend**. Code vẫn dùng SQLite để giữ phòng, bài, vàng
và lượt đang chơi, nhưng không cần tạo dịch vụ database riêng.

SQLite nằm trên ổ đĩa tạm của backend Render. Khi dịch vụ ngủ, khởi động lại hoặc deploy
mới, dữ liệu phòng có thể mất; hãy tạo phòng mới. Phương án này không bảo đảm khôi phục ván.
Giữ backend ở **một instance, một tiến trình Daphne** để channel layer trong bộ nhớ hoạt động đúng.

**Tạo hai dịch vụ thủ công theo các bước dưới đây. Không chọn Blueprint cho phương án này:**
`render.yaml` hiện là mẫu cấu hình nâng cao, có yêu cầu database ngoài và Render Key Value.

### 1. Tạo backend

Vào [Render Dashboard](https://dashboard.render.com/) → **New → Web Service**,
kết nối GitHub và chọn kho `binanddev/hadilaoplus`.

- **Name:** `hadilaoplus-api` (hoặc tên còn trống).
- **Branch:** `minhtien`.
- **Region:** Singapore.
- **Root Directory:** `backend`.
- **Language/Runtime:** Python 3.
- **Instance Type:** Free để thử nghiệm.
- **Build Command:**

  ```bash
  pip install -r requirements.txt
  ```

- **Start Command:**

  ```bash
  python manage.py migrate --noinput && daphne -b 0.0.0.0 -p $PORT crown.asgi:application
  ```

- **Health Check Path:** `/api/health/`.

Lệnh `migrate` tạo bảng SQLite khi bắt đầu chạy. Không dùng `run.bat`, `runserver`
hoặc máy chủ WSGI để chạy backend trên Render; game cần ASGI/WebSocket.

Trong **Environment**, thêm các biến sau (thay giá trị ví dụ bằng địa chỉ thực tế):

```dotenv
DEBUG=0
DJANGO_SECRET_KEY=<chuỗi-ngẫu-nhiên-dài-do-bạn-tạo>
ALLOWED_HOSTS=hadilaoplus-api.onrender.com
FRONTEND_ORIGINS=https://hadilaoplus.onrender.com
```

- `ALLOWED_HOSTS` chỉ chứa hostname backend, **không có** `https://` hoặc đường dẫn.
- `FRONTEND_ORIGINS` chứa URL frontend đầy đủ, **không có dấu `/` cuối**.
  Có thể tạm điền tên miền dự kiến rồi cập nhật sau bước 2.
- **Không tạo** `DATABASE_URL` và `REDIS_URL`; nếu đã thêm, xóa để dùng SQLite và channel layer trong bộ nhớ.
- Chưa cần khai báo phiên bản Python nếu phiên bản mặc định của Render tương thích với requirements.

Tạo khóa bí mật trên máy bằng lệnh sau, rồi chép kết quả vào `DJANGO_SECRET_KEY`:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Không chép nguyên dấu `<...>` làm giá trị khóa và không đưa khóa thật vào Git.
Bấm **Create Web Service**. Khi deploy thành công, mở
`https://<hostname-backend-thực-tế>/api/health/`; kết quả cần là `{"status":"ok"}`.

### 2. Tạo frontend

Trên Render → **New → Static Site**, chọn cùng kho GitHub:

- **Name:** `hadilaoplus` (hoặc tên còn trống).
- **Branch:** `minhtien`.
- **Root Directory:** `frontend`.
- **Build Command:** `npm ci && npm run build`.
- **Publish Directory:** `dist`.

Trong **Environment**, thêm `VITE_API_URL` bằng URL backend thực tế, ví dụ:

```dotenv
VITE_API_URL=https://hadilaoplus-api.onrender.com
```

Không thêm `/api`, không thêm dấu `/` cuối, không điền địa chỉ `localhost`.
Frontend tự nối đường dẫn API và chuyển sang `wss://` để kết nối WebSocket.
Bấm **Create Static Site**.

Trong **Redirects/Rewrites**, thêm quy tắc để đường dẫn frontend mở được khi tải lại:

- **Source:** `/*`.
- **Destination:** `/index.html`.
- **Action:** Rewrite.

### 3. Cập nhật địa chỉ hai dịch vụ

Sau khi có URL frontend thực tế, quay lại **backend → Environment**:

1. Đặt `FRONTEND_ORIGINS` đúng URL frontend Render cấp.
2. Kiểm tra `ALLOWED_HOSTS` khớp hostname backend Render cấp.
3. Lưu cấu hình và deploy lại backend.

Nếu sửa `VITE_API_URL`, phải deploy lại frontend vì biến `VITE_*` được đưa vào lúc build.
Địa chỉ `hadilaoplus.onrender.com` và `hadilaoplus-api.onrender.com` ở trên chỉ là ví dụ;
Render có thể cấp tên khác nếu tên đó đã được sử dụng.

### 4. Chơi thử và xử lý lỗi thường gặp

Mở frontend, tạo phòng; dùng trình duyệt/hồ sơ khác hoặc gửi mã cho bạn bè để vào cùng.
Chọn nhân vật, sẵn sàng, bắt đầu và kiểm tra bài/vàng cập nhật trên các máy.
Âm thanh cần một thao tác chuột/phím để trình duyệt cho phép phát.

- **Backend trả lỗi hostname:** kiểm tra `ALLOWED_HOSTS`.
- **API/WebSocket không kết nối:** kiểm tra `VITE_API_URL`, `FRONTEND_ORIGINS`
  và backend đã báo Live; URL frontend phải khớp cả `https://` lẫn hostname.
- **Backend vừa thức dậy:** chờ dịch vụ sẵn sàng, rồi tải lại frontend.
- **Phòng cũ không còn sau restart/deploy:** về trang chủ và tạo phòng mới.

Render Free có thể ngủ sau khoảng 15 phút không có lưu lượng vào và mất khoảng một phút
để thức lại. Nâng gói backend nếu cần luôn sẵn sàng; nâng gói không tự làm SQLite bền vững.

Tài liệu chính thức: [Static Sites](https://render.com/docs/static-sites),
[WebSocket](https://render.com/docs/websocket), [giới hạn Free](https://render.com/docs/free).

### Khi nào mới cần Neon và Redis?

Chỉ bổ sung khi muốn giữ ván qua restart hoặc chạy backend nhiều instance/tiến trình.
Code đã có sẵn hỗ trợ `DATABASE_URL` cho PostgreSQL và `REDIS_URL` cho Channels;
có thể dùng mẫu `render.yaml` lúc đó. Không đưa file `.env` hoặc khóa bí mật lên Git.

## Kiểm tra không chạy server

Sau khi chuẩn bị môi trường:

```powershell
cd backend
.\.venv\Scripts\python.exe manage.py test
.\.venv\Scripts\python.exe manage.py check
cd ..\frontend
npm.cmd run build
```

Kiểm tra tự động và build không thay thế việc chơi thử bằng trình duyệt thật.
