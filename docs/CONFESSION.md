# Thú tội

Game thứ ba tại `#/confession`, độc lập với Ngai Vàng và Secret Hitler.
Chạy migration bằng `python manage.py migrate --noinput` (run.bat đã làm bước này).

## Chơi

- Chọn Nam/Nữ và một trong 8 kiểu nhân vật, vào cùng một khán phòng chung. Không tạo phòng, không nhập mã; tối đa 100 ghế, xếp 10 hàng × 10 chỗ như rạp chiếu phim.
- Soạn riêng tối đa 150 từ phân cách bằng khoảng trắng, đồng thời tối đa 3.000 ký tự.
  Lời đã lưu tự công khai khi bắt đầu giai đoạn thú tội; bản nháp không có trong snapshot công khai.
- Vào khán phòng là tự xếp hàng FIFO. Hết lượt, người còn online quay lại cuối hàng; có thể tạm nghỉ khi đang chờ. Đến lượt xuất hiện dưới hào quang trên sân khấu trong 5 giây.
- Máy chủ quyết định lượt 5s lên bục, 20s thú tội, 5s kết án. Phòng tự chạy khi có người đăng ký.
- Một người một phiếu được đổi; người trên bục không tự bỏ phiếu. Năm giây cuối giấu tỷ lệ.
- Đồng cảm độc lập phiếu bầu. Hòa hoặc không có phiếu được xử “chưa đủ bằng chứng”.
- Nhẹ tay chặn trứng/sét trên máy chủ. Các biểu cảm đều là câu có sẵn.
- Kết nối lại giữ phiên trong tab. Ghế vắng quá 35s không hiển thị/không được gọi;
  phòng chung thu hồi ghế vắng sau 35s hoặc khi bấm Rời phòng, giữ nguyên vị trí các ghế khác.

## Mic

Người nói chủ động cấp quyền micro. Chỉ họ được phát trong giai đoạn 20s;
client dừng tracks khi hết giờ, đổi lượt, mất kết nối hoặc rời phòng.
Không ghi âm, không tự chuyển lời nói thành chữ. Người nghe có nút tắt tiếng.
WebRTC gửi giọng nói từ người nói đến từng người nghe, signaling qua WebSocket có xác thực.
Mic yêu cầu HTTPS hoặc localhost. Mặc định không dùng máy chủ ICE công cộng.
Để kết nối qua NAT, cấu hình `VITE_CONFESSION_ICE_SERVERS` thành mảng RTCIceServer JSON
với STUN/TURN của đơn vị triển khai. Không đặt khóa TURN dài hạn trong frontend;
production nên cấp thông tin TURN ngắn hạn từ dịch vụ có xác thực.

**Giới hạn:** 100 ghế không đồng nghĩa đã kiểm chứng 100 đường thoại đồng thời.
Broadcaster hiện gửi một luồng cho từng người nghe, nên upload tăng theo số người.
Phòng đông production cần tích hợp SFU và kiểm thử mạng/GPU thực tế. Đây là thoại sân khấu,
chưa có âm thanh định vị theo từng vị trí khán giả. Không thể cưỡng chế dừng một
WebRTC peer đã bị người dùng sửa client; chưa dùng mic cho môi trường cần kiểm duyệt nghiêm ngặt.

## Kỹ thuật và vận hành

Ứng dụng Django `confession`, bảng `ConfessionRoom`, API vào phòng chung `/api/confession/enter/` (hàng DB duy nhất `PUBLIC`),
WebSocket `/ws/confession/rooms/{code}/`. Token ghế chỉ cấp cho chủ ghế.
Các mutation khóa hàng DB, giờ tuyệt đối trên máy chủ, từ chối phiếu trễ/sai lượt.
Client gộp phản ứng mỗi 500ms, tối đa 4 biểu cảm/batch, máy chủ giới hạn tần suất.
Mỗi room/process xuất snapshot mỗi 500ms, tối đa 60 hiệu ứng giữ 2s;
renderer dùng 24 projectile tái sử dụng, không rigidbody, vẽ tối đa 30 FPS.
Giới hạn client batching không có nghĩa chỉ có 1–2 request/s toàn phòng:
100 người bấm liên tục vẫn có thể gửi khoảng 200 batch/s.
Nhiều ASGI worker cần Redis như hai game cũ. Mỗi worker hiện có publisher riêng;
production lớn nên đưa publisher và tick vào một room coordinator duy nhất.
Chưa benchmark tải 100 máy, chưa có bot, bộ lọc nội dung tự do, báo cáo/kick hay hệ thống tài khoản.
Phòng chung chưa có công cụ báo cáo/kick hoặc kiểm duyệt nội dung tự do; cần bổ sung trước khi mở rộng cho cộng đồng không có người giám sát.

## Kiểm tra

`python manage.py test confession --noinput` với database thử nghiệm SQLite.
`npm --prefix frontend run build` kiểm tra TypeScript và build chung cả ba game.
Tests bao phủ deadline, draft riêng, 150 chữ, một phiếu, hòa, chống tự bầu,
phiếu hết hạn, nhẹ tay, FIFO, giới hạn 100 ghế và đường WebSocket thật.
