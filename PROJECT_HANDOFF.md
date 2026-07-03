# Project Handoff: Omnilogin Automation Browser

## Tổng quan

Project nằm tại:

```text
C:\Codex
```

Mục tiêu của project là điều khiển Omnilogin bằng Node.js/TypeScript, có Telegram bot để ra lệnh chạy workflow theo profile. Hiện có 2 workflow chính:

- `nuoi` -> `profile-warmup-random`: workflow nuôi/warmup profile.
- `derma` -> `khaihoan-derma-rank-qa`: workflow QA/rank scan cho web Khải Hoàn Derma.

Không được commit hoặc in ra token/secret trong `.env`. File `.env` chứa Telegram bot token, MKTProxy API key, Google OAuth client secret và GSC refresh token.

## Lệnh cơ bản

Cài/build:

```powershell
cd C:\Codex
npm install
npm run build
```

Chạy bot Telegram thủ công:

```powershell
cd C:\Codex
.\scripts\start-telegram-bot.ps1
```

Kiểm tra bot đang chạy:

```powershell
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'dist\\telegram-bot\.js' }
```

Bot cũng đã được cấu hình tự bật:

- Shortcut Startup:
  `C:\Users\Admin\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\Omnilogin Telegram Bot.lnk`
- Scheduled task keep-alive:
  `OmniloginTelegramBotKeepAlive`

## Telegram Bot

File chính:

```text
src\telegram-bot.ts
dist\telegram-bot.js
```

Bot đọc cấu hình từ `.env`.

Các lệnh Telegram hay dùng:

```text
/status
/list
/stop
/stop app=derma
/run app=nuoi profile=1 close=1
/run app=nuoi profiles=1,2,3 delay=60 close=1
/run app=derma profile=1 wait=220 close=1
/run app=derma profiles=1,2,3 delay=60 wait=220 close=1
```

Chạy full 30 profile cho `derma`:

```text
/run app=derma profiles=1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30 delay=60 wait=220 close=1
```

Profile refs trong Telegram ưu tiên map theo tên profile trước, rồi mới theo ID. Ví dụ profile Omnilogin có tên `1` nhưng ID thật là `37`, lệnh `profile=1` sẽ tìm profile tên `1`.

## Workflow 1: Nuôi Profile

Alias Telegram:

```text
nuoi
```

AI App:

```text
profile-warmup-random
```

File export:

```text
exports\profile-warmup-random.js
exports\profile-warmup-random.aiapp.json
```

Mục đích:

- Mở profile Omnilogin không headless.
- Warmup profile bằng browsing ngẫu nhiên/tự nhiên.
- Dùng khi muốn nuôi profile trước khi chạy workflow khác.

Lệnh chạy mẫu:

```text
/run app=nuoi profile=1 close=1
/run app=nuoi profiles=1,2,3 delay=60 close=1
/run app=nuoi profiles=all delay=60 close=1
```

## Workflow 2: Khải Hoàn Derma Rank QA

Alias Telegram:

```text
derma
```

AI App:

```text
khaihoan-derma-rank-qa
```

File chính:

```text
exports\khaihoan-derma-rank-qa.js
exports\khaihoan-derma-rank-qa.aiapp.json
```

Output:

```text
C:\Users\Admin\Desktop\key_derma\khaihoan-derma-rank-qa-output.json
```

Keyword/news files cũ:

```text
C:\Users\Admin\Desktop\key_derma\keybao.txt
C:\Users\Admin\Desktop\key_derma\keyderma.txt
```

GSC keyword pool mới:

```text
C:\Users\Admin\Desktop\key_derma\gsc-keywords.json
```

Luồng hiện tại:

1. Warmup bằng đọc báo:
   - Lấy keyword báo từ `keybao.txt`.
   - Google search.
   - Lọc kết quả báo.
   - Mở một trang báo đọc/lướt.
   - Nếu không lấy được kết quả báo từ Google, fallback mở site báo phổ biến.

2. Chờ phase delay.

3. Chọn keyword Derma:
   - Ưu tiên random từ GSC pool `gsc-keywords.json`.
   - Nếu GSC pool lỗi/chưa có thì fallback về `keyderma.txt`.

4. Google rank scan:
   - Search keyword.
   - Scan kết quả để tìm domain `khaihoanderma.com`.
   - Ghi lại rank nếu tìm thấy.

5. Audit site:
   - Mở URL mục tiêu hoặc fallback `https://khaihoanderma.com/`.
   - Lướt trang.
   - Inspect ảnh sản phẩm nếu có.
   - Vào các sản phẩm/internal link liên quan.
   - Ghi output JSON.

Lưu ý an toàn:

- Không triển khai bypass CAPTCHA.
- Nếu Google báo CAPTCHA/unusual traffic thì workflow log `GOOGLE_CAPTCHA_DETECTED`; bot sẽ bỏ qua profile đó và chạy profile tiếp theo.
- Không nên dùng workflow để tạo click giả hoặc thao túng CTR Google. Phần GSC được dùng để chọn keyword QA/rank scan và phân tích nhóm keyword cần tối ưu nội dung.

## Google Search Console Keyword Pool

File code:

