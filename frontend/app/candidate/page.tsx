'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/* ═══════════════════════════════════════════════════
   Score Ring Component
   ═══════════════════════════════════════════════════ */
function ScoreRing({ score, size = 56, color }: { score: number; size?: number; color: string }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={radius} fill="none"
                stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
        <circle cx={size/2} cy={size/2} r={radius} fill="none"
                stroke={color} strokeWidth="3" strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={offset}
                style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      </svg>
      <span className="absolute text-sm font-bold" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Candidate Portal Content
   ═══════════════════════════════════════════════════ */
function CandidatePortalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobIdParam = searchParams.get('job');
  const cvFileInputRef = useRef<HTMLInputElement>(null);

  // ── State ──────────────────────────────────────
  const [showSplash, setShowSplash] = useState(true);
  const [jobId, setJobId] = useState(jobIdParam || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [job, setJob] = useState<any>(null);
  const [jobLoading, setJobLoading] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);
  const [cvUploading, setCvUploading] = useState(false);
  const [cvResult, setCvResult] = useState<any>(null);
  const [cvFileName, setCvFileName] = useState<string | null>(null);
  const [step, setStep] = useState<'find_job' | 'upload_cv' | 'result'>('find_job');
  const [jobs, setJobs] = useState<any[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);

  // ── Load all jobs on mount ─────────────────────
  useEffect(() => {
    async function loadJobs() {
      try {
        const res = await fetch(`${API}/api/jobs/`);
        const data = await res.json();
        if (Array.isArray(data)) setJobs(data);
      } catch {}
      setJobsLoading(false);
    }
    loadJobs();
  }, []);

  // ── Auto-load job if ID in URL ─────────────────
  useEffect(() => {
    if (jobIdParam) {
      loadJob(jobIdParam);
    }
  }, [jobIdParam]);

  const loadJob = async (id: string) => {
    setJobLoading(true);
    setJobError(null);
    try {
      const res = await fetch(`${API}/api/jobs/${id}`);
      if (!res.ok) throw new Error('Job not found');
      const data = await res.json();
      setJob(data);
      setJobId(id);
      setStep('upload_cv');
    } catch (e: any) {
      setJobError(e.message);
    } finally {
      setJobLoading(false);
    }
  };

  // ── Upload CV ──────────────────────────────────
  const handleCVUpload = useCallback(async (file: File) => {
    if (!job) return;
    setCvUploading(true);
    setCvFileName(file.name);
    setCvResult(null);

    const formData = new FormData();
    formData.append('cv_file', file);
    formData.append('job_id', job.id);

    try {
      const res = await fetch(`${API}/api/applications/apply`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setCvResult({ error: data.detail || 'Application failed' });
        return;
      }
      setCvResult(data);
      setStep('result');
    } catch (e: any) {
      setCvResult({ error: e.message });
    } finally {
      setCvUploading(false);
    }
  }, [job]);

  // ── Splash Screen Timer ────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  if (showSplash) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center relative overflow-hidden">
        {/* Ambient Background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-[0.05]"
               style={{ background: 'radial-gradient(circle, #34D399, transparent)' }} />
        </div>
        
        <div className="relative z-10 text-center animate-scale-in">
          <div className="w-20 h-20 rounded-2xl mx-auto flex items-center justify-center mb-6"
               style={{ background: 'linear-gradient(135deg, #34D399, #2BC48E)', boxShadow: '0 0 40px rgba(52,211,153,0.3)' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#0B0B0F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 className="text-4xl font-extrabold text-white tracking-tight mb-3">Welcome to TalentScope</h1>
          <p className="text-accent-purple uppercase tracking-widest text-sm font-semibold">Candidate Portal</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* ── Ambient Background ─────────────────── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full opacity-[0.03]"
             style={{ background: 'radial-gradient(circle, #A78BFA, transparent)' }} />
        <div className="absolute -bottom-60 -left-40 w-[500px] h-[500px] rounded-full opacity-[0.02]"
             style={{ background: 'radial-gradient(circle, #34D399, transparent)' }} />
      </div>

      {/* ── Navigation ─────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-white/[0.04]">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => router.push('/')}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, #34D399, #2BC48E)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0B0B0F" strokeWidth="2.5"
                 strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight text-text-primary">TalentScope</span>
            <span className="text-xs text-text-muted ml-2">Candidate Portal</span>
          </div>
        </div>
      </nav>

      {/* ── Main Content ──────────────────────────── */}
      <main className="relative z-10 flex-1 flex items-start justify-center px-6 py-12">
        <div className="w-full max-w-2xl animate-fade-in">

          {/* ── Step 1: Find Job ──────────────────── */}
          {step === 'find_job' && (
            <div>
              <div className="text-center mb-10">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6"
                     style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.15)' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-purple animate-pulse" />
                  <span className="text-xs font-medium text-accent-purple tracking-wide">CANDIDATE PORTAL</span>
                </div>
                <h1 className="text-3xl font-extrabold text-text-primary mb-3">
                  Welcome to the Candidate Portal
                </h1>
                <p className="text-sm text-text-secondary max-w-lg mx-auto">
                  Find your opportunity below. Browse open positions and begin your AI interest screening.
                </p>
              </div>

              {/* Role Search Input */}
              <div className="card-surface p-6 mb-6">
                <label className="text-xs text-text-muted uppercase tracking-wider mb-2 block">Search Roles</label>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <svg className="absolute left-3 top-3" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input type="text" value={searchQuery}
                           onChange={(e) => setSearchQuery(e.target.value)}
                           placeholder="e.g. Senior Backend Engineer"
                           className="w-full pl-10 pr-4 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-accent-purple/40 transition-colors" />
                  </div>
                </div>
                {jobError && <p className="text-xs text-red-400 mt-2">{jobError}</p>}
              </div>

              {/* Available Jobs */}
              <div className="card-surface p-6">
                <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
                  </svg>
                  Open Positions
                </h3>
                {jobsLoading ? (
                  <div className="py-8 text-center">
                    <span className="w-6 h-6 border-2 border-accent-emerald/30 border-t-accent-emerald rounded-full animate-spin mx-auto block mb-3" />
                    <p className="text-xs text-text-muted">Loading positions...</p>
                  </div>
                ) : jobs.filter(j => j.title.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
                  <p className="text-xs text-text-muted text-center py-6">No matching positions found.</p>
                ) : (
                  <div className="space-y-3">
                    {jobs.filter(j => j.title.toLowerCase().includes(searchQuery.toLowerCase())).map((j: any) => (
                      <div key={j.id}
                           onClick={() => loadJob(j.id)}
                           className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] cursor-pointer hover:border-accent-purple/30 hover:bg-white/[0.04] transition-all group">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="text-sm font-semibold text-text-primary group-hover:text-accent-purple transition-colors">{j.title}</h4>
                            <p className="text-xs text-text-muted mt-1">
                              {j.parsed_params?.location || 'Remote'} · {j.parsed_params?.job_type || 'Full-time'}
                              {j.parsed_params?.salary_range && ` · ${j.parsed_params.salary_range}`}
                            </p>
                          </div>
                          <span className="text-[10px] text-accent-emerald font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                            Apply →
                          </span>
                        </div>
                        {j.must_haves && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {j.must_haves.slice(0, 5).map((s: string, i: number) => (
                              <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.04] text-text-muted">{s}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 2: Upload CV ─────────────────── */}
          {step === 'upload_cv' && job && (
            <div>
              <button onClick={() => { setStep('find_job'); setJob(null); setCvResult(null); }}
                      className="btn-ghost text-xs mb-6 flex items-center gap-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Back to Positions
              </button>

              {/* Job Details */}
              <div className="card-surface p-6 mb-6 border-l-4 border-accent-purple/60">
                <h2 className="text-xl font-bold text-text-primary mb-2">{job.title}</h2>
                <p className="text-xs text-text-muted mb-4">
                  {job.parsed_params?.location || 'Remote'} · {job.parsed_params?.job_type || 'Full-time'}
                  {job.parsed_params?.salary_range && ` · ${job.parsed_params.salary_range}`}
                  {job.parsed_params?.years_of_experience > 0 && ` · ${job.parsed_params.years_of_experience}+ years`}
                </p>
                {job.must_haves && (
                  <div>
                    <p className="text-[10px] text-text-disabled uppercase tracking-wider mb-2">Required Skills</p>
                    <div className="flex flex-wrap gap-1.5">
                      {job.must_haves.map((s: string, i: number) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-accent-emerald/10 text-accent-emerald">{s}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Expandable Details */}
                <details className="mt-4 group">
                  <summary className="cursor-pointer text-xs text-accent-purple font-medium flex items-center gap-1.5 hover:text-accent-purple/80 transition-colors">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                         className="transition-transform group-open:rotate-90">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                    View Full Details
                  </summary>
                  <div className="mt-4 pt-4 border-t border-white/[0.06] space-y-4 animate-fade-in">
                    {/* Nice-to-haves */}
                    {job.parsed_params?.nice_to_haves && job.parsed_params.nice_to_haves.length > 0 && (
                      <div>
                        <p className="text-[10px] text-text-disabled uppercase tracking-wider mb-2">Nice-to-Have Skills</p>
                        <div className="flex flex-wrap gap-1.5">
                          {job.parsed_params.nice_to_haves.map((s: string, i: number) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.04] text-text-muted">{s}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Responsibilities / Description */}
                    {job.parsed_params?.responsibilities && job.parsed_params.responsibilities.length > 0 && (
                      <div>
                        <p className="text-[10px] text-text-disabled uppercase tracking-wider mb-2">Key Responsibilities</p>
                        <ul className="space-y-1.5">
                          {job.parsed_params.responsibilities.map((r: string, i: number) => (
                            <li key={i} className="text-xs text-text-secondary flex items-start gap-2">
                              <span className="text-accent-emerald mt-0.5 text-[8px]">●</span>
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Additional Details Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      {job.parsed_params?.location && (
                        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                          <p className="text-[10px] text-text-disabled uppercase tracking-wider mb-1">Location</p>
                          <p className="text-xs text-text-primary">{job.parsed_params.location}</p>
                        </div>
                      )}
                      {job.parsed_params?.job_type && (
                        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                          <p className="text-[10px] text-text-disabled uppercase tracking-wider mb-1">Job Type</p>
                          <p className="text-xs text-text-primary">{job.parsed_params.job_type}</p>
                        </div>
                      )}
                      {job.parsed_params?.salary_range && (
                        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                          <p className="text-[10px] text-text-disabled uppercase tracking-wider mb-1">Salary Range</p>
                          <p className="text-xs text-text-primary">{job.parsed_params.salary_range}</p>
                        </div>
                      )}
                      {job.parsed_params?.years_of_experience > 0 && (
                        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                          <p className="text-[10px] text-text-disabled uppercase tracking-wider mb-1">Experience</p>
                          <p className="text-xs text-text-primary">{job.parsed_params.years_of_experience}+ years</p>
                        </div>
                      )}
                    </div>

                    {/* Raw Description (if no structured responsibilities) */}
                    {(!job.parsed_params?.responsibilities || job.parsed_params.responsibilities.length === 0) && job.parsed_params?.description && (
                      <div>
                        <p className="text-[10px] text-text-disabled uppercase tracking-wider mb-2">Description</p>
                        <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-line">{job.parsed_params.description}</p>
                      </div>
                    )}
                  </div>
                </details>
              </div>

              {/* CV Upload */}
              <div className="card-surface p-8 text-center">
                <div className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center"
                     style={{ background: 'rgba(167,139,250,0.1)' }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="1.8"
                       strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-text-primary mb-2">Upload Your Resume</h3>
                <p className="text-xs text-text-muted mb-6 max-w-sm mx-auto">
                  Upload your CV/Resume as a PDF. Our AI will analyze your profile and match it against the job requirements.
                </p>

                {cvFileName && !cvResult && (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] text-xs text-text-muted mb-4">
                    📄 {cvFileName}
                  </div>
                )}

                <div>
                  <button onClick={() => cvFileInputRef.current?.click()}
                          disabled={cvUploading}
                          className="btn-primary text-sm px-8 py-3">
                    {cvUploading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                        Analyzing Your Profile...
                      </span>
                    ) : (
                      'Select PDF Resume'
                    )}
                  </button>
                  <input ref={cvFileInputRef} type="file" accept=".pdf" className="hidden"
                         onChange={(e) => e.target.files?.[0] && handleCVUpload(e.target.files[0])} />
                </div>

                {cvResult?.error && (
                  <div className="mt-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                    <p className="text-sm text-red-400">{cvResult.error}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 3: Result & Begin Screening ──── */}
          {step === 'result' && cvResult && !cvResult.error && (
            <div className="text-center">
              <div className="w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center animate-scale-in"
                   style={{ background: 'rgba(52,211,153,0.1)' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2"
                     strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>

              <h2 className="text-2xl font-bold text-text-primary mb-2">Profile Analyzed Successfully!</h2>
              <p className="text-sm text-text-secondary mb-8">
                Your resume has been matched against the job requirements. Here&apos;s your initial assessment:
              </p>

              {/* Score Cards */}
              <div className="grid grid-cols-2 gap-4 mb-8 max-w-md mx-auto">
                <div className="card-surface p-6 text-center">
                  <ScoreRing score={cvResult.match_score} size={64} color="#34D399" />
                  <p className="text-xs text-text-muted mt-3">Match Score</p>
                  <p className="text-[10px] text-text-disabled mt-1">CV vs JD alignment</p>
                </div>
                <div className="card-surface p-6 text-center">
                  <div className="relative inline-flex items-center justify-center" style={{ width: 64, height: 64 }}>
                    <svg width="64" height="64" className="-rotate-90">
                      <circle cx="32" cy="32" r="29" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                    </svg>
                    <span className="absolute text-sm font-bold text-accent-purple">—</span>
                  </div>
                  <p className="text-xs text-text-muted mt-3">Interest Score</p>
                  <p className="text-[10px] text-accent-purple mt-1">Screening Pending</p>
                </div>
              </div>

              {/* Info */}
              <div className="card-surface p-6 mb-8 text-left max-w-md mx-auto">
                <h4 className="text-xs font-bold text-text-primary mb-3">What happens next?</h4>
                <div className="space-y-2.5">
                  {[
                    'Our AI recruiter will ask you 5 quick conversational questions',
                    'Questions are personalized based on your resume and the job',
                    'This helps us understand your genuine interest in this role',
                    'Takes approximately 5 minutes to complete',
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{ background: 'rgba(52,211,153,0.12)', color: '#34D399', fontSize: '8px' }}>✓</span>
                      <p className="text-xs text-text-secondary">{item}</p>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => router.push(`/interview/${cvResult.interview_id}?app=${cvResult.application_id}`)}
                className="btn-primary text-sm px-10 py-3.5 animate-pulse-glow"
              >
                Begin AI Screening →
              </button>
              <p className="text-[10px] text-text-disabled mt-3">You&apos;ll need microphone access for voice responses</p>
            </div>
          )}

        </div>
      </main>

      {/* ── Footer ─────────────────────────────── */}
      <footer className="relative z-10 text-center py-6 border-t border-white/[0.04]">
        <p className="text-xs text-text-disabled">
          TalentScope — AI-Powered Talent Scouting &amp; Engagement Agent
        </p>
      </footer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Candidate Portal Page (with Suspense boundary)
   ═══════════════════════════════════════════════════ */
export default function CandidatePortal() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <span className="w-8 h-8 border-2 border-accent-purple/30 border-t-accent-purple rounded-full animate-spin" />
      </div>
    }>
      <CandidatePortalContent />
    </Suspense>
  );
}
