'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

interface Suggestion {
  id: number; source_type: string; title: string; description: string;
  reason?: string; action_type: string; action_payload?: any;
  priority: string; is_dismissed: boolean; feedback?: string; created_at: string;
}

const typeIcons: Record<string, string> = { task: '✅', document: '📄', chat: '💬', pattern: '🔄', system: '💡' };
const priorityConfig: Record<string, { bg: string; border: string; badge: string }> = {
  high: { bg: 'bg-red-50', border: 'border-red-200', badge: 'bg-red-100 text-red-700' },
  normal: { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
  low: { bg: 'bg-gray-50', border: 'border-gray-200', badge: 'bg-gray-100 text-gray-600' },
};

export default function SuggestionsPage() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const router = useRouter();

  const fetchSuggestions = () => {
    setLoading(true);
    api.get('/suggestions/').then(r => {
      setSuggestions(r.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { fetchSuggestions(); }, []);

  const generate = async () => {
    setGenerating(true);
    try {
      const r = await api.post('/suggestions/generate');
      setSuggestions(r.data);
    } catch {}
    setGenerating(false);
  };

  const apply = async (id: number) => {
    try {
      const r = await api.post(`/suggestions/${id}/apply`);
      if (r.data.redirect) {
        router.push(r.data.redirect);
      } else {
        setSuggestions(prev => prev.filter(s => s.id !== id));
        alert(r.data.message || 'Applied!');
      }
    } catch { alert('Failed to apply'); }
  };

  const feedback = async (id: number, type: string) => {
    await api.post(`/suggestions/${id}/feedback`, { feedback: type });
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, feedback: type } : s));
  };

  const dismiss = async (id: number) => {
    await api.post(`/suggestions/${id}/dismiss`);
    setSuggestions(prev => prev.filter(s => s.id !== id));
  };

  const getActionLabel = (type: string) => {
    const labels: Record<string, string> = {
      create_task: '✓ Create Task', open_tasks: '→ Open Tasks',
      summarize: '→ Summarize', create_workflow: '→ Create Workflow',
    };
    return labels[type] || '✓ Apply';
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">💡 AI Suggestions</h1>
          <p className="text-gray-500 mt-1">
            {suggestions.length > 0 ? `${suggestions.length} suggestion${suggestions.length > 1 ? 's' : ''} for you` : 'Smart recommendations based on your activity'}
          </p>
        </div>
        <button onClick={generate} disabled={generating}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium flex items-center gap-2">
          {generating ? (
            <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Generating...</>
          ) : (
            <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Refresh</>
          )}
        </button>
      </div>

      {/* Suggestions List */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : suggestions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 shadow-sm">
          <p className="text-5xl mb-3">💡</p>
          <p className="font-medium text-gray-600">No suggestions right now</p>
          <p className="text-sm mt-1">Check back after you add more tasks or documents</p>
          <button onClick={generate} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            Generate Suggestions
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {suggestions.map(s => {
            const config = priorityConfig[s.priority] || priorityConfig.normal;
            return (
              <div key={s.id} className={`bg-white rounded-xl border ${config.border} shadow-sm overflow-hidden transition-all hover:shadow-md`}>
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg ${config.bg}`}>
                      <span className="text-xl">{typeIcons[s.source_type] || '💡'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900">{s.title}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${config.badge}`}>{s.priority}</span>
                        {s.feedback === 'accepted' && <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Applied ✓</span>}
                        {s.feedback === 'rejected' && <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Rejected</span>}
                      </div>
                      <p className="text-sm text-gray-600">{s.description}</p>
                      
                      {/* Reason (collapsible) */}
                      {s.reason && (
                        <div className="mt-2">
                          <button onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                            <span>ℹ️</span> Why this suggestion?
                            <svg className={`w-3 h-3 transition-transform ${expandedId === s.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          {expandedId === s.id && (
                            <p className="text-xs text-gray-500 mt-1 pl-5 border-l-2 border-blue-200">{s.reason}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Actions */}
                <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {!s.feedback && (
                      <button onClick={() => apply(s.id)}
                        className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium transition-colors">
                        {getActionLabel(s.action_type)}
                      </button>
                    )}
                    <button onClick={() => dismiss(s.id)}
                      className="px-3 py-1.5 text-gray-500 text-sm rounded-lg hover:bg-gray-200 transition-colors">
                      Dismiss
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    {!s.feedback ? (
                      <>
                        <button onClick={() => feedback(s.id, 'accepted')} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Helpful">👍</button>
                        <button onClick={() => feedback(s.id, 'rejected')} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Not helpful">👎</button>
                      </>
                    ) : (
                      <span className="text-xs text-gray-400">{new Date(s.created_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
