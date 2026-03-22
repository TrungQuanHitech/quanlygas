import React, { useState } from 'react';
import { doc, setDoc, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Loader2, ShieldCheck, Globe, CheckCircle2, ArrowRight, ArrowLeft } from 'lucide-react';

interface SetupWizardProps {
  onComplete: () => void;
}

export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form States
  const [companyName, setCompanyName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');

  const handleCompleteSetup = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Create Initial Admin User Profile (Unauthenticated write allowed via rules in setup mode)
      await addDoc(collection(db, 'users'), {
        email: adminEmail,
        displayName: adminEmail.split('@')[0],
        role: 'Quản lý',
        status: 'Chờ kích hoạt',
        createdAt: new Date().toISOString()
      });

      // 2. Create General Settings
      await setDoc(doc(db, 'settings', 'general'), {
        companyName,
        address: '',
        taxId: '',
        aiApiKey: '',
        rootFolderId: '',
        spreadsheetId: '',
        updatedAt: serverTimestamp()
      });

      // 3. Mark Setup as Complete
      await setDoc(doc(db, 'internal_config', 'setup_complete'), {
        completedAt: serverTimestamp()
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
        <div className="bg-slate-900 p-8 text-white text-center relative">
          <div className="absolute top-4 right-4 bg-blue-500 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">
            Thiết lập hệ thống
          </div>
          <ShieldCheck className="w-12 h-12 mx-auto mb-4 text-blue-400" />
          <h1 className="text-2xl font-bold">Chào mừng bạn!</h1>
          <p className="text-slate-400 text-sm mt-2">
            Hệ thống chưa được thiết lập. Hãy hoàn thành các bước cấu hình cơ bản sau để bắt đầu.
          </p>
        </div>

        <div className="flex h-1 bg-slate-100">
          <div 
            className="bg-blue-500 transition-all duration-500" 
            style={{ width: `${(step / 2) * 100}%` }}
          />
        </div>

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
                  <p className="text-slate-500 text-xs">Phân quyền và nhận diện thương hiệu</p>
                </div>
              </div>
              
              <div className="space-y-4">
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
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Email Quản Lý (Admin)</label>
                  <input 
                    type="email"
                    value={adminEmail || ''}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="admin@example.com"
                  />
                  <p className="text-xs text-slate-400 mt-2">Tài khoản này sẽ có toàn quyền truy cập toàn bộ hệ thống (đăng nhập bằng Google).</p>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={nextStep}
                  disabled={!companyName || !adminEmail || !adminEmail.includes('@')}
                  className="w-full bg-slate-900 hover:bg-black text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  Tiếp theo <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in fade-in zoom-in duration-500 text-center">
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              
              <div>
                <h2 className="text-xl font-bold text-slate-900">Sẵn sàng hoàn tất!</h2>
                <p className="text-slate-500 text-sm mt-2">
                  Bạn có thể bổ sung các cấu hình nâng cao trong phần Cài Đặt sau khi truy cập hệ thống.
                </p>
              </div>

              <div className="bg-slate-50 rounded-2xl p-6 text-left space-y-3 border border-slate-100">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Công ty:</span>
                  <span className="font-semibold text-slate-700">{companyName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Email Quản Lý:</span>
                  <span className="font-semibold text-slate-700">{adminEmail}</span>
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

        <div className="p-6 bg-slate-50 border-t border-slate-100 text-center">
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
            Hệ thống quản lý doanh nghiệp v1.0
          </p>
        </div>
      </div>
    </div>
  );
}
