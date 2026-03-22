// Code.gs
// 1. Khởi tạo và Cấu hình ban đầu
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE'; // Thay thế bằng ID của Spreadsheet
const FOLDER_ID = 'YOUR_FOLDER_ID_HERE'; // Thay thế bằng ID của Folder lưu trữ file

function doGet(e) {
  initDatabase(); // Đảm bảo các sheet đã được tạo
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Hệ Thống Quản Lý')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// 2. Lấy thông tin người dùng hiện tại
function getCurrentUser() {
  const email = Session.getActiveUser().getEmail();
  if (!email) return { email: 'guest@example.com', role: 'Guest' }; // Fallback khi test
  
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('NhanSu');
  if (!sheet) return { email: email, role: 'Nhân viên' };
  
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === email) { // Cột B là Email
      return {
        name: data[i][0],
        email: email,
        role: data[i][2], // Cột C là Chức vụ (Quản lý, Kế toán, Nhân viên)
        permissions: data[i][3] // Cột D là Quyền truy cập (JSON string hoặc comma separated)
      };
    }
  }
  return { email: email, role: 'Nhân viên' }; // Mặc định
}

// 3. Khởi tạo Database (Tạo các sheet nếu chưa có)
function initDatabase() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const requiredSheets = ['CauHinh', 'NhanSu', 'HoSo', 'CongViec', 'HoaDon'];
  let createdCount = 0;
  
  requiredSheets.forEach(sheetName => {
    if (!ss.getSheetByName(sheetName)) {
      const newSheet = ss.insertSheet(sheetName);
      // Thiết lập header cơ bản
      if (sheetName === 'CauHinh') {
        newSheet.appendRow(['Key', 'Value']);
        newSheet.appendRow(['TenCongTy', 'Công ty TNHH ABC']);
        newSheet.appendRow(['DiaChi', 'Hà Nội']);
        newSheet.appendRow(['MaSoThue', '0123456789']);
        newSheet.appendRow(['GroqApiKey', '']);
      } else if (sheetName === 'NhanSu') {
        newSheet.appendRow(['Họ Tên', 'Email', 'Chức vụ', 'Quyền truy cập']);
      } else if (sheetName === 'HoSo') {
        newSheet.appendRow(['ID', 'Phân loại', 'Tên tài liệu', 'Ngày ban hành', 'Link File', 'Người tạo', 'Thời gian']);
      } else if (sheetName === 'CongViec') {
        newSheet.appendRow(['ID', 'Ngày', 'Tên công việc', 'Nội dung', 'Người thực hiện', 'Trạng thái', 'Mức độ HT', 'Ngày HT', 'Ý kiến QL', 'Lý do CH HT', 'Người tạo', 'Thời gian tạo']);
      } else if (sheetName === 'HoaDon') {
        newSheet.appendRow(['ID', 'Ngày HĐ', 'Ký hiệu', 'Số Hóa Đơn', 'Đối tác', 'Mã số thuế', 'Địa chỉ', 'Nội dung hàng hóa', 'Tổng tiền', 'Link PDF', 'Người tạo', 'Thời gian', 'Loại Hóa Đơn']);
      }
      createdCount++;
    }
  });
  
  return { success: true, message: `Đã kiểm tra và tạo mới ${createdCount} sheet lưu trữ.` };
}

// 4. Các hàm xử lý dữ liệu (CRUD)
// Lấy cấu hình
function getConfig() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('CauHinh');
  const data = sheet.getDataRange().getValues();
  let config = {};
  for (let i = 1; i < data.length; i++) {
    config[data[i][0]] = data[i][1];
  }
  return config;
}

// Lưu cấu hình
function saveConfig(configData) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('CauHinh');
  const data = sheet.getDataRange().getValues();
  
  for (let key in configData) {
    let found = false;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === key) {
        sheet.getRange(i + 1, 2).setValue(configData[key]);
        found = true;
        break;
      }
    }
    if (!found) {
      sheet.appendRow([key, configData[key]]);
    }
  }
  return { success: true, message: 'Lưu cấu hình thành công' };
}

// Lấy danh sách công việc
function getTasks() {
  const user = getCurrentUser();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('CongViec');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  let tasks = [];
  
  for (let i = 1; i < data.length; i++) {
    let row = data[i];
    let task = {};
    headers.forEach((header, index) => {
      task[header] = row[index];
    });
    
    // Phân quyền xem
    if (user.role === 'Quản lý' || user.role === 'Kế toán' || task['Người tạo'] === user.email || task['Người thực hiện'] === user.email) {
      tasks.push(task);
    }
  }
  return tasks;
}

