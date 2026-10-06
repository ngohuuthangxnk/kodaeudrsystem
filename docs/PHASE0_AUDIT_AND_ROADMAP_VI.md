# KODA EUDR 2.0 — Kiểm tra hiện trạng và lộ trình triển khai

Ngày kiểm tra: 06/10/2026. Phạm vi: ZIP `KODA_EUDR_Netlify_Ready.zip` do prompt chỉ định, Sheet `EUDR SYSTEM`, Drive root, SO mẫu và nguồn EU chính thức. Bản nâng cấp mã đi kèm là một bản pilot riêng; chưa ghi đè Sheet, Apps Script, Netlify hoặc GitHub production.

## A. Hiện trạng có thể xác minh

| Khu vực | Đang có | Khoảng trống / rủi ro thay đổi |
|---|---|---|
| Frontend | HTML/CSS/JS tĩnh trong `public`; dashboard, cases, tasks, calendar dạng bảng, AI prompt, outputs | UX pilot, chưa có Order Workspace theo evidence block, tìm kiếm toàn cục, preview, map, export. |
| Xác thực | Một `PILOT_ADMIN_TOKEN` ở Netlify, `PILOT_ADMIN_EMAIL` gán vào HMAC request; Apps Script đối chiếu `05_OWNER_MASTER` | Mọi người cầm token đều cùng danh tính admin; không dùng cho supplier. `MARKETING` hiện cũng có quyền review/complete. |
| Backend | `netlify/functions/call.mjs` giới hạn action; Apps Script `Bridge.gs` xác HMAC; `Code.gs` quản lý Sheet/Drive/Calendar | Một `Code.gs` lớn; API lỗi chưa chuẩn hoá; chưa có quyền theo supplier/company; bridge trả file base64. |
| Sheet | 13 tab; 11 tab nghiệp vụ có schema được code khai báo; `12_AI_ASSISTANT` và `13_PILOT_REVIEW` là tab hỗ trợ | 5 bảng SO/material/task/document/AI review chưa có dòng vận hành trong phạm vi A1:L25; pilot review là ghi chú, chưa là order. |
| Root | `09_CONFIG!B2` là Drive root folder ID `1BWXpf-L6yBPQtXbskoQKMfN890aZXCJg`; metadata xác nhận đây là folder `EUDR SYSTEM` | `gid=104` là `05_OWNER_MASTER`, không phải folder; prompt nên sửa đường dẫn cấu hình thành `gid=108`. |
| Drive | SO mẫu `SO25-2183(VN) - COMPLETED`, material `Solid Walnut/ORIGINAL`; SO PDF và evidence hiện có | Layout thực tế khác folder template mới; phải migration mapping, không di chuyển tài liệu gốc tự động. Có PDF 17,837,342 byte và GEO PDF 4,413,818 byte. |
| Calendar | ID lưu trong `09_CONFIG`; `syncCalendar()` dùng CalendarApp và `calendar_event_id` | Chỉ sync thủ công; quyền account deploy và event thực tế chưa kiểm chứng. Không fallback Primary Calendar. |
| Evidence/review | Upload, version, Received → Accepted/Rework, audit action | Quy tắc mẫu còn `RULES_CONFIRMED=NO`; review chỉ trên task, chưa có comment, reviewer độc lập, review history chi tiết. |
| AI | Prompt Studio tạo text metadata và mở ChatGPT | Chưa có structured result import, nguồn file trong prompt không được đính kèm tự động. Prompt qua URL có thể lộ metadata trong lịch sử. |
| GEO | Evidence task và file JSON/PDF | Chưa có geometry parser, map, polygon/point validation và chain linking. |
| Export | `registerOutput`/`completeCase` | Chưa có manifest, selective export, approved-active version filter; thao tác cũ đòi Drive file ID. |
| Legal | Không có compliance engine; readiness hiện là % task Accepted | Cần lưu rule set/version, Annex I/CN scope version, country risk version và reviewed date; không biến % thành kết luận compliance. |

**Đã xác minh:** Sheet `01_SO_MASTER`…`11_INTEGRATION_ERROR` tồn tại với header tương ứng `SCHEMA`; `09_CONFIG` còn `RULES_CONFIRMED=NO`, `REMINDERS_ENABLED=NO`, `CALENDAR_SYNC_ENABLED=MANUAL`, múi giờ `Asia/Ho_Chi_Minh`. Không có bằng chứng login supplier hoặc upload tài liệu lớn chạy được trong production.

