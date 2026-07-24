# Handoff: Omnilogin Automation cho Khải Hoàn Derma

## 1. Mục tiêu hệ thống

Workspace: `C:\Codex`

Hệ thống dùng `@omnilogin/sdk` và profile Omnilogin chạy trình duyệt có giao diện, không dùng headless. Telegram Bot là giao diện điều khiển các workflow.

Các workflow đang vận hành:

1. **Nuôi Profile / Warmup**
   - App: `profile-warmup-random`
   - Chạy profile 37-66 theo hàng đợi.
   - Lướt Google, báo, YouTube và website ngẫu nhiên để duy trì profile.

2. **Khai Hoan Derma Rank QA**
   - App: `khaihoan-derma-rank-qa`
   - Đồng bộ từ khóa GSC định kỳ một tuần.
   - Ưu tiên từ khóa có lượt hiển thị cao nhưng lượt nhấp thấp.
   - Tìm Google, mở đúng kết quả `khaihoanderma.com`, sau đó kiểm tra trang sản phẩm, ảnh, sản phẩm tương tự và internal link.

3. **Facebook Referral QA**
   - App/alias Telegram: `fb`
   - File workflow: `exports/facebook-traffic-derma.js`
   - Lướt Facebook Feed, vào Fanpage Khải Hoàn Derma, chọn bài đăng, mở nội dung, nhấp đúng link sản phẩm Derma và tương tác trên website.

## 2. Luồng Facebook Referral QA bắt buộc

Luồng mong muốn hiện tại:

1. Mở Facebook Feed bằng profile Omnilogin và cuộn liên tục khoảng 1-2 phút.
2. Mở Fanpage `https://www.facebook.com/KhaiHoanDerma/`.
3. Bốc ngẫu nhiên vị trí từ 1 đến 10.
4. Bộ đếm chỉ tính các bài đăng thật của Fanpage đang có nút `Xem thêm`.
5. Khi tới bài được chọn:
   - Giữ trực tiếp phần tử DOM của bài và gắn `data-omni-fb-selected-post`.
   - Cuộn phần nội dung bài lên vùng nhìn thấy.
   - Bấm đúng nút `Xem thêm` nằm trong bài đó.
   - Chỉ tiếp tục khi link màu xanh có domain `khaihoanderma.com` xuất hiện trong nội dung bài.
6. Nhấp đúng link sản phẩm vừa lấy từ bài Facebook.
7. Chỉ giữ một tab website Derma:
   - Nếu click mở trong tab hiện tại: tiếp tục tab đó.
   - Nếu Facebook tạo tab mới đúng sản phẩm: giữ tab sản phẩm, đóng tab Facebook cũ.
   - Nếu Facebook nuốt sự kiện click: mở URL đã trích xuất trong tab hiện tại.
   - Phương án cuối: tạo tab sản phẩm thay thế rồi đóng tab Facebook cũ.
8. Xác minh website đang ở đúng domain và đúng trang sản phẩm.
9. Tương tác trên website khoảng 30-60 giây:
   - Cuộn đọc nội dung sản phẩm.
   - Xem ảnh sản phẩm.
   - Mở phần mô tả/đánh giá khi có.
   - Nhấp một sản phẩm tương tự hoặc internal link hợp lệ.
   - Không đi vào đăng nhập, giỏ hàng hoặc thanh toán.

## 3. File quan trọng

- Workflow Facebook:
  - `C:\Codex\exports\facebook-traffic-derma.js`
  - `C:\Codex\exports\facebook-traffic-derma.aiapp.json`
- Workflow Rank QA:
  - `C:\Codex\exports\khaihoan-derma-rank-qa.js`
  - `C:\Codex\exports\khaihoan-derma-rank-qa.aiapp.json`
- Workflow nuôi profile:
  - `C:\Codex\exports\profile-warmup-random.js`
  - `C:\Codex\exports\profile-warmup-random.aiapp.json`
- Telegram Bot:
  - `C:\Codex\src\telegram-bot.ts`
  - `C:\Codex\dist\telegram-bot.js`
  - `C:\Codex\scripts\start-telegram-bot.ps1`
- GSC:
  - `C:\Codex\src\gsc.ts`
  - `C:\Codex\src\gsc-auth.ts`
  - `C:\Codex\src\sync-gsc-keywords.ts`
