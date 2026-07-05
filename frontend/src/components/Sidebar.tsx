'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  FileText,
  CheckSquare,
  GitBranch,
  Bell,
  Lightbulb,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const navItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Chat', href: '/chat', icon: MessageSquare },
  { name: 'Documents', href: '/documents', icon: FileText },
  { name: 'Tasks', href: '/tasks', icon: CheckSquare },
  { name: 'Workflows', href: '/workflows', icon: GitBranch },
  { name: 'Notifications', href: '/notifications', icon: Bell },
  { name: 'Suggestions', href: '/suggestions', icon: Lightbulb },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
      if (window.innerWidth >= 1024) {
        setIsOpen(false);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isMobile) {
      setIsOpen(false);
    }
  }, [pathname, isMobile]);

  const sidebarWidth = isCollapsed ? 'w-16' : 'w-64';

  return (
    <>
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`${sidebarWidth} bg-gray-900 text-white min-h-screen flex flex-col transition-all duration-300 ease-in-out fixed lg:static z-50 ${
          isMobile ? (isOpen ? 'translate-x-0' : '-translate-x-full') : 'translate-x-0'
        }`}
        aria-label="Main navigation"
      >
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          {!isCollapsed && (
            <h1 className="text-xl font-bold tracking-tight transition-opacity duration-200">
              <span className="text-blue-400">Pilot</span>ron
            </h1>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors ${
              isCollapsed ? 'ml-auto' : 'hidden lg:block'
            }`}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!isCollapsed}
          >
            {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
          {isMobile && !isCollapsed && (
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors lg:hidden"
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Navigation">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                {!isCollapsed && <span className="truncate">{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-gray-800">
          <Link
            href="/login"
            onClick={() => {
              localStorage.removeItem('token');
              localStorage.removeItem('user_email');
            }}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 text-gray-400 hover:bg-red-900/30 hover:text-red-400 ${
              isCollapsed ? 'justify-center' : ''
            }`}
            title={isCollapsed ? 'Logout' : ''}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
            {!isCollapsed && <span className="truncate">Logout</span>}
          </Link>
        </div>
      </aside>

      {isMobile && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 left-6 z-30 lg:hidden p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-colors"
          aria-label="Open navigation menu"
          aria-expanded={isOpen}
        >
          <Menu className="w-6 h-6" />
        </button>
      )}
    </>
  );
}