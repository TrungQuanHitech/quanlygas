export type Role = 'Admin' | 'Quản lý' | 'Kế toán' | 'Nhân viên' | 'Khách';
export type UserStatus = 'Chờ kích hoạt' | 'Đang làm việc' | 'Tạm nghỉ' | 'Đã nghỉ việc';

export interface User {
  uid?: string;
  email: string;
  displayName: string;
  role: Role;
  status: UserStatus;
  position?: string;
  department?: string;
  phone?: string;
  lastLogin?: string;
  createdAt: string;
}

export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Task {
  id?: string;
  title: string;
  description: string;
  assigneeEmail: string;
  status: 'Đang thực hiện' | 'Đã hoàn thành' | 'Tạm dừng';
  dueDate: string;
  createdAt: string;
  createdBy: string;
  subTasks?: SubTask[];
}

export interface Record {
  id?: string;
  type: 'Pháp lý' | 'Kỹ thuật' | 'Hồ sơ khác';
  name: string;
  fileUrl: string;
  createdAt: string;
  createdBy: string;
  documentNumber?: string;
  issueDate?: string;
}

export interface Invoice {
  id?: string;
  fileName: string;
  parsedData: string;
  fileId?: string;
  webViewLink?: string;
  createdAt: string;
  createdBy: string;
}

export interface Setting {
  id?: string;
  companyName: string;
  address: string;
  taxId: string;
  aiApiKey: string;
  rootFolderId?: string;
  spreadsheetId?: string;
}