- Cấu hình:
  - `C:\Codex\.env`
  - `C:\Codex\.env.example`

Không ghi token Telegram, OAuth secret, mật khẩu Gmail hoặc proxy key vào tài liệu hay commit.

## 4. Các lỗi Facebook đã gặp

### `FB_POST_COUNT_REQUIRED` / `FB_TARGET_POST_NOT_REACHED`

Nguyên nhân: Facebook dùng DOM ảo, các bài cũ bị tháo khỏi DOM khi cuộn. Bộ đếm cũ phụ thuộc cấu trúc card không ổn định.

Hiện tại `collectPageArticles()`:

- Tìm nút phản ứng `Thích`/`Like`.
- Đi ngược lên card bài đăng.
- Chỉ nhận card của Khải Hoàn Derma có nút `Xem thêm`.
- Gắn `data-omni-fb-post-key`.
- Báo bộ đếm trực tiếp về Telegram.

### `FB_SEE_MORE_REQUIRED`

Nguyên nhân: bài được chọn bị Facebook render lại; khóa được tạo từ text có thể thay đổi hoặc locator cũ bị mất.

Sửa gần nhất:

- `positionSelectedPostContent()` nhận thêm `fallbackPost`.
- Gắn `data-omni-fb-selected-post` ngay khi chọn bài.
- Ưu tiên chính phần tử đã chọn thay vì quét lại bằng text hash.
- Nếu bài vẫn bị mất, chọn ngẫu nhiên tối đa ba bài khác đang có `Xem thêm` và tiếp tục.

### `FB_DERMA_LINK_REQUIRED`

Nguyên nhân: quét tất cả link trên trang có thể chọn nhầm link website ở cột giới thiệu, hoặc quét từng anchor qua bridge quá chậm.

Hiện tại `findSelectedPostWebsiteLink()`:

- Quét DOM trong một lần.
- Ưu tiên link trong bài có marker.
- Chấp nhận link trực tiếp và link bọc bởi `l.facebook.com/l.php?u=...`.
- Chỉ nhận hostname chính xác `khaihoanderma.com`/`www.khaihoanderma.com`.
- Bắt buộc URL có path sản phẩm, không lấy homepage.
- Loại link ở cột trái bằng vị trí viewport.

### `FB_REFERRAL_REQUIRED`

Nguyên nhân: đã tìm đúng link nhưng Facebook có thể:

- Nuốt click.
- Mở link trong tab mới.
- Chuyển focus sang tab khác.
- Code cũ đóng nhầm tab sản phẩm vừa mở rồi quay lại tab Facebook.

Sửa mới nhất trong `clickAnchorInCurrentTab()`:

- Click thật theo bounding box của link.
- Poll danh sách tab và URL.
- Nếu có tab mới đúng sản phẩm, giữ tab đó và đóng tab Facebook cũ.
- Nếu chưa chuyển trang, đóng các tab rác do click tạo ra, đưa tab Facebook cũ lên trước và gọi `page.goto()` với URL đã trích xuất.
- Nếu vẫn thất bại, tạo tab sản phẩm thay thế, đưa tab đó lên trước và đóng tab Facebook.

### `DERMA_RELATED_REQUIRED`

Nguyên nhân: website đã render khối `.related-products-wrapper`, nhưng các link sản phẩm nằm dưới viewport. Code cũ gọi `isVisible()` trước khi cuộn tới khối nên loại bỏ toàn bộ link và báo không tìm thấy sản phẩm tương tự.

Sửa mới nhất trong `findInternalLink()`:

- Nhận diện trực tiếp `.related.related-products-wrapper` và `.related-products-wrapper`.
- Cuộn khối sản phẩm tương tự vào viewport trước khi lấy link.
- Không loại link sản phẩm chỉ vì nó đang nằm ngoài vùng nhìn tại thời điểm quét.
- Chuẩn hóa và loại trùng URL.
- Chỉ nhận URL cùng domain có path `/product/` hoặc `/san-pham/`.
- Sau khi mở vẫn gọi `verifyTargetPage()` để xác minh đúng trang sản phẩm.

## 5. Trạng thái kiểm tra hiện tại