// Thêm công việc mới
function addTask(taskData) {
  const user = getCurrentUser();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('CongViec');
  
  const id = 'CV' + new Date().getTime();
  const now = new Date();
  
  sheet.appendRow([
    id,
    taskData.ngay,
    taskData.tenCongViec,
    taskData.noiDung,
    taskData.nguoiThucHien,
    taskData.trangThai || 'Đang thực hiện',
    taskData.mucDoHT || '0%',
    '', // Ngày HT
    '', // Ý kiến QL
    '', // Lý do CH HT
    user.email,
    now
  ]);
  
  return { success: true, message: 'Thêm công việc thành công' };
}

// Helper function để lấy hoặc tạo thư mục
function getOrCreateFolder(parentFolder, folderName) {
  const folders = parentFolder.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return parentFolder.createFolder(folderName);
}

// Upload File lên Drive vào đúng cấu trúc thư mục
function uploadFileToDrive(base64Data, filename, mimeType, mainCategory, subCategory) {
  try {
    const config = getConfig();
    const companyName = config['TenCongTy'] || 'Công ty của bạn';
    
    const rootFolder = DriveApp.getFolderById(FOLDER_ID);
    const companyFolder = getOrCreateFolder(rootFolder, companyName);
    const mainFolder = getOrCreateFolder(companyFolder, mainCategory);
    const targetFolder = getOrCreateFolder(mainFolder, subCategory);
    
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data.split(',')[1]), mimeType, filename);
    const file = targetFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (e) {
    return null;
  }
}

// Thêm hồ sơ
function addRecord(recordData) {
  const user = getCurrentUser();
  if (user.role !== 'Quản lý' && user.role !== 'Kế toán') {
    return { success: false, message: 'Không có quyền truy cập' };
  }
  
  let fileUrl = '';
  if (recordData.fileBase64) {
    let subCategory = recordData.phanLoai;
    if (subCategory === 'Hồ sơ khác') subCategory = 'Khác';
    fileUrl = uploadFileToDrive(recordData.fileBase64, recordData.fileName, recordData.fileMimeType, 'Hồ sơ', subCategory);
  }
  
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('HoSo');
  const id = 'HS' + new Date().getTime();
  
  sheet.appendRow([
    id,
    recordData.phanLoai,
    recordData.tenTaiLieu,
    recordData.ngayBanHanh,
    fileUrl,
    user.email,
    new Date()
  ]);
  
  return { success: true, message: 'Thêm hồ sơ thành công' };
}

// 5. Tích hợp Groq API để phân tích hóa đơn
function parseInvoiceWithGroq(base64Image, mimeType) {
  const config = getConfig();
  const apiKey = config['GroqApiKey'];
  const companyName = config['TenCongTy'] || 'Công ty của bạn';
  const companyAddress = config['DiaChi'] || '';
  const companyTaxId = config['MaSoThue'] || '';
  
  if (!apiKey) {
    return { success: false, message: 'Chưa cấu hình Groq API Key' };
  }
  
  // Lưu ý: Groq hiện tại hỗ trợ các model Llama 4 Vision.
  // Cần kiểm tra model chính xác hỗ trợ vision trên Groq.
  // Giả sử sử dụng model meta-llama/llama-4-scout-17b-16e-instruct
  
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  
  const systemPrompt = `Bạn là một trợ lý AI chuyên phân tích hóa đơn. 
Thông tin công ty của người dùng (chủ sở hữu hệ thống) như sau:
- Tên công ty: "${companyName}"
- Địa chỉ: "${companyAddress}"
- Mã số thuế: "${companyTaxId}"

Dựa vào thông tin trên, hãy xác định hóa đơn này là:
- "ĐẦU VÀO": Nếu công ty của người dùng là NGƯỜI MUA (đơn vị mua hàng).
- "ĐẦU RA": Nếu công ty của người dùng là NGƯỜI BÁN (đơn vị bán hàng).

Hãy trích xuất thông tin từ hình ảnh hóa đơn và trả về DUY NHẤT một đối tượng JSON với cấu trúc sau, không kèm theo bất kỳ văn bản nào khác:
{
  "ngayHD": "DD/MM/YYYY",
  "kyHieu": "Ký hiệu hóa đơn",
  "soHoaDon": "Số hóa đơn",
  "doiTac": "Tên công ty ĐỐI TÁC (Nếu là ĐẦU VÀO thì lấy tên Người Bán. Nếu là ĐẦU RA thì lấy tên Người Mua)",
  "maSoThue": "Mã số thuế của ĐỐI TÁC",
  "diaChi": "Địa chỉ của ĐỐI TÁC",
  "noiDungHangHoa": "Mô tả ngắn gọn các mặt hàng",
  "tongTien": "Tổng tiền (chỉ số, không có ký hiệu tiền tệ)",
  "loaiHoaDon": "ĐẦU VÀO" hoặc "ĐẦU RA"
}`;

  const payload = {
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Hãy phân tích hóa đơn này."
          },
          {
            type: "image_url",
            image_url: {
              url: base64Image
            }
          }
        ]
      }
    ],
    temperature: 0.1,
    max_tokens: 1024
  };

  const options = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    if (result.error) {
       return { success: false, message: result.error.message };
    }
    
    const content = result.choices[0].message.content;
    // Tìm JSON trong chuỗi trả về (đề phòng model trả về thêm text)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsedData = JSON.parse(jsonMatch[0]);
      return { success: true, data: parsedData };
    } else {
      return { success: false, message: 'Không thể parse JSON từ phản hồi của AI' };
    }
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

