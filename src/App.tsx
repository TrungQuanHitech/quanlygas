import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, User as FirebaseUser, signOut, signInAnonymously } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, limit, updateDoc } from 'firebase/firestore';
import { auth, db, loginWithGoogle } from './firebase';
import { User } from './types';
import Layout from './components/Layout';
import SetupWizard from './components/SetupWizard';
import Tasks from './pages/Tasks';
import Records from './pages/Records';
import Invoices from './pages/Invoices';
import Personnel from './pages/Personnel';
import Settings from './pages/Settings';
import { Loader2, LogIn, ShieldAlert, Settings as SettingsIcon } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSetupComplete, setIsSetupComplete] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Guest Login States
  const [showGuestInput, setShowGuestInput] = useState(false);
  const [guestPassword, setGuestPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const setupRef = doc(db, 'internal_config', 'setup_complete');
        const setupSnap = await getDoc(setupRef);
        setIsSetupComplete(setupSnap.exists());
      } catch (e) {
        console.error("Error checking setup status:", e);
        setIsSetupComplete(true);
      }
    };
    checkSetup();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (isSetupComplete === null) return;
      
      setLoading(true);
      setError(null);
      
      if (currentUser) {
        if (currentUser.isAnonymous) {
          setUserData({
             uid: currentUser.uid,
             email: 'guest@system.local',
             displayName: 'Khách Truy Cập',
             role: 'Khách',
             status: 'Đang làm việc',
             createdAt: new Date().toISOString(),
             lastLogin: new Date().toISOString()
          });
          setUser(currentUser);
          setLoading(false);
          return;
        }

        try {
          const usersRef = collection(db, 'users');
          const q = query(usersRef, where('email', '==', currentUser.email), limit(1));
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
            const userDoc = querySnapshot.docs[0];
            const existingData = userDoc.data() as User;
            const userRef = doc(db, 'users', userDoc.id);

            if (existingData.status === 'Tạm nghỉ' || existingData.status === 'Đã nghỉ việc') {
              await signOut(auth);
              setError("Tài khoản của bạn đã bị khóa hoặc ngừng hoạt động. Vui lòng liên hệ Quản lý.");
              setUserData(null);
              setUser(null);
            } else {
              const updates: any = {
                lastLogin: new Date().toISOString(),
                displayName: currentUser.displayName || existingData.displayName
              };

              if (!existingData.uid || existingData.status === 'Chờ kích hoạt') {
                updates.uid = currentUser.uid;
                updates.status = 'Đang làm việc';
              }

              await updateDoc(userRef, updates);
              
              setUserData({ ...existingData, ...updates });
              setUser(currentUser);
            }
          } else {
            await signOut(auth);
            setError("Email này chưa được cấp quyền truy cập hệ thống. Vui lòng liên hệ Quản lý để thêm vào danh sách nhân sự.");
            setUserData(null);
            setUser(null);
          }
        } catch (err: any) {
          console.error("Auth state check error:", err);
          if (err.code !== 'permission-denied') {
            setError("Lỗi xác thực hệ thống: " + (err.message || "Không xác định"));
          }
        }
      } else {
        setUser(null);
        setUserData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isSetupComplete]);

  const handleLogout = async () => {
    await signOut(auth);
    setUserData(null);
    setUser(null);
  };
  
  const handleLogin = async () => {
    setIsLoggingIn(true);
    setError(null);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      if (err.code === 'auth/popup-blocked') {
        setError("Trình duyệt đã chặn cửa sổ đăng nhập. Vui lòng cho phép hiện popup và thử lại.");
      } else if (err.code === 'auth/cancelled-popup-request') {
        // Ignore user cancellation
      } else {
        setError("Lỗi đăng nhập: " + (err.message || "Không xác định"));
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGuestLogin = async () => {
    if (guestPassword === '123456') {
      setIsLoggingIn(true);
      setError(null);
      try {
        await signInAnonymously(auth);
      } catch(e: any) {
        setError("Lỗi truy cập cấu hình: " + e.message);
      } finally {
        setIsLoggingIn(false);
      }
    } else {
      setError("Mật mã không chính xác!");
    }
  };

  if (isSetupComplete === null || (loading && isSetupComplete !== false)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (isSetupComplete === false) {
    return (
      <SetupWizard 
        onComplete={() => window.location.reload()}
      />
    );
  }

  if (!user && !userData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 relative">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center max-w-md w-full relative z-10 flex flex-col items-center">
          {error ? (
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
              <ShieldAlert className="w-8 h-8" />
            </div>
          ) : (
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
              <LogIn className="w-8 h-8" />
            </div>
          )}
          
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Hệ Thống Quản Lý</h1>
          
          {error ? (
            <div className="mb-6 w-full">
              <p className="text-red-600 font-medium mb-2">Truy cập bị từ chối</p>
              <p className="text-slate-500 text-sm">{error}</p>
            </div>
          ) : (
            <p className="text-slate-500 mb-6">Vui lòng đăng nhập để truy cập hệ thống</p>
          )}

          <button
            onClick={handleLogin}
            disabled={isLoggingIn}
            className={`w-full ${isLoggingIn ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} text-white font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center mb-6`}
          >
            {isLoggingIn ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            ) : (
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5 mr-2 bg-white rounded-full p-0.5" />
            )}
            {isLoggingIn ? 'Đang xử lý...' : (error ? 'Thử đăng nhập tài khoản khác' : 'Đăng nhập với Google')}
          </button>

          <div className="w-full border-t border-slate-200 pt-6">
            {showGuestInput ? (
              <div className="flex flex-col gap-3">
                <input 
                  type="password"
                  value={guestPassword}
                  onChange={(e) => setGuestPassword(e.target.value)}
                  placeholder="Nhập mật mã '123456'"
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 font-medium text-center tracking-widest"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleGuestLogin() }}
                />
                <button 
                  onClick={handleGuestLogin}
                  disabled={isLoggingIn || !guestPassword}
                  className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center disabled:opacity-50"
                >
                  {isLoggingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : "Vào cấu hình"}
                </button>
                <button 
                  onClick={() => { setShowGuestInput(false); setError(null); }}
                  className="text-xs text-slate-400 hover:text-slate-600 mt-2"
                >
                  Quay lại
                </button>
              </div>
            ) : (
              <button 
                onClick={() => { setShowGuestInput(true); setError(null); }}
                className="text-sm font-medium text-slate-500 hover:text-slate-800 flex items-center justify-center mx-auto transition-colors"
              >
                <SettingsIcon className="w-4 h-4 mr-2" />
                Cấu hình hệ thống
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout user={userData!} onLogout={handleLogout} />}>
          <Route index element={<Navigate to={userData?.role === 'Khách' ? '/settings' : '/tasks'} replace />} />
          {userData?.role !== 'Khách' && (
            <>
              <Route path="tasks" element={<Tasks user={userData!} />} />
              <Route path="records" element={<Records user={userData!} />} />
              <Route path="invoices" element={<Invoices user={userData!} />} />
              <Route path="personnel" element={<Personnel user={userData!} />} />
            </>
          )}
          <Route path="settings" element={<Settings user={userData!} />} />
          <Route path="*" element={<Navigate to={userData?.role === 'Khách' ? '/settings' : '/tasks'} replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
