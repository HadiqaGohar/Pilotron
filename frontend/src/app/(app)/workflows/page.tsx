'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { ReactFlow, Controls, Background, useNodesState, useEdgesState, addEdge, Handle, Position, Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import api from '@/lib/api';

interface Workflow { id: number; name: string; description: string; trigger_type: string; actions: any[]; flow_config: any; is_active: boolean; last_run_at: string; run_count: number; created_at: string; }
interface Template { id: string; name: string; description: string; category: string; trigger_type: string; flow_config: any; actions: any[]; }

// Custom node data types
interface TriggerNodeData { label: string; triggerType: string; [key: string]: any; }
interface ActionNodeData { label: string; actionType: string; config: Record<string, any>; [key: string]: any; }

type AppNode = Node<TriggerNodeData | ActionNodeData>;
type AppEdge = Edge;

// ========== CUSTOM NODES ==========
function TriggerNode({ data }: { data: TriggerNodeData }) {
  return (
    <div className="bg-green-50 border-2 border-green-500 rounded-xl px-4 py-3 shadow-md min-w-[160px]">
      <div className="text-xs font-medium text-green-700 mb-1">⚡ TRIGGER</div>
      <div className="text-sm font-semibold text-green-900">{data.label}</div>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-green-500" />
    </div>
  );
}

function ActionNode({ data, onDelete }: { data: ActionNodeData; onDelete?: () => void }) {
  const colors: Record<string, string> = {
    notify: 'blue', create_task: 'purple', webhook: 'orange', email: 'red'
  };
  const color = colors[data.actionType] || 'gray';
  return (
    <div className={`bg-${color}-50 border-2 border-${color}-500 rounded-xl px-4 py-3 shadow-md min-w-[160px] relative group`}>
      <Handle type="target" position={Position.Top} className={`w-3 h-3 bg-${color}-500`} />
      <div className={`text-xs font-medium text-${color}-700 mb-1`}>🔧 ACTION</div>
      <div className="text-sm font-semibold text-gray-900">{data.label}</div>
      {data.config?.message && <div className="text-xs text-gray-500 mt-1 truncate max-w-[150px]">{data.config.message}</div>}
      <Handle type="source" position={Position.Bottom} className={`w-3 h-3 bg-${color}-500`} />
      {onDelete && (
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">×</button>
      )}
    </div>
  );
}

const nodeTypes = { trigger: TriggerNode, action: ActionNode };

