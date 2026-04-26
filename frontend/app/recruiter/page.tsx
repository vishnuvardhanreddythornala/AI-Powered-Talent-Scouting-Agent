'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const fetcher = (url: string) => fetch(url).then(r => r.json());

/* ═══════════════════════════════════════════════════
   Score Ring Component
   ═══════════════════════════════════════════════════ */
function ScoreRing({ score, size = 44, color }: { score: number; size?: number; color: string }) {
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
      <span className="absolute text-xs font-bold" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Main Recruiter Dashboard
   ═══════════════════════════════════════════════════ */
export default function RecruiterDashboard() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── State ──────────────────────────────────────
  const [showSplash, setShowSplash] = useState(true);
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [jdText, setJdText] = useState('');
  const [pdfUploading, setPdfUploading] = useState(false);
  const [textUploading, setTextUploading] = useState(false);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<any>(null);
  const [uploadSuccess, setUploadSuccess] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'jobs' | 'candidates'>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // ── Filter State ───────────────────────────────
  const [minMatch, setMinMatch] = useState(0);
  const [minInterest, setMinInterest] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // ── Modal State ────────────────────────────────
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedCandidateHistory, setSelectedCandidateHistory] = useState<any[]>([]);
  const [selectedCandidateLoading, setSelectedCandidateLoading] = useState(false);
  const [selectedCandidateDetails, setSelectedCandidateDetails] = useState<any>(null);

  // ── SWR: Auto-refresh jobs list ───────────────
  const { data: jobsList, mutate: mutateJobs } = useSWR(`${API}/api/jobs/`, fetcher, {
    refreshInterval: 10000,
    onSuccess: (data) => { if (Array.isArray(data)) setJobs(data); },
  });

  // ── SWR: Auto-refresh candidates for selected job (5s polling) ──
  const { data: candidates } = useSWR(
    selectedJob ? `${API}/api/jobs/${selectedJob.id}/candidates` : null,
    fetcher,
    { refreshInterval: 5000 }
  );

  // ── Upload JD PDF ──────────────────────────────
  const handlePDFUpload = useCallback(async (file: File) => {
    setPdfUploading(true);
    setPdfFileName(file.name);
    setUploadError(null);
    setUploadSuccess(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API}/api/jobs/upload-pdf`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        // JD Quality Alert
        if (res.status === 400 && err.detail?.error === 'JD_QUALITY_ALERT') {
          setUploadError({
            type: 'quality_alert',
            issues: err.detail.issues,
            parsed: err.detail.parsed_data,
          });
        } else {
          setUploadError({ type: 'generic', message: err.detail || 'Upload failed' });
        }
        return;
      }

      const job = await res.json();
      setUploadSuccess(job);
      mutateJobs();
    } catch (e: any) {
      setUploadError({ type: 'generic', message: e.message });
    } finally {
      setPdfUploading(false);
    }
  }, [mutateJobs]);

  // ── Upload JD Text ─────────────────────────────
  const handleTextUpload = useCallback(async () => {
    if (!jdText.trim() || jdText.length < 50) {
      setUploadError({ type: 'generic', message: 'Job description must be at least 50 characters.' });
      return;
    }

    setTextUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const res = await fetch(`${API}/api/jobs/upload-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: jdText }),
      });

      if (!res.ok) {
        const err = await res.json();
        if (res.status === 400 && err.detail?.error === 'JD_QUALITY_ALERT') {
          setUploadError({
            type: 'quality_alert',
            issues: err.detail.issues,
            parsed: err.detail.parsed_data,
          });
        } else {
          setUploadError({ type: 'generic', message: err.detail || 'Upload failed' });
        }
        return;
      }

      const job = await res.json();
      setUploadSuccess(job);
      setJdText('');
      mutateJobs();
    } catch (e: any) {
      setUploadError({ type: 'generic', message: e.message });
    } finally {
      setTextUploading(false);
    }
  }, [jdText, mutateJobs]);



  // ── View Candidate Details ─────────────────────
  const handleViewDetails = useCallback(async (candidate: any) => {
    if (!candidate.interview_id) return;
    setSelectedCandidateDetails(candidate);
    setDetailsModalOpen(true);
    setSelectedCandidateLoading(true);
    setSelectedCandidateHistory([]);

    try {
      const res = await fetch(`${API}/api/interview/${candidate.interview_id}/history`);
      if (!res.ok) throw new Error('Failed to load history');
      const data = await res.json();
      setSelectedCandidateHistory(data);
    } catch (e: any) {
      console.error('Error fetching candidate history:', e);
    } finally {
      setSelectedCandidateLoading(false);
    }
  }, []);

  const closeCandidateModal = () => setSelectedCandidateDetails(null);

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
               style={{ background: 'radial-gradient(circle, #A78BFA, transparent)' }} />
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
          <h1 className="text-4xl font-extrabold text-white tracking-tight mb-3">Welcome to Catalyst</h1>
          <p className="text-accent-emerald uppercase tracking-widest text-sm font-semibold">Recruiter Dashboard</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex">
      {/* ── Ambient Background ──────────────────── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full opacity-[0.025]"
             style={{ background: 'radial-gradient(circle, #34D399, transparent)' }} />
        <div className="absolute bottom-0 left-1/3 w-[400px] h-[400px] rounded-full opacity-[0.015]"
             style={{ background: 'radial-gradient(circle, #A78BFA, transparent)' }} />
      </div>

      {/* ── Left Sidebar ────────────────────────── */}
      <aside className="w-64 border-r border-white/[0.04] p-6 flex flex-col relative z-10 hidden md:flex shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3 cursor-pointer mb-10" onClick={() => router.push('/')}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, #34D399, #2BC48E)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0B0B0F" strokeWidth="2.5"
                 strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="text-lg font-bold tracking-tight text-text-primary">Catalyst</span>
        </div>

        <div className="text-xs font-semibold text-text-disabled uppercase tracking-wider mb-3 px-3">
          Recruiter Menu
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-1">
          {(['upload', 'jobs', 'candidates'] as const).map(tab => (
            <button key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all text-left ${
                      activeTab === tab
                        ? 'bg-surface-200 text-text-primary shadow-sm border border-white/[0.04]'
                        : 'text-text-muted hover:text-text-secondary hover:bg-white/[0.02]'
                    }`}>
              {tab === 'upload' ? '📄 Upload JD' : tab === 'jobs' ? '💼 Active Jobs' : '👥 Candidates'}
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Main Content Area ───────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 relative z-10 h-screen overflow-y-auto">
        <div className="p-8 lg:p-12">
          {/* ── Welcome Header ────────────────────── */}
          <div className="mb-10 animate-fade-in">
            <h1 className="text-3xl font-extrabold text-text-primary mb-2">
              Welcome to the Recruiter Dashboard
            </h1>
            <p className="text-sm text-text-secondary max-w-2xl">
              Upload Job Descriptions to generate AI screening blueprints, manage active roles, and review AI-scored candidate profiles.
            </p>
          </div>

        {/* ═══════════════════════════════════════════
            TAB: Upload JD
            ═══════════════════════════════════════════ */}
        {activeTab === 'upload' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
            {/* PDF Upload */}
            <div className="card-surface p-7">
              <h2 className="text-base font-bold text-text-primary mb-1">Upload JD as PDF</h2>
              <p className="text-xs text-text-muted mb-6">Drop a job description PDF for AI-powered parsing</p>

              <div
                className={`border-2 border-dashed rounded-2xl p-10 text-center transition-colors ${
                  pdfUploading ? 'border-accent-emerald bg-accent-emerald/5 cursor-wait' :
                  isDragging ? 'border-accent-emerald bg-accent-emerald/5 cursor-pointer' : 'border-white/[0.08] hover:border-accent-emerald/30 cursor-pointer'
                }`}
                onClick={() => !pdfUploading && fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); if (!pdfUploading) setIsDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (pdfUploading) return;
                  const file = e.dataTransfer.files?.[0];
                  if (file && file.type === 'application/pdf') {
                    handlePDFUpload(file);
                  } else {
                    setUploadError({ type: 'generic', message: 'Please drop a valid .pdf file' });
                  }
                }}
              >
                {pdfUploading ? (
                  <>
                    <span className="w-8 h-8 border-2 border-accent-emerald/30 border-t-accent-emerald rounded-full animate-spin mx-auto mb-3 block" />
                    <p className="text-sm text-text-secondary mb-1">Analyzing <strong className="text-text-primary">{pdfFileName}</strong>...</p>
                    <p className="text-xs text-text-disabled">This may take a minute while AI processes it.</p>
                  </>
                ) : (
                  <>
                    <svg className={`mx-auto mb-3 transition-colors ${isDragging ? 'text-accent-emerald' : 'text-text-disabled'}`} width="32" height="32" viewBox="0 0 24 24"
                         fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <p className="text-sm text-text-secondary mb-1">Click or drag and drop to upload PDF</p>
                    <p className="text-xs text-text-disabled">Supports .pdf files</p>
                  </>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept=".pdf" className="hidden"
                     onChange={(e) => {
                       if (e.target.files?.[0]) {
                         handlePDFUpload(e.target.files[0]);
                         e.target.value = ''; // Reset input so same file can be uploaded again if needed
                       }
                     }} />
            </div>

            {/* Text Upload */}
            <div className="card-surface p-7">
              <h2 className="text-base font-bold text-text-primary mb-1">Paste JD Text</h2>
              <p className="text-xs text-text-muted mb-6">Or paste the job description directly</p>

              <textarea
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                placeholder="Paste job description here (minimum 50 characters)..."
                className="input-dark h-48 resize-none mb-4"
              />
              <button onClick={handleTextUpload} disabled={textUploading || jdText.length < 50}
                      className="btn-primary w-full flex items-center justify-center gap-2">
                {textUploading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  'Start Candidate Discovery'
                )}
              </button>
            </div>

            {/* Error Display */}
            {uploadError && (
              <div className="lg:col-span-2 animate-scale-in">
                {uploadError.type === 'quality_alert' ? (
                  <div className="card-surface p-6 border-l-4 border-amber-500/60">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-amber-400 text-lg">⚠️</span>
                      <h3 className="text-sm font-bold text-amber-400">JD Quality Alert</h3>
                    </div>
                    <p className="text-xs text-text-secondary mb-4">
                      The job description doesn&apos;t meet quality standards. Please address the following:
                    </p>
                    <ul className="space-y-2 mb-4">
                      {uploadError.issues.map((issue: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                          <span className="text-amber-400 mt-0.5">•</span>
                          {issue}
                        </li>
                      ))}
                    </ul>
                    <button onClick={() => setUploadError(null)} className="btn-ghost text-xs">
                      Dismiss & Revise
                    </button>
                  </div>
                ) : (
                  <div className="card-surface p-6 border-l-4 border-red-500/60">
                    <p className="text-sm text-red-400">{uploadError.message}</p>
                  </div>
                )}
              </div>
            )}

            {/* Success Display */}
            {uploadSuccess && (
              <div className="lg:col-span-2 card-surface p-6 border-l-4 border-accent-emerald/60 animate-scale-in">
                <div className="flex items-center gap-2 mb-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <h3 className="text-sm font-bold text-accent-emerald">JD Parsed Successfully</h3>
                </div>
                <p className="text-xs text-text-secondary mb-2">
                  <strong className="text-text-primary">{uploadSuccess.title}</strong> — Pipeline launched, ready for candidates.
                </p>
                {uploadSuccess.parsed_params && (
                  <div className="mb-4">
                    <p className="text-[10px] text-text-disabled uppercase tracking-wider mb-2">Skills Extracted</p>
                    <div className="flex flex-wrap gap-2">
                      {(uploadSuccess.must_haves || []).map((skill: string, i: number) => (
                        <span key={i} className="badge badge-emerald">{skill}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3 mt-4 pt-4 border-t border-white/[0.06]">
                  <button onClick={() => { setSelectedJob(uploadSuccess); setActiveTab('candidates'); setUploadSuccess(null); }}
                          className="btn-primary text-xs">View Candidates</button>
                  <button onClick={() => { setActiveTab('jobs'); setUploadSuccess(null); }}
                          className="btn-ghost text-xs">Go to Active Jobs</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════
            TAB: Active Jobs
            ═══════════════════════════════════════════ */}
        {activeTab === 'jobs' && (
          <div className="animate-fade-in">
            {!Array.isArray(jobsList) || jobsList.length === 0 ? (
              <div className="card-surface p-12 text-center">
                <p className="text-text-muted text-sm mb-4">No active jobs yet</p>
                <button onClick={() => setActiveTab('upload')} className="btn-primary text-xs">
                  Upload Your First JD
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {jobsList.map((job: any) => (
                  <div key={job.id}
                       className={`card-surface p-6 cursor-pointer transition-all ${
                         selectedJob?.id === job.id ? 'border-accent-emerald/30 shadow-glow-emerald' : ''
                       }`}
                       onClick={() => { setSelectedJob(job); setActiveTab('candidates'); }}>
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-bold text-text-primary mb-1">{job.title}</h3>
                        <p className="text-xs text-text-muted">
                          {job.parsed_params?.location || 'Remote'} · {job.parsed_params?.job_type || 'Full-time'}
                        </p>
                      </div>
                      <span className="badge badge-emerald">{job.status}</span>
                    </div>

                    {job.must_haves && (
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {job.must_haves.slice(0, 4).map((s: string, i: number) => (
                          <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.04] text-text-muted">
                            {s}
                          </span>
                        ))}
                        {job.must_haves.length > 4 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.04] text-text-disabled">
                            +{job.must_haves.length - 4}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-3 border-t border-white/[0.04]">
                      <span className="text-[10px] text-text-disabled">
                        {new Date(job.created_at).toLocaleDateString()}
                      </span>
                      <span className="text-[10px] text-accent-emerald font-medium">View Candidates →</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════
            TAB: Candidates
            ═══════════════════════════════════════════ */}
        {activeTab === 'candidates' && (
          <div className="animate-fade-in">
            {!selectedJob ? (
              <div className="card-surface p-12 text-center">
                <p className="text-text-muted text-sm mb-4">Select a job first to view candidates</p>
                <button onClick={() => setActiveTab('jobs')} className="btn-primary text-xs">
                  View Jobs
                </button>
              </div>
            ) : (
              <>
                {/* Job Header */}
                <div className="card-surface p-6 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-bold text-text-primary">{selectedJob.title}</h2>
                      <p className="text-xs text-text-muted mt-1">
                        {selectedJob.parsed_params?.salary_range || 'Salary not specified'} ·{' '}
                        {selectedJob.parsed_params?.years_of_experience || 0}+ years
                      </p>
                    </div>
                  </div>
                  {/* Candidate Portal Link */}
                  <div className="p-3 rounded-xl bg-accent-purple/5 border border-accent-purple/15">
                    <p className="text-[10px] text-accent-purple font-semibold uppercase tracking-wider mb-1.5">Share with Candidates</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs text-text-secondary bg-white/[0.03] px-3 py-1.5 rounded-lg truncate">
                        {typeof window !== 'undefined' ? `${window.location.origin}/candidate?job=${selectedJob.id}` : `/candidate?job=${selectedJob.id}`}
                      </code>
                      <button onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}/candidate?job=${selectedJob.id}`);
                                setLinkCopied(true);
                                setTimeout(() => setLinkCopied(false), 2000);
                              }}
                              className={`text-[10px] px-3 py-1.5 flex-shrink-0 rounded-xl font-semibold tracking-wide transition-all ${
                                linkCopied
                                  ? 'bg-accent-emerald/20 text-accent-emerald border border-accent-emerald/30'
                                  : 'bg-white/[0.04] text-text-muted border border-white/[0.08] hover:bg-white/[0.08] hover:text-text-primary'
                              }`}>
                        {linkCopied ? '✓ Copied!' : 'Copy Link'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── Score Filters ─────────────────────── */}
                {Array.isArray(candidates) && candidates.length > 0 && (
                  <div className="card-surface p-5 mb-4">
                    <div className="flex items-center gap-2 mb-4">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                      </svg>
                      <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">Filter Candidates</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Match Score Slider */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-[10px] text-text-muted uppercase tracking-wider">Min Match Score</label>
                          <span className="text-xs font-bold text-accent-emerald">{minMatch}%</span>
                        </div>
                        <input type="range" min="0" max="100" value={minMatch}
                               onChange={(e) => setMinMatch(Number(e.target.value))}
                               className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                               style={{ background: `linear-gradient(to right, #34D399 ${minMatch}%, rgba(255,255,255,0.08) ${minMatch}%)` }} />
                      </div>
                      {/* Interest Score Slider */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-[10px] text-text-muted uppercase tracking-wider">Min Interest Score</label>
                          <span className="text-xs font-bold text-accent-purple">{minInterest}%</span>
                        </div>
                        <input type="range" min="0" max="100" value={minInterest}
                               onChange={(e) => setMinInterest(Number(e.target.value))}
                               className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                               style={{ background: `linear-gradient(to right, #A78BFA ${minInterest}%, rgba(255,255,255,0.08) ${minInterest}%)` }} />
                      </div>
                      {/* Status Filter */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-[10px] text-text-muted uppercase tracking-wider">Status</label>
                        </div>
                        <select value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="w-full px-3 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-xs text-text-primary focus:outline-none focus:border-accent-purple/40 appearance-none cursor-pointer">
                          <option value="all">All Statuses</option>
                          <option value="applied">Awaiting Response</option>
                          <option value="interviewing">Screening In Progress</option>
                          <option value="scored">Screening Complete</option>
                        </select>
                      </div>
                    </div>
                    {(minMatch > 0 || minInterest > 0 || statusFilter !== 'all') && (
                      <button onClick={() => { setMinMatch(0); setMinInterest(0); setStatusFilter('all'); }}
                              className="mt-3 text-[10px] text-accent-purple hover:text-accent-purple/80 cursor-pointer transition-colors">
                        ✕ Clear all filters
                      </button>
                    )}
                  </div>
                )}

                {/* Candidates Table */}
                <div className="card-surface overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/[0.04]">
                    <h3 className="text-sm font-bold text-text-primary">
                      Candidates
                      <span className="ml-2 text-text-disabled font-normal">
                        {(() => {
                          const filtered = (Array.isArray(candidates) ? candidates : []).filter((c: any) => {
                            if (c.match_score < minMatch) return false;
                            if (Math.round(c.final_interest_score) < minInterest) return false;
                            if (statusFilter !== 'all' && c.status !== statusFilter) return false;
                            return true;
                          });
                          const total = Array.isArray(candidates) ? candidates.length : 0;
                          return filtered.length === total ? total : `${filtered.length} of ${total}`;
                        })()}
                      </span>
                    </h3>
                  </div>

                  {!Array.isArray(candidates) || candidates.length === 0 ? (
                    <div className="p-12 text-center">
                      <p className="text-xs text-text-muted">No candidates yet. Share the candidate portal link to start receiving applications.</p>
                    </div>
                  ) : (
                    <table className="table-premium">
                      <thead>
                        <tr>
                          <th>Candidate</th>
                          <th>Skills</th>
                          <th>Match Score</th>
                          <th>Interest Score</th>
                          <th>Status</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {candidates
                          .filter((c: any) => {
                            if (c.match_score < minMatch) return false;
                            if (Math.round(c.final_interest_score) < minInterest) return false;
                            if (statusFilter !== 'all' && c.status !== statusFilter) return false;
                            return true;
                          })
                          .sort((a: any, b: any) => {
                            // Sort by combined score descending
                            const scoreA = a.match_score + a.final_interest_score;
                            const scoreB = b.match_score + b.final_interest_score;
                            return scoreB - scoreA;
                          })
                          .map((c: any) => (
                          <tr key={c.application_id}>
                            <td>
                              <div>
                                <p className="text-sm font-semibold text-text-primary">{c.candidate_name}</p>
                                <p className="text-xs text-text-muted">{c.candidate_email}</p>
                              </div>
                            </td>
                            <td>
                              <div className="flex flex-wrap gap-1 max-w-[200px]">
                                {(c.cv_skills || []).slice(0, 3).map((s: string, i: number) => (
                                  <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-text-muted">
                                    {s}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td><ScoreRing score={c.match_score} color="#34D399" /></td>
                             <td>
                              {c.status === 'interviewing' && c.final_interest_score === 0 ? (
                                <span className="text-[10px] text-accent-purple font-medium">Pending</span>
                              ) : (
                                <ScoreRing score={Math.round(c.final_interest_score)} color="#A78BFA" />
                              )}
                            </td>
                            <td>
                              <span className={`badge ${
                                c.status === 'interviewing' ? 'badge-amber' :
                                c.status === 'scored' ? 'badge-emerald' : 'badge-purple'
                              }`}>
                                {c.status === 'interviewing' ? 'Screening In Progress' :
                                 c.status === 'scored' ? 'Screening Complete' :
                                 c.status === 'applied' ? 'Awaiting Response' : c.status}
                              </span>
                            </td>
                            <td>
                              <button 
                                onClick={() => handleViewDetails(c)}
                                disabled={!c.interview_id}
                                className="btn-ghost text-[10px] py-1.5 px-3 disabled:opacity-50 disabled:cursor-not-allowed">
                                View Details
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </main>
      {/* ═══════════════════════════════════════════
          Candidate Details Modal
          ═══════════════════════════════════════════ */}
      {detailsModalOpen && selectedCandidateDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-surface border border-white/[0.08] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b border-white/[0.08]">
              <div>
                <h2 className="text-lg font-bold text-text-primary">{selectedCandidateDetails.candidate_name}</h2>
                <p className="text-sm text-text-muted">{selectedCandidateDetails.candidate_email}</p>
              </div>
              <button onClick={() => setDetailsModalOpen(false)} className="text-text-muted hover:text-white transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1">
              <div className="flex gap-8 mb-8">
                <div>
                  <p className="text-xs text-text-disabled uppercase tracking-wider mb-1">Semantic Match</p>
                  <div className="flex items-center gap-2">
                    <ScoreRing score={selectedCandidateDetails.match_score} size={36} color="#34D399" />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-text-disabled uppercase tracking-wider mb-1">Interest Score</p>
                  <div className="flex items-center gap-2">
                    {selectedCandidateDetails.final_interest_score === 0 && selectedCandidateDetails.status === 'interviewing' ? (
                      <span className="text-xs text-accent-purple font-medium">Screening Pending</span>
                    ) : (
                      <ScoreRing score={Math.round(selectedCandidateDetails.final_interest_score)} size={36} color="#A78BFA" />
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-text-disabled uppercase tracking-wider mb-1">Status</p>
                  <span className={`badge mt-1 ${
                    selectedCandidateDetails.status === 'interviewing' ? 'badge-amber' :
                    selectedCandidateDetails.status === 'scored' ? 'badge-emerald' : 'badge-purple'
                  }`}>
                    {selectedCandidateDetails.status === 'interviewing' ? 'Screening In Progress' :
                     selectedCandidateDetails.status === 'scored' ? 'Screening Complete' : selectedCandidateDetails.status}
                  </span>
                </div>
              </div>

              {/* ── XAI: Why This Candidate? ────────── */}
              {selectedJob && selectedCandidateDetails.cv_skills && (
                <div className="card-surface p-5 mb-6 border-l-4 border-blue-400/40">
                  <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    Why This Candidate?
                  </h4>
                  {(() => {
                    const normalize = (str: string) => ` ${str.toLowerCase().replace(/[^a-z0-9+#]/g, ' ').replace(/\s+/g, ' ').trim()} `;
                    const isMatch = (s: string, c: string) => {
                      const sNorm = normalize(s);
                      const cNorm = normalize(c);
                      const sTrim = sNorm.trim();
                      const cTrim = cNorm.trim();
                      if (!sTrim || !cTrim) return false;
                      return sNorm.includes(` ${cTrim} `) || cNorm.includes(` ${sTrim} `);
                    };

                    const jdSkills: string[] = selectedJob.must_haves || [];
                    const cvSkills: string[] = selectedCandidateDetails.cv_skills || [];
                    
                    const rawText: string = selectedCandidateDetails.cv_parsed_json?.raw_text || "";
                    const rawTextNorm = rawText ? normalize(rawText) : "";
                    
                    const isMatchOverall = (s: string) => {
                      const sTrim = normalize(s).trim();
                      if (!sTrim) return false;
                      
                      // 1. Check parsed skill array
                      if (cvSkills.some((c: string) => isMatch(s, c))) return true;
                      
                      // 2. Check raw CV text
                      if (rawTextNorm.includes(` ${sTrim} `)) return true;
                      
                      return false;
                    };

                    const matched = jdSkills.filter((s: string) => isMatchOverall(s));
                    const missing = jdSkills.filter((s: string) => !isMatchOverall(s));
                    const coverage = jdSkills.length > 0 ? Math.round((matched.length / jdSkills.length) * 100) : 0;
                    return (
                      <div className="space-y-2">
                        {matched.map((s: string, i: number) => (
                          <div key={`m-${i}`} className="flex items-center gap-2 text-xs">
                            <span className="text-accent-emerald">✓</span>
                            <span className="text-text-secondary">{s} experience aligns with JD</span>
                          </div>
                        ))}
                        {missing.map((s: string, i: number) => (
                          <div key={`x-${i}`} className="flex items-center gap-2 text-xs">
                            <span className="text-amber-400">✗</span>
                            <span className="text-text-muted">Missing {s} experience</span>
                          </div>
                        ))}
                        <div className="mt-3 pt-3 border-t border-white/[0.06] text-xs text-text-muted">
                          Skill Coverage: <strong className="text-text-primary">{matched.length}/{jdSkills.length}</strong> ({coverage}%)
                          {coverage >= 70 ? ' — Strong Match' : coverage >= 40 ? ' — Moderate Match' : ' — Needs Review'}
                        </div>
                        
                        {/* ── Bridge Plan (Skill Gap Analysis) ── */}
                        {selectedCandidateDetails.skill_gap_analysis?.gap_analysis?.length > 0 && (
                          <div className="mt-4 pt-3 border-t border-white/[0.06]">
                            <h5 className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-2">Bridge Plan / Upskilling</h5>
                            <div className="space-y-1">
                              {selectedCandidateDetails.skill_gap_analysis.gap_analysis.map((gap: any, i: number) => (
                                <div key={i} className="flex justify-between items-center text-xs">
                                  <span className="text-text-secondary">• {gap.skill}</span>
                                  <span className="text-text-muted text-[10px] bg-white/[0.03] px-2 py-0.5 rounded">{gap.learning_time}</span>
                                </div>
                              ))}
                            </div>
                            <p className="text-[10px] text-text-muted mt-2 italic border-l-2 border-white/10 pl-2">
                              {selectedCandidateDetails.skill_gap_analysis.hire_recommendation}
                            </p>
                          </div>
                        )}

                        {/* ── Bonus Skills ── */}
                        {selectedJob.nice_to_haves && selectedJob.nice_to_haves.length > 0 && (
                          <div className="mt-4 pt-3 border-t border-white/[0.06]">
                            <h5 className="text-[10px] font-bold text-accent-purple uppercase tracking-wider mb-2 flex items-center gap-1">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                              </svg>
                              Bonus Skills Detected
                            </h5>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedJob.nice_to_haves.filter((s: string) => isMatchOverall(s)).map((s: string, i: number) => (
                                <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-accent-purple/10 text-accent-purple border border-accent-purple/20">
                                  {s}
                                </span>
                              ))}
                              {selectedJob.nice_to_haves.filter((s: string) => isMatchOverall(s)).length === 0 && (
                                <span className="text-[10px] text-text-disabled">No bonus skills found</span>
                              )}
                            </div>
                          </div>
                        )}

                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ── AI Reasoning Trace (expandable) ──── */}
              <details className="card-surface mb-6 overflow-hidden">
                <summary className="p-4 cursor-pointer text-xs font-bold text-text-muted uppercase tracking-wider hover:text-text-primary transition-colors flex items-center gap-2">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  AI Reasoning Trace
                </summary>
                <div className="px-4 pb-4 space-y-1.5 font-mono">
                  <p className="text-[10px] text-accent-emerald">▸ ENTERING: JD PARSING → Skills extracted via Groq LLaMA-3.3-70B</p>
                  <p className="text-[10px] text-accent-emerald">▸ ENTERING: CV ANALYSIS → Profile parsed via Groq LLaMA-3.3-70B</p>
                  <p className="text-[10px] text-accent-emerald">▸ ENTERING: VECTOR EMBEDDING → Skills encoded with Sentence-Transformers (all-MiniLM-L6-v2)</p>
                  <p className="text-[10px] text-accent-emerald">▸ ENTERING: QDRANT COSINE SIMILARITY → Semantic Match Score: {selectedCandidateDetails.match_score}%</p>
                  <p className="text-[10px] text-accent-emerald">▸ ENTERING: INTEREST SCREENING → {selectedCandidateHistory.length} questions completed</p>
                  <p className="text-[10px] text-accent-purple">▸ ENTERING: SCORING → Interest Score: {Math.round(selectedCandidateDetails.final_interest_score)}/100</p>
                  <div className="mt-3 pt-3 border-t border-white/[0.06]">
                    <p className="text-[10px] text-text-muted">Skill coverage: {selectedCandidateDetails.cv_skills?.length || 0} candidate skills evaluated</p>
                    <p className="text-[10px] text-text-muted">Experience confidence: {selectedCandidateDetails.match_score >= 70 ? 'High' : selectedCandidateDetails.match_score >= 40 ? 'Moderate' : 'Low'}</p>
                    <p className="text-[10px] text-text-muted">Interest confidence: {selectedCandidateDetails.final_interest_score >= 70 ? 'Strong' : selectedCandidateDetails.final_interest_score >= 40 ? 'Moderate' : 'Needs further screening'}</p>
                    <p className="text-[10px] text-text-primary font-semibold mt-2">
                      Final recommendation: {
                        selectedCandidateDetails.match_score >= 60 && selectedCandidateDetails.final_interest_score >= 60 ? '✓ Shortlist' :
                        selectedCandidateDetails.match_score >= 40 || selectedCandidateDetails.final_interest_score >= 40 ? '⟳ Needs Review' :
                        '— Not Recommended'
                      }
                    </p>
                  </div>
                </div>
              </details>

              <h3 className="text-sm font-bold text-text-primary mb-4 border-b border-white/[0.08] pb-2">Screening Conversation</h3>
              
              {selectedCandidateLoading ? (
                <div className="py-12 text-center">
                  <span className="w-8 h-8 border-2 border-accent-purple/30 border-t-accent-purple rounded-full animate-spin mx-auto block mb-4" />
                  <p className="text-sm text-text-muted">Loading screening conversation...</p>
                </div>
              ) : selectedCandidateHistory.length === 0 ? (
                <div className="py-8 text-center bg-white/[0.02] rounded-xl border border-white/[0.04]">
                  <p className="text-sm text-text-muted">No screening conversation found.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {selectedCandidateHistory.map((item, index) => (
                    <div key={index} className="bg-white/[0.02] rounded-xl border border-white/[0.04] overflow-hidden">
                      {/* Question */}
                      <div className="p-4 bg-white/[0.02] border-b border-white/[0.04]">
                        <div className="flex items-start gap-3">
                          <span className="flex-shrink-0 w-6 h-6 rounded bg-accent-emerald/10 text-accent-emerald flex items-center justify-center text-xs font-bold mt-0.5">Q{item.q_number}</span>
                          <p className="text-sm text-text-primary leading-relaxed">{item.ai_question}</p>
                        </div>
                      </div>
                      
                      {/* Answer */}
                      <div className="p-4">
                        <div className="flex items-start gap-3 mb-4">
                          <span className="flex-shrink-0 w-6 h-6 rounded bg-accent-purple/10 text-accent-purple flex items-center justify-center text-xs font-bold mt-0.5">A</span>
                          <p className="text-sm text-text-secondary leading-relaxed italic border-l-2 border-white/10 pl-3">
                            "{item.candidate_answer || 'No answer recorded.'}"
                          </p>
                        </div>

                        {/* Evaluation */}
                        {item.interest_score !== null && (
                          <div className="ml-9 p-3 rounded-lg bg-[#0B0B0F]/50 border border-white/[0.04] flex items-start gap-3">
                            <div className="flex-shrink-0 pt-0.5">
                              <ScoreRing score={item.interest_score} size={28} color="#A78BFA" />
                            </div>
                            <div>
                              <p className="text-[10px] text-text-disabled uppercase tracking-wider mb-1">Interest Signal</p>
                              <p className="text-xs text-text-muted leading-relaxed">{item.score_reasoning}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
