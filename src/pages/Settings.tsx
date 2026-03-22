import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, query } from 'firebase/firestore';
import { db } from '../firebase';
import { loginGoogleAdminWithScopes } from '../firebase';
import { createStorageStructure } from '../services/googleApi';
import { User, Setting } from '../types';
import { Settings as SettingsIcon, Building, MapPin, FileText, Key, Save, Loader2, CheckCircle2, AlertCircle, X, LogOut, ShieldCheck, Trash2, RotateCcw, ShieldAlert } from 'lucide-react';

export default function Settings({ user }: { user: User }) {
  const [settings, setSettings] = useState<Setting>({
    companyName: '',
    address: '',
    taxId: '',
    aiApiKey: '',
    rootFolderId: '',
    spreadsheetId: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [isCreatingStorage, setIsCreatingStorage] = useState(false);
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);
  
  // Custom UI states for messages and confirmation
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info', text: React.ReactNode } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'general');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setSettings(docSnap.data() as Setting);
        }
      } catch (error) {
        console.error("Error fetching settings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
    
    // Check if token exists
    if (localStorage.getItem('googleAdminToken')) {
      setIsAdminLoggedIn(true);
    }
  }, []);

  // Auto-hide messages after 5 seconds
  useEffect(() => {
    if (message && message.type !== 'info' && message.type !== 'error') {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (user.role !== 'Quản lý' && user.role !== 'Admin') {
      setMessage({ type: 'error', text: "Bạn không có quyền thay đổi cấu hình." });
      return;
    }

    setIsSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'general'), settings);
      setMessage({ type: 'success', text: "Lưu cấu hình thành công!" });
    } catch (error) {
      console.error("Error saving settings:", error);
      setMessage({ type: 'error', text: "Lỗi khi lưu cấu hình" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleGoogleAdminLogin = async () => {
    setIsLoading(true);
    setMessage(null);
    const result = await loginGoogleAdminWithScopes();
    setIsLoading(false);
    
    if (result.success) {
      setIsAdminLoggedIn(true);
      setMessage({ type: 'success', text: "Đã xác thực tài khoản Google Admin thành công! Bạn hiện có thể sử dụng các chức năng quản trị lưu trữ." });
    } else {
      setMessage({ type: 'error', text: "Lỗi đăng nhập: " + result.message });
    }
  };

  const handleGoogleAdminLogout = () => {
    localStorage.removeItem('googleAdminToken');
    localStorage.removeItem('googleAdminTokenTime');
    setIsAdminLoggedIn(false);
    setMessage({ type: 'info', text: "Đã đăng xuất tài khoản Google Admin." });
  };

  const checkGoogleConnection = async () => {
    const token = localStorage.getItem('googleAdminToken');
    if (!token) {
      setIsAdminLoggedIn(false);
      return false;
    }

    setIsCheckingConnection(true);
    try {
      const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        setIsAdminLoggedIn(true);
        return true;
      } else {
        const errorData = await response.json().catch(() => ({}));
        const lowerMessage = (errorData.error?.message || "").toLowerCase();
        if (response.status === 401 || lowerMessage.includes('invalid') || lowerMessage.includes('expired')) {
          localStorage.removeItem('googleAdminToken');
          localStorage.removeItem('googleAdminTokenTime');
          setIsAdminLoggedIn(false);
          return false;
        }
        return false;
      }
    } catch (error) {
      return false;
    } finally {
      setIsCheckingConnection(false);
    }
  };

  const handleCreateStorageClick = async () => {
    const token = localStorage.getItem('googleAdminToken');
    if (!token) {
      setMessage({ type: 'error', text: "Vui lòng đăng nhập Google Admin trước khi tạo lưu trữ." });
      return;
    }

    // Kiểm tra kết nối trước khi tiếp tục
    const isConnected = await checkGoogleConnection();
    if (!isConnected) {
      setMessage({ 
        type: 'error', 
        text: (
          <div className="flex flex-col gap-2">
            <span>Phiên đăng nhập Google đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.</span>
            <button 
              onClick={handleGoogleAdminLogin}
              className="w-fit px-3 py-1 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700 transition-colors"
            >
              Đăng nhập lại ngay
            </button>
          </div>
        )
      });
      return;
    }

    if (!settings.companyName) {
      setMessage({ type: 'error', text: "Vui lòng lưu Tên Công Ty trong phần Cấu hình chung trước khi tạo thư mục lưu trữ." });
      return;
    }

    setShowConfirm(true);
  };

  const executeCreateStorage = async () => {
    setShowConfirm(false);
    setIsCreatingStorage(true);
    setMessage({ type: 'info', text: "Đang tạo cấu trúc thư mục và Google Sheet, vui lòng đợi..." });
    
    try {
      const token = localStorage.getItem('googleAdminToken');
      const result = await createStorageStructure(token!, settings.companyName);
      if (result.success) {
        // Cập nhật settings với các ID mới
        const updatedSettings = {
          ...settings,
          rootFolderId: result.rootFolderId,
          spreadsheetId: result.spreadsheetId
        };
        setSettings(updatedSettings);
        await setDoc(doc(db, 'settings', 'general'), updatedSettings);

        setMessage({ 
          type: 'success', 
          text: `Tạo lưu trữ thành công! Đã tạo thư mục gốc: ${settings.companyName}, các thư mục con và Spreadsheet. Các ID đã được lưu vào cấu hình hệ thống.` 
        });
      } else {
        const lowerMessage = result.message.toLowerCase();
        if (
          lowerMessage.includes('invalid authentication credentials') || 
          lowerMessage.includes('invalid credentials') || 
          lowerMessage.includes('unauthenticated') ||
          lowerMessage.includes('401')
        ) {
          localStorage.removeItem('googleAdminToken');
          setIsAdminLoggedIn(false);
          setMessage({ 
            type: 'error', 
            text: (
              <div className="flex flex-col gap-2">
                <span>Phiên đăng nhập Google Admin đã hết hạn hoặc không hợp lệ.</span>
                <button 
                  onClick={handleGoogleAdminLogin}
                  className="w-fit px-3 py-1 bg-red-600 text-white rounded text-xs font-bold hover:bg-red-700 transition-colors"
                >
                  Đăng nhập lại ngay
                </button>
              </div>
            )
          });
        } else if (lowerMessage.includes('api has not been used in project') || lowerMessage.includes('is disabled')) {
          const urlMatch = result.message.match(/https:\/\/[^\s]+/);
          const driveUrl = urlMatch ? urlMatch[0] : 'https://console.cloud.google.com/apis/library/drive.googleapis.com';
          
          // Extract project ID if possible to build a direct link for Sheets API too
          const projectMatch = result.message.match(/project (\d+)/);
          const projectId = projectMatch ? projectMatch[1] : '';
          const sheetsUrl = projectId 
            ? `https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=${projectId}`
            : 'https://console.cloud.google.com/apis/library/sheets.googleapis.com';

          setMessage({ 
            type: 'error', 
            text: (
              <span className="block">
                <strong className="block mb-1 text-red-700">API chưa được bật trên Google Cloud!</strong>
                Hệ thống cần bạn bật 2 API sau đây trong Google Cloud Console để hoạt động:<br/>
                <div className="mt-2 space-y-2">
                  <a href={driveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center px-3 py-1 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700 transition-colors">
                    1. Bật Google Drive API
                  </a>
                  <br/>
                  <a href={sheetsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center px-3 py-1 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-700 transition-colors">
                    2. Bật Google Sheets API
                  </a>
                </div>
                <span className="text-xs mt-3 block text-slate-600 italic">
                  * Sau khi nhấn "Enable" (Bật) cho cả 2 link trên, vui lòng đợi khoảng 2-3 phút để Google cập nhật rồi quay lại đây thử lại nhé.
                </span>
              </span>
            )
          });
        } else {
          setMessage({ type: 'error', text: "Có lỗi xảy ra: " + result.message });
        }
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: "Lỗi hệ thống: " + error.message });
    } finally {
      setIsCreatingStorage(false);
    }
  };

  const handleSystemReset = async () => {
    if (resetConfirmText !== 'RESET') {
      setMessage({ type: 'error', text: "Vui lòng nhập đúng chữ 'RESET' để xác nhận." });
      return;
    }

    setIsResetting(true);
    setMessage({ type: 'info', text: "Đang tiến hành xóa sạch dữ liệu hệ thống, vui lòng không đóng trình duyệt..." });

    try {
      // 1. Delete setup documents in specific order
      // Deleting setup_complete first makes isSetupMode() true, which helps with permissions
      await deleteDoc(doc(db, 'internal_config', 'setup_complete'));
      console.log("Deleted setup_complete");
      
      await deleteDoc(doc(db, 'settings', 'general'));
      console.log("Deleted settings/general");

      // 2. Clear collections
      const collectionsToClear = ['tasks', 'records', 'invoices', 'users'];
      
      for (const colName of collectionsToClear) {
        const q = query(collection(db, colName));
        const snapshot = await getDocs(q);
        
        // Filter out the current user's identity document to maintain permissions during the process
        const docsToDelete = snapshot.docs.filter(d => d.id !== user.uid);

        console.log(`Deleting ${docsToDelete.length} documents from ${colName}`);
        
        // Delete in smaller chunks to avoid overwhelming the connection or hitting limits
        for (let i = 0; i < docsToDelete.length; i += 10) {
          const chunk = docsToDelete.slice(i, i + 10);
          await Promise.all(chunk.map(d => deleteDoc(d.ref)));
        }
      }

      // 3. Finally, delete the current user's identity document
      await deleteDoc(doc(db, 'users', user.uid));
      console.log("Deleted current user profile");

      setMessage({ type: 'success', text: "Hệ thống đã được xóa sạch. Bạn sẽ được đăng xuất ngay bây giờ." });
      
      // Delay for user to see message then reload
      setTimeout(() => {
        window.location.reload();
      }, 2000);

    } catch (error: any) {
      console.error("Reset error:", error);
      setMessage({ type: 'error', text: "Lỗi khi reset hệ thống: " + error.message });
      setIsResetting(false);
    }
  };

  if (isLoading && !isAdminLoggedIn && !isCreatingStorage) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto relative">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">Cấu hình Hệ thống</h1>
      </div>

      {/* Notification Message */}
      {message && (
        <div className={`p-4 rounded-lg flex items-start shadow-sm border ${
          message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 
          message.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 
          'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" /> : 
           message.type === 'error' ? <AlertCircle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" /> :
           <Loader2 className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0 animate-spin" />}
          <div className="flex-1 font-medium text-sm">{message.text}</div>
          {message.type !== 'info' && (
            <button onClick={() => setMessage(null)} className="ml-3 text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Xác nhận tạo lưu trữ</h3>
            <p className="text-slate-600 mb-6">
              Hệ thống sẽ tạo cấu trúc thư mục cho công ty <strong>"{settings.companyName}"</strong> và các Sheet lưu trữ trên Google Drive của bạn. Bạn có muốn tiếp tục?
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
              >
                Hủy bỏ
              </button>
              <button 
                onClick={executeCreateStorage}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors"
              >
                Đồng ý tạo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset System Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 animate-in zoom-in duration-200">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 text-center mb-2">Xác nhận xóa sạch hệ thống?</h3>
            <p className="text-slate-500 text-center text-sm mb-6">
              Hành động này sẽ xóa <strong>TOÀN BỘ</strong> dữ liệu: cấu hình, nhân sự, công việc, hồ sơ và hóa đơn. Bạn sẽ phải thực hiện lại quá trình Setup Wizard từ đầu.
            </p>
            
            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2 text-center">Nhập "RESET" để xác nhận</label>
              <input 
                type="text"
                value={resetConfirmText || ''}
                onChange={(e) => setResetConfirmText(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 text-center font-bold tracking-widest"
                placeholder="RESET"
              />
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setShowResetModal(false);
                  setResetConfirmText('');
                }}
                disabled={isResetting}
                className="flex-1 px-4 py-3 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition-colors disabled:opacity-50"
              >
                Hủy bỏ
              </button>
              <button 
                onClick={handleSystemReset}
                disabled={isResetting || resetConfirmText !== 'RESET'}
                className="flex-[2] px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-red-100"
              >
                {isResetting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                Xóa sạch & Reset
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center">
            <SettingsIcon className="w-5 h-5 mr-2 text-slate-500" />
            Thông tin chung
          </h2>
        </div>
        <div className="p-6">
          <form onSubmit={handleSave} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center">
                <Building className="w-4 h-4 mr-2 text-slate-400" />
                Tên Công Ty
              </label>
              <input 
                type="text" 
                required
                value={settings.companyName || ''}
                onChange={(e) => setSettings({...settings, companyName: e.target.value})}
                disabled={user.role !== 'Quản lý' && user.role !== 'Admin' && user.role !== 'Khách'}
                className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
                placeholder="Nhập tên công ty..."
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center">
                <MapPin className="w-4 h-4 mr-2 text-slate-400" />
                Địa Chỉ
              </label>
              <input 
                type="text" 
                value={settings.address || ''}
                onChange={(e) => setSettings({...settings, address: e.target.value})}
                disabled={user.role !== 'Quản lý' && user.role !== 'Admin' && user.role !== 'Khách'}
                className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
                placeholder="Nhập địa chỉ công ty..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center">
                <FileText className="w-4 h-4 mr-2 text-slate-400" />
                Mã Số Thuế
              </label>
              <input 
                type="text" 
                value={settings.taxId || ''}
                onChange={(e) => setSettings({...settings, taxId: e.target.value})}
                disabled={user.role !== 'Quản lý' && user.role !== 'Admin' && user.role !== 'Khách'}
                className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
                placeholder="Nhập mã số thuế..."
              />
            </div>

            <div className="pt-4 border-t border-slate-200">
              <label className="block text-sm font-bold text-red-600 mb-1 flex items-center">
                <Key className="w-4 h-4 mr-2 text-red-500" />
                Gemini API Key (Dùng cho AI Hóa Đơn)
              </label>
              <p className="text-xs text-slate-500 mb-2">Khóa API này được sử dụng để gọi dịch vụ phân tích hóa đơn tự động.</p>
              {user.role === 'Admin' ? (
                <input 
                  type="password" 
                  value={settings.aiApiKey || ''}
                  onChange={(e) => setSettings({...settings, aiApiKey: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono"
                  placeholder="AI API Key..."
                />
              ) : (
                <div className="p-3 bg-slate-100 rounded-lg text-slate-500 text-sm italic">
                  Bạn không có quyền xem hoặc chỉnh sửa mã API này.
                </div>
              )}
            </div>

            {(user.role === 'Quản lý' || user.role === 'Admin' || user.role === 'Khách') && (
              <div className="pt-4 flex justify-end">
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center shadow-sm"
                >
                  {isSaving ? (
                    <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Đang lưu...</>
                  ) : (
                    <><Save className="w-5 h-5 mr-2" /> Lưu Cấu Hình</>
                  )}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Google Admin & Storage */}
      {(user.role === 'Quản lý' || user.role === 'Admin') ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h2 className="text-lg font-semibold text-slate-800 flex items-center">
              <svg className="w-5 h-5 mr-2 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
              </svg>
              Google Admin & Lưu trữ
            </h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Đăng nhập tài khoản Google Admin để kết nối và tự động tạo các sheet lưu trữ dữ liệu tương ứng với các tab (Công Việc, Hồ Sơ, Hóa Đơn, Nhân Sự, Cấu Hình) để quản lý một cách thông minh.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                {isAdminLoggedIn ? (
                  <>
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-2 rounded-lg font-medium flex items-center shadow-sm">
                      <CheckCircle2 className="w-5 h-5 mr-2" />
                      Đã kết nối Google Admin
                    </div>
                    
                    <button 
                      type="button"
                      onClick={async () => {
                        const ok = await checkGoogleConnection();
                        if (ok) setMessage({ type: 'success', text: "Kết nối Google API hoạt động tốt!" });
                        else setMessage({ type: 'error', text: "Kết nối thất bại. Vui lòng đăng nhập lại." });
                      }}
                      disabled={isCheckingConnection}
                      className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg text-xs font-bold transition-colors flex items-center shadow-sm disabled:opacity-50"
                    >
                      {isCheckingConnection ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Save className="w-3 h-3 mr-2" />}
                      Kiểm tra kết nối
                    </button>
  
                    <div className="flex gap-2">
                      <a 
                        href="https://console.cloud.google.com/apis/library/drive.googleapis.com" 
                        target="_blank" 
                        rel="noreferrer" 
                        className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors flex items-center shadow-sm"
                      >
                        Bật Drive API
                      </a>
                      <a 
                        href="https://console.cloud.google.com/apis/library/sheets.googleapis.com" 
                        target="_blank" 
                        rel="noreferrer" 
                        className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-colors flex items-center shadow-sm"
                      >
                        Bật Sheets API
                      </a>
                    </div>
  
                    <button 
                      type="button"
                      onClick={handleGoogleAdminLogout}
                      className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-medium transition-colors flex items-center shadow-sm"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Đăng xuất Admin
                    </button>
                  </>
                ) : (
                  <button 
                    type="button"
                    onClick={handleGoogleAdminLogin}
                    className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-medium transition-colors flex items-center shadow-sm"
                  >
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5 mr-2" />
                    Đăng nhập Google Admin
                  </button>
                )}
                
                <button 
                  type="button"
                  onClick={handleCreateStorageClick}
                  disabled={!isAdminLoggedIn || isCreatingStorage}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreatingStorage ? (
                    <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Đang tạo...</>
                  ) : (
                    <><FileText className="w-5 h-5 mr-2" /> Tạo Sheet & Thư Mục Lưu Trữ</>
                  )}
                </button>
              </div>
              {!isAdminLoggedIn && (
                <p className="text-xs text-amber-600 mt-2">
                  * Yêu cầu đăng nhập Google Admin để cấp quyền tạo thư mục và Google Sheet.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mt-6">
          <div className="flex items-center text-amber-800 font-bold mb-2">
            <AlertCircle className="w-5 h-5 mr-2" />
            Hạn chế quyền truy cập
          </div>
          <p className="text-sm text-amber-700">
            Phần cấu hình nâng cao (API Key, Google Admin) chỉ dành cho tài khoản <strong>Quản lý</strong>. 
            Vui lòng liên hệ Quản lý nếu bạn cần thay đổi các thông số này.
          </p>
        </div>
      )}

      {/* Danger Zone - Only for Quản lý or Admin */}
      {(user.role === 'Quản lý' || user.role === 'Admin') && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-8 mt-12">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-red-900">Vùng nguy hiểm</h2>
              <p className="text-red-600/70 text-sm">Các tùy chọn này có thể gây mất dữ liệu vĩnh viễn.</p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 border border-red-100 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex-1">
              <h3 className="font-bold text-slate-900 mb-1">Reset toàn bộ hệ thống</h3>
              <p className="text-slate-500 text-sm">Xóa sạch mọi cấu hình, dữ liệu và đưa ứng dụng về trạng thái khởi tạo ban đầu (Setup Wizard).</p>
            </div>
            <button 
              onClick={() => setShowResetModal(true)}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg shadow-red-100 shrink-0"
            >
              <RotateCcw className="w-5 h-5" />
              Reset & Cấu hình lại
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
