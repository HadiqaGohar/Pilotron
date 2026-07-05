'use client';
import { useEffect, useState, useCallback } from 'react';
import { DndContext, closestCenter, DragOverlay, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import api from '@/lib/api';

interface Task { id: number; title: string; description?: string; status: string; priority: string; due_date?: string; subtasks?: Subtask[]; created_at: string; }
interface Subtask { id: number; title: string; is_done: boolean; }

const columns = [
  { id: 'todo', title: 'To Do', color: 'bg-gray-500' },
  { id: 'in_progress', title: 'In Progress', color: 'bg-blue-500' },
  { id: 'done', title: 'Done', color: 'bg-green-500' },
];

const priorityConfig: Record<string, { color: string; bg: string; border: string; label: string }> = {
  high: { color: 'text-red-600', bg: 'bg-red-50', border: 'border-l-red-500', label: 'High' },
  normal: { color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-l-yellow-500', label: 'Medium' },
  low: { color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-l-gray-400', label: 'Low' },
};

// ========== TASK CARD ==========
function TaskCard({ task, onClick, onDelete }: { task: Task; onClick: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, data: { status: task.status } });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const config = priorityConfig[task.priority] || priorityConfig.normal;
  const subtasksDone = task.subtasks?.filter(s => s.is_done).length || 0;
  const subtasksTotal = task.subtasks?.length || 0;
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className={`bg-white rounded-lg border border-gray-200 border-l-4 ${config.border} p-3 cursor-pointer hover:shadow-md transition-shadow group`}>
      <div className="flex items-start justify-between">
        <h4 className="text-sm font-medium text-gray-900 flex-1" onClick={onClick}>{task.title}</h4>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs">×</button>
      </div>
      {task.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{task.description}</p>}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className={`text-xs px-1.5 py-0.5 rounded ${config.bg} ${config.color}`}>{config.label}</span>
        {task.due_date && (
          <span className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
            📅 {new Date(task.due_date).toLocaleDateString()}
            {isOverdue && ' (overdue)'}
          </span>
        )}
        {subtasksTotal > 0 && (
          <span className="text-xs text-gray-500">☑ {subtasksDone}/{subtasksTotal}</span>
        )}
      </div>
    </div>
  );
}

// ========== TASK DETAIL MODAL ==========
function TaskDetailModal({ task, onClose, onUpdate }: { task: Task; onClose: () => void; onUpdate: () => void }) {
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDesc, setEditDesc] = useState(task.description || '');
  const [editPriority, setEditPriority] = useState(task.priority);
  const [editStatus, setEditStatus] = useState(task.status);
  const [editDue, setEditDue] = useState(task.due_date ? new Date(task.due_date).toISOString().split('T')[0] : '');
  const [subtasks, setSubtasks] = useState<Subtask[]>(task.subtasks || []);
  const [newSub, setNewSub] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await api.patch(`/tasks/${task.id}`, {
      title: editTitle, description: editDesc, priority: editPriority,
      status: editStatus, due_date: editDue || null
    });
    setSaving(false);
    onUpdate();
    onClose();
  };

  const addSubtask = async () => {
    if (!newSub.trim()) return;
    const r = await api.post(`/tasks/${task.id}/subtasks`, { title: newSub });
    setSubtasks([...subtasks, r.data]);
    setNewSub('');
  };

  const toggleSubtask = async (sub: Subtask) => {
    await api.patch(`/tasks/subtasks/${sub.id}`, { is_done: !sub.is_done });
    setSubtasks(subtasks.map(s => s.id === sub.id ? { ...s, is_done: !s.is_done } : s));
  };

  const deleteSubtask = async (subId: number) => {
    await api.delete(`/tasks/subtasks/${subId}`);
    setSubtasks(subtasks.filter(s => s.id !== subId));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[520px] max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Edit Task</h3>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">×</button>
          </div>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Title</label>
            <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Description</label>
            <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Status</label>
              <select value={editStatus} onChange={e => setEditStatus(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none">
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Priority</label>
              <select value={editPriority} onChange={e => setEditPriority(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none">
                <option value="high">🔴 High</option>
                <option value="normal">🟡 Medium</option>
                <option value="low">🟢 Low</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Due Date</label>
              <input type="date" value={editDue} onChange={e => setEditDue(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" />
            </div>
          </div>
          
          {/* Subtasks */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Subtasks ({subtasks.filter(s => s.is_done).length}/{subtasks.length})</label>
            {subtasks.length > 0 && (
              <div className="mb-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 transition-all" style={{ width: `${subtasks.length > 0 ? (subtasks.filter(s => s.is_done).length / subtasks.length * 100) : 0}%` }} />
              </div>
            )}
            <div className="space-y-1">
              {subtasks.map(sub => (
                <div key={sub.id} className="flex items-center gap-2 group">
                  <button onClick={() => toggleSubtask(sub)} className={`w-4 h-4 rounded border ${sub.is_done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'} flex items-center justify-center text-xs`}>
                    {sub.is_done && '✓'}
                  </button>
                  <span className={`flex-1 text-sm ${sub.is_done ? 'line-through text-gray-400' : 'text-gray-700'}`}>{sub.title}</span>
                  <button onClick={() => deleteSubtask(sub.id)} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 text-xs">×</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <input value={newSub} onChange={e => setNewSub(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSubtask()} placeholder="Add subtask..." className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={addSubtask} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">+</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ========== MAIN PAGE ==========
export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<'board' | 'list'>('board');
  const [search, setSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState('normal');
  const [newDue, setNewDue] = useState('');
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const fetchTasks = () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (filterPriority) params.set('priority', filterPriority);
    api.get(`/tasks?${params}`).then(r => setTasks(r.data)).catch(() => {});
  };

  const fetchAnalytics = () => {
    api.get('/tasks/analytics').then(r => setAnalytics(r.data)).catch(() => {});
  };

  useEffect(() => { fetchTasks(); fetchAnalytics(); }, [search, filterPriority]);

  const createTask = async () => {
    if (!newTitle.trim()) return;
    await api.post('/tasks', {
      title: newTitle, description: newDesc || null,
      priority: newPriority, due_date: newDue || null
    });
    setShowNew(false); setNewTitle(''); setNewDesc(''); setNewPriority('normal'); setNewDue('');
    fetchTasks(); fetchAnalytics();
  };

  const deleteTask = async (id: number) => {
    if (!confirm('Delete this task?')) return;
    await api.delete(`/tasks/${id}`);
    fetchTasks(); fetchAnalytics();
  };

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    
    const taskId = active.id;
    const newStatus = over.id;
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.status === newStatus) return;
    
    await api.patch(`/tasks/${taskId}`, { status: newStatus });
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    fetchAnalytics();
  };

  const tasksByStatus = (status: string) => tasks.filter(t => t.status === status);

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-50">
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-gray-900">Tasks</h2>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button onClick={() => setView('board')} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${view === 'board' ? 'bg-white text-blue-600 shadow' : 'text-gray-600'}`}>Board</button>
              <button onClick={() => setView('list')} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${view === 'list' ? 'bg-white text-blue-600 shadow' : 'text-gray-600'}`}>List</button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 w-40" />
            <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none bg-white">
              <option value="">All Priority</option>
              <option value="high">🔴 High</option>
              <option value="normal">🟡 Medium</option>
              <option value="low">🟢 Low</option>
            </select>
            <button onClick={() => setShowAnalytics(!showAnalytics)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" title="Analytics">📊</button>
            <button onClick={() => setShowNew(true)} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 font-medium">+ New Task</button>
          </div>
        </div>

        {/* Board View */}
        {view === 'board' ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={({ active }) => setActiveId(active.id as number)} onDragEnd={handleDragEnd}>
            <div className="flex-1 flex gap-4 p-4 overflow-x-auto">
              {columns.map(col => (
                <div key={col.id} className="flex-1 min-w-[280px]">
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${col.color}`}></div>
                    <h3 className="text-sm font-semibold text-gray-700">{col.title}</h3>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{tasksByStatus(col.id).length}</span>
                  </div>
                  <SortableContext items={tasksByStatus(col.id).map(t => t.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2 min-h-[200px] bg-gray-100/50 rounded-xl p-2" id={col.id}>
                      {tasksByStatus(col.id).map(task => (
                        <TaskCard key={task.id} task={task} onClick={() => setEditTask(task)} onDelete={() => deleteTask(task.id)} />
                      ))}
                    </div>
                  </SortableContext>
                </div>
              ))}
            </div>
            <DragOverlay>
              {activeId ? <TaskCard task={tasks.find(t => t.id === activeId)!} onClick={() => {}} onDelete={() => {}} /> : null}
            </DragOverlay>
          </DndContext>
        ) : (
          /* List View */
          <div className="flex-1 overflow-auto p-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Task</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Priority</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Due</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Subtasks</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tasks.map(task => {
                    const pc = priorityConfig[task.priority] || priorityConfig.normal;
                    const subDone = task.subtasks?.filter(s => s.is_done).length || 0;
                    const subTotal = task.subtasks?.length || 0;
                    const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';
                    return (
                      <tr key={task.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setEditTask(task)}>
                        <td className="px-4 py-3">
                          <span className="text-sm font-medium text-gray-900">{task.title}</span>
                          {task.description && <p className="text-xs text-gray-500 truncate max-w-xs">{task.description}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            task.status === 'done' ? 'bg-green-100 text-green-700' :
                            task.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>{task.status.replace('_', ' ')}</span>
                        </td>
                        <td className="px-4 py-3"><span className={`text-xs ${pc.color}`}>{pc.label}</span></td>
                        <td className="px-4 py-3">
                          {task.due_date ? (
                            <span className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                              {new Date(task.due_date).toLocaleDateString()}
                            </span>
                          ) : <span className="text-xs text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {subTotal > 0 ? <span className="text-xs text-gray-600">{subDone}/{subTotal}</span> : <span className="text-xs text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }} className="text-gray-400 hover:text-red-500 text-sm">×</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {tasks.length === 0 && <div className="p-8 text-center text-gray-400">No tasks yet</div>}
            </div>
          </div>
        )}
      </div>

      {/* Analytics Sidebar */}
      {showAnalytics && analytics && (
        <div className="w-72 bg-white border-l border-gray-200 p-4 overflow-y-auto">
          <h3 className="font-bold text-gray-900 mb-4">📊 Analytics</h3>
          <div className="space-y-3">
            <div className="p-3 bg-gray-50 rounded-lg"><p className="text-xs text-gray-500">Total</p><p className="text-2xl font-bold text-gray-900">{analytics.total}</p></div>
            <div className="p-3 bg-blue-50 rounded-lg"><p className="text-xs text-blue-600">In Progress</p><p className="text-2xl font-bold text-blue-700">{analytics.in_progress}</p></div>
            <div className="p-3 bg-green-50 rounded-lg"><p className="text-xs text-green-600">Completed</p><p className="text-2xl font-bold text-green-700">{analytics.done}</p></div>
            <div className="p-3 bg-red-50 rounded-lg"><p className="text-xs text-red-600">Overdue</p><p className="text-2xl font-bold text-red-700">{analytics.overdue}</p></div>
            <div className="p-3 bg-purple-50 rounded-lg">
              <p className="text-xs text-purple-600">Completion Rate</p>
              <p className="text-2xl font-bold text-purple-700">{analytics.completion_rate}%</p>
              <div className="mt-2 h-2 bg-purple-200 rounded-full overflow-hidden">
                <div className="h-full bg-purple-600 rounded-full" style={{ width: `${analytics.completion_rate}%` }} />
              </div>
            </div>
          </div>
          {analytics.weekly_trend && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Weekly Trend</h4>
              <div className="space-y-1">
                {analytics.weekly_trend.map((w: any, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-12">{w.week}</span>
                    <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(w.completed * 12.5, 100)}%` }} />
                    </div>
                    <span className="text-xs text-gray-600 w-6 text-right">{w.completed}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* New Task Modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowNew(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[420px]" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">New Task</h3>
              <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-gray-600">×</button>
            </div>
            <div className="p-4 space-y-3">
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Task title" autoFocus className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)" rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              <div className="grid grid-cols-2 gap-3">
                <select value={newPriority} onChange={e => setNewPriority(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none">
                  <option value="high">🔴 High</option>
                  <option value="normal">🟡 Medium</option>
                  <option value="low">🟢 Low</option>
                </select>
                <input type="date" value={newDue} onChange={e => setNewDue(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" />
              </div>
              <button onClick={createTask} className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">Create Task</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Task Modal */}
      {editTask && <TaskDetailModal task={editTask} onClose={() => setEditTask(null)} onUpdate={() => { fetchTasks(); fetchAnalytics(); }} />}
    </div>
  );
}
