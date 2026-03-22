import React, { useState, useEffect } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, loginGoogleAdminWithScopes, logout } from '../firebase';
import { createStorageStructure } from '../services/googleApi';
import { Loader2, ShieldCheck, Globe, Key, CheckCircle2, ArrowRight, ArrowLeft, FileText, CheckCircle } from 'lucide-react';

interface SetupWizardProps {
  onComplete: () => void;
  userEmail: string;
  userId: string;
}

export default function SetupWizard({ onComplete, userEmail, userId }: SetupWizardProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form States
  const [companyName, setCompanyName] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [rootFolderId, setRootFolderId] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [isCreatingStorage, setIsCreatingStorage] = useState(false);
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);

  useEffect(() => {
    const checkExistingToken = async () => {
      const token = localStorage.getItem('googleAdminToken');
      if (token) {
        setIsCheckingConnection(true);
        try {
          const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (response.ok) {
            setIsAdminLoggedIn(true);
          } else {
            localStorage.removeItem('googleAdminToken');
            setIsAdminLoggedIn(false);
          }
        } catch (err) {
          localStorage.removeItem('googleAdminToken');
          setIsAdminLoggedIn(false);
        } finally {
          setIsCheckingConnection(false);
        }
      }
    };
    checkExistingToken();
  }, []);

  const handleGoogleAdminLogin = async () => {
    setLoading(true);
    setError(null);
    const result = await loginGoogleAdminWithScopes();
    setLoading(false);
    
    if (result.success) {
      setIsAdminLoggedIn(true);
    } else {
      setError("Lỗi đăng nhập Google Admin: " + result.message);
    }
  };

  const handleCreateStorage = async () => {
    const token = localStorage.getItem('googleAdminToken');
    if (!token) {
      setError("Vui lòng đăng nhập Google Admin trước.");
      setIsAdminLoggedIn(false);
      return;
    }

    setIsCreatingStorage(true);
    setError(null);
    
    try {
      const result = await createStorageStructure(token, companyName);
      if (result.success) {
        setRootFolderId(result.rootFolderId!);
        setSpreadsheetId(result.spreadsheetId!);
      } else {
        const lowerMessage = result.message.toLowerCase();
        if (lowerMessage.includes('invalid authentication credentials') || lowerMessage.includes('401')) {
          localStorage.removeItem('googleAdminToken');
          setIsAdminLoggedIn(false);
          setError("Phiên đăng nhập Google đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.");
        } else {
          setError("Lỗi khi tạo lưu trữ: " + result.message);
        }
      }
    } catch (err: any) {
      setError("Lỗi hệ thống khi tạo lưu trữ: " + err.message);
    } finally {
      setIsCreatingStorage(false);
    }
  };

  const handleCompleteSetup = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Create User Profile (if not already created by App.tsx)
      const userRef = doc(db, 'users', userId);
      await setDoc(userRef, {
        uid: userId,
        email: userEmail,
        displayName: userEmail.split('@')[0],
        role: 'Quản lý',
        status: 'Đang làm việc',
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      }, { merge: true });

      // 2. Create General Settings
      await setDoc(doc(db, 'settings', 'general'), {
        companyName,
        aiApiKey,
        rootFolderId,
        spreadsheetId,
        updatedAt: serverTimestamp()
      });

      // 3. Mark Setup as Complete
      await setDoc(doc(db, 'internal_config', 'setup_complete'), {
        completedAt: serverTimestamp(),
        completedBy: userId
      });

      onComplete();
    } catch (err: any) {
      console.error("Setup error:", err);
      setError("Đã xảy ra lỗi trong quá trình cấu hình: " + (err.message || "Không xác định"));
    } finally {
      setLoading(false);
    }
  };

  const nextStep = () => setStep(s => s + 1);
  const prevStep = () => setStep(s => s - 1);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 p-8 text-white text-center relative">
          <div className="absolute top-4 right-4 bg-blue-500 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">
            Thiết lập hệ thống
          </div>
          <ShieldCheck className="w-12 h-12 mx-auto mb-4 text-blue-400" />
          <h1 className="text-2xl font-bold">Chào mừng bạn!</h1>
          <p className="text-slate-400 text-sm mt-2">
            Bạn là người đầu tiên đăng nhập. Hãy hoàn thành các bước cấu hình sau để bắt đầu sử dụng phần mềm.
          </p>
        </div>

        {/* Progress Bar */}
        <div className="flex h-1 bg-slate-100">
          <div 
            className="bg-blue-500 transition-all duration-500" 
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        {/* Steps Content */}
        <div className="p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl font-medium">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center gap-4 mb-2">
                <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center shrink-0">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900">Thông tin cơ bản</h2>
                  <p className="text-slate-500 text-xs">Tên công ty và nhận diện thương hiệu</p>
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Tên công ty / Tổ chức</label>
                <input 
                  type="text"
                  value={companyName || ''}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Ví dụ: Công ty TNHH ABC"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => logout()}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" /> Đăng xuất
                </button>
                <button 
                  onClick={nextStep}
                  disabled={!companyName}
                  className="flex-[2] bg-slate-900 hover:bg-black text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  Tiếp theo <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="flex items-center gap-4 mb-2">
                <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center shrink-0">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900">Google Admin & Lưu trữ</h2>
                  <p className="text-slate-500 text-xs">Kết nối với hệ sinh thái Google</p>
                </div>
              </div>

              <div className="grid gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Gemini API Key (AI Parsing)</label>
                  <input 
                    type="password"
                    value={aiApiKey || ''}
                    onChange={(e) => setAiApiKey(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                    placeholder="AI API Key..."
                  />
                </div>

                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">Kết nối Google Admin</span>
                    {isCheckingConnection ? (
                      <span className="flex items-center text-xs text-slate-400 gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Đang kiểm tra...
                      </span>
                    ) : isAdminLoggedIn ? (
                      <span className="flex items-center text-xs font-bold text-emerald-600 gap-1">
                        <CheckCircle className="w-4 h-4" /> Đã kết nối
                      </span>
                    ) : (
                      <button 
                        onClick={handleGoogleAdminLogin}
                        className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors flex items-center gap-2"
                      >
                        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-4 h-4" />
                        Đăng nhập
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-slate-700">Tạo thư mục & Sheet</span>
                      <span className="text-[10px] text-slate-400 italic">Tự động tạo cấu trúc lưu trữ</span>
                    </div>
                    {rootFolderId && spreadsheetId ? (
                      <span className="flex items-center text-xs font-bold text-emerald-600 gap-1">
                        <CheckCircle className="w-4 h-4" /> Đã tạo
                      </span>
                    ) : (
                      <button 
                        onClick={handleCreateStorage}
                        disabled={!isAdminLoggedIn || isCreatingStorage}
                        className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                      >
                        {isCreatingStorage ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                        Tạo ngay
                      </button>
                    )}
                  </div>

                  {(rootFolderId || spreadsheetId) && (
                    <div className="pt-2 space-y-1">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-400">Folder ID:</span>
                        <span className="font-mono text-slate-600">{rootFolderId.substring(0, 15)}...</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-400">Sheet ID:</span>
                        <span className="font-mono text-slate-600">{spreadsheetId.substring(0, 15)}...</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={prevStep}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" /> Quay lại
                </button>
                <button 
                  onClick={nextStep}
                  disabled={!aiApiKey || !rootFolderId || !spreadsheetId}
                  className="flex-[2] bg-slate-900 hover:bg-black text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  Tiếp theo <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-in fade-in zoom-in duration-500 text-center">
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              
              <div>
                <h2 className="text-xl font-bold text-slate-900">Sẵn sàng hoàn tất!</h2>
                <p className="text-slate-500 text-sm mt-2">
                  Mọi thông tin đã được ghi nhận. Hệ thống sẽ khởi tạo dữ liệu ngay sau khi bạn nhấn nút bên dưới.
                </p>
              </div>

              <div className="bg-slate-50 rounded-2xl p-6 text-left space-y-3 border border-slate-100">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Công ty:</span>
                  <span className="font-semibold text-slate-700">{companyName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Admin Email:</span>
                  <span className="font-semibold text-slate-700">{userEmail}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Lưu trữ:</span>
                  <span className="font-semibold text-emerald-600">Đã sẵn sàng</span>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={prevStep}
                  disabled={loading}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <ArrowLeft className="w-4 h-4" /> Quay lại
                </button>
                <button 
                  onClick={handleCompleteSetup}
                  disabled={loading}
                  className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-blue-200"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Hoàn tất & Bắt đầu"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="p-6 bg-slate-50 border-t border-slate-100 text-center">
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
            Hệ thống quản lý doanh nghiệp v1.0
          </p>
        </div>
      </div>
    </div>
  );
}
