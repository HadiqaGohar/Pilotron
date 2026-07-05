'use client';
import { useEffect, useState, useRef } from 'react';
import api from '@/lib/api';
import Link from 'next/link';

interface Notification { id: number; message: string; type: string; priority: string; is_read: boolean; link?: string; created_at: string; }

export default function Topbar({ user }: { user: string }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = () => {
    api.get('/notifications/count').then(r => setUnreadCount(r.data.unread)).catch(() => {});
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (showDropdown) {
      api.get('/notifications/?filter=unread&limit=8').then(r => setNotifications(r.data)).catch(() => {});
    }
  }, [showDropdown]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markRead = async (id: number) => {
    await api.post(`/notifications/${id}/read`);
    setNotifications(prev => prev.filter(n => n.id !== id));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllRead = async () => {
    await api.post('/notifications/mark-all-read');
    setNotifications([]);
    setUnreadCount(0);
  };

  const typeIcons: Record<string, string> = { task: '✅', document: '📄', chat: '💬', workflow: '⚙️', system: '🔔' };
  const priorityColors: Record<string, string> = { urgent: 'text-red-500 bg-red-50', normal: 'text-blue-500 bg-blue-50', low: 'text-gray-400 bg-gray-50' };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-40">
      <div></div>
      <div className="flex items-center gap-4">
        {/* Bell Icon with Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="relative p-2 text-gray-500 hover:text-gray-700 transition-colors rounded-lg hover:bg-gray-100"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-h-[18px] min-w-[18px] flex items-center justify-center font-bold px-1">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* Dropdown */}
          {showDropdown && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 text-sm">Notifications</h3>
                {notifications.length > 0 && (
                  <button onClick={markAllRead} className="text-xs text-blue-600 hover:text-blue-800">Mark all read</button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-gray-400">
                    <p className="text-2xl mb-2">🔔</p>
                    <p className="text-sm">No unread notifications</p>
                  </div>
                ) : (
                  notifications.map(n => (
                    <div key={n.id} className={`px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${!n.is_read ? 'bg-blue-50/50' : ''}`}>
                      <div className="flex items-start gap-3">
                        <span className={`text-lg p-1 rounded-full ${priorityColors[n.priority] || priorityColors.normal}`}>
                          {typeIcons[n.type] || '🔔'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 line-clamp-2">{n.message}</p>
                          <p className="text-xs text-gray-400 mt-1">{new Date(n.created_at).toLocaleString()}</p>
                        </div>
                        {!n.is_read && (
                          <button onClick={() => markRead(n.id)} className="text-xs text-blue-600 hover:text-blue-800 whitespace-nowrap" title="Mark as read">
                            ✓
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
                <Link href="/notifications" onClick={() => setShowDropdown(false)} className="text-center block text-sm text-blue-600 hover:text-blue-800 font-medium">
                  View all notifications →
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
          <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">
            {user.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm text-gray-700 font-medium">{user}</span>
        </div>
      </div>
    </header>
  );
}
