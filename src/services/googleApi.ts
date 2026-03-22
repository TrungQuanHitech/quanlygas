const TOKEN_EXPIRY_MS = 3600 * 1000; // 1 hour

const handleApiError = async (response: Response, defaultMessage: string) => {
  const errorData = await response.json().catch(() => ({}));
  const errorMessage = errorData.error?.message || response.statusText;
  const lowerMessage = errorMessage.toLowerCase();
  
  if (
    response.status === 401 || 
    lowerMessage.includes('invalid authentication credentials') || 
    lowerMessage.includes('invalid credentials') || 
    lowerMessage.includes('unauthenticated') ||
    lowerMessage.includes('expired')
  ) {
    localStorage.removeItem('googleAdminToken');
    localStorage.removeItem('googleAdminTokenTime');
    throw new Error(`Phiên làm việc Google đã hết hạn hoặc không hợp lệ. Vui lòng kết nối lại trong Cài đặt. (Chi tiết: ${errorMessage})`);
  }
  
  throw new Error(`${defaultMessage}: ${errorMessage}`);
};

const isTokenExpired = () => {
  const time = localStorage.getItem('googleAdminTokenTime');
  if (!time) return true;
  return Date.now() - parseInt(time) > TOKEN_EXPIRY_MS;
};

export const createDriveFolder = async (token: string, folderName: string, parentId?: string) => {
  if (isTokenExpired()) {
    localStorage.removeItem('googleAdminToken');
    localStorage.removeItem('googleAdminTokenTime');
    throw new Error('Phiên làm việc Google đã hết hạn. Vui lòng kết nối lại trong Cài đặt.');
  }

  const metadata: any = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    metadata.parents = [parentId];
  }

  const response = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  });

  if (!response.ok) {
    await handleApiError(response, `Lỗi tạo thư mục ${folderName}`);
  }

  const data = await response.json();
  return data.id;
};

export const getOrCreateDriveFolder = async (token: string, folderName: string, parentId?: string) => {
  if (isTokenExpired()) {
    localStorage.removeItem('googleAdminToken');
    localStorage.removeItem('googleAdminTokenTime');
    throw new Error('Phiên làm việc Google đã hết hạn. Vui lòng kết nối lại trong Cài đặt.');
  }

  let query = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }

  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    await handleApiError(response, `Lỗi tìm thư mục ${folderName}`);
  }

  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }

  return await createDriveFolder(token, folderName, parentId);
};

export const createStorageStructure = async (token: string, companyName: string) => {
  try {
    const rootFolderId = await getOrCreateDriveFolder(token, companyName || 'Hệ Thống Quản Lý');
    const hoSoFolderId = await getOrCreateDriveFolder(token, 'Hồ sơ', rootFolderId);
    const hoaDonFolderId = await getOrCreateDriveFolder(token, 'Hóa đơn', rootFolderId);
    
    await getOrCreateDriveFolder(token, 'Pháp lý', hoSoFolderId);
    await getOrCreateDriveFolder(token, 'Kỹ thuật', hoSoFolderId);
    await getOrCreateDriveFolder(token, 'Khác', hoSoFolderId);
    
    await getOrCreateDriveFolder(token, 'Đầu vào', hoaDonFolderId);
    await getOrCreateDriveFolder(token, 'Đầu ra', hoaDonFolderId);

    const sheetResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `Database - ${companyName || 'Hệ Thống Quản Lý'}`,
        },
        sheets: [
          { properties: { title: 'CauHinh' } },
          { properties: { title: 'NhanSu' } },
          { properties: { title: 'HoSo' } },
          { properties: { title: 'CongViec' } },
          { properties: { title: 'HoaDon' } }
        ]
      }),
    });

    if (!sheetResponse.ok) {
      await handleApiError(sheetResponse, 'Lỗi tạo Google Sheet');
    }

    const sheetData = await sheetResponse.json();
    const spreadsheetId = sheetData.spreadsheetId;

    await initializeSpreadsheetHeaders(token, spreadsheetId);

    const moveResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${rootFolderId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
      }
    });

    if (!moveResponse.ok) {
      await handleApiError(moveResponse, 'Lỗi di chuyển Google Sheet vào thư mục');
    }

    return { success: true, rootFolderId, spreadsheetId };
  } catch (error: any) {
    console.error("Error creating storage structure:", error);
    return { success: false, message: error.message };
  }
};

