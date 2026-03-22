import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { User, Record } from '../types';
import { format } from 'date-fns';
import { FolderOpen, Upload, FileText, Download, Eye, X, RefreshCw } from 'lucide-react';
import { uploadFileToDrive, getOrCreateDriveFolder, appendRowToSheet } from '../services/googleApi';
import { doc, getDoc } from 'firebase/firestore';
import { Setting } from '../types';

export default function Records({ user }: { user: User }) {
  const [records, setRecords] = useState<Record[]>([]);
  const [newRecord, setNewRecord] = useState<Partial<Record>>({
    type: 'Pháp lý',
    name: '',
    fileUrl: '',
    documentNumber: '',
    issueDate: ''
  });
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewRecord, setPreviewRecord] = useState<Record | null>(null);
  const [filterType, setFilterType] = useState<string>('Tất cả');

  useEffect(() => {
    const q = query(collection(db, 'records'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const recordsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Record[];
      setRecords(recordsData);
    });

    return () => unsubscribe();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("Kích thước file quá lớn. Vui lòng chọn file dưới 5MB.");
      e.target.value = '';
      return;
    }

    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      setNewRecord({ ...newRecord, fileUrl: event.target?.result as string });
    };
    reader.readAsDataURL(file);
  };

  const handleAddRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      alert("Vui lòng chọn file");
      return;
    }

    setIsUploading(true);
    try {
      const token = localStorage.getItem('googleAdminToken');
      const settingsRef = doc(db, 'settings', 'general');
      const settingsSnap = await getDoc(settingsRef);
      const settings = settingsSnap.exists() ? (settingsSnap.data() as Setting) : null;
      
      let driveFileId = '';
      let driveWebViewLink = '';

      if (token && settings) {
        try {
          const rootFolderId = await getOrCreateDriveFolder(token, settings.companyName || 'Hệ Thống Quản Lý');
          const hoSoFolderId = await getOrCreateDriveFolder(token, 'Hồ sơ', rootFolderId);
          const subFolderId = await getOrCreateDriveFolder(token, newRecord.type || 'Khác', hoSoFolderId);
          
          const uploadResult = await uploadFileToDrive(token, selectedFile, subFolderId);
          driveFileId = uploadResult.id;
          driveWebViewLink = uploadResult.webViewLink;
        } catch (err: any) {
          console.error("Error uploading to Drive:", err);
          const lowerMessage = err.message?.toLowerCase() || '';
          if (
            lowerMessage.includes('invalid authentication credentials') || 
            lowerMessage.includes('invalid credentials') || 
            lowerMessage.includes('unauthenticated') ||
            lowerMessage.includes('401')
          ) {
            localStorage.removeItem('googleAdminToken');
            alert("Phiên đăng nhập Google Admin đã hết hạn hoặc không hợp lệ. Vui lòng vào tab Cấu Hình để đăng nhập lại.");
          }
        }
      }

      const recordDataToSave = {
        ...newRecord,
        fileUrl: driveWebViewLink || newRecord.fileUrl, // Use Drive link if available
        driveFileId: driveFileId,
        createdAt: new Date().toISOString(),
        createdBy: user.uid
      };

      if (recordDataToSave.type !== 'Pháp lý') {
        delete recordDataToSave.documentNumber;
        delete recordDataToSave.issueDate;
      }

      const docRef = await addDoc(collection(db, 'records'), recordDataToSave);

      // Sync to Google Sheets
      if (token && settings?.spreadsheetId) {
        try {
          const rowData = [
            docRef.id,
            newRecord.name,
            newRecord.type,
            format(new Date(), 'dd/MM/yyyy HH:mm'),
            user.displayName || user.email,
            driveWebViewLink || '',
            newRecord.documentNumber ? `Số: ${newRecord.documentNumber}` : ''
          ];
          await appendRowToSheet(token, settings.spreadsheetId, 'HoSo', rowData);
        } catch (sheetError: any) {
          console.error("Error syncing to Google Sheets:", sheetError);
          if (!localStorage.getItem('googleAdminToken')) {
            alert("Phiên làm việc Google đã hết hạn. Vui lòng vào Cài đặt để kết nối lại Google Admin.");
          }
        }
      }

      setNewRecord({
        type: 'Pháp lý',
        name: '',
        fileUrl: '',
        documentNumber: '',
        issueDate: ''
      });
      setSelectedFile(null);
      const fileInput = document.getElementById('recordFile') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (error) {
      console.error("Error adding record: ", error);
      alert("Lỗi khi thêm hồ sơ");
    } finally {
      setIsUploading(false);
    }
  };

  const filteredRecords = records.filter(record => {
    if (filterType !== 'Tất cả' && record.type !== filterType) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">Quản lý Hồ Sơ</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
          <Upload className="w-5 h-5 mr-2 text-blue-600" />
          Thêm Hồ Sơ Mới
        </h2>
        <form onSubmit={handleAddRecord} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-slate-700 mb-1">Phân loại</label>
              <select 
                required
                value={newRecord.type}
                onChange={(e) => setNewRecord({...newRecord, type: e.target.value as Record['type']})}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Pháp lý">Pháp lý</option>
                <option value="Kỹ thuật">Kỹ thuật</option>
                <option value="Hồ sơ khác">Hồ sơ khác</option>
              </select>
            </div>
            <div className="md:col-span-5">
              <label className="block text-sm font-medium text-slate-700 mb-1">Tên tài liệu</label>
              <input 
                type="text" 
                required
                placeholder="Nhập tên tài liệu..."
                value={newRecord.name}
                onChange={(e) => setNewRecord({...newRecord, name: e.target.value})}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">File đính kèm</label>
              <input 
                type="file" 
                id="recordFile"
                required
                onChange={handleFileChange}
                className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
          </div>

          {newRecord.type === 'Pháp lý' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">Số văn bản</label>
                <input 
                  type="text" 
                  placeholder="VD: 123/QĐ-UBND"
                  value={newRecord.documentNumber || ''}
                  onChange={(e) => setNewRecord({...newRecord, documentNumber: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="md:col-span-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">Ngày ký/ban hành</label>
                <input 
                  type="date" 
                  value={newRecord.issueDate || ''}
                  onChange={(e) => setNewRecord({...newRecord, issueDate: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button 
              type="submit" 
              disabled={isUploading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {isUploading ? 'Đang lưu...' : 'Lưu Hồ Sơ'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center">
            <FolderOpen className="w-5 h-5 mr-2 text-slate-500" />
            Danh sách Hồ Sơ
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Ngày tạo</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  <div className="flex items-center space-x-1">
                    <span>Phân loại</span>
                    <select
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="bg-slate-50 border border-slate-200 text-slate-500 text-xs rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="Tất cả">Tất cả</option>
                      <option value="Pháp lý">Pháp lý</option>
                      <option value="Kỹ thuật">Kỹ thuật</option>
                      <option value="Hồ sơ khác">Hồ sơ khác</option>
                    </select>
                  </div>
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Tên tài liệu</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Thao tác</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                    Chưa có hồ sơ nào.
                  </td>
                </tr>
              ) : filteredRecords.map((record) => (
                <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    {format(new Date(record.createdAt), 'dd/MM/yyyy HH:mm')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                      {record.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">
                    <div className="flex items-center">
                      <FileText className="w-4 h-4 mr-2 text-slate-400" />
                      {record.name}
                    </div>
                    {record.type === 'Pháp lý' && (record.documentNumber || record.issueDate) && (
                      <div className="mt-1 text-xs text-slate-500 font-normal ml-6 flex items-center">
                        {record.documentNumber && <span>Số: {record.documentNumber}</span>}
                        {record.documentNumber && record.issueDate && <span className="mx-2">|</span>}
                        {record.issueDate && <span>Ngày BH: {format(new Date(record.issueDate), 'dd/MM/yyyy')}</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end space-x-3">
                      <button 
                        onClick={() => setPreviewRecord(record)}
                        className="text-slate-600 hover:text-slate-900 inline-flex items-center"
                        title="Xem trước"
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        Xem
                      </button>
                      <a 
                        href={record.fileUrl} 
                        download={record.name}
                        className="text-blue-600 hover:text-blue-900 inline-flex items-center"
                        title="Tải xuống"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Preview Modal */}
      {previewRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-800/75 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div className="flex items-start">
                <FileText className="w-5 h-5 mr-2 mt-0.5 text-slate-500" />
                <div>
                  <div className="flex items-center">
                    <h3 className="text-lg font-semibold text-slate-800 truncate max-w-md">
                      {previewRecord.name}
                    </h3>
                    <span className="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-800">
                      {previewRecord.type}
                    </span>
                  </div>
                  {previewRecord.type === 'Pháp lý' && (previewRecord.documentNumber || previewRecord.issueDate) && (
                    <div className="text-xs text-slate-500 mt-1 flex items-center">
                      {previewRecord.documentNumber && <span>Số: {previewRecord.documentNumber}</span>}
                      {previewRecord.documentNumber && previewRecord.issueDate && <span className="mx-2">|</span>}
                      {previewRecord.issueDate && <span>Ngày BH: {format(new Date(previewRecord.issueDate), 'dd/MM/yyyy')}</span>}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <a 
                  href={previewRecord.fileUrl} 
                  download={previewRecord.name}
                  className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Tải xuống"
                >
                  <Download className="w-5 h-5" />
                </a>
                <button 
                  onClick={() => setPreviewRecord(null)} 
                  className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Đóng"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-100 p-4 overflow-auto flex items-center justify-center">
              {previewRecord.fileUrl.startsWith('data:image/') ? (
                <img 
                  src={previewRecord.fileUrl} 
                  alt={previewRecord.name} 
                  className="max-w-full max-h-full object-contain shadow-sm rounded"
                />
              ) : previewRecord.fileUrl.startsWith('data:application/pdf') ? (
                <iframe 
                  src={previewRecord.fileUrl} 
                  title={previewRecord.name}
                  className="w-full h-full rounded shadow-sm border-0 bg-white"
                />
              ) : (
                <div className="text-center p-8 bg-white rounded-xl shadow-sm max-w-sm">
                  <FileText className="w-16 h-16 mx-auto text-slate-300 mb-4" />
                  <p className="text-slate-600 mb-4">Không thể xem trước định dạng file này trực tiếp trên trình duyệt.</p>
                  <a 
                    href={previewRecord.fileUrl} 
                    download={previewRecord.name}
                    className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Tải file xuống để xem
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
