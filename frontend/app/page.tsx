'use client';

import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* ── Ambient Background ─────────────────── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full opacity-[0.03]"
             style={{ background: 'radial-gradient(circle, #34D399, transparent)' }} />
        <div className="absolute -bottom-60 -left-40 w-[500px] h-[500px] rounded-full opacity-[0.02]"
             style={{ background: 'radial-gradient(circle, #A78BFA, transparent)' }} />
      </div>

      {/* ── Navigation ─────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-white/[0.04]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, #34D399, #2BC48E)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0B0B0F" strokeWidth="2.5"
                 strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="text-lg font-bold tracking-tight text-text-primary">
            Project Catalyst
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/recruiter')}
                  className="btn-ghost text-xs">
            Recruiter Portal
          </button>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────── */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-6">
        <div className="max-w-3xl text-center animate-fade-in">
          {/* Chip */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8"
               style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.15)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse" />
            <span className="text-xs font-medium text-accent-emerald tracking-wide">
              AI-POWERED RECRUITMENT
            </span>
          </div>

          {/* Heading */}
          <h1 className="text-5xl md:text-6xl font-extrabold leading-[1.1] tracking-tight mb-6">
            <span className="text-text-primary">Talent Scouting</span>
            <br />
            <span className="bg-gradient-to-r from-accent-emerald to-emerald-300 bg-clip-text text-transparent">
              Reimagined with AI
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg text-text-secondary max-w-xl mx-auto mb-10 leading-relaxed">
            Automate top-of-funnel recruitment with AI-parsed job descriptions,
            semantic CV matching, and voice-based behavioral interviews — all in real time.
          </p>

          {/* CTAs */}
          <div className="flex items-center justify-center gap-4">
            <button onClick={() => router.push('/recruiter')}
                    className="btn-primary flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4-4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 00-3-3.87" />
                <path d="M16 3.13a4 4 0 010 7.75" />
              </svg>
              Recruiter Dashboard
            </button>
          </div>

          {/* ── Feature Grid ─────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-20">
            {[
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="1.8"
                       strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                ),
                title: 'Smart JD Parsing',
                desc: 'AI extracts skills, salary, and requirements with quality guardrails',
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="1.8"
                       strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                ),
                title: 'Semantic Matching',
                desc: 'Vector embeddings calculate precise CV-to-JD match scores',
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="1.8"
                       strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                    <path d="M19 10v2a7 7 0 01-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                ),
                title: 'Voice Interviews',
                desc: '30-second STAR behavioral assessments with live AI scoring',
              },
            ].map((f, i) => (
              <div key={i} className="card-surface p-6 text-left animate-slide-up"
                   style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                     style={{ background: 'rgba(255,255,255,0.04)' }}>
                  {f.icon}
                </div>
                <h3 className="text-sm font-semibold text-text-primary mb-2">{f.title}</h3>
                <p className="text-xs text-text-muted leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────── */}
      <footer className="relative z-10 text-center py-6 border-t border-white/[0.04]">
        <p className="text-xs text-text-disabled">
          Project Catalyst © 2024 — Built with FastAPI, Next.js, Groq &amp; Qdrant
        </p>
      </footer>
    </div>
  );
}
