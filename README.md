# Hệ thống Tự động hóa Trình duyệt qua Omnilogin & Telegram Bot

Dự án này là hệ thống tự động hóa các tác vụ quản lý trình duyệt, SEO và tương tác web thông qua việc tích hợp SDK của **Omnilogin** và điều khiển trực tiếp qua **Bot Telegram**. Hệ thống hỗ trợ đắc lực cho các chiến dịch SEO, index URL, nuôi profile sạch và tăng tương tác sản phẩm.

---

## 🚀 Các Tính Năng Chính

### 1. 🤖 Điều khiển qua Bot Telegram & Menu Phím Tắt Nhanh
* Điều khiển mọi ứng dụng chạy ẩn trên máy chủ bằng các lệnh Telegram.
* Tích hợp bộ **Bàn phím nút bấm nhanh (Reply Keyboard Menu)** ngay dưới ô nhập tin nhắn:
  * `🚀 Chạy Index GSC (Profile 37)`: Tự động chạy hàng đợi lập chỉ mục GSC.
  * `🌱 Chạy Nuôi Profile (Profiles 37-66)`: Kích hoạt kịch bản tương tác ngẫu nhiên nuôi profile.
  * `📈 Chạy Rank QA (Profiles 37-66)`: Chạy kịch bản tìm kiếm và SEO sản phẩm.
  * `✍️ Đánh giá sản phẩm`: Gửi đánh giá tự động WooCommerce.
  * `📊 Xem trạng thái`: Kiểm tra tiến trình hoạt động hiện tại.
  * `🛑 Dừng kịch bản`: Dừng khẩn cấp tiến trình.

### 2. 🔍 Tự động lập chỉ mục Google Search Console (GSC Indexer)
* **Kéo thả File `.txt` qua Telegram:** Tự động tải, phân tích danh sách liên kết và lưu trữ tạm thời trên máy.
* **Xử lý trạng thái thông minh:** 
  * Tự động bỏ qua các URL đã index (báo xanh) để tiết kiệm thời gian.
  * Chờ và click đóng popup thành công/lỗi hạn ngạch (`Dismiss` / `Got it`) và click ra ngoài màn hình để giải phóng thanh tìm kiếm.
  * Tải lại trang GSC gốc trước mỗi URL để đảm bảo giao diện luôn sạch, không bị kẹt bởi cache AJAX.
* **Giãn cách an toàn (60s - 90s):** Nghỉ ngẫu nhiên giữa các phiên gửi yêu cầu index để tránh bị Google giới hạn hoặc chặn tài khoản.
* **Báo cáo & Gửi trả hàng đợi:** Tự động gửi lại file `.txt` chứa các link chưa index còn lại khi hết hạn ngạch ngày của Google, đồng thời tự động xóa sạch file rác trên máy tính chạy bot.

### 3. ✍️ Tự động đánh giá sản phẩm WooCommerce
* Quét danh sách sản phẩm từ trang mục tiêu.
* Mỗi profile trình duyệt chỉ thực hiện đánh giá tối đa **1 sản phẩm duy nhất** theo cơ chế phân bổ 1-1, tránh spam và trùng lặp tài khoản.

### 4. 🌱 Nuôi Profile & SEO Rank QA (`warmup` & `derma`)
* Kịch bản mô phỏng hành vi của người dùng thật (lướt trang, cuộn trang, click ngẫu nhiên, xem bài viết).
* Giúp tăng độ tin cậy (trust score) cho cookie và thông số vân tay trình duyệt của các profile.

---

## 🛠️ Cài đặt & Cấu hình

### 1. Yêu cầu hệ thống
* **Node.js** phiên bản 18 trở lên.
* Trình duyệt **Omnilogin** đang được cài đặt và mở cổng API mặc định (`http://localhost:35353`).
* Token Bot Telegram tạo từ `@BotFather`.

### 2. Cài đặt các thư viện phụ thuộc
Mở terminal tại thư mục gốc của dự án và chạy:
```bash
npm install
```

### 3. Thiết lập biến môi trường
Tạo tệp `.env` ở thư mục gốc của dự án dựa trên `.env.example`:
```ini
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_ALLOWED_CHAT_ID=your_chat_id_here
OMNILOGIN_HOST=http://localhost:35353
DEFAULT_APP_ID=index-url-khaihoanderma
CLOSE_PROFILE_AFTER_RUN=true
```

---

## 💻 Hướng dẫn vận hành

### 1. Biên dịch dự án (TypeScript)
Biên dịch các tệp TypeScript trong thư mục `src` sang JavaScript trong thư mục `dist`:
```bash
npm run build
```

### 2. Khởi chạy Bot Telegram
Để bot bắt đầu lắng nghe lệnh và file đính kèm:
```bash
node dist/telegram-bot.js
```
*(Bạn cũng có thể cấu hình thông qua PM2 hoặc Task Scheduler để bot chạy ngầm và tự khởi động lại khi máy tính restart).*

---

## 📋 Danh sách Lệnh điều khiển chính (Slash Commands)

* `/start` hoặc `/help`: Hiển thị hướng dẫn sử dụng và bộ nút bấm nhanh.
* `/list`: Liệt kê danh sách các kịch bản AI App khả dụng.
* `/status`: Kiểm tra trạng thái rảnh/bận của bot và chi tiết tiến độ profile đang chạy.
* `/stop`: Dừng ngay lập tức profile và ứng dụng đang chạy.
* `/run app=<tên_app> profiles=<dải_id>`: Khởi chạy thủ công app với dải profile tùy chọn.
  * Ví dụ: `/run app=index profile=37` hoặc `/run app=warmup profiles=37-66`

---

## 🗂️ Cấu trúc thư mục dự án

* `src/`: Thư mục chứa mã nguồn TypeScript.
  * [telegram-bot.ts](file:///C:/Codex/src/telegram-bot.ts): Quản lý logic nhận file, gửi báo cáo và xử lý lệnh từ Telegram.
  * [workflow.ts](file:///C:/Codex/src/workflow.ts): Quản lý các luồng nuôi profile và tương tác.
  * [auto-review.ts](file:///C:/Codex/src/auto-review.ts): Logic đánh giá sản phẩm tự động.
* `exports/`: Chứa các file kịch bản đóng gói để import vào app Omnilogin.
  * [index-url-khaihoanderma.js](file:///C:/Codex/exports/index-url-khaihoanderma.js): File kịch bản index chính chạy trên trình duyệt.
  * [index-url-khaihoanderma.aiapp.json](file:///C:/Codex/exports/index-url-khaihoanderma.aiapp.json): Manifest của ứng dụng index trên Omnilogin.
* `dist/`: Thư mục chứa code JavaScript sau khi được build.
