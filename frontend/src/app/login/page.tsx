'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => { setMounted(true); }, []);

  const extractError = (err: any): string => {
    const detail = err?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map((d: any) => d.msg || d).join(', ');
    if (typeof detail === 'object' && detail !== null) return detail.msg || detail.message || JSON.stringify(detail);
    return 'Login failed. Please try again.';
  };

  const handleLogin = async () => {
    setError('');
    if (!email || !password) { setError('Please fill in all fields'); return; }
    setLoading(true);
    try {
      const loginRes = await api.post('/auth/login', { email, password });
      localStorage.setItem('token', loginRes.data.access_token);
      localStorage.setItem('user_email', email);
      router.push('/dashboard');
    } catch (err: any) {
      setError(extractError(err));
    } finally { setLoading(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && mounted && !loading) handleLogin();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-blue-600/20 blur-3xl"></div>
        <div className="absolute -bottom-[20%] -right-[10%] w-[50%] h-[50%] rounded-full bg-purple-600/20 blur-3xl"></div>
      </div>
      <div className="w-full max-w-sm relative z-10 p-4">
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Pilot<span className="text-blue-500">ron</span></h1>
            <p className="text-slate-300 mt-2 text-sm">Welcome back to your workspace</p>
          </div>
          <div className="space-y-5">
            {error && <div className="bg-red-500/10 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg text-sm text-center">{error}</div>}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-300 ml-1">Email Address</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={handleKeyDown} className="w-full px-4 py-3 rounded-lg bg-slate-900 border border-slate-700 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="name@company.com" />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-300 ml-1">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={handleKeyDown} className="w-full px-4 py-3 rounded-lg bg-slate-900 border border-slate-700 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="••••••••" />
            </div>
            <button type="button" disabled={loading} onClick={handleLogin} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-3 rounded-lg transition-all duration-200 shadow-lg shadow-blue-600/20">
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </div>
          <div className="mt-8 text-center text-xs text-slate-400">
            Don't have an account?{' '}
            <Link href="/register" className="text-blue-400 hover:text-blue-300 font-semibold underline underline-offset-4">Register here</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