// Xử lý upload hóa đơn và gọi Groq
function processInvoice(invoiceData) {
  const user = getCurrentUser();
  if (user.role !== 'Quản lý' && user.role !== 'Kế toán') {
    return { success: false, message: 'Không có quyền truy cập' };
  }
  
  // 1. Gọi Groq API để phân tích trước để biết Đầu vào/Đầu ra
  const groqResult = parseInvoiceWithGroq(invoiceData.fileBase64, invoiceData.fileMimeType);
  
  if (!groqResult.success) {
    return { success: false, message: 'Lỗi phân tích AI: ' + groqResult.message };
  }
  
  const parsedData = groqResult.data;
  const loaiHoaDon = parsedData.loaiHoaDon || 'ĐẦU VÀO';
  const subCategory = loaiHoaDon === 'ĐẦU RA' ? 'Đầu ra' : 'Đầu vào';
  
  // 2. Upload file lên Drive vào đúng thư mục
  const fileUrl = uploadFileToDrive(invoiceData.fileBase64, invoiceData.fileName, invoiceData.fileMimeType, 'Hóa đơn', subCategory);
  
  // 3. Lưu vào Sheet
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('HoaDon');
  
  // Kiểm tra và thêm cột "Loại Hóa Đơn" nếu chưa có
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  let typeColIndex = headers.indexOf('Loại Hóa Đơn');
  if (typeColIndex === -1) {
    typeColIndex = headers.length;
    sheet.getRange(1, typeColIndex + 1).setValue('Loại Hóa Đơn');
  }
  
  const id = 'HD' + new Date().getTime();
  
  let newRow = [
    id,
    parsedData.ngayHD || '',
    parsedData.kyHieu || '',
    parsedData.soHoaDon || '',
    parsedData.doiTac || '',
    parsedData.maSoThue || '',
    parsedData.diaChi || '',
    parsedData.noiDungHangHoa || '',
    parsedData.tongTien || '',
    fileUrl,
    user.email,
    new Date()
  ];
  
  // Đảm bảo mảng newRow đủ dài để chứa Loại Hóa Đơn
  while (newRow.length <= typeColIndex) {
    newRow.push('');
  }
  newRow[typeColIndex] = loaiHoaDon;
  
  sheet.appendRow(newRow);
  
  return { success: true, message: 'Xử lý hóa đơn thành công', data: parsedData };
}

// Lấy danh sách hóa đơn
function getInvoices() {
  const user = getCurrentUser();
  if (user.role !== 'Quản lý' && user.role !== 'Kế toán') {
    return [];
  }
  
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('HoaDon');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  let invoices = [];
  
  for (let i = 1; i < data.length; i++) {
    let row = data[i];
    let invoice = {};
    headers.forEach((header, index) => {
      invoice[header] = row[index];
    });
    invoices.push(invoice);
  }
  return invoices;
}
