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
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-[0.015]"
             style={{ background: 'radial-gradient(circle, #60A5FA, transparent)' }} />
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
            TalentScope
          </span>
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
              AI-POWERED TALENT SCOUTING
            </span>
          </div>

          {/* Heading */}
          <h1 className="text-5xl md:text-6xl font-extrabold leading-[1.1] tracking-tight mb-6">
            <span className="text-text-primary">Talent Scouting</span>
            <br />
            <span className="bg-gradient-to-r from-accent-emerald to-emerald-300 bg-clip-text text-transparent">
              & Engagement Agent
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg text-text-secondary max-w-xl mx-auto mb-10 leading-relaxed">
            AI-powered candidate discovery, conversational interest screening,
            and intelligent ranked shortlists — all in real time.
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
            <button onClick={() => router.push('/candidate')}
                    className="btn-ghost flex items-center gap-2 border border-white/[0.08]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Candidate Portal
            </button>
          </div>

          {/* ── Feature Grid ─────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-20">
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
                title: 'AI Interest Screening',
                desc: 'Conversational recruiter outreach that measures genuine candidate interest',
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="1.8"
                       strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                  </svg>
                ),
                title: 'Explainable AI',
                desc: 'Transparent reasoning traces so recruiters understand every AI decision',
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

          {/* ── How It Works ────────────────────────── */}
          <div className="mt-20 mb-8">
            <h2 className="text-xl font-bold text-text-primary mb-8">How It Works</h2>
            <div className="flex flex-col md:flex-row items-start justify-center gap-2">
              {[
                { step: '1', title: 'Upload JD', desc: 'Recruiter uploads job description' },
                { step: '2', title: 'Candidate Applies', desc: 'Candidate uploads CV via portal' },
                { step: '3', title: 'AI Screening', desc: 'Conversational interest assessment' },
                { step: '4', title: 'Ranked Shortlist', desc: 'Recruiter sees ranked candidates' },
              ].map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex flex-col items-center text-center min-w-[140px]">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mb-2"
                         style={{ background: 'rgba(52,211,153,0.12)', color: '#34D399' }}>
                      {s.step}
                    </div>
                    <h4 className="text-xs font-semibold text-text-primary">{s.title}</h4>
                    <p className="text-[10px] text-text-muted mt-1">{s.desc}</p>
                  </div>
                  {i < 3 && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)"
                         strokeWidth="2" strokeLinecap="round" className="hidden md:block flex-shrink-0 mt-[-20px]">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────── */}
      <footer className="relative z-10 text-center py-6 border-t border-white/[0.04]">
        <p className="text-xs text-text-disabled">
          TalentScope — AI-Powered Talent Scouting &amp; Engagement Agent · Built with FastAPI, Next.js, Groq &amp; Qdrant
        </p>
      </footer>
    </div>
  );
}
