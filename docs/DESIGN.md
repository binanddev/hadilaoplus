# Phạm vi bản đầu

## Kỹ thuật

Máy chủ quyết định vàng, bài, lượt, kết quả xúc xắc và vương miện. Hiệu ứng trên trình duyệt
chỉ minh họa kết quả. Bài của đối thủ không được gửi trong dữ liệu công khai.
Mỗi yêu cầu có mã hành động để tránh xử lý lặp; trạng thái có phiên bản tăng dần.
Trạng thái ván lưu trong SQLite. Khi dùng Redis/Valkey, nó chỉ truyền thông báo,
không phải nguồn dữ liệu chính.

SQLite và channel layer trong bộ nhớ phục vụ chạy một tiến trình, cả local lẫn Render.
Neon và Redis là lựa chọn mở rộng qua biến môi trường, không bắt buộc cho nhóm bạn.
Đây là bản game nhóm bạn; chưa có tài khoản, bảng xếp hạng, chat, thoại, bot hoặc phục hồi
đáng tin cậy qua mọi sự cố. Không có đồng bộ mô phỏng vật lý giữa các máy.

## Trình tự lượt và đổi vua

Mỗi vòng chốt các vị trí ghế, bắt đầu ở Vua, luân phiên hướng thuận/ngược theo vòng.
Mỗi ghế có một lượt chính. Vua có 3 hành động (bàn 4 người là 2), Quý tộc có 2.
Tay bài nền 8 lá; rút bù cuối lượt, chia riêng bộ Vua/Quý tộc theo 99 lá in.
Đổi Vua đổi ghế và toàn bộ tay bài; kết thúc lượt ghế sau khi giải quyết hết phản hồi,
không tạo lượt miễn phí. Các nhánh lựa chọn, phản ứng và hiệu ứng có thời hạn xử lý trên máy chủ.
Đổi vua ngay sau khi áp dụng trọn vẹn một hiệu ứng nhiều mục tiêu.
Kết quả không phụ thuộc vào thứ tự cập nhật từng nạn nhân.

## Giao dịch

Chuyển vàng là hành động tức thời. Đổi bài là một đề nghị cần chấp nhận;
máy chủ kiểm tra lại quyền sở hữu và số dư khi chấp nhận.
Không tiết lộ toàn bộ tay bài đối thủ trừ hiệu ứng cho phép xem riêng. Đổi bài một lấy một,
người nhận chọn lá trả; giới hạn tổng vàng nhận 400 mỗi phiên. Bỏ bài theo giao kèo cần xác nhận.
Giao kèo về hành động vòng sau không được máy chủ cưỡng chế.

## Thử thách xã hội

Loyal Dog, Royal Parrot và các thử thách xã hội dùng tự xác nhận; chỉ phạt nếu thẻ quy định.
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

## Bản đồ mở rộng

`maps.ts` mô tả bốn lựa chọn; `worlds.ts` dựng ba cảnh ngoài trời mới.
`settings.map_id` lưu cùng phòng, chỉ chủ phòng đổi trước ván; không tác động bộ luật.
Hai bản đồ ban ngày là Đảo Hải Âu và Vườn Lâu Đài; Tu Viện Trăng là bản đồ đêm.
Kiến trúc có ghép lô tĩnh; trang phục khớp nối dùng ghép lô động để giảm số lượt vẽ.
Động vật, cờ, nước và hạt chạy tại máy người chơi. Chế độ nhẹ giữ chúng ở tư thế tĩnh.
Vật liệu và texture được giải phóng trước thiết bị đồ họa khi đổi bản đồ.
`characterDetail.ts` bổ sung hình học lên khung nhân vật đang có; không tải mô hình,
âm thanh hoặc ảnh từ bên ngoài. Vẫn giữ tối đa tám ghế và thông tin bài kín.

Kiểm tra ngoại tuyến cảnh thật qua NullGraphicsDevice: dựng ba bản đồ, ghép lô,
chạy hoạt ảnh ở nhiều mốc thời gian, kiểm tra tọa độ hữu hạn và chế độ nhẹ.
Đây không phải phép đo FPS hay kiểm tra ảnh chụp trên GPU trình duyệt.

## Kết nối khi phát triển

Đóng tab hoặc thoát game tạo WSDISCONNECT là bình thường. Lỗi proxy ECONNABORTED chỉ cho biết
socket bị ngắt lúc đang ghi; không đủ để kết luận backend hỏng.
Frontend trì hoãn mở socket tới sau lượt khởi tạo React, tránh socket tạm bị hủy
trong StrictMode; khi rời phòng sẽ hủy lịch thử lại và bỏ qua callback của phiên cũ.
Các tình huống này được kiểm tra bằng socket giả, không cần chạy server:
`node --test tests/roomConnection.test.mjs` trong frontend.
