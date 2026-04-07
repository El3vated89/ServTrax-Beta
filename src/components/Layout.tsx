import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Home, Users, ClipboardList, Wrench, Menu, Bell, LogOut, Settings as SettingsIcon, X, Search, Map, Plus, Camera, MessageSquare, HardDrive } from 'lucide-react';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import PhotoCaptureFlow from './PhotoCaptureFlow';

export default function Layout() {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isPhotoCaptureOpen, setIsPhotoCaptureOpen] = useState(false);
  
  const bottomNavItems = [
    { path: '/', icon: Home, label: 'Home' },
    { path: '/jobs', icon: ClipboardList, label: 'Jobs' },
    { path: '/customers', icon: Users, label: 'Clients' },
    { path: '/map', icon: Map, label: 'Routes' },
  ];

  const menuItems = [
    { path: '/equip', icon: Wrench, label: 'Equipment' },
    { path: '/messaging', icon: MessageSquare, label: 'Messaging' },
    { path: '/storage', icon: HardDrive, label: 'Storage' },
    { path: '/settings', icon: SettingsIcon, label: 'Settings' },
  ];

  const handleSignOut = () => {
    signOut(auth);
  };

  const closeMenu = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20 sm:pb-0">
      {/* Desktop Sidebar (Hidden on mobile) */}
      <aside className="hidden sm:flex flex-col w-64 fixed inset-y-0 bg-white border-r border-gray-100 z-50">
        <div className="p-8">
          <div className="flex items-center gap-2 mb-12">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
              <ClipboardList className="text-white h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-900 tracking-tighter leading-none">ServTrax</h1>
              <p className="text-[8px] font-black text-blue-600 uppercase tracking-widest leading-none mt-1">Velocity</p>
            </div>
          </div>

          <nav className="space-y-2">
            {[...bottomNavItems, ...menuItems].map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${
                    isActive 
                      ? 'bg-blue-50 text-blue-600 shadow-sm' 
                      : 'text-gray-400 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto p-8 border-t border-gray-50">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all w-full"
          >
            <LogOut className="h-5 w-5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div className="sm:pl-64 min-h-screen flex flex-col">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-8">
            <div className="flex justify-between h-20 items-center">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="p-2 text-gray-500 sm:hidden hover:bg-gray-100 rounded-xl transition-colors"
                >
                  <Menu className="h-6 w-6" />
                </button>
                <div className="hidden sm:flex items-center bg-gray-50 px-4 py-2 rounded-2xl border border-gray-100 w-64 group focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                  <Search className="h-4 w-4 text-gray-400 group-focus-within:text-blue-500" />
                  <input 
                    type="text" 
                    placeholder="Search anything..." 
                    className="bg-transparent border-none focus:ring-0 text-sm font-medium ml-2 w-full placeholder:text-gray-300"
                  />
                </div>
                <h1 className="text-xl font-black text-gray-900 sm:hidden">ServTrax</h1>
              </div>
              
              <div className="flex items-center gap-2">
                <button className="p-3 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-all relative">
                  <Bell className="h-6 w-6" />
                  <span className="absolute top-3 right-3 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                </button>
                <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-200 flex items-center justify-center text-white font-black text-sm">
                  TM
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Mobile Side Menu Overlay */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-[60] sm:hidden">
            <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={closeMenu}></div>
            <div className="fixed inset-y-0 left-0 flex flex-col w-72 bg-white shadow-2xl">
              <div className="flex items-center justify-between h-20 px-6 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                    <ClipboardList className="text-white h-5 w-5" />
                  </div>
                  <span className="text-lg font-black text-gray-900 tracking-tight">ServTrax</span>
                </div>
                <button onClick={closeMenu} className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl transition-colors">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto py-6 px-4">
                <nav className="space-y-2">
                  {[...bottomNavItems, ...menuItems].map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={closeMenu}
                        className={`flex items-center gap-4 px-4 py-4 rounded-2xl text-base font-bold transition-all ${
                          isActive 
                            ? 'bg-blue-50 text-blue-600 shadow-sm' 
                            : 'text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        <Icon className={`h-6 w-6 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>
              </div>
              <div className="p-6 border-t border-gray-100">
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-4 px-4 py-4 rounded-2xl text-base font-bold text-red-500 hover:bg-red-50 transition-all w-full"
                >
                  <LogOut className="h-6 w-6" />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-8">
          <Outlet />
        </main>

        {isPhotoCaptureOpen && (
          <PhotoCaptureFlow onClose={() => setIsPhotoCaptureOpen(false)} />
        )}

        {/* Mobile Bottom Navigation */}
        <nav className="fixed bottom-6 left-6 right-6 bg-white/90 backdrop-blur-lg border border-gray-100 shadow-2xl rounded-3xl sm:hidden z-50 px-2 py-2">
          <div className="flex justify-around items-center relative">
            {/* Home & Jobs */}
            {bottomNavItems.slice(0, 2).map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex flex-col items-center py-2 px-3 rounded-2xl transition-all ${
                    isActive 
                      ? 'text-blue-600 bg-blue-50' 
                      : 'text-gray-400 hover:text-gray-900'
                  }`}
                >
                  <Icon className="h-6 w-6" />
                  <span className="text-[10px] mt-1 font-black uppercase tracking-tighter">{item.label}</span>
                </Link>
              );
            })}

            {/* Central Add Button */}
            <div className="relative -mt-12">
              {isAddMenuOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-[-1]" 
                    onClick={() => setIsAddMenuOpen(false)}
                  />
                  <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-48 bg-white rounded-3xl shadow-2xl border border-gray-100 p-2 space-y-1 animate-in fade-in slide-in-from-bottom-4 duration-200">
                    <Link 
                      to="/jobs" 
                      state={{ openAddModal: true }}
                      onClick={() => setIsAddMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-gray-50 text-gray-700 transition-colors"
                    >
                      <ClipboardList className="h-5 w-5 text-blue-600" />
                      <span className="text-sm font-bold">Create Quote</span>
                    </Link>
                    <Link 
                      to="/customers" 
                      state={{ openAddModal: true }}
                      onClick={() => setIsAddMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-gray-50 text-gray-700 transition-colors"
                    >
                      <Users className="h-5 w-5 text-green-600" />
                      <span className="text-sm font-bold">Add Client</span>
                    </Link>
                    <button 
                      onClick={() => {
                        setIsAddMenuOpen(false);
                        setIsPhotoCaptureOpen(true);
                      }}
                      className="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-gray-50 text-gray-700 transition-colors w-full text-left"
                    >
                      <Camera className="h-5 w-5 text-purple-600" />
                      <span className="text-sm font-bold">Take Photo</span>
                    </button>
                  </div>
                </>
              )}
              <button
                onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-all transform ${
                  isAddMenuOpen ? 'bg-gray-900 rotate-45 scale-90' : 'bg-blue-600 hover:scale-105'
                } text-white`}
              >
                <Plus className="h-8 w-8" />
              </button>
            </div>

            {/* Clients & Map */}
            {bottomNavItems.slice(2).map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex flex-col items-center py-2 px-3 rounded-2xl transition-all ${
                    isActive 
                      ? 'text-blue-600 bg-blue-50' 
                      : 'text-gray-400 hover:text-gray-900'
                  }`}
                >
                  <Icon className="h-6 w-6" />
                  <span className="text-[10px] mt-1 font-black uppercase tracking-tighter">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
