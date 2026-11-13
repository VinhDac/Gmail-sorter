# Inbox blocks: hướng dẫn tiếng Việt

Mở Gmail trên máy tính, trang chính được chia sẵn thành 5 khối:

| Khối | Nội dung |
|---|---|
| **People** | Thư do người thật viết, và thư công ty trả lời bạn |
| **Codes** | Mã OTP, hiện sẵn số để bấm **Copy** |
| **Accounts** | Cảnh báo đăng nhập, đổi mật khẩu, app xin quyền |
| **Google** | Thư từ các dịch vụ Google |
| **Other** | Mọi thứ còn lại, thu gọn ở dưới cùng |

Góc trên có **Pip**, một chữ M nhỏ phản ứng theo hộp thư của bạn.

Mọi thứ chạy trong tài khoản Google của chính bạn, không đi qua máy chủ của ai. Script chỉ đọc phần đầu thư và **không bao giờ xóa thư**.

---

## Cài đặt (khoảng 10 phút, máy tính dùng Chrome)

Người chia sẻ sẽ gửi bạn **link project mẫu**. Nếu không có link đó, xem mục *Cài không cần project mẫu* ở cuối trang.

### 1. Tạo bản script của riêng bạn
1. Mở link project mẫu, đăng nhập **đúng tài khoản Gmail bạn muốn chia khối**.
2. Bấm biểu tượng ⓘ **Tổng quan** (Overview) ở thanh trái → **Tạo bản sao** (Make a copy) ở góc phải trên.

   Từ đây bạn làm trên bản sao của mình. Bản sao chạy trong tài khoản của bạn; người chia sẻ không thấy được thư của bạn.
3. Trong bản sao, chọn hàm **`setup`** ở thanh trên cùng → bấm **Chạy** (Run).
4. Google hỏi quyền → chọn tài khoản.
   - Màn hình *"Google hasn't verified this app"* hiện ra là **bình thường**, vì đây là script do chính bạn vừa tạo, không phải app của công ty nào.
   - Bấm **Advanced** (Nâng cao) → **Go to … (unsafe)** → **Allow** (Cho phép).
5. Thấy dòng `Setup done…` ở khung nhật ký bên dưới là xong.

   Nếu hộp thư nhiều, dòng đó sẽ báo *"so far"*: phần còn lại tự chạy tiếp 10 phút một lần, bạn không cần làm gì thêm.

### 2. Mở cổng cho extension
1. Bấm **Triển khai** (Deploy) → **Tùy chọn triển khai mới** (New deployment) → ⚙️ → **Ứng dụng web** (Web app).
2. Chọn **Thực thi với tư cách: Tôi** (Execute as: Me) và **Ai có quyền truy cập: Chỉ mình tôi** (Only myself).
3. Bấm **Triển khai**, rồi **Sao chép** link *URL ứng dụng web* (kết thúc bằng `/exec`).

### 3. Cài extension vào Chrome
1. Vào trang [Releases](https://github.com/VinhDac/Gmail-sorter/releases/latest) → tải file **`inbox-blocks-extension-….zip`**.
2. Giải nén ra **một chỗ cố định**, ví dụ `Documents\Inbox blocks`. Chrome chạy extension trực tiếp từ thư mục này, nên đừng xóa nó sau khi cài.
3. Mở `chrome://extensions` → bật **Chế độ dành cho nhà phát triển** (Developer mode) ở góc phải trên → **Tải tiện ích đã giải nén** (Load unpacked) → chọn thư mục vừa giải nén.
4. Bấm 🧩 trên thanh Chrome → **Inbox blocks**. Trong trang cài đặt:
   - Dán link vào ô **Web app URL** → **Save and test**.
   - Thấy dòng xanh *Connected* là được.
5. Tải lại Gmail.

**Tùy chọn trong trang cài đặt:**
- **Clean my inbox automatically:** thư tự động tự rời inbox. Không thư nào bị xóa.
- **Always animate:** bật hiệu ứng ngay cả khi máy đang để chế độ giảm chuyển động.

### 4. Trên điện thoại (không bắt buộc)
1. Trong trang cài đặt extension, bấm **Copy phone link** rồi gửi link sang điện thoại.
2. Mở link bằng Chrome (Android) hoặc Safari (iPhone), đang đăng nhập đúng tài khoản Google.
3. Lưu ra màn hình chính:
   - Android: **⋮ → Thêm vào màn hình chính**.
   - iPhone: **Chia sẻ → Thêm vào MH chính**.

---

## Dùng hằng ngày
- **Bấm một thư** để mở như bình thường. Quay lại Inbox là thấy các khối.
- **Nút ↗ ở góc khối:** mở cả nhóm thư đó trong Gmail.
- **List view:** quay về danh sách Gmail gốc.
- **Bấm vào Pip:** nghe tóm tắt một dòng.
- **Thư xếp sai khối:** chuyển thư đó sang nhãn `Sorted/…` đúng trong Gmail. Khoảng 10 phút sau script tự học và nhớ người gửi đó.

## Dừng hoặc gỡ
- **Tắt các khối:** gỡ extension trong `chrome://extensions`.
- **Tắt phân loại:** trong Apps Script, chạy hàm `uninstall`.
- **Gỡ sạch:** xóa các nhãn `Sorted/…` trong Gmail. Thư vẫn còn, chỉ mất nhãn.

---

## Dành cho người chia sẻ: tạo project mẫu
Chỉ làm một lần.

1. Vào <https://script.google.com> → **New project**, đặt tên `Inbox blocks (template)`.
2. Vào ⚙️ **Project Settings** → tích **Show "appsscript.json" manifest file in editor**.
3. Dán 5 file từ thư mục [apps-script](apps-script):
   - `appsscript.json` và `Mã.gs` (Code.gs): có sẵn, xóa hết rồi dán.
   - **+ → Script** `Classifier`, **+ → Script** `WebApp`, **+ → HTML** `Phone`.

   Bấm **Lưu**.
4. **Không chạy `setup` trong project này.** Như vậy project mẫu không dính dữ liệu hay luật đã học từ hộp thư của bạn.
5. Bấm **Chia sẻ** (biểu tượng người có dấu +) → *Quyền truy cập chung*: **Bất kỳ ai có đường liên kết** → vai trò **Người xem** → **Sao chép đường liên kết**.
6. Gửi link đó cho bạn bè, kèm link tới trang này.

**Lưu ý:**
- Người mở link sẽ thấy tên tài khoản Google của bạn là chủ project. Vì vậy chỉ gửi link riêng cho bạn bè, đừng đăng công khai.
- Khi có bản mới, dán lại các file vào project mẫu. Bạn bè đã cài thì tự dán file mới vào bản sao của họ, rồi đăng phiên bản mới cho Web app (mục dưới).

## Cập nhật lên bản mới
1. Dán đè các file đã đổi vào project Apps Script của bạn → **Lưu**.
2. **Triển khai → Quản lý các bản triển khai → ✏️ → Phiên bản: Phiên bản mới → Triển khai.** Link giữ nguyên.

   Nếu bỏ bước này, Web app vẫn chạy code cũ.
3. **Extension:** tải file zip mới trong [Releases](https://github.com/VinhDac/Gmail-sorter/releases/latest), giải nén đè lên thư mục cũ, rồi bấm nút tải lại ↻ trên thẻ Inbox blocks trong `chrome://extensions`.

## Cài không cần project mẫu
Làm như mục 1, nhưng thay vì tạo bản sao, bạn tự tạo project và dán 5 file như phần *Dành cho người chia sẻ* (bước 1–3). Sau đó chạy `setup` ngay trong project đó và làm tiếp mục 2, 3.