## B. Rủi ro cần xử lý trước supplier rollout

1. Token dùng chung là lỗ hổng phân quyền cấp hệ thống. Không bật supplier view bằng cách chỉ ẩn menu.
2. Giới hạn 3 MB ở frontend, khoảng 4.4 MB JSON request ở Netlify/Apps Script bridge, và phản hồi base64 làm file 4.4 MB và 17.8 MB trong SO mẫu không đi qua được. Cần direct/resumable upload được xác thực hoặc storage gateway với quyền giới hạn; giữ file gốc trong Drive và trả document ID nội bộ.
3. `MARKETING` được coi là manager trong `manager_()` nên có thể accept evidence và complete case. Tách quyền create/order, assign, review, security admin.
4. `createCase()` tạo folder trước khi ghi Sheet và không kiểm tra trùng folder có sẵn; cần idempotency key, trạng thái giao dịch và reconciliation khi retry/lỗi giữa chừng.
5. `uploadEvidence()` tin MIME client và tạo Drive file trước khi đăng ký document; cần signature validation, retry handling và orphan reconciliation.
6. Các file Drive lịch sử chưa tự động thuộc về Sheet. Bảo toàn file gốc, lập mapping nguồn–case–material–evidence trước khi nhập register.
7. Secret `BRIDGE_SECRET` từng được dán trong hội thoại trước đó; phải rotate khi deployment, không dùng lại chuỗi cũ.

## C. Kiến trúc đích

- **Frontend Netlify:** dashboard ngoại lệ, Orders/Order Workspace, evidence blocks, task/review, GEO map, export, admin. Không giữ secret trong JS.
- **Identity:** Google OAuth/OIDC ID token cho từng cá nhân; Netlify verify issuer, audience, expiry, signature và email đã xác minh. Mỗi request ký actor cho Apps Script. Bản pilot token dùng chung được gỡ sau chuyển đổi và test supplier isolation.
- **Apps Script:** các service Auth, Order, Material, Evidence, Document, Review, Task, Geo, Calendar, Export, Audit; kiểm tra role, supplier ID và case assignment trong từng endpoint. Netlify HMAC là chứng thực giữa hai server, không thay quyền user.
- **Sheet:** transaction/index quy mô pilot, schema version, stable IDs, append-only review/audit; index theo case/material/supplier. Với dữ liệu và người dùng tăng, đánh giá chuyển transactional store; Drive vẫn lưu evidence.
- **Drive:** root giữ nguyên, folder theo SO/material/evidence; folder ID lưu trong Sheet, không cho supplier browse root. Upload lớn dùng luồng riêng đã xác thực; trạng thái upload phải đối soát trước khi review.
- **Calendar:** chỉ dùng Calendar ID được xác minh, lưu event ID; upsert theo task ID, disable/close khi task hoàn tất. Không cấp quyền Calendar trực tiếp cho supplier.

## D. Migration schema đề xuất (additive, chưa chạy)

Giữ nguyên 11 tab/schema hiện tại. Tạo tab mới sau backup:

| Tab | Khóa và cột tối thiểu | Quan hệ |
|---|---|---|
| `14_USERS` | `user_id,email,full_name,function,role,company_id,status,last_login_at,created_at,created_by` | Email unique, role server-side. |
| `15_SUPPLIERS` | `supplier_id,name,legal_name,status,created_at` | One supplier → many users/materials. |
| `16_CASE_ACCESS` | `access_id,case_id,user_id,supplier_id,scope,status,created_at` | Case assignment; scoped by material where needed. |
| `17_MATERIAL_SOURCE` | `source_id,case_id,material_id,parent_source_id,supplier_id,country,species_common,species_scientific,quantity,unit,production_from,production_to,status` | Nhiều tầng; parent links thể hiện chain. |
| `18_PLOTS` | `plot_id,source_id,geometry_type,geojson,area_ha,crs,validation_status,version` | Point/polygon; GEO theo nguồn. |
| `19_EVIDENCE_ITEMS` | `item_id,case_id,material_id,source_id,block,requirement_code,rule_version,status,assignee,due_at` | Không suy luận requirement chỉ từ material name. |
| `20_DOCUMENT_VERSIONS` | `version_id,item_id,drive_file_id,name,mime,size,sha256,version,status,uploaded_by,created_at,previous_version_id` | Immutable version identity; một active version. |
| `21_REVIEWS` | `review_id,version_id,reviewer,decision,reason,visibility,rule_version,created_at` | Quyết định và reason append-only. |
| `22_COMMENTS` | `comment_id,case_id,item_id,version_id,author,visibility,body,created_at` | Internal/supplier-visible. |
| `23_TASKS` | `task_id,case_id,item_id,assignee,due_at,status,calendar_event_id,updated_at` | Không duplicate Calendar event. |
| `24_RULESETS` | `rule_version,source_url,checked_at,annex_version,country_risk_version,effective_at,status` | Cần reviewer kích hoạt. |
| `25_EXPORTS` | `export_id,case_id,selection_json,manifest_file_id,archive_file_id,created_by,created_at,status` | Manifest ghi version ID và hash. |
| `26_UPLOAD_SESSIONS` | `upload_id,case_id,item_id,actor,expected_size,checksum,status,provider_ref,expires_at` | Giao dịch file lớn; có cleanup. |

