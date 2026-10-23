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

## Triển khai Render + Neon

1. Đưa dự án vào kho mã riêng. Dùng Blueprint `render.yaml` để tạo frontend Static Site,
   backend Python Web Service và Render Key Value.
2. Nhập `DATABASE_URL` của Neon với TLS theo chuỗi kết nối Neon cung cấp.
3. `ALLOWED_HOSTS`: hostname backend, không có `https://`.
4. `FRONTEND_ORIGINS`: URL frontend đầy đủ, ví dụ `https://your-game.onrender.com`.
5. `VITE_API_URL`: URL backend đầy đủ, ví dụ `https://your-api.onrender.com`.
6. `REDIS_URL` lấy từ Key Value; `DJANGO_SECRET_KEY` được Render tạo.
7. Backend cần `DEBUG=0`. Không dùng SQLite hoặc channel layer trong bộ nhớ khi triển khai.

Không đưa file `.env`, chuỗi kết nối hoặc khóa bí mật lên kho mã.
Thay đổi biến `VITE_*` cần build lại frontend. Bản miễn phí có thể ngủ hoặc khởi động lại;
chấp nhận tạo ván mới nếu gặp sự cố. Nâng gói backend khi cần phòng luôn sẵn sàng.

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