export const appendRowToSheet = async (token: string, spreadsheetId: string, sheetName: string, values: any[]) => {
  if (isTokenExpired()) {
    localStorage.removeItem('googleAdminToken');
    localStorage.removeItem('googleAdminTokenTime');
    throw new Error('Phiên làm việc Google đã hết hạn. Vui lòng kết nối lại trong Cài đặt.');
  }

  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A1:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: [values]
    }),
  });

  if (!response.ok) {
    await handleApiError(response, `Lỗi ghi dữ liệu vào Sheet ${sheetName}`);
  }

  return await response.json();
};

export const updateSheetHeaders = async (token: string, spreadsheetId: string, sheetName: string, headers: string[]) => {
  if (isTokenExpired()) {
    localStorage.removeItem('googleAdminToken');
    localStorage.removeItem('googleAdminTokenTime');
    throw new Error('Phiên làm việc Google đã hết hạn. Vui lòng kết nối lại trong Cài đặt.');
  }

  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A1:1?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: [headers]
    }),
  });

  if (!response.ok) {
    await handleApiError(response, `Lỗi cập nhật tiêu đề Sheet ${sheetName}`);
  }

  return await response.json();
};

export const initializeSpreadsheetHeaders = async (token: string, spreadsheetId: string) => {
  const headerConfigs = [
    { name: 'NhanSu', headers: ['ID', 'Họ tên', 'Chức vụ', 'Phòng ban', 'Ngày sinh', 'Email', 'Số điện thoại', 'Ngày vào làm', 'Trạng thái'] },
    { name: 'HoSo', headers: ['ID', 'Tên hồ sơ', 'Loại', 'Ngày tạo', 'Người tạo', 'Đường dẫn Drive', 'Ghi chú'] },
    { name: 'CongViec', headers: ['ID', 'Tên công việc', 'Người thực hiện', 'Ngày bắt đầu', 'Hạn hoàn thành', 'Trạng thái', 'Ưu tiên', 'Mô tả'] },
    { name: 'HoaDon', headers: ['ID', 'Số hóa đơn', 'Ngày hóa đơn', 'Đơn vị phát hành', 'Nội dung', 'Số tiền', 'Thuế', 'Tổng tiền', 'Loại', 'Đường dẫn Drive'] }
  ];

  for (const config of headerConfigs) {
    await updateSheetHeaders(token, spreadsheetId, config.name, config.headers);
  }
};

export const uploadFileToDrive = async (token: string, file: File, folderId?: string) => {
  if (isTokenExpired()) {
    localStorage.removeItem('googleAdminToken');
    localStorage.removeItem('googleAdminTokenTime');
    throw new Error('Phiên làm việc Google đã hết hạn. Vui lòng kết nối lại trong Cài đặt.');
  }

  const metadata = {
    name: file.name,
    mimeType: file.type,
    parents: folderId ? [folderId] : []
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: form
  });

  if (!response.ok) {
    await handleApiError(response, 'Lỗi tải file lên Drive');
  }

  return await response.json();
};

export const downloadFileFromDrive = async (token: string, fileId: string) => {
  if (isTokenExpired()) {
    localStorage.removeItem('googleAdminToken');
    localStorage.removeItem('googleAdminTokenTime');
    throw new Error('Phiên làm việc Google đã hết hạn. Vui lòng kết nối lại trong Cài đặt.');
  }

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    await handleApiError(response, 'Lỗi tải file từ Drive');
  }

  return await response.blob();
};

export const listFilesInFolder = async (token: string, folderId: string) => {
  if (isTokenExpired()) {
    localStorage.removeItem('googleAdminToken');
    localStorage.removeItem('googleAdminTokenTime');
    throw new Error('Phiên làm việc Google đã hết hạn. Vui lòng kết nối lại trong Cài đặt.');
  }

  const query = `'${folderId}' in parents and trashed = false`;
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink)`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    await handleApiError(response, 'Lỗi liệt kê file trong thư mục');
  }

  const data = await response.json();
  return data.files || [];
};

export const deleteFileFromDrive = async (token: string, fileId: string) => {
  if (isTokenExpired()) {
    localStorage.removeItem('googleAdminToken');
    localStorage.removeItem('googleAdminTokenTime');
    return true; // Don't block if token is expired
  }

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("Failed to delete file from Drive:", errorData);
  }
  return true;
};