**Migration:** backup ZIP source, copy Sheet và Drive manifest read-only; thêm tab mới ở staging; map legacy IDs và `13_PILOT_REVIEW` thủ công; backfill theo lô có checkpoint; kiểm tra counts, referential integrity, access scope; sau đó đổi API. Không tự copy hoặc sửa chứng từ gốc. Current `06_DOCUMENT_REGISTER` giữ legacy compatibility đến khi export/review đã được đối soát.

## E. UX và luồng màn hình

1. **Dashboard:** số SO hoạt động, ngoại lệ quá hạn, evidence thiếu, review đang chờ; search SO/supplier/material và date/status filter.
2. **Orders:** danh sách SO, owner, due, readiness; `New Order` yêu cầu upload SO và Order No.; duplicate → mở order hiện hữu.
3. **Order Workspace:** SO header → attention panel → material cards → evidence blocks → document version/review. Mỗi block có owner, deadline, tình trạng và hành động tiếp theo.
4. **My Tasks:** chỉ assignment trong scope; upload/re-upload, comment và deadline.
5. **Review:** preview từng version, accept/reject/request information, reason, visibility và audit history.
6. **GEO:** plot table + map, điểm/polygon, source link, validation; Map link phụ.
7. **AI Assistant:** copy prompt và nhập structured result sau kiểm duyệt; không tạo ảo giác AI đọc Drive.
8. **Export:** full/selected evidence, mặc định active approved versions, manifest rõ rule version.
9. **Users/Suppliers/Settings:** chỉ admin; tách role và function; lưu policy version.

## F. Thứ tự triển khai và cổng nghiệm thu

| Giai đoạn | Owner đề xuất | Công việc / đầu ra | Cổng nghiệm thu |
|---|---|---|---|
| 0 — 1–2 ngày | Marketing + IT + reviewer | Audit nguồn, xác nhận owner dữ liệu và requirement, backup, staging | Sheet/Drive/Calendar mapping ký xác nhận. |
| 1 — 3–5 ngày | IT | OIDC cá nhân, RBAC theo endpoint, supplier isolation, audit login | 5 test auth/scope, không có cross-supplier read. |
| 2 — 4–6 ngày | IT + Marketing | SO upload, duplicate handling, folder idempotency, material confirmation, upload file lớn | SO mẫu 17.8 MB upload/retry, không duplicate. |
| 3 — 4–6 ngày | IT + reviewer | Evidence blocks, version/review/preview/comments | Reject/re-upload/approve lưu history. |
| 4 — 3–4 ngày | IT + HSE/Purchasing | Assignment, Calendar sync, dashboard/filter | No duplicate event; overdue rõ owner. |
| 5–7 — 6–10 ngày | Sustainability + IT | Prompt Studio, GEO, ruleset/HS, export manifest/audit | Human approval gate, traceability và version đúng. |
| 8 — 3–5 ngày | QA + business owners | UAT, security, migration, rollback, release | Ký UAT trên 1 SO thật và test supplier isolation. |

Thời gian là ước tính để lập kế hoạch, phụ thuộc vào OAuth/Google Cloud/Drive upload architecture và quyền Calendar của account triển khai.

## G–H. Code/Apps Script trong gói này

