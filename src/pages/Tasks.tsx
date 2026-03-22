import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, deleteDoc, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { User, Task, SubTask } from '../types';
import { format } from 'date-fns';
import { Plus, CheckCircle, Clock, PauseCircle, Search, Edit2, Trash2, X, ListTodo, ChevronDown, Filter } from 'lucide-react';
import { appendRowToSheet } from '../services/googleApi';
import { getDoc } from 'firebase/firestore';
import { Setting } from '../types';

export default function Tasks({ user }: { user: User }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  
  // Filters & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterAssignee, setFilterAssignee] = useState<string>('All');
  const [filterDueDate, setFilterDueDate] = useState<string>('');
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc'|'desc'}>({key: 'createdAt', direction: 'desc'});
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const uniqueAssignees = useMemo(() => {
    const assignees = new Set(tasks.map(t => t.assigneeEmail));
    return Array.from(assignees);
  }, [tasks]);

  const defaultTaskState = {
    title: '',
    description: '',
    assigneeEmail: user.email || '',
    status: 'Đang thực hiện' as Task['status'],
    dueDate: format(new Date(), 'yyyy-MM-dd'),
    subTasks: []
  };

  const [newTask, setNewTask] = useState<Partial<Task>>(defaultTaskState);
  const [newSubTaskTitle, setNewSubTaskTitle] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tasksData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as Task[];
      setTasks(tasksData);
    });

    return () => unsubscribe();
  }, []);

  const handleOpenModal = (task?: Task) => {
    if (task) {
      setEditingTaskId(task.id!);
      setNewTask({
        title: task.title,
        description: task.description,
        assigneeEmail: task.assigneeEmail,
        status: task.status,
        dueDate: task.dueDate,
        subTasks: task.subTasks || []
      });
    } else {
      setEditingTaskId(null);
      setNewTask(defaultTaskState);
    }
    setNewSubTaskTitle('');
    setIsModalOpen(true);
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let docId = editingTaskId;
      if (editingTaskId) {
        await updateDoc(doc(db, 'tasks', editingTaskId), {
          title: newTask.title,
          description: newTask.description,
          status: newTask.status,
          dueDate: newTask.dueDate,
          subTasks: newTask.subTasks || []
        });
      } else {
        const { id, ...taskData } = newTask as any;
        const docRef = await addDoc(collection(db, 'tasks'), {
          ...taskData,
          createdAt: new Date().toISOString(),
          createdBy: user.uid
        });
        docId = docRef.id;

        // Sync to Google Sheets if it's a new task
        const token = localStorage.getItem('googleAdminToken');
        const settingsRef = doc(db, 'settings', 'general');
        const settingsSnap = await getDoc(settingsRef);
        const settings = settingsSnap.exists() ? (settingsSnap.data() as Setting) : null;

        if (token && settings?.spreadsheetId) {
          try {
            const rowData = [
              docId,
              newTask.title,
              newTask.assigneeEmail,
              format(new Date(), 'dd/MM/yyyy'),
              newTask.dueDate,
              newTask.status,
              'Bình thường', // Ưu tiên (mặc định)
              newTask.description
            ];
            await appendRowToSheet(token, settings.spreadsheetId, 'CongViec', rowData);
          } catch (sheetError: any) {
            console.error("Error syncing to Google Sheets:", sheetError);
            if (!localStorage.getItem('googleAdminToken')) {
              alert("Phiên làm việc Google đã hết hạn. Vui lòng vào Cài đặt để kết nối lại Google Admin.");
            }
          }
        }
      }
      setIsModalOpen(false);
      setNewTask(defaultTaskState);
      setEditingTaskId(null);
    } catch (error) {
      console.error("Error saving task: ", error);
      alert("Lỗi khi lưu công việc. Bạn có thể không có quyền thực hiện thao tác này.");
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa công việc này?')) {
      try {
        await deleteDoc(doc(db, 'tasks', taskId));
      } catch (error) {
        console.error("Error deleting task: ", error);
        alert("Lỗi khi xóa công việc. Bạn có thể không có quyền thực hiện thao tác này.");
      }
    }
  };

  const updateTaskStatus = async (taskId: string, newStatus: Task['status']) => {
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        status: newStatus
      });
    } catch (error) {
      console.error("Error updating task: ", error);
      alert("Lỗi khi cập nhật trạng thái");
    }
  };

  const handleAddSubTask = () => {
    if (!newSubTaskTitle.trim()) return;
    const newSub: SubTask = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      title: newSubTaskTitle.trim(),
      completed: false
    };
    setNewTask(prev => ({
      ...prev,
      subTasks: [...(prev.subTasks || []), newSub]
    }));
    setNewSubTaskTitle('');
  };

  const handleRemoveSubTask = (id: string) => {
    setNewTask(prev => ({
      ...prev,
      subTasks: (prev.subTasks || []).filter(st => st.id !== id)
    }));
  };

  const handleToggleSubTask = (id: string) => {
    setNewTask(prev => ({
      ...prev,
      subTasks: (prev.subTasks || []).map(st => 
        st.id === id ? { ...st, completed: !st.completed } : st
      )
    }));
  };

  // Filter and Sort Logic
  const filteredAndSortedTasks = useMemo(() => {
    let result = [...tasks];

    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(t => 
        t.title.toLowerCase().includes(lowerQuery) || 
        t.description.toLowerCase().includes(lowerQuery)
      );
    }

    if (filterStatus !== 'All') {
      result = result.filter(t => t.status === filterStatus);
    }

    if (filterAssignee !== 'All') {
      result = result.filter(t => t.assigneeEmail === filterAssignee);
    }

    if (filterDueDate) {
      result = result.filter(t => t.dueDate === filterDueDate);
    }

    result.sort((a, b) => {
      let aValue: any = a[sortConfig.key as keyof Task];
      let bValue: any = b[sortConfig.key as keyof Task];

      if (sortConfig.key === 'dueDate' || sortConfig.key === 'createdAt') {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      } else if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [tasks, searchQuery, filterStatus, filterAssignee, filterDueDate, sortConfig]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Đã hoàn thành':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" /> Đã hoàn thành</span>;
      case 'Đang thực hiện':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"><Clock className="w-3 h-3 mr-1" /> Đang thực hiện</span>;
      case 'Tạm dừng':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800"><PauseCircle className="w-3 h-3 mr-1" /> Tạm dừng</span>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">Danh sách Công Việc</h1>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5 mr-1" />
          Thêm mới
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Tìm kiếm công việc..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider relative">
                  <div className="flex items-center cursor-pointer hover:text-slate-700" onClick={() => setOpenDropdown(openDropdown === 'dueDate' ? null : 'dueDate')}>
                    Ngày hạn <Filter className="w-3 h-3 ml-1" />
                  </div>
                  {openDropdown === 'dueDate' && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setOpenDropdown(null)}></div>
                      <div className="absolute top-full left-6 mt-1 bg-white border border-slate-200 shadow-lg rounded-md p-3 z-20 w-64 font-normal text-slate-700 normal-case">
                        <div className="mb-3">
                          <label className="block text-xs font-medium text-slate-700 mb-1">Lọc theo ngày cụ thể:</label>
                          <input 
                            type="date" 
                            value={filterDueDate}
                            onChange={(e) => {
                              setFilterDueDate(e.target.value);
                              setOpenDropdown(null);
                            }}
                            className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <button 
                            onClick={() => {
                              setFilterDueDate('');
                              setSortConfig({key: 'title', direction: 'asc'});
                              setOpenDropdown(null);
                            }}
                            className="w-full text-left px-2 py-1.5 hover:bg-slate-50 text-sm text-slate-700 rounded transition-colors"
                          >
                            Bỏ chọn & Sắp xếp A-Z
                          </button>
                          <button 
                            onClick={() => { setSortConfig({key: 'dueDate', direction: 'asc'}); setOpenDropdown(null); }}
                            className={`w-full text-left px-2 py-1.5 hover:bg-slate-50 text-sm rounded transition-colors ${sortConfig.key === 'dueDate' && sortConfig.direction === 'asc' ? 'bg-blue-50 text-blue-600' : 'text-slate-700'}`}
                          >
                            Ngày gần nhất (Tăng dần)
                          </button>
                          <button 
                            onClick={() => { setSortConfig({key: 'dueDate', direction: 'desc'}); setOpenDropdown(null); }}
                            className={`w-full text-left px-2 py-1.5 hover:bg-slate-50 text-sm rounded transition-colors ${sortConfig.key === 'dueDate' && sortConfig.direction === 'desc' ? 'bg-blue-50 text-blue-600' : 'text-slate-700'}`}
                          >
                            Ngày xa nhất (Giảm dần)
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider relative">
                  <div className="flex items-center cursor-pointer hover:text-slate-700" onClick={() => setOpenDropdown(openDropdown === 'title' ? null : 'title')}>
                    Tên công việc <ChevronDown className="w-4 h-4 ml-1" />
                  </div>
                  {openDropdown === 'title' && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setOpenDropdown(null)}></div>
                      <div className="absolute top-full left-6 mt-1 bg-white border border-slate-200 shadow-lg rounded-md py-1 z-20 w-40 font-normal text-slate-700 normal-case">
                        <div className={`px-4 py-2 hover:bg-slate-50 cursor-pointer text-sm ${sortConfig.key === 'title' && sortConfig.direction === 'asc' ? 'bg-blue-50 text-blue-600' : ''}`} onClick={() => { setSortConfig({key: 'title', direction: 'asc'}); setOpenDropdown(null); }}>Từ A - Z</div>
                        <div className={`px-4 py-2 hover:bg-slate-50 cursor-pointer text-sm ${sortConfig.key === 'title' && sortConfig.direction === 'desc' ? 'bg-blue-50 text-blue-600' : ''}`} onClick={() => { setSortConfig({key: 'title', direction: 'desc'}); setOpenDropdown(null); }}>Từ Z - A</div>
                      </div>
                    </>
                  )}
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Tiến độ</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider relative">
                  <div className="flex items-center cursor-pointer hover:text-slate-700" onClick={() => setOpenDropdown(openDropdown === 'assignee' ? null : 'assignee')}>
                    Người thực hiện <Filter className="w-3 h-3 ml-1" />
                  </div>
                  {openDropdown === 'assignee' && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setOpenDropdown(null)}></div>
                      <div className="absolute top-full left-6 mt-1 bg-white border border-slate-200 shadow-lg rounded-md py-1 z-20 w-48 font-normal text-slate-700 normal-case max-h-60 overflow-y-auto">
                        <div className={`px-4 py-2 hover:bg-slate-50 cursor-pointer text-sm ${filterAssignee === 'All' ? 'bg-blue-50 text-blue-600' : ''}`} onClick={() => { setFilterAssignee('All'); setOpenDropdown(null); }}>Tất cả</div>
                        {uniqueAssignees.map(email => (
                          <div key={`assignee-${email}`} className={`px-4 py-2 hover:bg-slate-50 cursor-pointer text-sm truncate ${filterAssignee === email ? 'bg-blue-50 text-blue-600' : ''}`} onClick={() => { setFilterAssignee(email); setOpenDropdown(null); }}>{email}</div>
                        ))}
                      </div>
                    </>
                  )}
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider relative">
                  <div className="flex items-center cursor-pointer hover:text-slate-700" onClick={() => setOpenDropdown(openDropdown === 'status' ? null : 'status')}>
                    Trạng thái <Filter className="w-3 h-3 ml-1" />
                  </div>
                  {openDropdown === 'status' && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setOpenDropdown(null)}></div>
                      <div className="absolute top-full left-6 mt-1 bg-white border border-slate-200 shadow-lg rounded-md py-1 z-20 w-48 font-normal text-slate-700 normal-case">
                        <div className={`px-4 py-2 hover:bg-slate-50 cursor-pointer text-sm ${filterStatus === 'All' ? 'bg-blue-50 text-blue-600' : ''}`} onClick={() => { setFilterStatus('All'); setOpenDropdown(null); }}>Tất cả</div>
                        <div className={`px-4 py-2 hover:bg-slate-50 cursor-pointer text-sm ${filterStatus === 'Đang thực hiện' ? 'bg-blue-50 text-blue-600' : ''}`} onClick={() => { setFilterStatus('Đang thực hiện'); setOpenDropdown(null); }}>Đang thực hiện</div>
                        <div className={`px-4 py-2 hover:bg-slate-50 cursor-pointer text-sm ${filterStatus === 'Đã hoàn thành' ? 'bg-blue-50 text-blue-600' : ''}`} onClick={() => { setFilterStatus('Đã hoàn thành'); setOpenDropdown(null); }}>Đã hoàn thành</div>
                        <div className={`px-4 py-2 hover:bg-slate-50 cursor-pointer text-sm ${filterStatus === 'Tạm dừng' ? 'bg-blue-50 text-blue-600' : ''}`} onClick={() => { setFilterStatus('Tạm dừng'); setOpenDropdown(null); }}>Tạm dừng</div>
                      </div>
                    </>
                  )}
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Thao tác</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {filteredAndSortedTasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Không tìm thấy công việc nào.
                  </td>
                </tr>
              ) : filteredAndSortedTasks.map((task) => (
                <tr key={task.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    {format(new Date(task.dueDate), 'dd/MM/yyyy')}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      <span className="truncate max-w-[200px]">{task.title}</span>
                      {task.subTasks && task.subTasks.length > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
                          {task.subTasks.filter(st => st.completed).length}/{task.subTasks.length}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 font-normal mt-1 truncate max-w-xs">{task.description}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    {task.subTasks && task.subTasks.length > 0 ? (
                      <div className="flex flex-col space-y-1">
                        <div className="flex items-center text-xs font-medium text-slate-700">
                          <ListTodo className="w-3 h-3 mr-1 text-blue-500" />
                          {task.subTasks.filter(st => st.completed).length}/{task.subTasks.length} hoàn thành
                        </div>
                        <div className="w-24 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className="bg-blue-500 h-1.5 rounded-full transition-all duration-300" 
                            style={{ width: `${(task.subTasks.filter(st => st.completed).length / task.subTasks.length) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 italic">N/A</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    {task.assigneeEmail}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(task.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end space-x-3">
                      <select 
                        value={task.status || ''}
                        onChange={(e) => updateTaskStatus(task.id!, e.target.value as Task['status'])}
                        className="text-sm border-slate-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      >
                        <option value="Đang thực hiện">Đang thực hiện</option>
                        <option value="Đã hoàn thành">Đã hoàn thành</option>
                        <option value="Tạm dừng">Tạm dừng</option>
                      </select>
                      <button 
                        onClick={() => handleOpenModal(task)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Chỉnh sửa"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      { (user.role === 'Quản lý' || user.role === 'Admin') && (
                        <button 
                          onClick={() => handleDeleteTask(task.id!)}
                          className="text-red-600 hover:text-red-900"
                          title="Xóa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Thêm/Sửa Công Việc */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-800/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-semibold text-slate-800">
                {editingTaskId ? 'Chỉnh Sửa Công Việc' : 'Thêm Công Việc Mới'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <form onSubmit={handleSaveTask} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Ngày hạn</label>
                      <input 
                        type="date" 
                        required
                        value={newTask.dueDate || ''}
                        onChange={(e) => setNewTask({...newTask, dueDate: e.target.value})}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Tên công việc</label>
                      <input 
                        type="text" 
                        required
                        value={newTask.title || ''}
                        onChange={(e) => setNewTask({...newTask, title: e.target.value})}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nội dung</label>
                    <textarea 
                      rows={3}
                      value={newTask.description || ''}
                      onChange={(e) => setNewTask({...newTask, description: e.target.value})}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    ></textarea>
                  </div>
                  
                  {/* Sub-tasks section */}
                  <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Task con (Checklist)</label>
                    <div className="flex space-x-2 mb-3">
                      <input 
                        type="text" 
                        placeholder="Nhập tên task con..."
                        value={newSubTaskTitle}
                        onChange={(e) => setNewSubTaskTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddSubTask();
                          }
                        }}
                        className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button 
                        type="button"
                        onClick={handleAddSubTask}
                        className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                      >
                        Thêm
                      </button>
                    </div>
                    
                    {newTask.subTasks && newTask.subTasks.length > 0 ? (
                      <ul className="space-y-2">
                        {newTask.subTasks.map((st) => (
                          <li key={st.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                            st.completed ? 'bg-emerald-50/50 border-emerald-100' : 'bg-white border-slate-200'
                          }`}>
                            <div className="flex items-center space-x-3 flex-1">
                              <button 
                                type="button"
                                onClick={() => handleToggleSubTask(st.id)}
                                className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                                  st.completed 
                                    ? 'bg-emerald-500 border-emerald-500 text-white' 
                                    : 'bg-white border-slate-300 text-transparent hover:border-blue-400'
                                }`}
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                              </button>
                              <span className={`text-sm font-medium ${st.completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                                {st.title}
                              </span>
                            </div>
                            <button 
                              type="button"
                              onClick={() => handleRemoveSubTask(st.id)}
                              className="text-slate-400 hover:text-red-500 p-1 rounded-md hover:bg-red-50 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-500 italic">Chưa có task con nào.</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Người thực hiện (Email)</label>
                      <input 
                        type="email" 
                        required
                        readOnly
                        value={newTask.assigneeEmail || ''}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-slate-100 text-slate-500 cursor-not-allowed focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Trạng thái</label>
                      <select 
                        value={newTask.status || ''}
                        onChange={(e) => setNewTask({...newTask, status: e.target.value as Task['status']})}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="Đang thực hiện">Đang thực hiện</option>
                        <option value="Đã hoàn thành">Đã hoàn thành</option>
                        <option value="Tạm dừng">Tạm dừng</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-6 flex justify-end space-x-3 pt-4 border-t border-slate-200">
                    <button 
                      type="button" 
                      onClick={() => setIsModalOpen(false)}
                      className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      Hủy
                    </button>
                    <button 
                      type="submit" 
                      className="px-4 py-2 bg-blue-600 border border-transparent rounded-lg text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {editingTaskId ? 'Cập Nhật' : 'Lưu Công Việc'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Recent Tasks Sidebar */}
              <div className="hidden lg:block border-l border-slate-200 pl-6 space-y-4">
                <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <ListTodo className="w-4 h-4 text-blue-500" /> Công việc hiện có
                </h4>
                <p className="text-[10px] text-slate-500 italic">Xem các công việc đã tạo để tham khảo hoặc sao chép nhanh.</p>
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                  {tasks.slice(0, 10).map(t => (
                    <div key={`sidebar-${t.id}`} className="p-3 bg-slate-50 border border-slate-200 rounded-xl hover:border-blue-300 transition-colors group">
                      <div className="font-bold text-slate-800 text-xs truncate group-hover:text-blue-600">{t.title}</div>
                      <div className="text-[10px] text-slate-500 mt-1 line-clamp-2">{t.description}</div>
                      <div className="mt-2 flex justify-between items-center">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          t.status === 'Đã hoàn thành' ? 'bg-green-100 text-green-700' : 
                          t.status === 'Đang thực hiện' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {t.status}
                        </span>
                        <button 
                          type="button"
                          onClick={() => {
                            const { id, ...taskData } = t;
                            setNewTask({
                              ...taskData,
                              title: `Bản sao: ${t.title}`,
                              subTasks: t.subTasks?.map(st => ({ ...st, completed: false, id: Date.now().toString() + Math.random().toString(36).substring(2, 9) })) || []
                            });
                            setEditingTaskId(null);
                          }}
                          className="text-[10px] text-blue-600 font-bold hover:underline"
                        >
                          Sao chép
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
