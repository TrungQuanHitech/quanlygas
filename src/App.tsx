import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, User as FirebaseUser, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs, limit, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, loginWithGoogle } from './firebase';
import { User, Role, Setting } from './types';
import { format } from 'date-fns';
import Layout from './components/Layout';
import SetupWizard from './components/SetupWizard';
import Tasks from './pages/Tasks';
import Records from './pages/Records';
import Invoices from './pages/Invoices';
import Personnel from './pages/Personnel';
import Settings from './pages/Settings';
import { Loader2, LogIn, ShieldAlert, LogOut, ShieldCheck, User as UserIcon } from 'lucide-react';
import { appendRowToSheet } from './services/googleApi';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSetupNeeded, setIsSetupNeeded] = useState(false);
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      setError(null);
      
      if (currentUser) {
        try {
          // Check if setup is complete
          const setupRef = doc(db, 'internal_config', 'setup_complete');
          const setupSnap = await getDoc(setupRef);
          const setupComplete = setupSnap.exists();
          setIsSetupComplete(setupComplete);

          try {
            // 1. Check if user exists by email (Whitelist check)
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('email', '==', currentUser.email), limit(1));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
              const userDoc = querySnapshot.docs[0];
              const existingData = userDoc.data() as User;
              const userRef = doc(db, 'users', userDoc.id);

              // Check status
              if (existingData.status === 'Tạm nghỉ' || existingData.status === 'Đã nghỉ việc') {
                await signOut(auth);
                setError("Tài khoản của bạn đã bị khóa hoặc ngừng hoạt động. Vui lòng liên hệ Quản lý.");
                setUserData(null);
                setUser(null);
              } else {
                // Update UID and status if first time or "Chờ kích hoạt"
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
                setIsSetupNeeded(!setupComplete && (existingData.role === 'Quản lý' || existingData.role === 'Admin'));
              }
            } else {
              // Not in whitelist. Check if this is the first user ever
              if (!setupComplete) {
                // First user! They will be the admin
                setIsSetupNeeded(true);
                setUser(currentUser);
                setUserData({
                  uid: currentUser.uid,
                  email: currentUser.email || '',
                  displayName: currentUser.displayName || '',
                  role: 'Quản lý',
                  status: 'Đang làm việc',
                  createdAt: new Date().toISOString(),
                  lastLogin: new Date().toISOString()
                });
              } else {
                // Not in whitelist and setup is already done
                await signOut(auth);
                setError("Email này chưa được cấp quyền truy cập hệ thống. Vui lòng liên hệ Quản lý để thêm vào danh sách nhân sự.");
                setUserData(null);
                setUser(null);
              }
            }
          } catch (err: any) {
            console.error("Auth error:", err);
            setError("Đã xảy ra lỗi khi xác thực tài khoản.");
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
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    setUserData(null);
    setUser(null);
  };

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (isSetupNeeded && user && userData) {
    return (
      <SetupWizard 
        userId={user.uid}
        userEmail={user.email || ''}
        onComplete={() => setIsSetupNeeded(false)}
      />
    );
  }

  if (!user && !userData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 relative">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center max-w-md w-full relative z-10">
          {error ? (
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldAlert className="w-8 h-8" />
            </div>
          ) : (
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <LogIn className="w-8 h-8" />
            </div>
          )}
          
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Hệ Thống Quản Lý</h1>
          
          {error ? (
            <div className="mb-6">
              <p className="text-red-600 font-medium mb-2">Truy cập bị từ chối</p>
              <p className="text-slate-500 text-sm">{error}</p>
            </div>
          ) : (
            <p className="text-slate-500 mb-6">Vui lòng đăng nhập để truy cập hệ thống</p>
          )}

          <button
            onClick={handleLogin}
            disabled={isLoggingIn}
            className={`w-full ${isLoggingIn ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} text-white font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center`}
          >
            {isLoggingIn ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            ) : (
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5 mr-2" />
            )}
            {isLoggingIn ? 'Đang xử lý...' : (error ? 'Thử đăng nhập tài khoản khác' : 'Đăng nhập với Google')}
          </button>
          
          {error && (
            <button 
              onClick={() => setError(null)}
              className="mt-4 text-sm text-slate-400 hover:text-slate-600 flex items-center justify-center mx-auto"
            >
              Quay lại trang đăng nhập
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout user={userData} onLogout={handleLogout} />}>
          <Route index element={<Navigate to="/tasks" replace />} />
          <Route path="tasks" element={<Tasks user={userData} />} />
          <Route path="records" element={<Records user={userData} />} />
          <Route path="invoices" element={<Invoices user={userData} />} />
          <Route path="personnel" element={<Personnel user={userData} />} />
          <Route path="settings" element={<Settings user={userData} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

