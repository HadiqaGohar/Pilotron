'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

interface DashboardStats {
  tasks: { total: number; todo: number; in_progress: number; done: number; completion_rate: number; recent_7d: number; chart: { day: string; count: number }[] };
  documents: { total: number; ready: number; processing: number; total_size_bytes: number; recent: { id: number; filename: string; file_size: number; status: string; uploaded_at: string }[] };
  chat: { total_sessions: number; total_messages: number; recent: { id: number; title: string; created_at: string; message_count: number }[] };
  notifications: { total: number; unread: number; recent: { id: number; message: string; type: string; is_read: boolean; created_at: string }[] };
  qa: { total: number };
  suggestions: { total: number };
  workflows: { total: number; active: number };
  productivity_score: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good Morning');
    else if (hour < 17) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');
  }, []);

  useEffect(() => {
    api.get('/dashboard/stats')
      .then(res => setStats(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const formatSize = (b: number) => {
    if (!b) return '0 B';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  };

  const getFileIcon = (f: string) => {
    const e = f.split('.').pop()?.toLowerCase();
    if (e === 'pdf') return '📕';
    if (e === 'docx') return '📘';
    if (e === 'csv') return '📊';
    if (e === 'md') return '📝';
    return '📄';
  };

  const getNotifIcon = (t: string) => {
    if (t === 'task') return '✅';
    if (t === 'document') return '📄';
    if (t === 'chat') return '💬';
    return '🔔';
  };

  const timeAgo = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-500 py-20">
          <p className="text-4xl mb-3">⚠️</p>
          <p className="font-medium">Failed to load dashboard data</p>
          <button onClick={() => window.location.reload()} className="mt-3 text-sm text-blue-600 hover:text-blue-700">Retry</button>
        </div>
      </div>
    );
  }

  const maxChartVal = Math.max(...stats.tasks.chart.map(c => c.count), 1);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Welcome Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{greeting} 👋</h1>
          <p className="text-gray-500 mt-1">Here's what's happening across your workspace</p>
        </div>
        <div className="flex gap-2">
          <Link href="/chat" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm">
            + New Chat
          </Link>
          <Link href="/documents" className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            + Upload Doc
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Link href="/tasks" className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-all group shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl">✅</span>
            <span className="text-xs text-gray-400">{stats.tasks.recent_7d} this week</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.tasks.total}</p>
          <p className="text-xs text-gray-500 mt-0.5 group-hover:text-blue-600 transition-colors">Total Tasks</p>
        </Link>

        <Link href="/tasks" className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-all group shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl">📋</span>
          </div>
          <p className="text-2xl font-bold text-yellow-600">{stats.tasks.todo}</p>
          <p className="text-xs text-gray-500 mt-0.5 group-hover:text-blue-600 transition-colors">To Do</p>
        </Link>

        <Link href="/tasks" className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-all group shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl">🔄</span>
          </div>
          <p className="text-2xl font-bold text-orange-600">{stats.tasks.in_progress}</p>
          <p className="text-xs text-gray-500 mt-0.5 group-hover:text-blue-600 transition-colors">In Progress</p>
        </Link>

        <Link href="/documents" className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-all group shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl">📄</span>
            <span className="text-xs text-gray-400">{formatSize(stats.documents.total_size_bytes)}</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.documents.total}</p>
          <p className="text-xs text-gray-500 mt-0.5 group-hover:text-blue-600 transition-colors">Documents</p>
        </Link>

        <Link href="/chat" className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-all group shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl">💬</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.chat.total_sessions}</p>
          <p className="text-xs text-gray-500 mt-0.5 group-hover:text-blue-600 transition-colors">Chat Sessions</p>
        </Link>

        <Link href="/notifications" className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-all group shadow-sm relative">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl">🔔</span>
            {stats.notifications.unread > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">{stats.notifications.unread}</span>
            )}
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.notifications.unread}</p>
          <p className="text-xs text-gray-500 mt-0.5 group-hover:text-blue-600 transition-colors">Unread</p>
        </Link>
      </div>

      {/* Productivity + Task Chart Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Productivity Score */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Productivity Score</h3>
          <div className="flex items-center justify-center">
            <div className="relative w-40 h-40">
              <svg className="w-40 h-40 transform -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="50" fill="none" stroke="#E5E7EB" strokeWidth="10" />
                <circle cx="60" cy="60" r="50" fill="none" stroke="#3B82F6" strokeWidth="10"
                  strokeDasharray={`${stats.productivity_score * 3.14} 314`}
                  strokeLinecap="round" className="transition-all duration-1000" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-gray-900">{stats.productivity_score}</span>
                <span className="text-xs text-gray-500">out of 100</span>
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Completion Rate</span>
              <span className="font-medium text-gray-900">{stats.tasks.completion_rate}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${stats.tasks.completion_rate}%` }}></div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Tasks this week</span>
              <span className="font-medium text-gray-900">{stats.tasks.recent_7d}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Q&A Sessions</span>
              <span className="font-medium text-gray-900">{stats.qa.total}</span>
            </div>
          </div>
        </div>

        {/* Task Activity Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-semibold text-gray-900">Tasks Created (Last 7 Days)</h3>
            <Link href="/tasks" className="text-sm text-blue-600 hover:text-blue-700">View all →</Link>
          </div>
          <div className="flex items-end gap-3 h-40">
            {stats.tasks.chart.map((bar, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-xs font-medium text-gray-500">{bar.count}</span>
                <div className="w-full bg-gray-100 rounded-t-lg relative" style={{ height: `${(bar.count / maxChartVal) * 100}%`, minHeight: bar.count > 0 ? '8px' : '2px' }}>
                  <div className="absolute bottom-0 w-full bg-blue-500 rounded-t-lg transition-all duration-500" style={{ height: '100%' }}></div>
                </div>
                <span className="text-xs text-gray-400">{bar.day}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Tasks */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Recent Tasks</h3>
            <Link href="/tasks" className="text-sm text-blue-600 hover:text-blue-700">View all →</Link>
          </div>
          {stats.tasks.total === 0 ? (
            <div className="p-10 text-center text-gray-400">
              <p className="text-4xl mb-3">📋</p>
              <p className="font-medium">No tasks yet</p>
              <p className="text-sm mt-1">Create your first task from Chat or Tasks page</p>
              <Link href="/chat" className="mt-3 inline-block text-sm text-blue-600 hover:text-blue-700">Start chatting →</Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {/* Task Status Summary Bar */}
              <div className="px-6 py-3 bg-gray-50 flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                  <span className="text-xs text-gray-600">To Do: {stats.tasks.todo}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-400"></div>
                  <span className="text-xs text-gray-600">In Progress: {stats.tasks.in_progress}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-400"></div>
                  <span className="text-xs text-gray-600">Done: {stats.tasks.done}</span>
                </div>
                <div className="ml-auto">
                  <div className="w-24 bg-gray-200 rounded-full h-2">
                    <div className="bg-green-500 h-2 rounded-full" style={{ width: `${stats.tasks.completion_rate}%` }}></div>
                  </div>
                </div>
              </div>
              {/* Recent tasks will be loaded from the stats */}
              {stats.tasks.todo + stats.tasks.in_progress + stats.tasks.done === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">No tasks to show</div>
              ) : (
                <div className="px-6 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">📊</span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{stats.tasks.total} tasks total</p>
                      <p className="text-xs text-gray-500">{stats.tasks.recent_7d} created this week</p>
                    </div>
                  </div>
                  <Link href="/tasks" className="text-sm text-blue-600 hover:text-blue-700 font-medium">Manage Tasks →</Link>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">Quick Actions</h3>
            </div>
            <div className="p-3 space-y-1">
              <Link href="/chat" className="flex items-center gap-3 p-3 rounded-lg hover:bg-blue-50 transition-colors group">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-xl">💬</div>
                <div>
                  <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors">New Chat</p>
                  <p className="text-xs text-gray-500">Talk to AI assistant</p>
                </div>
              </Link>
              <Link href="/documents" className="flex items-center gap-3 p-3 rounded-lg hover:bg-purple-50 transition-colors group">
                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center text-xl">📄</div>
                <div>
                  <p className="text-sm font-medium text-gray-900 group-hover:text-purple-600 transition-colors">Upload Document</p>
                  <p className="text-xs text-gray-500">PDF, DOCX, TXT, CSV</p>
                </div>
              </Link>
              <Link href="/tasks" className="flex items-center gap-3 p-3 rounded-lg hover:bg-green-50 transition-colors group">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center text-xl">✅</div>
                <div>
                  <p className="text-sm font-medium text-gray-900 group-hover:text-green-600 transition-colors">Create Task</p>
                  <p className="text-xs text-gray-500">Track your work</p>
                </div>
              </Link>
              <Link href="/workflows" className="flex items-center gap-3 p-3 rounded-lg hover:bg-orange-50 transition-colors group">
                <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center text-xl">⚙️</div>
                <div>
                  <p className="text-sm font-medium text-gray-900 group-hover:text-orange-600 transition-colors">Workflows</p>
                  <p className="text-xs text-gray-500">{stats.workflows.active} active automations</p>
                </div>
              </Link>
              <Link href="/suggestions" className="flex items-center gap-3 p-3 rounded-lg hover:bg-yellow-50 transition-colors group">
                <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center text-xl">💡</div>
                <div>
                  <p className="text-sm font-medium text-gray-900 group-hover:text-yellow-600 transition-colors">Suggestions</p>
                  <p className="text-xs text-gray-500">AI-powered tips</p>
                </div>
              </Link>
            </div>
          </div>

          {/* Recent Notifications */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
              <Link href="/notifications" className="text-sm text-blue-600 hover:text-blue-700">View all →</Link>
            </div>
            {stats.notifications.recent.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">No notifications yet</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {stats.notifications.recent.map((n) => (
                  <div key={n.id} className={`px-6 py-3 ${!n.is_read ? 'bg-blue-50' : ''}`}>
                    <div className="flex items-start gap-2">
                      <span className="text-sm mt-0.5">{getNotifIcon(n.type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${!n.is_read ? 'font-medium text-gray-900' : 'text-gray-600'}`}>{n.message}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{timeAgo(n.created_at)}</p>
                      </div>
                      {!n.is_read && <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row: Recent Docs + Recent Chats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Documents */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Recent Documents</h3>
            <Link href="/documents" className="text-sm text-blue-600 hover:text-blue-700">View all →</Link>
          </div>
          {stats.documents.recent.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              <p className="text-4xl mb-3">📁</p>
              <p className="font-medium">No documents yet</p>
              <Link href="/documents" className="mt-2 inline-block text-sm text-blue-600 hover:text-blue-700">Upload your first document →</Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {stats.documents.recent.map((doc) => (
                <Link key={doc.id} href="/documents" className="flex items-center gap-3 px-6 py-3 hover:bg-gray-50 transition-colors">
                  <span className="text-2xl">{getFileIcon(doc.filename)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{doc.filename}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${
                        doc.status === 'ready' ? 'bg-green-100 text-green-700' :
                        doc.status === 'processing' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {doc.status === 'ready' ? '●' : doc.status === 'processing' ? '◌' : '✗'} {doc.status}
                      </span>
                      <span className="text-xs text-gray-400">{formatSize(doc.file_size)}</span>
                      <span className="text-xs text-gray-400">{timeAgo(doc.uploaded_at)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent Chat Sessions */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Recent Chats</h3>
            <Link href="/chat" className="text-sm text-blue-600 hover:text-blue-700">View all →</Link>
          </div>
          {stats.chat.recent.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              <p className="text-4xl mb-3">💬</p>
              <p className="font-medium">No chat sessions yet</p>
              <Link href="/chat" className="mt-2 inline-block text-sm text-blue-600 hover:text-blue-700">Start chatting →</Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {stats.chat.recent.map((session) => (
                <Link key={session.id} href="/chat" className="flex items-center gap-3 px-6 py-3 hover:bg-gray-50 transition-colors">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center text-lg">💬</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{session.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500">{session.message_count} messages</span>
                      <span className="text-xs text-gray-400">{timeAgo(session.created_at)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stats Footer Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-blue-600">{stats.qa.total}</p>
          <p className="text-xs text-gray-500 mt-1">Q&A Questions Asked</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-purple-600">{stats.chat.total_messages}</p>
          <p className="text-xs text-gray-500 mt-1">Total Chat Messages</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-green-600">{stats.documents.ready}</p>
          <p className="text-xs text-gray-500 mt-1">Docs Ready to Query</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-orange-600">{stats.workflows.active}</p>
          <p className="text-xs text-gray-500 mt-1">Active Workflows</p>
        </div>
      </div>
    </div>
  );
}
