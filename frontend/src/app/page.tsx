import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white flex flex-col">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-8 py-5 w-full max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold tracking-tight">
          <span className="text-blue-400">Pilot</span>ron
        </h1>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-gray-300 hover:text-white transition-colors font-medium">
            Login
          </Link>
          <Link href="/register" className="bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded-lg font-medium transition-colors">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero Body - Centered */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 w-full max-w-5xl mx-auto">
        {/* Badge */}
        <div className="inline-block bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold px-4 py-1.5 rounded-full mb-6 tracking-wide">
          AI-Powered Automation
        </div>

        {/* Heading */}
        <h2 className="text-4xl md:text-6xl font-extrabold leading-tight mb-6 tracking-tight">
          Your Intelligent<br />
          <span className="text-blue-400">Assistant Portal</span>
        </h2>

        {/* Subheading */}
        <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Chat with AI, manage tasks, analyze documents, automate workflows — all from one place.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-4 mb-16">
          <Link href="/register" className="bg-blue-600 hover:bg-blue-700 px-8 py-3.5 rounded-lg font-semibold text-lg transition-colors shadow-lg shadow-blue-600/30 w-full sm:w-auto">
            Start Free
          </Link>
          <Link href="/login" className="border border-gray-600 hover:border-gray-400 hover:bg-white/5 px-8 py-3.5 rounded-lg font-semibold text-lg transition-colors w-full sm:w-auto">
            Sign In
          </Link>
        </div>

        {/* Features Grid - Full Width */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 w-full">
          {[
            { icon: '💬', title: 'AI Chat', desc: 'Natural conversations with AI that understands context.' },
            { icon: '📄', title: 'Document Q&A', desc: 'Upload files and ask questions — get instant answers.' },
            { icon: '✅', title: 'Task Tracking', desc: 'Organize, prioritize, and track your work effortlessly.' },
            { icon: '⚙️', title: 'Workflows', desc: 'Automate repetitive tasks with custom rules.' },
            { icon: '🔔', title: 'Notifications', desc: 'Stay informed with real-time alerts and updates.' },
            { icon: '💡', title: 'AI Suggestions', desc: 'Get smart recommendations based on your activity.' },
          ].map((f) => (
            <div key={f.title} className="bg-white/5 border border-white/10 rounded-xl p-6 text-left hover:bg-white/10 transition-all backdrop-blur-sm">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="text-lg font-bold mb-2">{f.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer Spacer */}
      <footer className="py-8"></footer>
    </div>
  );
}