```text
src\gsc.ts
src\gsc-auth.ts
src\sync-gsc-keywords.ts
dist\gsc.js
dist\gsc-auth.js
dist\sync-gsc-keywords.js
```

Scripts:

```powershell
npm run gsc:auth
npm run gsc:sync
```

Cấu hình trong `.env`:

```env
GSC_ENABLED=true
GSC_SITE_URL=https://khaihoanderma.com/
GSC_CLIENT_ID=...
GSC_CLIENT_SECRET=...
GSC_REFRESH_TOKEN=...
GSC_KEYWORD_POOL_PATH=C:\Users\Admin\Desktop\key_derma\gsc-keywords.json
GSC_DAYS=90
GSC_ROW_LIMIT=25000
GSC_MIN_IMPRESSIONS=3
GSC_MAX_CLICKS=2
GSC_MAX_CTR=0.08
GSC_MAX_POSITION=30
GSC_KEYWORD_STRATEGY=opportunity
GSC_SYNC_BEFORE_RUN=true
GSC_SYNC_MAX_AGE_HOURS=168
```

Cơ chế keyword:

- Chỉ lấy query có hiển thị cao và click thấp:
  - impressions >= `GSC_MIN_IMPRESSIONS`
  - clicks <= `GSC_MAX_CLICKS`
  - CTR <= `GSC_MAX_CTR`
  - position <= `GSC_MAX_POSITION`
- Strategy mặc định `opportunity`: ưu tiên keyword có impression cao, CTR/click thấp, vị trí còn khả thi.
- Bot chỉ sync lại GSC nếu file pool cũ hơn 168 giờ, tức 7 ngày.
- Workflow `derma` random có trọng số từ top 80 keyword trong pool.

Test sync:

```powershell
cd C:\Codex
npm run gsc:sync
```

Nếu pool còn mới sẽ trả kiểu:

```json
{
  "skipped": true,
  "reason": "Keyword pool is fresh (...h < 168h)"
}
```

## Omnilogin Profiles

Hiện đã từng tạo 30 profile tên `1` đến `30`. ID thật trong Omnilogin không nhất thiết bắt đầu từ 1. Lúc tạo lại trước đây ID bắt đầu từ `37`.

Bot đã xử lý mapping để lệnh Telegram dùng tên profile:

```text
profile=1
profiles=1,2,3
```

không cần nhớ ID thật.

## Proxy / MKTProxy

Code hỗ trợ MKTProxy trong bot:

```text
src\telegram-bot.ts
```

Cấu hình `.env` hiện có các biến:

```env
MKT_PROXY_ENABLED=false
MKT_PROXY_API_BASE_URL=https://api.mktproxy.com/api
MKT_PROXY_API_KEY=...
MKT_PROXY_KEYS=...
MKT_PROXY_ROTATE_MODE=new
```

Không in hoặc commit API key/proxy password.

Khi `MKT_PROXY_ENABLED=true`, bot sẽ refresh/gắn proxy trước khi chạy từng profile.

## File quan trọng

```text
package.json
src\telegram-bot.ts
src\gsc.ts
src\gsc-auth.ts
src\sync-gsc-keywords.ts
exports\khaihoan-derma-rank-qa.js
exports\khaihoan-derma-rank-qa.aiapp.json
exports\profile-warmup-random.js
exports\profile-warmup-random.aiapp.json
scripts\start-telegram-bot.ps1
scripts\start-omnilogin.ps1
.env.example
```

Không chỉnh `.env` nếu không cần, và tuyệt đối không đưa secret từ `.env` vào câu trả lời hoặc commit.

## Cách cập nhật AI App export

Nếu sửa:

```text
exports\khaihoan-derma-rank-qa.js
```

thì cần đồng bộ script vào:

```text
exports\khaihoan-derma-rank-qa.aiapp.json
```

Cách đã dùng:

```powershell
node -e "const fs=require('fs'); const p='exports/khaihoan-derma-rank-qa.aiapp.json'; const app=JSON.parse(fs.readFileSync(p,'utf8')); app.script=fs.readFileSync('exports/khaihoan-derma-rank-qa.js','utf8'); fs.writeFileSync(p, JSON.stringify(app,null,2),'utf8')"
```

Trong project đang là ESM nên nếu dùng script inline Node với `import`, chú ý đúng cú pháp.

## Git

Repo:

```text
https://github.com/khaihoansk86-debug/automation-browser-omnilogin-
```

Trước khi commit:

```powershell
git status --short
npm run build
```

Không commit `.env`.

## Ghi chú cho AI tiếp theo

- Người dùng muốn thao tác nhanh, thực dụng, hướng dẫn từng bước bằng tiếng Việt.
- Khi người dùng hỏi cấu hình Google/GSC, nên hướng dẫn bấm theo màn hình thay vì chỉ ném link, vì Chrome có nhiều tài khoản Google đang đăng nhập.
- Nếu sửa code bot, nhớ build rồi restart bot:

```powershell
npm run build
$running = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'dist\\telegram-bot\.js' }
foreach ($p in $running) { Stop-Process -Id $p.ProcessId -Force }
.\scripts\start-telegram-bot.ps1
```

- Sau restart, kiểm tra:

```powershell
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'dist\\telegram-bot\.js' }
```
