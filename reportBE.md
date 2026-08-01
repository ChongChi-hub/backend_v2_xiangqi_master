# Báo cáo Triển khai Backend - Hệ thống Cờ Tướng Thông minh (Bản Hoàn chỉnh)

## 1. Tổng quan Kiến trúc

Backend được xây dựng theo chuẩn công nghiệp, đáp ứng hoàn toàn các yêu cầu khắt khe của hệ thống cờ tướng thời gian thực:
- **Runtime**: Node.js (TypeScript) cung cấp hiệu năng cao và Type-safe.
- **RESTful API (Express)**: Xử lý mượt mà các luồng không trạng thái (Xác thực, Thống kê, Thông tin cá nhân).
- **WebSockets (Socket.io)**: Xử lý luồng dữ liệu thời gian thực độ trễ thấp (Tìm trận, Gửi nhận nước đi).
- **Database (MySQL + Prisma)**: Đảm bảo ACID, hỗ trợ truy vấn mạnh mẽ.
- **Bảo mật (JWT & Bcrypt)**: Mã hóa mật khẩu một chiều, bảo vệ các endpoint và phiên kết nối.

## 2. Các Modules Đã Hoàn thiện (100%)

### 2.1 Hệ thống Cơ sở dữ liệu (MySQL & Prisma)
- Thiết kế Schema tối ưu với 4 bảng: `users`, `matches`, `moves`, `rooms`.
- Tự động sinh kiểu dữ liệu (Typings) cho TypeScript, loại bỏ hoàn toàn các lỗi sai sót trường dữ liệu.

### 2.2 REST API Core
Danh sách toàn bộ các REST API endpoints:
- **System**:
  - `GET /api/health`: Kiểm tra trạng thái máy chủ.
- **Authentication**: 
  - `POST /api/v1/auth/login`: Đăng nhập, cấp phát JWT Token.
  - `POST /api/v1/auth/register`: Đăng ký tài khoản mới.
- **User Management**: 
  - `GET /api/v1/users/profile`: Lấy thông tin cá nhân (yêu cầu JWT).
  - `GET /api/v1/users/leaderboard`: Truy xuất bảng xếp hạng động dựa trên điểm ELO.
- **AI Integration**:
  - `POST /api/v1/engine/move`: Xử lý đầu vào FEN, gọi service AI để lấy nước đi tiếp theo.
  - `POST /api/v1/engine/hint`: Phân tích thế cờ hiện tại, gợi ý nước đi.
  - `POST /api/v1/engine/validate`: Chống gian lận (Anti-cheat logic), kiểm tra tính hợp lệ của nước đi.

### 2.3 Real-time Engine (Socket.io)
Chi tiết các sự kiện (events) giao tiếp qua Socket.io:
- **Matchmaking & Room Events (Hệ thống tìm trận)**: 
  - *Client Emits (Gửi từ Client):*
    - `join_room(roomId)`: Tham gia vào một phòng.
    - `leave_room(roomId)`: Rời khỏi một phòng.
    - `find_match`: Đăng ký tìm trận, đưa vào hàng đợi đơn giản.
    - `cancel_find_match`: Hủy tìm trận.
  - *Server Emits (Gửi từ Server):*
    - `user_joined`, `user_left`: Thông báo người chơi vào/ra phòng.
    - `match_found`: Tự động gom nhóm 2 người chơi, khởi tạo Record trận đấu và trả về `matchId`, `FEN`.
- **Game Logic Events (Xử lý trận đấu)**:
  - *Client Emits (Gửi từ Client):*
    - `make_move`: Đồng bộ nước cờ (gồm `matchId`, `fen`, `moveStr`, `timeCost`). Lưu lịch sử vào Database phục vụ Replay sau này.
    - `resign` (Nhận thua): Ngay lập tức kết thúc trận, tính toán lại **ELO** (Winner +30, Loser -30) và cập nhật số trận thắng/thua trực tiếp vào MySQL.
  - *Server Emits (Gửi từ Server):*
    - `move_made`: Đồng bộ hóa sự kiện đi cờ trong tích tắc cho đối thủ.
    - `match_ended`: Thông báo kết thúc trận đấu.
    - `error`: Báo lỗi nếu trận không hợp lệ.

### 2.4 AI Engine Service (Mock)
- Service `ai.service.ts` được thiết kế theo mẫu Decorator, hiện tại giả lập độ trễ thuật toán Minimax (1.5s) và trả về dữ liệu mẫu. 
- Việc thiết kế độc lập giúp dễ dàng tráo đổi (Plug-and-play) với file thực thi `pikafish.exe` thật sau này thông qua giao thức I/O của Node.

## 3. Đánh giá Chất lượng Code (Code Audit)
- **Mô hình MVC biến thể**: Phân tách triệt để `Controllers` (xử lý Request), `Services` (Logic nghiệp vụ/AI), `Sockets` (Sự kiện Realtime), `Routes` (Định tuyến).
- **Clean Code & Khả năng mở rộng**: Mã nguồn dễ đọc, các Service hoạt động độc lập, không bị ràng buộc vòng (Circular Dependency). Hoàn toàn sẵn sàng để mở rộng thêm các tính năng như Chat toàn server, Tổ chức giải đấu (Tournaments).

## 4. Hướng dẫn sử dụng & Khởi chạy
Tại thư mục `backend`:
1. (Tùy chọn) Chạy `npx prisma studio` để xem trực quan Database trên trình duyệt.
2. Chạy lệnh `npm run dev` để khởi động máy chủ API tại `http://localhost:5000`. Hệ thống sẽ tự động giám sát file và reload mỗi khi có thay đổi mã nguồn.