// ========== MAIN PAGE ==========
export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<AppEdge>([]);
  const [selectedAction, setSelectedAction] = useState<string|null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testRunning, setTestRunning] = useState(false);
  const [executions, setExecutions] = useState<any[]>([]);
  const [showExecutions, setShowExecutions] = useState(false);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDesc, setWorkflowDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'nodes'|'templates'>('nodes');
  const [actionConfig, setActionConfig] = useState<any>({});
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configNodeId, setConfigNodeId] = useState<string|null>(null);

  useEffect(() => {
    api.get('/workflows').then(r => setWorkflows(r.data)).catch(() => {});
    api.get('/workflows/templates').then(r => setTemplates(r.data)).catch(() => {});
  }, []);

  const loadWorkflow = async (wf: Workflow) => {
    setActiveWorkflow(wf);
    setWorkflowName(wf.name);
    setWorkflowDesc(wf.description || '');
    if (wf.flow_config?.nodes) {
      setNodes(wf.flow_config.nodes);
      setEdges(wf.flow_config.edges || []);
    } else {
      setNodes([]);
      setEdges([]);
    }
    setShowExecutions(false);
    setExecutions([]);
  };

  const onConnect = useCallback((params: any) => {
    setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } }, eds));
  }, [setEdges]);

  const addNode = (type: 'trigger' | 'action', actionType?: string) => {
    const id = `${type}-${Date.now()}`;
    const labels: Record<string, string> = {
      document_uploaded: 'Document Uploaded',
      task_overdue: 'Task Overdue',
      chat_message: 'Chat Message',
      manual: 'Manual Trigger',
      notify: 'Send Notification',
      create_task: 'Create Task',
      webhook: 'Call Webhook',
    };
    const x = 250 + Math.random() * 100 - 50;
    const y = (nodes.length * 150) + 50;
    
    let newNode: AppNode;
    if (type === 'trigger') {
      newNode = {
        id,
        type,
        position: { x, y },
        data: { label: labels[actionType || type] || type, triggerType: actionType || type }
      };
    } else {
      newNode = {
        id,
        type,
        position: { x, y },
        data: { label: labels[actionType || ''] || actionType || type, actionType: actionType || type, config: {} }
      };
    }
    setNodes((nds) => [...nds, newNode]);
  };

  const deleteNode = (nodeId: string) => {
    setNodes((nds) => nds.filter(n => n.id !== nodeId));
    setEdges((eds) => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
  };

  const openNodeConfig = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (node && node.type === 'action') {
      setConfigNodeId(nodeId);
      setActionConfig(node.data.config || {});
      setShowConfigModal(true);
    }
  };

  const saveNodeConfig = () => {
    if (!configNodeId) return;
    setNodes((nds) => nds.map(n => 
      n.id === configNodeId ? { ...n, data: { ...n.data, config: actionConfig } } : n
    ));
    setShowConfigModal(false);
  };

  const saveWorkflow = async () => {
    if (!workflowName.trim()) { alert('Enter workflow name'); return; }
    setSaving(true);
    const payload = {
      name: workflowName,
      description: workflowDesc,
      trigger_type: nodes.find(n => n.type === 'trigger')?.data.triggerType || 'manual',
      flow_config: { nodes, edges },
      actions: nodes.filter(n => n.type === 'action').map(n => ({ type: n.data.actionType, config: n.data.config || {} }))
    };
    try {
      if (activeWorkflow) {
        const r = await api.patch(`/workflows/${activeWorkflow.id}`, payload);
        setWorkflows(prev => prev.map(w => w.id === r.data.id ? r.data : w));
        setActiveWorkflow(r.data);
      } else {
        const r = await api.post('/workflows', payload);
        setWorkflows(prev => [r.data, ...prev]);
        setActiveWorkflow(r.data);
      }
    } catch (e) { alert('Save failed'); }
    setSaving(false);
  };

  const toggleWorkflow = async (wf: Workflow) => {
    try {
      const r = await api.post(`/workflows/${wf.id}/toggle`);
      setWorkflows(prev => prev.map(w => w.id === r.data.id ? r.data : w));
      if (activeWorkflow?.id === r.data.id) setActiveWorkflow(r.data);
    } catch {}
  };

  const deleteWorkflow = async (wf: Workflow) => {
    if (!confirm(`Delete "${wf.name}"?`)) return;
    try {
      await api.delete(`/workflows/${wf.id}`);
      setWorkflows(prev => prev.filter(w => w.id !== wf.id));
      if (activeWorkflow?.id === wf.id) { setActiveWorkflow(null); setNodes([]); setEdges([]); }
    } catch {}
  };

  const testWorkflow = async (dryRun: boolean) => {
    if (!activeWorkflow) return;
    setTestRunning(true);
    setTestResult(null);
    try {
      const r = await api.post(`/workflows/${activeWorkflow.id}/test`, { dry_run: dryRun });
      setTestResult(r.data);
    } catch (e) { setTestResult({ status: 'error', steps: [{ status: 'failed', message: 'Test failed' }] }); }
    setTestRunning(false);
  };

  const loadExecutions = async (wf: Workflow) => {
    setShowExecutions(true);
    try {
      const r = await api.get(`/workflows/${wf.id}/executions`);
      setExecutions(r.data);
    } catch { setExecutions([]); }
  };

  const loadTemplate = (template: Template) => {
    setWorkflowName(template.name);
    setWorkflowDesc(template.description);
    setNodes(template.flow_config.nodes);
    setEdges(template.flow_config.edges || []);
    setActiveWorkflow(null);
    setShowTemplates(false);
  };

  const nodeColor = (node: any) => {
    if (node.type === 'trigger') return '#22c55e';
    return '#6366f1';
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-50">
      {/* Left Sidebar */}
      <div className="w-72 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900">Workflows</h2>
            <div className="flex gap-1">
              <button onClick={() => setShowTemplates(!showTemplates)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg text-sm" title="Templates">📋</button>
              <button onClick={() => { setActiveWorkflow(null); setNodes([]); setEdges([]); setWorkflowName(''); setWorkflowDesc(''); }} className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm" title="New">+</button>
            </div>
          </div>
          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button onClick={() => setSidebarTab('nodes')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${sidebarTab === 'nodes' ? 'bg-white text-blue-600 shadow' : 'text-gray-600'}`}>Nodes</button>
            <button onClick={() => setSidebarTab('templates')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${sidebarTab === 'templates' ? 'bg-white text-blue-600 shadow' : 'text-gray-600'}`}>Templates</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {sidebarTab === 'nodes' ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase mb-2">⚡ Triggers</p>
                {['document_uploaded', 'task_overdue', 'chat_message', 'manual'].map(t => (
                  <button key={t} onClick={() => addNode('trigger', t)} className="w-full text-left px-3 py-2 mb-1 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 hover:bg-green-100 transition-colors">
                    {t.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </button>
                ))}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase mb-2">🔧 Actions</p>
                {['notify', 'create_task', 'webhook'].map(a => (
                  <button key={a} onClick={() => addNode('action', a)} className="w-full text-left px-3 py-2 mb-1 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 hover:bg-blue-100 transition-colors">
                    {a === 'notify' ? 'Send Notification' : a === 'create_task' ? 'Create Task' : 'Call Webhook'}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map(t => (
                <button key={t.id} onClick={() => loadTemplate(t)} className="w-full text-left p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors">
                  <div className="text-sm font-medium text-gray-900">{t.name}</div>
                  <div className="text-xs text-gray-500 mt-1">{t.description}</div>
                  <div className="text-xs text-blue-600 mt-1">{t.category}</div>
                </button>
              ))}
            </div>
          )}

          {sidebarTab === 'nodes' && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-xs font-medium text-gray-500 uppercase mb-2">Workflows ({workflows.length})</p>
              {workflows.map(wf => (
                <div key={wf.id} className={`p-2 mb-1 rounded-lg cursor-pointer transition-colors ${activeWorkflow?.id === wf.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'}`} onClick={() => loadWorkflow(wf)}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 truncate">{wf.name}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); toggleWorkflow(wf); }} className={`w-8 h-4 rounded-full transition-colors ${wf.is_active ? 'bg-green-500' : 'bg-gray-300'}`}>
                        <div className={`w-3 h-3 bg-white rounded-full transition-transform ${wf.is_active ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); loadExecutions(wf); }} className="text-xs text-gray-400 hover:text-gray-600" title="History">📊</button>
                      <button onClick={(e) => { e.stopPropagation(); deleteWorkflow(wf); }} className="text-xs text-red-400 hover:text-red-600" title="Delete">×</button>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {wf.is_active ? '● Active' : '○ Paused'} • {wf.run_count} runs
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <input
              value={workflowName}
              onChange={e => setWorkflowName(e.target.value)}
              placeholder="Workflow name..."
              className="text-lg font-semibold text-gray-900 outline-none border-b border-transparent focus:border-blue-300 bg-transparent"
            />
            <input
              value={workflowDesc}
              onChange={e => setWorkflowDesc(e.target.value)}
              placeholder="Description (optional)..."
              className="text-sm text-gray-500 outline-none border-b border-transparent focus:border-blue-300 bg-transparent w-64"
            />
          </div>
          <div className="flex items-center gap-2">
            {activeWorkflow && (
              <button onClick={() => loadExecutions(activeWorkflow)} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">📊 History</button>
            )}
            <button onClick={() => setShowTestModal(true)} disabled={!activeWorkflow} className="px-3 py-1.5 text-sm bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed">🧪 Test Run</button>
            <button onClick={saveWorkflow} disabled={saving || nodes.length === 0} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : '💾 Save'}
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative">
          {nodes.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-5xl mb-4">⚡</p>
                <p className="text-gray-500 font-medium">Drag nodes from the sidebar to build your workflow</p>
                <p className="text-gray-400 text-sm mt-1">Connect them by dragging from one handle to another</p>
                <button onClick={() => setShowTemplates(true)} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Browse Templates</button>
              </div>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeDoubleClick={(_, node) => openNodeConfig(node.id)}
              nodeTypes={nodeTypes}
              fitView
              deleteKeyCode="Delete"
            >
              <Controls />
              <Background color="#e5e7eb" gap={20} />
            </ReactFlow>
          )}
        </div>
      </div>

      {/* Test Modal */}
      {showTestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowTestModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[500px] max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">🧪 Test Workflow</h3>
              <button onClick={() => setShowTestModal(false)} className="text-gray-400 hover:text-gray-600">×</button>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-600 mb-4">Run "{workflowName}" to verify it works correctly.</p>
              <div className="flex gap-2">
                <button onClick={() => testWorkflow(true)} disabled={testRunning} className="flex-1 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50">
                  {testRunning ? 'Running...' : '🔍 Dry Run (Simulate)'}
                </button>
                <button onClick={() => testWorkflow(false)} disabled={testRunning} className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50">
                  {testRunning ? 'Running...' : '▶️ Execute (Real)'}
                </button>
              </div>
              {testResult && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <div className={`text-sm font-medium mb-2 ${testResult.status === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                    {testResult.status === 'success' ? '✅ Success' : '❌ Failed'}
                    {testResult.dry_run && <span className="ml-2 text-yellow-600">(Dry Run)</span>}
                  </div>
                  {testResult.steps?.map((step: any, i: number) => (
                    <div key={i} className="text-xs text-gray-600 py-1 border-b border-gray-200 last:border-0">
                      <span className="font-medium">Step {i + 1}:</span> {step.action} — {step.status}
                      {step.message && <span className="text-gray-500 ml-1">({step.message})</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Node Config Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowConfigModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[420px]" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Configure Action</h3>
              <button onClick={() => setShowConfigModal(false)} className="text-gray-400 hover:text-gray-600">×</button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Message / Title</label>
                <input
                  value={actionConfig.message || actionConfig.title || ''}
                  onChange={e => setActionConfig({ ...actionConfig, message: e.target.value, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. New document uploaded: {{doc_name}}"
                />
                <p className="text-xs text-gray-400 mt-1">Variables: {'{{doc_name}}'}, {'{{task_title}}'}, {'{{chat_content}}'}</p>
              </div>
              <button onClick={saveNodeConfig} className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">Save Config</button>
            </div>
          </div>
        </div>
      )}

      {/* Executions Panel */}
      {showExecutions && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowExecutions(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[500px] max-h-[70vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">📊 Execution History</h3>
              <button onClick={() => setShowExecutions(false)} className="text-gray-400 hover:text-gray-600">×</button>
            </div>
            <div className="overflow-y-auto max-h-[55vh]">
              {executions.length === 0 ? (
                <div className="p-8 text-center text-gray-400">No executions yet</div>
              ) : (
                executions.map((exec: any) => (
                  <div key={exec.id} className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={exec.status === 'success' ? 'text-green-500' : 'text-red-500'}>
                          {exec.status === 'success' ? '✅' : '❌'}
                        </span>
                        <span className="text-sm text-gray-900">{new Date(exec.started_at).toLocaleString()}</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${exec.dry_run ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                        {exec.dry_run ? 'Dry Run' : exec.triggered_by}
                      </span>
                    </div>
                    {exec.execution_details?.steps && (
                      <div className="mt-2 ml-6">
                        {exec.execution_details.steps.map((step: any, i: number) => (
                          <div key={i} className="text-xs text-gray-500">
                            {i + 1}. {step.action}: {step.status} {step.message ? `— ${step.message}` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Template Modal */}
      {showTemplates && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowTemplates(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[600px] max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">📋 Workflow Templates</h3>
              <button onClick={() => setShowTemplates(false)} className="text-gray-400 hover:text-gray-600">×</button>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3 overflow-y-auto max-h-[65vh]">
              {templates.map(t => (
                <button key={t.id} onClick={() => loadTemplate(t)} className="text-left p-4 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors">
                  <div className="text-sm font-semibold text-gray-900">{t.name}</div>
                  <div className="text-xs text-gray-500 mt-1">{t.description}</div>
                  <div className="text-xs text-blue-600 mt-2">{t.category}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
