'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface Notification { id: number; message: string; type: string; priority: string; is_read: boolean; is_archived: boolean; link?: string; created_at: string; snoozed_until?: string; }
interface Preference { id: number; notification_type: string; in_app_enabled: boolean; email_enabled: boolean; }

const typeIcons: Record<string, string> = { task: '✅', document: '📄', chat: '💬', workflow: '⚙️', system: '🔔' };
const priorityConfig: Record<string, { bg: string; border: string; dot: string; label: string }> = {
  urgent: { bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500', label: 'URGENT' },
  normal: { bg: 'bg-blue-50', border: 'border-blue-200', dot: 'bg-blue-500', label: 'NORMAL' },
  low: { bg: 'bg-gray-50', border: 'border-gray-200', dot: 'bg-gray-400', label: 'LOW' },
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<'all'|'unread'|'read'|'archived'>('all');
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [snoozeMenuId, setSnoozeMenuId] = useState<number|null>(null);

  const fetchNotifications = () => {
    setLoading(true);
    api.get(`/notifications/?filter=${filter}&limit=100`).then(r => {
      setNotifications(r.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { fetchNotifications(); }, [filter]);

  const markRead = async (id: number) => {
    await api.post(`/notifications/${id}/read`);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllRead = async () => {
    await api.post('/notifications/mark-all-read');
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const archive = async (id: number) => {
    await api.post(`/notifications/${id}/archive`);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const unarchive = async (id: number) => {
    await api.post(`/notifications/${id}/unarchive`);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const snooze = async (id: number, hours: number) => {
    await api.post(`/notifications/${id}/snooze`, { hours });
    setNotifications(prev => prev.filter(n => n.id !== id));
    setSnoozeMenuId(null);
  };

  const deleteNotif = async (id: number) => {
    await api.delete(`/notifications/${id}`);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const fetchPreferences = async () => {
    const r = await api.get('/notifications/preferences');
    setPreferences(r.data);
  };

  const updatePref = async (type: string, field: 'in_app_enabled'|'email_enabled', value: boolean) => {
    await api.patch(`/notifications/preferences/${type}`, { [field]: value });
    setPreferences(prev => prev.map(p => p.notification_type === type ? { ...p, [field]: value } : p));
  };

  const unreadCount = notifications.filter(n => !n.is_read && !n.is_archived).length;

  const grouped = notifications.reduce((acc, n) => {
    const key = n.priority || 'normal';
    if (!acc[key]) acc[key] = [];
    acc[key].push(n);
    return acc;
  }, {} as Record<string, Notification[]>);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="text-gray-500 mt-1">
            {filter === 'archived' ? 'Archived notifications' :
             unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'All caught up!'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && filter !== 'archived' && (
            <button onClick={markAllRead} className="px-4 py-2 text-sm bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
              ✓ Mark all read
            </button>
          )}
          <button onClick={() => { setShowSettings(true); fetchPreferences(); }} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors" title="Settings">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {(['all', 'unread', 'read', 'archived'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors capitalize ${
              filter === f ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:text-gray-900'
            }`}>
            {f}
            {f === 'unread' && unreadCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">{unreadCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : notifications.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 shadow-sm">
          <p className="text-5xl mb-3">🔔</p>
          <p className="font-medium">
            {filter === 'archived' ? 'No archived notifications' :
             filter === 'unread' ? 'All caught up!' : 'No notifications yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {(['urgent', 'normal', 'low'] as const).map(priority => {
            const items = grouped[priority];
            if (!items || items.length === 0) return null;
            const config = priorityConfig[priority];
            return (
              <div key={priority}>
                <div className={`flex items-center gap-2 mb-2`}>
                  <div className={`w-2 h-2 rounded-full ${config.dot}`}></div>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{config.label}</span>
                  <span className="text-xs text-gray-400">({items.length})</span>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 shadow-sm overflow-hidden">
                  {items.map(n => (
                    <div key={n.id} className={`p-4 flex items-start gap-4 hover:bg-gray-50 transition-colors group ${!n.is_read ? `${config.bg}/30` : ''}`}>
                      <div className="mt-1">
                        <span className="text-xl">{typeIcons[n.type] || '🔔'}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${!n.is_read ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                          {n.message}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-400">{new Date(n.created_at).toLocaleString()}</span>
                          {n.snoozed_until && (
                            <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">
                              Snoozed until {new Date(n.snoozed_until).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!n.is_read && filter !== 'archived' && (
                          <button onClick={() => markRead(n.id)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg text-xs" title="Mark read">✓</button>
                        )}
                        {filter !== 'archived' ? (
                          <>
                            <div className="relative">
                              <button onClick={() => setSnoozeMenuId(snoozeMenuId === n.id ? null : n.id)} className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg text-xs" title="Snooze">⏰</button>
                              {snoozeMenuId === n.id && (
                                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 w-36">
                                  <button onClick={() => snooze(n.id, 1)} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">1 hour</button>
                                  <button onClick={() => snooze(n.id, 8)} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">8 hours</button>
                                  <button onClick={() => snooze(n.id, 24)} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">Tomorrow</button>
                                </div>
                              )}
                            </div>
                            <button onClick={() => archive(n.id)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg text-xs" title="Archive">📦</button>
                          </>
                        ) : (
                          <button onClick={() => unarchive(n.id)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg text-xs" title="Unarchive">↩️</button>
                        )}
                        <button onClick={() => deleteNotif(n.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg text-xs" title="Delete">🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowSettings(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[500px] max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">⚙️ Notification Preferences</h3>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600">×</button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-4 gap-2 mb-3">
                <div className="text-xs font-medium text-gray-500">Type</div>
                <div className="text-xs font-medium text-gray-500 text-center">In-App</div>
                <div className="text-xs font-medium text-gray-500 text-center">Email</div>
                <div></div>
              </div>
              {preferences.map(p => (
                <div key={p.id} className="grid grid-cols-4 gap-2 items-center py-3 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-2">
                    <span>{typeIcons[p.notification_type] || '🔔'}</span>
                    <span className="text-sm text-gray-900 capitalize">{p.notification_type}</span>
                  </div>
                  <div className="flex justify-center">
                    <button onClick={() => updatePref(p.notification_type, 'in_app_enabled', !p.in_app_enabled)}
                      className={`w-10 h-6 rounded-full transition-colors ${p.in_app_enabled ? 'bg-blue-600' : 'bg-gray-300'}`}>
                      <div className={`w-4 h-4 bg-white rounded-full transition-transform ${p.in_app_enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  <div className="flex justify-center">
                    <button onClick={() => updatePref(p.notification_type, 'email_enabled', !p.email_enabled)}
                      className={`w-10 h-6 rounded-full transition-colors ${p.email_enabled ? 'bg-blue-600' : 'bg-gray-300'}`}>
                      <div className={`w-4 h-4 bg-white rounded-full transition-transform ${p.email_enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  <div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
