'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api from '@/lib/api';

interface Session { id: number; title: string; is_pinned: boolean; created_at: string; messages?: any[]; }
interface Message { id: number; role: 'user'|'assistant'; content: string; created_at: string; task?: any; }
interface ModelOption { id: string; name: string; provider: string; }

export default function ChatPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<number|null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<number|null>(null);
  const [editContent, setEditContent] = useState('');
  const [showMenu, setShowMenu] = useState<number|null>(null);
  const [renamingId, setRenamingId] = useState<number|null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [attachedFile, setAttachedFile] = useState<{name:string;text:string}|null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState('auto');
  const [streamingContent, setStreamingContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const pinnedSessions = sessions.filter(s => s.is_pinned);
  const recentSessions = sessions.filter(s => !s.is_pinned);
  const filteredPinned = pinnedSessions.filter(s => s.title.toLowerCase().includes(search.toLowerCase()));
  const filteredRecent = recentSessions.filter(s => s.title.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    api.get('/chat/sessions').then(r => {
      setSessions(r.data);
      if (r.data.length > 0) selectSession(r.data[0].id);
    }).catch(() => {});
    api.get('/chat/models').then(r => setModels(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selectSession = async (id: number) => {
    setActiveSession(id);
    setShowMenu(null);
    try {
      const r = await api.get(`/chat/sessions/${id}/messages`);
      setMessages(r.data);
    } catch { setMessages([]); }
  };

  const createSession = async () => {
    try {
      const r = await api.post('/chat/sessions', { title: 'New Chat' });
      setSessions(prev => [r.data, ...prev]);
      setActiveSession(r.data.id);
      setMessages([]);
    } catch {}
  };

  const deleteSession = async (id: number) => {
    if (!confirm('Delete this chat?')) return;
    try {
      await api.delete(`/chat/sessions/${id}`);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (activeSession === id) {
        setActiveSession(null);
        setMessages([]);
      }
    } catch {}
    setShowMenu(null);
  };

  const togglePin = async (id: number) => {
    const session = sessions.find(s => s.id === id);
    if (!session) return;
    try {
      await api.patch(`/chat/sessions/${id}`, { is_pinned: !session.is_pinned });
      setSessions(prev => prev.map(s => s.id === id ? { ...s, is_pinned: !s.is_pinned } : s));
    } catch {}
    setShowMenu(null);
  };

  const startRename = (id: number, currentTitle: string) => {
    setRenamingId(id);
    setRenameValue(currentTitle);
    setShowMenu(null);
  };

  const saveRename = async () => {
    if (!renamingId || !renameValue.trim()) return;
    try {
      await api.patch(`/chat/sessions/${renamingId}`, { title: renameValue });
      setSessions(prev => prev.map(s => s.id === renamingId ? { ...s, title: renameValue } : s));
    } catch {}
    setRenamingId(null);
  };

  const sendMessage = async () => {
    if (!input.trim() || !activeSession || sending) return;
    let content = input.trim();
    if (attachedFile) {
      content = `[Attached: ${attachedFile.name}]\n\n${attachedFile.text}\n\n---\n\n${content}`;
    }
    const userMsg: Message = { id: Date.now(), role: 'user', content, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setAttachedFile(null);
    setSending(true);
    setStreamingContent('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/chat/sessions/${activeSession}/messages/stream?model=${selectedModel}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ role: 'user', content }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let taskInfo = null;
      let messageId = null;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const text = decoder.decode(value);
          const lines = text.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'token') {
                  fullContent += data.content;
                  setStreamingContent(fullContent);
                } else if (data.type === 'done') {
                  messageId = data.message_id;
                  taskInfo = data.task;
                  fullContent = data.content || fullContent;
                }
              } catch {}
            }
          }
        }
      }

      const assistantMsg: Message = { 
        id: messageId || Date.now(), 
        role: 'assistant', 
        content: fullContent, 
        created_at: new Date().toISOString(), 
        task: taskInfo 
      };
      setMessages(prev => [...prev.slice(0, -1), userMsg, assistantMsg]);
      setStreamingContent('');
      
      // Refresh sessions list
      const sessionsRes = await api.get('/chat/sessions');
      setSessions(sessionsRes.data);
    } catch {
      setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', content: 'Error getting response.', created_at: new Date().toISOString() }]);
    } finally { 
      setSending(false); 
      setStreamingContent('');
    }
  };

  const editMessage = async (msgId: number) => {
    if (!editContent.trim()) return;
    try {
      const r = await api.patch(`/chat/messages/${msgId}`, { content: editContent });
      const idx = messages.findIndex(m => m.id === msgId);
      const newMsgs = messages.slice(0, idx + 1);
      newMsgs[idx] = { ...newMsgs[idx], content: editContent };
      newMsgs.push({ id: r.data.message_id, role: 'assistant', content: r.data.content, created_at: new Date().toISOString() });
      setMessages(newMsgs);
    } catch {}
    setEditingId(null);
  };

  const [regenerating, setRegenerating] = useState<number | null>(null);

  const regenerate = async (msgId: number) => {
    setRegenerating(msgId);
    try {
      const r = await api.post(`/chat/messages/${msgId}/regenerate`);
      const idx = messages.findIndex(m => m.id === msgId);
      const newMsgs = messages.slice(0, idx);
      newMsgs.push({ id: r.data.message_id, role: 'assistant', content: r.data.content, created_at: new Date().toISOString() });
      setMessages(newMsgs);
    } catch {
      setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', content: 'Failed to regenerate. Please try again.', created_at: new Date().toISOString() }]);
    } finally {
      setRegenerating(null);
    }
  };

  const handleFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await api.post('/chat/attachments', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setAttachedFile({ name: r.data.filename, text: r.data.text });
    } catch { alert('Failed to attach file'); }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const startVoice = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Speech recognition not supported in this browser');
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev + (prev ? ' ' : '') + transcript);
      setIsRecording(false);
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  };

  const stopVoice = () => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  };

  const exportChat = async (format: string = 'text') => {
    if (!activeSession) return;
    try {
      const r = await api.get(`/chat/sessions/${activeSession}/export?format=${format}`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat_${activeSession}.${format === 'text' ? 'txt' : 'json'}`;
      a.click();
    } catch {}
  };

  const [copiedId, setCopiedId] = useState<number | null>(null);

  const copyMessage = (content: string, msgId: number) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(content);
    } else {
      const ta = document.createElement('textarea');
      ta.value = content;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedId(msgId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatTime = (d: string) => new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-50">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-80' : 'w-0'} bg-white border-r border-gray-200 flex flex-col transition-all duration-300 overflow-hidden`}>
        <div className="p-4 border-b border-gray-200 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-900">Chats</h2>
            <div className="flex gap-1">
              <button onClick={createSession} className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors" title="New Chat">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              </button>
            </div>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search chats..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredPinned.length > 0 && (
            <div className="px-4 py-2">
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">Pinned</p>
              {filteredPinned.map(s => (
                <SessionItem key={s.id} session={s} active={activeSession === s.id} onSelect={selectSession} onMenu={setShowMenu} showMenu={showMenu} onStartRename={startRename} onTogglePin={togglePin} onDelete={deleteSession} renamingId={renamingId} renameValue={renameValue} setRenameValue={setRenameValue} saveRename={saveRename} />
              ))}
            </div>
          )}
          {filteredRecent.length > 0 && (
            <div className="px-4 py-2">
              {filteredPinned.length > 0 && <p className="text-xs font-medium text-gray-500 uppercase mb-1">Recent</p>}
              {filteredRecent.map(s => (
                <SessionItem key={s.id} session={s} active={activeSession === s.id} onSelect={selectSession} onMenu={setShowMenu} showMenu={showMenu} onStartRename={startRename} onTogglePin={togglePin} onDelete={deleteSession} renamingId={renamingId} renameValue={renameValue} setRenameValue={setRenameValue} saveRename={saveRename} />
              ))}
            </div>
          )}
          {sessions.length === 0 && (
            <div className="p-8 text-center text-gray-400">
              <p className="text-3xl mb-2">💬</p>
              <p className="text-sm">No chats yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeSession ? (
          <>
            {/* Top Bar */}
            <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg lg:hidden">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
                <h3 className="font-semibold text-gray-900 truncate max-w-xs">{sessions.find(s => s.id === activeSession)?.title || 'Chat'}</h3>
              </div>
              <div className="flex items-center gap-2">
                {/* Model Selector */}
                <select
                  value={selectedModel}
                  onChange={e => setSelectedModel(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-gray-50 text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  disabled={sending}
                >
                  {models.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <button onClick={() => exportChat('text')} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" title="Export as Text">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </button>
                <button onClick={() => exportChat('json')} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" title="Export as JSON">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
              {messages.length === 0 && (
                <div className="text-center py-20">
                  <p className="text-5xl mb-4">💬</p>
                  <p className="text-gray-500 font-medium text-lg">Start a conversation</p>
                  <p className="text-gray-400 text-sm mt-1">Type a message or attach a file to begin</p>
                  <div className="flex flex-wrap gap-2 justify-center mt-4">
                    {['Summarize this topic', 'Explain quantum computing', 'Help me write an email'].map((q, i) => (
                      <button key={i} onClick={() => setInput(q)} className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-full text-sm hover:bg-gray-50 transition-colors">{q}</button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group`}>
                  <div className={`max-w-[80%] ${msg.role === 'user' ? 'order-2' : ''}`}>
                    {editingId === msg.id ? (
                      <div className="bg-white border border-blue-300 rounded-xl p-3 shadow-sm">
                        <textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="w-full text-sm outline-none resize-none" rows={3} />
                        <div className="flex gap-2 mt-2 justify-end">
                          <button onClick={() => setEditingId(null)} className="px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded">Cancel</button>
                          <button onClick={() => editMessage(msg.id)} className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">Save & Resend</button>
                        </div>
                      </div>
                    ) : (
                      <div className={`px-4 py-3 rounded-2xl ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-md' : 'bg-white border border-gray-200 text-gray-900 rounded-bl-md shadow-sm'}`}>
                        {msg.role === 'assistant' ? (
                          <div className="text-sm leading-relaxed prose prose-sm max-w-none prose-p:my-1 prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-code:text-pink-600 prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                          </div>
                        ) : (
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        )}
                        {msg.task && (
                          <div className={`mt-2 px-3 py-1.5 rounded-lg text-xs font-medium ${
                            msg.task.action?.includes('created') ? 'bg-green-100 text-green-700 border border-green-200' :
                            msg.task.action === 'completed' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                            msg.task.action === 'in_progress' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                            'bg-yellow-100 text-yellow-700 border border-yellow-200'
                          }`}>
                            {msg.task.action?.includes('created') && `✅ Task Created: ${msg.task.title}`}
                            {msg.task.action === 'completed' && `✅ Task Completed: ${msg.task.title}`}
                            {msg.task.action === 'in_progress' && `🔄 Task In Progress: ${msg.task.title}`}
                            {msg.task.action === 'pending' && `⏳ Task Pending: ${msg.task.title}`}
                            {msg.task.action?.includes('already') && `ℹ️ ${msg.task.title}`}
                          </div>
                        )}
                        <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'}`}>{formatTime(msg.created_at)}</p>
                      </div>
                    )}
                    
                    {/* Action buttons */}
                    {editingId !== msg.id && (
                      <div className={`flex items-center gap-1 mt-1 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} opacity-0 group-hover:opacity-100 transition-opacity`}>
                        <button onClick={() => copyMessage(msg.content, msg.id)} className={`p-1 rounded ${copiedId === msg.id ? 'text-green-500' : 'text-gray-400 hover:text-gray-600'}`} title={copiedId === msg.id ? 'Copied!' : 'Copy'}>
                          {copiedId === msg.id ? (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                          )}
                        </button>
                        {msg.role === 'user' && (
                          <button onClick={() => { setEditingId(msg.id); setEditContent(msg.content); }} className="p-1 text-gray-400 hover:text-gray-600 rounded" title="Edit">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                        )}
                        {msg.role === 'assistant' && (
                          <button onClick={() => regenerate(msg.id)} disabled={regenerating === msg.id} className={`p-1 rounded ${regenerating === msg.id ? 'text-blue-500 animate-spin' : 'text-gray-400 hover:text-gray-600'}`} title="Regenerate">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {(sending || streamingContent) && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm max-w-[80%]">
                    {streamingContent ? (
                      <div className="text-sm leading-relaxed prose prose-sm max-w-none prose-p:my-1">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                        <span className="text-xs text-gray-500">Thinking...</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="bg-white border-t border-gray-200 px-4 py-3">
              {attachedFile && (
                <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg">
                  <span className="text-sm">📎</span>
                  <span className="text-sm text-blue-700 font-medium">{attachedFile.name}</span>
                  <span className="text-xs text-blue-500">({attachedFile.text.length} chars)</span>
                  <button onClick={() => setAttachedFile(null)} className="ml-auto text-blue-400 hover:text-blue-600">×</button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <div className="flex gap-1">
                  <button onClick={() => fileInputRef.current?.click()} className="p-2.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors" title="Attach file">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                  </button>
                  <input ref={fileInputRef} type="file" accept=".pdf,.txt,.csv,.md,.docx" onChange={handleFileAttach} className="hidden" />
                  {isRecording ? (
                    <button onClick={stopVoice} className="p-2.5 text-red-500 bg-red-50 rounded-lg animate-pulse" title="Stop recording">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                    </button>
                  ) : (
                    <button onClick={startVoice} className="p-2.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors" title="Voice input">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                    </button>
                  )}
                </div>
                <div className="flex-1 relative">
                  <textarea
                    value={input}
                    onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    placeholder="Type a message..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none max-h-[120px]"
                    rows={1}
                    disabled={sending}
                  />
                </div>
                <button
                  onClick={sendMessage}
                  disabled={sending || (!input.trim() && !attachedFile)}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white p-3 rounded-xl transition-colors flex-shrink-0"
                >
                  {sending ? (
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2 text-center">AI may produce inaccurate information. Verify important facts.</p>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-6xl mb-4">💬</p>
              <p className="text-gray-500 font-medium text-lg">Start a new conversation</p>
              <p className="text-gray-400 text-sm mt-1">Click "New Chat" to begin</p>
              <button onClick={createSession} className="mt-4 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors">+ New Chat</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SessionItem({ session, active, onSelect, onMenu, showMenu, onStartRename, onTogglePin, onDelete, renamingId, renameValue, setRenameValue, saveRename }: any) {
  return (
    <div className="relative">
      {renamingId === session.id ? (
        <div className="flex gap-1 mb-1">
          <input value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveRename()} className="flex-1 px-2 py-1 border rounded text-xs" autoFocus />
          <button onClick={saveRename} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">✓</button>
        </div>
      ) : (
        <button
          onClick={() => onSelect(session.id)}
          className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center gap-2 ${
            active ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          {session.is_pinned && <span className="text-yellow-500 text-xs">📌</span>}
          <span className="flex-1 truncate">{session.title}</span>
          <button onClick={e => { e.stopPropagation(); onMenu(showMenu === session.id ? null : session.id); }} className="p-1 text-gray-400 hover:text-gray-600 rounded opacity-0 group-hover:opacity-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
          </button>
        </button>
      )}
      {showMenu === session.id && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 w-40">
          <button onClick={() => onStartRename(session.id, session.title)} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">Rename</button>
          <button onClick={() => onTogglePin(session.id)} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">{session.is_pinned ? 'Unpin' : 'Pin'}</button>
          <button onClick={() => onDelete(session.id)} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50">Delete</button>
        </div>
      )}
    </div>
  );
}
