import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, updateDoc, doc, orderBy, addDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { User, Role, UserStatus, Setting } from '../types';
import { format } from 'date-fns';
import { Users, Shield, Mail, Calendar, UserPlus, Loader2, CheckCircle2, XCircle, Clock, Save, Trash2 } from 'lucide-react';
import { appendRowToSheet } from '../services/googleApi';

export default function Personnel({ user }: { user: User }) {
  const [personnel, setPersonnel] = useState<User[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newPerson, setNewPerson] = useState({
    email: '',
    displayName: '',
    role: 'Nhân viên' as Role,
    position: '',
    department: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as any[];
      setPersonnel(usersData as User[]);
    });

    return () => unsubscribe();
  }, []);

  const handleAddPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (user.role !== 'Quản lý' && user.role !== 'Kế toán' && user.role !== 'Admin') {
      alert("Bạn không có quyền thực hiện thao tác này.");
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      // Check if email already exists
      const exists = personnel.some(p => p.email.toLowerCase() === newPerson.email.toLowerCase());
      if (exists) {
        throw new Error("Email này đã có trong danh sách nhân sự.");
      }

      const personData: User = {
        email: newPerson.email.toLowerCase(),
        displayName: newPerson.displayName,
        role: newPerson.role,
        status: 'Chờ kích hoạt',
        position: newPerson.position,
        department: newPerson.department,
        createdAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'users'), personData);

      // Sync to Google Sheets
      const token = localStorage.getItem('googleAdminToken');
      const settingsRef = doc(db, 'settings', 'general');
      const settingsSnap = await getDoc(settingsRef);
      const settings = settingsSnap.exists() ? (settingsSnap.data() as Setting) : null;

      if (token && settings?.spreadsheetId) {
        try {
          const rowData = [
            docRef.id,
            personData.displayName,
            personData.role,
            personData.department || '',
            '', // Ngày sinh
            personData.email,
            '', // Số điện thoại
            format(new Date(), 'dd/MM/yyyy'),
            personData.status
          ];
          await appendRowToSheet(token, settings.spreadsheetId, 'NhanSu', rowData);
        } catch (sheetError) {
          console.error("Error syncing to Google Sheets:", sheetError);
        }
      }

      setMessage({ type: 'success', text: "Đã thêm nhân sự vào danh sách chờ kích hoạt!" });
      setNewPerson({ email: '', displayName: '', role: 'Nhân viên', position: '', department: '' });
      setIsAdding(false);
    } catch (error: any) {
      console.error("Error adding person: ", error);
      setMessage({ type: 'error', text: error.message || "Lỗi khi thêm nhân sự" });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async (userId: string, updates: Partial<User>) => {
    if (user.role !== 'Quản lý' && user.role !== 'Kế toán' && user.role !== 'Admin') {
      alert("Bạn không có quyền thay đổi thông tin nhân sự.");
      return;
    }

    // Prevent self-demotion or self-deactivation if last admin
    if (userId === user.uid && updates.role && updates.role !== 'Quản lý') {
      const adminCount = personnel.filter(p => p.role === 'Quản lý' && p.status === 'Đang làm việc').length;
      if (adminCount <= 1) {
        alert("Bạn không thể tự hạ quyền vì bạn là Quản lý duy nhất đang hoạt động.");
        return;
      }
    }
    
    try {
      // Find the document ID if it's not the UID
      const person = personnel.find(p => p.uid === userId || (p as any).id === userId);
      const docId = (person as any).id || person?.uid;
      
      if (!docId) throw new Error("Không tìm thấy ID tài liệu");

      await updateDoc(doc(db, 'users', docId), updates);
    } catch (error) {
      console.error("Error updating user: ", error);
      alert("Lỗi khi cập nhật thông tin");
    }
  };

  const getStatusBadge = (status: UserStatus) => {
    switch (status) {
      case 'Đang làm việc':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800"><CheckCircle2 className="w-3 h-3 mr-1" /> Đang làm việc</span>;
      case 'Chờ kích hoạt':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800"><Clock className="w-3 h-3 mr-1" /> Chờ kích hoạt</span>;
      case 'Tạm nghỉ':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800"><XCircle className="w-3 h-3 mr-1" /> Tạm nghỉ</span>;
      case 'Đã nghỉ việc':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" /> Đã nghỉ việc</span>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">Quản lý Nhân Sự</h1>
        {(user.role === 'Quản lý' || user.role === 'Kế toán') && (
          <button 
            onClick={() => setIsAdding(!isAdding)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center shadow-sm"
          >
            {isAdding ? <XCircle className="w-4 h-4 mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
            {isAdding ? 'Hủy bỏ' : 'Thêm nhân sự'}
          </button>
        )}
      </div>

      {message && (
        <div className={`p-4 rounded-lg flex items-center border ${
          message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 mr-3" /> : <XCircle className="w-5 h-5 mr-3" />}
          <span className="text-sm font-medium">{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-auto text-slate-400 hover:text-slate-600">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {isAdding && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-in fade-in slide-in-from-top-4 duration-300">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
            <UserPlus className="w-5 h-5 mr-2 text-blue-600" />
            Cấp quyền nhân sự mới
          </h2>
          <form onSubmit={handleAddPerson} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email Google (Bắt buộc)</label>
              <input 
                type="email" 
                required
                placeholder="example@gmail.com"
                value={newPerson.email}
                onChange={(e) => setNewPerson({...newPerson, email: e.target.value})}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Họ và tên</label>
              <input 
                type="text" 
                required
                placeholder="Nguyễn Văn A"
                value={newPerson.displayName}
                onChange={(e) => setNewPerson({...newPerson, displayName: e.target.value})}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phân quyền</label>
              <select 
                value={newPerson.role}
                onChange={(e) => setNewPerson({...newPerson, role: e.target.value as Role})}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Nhân viên">Nhân viên</option>
                <option value="Kế toán">Kế toán</option>
                <option value="Quản lý">Quản lý</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Chức vụ</label>
              <input 
                type="text" 
                placeholder="Kỹ sư, Kế toán viên..."
                value={newPerson.position}
                onChange={(e) => setNewPerson({...newPerson, position: e.target.value})}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phòng ban</label>
              <input 
                type="text" 
                placeholder="Kỹ thuật, Hành chính..."
                value={newPerson.department}
                onChange={(e) => setNewPerson({...newPerson, department: e.target.value})}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-end">
              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Thêm vào danh sách
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center">
            <Users className="w-5 h-5 mr-2 text-slate-500" />
            Danh sách nhân sự hệ thống
          </h2>
          <span className="text-xs text-slate-500 font-medium bg-slate-200 px-2 py-1 rounded-full">
            {personnel.length} Thành viên
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Nhân viên</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Email & Phòng ban</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Trạng thái</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Phân quyền</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Thao tác</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {personnel.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Đang tải danh sách nhân sự...
                  </td>
                </tr>
              ) : personnel.map((person) => {
                const docId = (person as any).id || person.uid;
                return (
                  <tr key={docId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-lg">
                          {person.displayName ? person.displayName.charAt(0).toUpperCase() : person.email.charAt(0).toUpperCase()}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-slate-900">{person.displayName || 'Chưa cập nhật'}</div>
                          <div className="text-xs text-slate-500">{person.position || 'Nhân viên'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <div className="flex items-center text-sm text-slate-500">
                          <Mail className="w-3 h-3 mr-1 text-slate-400" />
                          {person.email}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          {person.department || 'Chưa phân phòng'}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(person.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Shield className="w-4 h-4 mr-2 text-slate-400" />
                        <select 
                          value={person.role || ''}
                          onChange={(e) => handleUpdateUser(docId, { role: e.target.value as Role })}
                          disabled={user.role !== 'Quản lý' || (person.email === 'daiphuthinhninhthuan@gmail.com' && user.email !== person.email)}
                          className="text-sm border-slate-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500 py-1"
                        >
                          <option value="Nhân viên">Nhân viên</option>
                          <option value="Kế toán">Kế toán</option>
                          <option value="Quản lý">Quản lý</option>
                        </select>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <select 
                        value={person.status || ''}
                        onChange={(e) => handleUpdateUser(docId, { status: e.target.value as UserStatus })}
                        disabled={(user.role !== 'Quản lý' && user.role !== 'Kế toán') || person.email === 'daiphuthinhninhthuan@gmail.com'}
                        className="text-xs border-slate-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500 py-1"
                      >
                        <option value="Chờ kích hoạt">Chờ kích hoạt</option>
                        <option value="Đang làm việc">Đang làm việc</option>
                        <option value="Tạm nghỉ">Tạm nghỉ</option>
                        <option value="Đã nghỉ việc">Đã nghỉ việc</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
