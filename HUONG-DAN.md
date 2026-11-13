# Inbox blocks: hướng dẫn tiếng Việt

Mở Gmail trên máy tính, trang chính chia sẵn 5 khối:
- **People**: thư do người thật viết, và công ty trả lời bạn.
- **Codes**: mã OTP, hiện sẵn số để bấm **Copy**.
- **Accounts**: cảnh báo đăng nhập, đổi mật khẩu, app xin quyền.
- **Google**: thư từ các dịch vụ Google.
- **Other**: mọi thứ còn lại, thu gọn ở dưới cùng.

Trên điện thoại có một trang riêng cùng kiểu dáng, lưu ra màn hình chính được.

Script chạy trong tài khoản Google của bạn, chỉ đọc phần đầu thư và **không bao giờ xóa thư**.

---

## Cập nhật từ bản trước

Dành cho người đã cài bản tiếng Việt.

1. **Apps Script:**
   - Dán đè `Code.gs` (trong editor tên là `Mã.gs`), `WebApp.gs` và `appsscript.json` bằng bản mới trong thư mục [apps-script](apps-script).
   - Bấm **+ → HTML**, đặt tên `Phone`, rồi dán [Phone.html](apps-script/Phone.html).
   - Xóa file `Addon` (bấm ⋮ cạnh tên file → **Xóa**). Bấm **Save**.
2. **Đăng phiên bản mới cho Web app:** **Triển khai → Quản lý các bản triển khai → ✏️ → Phiên bản: Phiên bản mới → Triển khai**. Link giữ nguyên.
3. **Chrome:**
   - Vào `chrome://extensions`, **Xóa** bản Inbox blocks cũ (bản trong Documents).
   - Bấm **Tải tiện ích đã giải nén**, chọn thư mục `extension` trong repo này.
   - Bấm biểu tượng extension, dán lại link Web app → **Save and test**.
4. Tải lại Gmail.

## Cài mới từ đầu (khoảng 15 phút)

1. **Tạo project:** vào <https://script.google.com> → **New project**, đặt tên `Inbox sorter`. Vào ⚙️ **Project Settings** → tích **Show "appsscript.json" manifest file in editor**.
2. **Dán 5 file:**
   - `appsscript.json` và `Code.gs`: có sẵn, xóa hết rồi dán.
   - **+ → Script** `Classifier`, **+ → Script** `WebApp`, **+ → HTML** `Phone`.
   - Nội dung lấy trong thư mục [apps-script](apps-script).
3. **Chạy `setup`:** chọn hàm `setup` → **Run** → cho phép quyền. Màn hình *"Google hasn't verified this app"* hiện ra vì đây là script của chính bạn: bấm **Advanced → Go to Inbox sorter (unsafe) → Allow**.

   Inbox lớn sẽ được xếp dần qua vài lượt, mỗi lượt 10 phút, bạn không cần làm gì thêm.
4. **Deploy:** **Deploy → New deployment → ⚙️ → Web app**, chọn *Execute as: Me*, *Who has access: Only myself* → **Deploy**. Chép **Web app URL**.
5. **Chrome:** vào `chrome://extensions` → bật **Developer mode** → **Load unpacked** → chọn thư mục `extension`. Bấm biểu tượng extension, dán link → **Save and test**. Tải lại Gmail.
6. **Điện thoại:** trong trang cài đặt extension, bấm **Copy phone link**. Mở link đó trên điện thoại (đang đăng nhập đúng tài khoản Google) → **Add to Home Screen**.

## Dùng hằng ngày

- **Bấm một thư** để mở như bình thường. Quay lại Inbox là thấy các khối.
- **Nút ↗ ở góc khối:** mở cả nhóm thư đó trong Gmail.
- **Codes:** bấm **Copy**. Vạch màu dưới mã ngắn dần, cho biết mã còn mới hay đã cũ. Mã quá 1 ngày được thu vào *Earlier*.
- **List view:** quay về danh sách Gmail gốc.
- **Thư xếp sai khối:** chuyển thư đó sang nhãn `Sorted/…` đúng trong Gmail. Khoảng 10 phút sau script tự học và nhớ người gửi đó cho các thư sau.
- **Tự dọn inbox:** bật trong trang cài đặt extension (**Clean my inbox automatically**).
  - Thông báo việc làm, bản tin và tin Google rời inbox ngay.
  - Mã OTP rời inbox sau 30 phút.
  - Hóa đơn, đơn hàng rời inbox sau 3 ngày.

  Không xóa gì cả. Thư gắn sao luôn ở lại.

## Khi sửa code
- **Sửa file trong Apps Script:** phải đăng phiên bản mới cho Web app (**Deploy → Manage deployments → ✏️ → New version**).
- **Sửa extension:** bấm nút tải lại trên thẻ extension trong `chrome://extensions`.

## Dừng hoặc gỡ
- **Tắt các khối:** gỡ extension trong `chrome://extensions`.
- **Tắt phân loại:** trong Apps Script, chạy hàm `uninstall`.
- **Gỡ sạch:** xóa các nhãn `Sorted/…` trong Gmail. Thư vẫn còn, chỉ mất nhãn.
