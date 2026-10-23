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
- **`Unexpected token '<' ... is not valid JSON`:** API đang trả trang HTML thay vì JSON.
  Mở URL backend `/api/health/`; nếu HTTP 400, kiểm tra `ALLOWED_HOSTS` có đúng hostname
  backend thực tế, rồi deploy lại. Frontend mới sẽ báo lỗi cấu hình rõ hơn thay vì lỗi đọc JSON.

Backend tự bổ sung hostname do Render cung cấp qua `RENDER_EXTERNAL_HOSTNAME` vào danh sách
host hợp lệ; vẫn giữ `ALLOWED_HOSTS` cho các tên miền riêng. Không dùng `ALLOWED_HOSTS=*`.

Render Free có thể ngủ sau khoảng 15 phút không có lưu lượng vào và mất khoảng một phút
để thức lại. Nâng gói backend nếu cần luôn sẵn sàng; nâng gói không tự làm SQLite bền vững.

Tài liệu chính thức: [Static Sites](https://render.com/docs/static-sites),
[WebSocket](https://render.com/docs/websocket), [giới hạn Free](https://render.com/docs/free).

### Khi nào mới cần Neon và Redis?

Chỉ bổ sung khi muốn giữ ván qua restart hoặc chạy backend nhiều instance/tiến trình.
Code đã có sẵn hỗ trợ `DATABASE_URL` cho PostgreSQL và `REDIS_URL` cho Channels;
có thể dùng mẫu `render.yaml` lúc đó. Không đưa file `.env` hoặc khóa bí mật lên Git.

## Phương án khác: frontend Netlify + backend Render

Frontend React/Vite/PlayCanvas có thể triển khai trên Netlify. Backend Django và WebSocket
vẫn chạy trực tiếp trên Render; chưa cần Neon hay Redis với cấu hình một instance nói trên.
Không cần cài thêm plugin Netlify cho frontend hiện tại.

### 1. Backend giữ trên Render

Làm theo phần tạo backend ở trên. **Root Directory đặt `backend` hoặc `backend/` đều đúng**.
Vì Render chạy lệnh từ thư mục đó, không thêm `cd backend` và không thêm tiền tố `backend/`
vào đường dẫn requirements.

- **Build Command:** `pip install -r requirements.txt`.
- **Start Command:**

  ```bash
  python manage.py migrate --noinput && daphne -b 0.0.0.0 -p $PORT crown.asgi:application
  ```

Chờ backend báo Live và kiểm tra URL `/api/health/` trước khi kết nối frontend.

### 2. Import frontend vào Netlify

Đăng nhập [Netlify](https://app.netlify.com/), chọn tạo project/site mới bằng cách import
repository từ GitHub, rồi chọn `binanddev/hadilaoplus`.

Điền các thiết lập build:

Kho đã có `netlify.toml` ở thư mục gốc để đặt sẵn Base directory, Build command,
Publish directory và Node 24. Các giá trị trong file được ưu tiên hơn cấu hình tương ứng
trên giao diện Netlify. Hãy deploy commit mới nhất trên nhánh `minhtien`.

- **Branch to deploy:** `minhtien`.
- **Base directory:** `frontend`.
- **Package directory:** để trống nếu giao diện có trường này; Base directory đã trỏ tới frontend.
- **Build command:** `npm run build`.
- **Publish directory:** `dist`, tính từ Base directory; không nhập thêm `frontend/dist`.
- **Functions directory:** để trống; backend không chạy trong Netlify Functions.

Netlify cài dependencies trước bước build. Kho đã có `package-lock.json`.
Trong phần **Environment variables**, thêm:

```dotenv
NODE_VERSION=24
VITE_API_URL=https://hadilaoplus-api.onrender.com
```

Thay URL ví dụ bằng URL backend Render thực tế. Dùng `https://`, không thêm `/api`
hoặc dấu `/` cuối. Biến `VITE_API_URL` là địa chỉ công khai; không đưa khóa bí mật
của Django vào bất kỳ biến `VITE_*` nào.

Deploy frontend. Khi hoàn tất, Netlify cấp địa chỉ dạng `https://ten-site.netlify.app`.

### 3. Cho phép frontend Netlify kết nối backend

Trở lại **Render → backend → Environment**, sửa cấu hình, ví dụ:

```dotenv
DEBUG=0
ALLOWED_HOSTS=hadilaoplus-api.onrender.com
FRONTEND_ORIGINS=https://ten-site.netlify.app
```

Giữ nguyên `DJANGO_SECRET_KEY` đã tạo. `ALLOWED_HOSTS` vẫn là hostname backend Render,
không đổi sang tên miền Netlify. `FRONTEND_ORIGINS` mới là URL frontend Netlify thực tế,
không có dấu `/` cuối. Lưu và deploy lại backend.

Nếu muốn cho phép cả frontend Render cũ và Netlify, liệt kê hai origin cách nhau bằng dấu phẩy,
không có khoảng trắng. Khi dùng tên miền riêng, thêm đúng origin tên miền đó vào danh sách.

Frontend gửi API và kết nối `wss://` **thẳng tới backend Render**. Không cần cấu hình proxy
`/api` hay `/ws` qua Netlify; proxy trong `vite.config.ts` chỉ dùng khi chạy local.

### 4. Tải lại trang và cập nhật phiên bản

Kho đã có `frontend/public/_redirects` với nội dung:

```text
/* /index.html 200
```

Vite tự chép file này vào `dist`; Netlify dùng nó để mở lại các đường dẫn của ứng dụng
thay vì trả 404. Các file tài nguyên có thật vẫn được phục vụ bình thường.

Mở frontend Netlify và thử tạo/vào phòng với hai trình duyệt. Nếu không kết nối được,
kiểm tra URL backend đã Live, `VITE_API_URL` và `FRONTEND_ORIGINS` có khớp địa chỉ thực tế.
Render Free vẫn có thể ngủ và mất phòng khi khởi động lại, dù frontend đặt ở Netlify.

Khi sửa biến `VITE_API_URL` trên Netlify, cần chạy một deploy mới vì biến được nhúng
vào bản build. Sau này push lên nhánh `minhtien` sẽ kích hoạt deploy nếu bật tự động triển khai.

Tài liệu chính thức: [Vite trên Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/vite/),
[rewrite cho ứng dụng SPA](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/).

### Nếu deploy bị lỗi ngay từ đầu

**Netlify: `No build steps found` rồi `Deploy directory 'frontend/dist' does not exist`.**
Netlify chưa chạy `npm run build`, nên chưa tạo thư mục xuất bản. Deploy commit mới có
`netlify.toml`; kiểm tra log phải hiển thị chạy `npm run build`. Nếu cấu hình thủ công,
đặt Base directory `frontend`, Build command `npm run build`, Publish directory `dist`.
Đường dẫn `frontend/dist` trong log có thể là đường dẫn đã được Netlify quy đổi từ Base directory;
dòng `No build steps found` mới là dấu hiệu trực tiếp cho thấy thiếu bước build.
Không cần đưa `dist` vào Git. Dòng báo không tìm được cache và thông báo cập nhật pip không phải
nguyên nhân của các lỗi này.

**Render: `RuntimeError: Set DJANGO_SECRET_KEY for production`.**
Backend chưa nhận được khóa riêng hợp lệ, đang dùng khóa mặc định dành cho local.
Vào đúng Web Service backend → **Environment → Add Environment Variable**:

- **Key:** `DJANGO_SECRET_KEY` (đúng tên này, không phải `SECRET_KEY`).
- **Value:** kết quả của `python -c "import secrets; print(secrets.token_urlsafe(48))"` trên máy bạn.

Không dùng khóa mặc định bắt đầu bằng `local-`, không đưa khóa vào Git và không cần gửi khóa cho ai.
Giữ `DEBUG=0`, chọn **Save and deploy** hoặc lưu rồi deploy lại. Nếu chỉ chọn **Save only**,
backend chưa nhận giá trị mới cho đến lần deploy kế tiếp. File `.env.example` chỉ là mẫu,
không tự trở thành biến môi trường của dịch vụ Render.

### Nhập biến backend từ một file

Trên máy chuẩn bị dự án có thể dùng file riêng `backend/.env.render` để nhập nhanh.
File thật chứa khóa ngẫu nhiên, được `.gitignore` loại khỏi Git; không xuất hiện trên GitHub.
`backend/.env.render.example` là mẫu công khai, chưa có khóa dùng thật.

1. Mở file `.env.render` trên máy bằng trình soạn thảo.
2. Thay `YOUR-BACKEND.onrender.com` bằng hostname backend Render của bạn.
3. Thay `https://YOUR-SITE.netlify.app` bằng URL frontend Netlify thực tế, không có `/` cuối.
4. Vào **Render → Web Service backend → Environment → Add from .env** và nhập nội dung file.
   Nếu giao diện cho chọn file, chọn `.env.render`; nếu hiện ô văn bản, dán nội dung vào ô đó.
5. Kiểm tra không còn biến trùng tên với giá trị cũ, rồi chọn **Save and deploy**.

Chỉ nhập file này vào backend Render, không nhập vào Netlify. Netlify chỉ cần `VITE_API_URL`
trỏ tới backend. Không đẩy file thật lên Git hoặc đưa khóa vào biến `VITE_*`.
Không cần thay `DJANGO_SECRET_KEY` mỗi lần deploy; giữ nguyên khóa đã dùng cho dịch vụ.
File `.env.render` chỉ phục vụ nhập cấu hình, không tự được Django đọc khi chạy local.

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
