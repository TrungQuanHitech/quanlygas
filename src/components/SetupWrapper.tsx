import React, { useState } from 'react';
import { doc, setDoc, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { db, logout } from '../firebase';
import { User } from '../types';
import Settings from '../pages/Settings';

interface SetupWrapperProps {
  onComplete: () => void;
}

export default function SetupWrapper({ onComplete }: SetupWrapperProps) {
  const [adminEmail, setAdminEmail] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // Dummy user with Quản lý rights so Settings allows full access
  const setupUser: User = { 
    uid: 'setup_admin',
    role: 'Quản lý', 
    email: adminEmail || 'admin@setup.local', 
    displayName: 'Quản trị viên (Setup)', 
    status: 'Đang làm việc', 
    createdAt: new Date().toISOString() 
  };

  const handleFinish = async () => {
    if (!adminEmail || !adminEmail.includes('@')) return alert('Vui lòng nhập Email hợp lệ cho Quản lý!');
    setIsSaving(true);
    try {
      try { await logout(); } catch(e) {}
      
      await addDoc(collection(db, 'users'), {
        email: adminEmail,
        displayName: adminEmail.split('@')[0],
        role: 'Quản lý',
        status: 'Chờ kích hoạt',
        createdAt: new Date().toISOString()
      });
      await setDoc(doc(db, 'internal_config', 'setup_complete'), {
        completedAt: serverTimestamp()
      });
      onComplete();
    } catch(err: any) {
      alert("Lỗi hoàn tất: " + err.message);
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-3xl mx-auto px-4 space-y-6">
        <div className="bg-blue-600 text-white rounded-2xl p-6 shadow-lg flex flex-col md:flex-row gap-6 items-center justify-between relative overflow-hidden">
           {/* Decorative background element */}
           <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
           
           <div className="relative z-10">
              <h1 className="text-2xl font-bold flex items-center"><span className="text-3xl mr-2">🚀</span> Cài đặt Hệ thống lần đầu</h1>
              <p className="text-blue-100 text-sm mt-2 max-w-lg">
                Hệ thống chưa thiết lập. Bạn đang có toàn quyền quản trị trang cấu hình bên dưới. 
                Hãy thao tác cấu hình <strong>Thông tin chung</strong> và <strong>Google Admin</strong> trước khi giao quyền quản trị.
              </p>
           </div>
           <div className="w-full md:w-auto flex flex-col gap-2 bg-slate-900/40 p-4 rounded-xl backdrop-blur-md border border-white/10 shrink-0 relative z-10 shadow-inner">
             <label className="text-[10px] font-bold text-blue-200 uppercase tracking-widest pl-1">Chốt Quyền & Hoàn Tất</label>
             <input 
               type="email" 
               value={adminEmail} 
               onChange={e => setAdminEmail(e.target.value)} 
               placeholder="Nhập email Admin vĩnh viễn..." 
               className="px-4 py-2.5 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400 w-full md:w-64 text-sm font-medium shadow-sm"
             />
             <button 
               onClick={handleFinish}
               disabled={!adminEmail || !adminEmail.includes('@') || isSaving}
               className="bg-white text-blue-700 font-bold px-4 py-2.5 rounded-lg shadow-sm hover:bg-slate-50 transition-all disabled:opacity-50 disabled:grayscale mt-2 active:scale-95"
             >
               {isSaving ? 'Đang xử lý...' : 'Khóa Hệ Thống'}
             </button>
           </div>
        </div>

        {/* Màn hình Cấu Hình Component trực tiếp */}
        <Settings user={setupUser} />
      </div>
    </div>
  );
}
