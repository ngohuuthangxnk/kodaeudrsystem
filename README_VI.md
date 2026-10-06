# KODA EUDR — giao diện Netlify, dữ liệu Google

Đây là bản **pilot một admin**: trang web chạy trên Netlify; Netlify Function chuyển yêu cầu có chữ ký tới Apps Script; Apps Script đọc/ghi Google Sheet, Drive và Calendar. ChatGPT mở với prompt qua link; anh tự đính kèm file. Không cần Supabase hoặc OpenAI API.

## Làm một lần theo 4 bước

### 1. Cập nhật Apps Script đã có

Trong project Apps Script đã tạo URL `/exec`:

- Sao lưu code hiện tại. Thay `Code.gs` bằng `apps_script/Code.gs`; thêm file script tên `Bridge` từ `apps_script/Bridge.gs`; cập nhật `appsscript.json` theo file cùng tên. Bản này dùng Netlify làm giao diện nên khi mở trực tiếp `/exec`, nó chỉ hiện dòng **KODA pilot API**.
- Chạy `diagnoseConnection()`. Nếu `currentSheetId` là `1xura5W6coeGeJsc1zQMP6Emw_QMTv5XAf0bqpC5Uk3A`, không cần setup lại. Nếu chưa có DB_ID, chạy `attachPreparedSheet()`. Không chạy setup trên một Sheet đã có dữ liệu.
- Trong `05_OWNER_MASTER`, email anh phải có `role=ADMIN` hoặc `MARKETING`, `active=YES`.
- Apps Script → **Project Settings → Script properties**: tạo `BRIDGE_SECRET` bằng một chuỗi ngẫu nhiên **mới**, dài ít nhất 32 ký tự. Dùng cùng giá trị này ở Netlify tại bước 3. **Không dùng lại giá trị đã đăng vào chat.**
- **Deploy → Manage deployments → Edit Web app → New version**; chọn **Execute as: Me**, **Who has access: Anyone** nếu tài khoản cho phép. URL `/exec` vẫn là giá trị ở bước 3 nếu anh cập nhật cùng deployment.

### 2. Đưa mã Netlify lên GitHub

Giải nén ZIP. Tạo một repository **private** trên GitHub và upload **các tệp/thư mục bên trong ZIP vào gốc repository**, để thấy:

```text
netlify.toml
public/index.html
public/app.js
public/style.css
netlify/functions/call.mjs
```

Không upload nguyên ZIP hoặc một thư mục bao ngoài. Không đưa khóa bí mật vào repository.

### 3. Kết nối Netlify

Trên Netlify chọn **Add new project → Import an existing project → GitHub → repository vừa tạo**. Giữ **Base directory trống**, **Build command trống**, **Publish directory `public`**. File `netlify.toml` ở gốc cấu hình Function tại `netlify/functions`.

Trong **Project configuration → Environment variables**, nhập:

| Tên | Giá trị |
| --- | --- |
| `APPS_SCRIPT_WEBAPP_URL` | `https://script.google.com/macros/s/AKfycbycRNPrpJIJVGksgT-D30Tf5c6ht5AWcUlXd_IEnyi4-c7aG67KMlSvGRDcSQu_eiEWkg/exec` |
| `BRIDGE_SECRET` | **Cùng giá trị mới** đã đặt trong Apps Script Script properties |
| `PILOT_ADMIN_EMAIL` | Email admin `ACTIVE` trong `05_OWNER_MASTER` |
| `PILOT_ADMIN_TOKEN` | Chuỗi ngẫu nhiên **khác** `BRIDGE_SECRET`, dài ít nhất 32 ký tự |

Biến phải có scope **Functions/All**. Tạo chuỗi bằng PowerShell trên máy anh:

```powershell
$bytes = New-Object byte[] 32; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes); [BitConverter]::ToString($bytes).Replace("-", "").ToLowerInvariant()
```

Chạy lệnh **hai lần** để có hai giá trị khác nhau. Không gửi giá trị cho người khác hay dán vào chat. Sau khi lưu biến, **Trigger deploy → Deploy site** hoặc kích hoạt một deploy mới.

### 4. Kiểm tra

1. Mở trang gốc `https://<site>.netlify.app/`: phải thấy ô **Personal pilot sign in**, không phải trang 404.
2. Mở `https://<site>.netlify.app/.netlify/functions/call` bằng trình duyệt: phải thấy JSON `POST required` (HTTP 405); nếu 404, Function chưa được deploy.
3. Nhập `PILOT_ADMIN_TOKEN` vào trang chủ. Nếu kết nối đúng, Dashboard hiện dữ liệu từ Sheet.
4. Sau đó mới tạo case thử (ghi vào Sheet và tạo folder Drive), upload file dưới 3 MB, bấm **Sync to KODA EUDR Calendar**, và thử **AI Assistant → Open ChatGPT with prompt**.

## Nếu đang có một site Netlify từ lần kéo thả ZIP

Site đó báo 404 vì chưa có `public/index.html` ở publish directory và chưa build Function. Anh có thể tạo một site pilot mới bằng GitHub như bước 2–3. Nếu cần giữ tên miền Netlify cũ, kết nối repository mới vào **Project configuration → Developer settings → Continuous deployment → Repository** của đúng site đó, rồi kiểm tra Build settings như bước 3. Chỉ chọn site cũ nếu anh muốn thay thế bản deploy hiện tại.

## Giới hạn

- Bản này chỉ dùng cho một admin với mã truy cập cá nhân; chưa có Google SSO riêng cho nhiều người.
- Trang Calendar trong UI đọc deadline từ Sheet; nút Sync mới tạo/cập nhật Google Calendar. Không có trigger định kỳ.
- File upload/download qua Netlify giới hạn khoảng **3 MB**. ChatGPT chỉ được mở kèm prompt; file đính kèm và kiểm tra đầu ra là thao tác của anh. Nội dung prompt trong URL có thể được lưu trong lịch sử trình duyệt.
- Đây là mã đã được kiểm thử cục bộ với dịch vụ Google mô phỏng. Chưa thể xác nhận deployment Google/Netlify thật từ môi trường này.
