# Hệ Thống Quản Lý Doanh Nghiệp Thông Minh (Smart Enterprise Management System)

Chào mừng bạn đến với giải pháp quản trị doanh nghiệp toàn diện, kết hợp sức mạnh của **Google Workspace**, **Firebase** và **Trí tuệ nhân tạo (AI)** để tối ưu hóa quy trình vận hành của bạn.

---

## 🚀 1. Quy Trình Thiết Lập Tự Động (Setup Wizard)

Hệ thống được thiết kế để bạn có thể bắt đầu ngay lập tức. Người dùng đầu tiên đăng nhập sẽ trở thành **Quản lý hệ thống** và được dẫn dắt qua quy trình cấu hình tự động.

*   **Kết nối Google Admin:** Chỉ với một cú nhấp chuột để cấp quyền truy cập Drive và Sheets.
*   **Tự động hóa lưu trữ:** Hệ thống tự động tạo thư mục gốc trên Google Drive và một tệp Google Sheet làm "Cơ sở dữ liệu dự phòng".
*   **Cấu hình AI:** Thiết lập Groq API Key để kích hoạt tính năng đọc hóa đơn thông minh.

![Setup Wizard](https://picsum.photos/seed/setup/800/400)

---

## 📋 2. Quản Lý Công Việc (Task Management)

Giao diện quản lý công việc hiện đại, trực quan giúp đội ngũ luôn đi đúng hướng.

### Chức năng chính:
- **Tạo & Chỉnh sửa:** Thiết lập tiêu đề, mô tả, ngày hạn và người thực hiện.
- **Checklist (Sub-tasks):** Chia nhỏ công việc lớn thành các bước thực hiện cụ thể.
- **Theo dõi trạng thái:** Cập nhật tiến độ (Đang thực hiện, Tạm dừng, Đã hoàn thành).
- **Đồng bộ Google Sheets:** Tự động ghi lại lịch sử công việc vào Sheet `CongViec`.

### Cấu trúc dữ liệu (Google Sheets):
| Cột | Mô tả |
|---|---|
| ID | Mã định danh duy nhất của công việc |
| Tiêu đề | Tên ngắn gọn của công việc |
| Tiến độ | Số lượng task con đã hoàn thành (ví dụ: 3/5) |
| Người thực hiện | Email của nhân viên được giao |
| Ngày tạo | Thời điểm khởi tạo công việc |
| Ngày hạn | Thời hạn phải hoàn thành |
| Trạng thái | Tình trạng hiện tại của công việc |
| Ưu tiên | Mức độ quan trọng (Mặc định: Bình thường) |
| Mô tả | Nội dung chi tiết công việc |

![Task Management](https://picsum.photos/seed/tasks/800/400)

---

## 👥 3. Quản Lý Nhân Sự (Personnel Management)

Kiểm soát quyền truy cập hệ thống một cách chặt chẽ thông qua cơ chế Whitelist.

### Chức năng chính:
- **Thêm nhân sự:** Cấp quyền cho email Google mới tham gia hệ thống.
- **Phân quyền (RBAC):** Thiết lập vai trò (Nhân viên, Kế toán, Quản lý).
- **Quản lý trạng thái:** Kích hoạt, tạm nghỉ hoặc cho nghỉ việc nhân viên.
- **Đồng bộ danh sách:** Lưu trữ thông tin nhân sự vào Sheet `NhanSu`.

### Cấu trúc dữ liệu (Google Sheets):
| Cột | Mô tả |
|---|---|
| ID | Mã định danh nhân viên |
| Họ và tên | Tên hiển thị của nhân viên |
| Vai trò | Phân quyền truy cập (Admin/Manager/Staff) |
| Phòng ban | Bộ phận làm việc |
| Ngày sinh | Thông tin ngày sinh (nếu có) |
| Email | Địa chỉ email Google dùng để đăng nhập |
| Số điện thoại | Thông tin liên lạc |
| Ngày tham gia | Ngày được thêm vào hệ thống |
| Trạng thái | Tình trạng hoạt động (Đang làm việc/Nghỉ...) |

![Personnel Management](https://picsum.photos/seed/personnel/800/400)

---

## 🧾 4. Quản Lý Hóa Đơn AI (AI Invoice Management)

Tính năng đột phá sử dụng AI để tự động hóa việc nhập liệu kế toán.

### Chức năng chính:
- **OCR & AI Parsing:** Tự động đọc dữ liệu từ ảnh/PDF hóa đơn.
- **Kiểm tra trùng lặp:** Cảnh báo nếu hóa đơn đã tồn tại trong hệ thống.
- **Phân loại luồng tiền:** Tự động tách biệt hóa đơn Đầu vào và Đầu ra.
- **Lưu trữ đa tầng:** Lưu file vào Drive và dữ liệu vào Sheet `HoaDon`.

### Cấu trúc dữ liệu (Google Sheets):
| Cột | Mô tả |
|---|---|
| ID | Mã định danh hóa đơn |
| Số hóa đơn | Số seri trên hóa đơn |
| Ngày HĐ | Ngày phát hành hóa đơn |
| Đối tác | Tên đơn vị bán/mua |
| Nội dung | Chi tiết hàng hóa, dịch vụ |
| Số tiền | Giá trị trước thuế (nếu bóc tách được) |
| Thuế | Tiền thuế GTGT |
| Tổng tiền | Tổng giá trị thanh toán cuối cùng |
| Loại HĐ | Phân loại Đầu vào hoặc Đầu ra |
| Link Drive | Đường dẫn trực tiếp xem file hóa đơn |

![Invoice Management](https://picsum.photos/seed/invoice/800/400)

---

## 📂 5. Quản Lý Hồ Sơ & Tài Liệu (Records Management)

Kho lưu trữ tài liệu số an toàn và có tổ chức.

### Chức năng chính:
- **Tải lên đa phương tiện:** Hỗ trợ nhiều định dạng file tài liệu.
- **Phân loại thư mục:** Tự động sắp xếp vào thư mục Pháp lý, Kỹ thuật trên Drive.
- **Quản lý văn bản pháp quy:** Lưu trữ số hiệu văn bản và ngày ban hành.
- **Đồng bộ nhật ký:** Ghi lại lịch sử tải lên vào Sheet `HoSo`.

### Cấu trúc dữ liệu (Google Sheets):
| Cột | Mô tả |
|---|---|
| ID | Mã định danh hồ sơ |
| Tên tài liệu | Tên file hoặc tiêu đề hồ sơ |
| Phân loại | Loại hồ sơ (Pháp lý/Kỹ thuật/Khác) |
| Thời gian | Ngày giờ tải lên hệ thống |
| Người tải | Tên nhân viên thực hiện |
| Link Drive | Đường dẫn xem tài liệu trên Google Drive |
| Ghi chú | Số văn bản hoặc thông tin bổ sung |

![Records Management](https://picsum.photos/seed/records/800/400)

---

## ⚙️ 6. Cấu Hình & Bảo Mật (Settings)

Trung tâm điều khiển của toàn bộ hệ thống.

*   **Quản trị Google API:** Theo dõi trạng thái kết nối và bật/tắt các quyền truy cập.
*   **Vùng nguy hiểm (Danger Zone):** Tính năng Reset toàn bộ hệ thống dành riêng cho Quản lý khi muốn khởi tạo lại từ đầu.
*   **Bảo mật Firestore:** Dữ liệu được bảo vệ bởi hệ thống Security Rules nghiêm ngặt, đảm bảo nhân viên chỉ thấy những gì họ được phép.

![Settings](https://picsum.photos/seed/settings/800/400)

---

## 🛠 Công Nghệ Sử Dụng

*   **Frontend:** React 18, TypeScript, Tailwind CSS.
*   **Backend:** Firebase Auth, Firestore.
*   **Integrations:** Google Drive API, Google Sheets API.
*   **AI Engine:** Gemini 1.5 Flash & Groq (Llama 3).

---
*Bản quyền thuộc về đội ngũ phát triển hệ thống quản trị thông minh.*

---
### 💡 Hướng dẫn dành cho Quản trị viên:
Để thay thế các hình ảnh minh họa phía trên bằng hình ảnh thực tế của ứng dụng:
1. Truy cập vào từng trang chức năng trên trình duyệt của bạn.
2. Sử dụng phím `Print Screen` hoặc công cụ Snipping Tool để chụp ảnh màn hình.
3. Tải ảnh lên các dịch vụ lưu trữ (Imgur, Cloudinary...) hoặc chèn trực tiếp vào thư mục `/public/images` nếu bạn tải mã nguồn về máy.
4. Cập nhật đường dẫn ảnh trong file này tại các thẻ `![Tên chức năng](đường_dẫn_ảnh)`.