- `public/index.html`, `public/style.css`, `public/app.js`: layout workspace rõ hơn; order detail theo ngoại lệ; nút **Upload final PDF** thay bước nhập Drive file ID.
- `netlify/functions/call.mjs`, `apps_script/Bridge.gs`: allowlist action `uploadOutput` qua HMAC hiện hành.
- `apps_script/Code.gs`: xác thực manager, case, PDF magic bytes/MIME/size; tạo file trong `99_FINAL`, ghi `06_DOCUMENT_REGISTER` và activity log. Legacy `registerOutput` được giữ cho tương thích. Chưa mở supplier access hay tăng giới hạn 3 MB.
- `tests/output.test.mjs`: test input sai, case sai, đường ghi Drive và document register bằng mock.

## I. Cấu hình cần xác minh

| Biến | Nguồn thực tế / trạng thái |
|---|---|
| `DB_ID` / Spreadsheet | `1xura5W6coeGeJsc1zQMP6Emw_QMTv5XAf0bqpC5Uk3A`; xác nhận Apps Script Script Properties trước deploy. |
| `ROOT_ID` | `1BWXpf-L6yBPQtXbskoQKMfN890aZXCJg`; trùng `09_CONFIG`. |
| `CALENDAR_ID` | `44c53155b661c93b06c6ee49bd9cce5764a91fa80cc57c805de639d3483cfce2@group.calendar.google.com`; quyền account chưa chứng thực. |
| `APPS_SCRIPT_WEBAPP_URL` | Dùng URL deployment `/exec` hiện hành trong Netlify; cần test read-only bootstrap. |
| `BRIDGE_SECRET` | Random mới ≥32 ký tự, giống ở Apps Script và Netlify; rotate secret từng xuất hiện trong chat. |
| `PILOT_ADMIN_TOKEN` | Random ≥32 ký tự, riêng với secret; chỉ dùng pilot một admin. |
| Allowed origin | Netlify same-origin `/api/call`; chưa mở cross-origin. |

## J. QA và giới hạn

`node tests/bridge.test.mjs`, `node tests/output.test.mjs`, syntax checks của browser JS/Netlify/Apps Script đều pass với mock. Không chạy UAT trên Google/Netlify thật; chưa xác minh Calendar permission, live upload hoặc supplier separation. Dữ liệu trong Sheet production không bị thay đổi.

## K. Deploy staging

1. Tạo branch/repo staging từ ZIP baseline, không push secret. Commit files mới từ gói này.
2. Cập nhật `Code.gs`, `Bridge.gs` trong **bản sao Apps Script staging**; kết nối **bản sao Sheet/Drive**, kiểm tra header và `diagnoseConnection()` trước khi deploy web app new version.
3. Cấu hình Netlify staging `APPS_SCRIPT_WEBAPP_URL`, `BRIDGE_SECRET`, `PILOT_ADMIN_EMAIL`, `PILOT_ADMIN_TOKEN`; rebuild. Giữ `BRIDGE_SECRET` cùng giá trị ở Script Properties. Không dùng token 6 ký tự.
4. UAT: bootstrap, case cũ, upload PDF dưới 3 MB, xem register/audit, re-download, reject/re-upload; so sánh rows, folder và file ID. Test 4.4 MB và 17.8 MB phải hiển thị giới hạn, không âm thầm thành công.
5. Chỉ đổi production sau backup và khi các owner xác nhận migration/cổng nghiệm thu. Rollback: redeploy ZIP baseline và Apps Script version trước đó; không xóa evidence mới, reconcile register nếu đã có write.

## L. Changelog

- `v1.1-pilot`: order detail mới, upload final PDF trực tiếp dưới 3 MB, test nghiệp vụ bổ sung; audit/roadmap 2.0.
- **Chưa triển khai:** multiuser login, supplier portal, SO PDF upload bắt buộc, large upload, GEO map, legal rules, export package. Không gọi v1.1 là EUDR 2.0 hoàn chỉnh.

### Nguồn pháp lý đã kiểm tra

- [Consolidated Regulation (EU) 2023/1115, bản 18/09/2026](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02023R1115-20260918)
- [Regulation (EU) 2025/2650](https://eur-lex.europa.eu/eli/reg/2025/2650/oj/eng)
- [Delegated Regulation (EU) 2026/2102, Annex I](https://eur-lex.europa.eu/eli/reg_del/2026/2102/oj/eng)
- [Implementing Regulation (EU) 2025/1093, country risk](https://eur-lex.europa.eu/eli/reg_impl/2025/1093/oj/eng)
- [European Commission FAQ, 21/08/2026](https://environment.ec.europa.eu/publications/faq-eudr-implementation_en)
