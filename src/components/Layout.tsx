import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { User } from '../types';
import { logout } from '../firebase';
import { 
  Building2, 
  CheckSquare, 
  FolderOpen, 
  FileText, 
  Users, 
  Settings, 
  LogOut 
} from 'lucide-react';
import clsx from 'clsx';

interface LayoutProps {
  user: User;
  onLogout: () => void;
}

export default function Layout({ user, onLogout }: LayoutProps) {
  const isGuest = user.role === 'Khách';
  const isManagerOrAccountant = user.role === 'Quản lý' || user.role === 'Kế toán' || user.role === 'Admin';

  const navItems = [
    { path: '/tasks', icon: CheckSquare, label: 'Công Việc', show: !isGuest },
    { path: '/records', icon: FolderOpen, label: 'Hồ Sơ', show: !isGuest && isManagerOrAccountant },
    { path: '/invoices', icon: FileText, label: 'Hóa Đơn', show: !isGuest && isManagerOrAccountant },
    { path: '/personnel', icon: Users, label: 'Nhân Sự', show: !isGuest && isManagerOrAccountant },
    { path: '/settings', icon: Settings, label: 'Cấu Hình', show: isManagerOrAccountant || isGuest },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-blue-600 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Building2 className="w-6 h-6 mr-2" />
              <span className="font-bold text-lg tracking-tight">HỆ THỐNG QUẢN LÝ</span>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-medium">{user.displayName || user.email}</div>
                <div className="text-xs text-blue-200">{user.email}</div>
              </div>
              <span className="bg-blue-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full border border-blue-400">
                {user.role}
              </span>
              <button 
                onClick={onLogout}
                className="p-2 hover:bg-blue-700 rounded-full transition-colors"
                title="Đăng xuất"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-1 sm:space-x-4 overflow-x-auto py-2 no-scrollbar">
            {navItems.filter(item => item.show).map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => clsx(
                  "flex items-center px-3 sm:px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                  isActive 
                    ? "bg-blue-50 text-blue-700" 
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <item.icon className="w-4 h-4 mr-2" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