- `npm run build`: đạt.
- JavaScript workflow: parse thành công bằng `AsyncFunction`.
- Nội dung `facebook-traffic-derma.js` và trường `script` trong manifest JSON: đã đồng bộ.
- E2E profile 37 sau thay đổi cuối: **đạt** vào ngày 24/07/2026.
- Lần E2E thành công đã xác nhận:
  - Warmup Facebook 97 giây với 61 lượt cuộn.
  - Bốc ngẫu nhiên bài `6/10` và bộ đếm đạt đủ `6/6`.
  - Bấm được `Xem thêm` và tìm đúng link sản phẩm trong bài.
  - Mở cùng tab và xác minh sản phẩm `GSV Goesing Isotretinoin 10mg`.
  - Cuộn nội dung, xem ảnh sản phẩm.
  - Mở và xác minh sản phẩm tương tự `Faroson Glutamax 1000`.
  - `visitedPagesCount: 2`, `relatedClicked: true`, `galleryChecked: true`.
  - Kết thúc với `E2E_RESULT=SUCCESS`.

Nếu Facebook đổi DOM trong tương lai, chỉ coi lần chạy là thành công khi có đủ `fb_link_found`, `web_audit_start`, `web_related_opened` và `web_audit_done`.

## 6. Quy trình sửa và kiểm tra

Sau mỗi lần sửa `exports/facebook-traffic-derma.js`:

```powershell
Set-Location C:\Codex

node -e "const fs=require('fs'); const p='exports/facebook-traffic-derma.aiapp.json'; const j=JSON.parse(fs.readFileSync(p,'utf8')); j.script=fs.readFileSync('exports/facebook-traffic-derma.js','utf8'); fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n','utf8');"

npm run build

node -e "const fs=require('fs'); const src=fs.readFileSync('exports/facebook-traffic-derma.js','utf8'); const app=JSON.parse(fs.readFileSync('exports/facebook-traffic-derma.aiapp.json','utf8')); if(src!==app.script) throw new Error('manifest mismatch'); new (Object.getPrototypeOf(async function(){}).constructor)('page','omni','__params',src); console.log('OK');"
```

Khởi động lại đúng tiến trình Telegram Bot, không dừng toàn bộ tiến trình Node trên máy:

```powershell
Set-Location C:\Codex
$botPath = (Resolve-Path 'dist\telegram-bot.js').Path
$running = Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -and $_.CommandLine.Contains($botPath) }
foreach ($process in $running) {
  Stop-Process -Id $process.ProcessId -Force
}
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-telegram-bot.ps1
```

## 7. Cách chạy kiểm tra

Trên Telegram:

- Nhấn `Chạy Facebook Referral QA (Profile 37)`.
- Hoặc dùng alias/lệnh `fb` theo cú pháp bot hiện tại.

Theo dõi các trạng thái:

- `fb_post_counter`
- `fb_target_reached`
- `fb_positioning_post`
- `fb_see_more_clicking`
- `fb_see_more_opened`
- `fb_target_link_clicking`
- `fb_target_link_fallback`
- `web_audit_start`
- `web_audit_reading`
- `web_related_clicking`
- `web_related_opened`
- `web_audit_done`

Kết quả chỉ được xem là thành công khi URL trình duyệt đã sang đúng sản phẩm Derma, mở được một sản phẩm tương tự và có `web_audit_done`.

## 8. Lưu ý SDK Omnilogin

- Dùng `page.browser.pages()`, `bringToFront()`, `closePage()` và `newPage()`.
- Không dùng `page.context()` vì bridge Omnilogin không hỗ trợ như Playwright đầy đủ.
- Ưu tiên locator và mouse/keyboard thật.
- Chỉ dùng `evaluate()` để đọc/gắn marker DOM khi SDK không đủ khả năng.
- Không dùng headless khi debug.
- Facebook thay DOM thường xuyên; luôn kiểm tra hậu điều kiện sau click, không dựa vào việc lệnh click không ném lỗi.

## 9. Git

Các commit gần nhất liên quan:

- `f12b677` - xác nhận thao tác mở `Xem thêm`.
- `03cd3f9` - bảo đảm điều hướng referral cùng tab.
- `3d921a3` - giữ bài Facebook đã chọn qua các lần render lại.

Thay đổi mới nhất đã xử lý cả điều hướng referral bị Facebook tháo DOM và việc nhận diện sản phẩm tương tự nằm ngoài viewport. Khi sửa tiếp, luôn đồng bộ lại `.aiapp.json`, build, chạy E2E profile 37 và khởi động lại đúng tiến trình Telegram Bot.
