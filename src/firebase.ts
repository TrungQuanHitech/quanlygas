import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, signInAnonymously } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export { signInAnonymously };

let isAuthOperationPending = false;

export const loginWithGoogle = async () => {
  if (isAuthOperationPending) return;
  isAuthOperationPending = true;
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (error: any) {
    if (error.code !== 'auth/cancelled-popup-request' && error.code !== 'auth/popup-blocked') {
      console.error("Error signing in with Google", error);
    }
    throw error;
  } finally {
    isAuthOperationPending = false;
  }
};

// Đăng nhập Google Admin với quyền Drive và Sheets
export const loginGoogleAdminWithScopes = async () => {
  if (isAuthOperationPending) return { success: false, message: "Một thao tác xác thực khác đang được thực hiện." };
  isAuthOperationPending = true;
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/drive');
  provider.addScope('https://www.googleapis.com/auth/spreadsheets');
  
  // Force consent to ensure we get a fresh token with all scopes
  provider.setCustomParameters({
    prompt: 'consent',
    access_type: 'offline'
  });
  
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;
    
    if (token) {
      // Lưu token vào localStorage để sử dụng cho các API call sau này
      localStorage.setItem('googleAdminToken', token);
      localStorage.setItem('googleAdminTokenTime', Date.now().toString());
      return { success: true, token };
    }
    return { success: false, message: "Không lấy được access token" };
  } catch (error: any) {
    if (error.code !== 'auth/cancelled-popup-request' && error.code !== 'auth/popup-blocked') {
      console.error("Error signing in as Google Admin", error);
    }
    return { success: false, message: error.message, code: error.code };
  } finally {
    isAuthOperationPending = false;
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
    localStorage.removeItem('googleAdminToken');
  } catch (error) {
    console.error("Error signing out", error);
  }
};
