'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import api from '@/lib/api';

interface Doc { id: number; filename: string; uploaded_at: string; file_size: number; total_chunks: number; status: string; error_message?: string; folder_id?: number; tags?: {id:number;name:string;color:string}[]; }
interface DocPage { page_number: number; text: string; }
interface DocDetail extends Doc { content: string; pages: DocPage[]; }
interface Folder { id: number; name: string; color: string; }
interface Tag { id: number; name: string; color: string; }
interface QARecord { id: number; question: string; answer: string; sources?: any; document_id?: number; is_cross_doc: boolean; created_at: string; }
interface UploadProgress { filename: string; progress: number; status: 'uploading'|'processing'|'done'|'error'; error?: string; }
interface ChatMessage { role: 'user'|'assistant'; content: string; sources?: any; chunks_found?: number; timestamp: number; }

type Tab = 'content'|'ask'|'summary'|'keypoints'|'history'|'share';

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [viewMode, setViewMode] = useState<'list'|'grid'>('list');
  const [activeDoc, setActiveDoc] = useState<DocDetail|null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('content');
  const [dragOver, setDragOver] = useState(false);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Folders & Tags
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [activeFolder, setActiveFolder] = useState<number|null>(null);
  const [activeTag, setActiveTag] = useState<number|null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewTag, setShowNewTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');

  // Ask state - chat style
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [query, setQuery] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [askAllMode, setAskAllMode] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Summary/Keypoints
  const [summary, setSummary] = useState('');
  const [keypoints, setKeypoints] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [keypointsLoading, setKeypointsLoading] = useState(false);

  // History
  const [history, setHistory] = useState<QARecord[]>([]);

  // Compare
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [compareQuestion, setCompareQuestion] = useState('');
  const [compareResult, setCompareResult] = useState('');
  const [compareLoading, setCompareLoading] = useState(false);

  // Share
  const [shareEmail, setShareEmail] = useState('');
  const [shareList, setShareList] = useState<any[]>([]);

  // Preview panel
  const [showPreview, setShowPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [previewPage, setPreviewPage] = useState(1);
  const [previewFilename, setPreviewFilename] = useState('');
  const [previewHighlight, setPreviewHighlight] = useState('');

  // Delete
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Doc|null>(null);
  const [deleting, setDeleting] = useState(false);

  // Shared with me
  const [sharedDocs, setSharedDocs] = useState<any[]>([]);
  const [showShared, setShowShared] = useState(false);

  const fetchDocs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      params.append('sort_by', sortBy);
      if (activeFolder !== null) params.append('folder_id', String(activeFolder));
      if (activeTag !== null) params.append('tag_id', String(activeTag));
      const res = await api.get(`/documents/?${params.toString()}`);
      setDocuments(res.data);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, [search, sortBy, activeFolder, activeTag]);

  const fetchFolders = async () => { try { const r = await api.get('/documents/folders'); setFolders(r.data); } catch(e){} };
  const fetchTags = async () => { try { const r = await api.get('/documents/tags'); setTags(r.data); } catch(e){} };
  const fetchShared = async () => { try { const r = await api.get('/documents/shared-with-me'); setSharedDocs(r.data); } catch(e){} };

  useEffect(() => { fetchDocs(); fetchFolders(); fetchTags(); }, [fetchDocs]);
  useEffect(() => { const i = setInterval(() => { if (documents.some(d => d.status === 'processing')) fetchDocs(); }, 2000); return () => clearInterval(i); }, [documents, fetchDocs]);

  const uploadFile = async (file: File) => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!['.pdf','.txt','.csv','.md','.docx'].includes(ext)) { setUploads(p => [...p, {filename:file.name,progress:0,status:'error',error:'Unsupported format'}]); return; }
    if (file.size > 20*1024*1024) { setUploads(p => [...p, {filename:file.name,progress:0,status:'error',error:'Max 20MB'}]); return; }
    setUploads(p => [...p, {filename:file.name,progress:0,status:'uploading'}]);
    const fd = new FormData(); fd.append('file', file);
    try {
      await api.post('/documents/upload', fd, { headers:{'Content-Type':'multipart/form-data'}, onUploadProgress: e => { const pct = e.total ? Math.round((e.loaded/e.total)*100) : 0; setUploads(p => p.map(u => u.filename===file.name?{...u,progress:pct}:u)); } });
      setUploads(p => p.map(u => u.filename===file.name?{...u,progress:100,status:'processing'}:u));
      fetchDocs(); setTimeout(() => setUploads(p => p.filter(u => u.filename!==file.name)), 3000);
    } catch(err:any) { setUploads(p => p.map(u => u.filename===file.name?{...u,status:'error',error:err?.response?.data?.detail||'Failed'}:u)); }
  };

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); Array.from(e.dataTransfer.files).forEach(uploadFile); };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { if(e.target.files) Array.from(e.target.files).forEach(uploadFile); if(fileInputRef.current) fileInputRef.current.value=''; };

  const loadDocDetail = async (doc: Doc) => {
    setActiveTab('content'); setChatMessages([]); setSummary(''); setKeypoints(''); setQuery('');
    try { const r = await api.get(`/documents/${doc.id}`); setActiveDoc(r.data); setPreviewPage(1); } catch { alert('Failed to load'); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return; setDeleting(true);
    try { await api.delete(`/documents/${deleteTarget.id}`); if(activeDoc?.id===deleteTarget.id) setActiveDoc(null); setShowDeleteModal(false); setDeleteTarget(null); fetchDocs(); }
    catch { alert('Failed'); } finally { setDeleting(false); }
  };

  const handleAsk = async () => {
    if (!query.trim()) return;
    const userMsg: ChatMessage = { role: 'user', content: query, timestamp: Date.now() };
    setChatMessages(prev => [...prev, userMsg]);
    const currentQuery = query;
    setQuery('');
    setAskLoading(true);
    
    try {
      const ep = askAllMode ? '/documents/ask-all' : `/documents/${activeDoc?.id}/ask`;
      const r = await api.post(ep, { query: currentQuery });
      const assistantMsg: ChatMessage = { 
        role: 'assistant', 
        content: r.data.answer, 
        sources: r.data.sources,
        chunks_found: r.data.chunks_found,
        timestamp: Date.now() 
      };
      setChatMessages(prev => [...prev, assistantMsg]);
    } catch {
      const errorMsg: ChatMessage = { role: 'assistant', content: 'Sorry, I encountered an error getting the answer. Please try again.', timestamp: Date.now() };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally { setAskLoading(false); }
  };

  const handleSummarize = async () => { if(!activeDoc) return; setSummaryLoading(true); setSummary(''); try { const r = await api.post(`/documents/${activeDoc.id}/summarize`); setSummary(r.data.summary); } catch { setSummary('Error generating summary.'); } finally { setSummaryLoading(false); } };
  const handleKeyPoints = async () => { if(!activeDoc) return; setKeypointsLoading(true); setKeypoints(''); try { const r = await api.post(`/documents/${activeDoc.id}/keypoints`); setKeypoints(r.data.keypoints); } catch { setKeypoints('Error extracting key points.'); } finally { setKeypointsLoading(false); } };
  const loadHistory = async () => { try { const r = await api.get('/documents/history/all'); setHistory(r.data); } catch {} };
  useEffect(() => { if(activeTab==='history') loadHistory(); }, [activeTab]);

  // Folder/Tag operations
  const createFolder = async () => { if(!newFolderName.trim()) return; try { await api.post(`/documents/folders?name=${encodeURIComponent(newFolderName)}`); setNewFolderName(''); setShowNewFolder(false); fetchFolders(); } catch {} };
  const createTag = async () => { if(!newTagName.trim()) return; try { await api.post(`/documents/tags?name=${encodeURIComponent(newTagName)}`); setNewTagName(''); setShowNewTag(false); fetchTags(); } catch {} };
  const deleteFolder = async (id: number) => { try { await api.delete(`/documents/folders/${id}`); if(activeFolder===id) setActiveFolder(null); fetchFolders(); fetchDocs(); } catch {} };
  const deleteTag = async (id: number) => { try { await api.delete(`/documents/tags/${id}`); if(activeTag===id) setActiveTag(null); fetchTags(); fetchDocs(); } catch {} };
  const moveToFolder = async (folderId: number|null) => { if(!activeDoc) return; try { await api.post(`/documents/${activeDoc.id}/move${folderId?'?folder_id='+folderId:''}`); loadDocDetail({...activeDoc, folder_id: folderId||undefined} as any); } catch {} };
  const addTagToDoc = async (tagId: number) => { if(!activeDoc) return; try { await api.post(`/documents/${activeDoc.id}/tags/${tagId}`); loadDocDetail(activeDoc); } catch {} };
  const removeTagFromDoc = async (tagId: number) => { if(!activeDoc) return; try { await api.delete(`/documents/${activeDoc.id}/tags/${tagId}`); loadDocDetail(activeDoc); } catch {} };

  // Compare
  const handleCompare = async () => {
    if(compareIds.length<2||!compareQuestion.trim()) return; setCompareLoading(true); setCompareResult('');
    try { const r = await api.post('/documents/compare', compareIds, {params:{question:compareQuestion}}); setCompareResult(r.data.answer); }
    catch { setCompareResult('Error comparing documents.'); } finally { setCompareLoading(false); }
  };

  // Share
  const handleShare = async () => { if(!activeDoc||!shareEmail.trim()) return; try { await api.post(`/documents/${activeDoc.id}/share?email=${encodeURIComponent(shareEmail)}&permission=view`); setShareEmail(''); loadShares(activeDoc.id); } catch { alert('User not found'); } };
  const loadShares = async (docId: number) => { try { const r = await api.get(`/documents/${docId}/shares`); setShareList(r.data); } catch {} };
  const removeShare = async (userId: number) => { if(!activeDoc) return; try { await api.delete(`/documents/${activeDoc.id}/shares/${userId}`); loadShares(activeDoc.id); } catch {} };

  // Export
  const exportHistory = async () => { try { const r = await api.get('/documents/history/export?format=text', {responseType:'blob'}); const url = URL.createObjectURL(r.data); const a = document.createElement('a'); a.href=url; a.download='qa_history.txt'; a.click(); } catch {} };

  // Preview panel
  const openPreview = (page: number, filename: string, content: string, highlight?: string) => {
    setPreviewPage(page);
    setPreviewFilename(filename);
    setPreviewContent(content);
    setPreviewHighlight(highlight || '');
    setShowPreview(true);
  };

  const formatSize = (b:number) => { if(!b) return '—'; if(b<1024) return b+' B'; if(b<1048576) return (b/1024).toFixed(1)+' KB'; return (b/1048576).toFixed(1)+' MB'; };
  const formatDate = (d:string) => new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  const getFileIcon = (f:string) => { const e=f.split('.').pop()?.toLowerCase(); return e==='pdf'?'📕':e==='docx'?'📘':e==='csv'?'📊':e==='md'?'📝':'📄'; };
  const getStatusBadge = (s:string) => {
    if(s==='processing') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700"><div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse"></div>Processing</span>;
    if(s==='ready') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"><div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>Ready</span>;
    if(s==='failed') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700"><div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>Failed</span>;
    return null;
  };

  // Auto-scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  if(loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-50">
      {/* Left Sidebar - Document Library */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200 space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-gray-900">Documents</h1>
            <div className="flex gap-1">
              <button onClick={()=>setViewMode('list')} className={`p-1.5 rounded ${viewMode==='list'?'bg-blue-100 text-blue-600':'text-gray-400 hover:bg-gray-100'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              <button onClick={()=>setViewMode('grid')} className={`p-1.5 rounded ${viewMode==='grid'?'bg-blue-100 text-blue-600':'text-gray-400 hover:bg-gray-100'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
              </button>
            </div>
          </div>
          <div onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onDrop={handleDrop} className={`border-2 border-dashed rounded-lg p-3 text-center transition-colors cursor-pointer ${dragOver?'border-blue-500 bg-blue-50':'border-gray-300 hover:border-blue-400'}`} onClick={()=>fileInputRef.current?.click()}>
            <input ref={fileInputRef} type="file" accept=".pdf,.txt,.csv,.md,.docx" multiple onChange={handleFileSelect} className="hidden" />
            <p className="text-sm text-gray-600 font-medium">+ Upload Files</p>
            <p className="text-xs text-gray-400 mt-0.5">PDF, DOCX, TXT, CSV, MD (max 20MB)</p>
          </div>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search documents..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none bg-white">
            <option value="date">Newest first</option><option value="name">Name A-Z</option><option value="size">Largest first</option>
          </select>
        </div>

        {/* Upload Progress */}
        {uploads.length>0 && <div className="px-4 py-2 border-b border-gray-100 space-y-2">{uploads.map((u,i)=><div key={i} className="space-y-1"><div className="flex items-center justify-between text-xs"><span className="text-gray-600 truncate max-w-[200px]">{u.filename}</span>{u.status==='error'?<span className="text-red-500">{u.error}</span>:<span className="text-gray-400">{u.progress}%</span>}</div>{u.status==='uploading'&&<div className="w-full bg-gray-200 rounded-full h-1.5"><div className="bg-blue-600 h-1.5 rounded-full transition-all" style={{width:`${u.progress}%`}}></div></div>}</div>)}</div>}

        {/* Folders */}
        <div className="px-4 py-2 border-b border-gray-100">
          <div className="flex items-center justify-between mb-1"><span className="text-xs font-medium text-gray-500 uppercase">Folders</span><button onClick={()=>setShowNewFolder(!showNewFolder)} className="text-blue-600 hover:text-blue-700 text-xs">+ New</button></div>
          {showNewFolder && <div className="flex gap-1 mb-2"><input value={newFolderName} onChange={e=>setNewFolderName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&createFolder()} placeholder="Folder name" className="flex-1 px-2 py-1 border rounded text-xs" /><button onClick={createFolder} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">Add</button></div>}
          <div className="space-y-0.5">
            <button onClick={()=>setActiveFolder(null)} className={`w-full text-left px-2 py-1.5 rounded text-xs ${activeFolder===null?'bg-blue-50 text-blue-700 font-medium':'text-gray-600 hover:bg-gray-50'}`}>All Documents</button>
            {folders.map(f=><div key={f.id} className="flex items-center group"><button onClick={()=>setActiveFolder(f.id)} className={`flex-1 text-left px-2 py-1.5 rounded text-xs ${activeFolder===f.id?'bg-blue-50 text-blue-700 font-medium':'text-gray-600 hover:bg-gray-50'}`}><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{background:f.color}}></span>{f.name}</button><button onClick={()=>deleteFolder(f.id)} className="text-gray-400 hover:text-red-500 text-xs opacity-0 group-hover:opacity-100">×</button></div>)}
          </div>
        </div>

        {/* Tags */}
        <div className="px-4 py-2 border-b border-gray-100">
          <div className="flex items-center justify-between mb-1"><span className="text-xs font-medium text-gray-500 uppercase">Tags</span><button onClick={()=>setShowNewTag(!showNewTag)} className="text-blue-600 hover:text-blue-700 text-xs">+ New</button></div>
          {showNewTag && <div className="flex gap-1 mb-2"><input value={newTagName} onChange={e=>setNewTagName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&createTag()} placeholder="Tag name" className="flex-1 px-2 py-1 border rounded text-xs" /><button onClick={createTag} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">Add</button></div>}
          <div className="flex flex-wrap gap-1">
            {tags.map(t=><button key={t.id} onClick={()=>setActiveTag(activeTag===t.id?null:t.id)} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${activeTag===t.id?'opacity-100':'opacity-70 hover:opacity-100'}`} style={{borderColor:t.color,color:t.color}}>{t.name}<span onClick={e=>{e.stopPropagation();deleteTag(t.id)}} className="ml-0.5 cursor-pointer hover:text-red-500">×</span></button>)}
          </div>
        </div>

        {/* Shared with me */}
        <div className="px-4 py-2 border-b border-gray-100">
          <button onClick={()=>{setShowShared(!showShared);if(!showShared)fetchShared();}} className="text-xs font-medium text-gray-500 uppercase hover:text-gray-700">Shared with Me {sharedDocs.length>0&&`(${sharedDocs.length})`}</button>
          {showShared && <div className="mt-2 space-y-1">{sharedDocs.length===0?<p className="text-xs text-gray-400">No shared documents</p>:sharedDocs.map(d=><div key={d.id} className="flex items-center gap-2 px-2 py-1 bg-purple-50 rounded text-xs"><span className="text-purple-700">🔗</span><span className="truncate text-gray-700">{d.filename}</span><span className="text-gray-400 ml-auto">by {d.shared_by}</span></div>)}</div>}
        </div>

        {/* Document List */}
        <div className="flex-1 overflow-y-auto">
          {documents.length===0?<div className="p-8 text-center text-gray-400"><p className="text-4xl mb-2">📁</p><p className="text-sm font-medium">No documents yet</p><p className="text-xs mt-1">Upload your first document</p></div>
          :<div className={viewMode==='grid'?'grid grid-cols-2 gap-2 p-3':'divide-y divide-gray-100'}>
            {documents.map(doc=><button key={doc.id} onClick={()=>loadDocDetail(doc)} className={`${viewMode==='grid'?`flex flex-col items-center p-3 rounded-lg border transition-colors ${activeDoc?.id===doc.id?'bg-blue-50 border-blue-300':'border-gray-200 hover:bg-gray-50'}`:`w-full text-left px-4 py-3 transition-colors ${activeDoc?.id===doc.id?'bg-blue-50 border-l-4 border-l-blue-600':'hover:bg-gray-50'}`}`}>
              {viewMode==='grid'?<><span className="text-3xl mb-2">{getFileIcon(doc.filename)}</span><p className="font-medium text-gray-900 text-xs truncate w-full text-center">{doc.filename}</p>{getStatusBadge(doc.status)}</>
              :<div className="flex items-center gap-3"><input type="checkbox" checked={compareIds.includes(doc.id)} onChange={e=>{e.stopPropagation();setCompareIds(p=>p.includes(doc.id)?p.filter(x=>x!==doc.id):[...p,doc.id])}} className="rounded border-gray-300" onClick={e=>e.stopPropagation()} /><span className="text-2xl">{getFileIcon(doc.filename)}</span><div className="flex-1 min-w-0"><p className="font-medium text-gray-900 text-sm truncate">{doc.filename}</p><div className="flex items-center gap-2 mt-0.5">{getStatusBadge(doc.status)}<span className="text-xs text-gray-400">{formatSize(doc.file_size)}</span><span className="text-xs text-gray-400">{formatDate(doc.uploaded_at)}</span></div></div></div>}
            </button>)}
          </div>}
        </div>

        {/* Compare Bar */}
        {compareIds.length>=2 && <div className="p-3 border-t border-gray-200 bg-blue-50">
          <p className="text-xs text-blue-700 font-medium mb-2">{compareIds.length} documents selected for comparison</p>
          <div className="flex gap-2"><input value={compareQuestion} onChange={e=>setCompareQuestion(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleCompare()} placeholder="What to compare?" className="flex-1 px-2 py-1 border rounded text-xs" /><button onClick={handleCompare} disabled={compareLoading} className="px-3 py-1 bg-blue-600 text-white rounded text-xs">{compareLoading?'...':'Compare'}</button><button onClick={()=>{setCompareIds([]);setCompareQuestion('');setCompareResult('')}} className="text-gray-400 hover:text-red-500 text-xs">×</button></div>
          {compareResult && <div className="mt-2 p-2 bg-white rounded border text-xs text-gray-700 whitespace-pre-wrap max-h-40 overflow-y-auto">{compareResult}</div>}
        </div>}
      </div>

      {/* Middle - Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeDoc?<>
          {/* Document Header */}
          <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{getFileIcon(activeDoc.filename)}</span>
              <div>
                <h2 className="font-semibold text-gray-900">{activeDoc.filename}</h2>
                <div className="flex gap-4 text-xs text-gray-400 mt-0.5">
                  <span>{formatDate(activeDoc.uploaded_at)}</span><span>{formatSize(activeDoc.file_size)}</span><span>{activeDoc.total_chunks} chunks</span>{getStatusBadge(activeDoc.status)}
                  {activeDoc.folder_id && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded">{folders.find(f=>f.id===activeDoc.folder_id)?.name||'Folder'}</span>}
                </div>
                {activeDoc.tags&&activeDoc.tags.length>0&&<div className="flex gap-1 mt-1">{activeDoc.tags.map(t=><span key={t.id} className="px-2 py-0.5 rounded-full text-xs font-medium border" style={{borderColor:t.color,color:t.color}}>{t.name}<button onClick={()=>removeTagFromDoc(t.id)} className="ml-1 hover:text-red-500">×</button></span>)}</div>}
              </div>
            </div>
            <div className="flex gap-2">
              <select onChange={e=>moveToFolder(e.target.value?Number(e.target.value):null)} value={activeDoc.folder_id||''} className="px-2 py-1 border border-gray-300 rounded text-xs">
                <option value="">No folder</option>
                {folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <select onChange={e=>{if(e.target.value){addTagToDoc(Number(e.target.value));e.target.value='';}}} className="px-2 py-1 border border-gray-300 rounded text-xs" defaultValue="">
                <option value="" disabled>+ Tag</option>
                {tags.filter(t=>!activeDoc.tags?.some(at=>at.id===t.id)).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button onClick={()=>setShowPreview(!showPreview)} className={`px-3 py-1.5 text-sm font-medium rounded-lg ${showPreview?'bg-blue-100 text-blue-700':'text-gray-600 hover:bg-gray-100'}`}>
                {showPreview ? 'Hide Preview' : 'Show Preview'}
              </button>
              <button onClick={()=>{setDeleteTarget(activeDoc);setShowDeleteModal(true)}} className="px-3 py-1.5 text-red-600 hover:bg-red-50 text-sm font-medium rounded-lg">Delete</button>
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white border-b border-gray-200 px-6">
            <div className="flex gap-1">
              {([{'id':'content','label':'Content','icon':'📄'},{'id':'ask','label':'Ask','icon':'💬'},{'id':'summary','label':'Summary','icon':'📝'},{'id':'keypoints','label':'Key Points','icon':'🔑'},{'id':'history','label':'History','icon':'🕐'},{'id':'share','label':'Share','icon':'🔗'}] as const).map(tab=><button key={tab.id} onClick={()=>setActiveTab(tab.id)} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab===tab.id?'border-blue-600 text-blue-600':'border-transparent text-gray-500 hover:text-gray-700'}`}>{tab.icon} {tab.label}</button>)}
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Content Tab */}
            {activeTab==='content'&&<div className="space-y-4">
              {activeDoc.pages.length>1&&<div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 px-4 py-2"><span className="text-sm text-gray-500">Page:</span>{activeDoc.pages.map(p=><button key={p.page_number} onClick={()=>{setPreviewPage(p.page_number);openPreview(p.page_number, activeDoc.filename, p.text)}} className={`px-3 py-1 rounded text-sm font-medium ${previewPage===p.page_number?'bg-blue-600 text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{p.page_number}</button>)}</div>}
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{activeDoc.pages[previewPage-1]?.text||activeDoc.content}</pre>
              </div>
            </div>}

            {/* Ask Tab - Chat Style */}
            {activeTab==='ask'&&<div className="flex flex-col h-full">
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm mb-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">Ask a Question</h3>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={askAllMode} onChange={e=>setAskAllMode(e.target.checked)} className="rounded border-gray-300 text-blue-600" />
                    <span className="text-gray-600">Ask across all documents</span>
                  </label>
                </div>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto space-y-4 mb-4">
                {chatMessages.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-4xl mb-3">💬</p>
                    <p className="text-gray-500 font-medium">Ask anything about this document</p>
                    <p className="text-gray-400 text-sm mt-1">The AI will search through the document content to find answers</p>
                    <div className="flex flex-wrap gap-2 justify-center mt-4">
                      {['What is this document about?', 'Summarize the key points', 'What are the main topics?'].map((q, i) => (
                        <button key={i} onClick={() => { setQuery(q); }} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-full text-xs hover:bg-gray-200 transition-colors">{q}</button>
                      ))}
                    </div>
                  </div>
                )}
                
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] ${msg.role === 'user' ? 'order-2' : ''}`}>
                      <div className={`px-4 py-3 rounded-2xl ${
                        msg.role === 'user' 
                          ? 'bg-blue-600 text-white rounded-br-md' 
                          : 'bg-white border border-gray-200 text-gray-900 rounded-bl-md shadow-sm'
                      }`}>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      </div>
                      {msg.sources && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {msg.sources.document && (
                            <button 
                              onClick={() => openPreview(1, msg.sources.document, '')}
                              className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs hover:bg-blue-100 transition-colors flex items-center gap-1"
                            >
                              📄 {msg.sources.document}
                            </button>
                          )}
                          {msg.sources.documents?.map((d:any, j:number) => (
                            <button 
                              key={j}
                              onClick={() => openPreview(1, d.document, '')}
                              className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs hover:bg-blue-100 transition-colors flex items-center gap-1"
                            >
                              📄 {d.document} {d.relevance && `(${Math.round(d.relevance * 100)}%)`}
                            </button>
                          ))}
                          {msg.sources.pages?.map((p:number, j:number) => (
                            <span key={j} className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs">Page {p}</span>
                          ))}
                          {msg.sources.relevance_scores && (
                            <span className="px-2 py-1 bg-green-50 text-green-700 rounded text-xs">
                              {msg.chunks_found} chunks found
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {askLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                        </div>
                        <span className="text-xs text-gray-500">Searching document...</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="flex gap-3">
                  <input 
                    value={query} 
                    onChange={e=>setQuery(e.target.value)} 
                    onKeyDown={e=>e.key==='Enter'&&!askLoading&&handleAsk()} 
                    placeholder={askAllMode ? "Ask across all documents..." : "Ask about this document..."} 
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm" 
                    disabled={askLoading}
                  />
                  <button 
                    onClick={handleAsk} 
                    disabled={askLoading||!query.trim()} 
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-3 rounded-xl font-medium text-sm flex items-center gap-2"
                  >
                    {askLoading ? (
                      <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Thinking...</>
                    ) : (
                      <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg> Ask</>
                    )}
                  </button>
                </div>
              </div>
            </div>}

            {/* Summary Tab */}
            {activeTab==='summary'&&<div className="space-y-4">
              {!summary&&!summaryLoading&&<div className="bg-white rounded-xl border border-gray-200 p-8 text-center shadow-sm"><p className="text-4xl mb-3">📝</p><p className="text-gray-600 font-medium">Generate an AI summary</p><p className="text-gray-400 text-sm mt-1">Get a concise summary of the document content</p><button onClick={handleSummarize} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-medium text-sm">Generate Summary</button></div>}
              {summaryLoading&&<div className="bg-white rounded-xl border border-gray-200 p-8 text-center shadow-sm"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div><p className="text-gray-500 text-sm">Generating summary...</p></div>}
              {summary&&!summaryLoading&&<div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm"><div className="flex items-center justify-between mb-4"><h3 className="font-semibold text-gray-900">Summary</h3><div className="flex gap-2"><button onClick={()=>navigator.clipboard.writeText(summary)} className="text-sm text-gray-500 hover:text-gray-700">Copy</button><button onClick={handleSummarize} className="text-sm text-blue-600 hover:text-blue-700">Regenerate</button></div></div><div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{summary}</div></div>}
            </div>}

            {/* Key Points Tab */}
            {activeTab==='keypoints'&&<div className="space-y-4">
              {!keypoints&&!keypointsLoading&&<div className="bg-white rounded-xl border border-gray-200 p-8 text-center shadow-sm"><p className="text-4xl mb-3">🔑</p><p className="text-gray-600 font-medium">Extract key points</p><p className="text-gray-400 text-sm mt-1">Identify the most important points from the document</p><button onClick={handleKeyPoints} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-medium text-sm">Extract Key Points</button></div>}
              {keypointsLoading&&<div className="bg-white rounded-xl border border-gray-200 p-8 text-center shadow-sm"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div><p className="text-gray-500 text-sm">Extracting key points...</p></div>}
              {keypoints&&!keypointsLoading&&<div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm"><div className="flex items-center justify-between mb-4"><h3 className="font-semibold text-gray-900">Key Points</h3><div className="flex gap-2"><button onClick={()=>navigator.clipboard.writeText(keypoints)} className="text-sm text-gray-500 hover:text-gray-700">Copy</button><button onClick={handleKeyPoints} className="text-sm text-blue-600 hover:text-blue-700">Regenerate</button></div></div><div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{keypoints}</div></div>}
            </div>}

            {/* History Tab */}
            {activeTab==='history'&&<div className="space-y-3">
              <div className="flex items-center justify-between"><h3 className="font-semibold text-gray-900">Q&A History</h3><button onClick={exportHistory} className="text-sm text-blue-600 hover:text-blue-700">📥 Export</button></div>
              {history.length===0?<div className="bg-white rounded-xl border border-gray-200 p-8 text-center shadow-sm"><p className="text-4xl mb-3">🕐</p><p className="text-gray-600 font-medium">No questions asked yet</p></div>
              :history.map(h=><div key={h.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm"><div className="flex items-start justify-between mb-2"><p className="text-sm font-medium text-gray-900">Q: {h.question}</p><span className="text-xs text-gray-400 whitespace-nowrap ml-2">{formatDate(h.created_at)}</span></div><p className="text-sm text-gray-700 whitespace-pre-wrap mb-2">{h.answer}</p><div className="flex items-center gap-2">{h.is_cross_doc&&<span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">All docs</span>}{h.sources?.document&&<span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{h.sources.document}</span>}<button onClick={()=>{setQuery(h.question);setActiveTab('ask')}} className="text-xs text-blue-500 hover:text-blue-700 ml-auto">Re-ask</button><button onClick={()=>navigator.clipboard.writeText(h.answer)} className="text-xs text-gray-400 hover:text-gray-600">Copy</button></div></div>)}
            </div>}

            {/* Share Tab */}
            {activeTab==='share'&&<div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-4">Share Document</h3>
                <div className="flex gap-3"><input value={shareEmail} onChange={e=>setShareEmail(e.target.value)} placeholder="Enter email address" className="flex-1 px-4 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm" /><button onClick={handleShare} disabled={!shareEmail.trim()} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-3 rounded-xl font-medium text-sm">Share</button></div>
              </div>
              {shareList.length>0&&<div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <h4 className="font-medium text-gray-900 mb-3">Shared with</h4>
                <div className="space-y-2">{shareList.map((s,i)=><div key={i} className="flex items-center justify-between py-2 border-b last:border-0"><div><p className="text-sm font-medium text-gray-900">{s.email}</p><p className="text-xs text-gray-400">{s.permission} access</p></div><button onClick={()=>removeShare(s.user_id)} className="text-red-500 hover:text-red-700 text-xs">Remove</button></div>)}</div>
              </div>}
            </div>}
          </div>
        </>:<div className="flex-1 flex items-center justify-center"><div className="text-center"><p className="text-6xl mb-4">📄</p><p className="text-gray-500 font-medium text-lg">Select a document or upload a new one</p><p className="text-gray-400 text-sm mt-1">Supports PDF, DOCX, TXT, CSV, MD</p></div></div>}
      </div>

      {/* Right Panel - Preview */}
      {showPreview && (
        <div className="w-96 bg-white border-l border-gray-200 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">{getFileIcon(previewFilename)}</span>
              <div>
                <p className="font-medium text-gray-900 text-sm truncate max-w-[200px]">{previewFilename}</p>
                <p className="text-xs text-gray-500">Page {previewPage}</p>
              </div>
            </div>
            <button onClick={() => setShowPreview(false)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {previewContent ? (
              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-sans">
                {previewHighlight ? (
                  previewContent.split('\n').map((line, i) => (
                    <p key={i} className={line.toLowerCase().includes(previewHighlight.toLowerCase()) ? 'bg-yellow-200 px-1 rounded' : ''}>
                      {line}
                    </p>
                  ))
                ) : (
                  previewContent
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <p className="text-3xl mb-2">👁️</p>
                <p className="text-sm">Click a page or source to preview</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal&&deleteTarget&&<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={()=>setShowDeleteModal(false)}><div className="bg-white rounded-2xl p-6 w-96 shadow-2xl" onClick={e=>e.stopPropagation()}><h3 className="text-lg font-bold text-gray-900 mb-2">Delete Document</h3><p className="text-sm text-gray-600 mb-6">Are you sure you want to delete <strong>{deleteTarget.filename}</strong>? This cannot be undone.</p><div className="flex gap-3 justify-end"><button onClick={()=>setShowDeleteModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Cancel</button><button onClick={handleDelete} disabled={deleting} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium">{deleting?'Deleting...':'Delete'}</button></div></div></div>}
    </div>
  );
}
