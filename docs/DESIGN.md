# Phạm vi bản đầu

## Kỹ thuật

Máy chủ quyết định vàng, bài, lượt, kết quả xúc xắc và vương miện. Hiệu ứng trên trình duyệt
chỉ minh họa kết quả. Bài của đối thủ không được gửi trong dữ liệu công khai.
Mỗi yêu cầu có mã hành động để tránh xử lý lặp; trạng thái có phiên bản tăng dần.
Trạng thái ván lưu trong database. Redis/Valkey truyền thông báo, không phải nguồn dữ liệu chính.

SQLite và channel layer trong bộ nhớ phục vụ chạy local một tiến trình.
Neon và Redis được cấu hình bằng biến môi trường cho Render.
Đây là bản game nhóm bạn; chưa có tài khoản, bảng xếp hạng, chat, thoại, bot hoặc phục hồi
đáng tin cậy qua mọi sự cố. Không có đồng bộ mô phỏng vật lý giữa các máy.

## Trình tự lượt và đổi vua

Mỗi vòng chốt danh sách lượt theo ghế, bắt đầu ở vua đầu vòng.
Một người chỉ có một lượt chính trong vòng. Vua lúc bắt đầu lượt có 3 hành động,
người khác 2. Mỗi lá tính một hành động; có thể kết thúc sớm.
Đổi vua ngay sau khi áp dụng trọn vẹn một hiệu ứng nhiều mục tiêu.
Kết quả không phụ thuộc vào thứ tự cập nhật từng nạn nhân.

## Giao dịch

Chuyển vàng là hành động tức thời. Đổi bài là một đề nghị cần chấp nhận;
máy chủ kiểm tra lại quyền sở hữu và số dư khi chấp nhận.
Không tiết lộ toàn bộ tay bài của đối thủ. Đề nghị đổi lấy bài ngẫu nhiên là lựa chọn
đơn giản cho bản đầu. Giao kèo về hành động vòng sau không được máy chủ cưỡng chế.

## Thử thách xã hội

Loyal Dog và Royal Parrot dùng tự xác nhận hoặc chịu phạt.
Không có microphone, nhận diện giọng nói hoặc xác minh người chơi thực sự đọc câu thoại.
Nhóm tự gọi nhau qua ứng dụng riêng.

## Mỹ thuật

Căn phòng, đồ đạc, bàn, nhân vật ngồi, bài úp của đối thủ, tiền và vương miện là cảnh
PlayCanvas 3D theo phong cách low-poly. Góc nhìn theo ghế người chơi; bài đối thủ chỉ hiện mặt lưng.
Giao diện React 2D nằm ở các mép màn hình: danh sách bên trái, quản lý và thương lượng
bên phải, tay bài và thao tác lượt phía dưới. Khoảng giữa ưu tiên quan sát cảnh 3D.
Tên/vàng gắn gần nhân vật để chọn mục tiêu; danh sách bên trái cũng hỗ trợ chọn và thả bài.
Đây chưa phải bộ tài nguyên mỹ thuật hoàn thiện; nhân vật được dựng từ hình học,
chưa có mô hình nhân vật có xương hoạt ảnh. Các cử động là hoạt ảnh thủ tục.

## Nhân vật, ánh lửa và âm thanh

Sáu lựa chọn ngoại hình: regent, rogue, scholar, knight, merchant, jester.
Người chơi chọn trước khi tạo/vào phòng hoặc đổi trong phòng chờ. Ngoại hình không thêm
đặc quyền hay làm thay đổi vàng/bài. Phòng cũ chưa lưu ngoại hình dùng regent.
Ánh sáng giảm cường độ, tông hổ phách, có biến thiên lửa/nến. Tone mapping giữ chi tiết mặt bàn.
Nhân vật có cử động theo lượt, ra bài và phản ứng; ghế vua có trang trí ngai vàng.
Âm thanh tổng hợp bằng Web Audio: chỉ hiệu ứng ngắn khi có sự kiện mới, không nhạc nền
hoặc tiếng lửa lặp. Có nút tắt/bật và tuân theo việc mở khóa âm thanh bằng thao tác người dùng.

## Kết nối khi phát triển

Đóng tab hoặc thoát game tạo WSDISCONNECT là bình thường. Lỗi proxy ECONNABORTED chỉ cho biết
socket bị ngắt lúc đang ghi; không đủ để kết luận backend hỏng.
Frontend trì hoãn mở socket tới sau lượt khởi tạo React, tránh socket tạm bị hủy
trong StrictMode; khi rời phòng sẽ hủy lịch thử lại và bỏ qua callback của phiên cũ.
Các tình huống này được kiểm tra bằng socket giả, không cần chạy server:
`node --test tests/roomConnection.test.mjs` trong frontend.
