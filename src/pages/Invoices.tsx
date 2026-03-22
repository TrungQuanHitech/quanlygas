import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, orderBy, doc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { User, Invoice, Setting } from '../types';
import { format } from 'date-fns';
import { Search, Upload, RefreshCw, FolderSearch, FileText, X, ExternalLink, Trash2, AlertTriangle } from 'lucide-react';
import { uploadFileToDrive, getOrCreateDriveFolder, deleteFileFromDrive, appendRowToSheet, listFilesInFolder, downloadFileFromDrive } from '../services/googleApi';
import { convertPdfToImage } from '../utils/pdfUtils';
import { GoogleGenAI } from "@google/genai";

interface ParsedInvoice {
  ngayHD: string;
  kyHieu: string;
  soHoaDon: string;
  doiTac: string;
  maSoThue: string;
  diaChi: string;
  noiDungHangHoa: string;
  tongTien: string;
  loaiHoaDon: 'ĐẦU VÀO' | 'ĐẦU RA';
}

export default function Invoices({ user }: { user: User }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ĐẦU VÀO' | 'ĐẦU RA'>('ĐẦU VÀO');
  const [searchPartner, setSearchPartner] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const [duplicateInvoice, setDuplicateInvoice] = useState<{data: ParsedInvoice, file: File, base64: string, companyName: string, existingFileId?: string, existingWebViewLink?: string} | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'invoices'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const invoicesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Invoice[];
      setInvoices(invoicesData);
    });

    return () => unsubscribe();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleProcessInvoice = async () => {
    if (!selectedFile) {
      setError("Vui lòng chọn file hóa đơn");
      return;
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      setError("Kích thước file quá lớn. Vui lòng chọn file dưới 5MB để đảm bảo AI xử lý tốt.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Get AI API Key from settings
      const settingsRef = doc(db, 'settings', 'general');
      const settingsSnap = await getDoc(settingsRef);
      const aiApiKey = settingsSnap.exists() ? (settingsSnap.data() as Setting).aiApiKey : null;
      const companyName = settingsSnap.exists() ? (settingsSnap.data() as Setting).companyName : '';

      const apiKeyToUse = aiApiKey || process.env.GEMINI_API_KEY;

      if (!apiKeyToUse) {
        throw new Error("Chưa cấu hình Gemini API Key. Vui lòng vào tab Cấu Hình để thiết lập.");
      }

      // Convert file to base64
      let base64Data = '';
      if (selectedFile.type === 'application/pdf') {
        base64Data = await convertPdfToImage(selectedFile);
      } else {
        base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(selectedFile);
        });
      }

      await processFile(selectedFile, null, null, apiKeyToUse, companyName, base64Data);
    } catch (err: any) {
      console.error("Error processing invoice:", err);
      setError(err.message || "Đã xảy ra lỗi không xác định");
      setIsProcessing(false);
    }
  };

  const processFile = async (file: File, existingFileId: string | null, existingWebViewLink: string | null, apiKey: string, companyName: string, base64Data?: string) => {
    try {
      if (!base64Data) {
        if (file.type === 'application/pdf') {
          base64Data = await convertPdfToImage(file);
        } else {
          base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        }
      }

      const prompt = `Phân tích hóa đơn này và trả về dữ liệu dưới dạng JSON với cấu trúc chính xác như sau:
{
  "ngayHD": "Ngày hóa đơn (DD/MM/YYYY)",
  "kyHieu": "Ký hiệu hóa đơn",
  "soHoaDon": "Số hóa đơn",
  "doiTac": "Tên đơn vị đối tác (người bán nếu là hóa đơn mua vào, người mua nếu là hóa đơn bán ra)",
  "maSoThue": "Mã số thuế của đối tác",
  "diaChi": "Địa chỉ của đối tác",
  "noiDungHangHoa": "Mô tả ngắn gọn nội dung hàng hóa/dịch vụ",
  "tongTien": "Tổng tiền thanh toán (định dạng số, ví dụ: 13.490.000)",
  "loaiHoaDon": "ĐẦU VÀO hoặc ĐẦU RA (Nếu người mua là '${companyName}' thì là ĐẦU VÀO, ngược lại là ĐẦU RA)"
}
Chỉ trả về JSON hợp lệ, không kèm văn bản giải thích.`;

      const ai = new GoogleGenAI({ apiKey });

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: base64Data.split(',')[1]
                }
              }
            ]
          }
        ]
      });

      let parsedJson = response.text || '';
      
      if (parsedJson.startsWith('```json')) {
        parsedJson = parsedJson.replace(/```json/g, '').replace(/```/g, '').trim();
      } else if (parsedJson.startsWith('```')) {
        parsedJson = parsedJson.replace(/```/g, '').trim();
      }

      let parsedDataObj: ParsedInvoice;
      try {
        parsedDataObj = JSON.parse(parsedJson);
        const isDuplicate = invoices.some(inv => {
          const existingData = getParsedData(inv.parsedData);
          return existingData && 
                 existingData.soHoaDon === parsedDataObj.soHoaDon && 
                 existingData.doiTac === parsedDataObj.doiTac;
        });

        if (isDuplicate) {
          setDuplicateInvoice({ 
            data: parsedDataObj, 
            file, 
            base64: base64Data, 
            companyName,
            existingFileId: existingFileId || undefined,
            existingWebViewLink: existingWebViewLink || undefined
          });
          setIsProcessing(false);
          return;
        }
      } catch (e) {
        console.error("Error parsing AI response:", e);
        throw new Error("Không thể phân tích dữ liệu từ hóa đơn. Vui lòng thử lại.");
      }

      await saveInvoice(parsedDataObj, parsedJson, file, base64Data, companyName, existingFileId, existingWebViewLink);
    } catch (err: any) {
      throw err;
    }
  };

  const saveInvoice = async (parsedDataObj: ParsedInvoice, parsedJson: string, file: File, base64Data: string, companyName: string, existingFileId: string | null = null, existingWebViewLink: string | null = null) => {
    setIsProcessing(true);
    try {
      const token = localStorage.getItem('googleAdminToken');
      let fileId = existingFileId || '';
      let webViewLink = existingWebViewLink || '';

      if (token && !fileId) {
        try {
          const rootFolderId = await getOrCreateDriveFolder(token, companyName || 'Hệ Thống Quản Lý');
          const hoaDonFolderId = await getOrCreateDriveFolder(token, 'Hóa đơn', rootFolderId);
          const subFolderName = parsedDataObj.loaiHoaDon === 'ĐẦU RA' ? 'Đầu ra' : 'Đầu vào';
          const subFolderId = await getOrCreateDriveFolder(token, subFolderName, hoaDonFolderId);
          
          const uploadResult = await uploadFileToDrive(token, file, subFolderId);
          fileId = uploadResult.id;
          webViewLink = uploadResult.webViewLink;
        } catch (uploadError: any) {
          console.error("Error uploading to Drive:", uploadError);
          // Non-blocking error for Drive upload
        }
      }

      // Save to Firestore
      const docRef = await addDoc(collection(db, 'invoices'), {
        fileName: file.name,
        parsedData: parsedJson,
        fileId: fileId,
        webViewLink: webViewLink,
        createdAt: new Date().toISOString(),
        createdBy: user.uid
      });

      // Sync to Google Sheets
      const settingsRef = doc(db, 'settings', 'general');
      const settingsSnap = await getDoc(settingsRef);
      const spreadsheetId = settingsSnap.exists() ? (settingsSnap.data() as Setting).spreadsheetId : null;

      if (token && spreadsheetId) {
        try {
          const rowData = [
            docRef.id,
            parsedDataObj.soHoaDon,
            parsedDataObj.ngayHD,
            parsedDataObj.doiTac,
            parsedDataObj.noiDungHangHoa,
            '', 
            '', 
            parsedDataObj.tongTien,
            parsedDataObj.loaiHoaDon,
            webViewLink
          ];
          await appendRowToSheet(token, spreadsheetId, 'HoaDon', rowData);
        } catch (sheetError: any) {
          console.error("Error syncing to Google Sheets:", sheetError);
        }
      }

      setSelectedFile(null);
      setDuplicateInvoice(null);
      const fileInput = document.getElementById('invoiceFile') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

    } catch (err: any) {
      console.error("Error saving invoice:", err);
      setError(err.message || "Lỗi khi lưu hóa đơn");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleScanDriveFolder = async () => {
    setIsScanning(true);
    setError(null);
    try {
      const token = localStorage.getItem('googleAdminToken');
      if (!token) {
        throw new Error("Vui lòng kết nối Google Admin trong Cài đặt để sử dụng tính năng này.");
      }

      const settingsRef = doc(db, 'settings', 'general');
      const settingsSnap = await getDoc(settingsRef);
      const companyName = settingsSnap.exists() ? (settingsSnap.data() as Setting).companyName : '';
      const aiApiKey = settingsSnap.exists() ? (settingsSnap.data() as Setting).aiApiKey : null;
      const apiKeyToUse = aiApiKey || process.env.GEMINI_API_KEY;

      if (!apiKeyToUse) {
        throw new Error("Chưa cấu hình Gemini API Key. Vui lòng vào tab Cấu Hình để thiết lập.");
      }

      const rootFolderId = await getOrCreateDriveFolder(token, companyName || 'Hệ Thống Quản Lý');
      const hoaDonFolderId = await getOrCreateDriveFolder(token, 'Hóa đơn', rootFolderId);
      const subFolderId = await getOrCreateDriveFolder(token, 'Đầu vào', hoaDonFolderId);

      const files = await listFilesInFolder(token, subFolderId);
      
      const existingFileIds = new Set(invoices.map(inv => inv.fileId).filter(id => !!id));
      const newFiles = files.filter(file => !existingFileIds.has(file.id) && (file.mimeType.startsWith('image/') || file.mimeType === 'application/pdf'));

      if (newFiles.length === 0) {
        alert("Không tìm thấy file mới nào trong thư mục 'Đầu vào' trên Drive.");
        return;
      }

      if (!confirm(`Tìm thấy ${newFiles.length} file mới. Bạn có muốn bắt đầu xử lý tự động không?`)) {
        return;
      }

      setIsProcessing(true);
      for (const file of newFiles) {
        try {
          const blob = await downloadFileFromDrive(token, file.id);
          const fileObj = new File([blob], file.name, { type: file.mimeType });
          await processFile(fileObj, file.id, file.webViewLink, apiKeyToUse, companyName);
        } catch (fileErr: any) {
          console.error(`Error processing file ${file.name}:`, fileErr);
        }
      }
      alert("Hoàn tất quét và xử lý thư mục.");
    } catch (err: any) {
      console.error("Error scanning Drive folder:", err);
      setError(err.message || "Lỗi khi quét thư mục Drive");
    } finally {
      setIsScanning(false);
      setIsProcessing(false);
    }
  };

  const getParsedData = (parsedDataString: string): ParsedInvoice | null => {
    try {
      return JSON.parse(parsedDataString);
    } catch (e) {
      return null;
    }
  };

  const filteredInvoices = invoices.filter(invoice => {
    const data = getParsedData(invoice.parsedData);
    if (!data) return false;
    
    if (data.loaiHoaDon !== activeTab) return false;
    
    if (searchPartner && !data.doiTac?.toLowerCase().includes(searchPartner.toLowerCase())) {
      return false;
    }
    
    if (searchDate && !data.ngayHD?.includes(searchDate)) {
      return false;
    }
    
    return true;
  });

  const handleDeleteInvoice = async () => {
    if (!invoiceToDelete || !invoiceToDelete.id) return;
    
    setIsDeleting(true);
    setError(null);
    
    try {
      // Delete from Google Drive if fileId exists
      if (invoiceToDelete.fileId) {
        const token = localStorage.getItem('googleAdminToken');
        if (token) {
          await deleteFileFromDrive(token, invoiceToDelete.fileId);
        }
      }
      
      // Delete from Firestore
      await deleteDoc(doc(db, 'invoices', invoiceToDelete.id));
      setInvoiceToDelete(null);
    } catch (err: any) {
      console.error("Error deleting invoice:", err);
      setError("Lỗi khi xóa hóa đơn: " + (err.message || "Không xác định"));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Upload Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="flex-1 flex items-center gap-2 w-full">
            <label className="flex items-center justify-center px-4 py-2 bg-slate-100 border border-slate-300 rounded-md cursor-pointer hover:bg-slate-200 transition-colors text-sm font-medium text-slate-700 whitespace-nowrap">
              Choose File
              <input 
                id="invoiceFile" 
                type="file" 
                className="hidden" 
                accept="image/*" 
                onChange={handleFileChange}
              />
            </label>
            <span className="text-sm text-slate-500 truncate flex-1 px-3 py-2 border border-slate-200 rounded-md bg-slate-50">
              {selectedFile ? selectedFile.name : 'No file chosen'}
            </span>
          </div>
          
          <button 
            onClick={handleProcessInvoice}
            disabled={isProcessing || !selectedFile}
            className="w-full md:w-auto bg-blue-400 hover:bg-blue-500 text-white px-6 py-2 rounded-md font-medium transition-colors disabled:opacity-50 flex items-center justify-center whitespace-nowrap"
          >
            {isProcessing ? (
              <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> ĐANG XỬ LÝ...</>
            ) : (
              'TẢI LÊN FILE'
            )}
          </button>
          
          <button 
            onClick={handleScanDriveFolder}
            disabled={isProcessing || isScanning}
            className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-bold transition-colors flex items-center justify-center whitespace-nowrap disabled:opacity-50"
          >
            {isScanning ? (
              <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> ĐANG QUÉT...</>
            ) : (
              <><FolderSearch className="w-4 h-4 mr-2" /> QUÉT THƯ MỤC DRIVE</>
            )}
          </button>
        </div>
        
        {error && (
          <div className="mt-4 text-red-500 text-sm font-medium">
            {error}
          </div>
        )}
      </div>

      {/* Filter Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <input 
              type="text" 
              placeholder="Tìm tên đối tác..." 
              value={searchPartner}
              onChange={(e) => setSearchPartner(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1">
            <input 
              type="text" 
              placeholder="Tìm ngày (dd/mm/yyyy)..." 
              value={searchDate}
              onChange={(e) => setSearchDate(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button 
            onClick={() => { setSearchPartner(''); setSearchDate(''); }}
            className="w-full md:w-auto bg-blue-400 hover:bg-blue-500 text-white px-8 py-2 rounded-md font-medium transition-colors"
          >
            Làm mới
          </button>
        </div>
      </div>

      {/* Tabs & Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-200 bg-slate-50">
          <button
            className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${
              activeTab === 'ĐẦU VÀO' 
                ? 'bg-white text-blue-600 border-blue-600' 
                : 'text-slate-500 border-transparent hover:bg-slate-100'
            }`}
            onClick={() => setActiveTab('ĐẦU VÀO')}
          >
            ĐẦU VÀO
          </button>
          <button
            className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${
              activeTab === 'ĐẦU RA' 
                ? 'bg-white text-blue-600 border-blue-600' 
                : 'text-slate-500 border-transparent hover:bg-slate-100'
            }`}
            onClick={() => setActiveTab('ĐẦU RA')}
          >
            ĐẦU RA
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-white text-slate-700 border-b border-slate-200">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider border-r border-slate-200">NGÀY HĐ</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider border-r border-slate-200">KÝ HIỆU</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider border-r border-slate-200">SỐ HÓA ĐƠN</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider border-r border-slate-200">ĐỐI TÁC</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider border-r border-slate-200">MÃ SỐ THUẾ</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider border-r border-slate-200">ĐỊA CHỈ</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider border-r border-slate-200 w-1/4">NỘI DUNG HÀNG HÓA</th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider border-r border-slate-200">TỔNG TIỀN</th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider">THAO TÁC</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-slate-500">
                    Không có dữ liệu hóa đơn {activeTab.toLowerCase()}.
                  </td>
                </tr>
              ) : filteredInvoices.map((invoice) => {
                const data = getParsedData(invoice.parsedData);
                if (!data) return null;
                
                return (
                  <tr key={invoice.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-700 border-r border-slate-200 align-top">{data.ngayHD}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 border-r border-slate-200 align-top">{data.kyHieu}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 border-r border-slate-200 align-top">{data.soHoaDon}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 border-r border-slate-200 align-top font-medium">{data.doiTac}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 border-r border-slate-200 align-top">{data.maSoThue}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 border-r border-slate-200 align-top">{data.diaChi}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 border-r border-slate-200 align-top">{data.noiDungHangHoa}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 border-r border-slate-200 align-top text-right whitespace-nowrap">{data.tongTien}</td>
                    <td className="px-4 py-3 text-sm text-center align-top">
                      <div className="flex flex-col gap-2 items-center justify-center">
                        <a 
                          href={invoice.webViewLink} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className={`text-blue-600 border border-blue-300 rounded px-3 py-1.5 text-xs hover:bg-blue-50 transition-colors font-medium flex items-center w-full justify-center ${!invoice.webViewLink ? 'opacity-50 pointer-events-none' : ''}`}
                        >
                          <ExternalLink className="w-3 h-3 mr-1" />
                          Xem
                        </a>
                        <button 
                          onClick={() => setSelectedInvoice(invoice)}
                          className="text-slate-500 border border-slate-300 rounded px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors font-medium w-full flex items-center justify-center"
                        >
                          <FileText className="w-3 h-3 mr-1" />
                          Chi tiết
                        </button>
                        <button 
                          onClick={() => setInvoiceToDelete(invoice)}
                          className="text-red-500 border border-red-300 rounded px-3 py-1.5 text-xs hover:bg-red-50 transition-colors font-medium w-full flex items-center justify-center"
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Details Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <h3 className="text-lg font-bold text-slate-800 flex items-center">
                <FileText className="w-5 h-5 mr-2 text-blue-500" />
                Chi tiết hóa đơn
              </h3>
              <button 
                onClick={() => setSelectedInvoice(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              {(() => {
                const data = getParsedData(selectedInvoice.parsedData);
                if (!data) return <p className="text-red-500">Lỗi: Không thể đọc dữ liệu hóa đơn.</p>;
                
                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-slate-500 font-medium">Tên file</p>
                        <div className="flex items-center gap-2">
                          <p className="text-slate-800 font-medium">{selectedInvoice.fileName}</p>
                          {selectedInvoice.webViewLink && (
                            <a 
                              href={selectedInvoice.webViewLink} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-emerald-600 hover:text-emerald-700 flex items-center text-xs bg-emerald-50 px-2 py-1 rounded"
                            >
                              <ExternalLink className="w-3 h-3 mr-1" /> Mở file
                            </a>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500 font-medium">Loại hóa đơn</p>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          data.loaiHoaDon === 'ĐẦU VÀO' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {data.loaiHoaDon}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500 font-medium">Số hóa đơn</p>
                        <p className="text-slate-800">{data.soHoaDon || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500 font-medium">Ký hiệu</p>
                        <p className="text-slate-800">{data.kyHieu || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500 font-medium">Ngày hóa đơn</p>
                        <p className="text-slate-800">{data.ngayHD || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500 font-medium">Tổng tiền</p>
                        <p className="text-slate-800 font-bold text-lg text-emerald-600">{data.tongTien || 'N/A'}</p>
                      </div>
                    </div>
                    
                    <div className="pt-4 border-t border-slate-200">
                      <p className="text-sm text-slate-500 font-medium mb-1">Đối tác</p>
                      <p className="text-slate-800 font-medium text-lg">{data.doiTac || 'N/A'}</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-slate-500 font-medium">Mã số thuế</p>
                        <p className="text-slate-800">{data.maSoThue || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500 font-medium">Địa chỉ</p>
                        <p className="text-slate-800">{data.diaChi || 'N/A'}</p>
                      </div>
                    </div>
                    
                    <div className="pt-4 border-t border-slate-200">
                      <p className="text-sm text-slate-500 font-medium mb-1">Nội dung hàng hóa/dịch vụ</p>
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-700 whitespace-pre-wrap">
                        {data.noiDungHangHoa || 'N/A'}
                      </div>
                    </div>
                    
                    <div className="pt-4 border-t border-slate-200">
                      <p className="text-sm text-slate-500 font-medium mb-2">Dữ liệu JSON gốc (từ AI)</p>
                      <pre className="bg-slate-800 text-slate-200 p-4 rounded-lg overflow-x-auto text-xs font-mono">
                        {JSON.stringify(data, null, 2)}
                      </pre>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-xl flex justify-end">
              <button 
                onClick={() => setSelectedInvoice(null)}
                className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Warning Modal */}
      {duplicateInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 text-amber-600 mb-4">
              <AlertTriangle className="w-8 h-8" />
              <h3 className="text-xl font-bold">Cảnh báo trùng lặp</h3>
            </div>
            <p className="text-slate-600 mb-4">
              Hóa đơn số <span className="font-bold text-slate-900">{duplicateInvoice.data.soHoaDon}</span> của 
              <span className="font-bold text-slate-900"> {duplicateInvoice.data.doiTac}</span> đã tồn tại trong hệ thống.
            </p>
            <p className="text-sm text-slate-500 mb-6">
              Bạn có chắc chắn muốn tiếp tục nhập hóa đơn này không? Việc này có thể gây ra sai lệch trong báo cáo tài chính.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDuplicateInvoice(null)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                onClick={() => saveInvoice(duplicateInvoice.data, JSON.stringify(duplicateInvoice.data), duplicateInvoice.file, duplicateInvoice.base64, duplicateInvoice.companyName, duplicateInvoice.existingFileId, duplicateInvoice.existingWebViewLink)}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium"
              >
                Vẫn tiếp tục nhập
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {invoiceToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Xác nhận xóa hóa đơn</h3>
            <p className="text-slate-600 mb-6">
              Bạn có chắc chắn muốn xóa hóa đơn <strong>{invoiceToDelete.fileName}</strong>? Hành động này không thể hoàn tác và sẽ xóa cả file trên Google Drive (nếu có).
            </p>
            <div className="flex gap-3 w-full">
              <button 
                onClick={() => setInvoiceToDelete(null)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-colors disabled:opacity-50"
              >
                Hủy
              </button>
              <button 
                onClick={handleDeleteInvoice}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center"
              >
                {isDeleting ? (
                  <><RefreshCw className="w-4 h-4 animate-spin mr-2" /> Đang xóa...</>
                ) : (
                  <><Trash2 className="w-4 h-4 mr-2" /> Xóa hóa đơn</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
