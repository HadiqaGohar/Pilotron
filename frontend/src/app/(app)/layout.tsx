'use client';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<string>('');
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    console.log('AppLayout check token:', !!token);
    if (!token) {
      router.push('/login');
      return;
    }
    const email = localStorage.getItem('user_email') || 'user@pilotron.ai';
    setUser(email);
  }, [router]);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar user={user} />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
