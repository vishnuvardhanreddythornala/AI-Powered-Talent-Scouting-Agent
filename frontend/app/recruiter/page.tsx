'use client';

import { useState, useCallback, useRef } from 'react';
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
  const cvFileInputRef = useRef<HTMLInputElement>(null);

  // ── State ──────────────────────────────────────
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [jdText, setJdText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<any>(null);
  const [uploadSuccess, setUploadSuccess] = useState<any>(null);
  const [cvUploading, setCvUploading] = useState(false);
  const [cvResult, setCvResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'jobs' | 'candidates'>('upload');

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
    setUploading(true);
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
      setActiveTab('jobs');
    } catch (e: any) {
      setUploadError({ type: 'generic', message: e.message });
    } finally {
      setUploading(false);
    }
  }, [mutateJobs]);

  // ── Upload JD Text ─────────────────────────────
  const handleTextUpload = useCallback(async () => {
    if (!jdText.trim() || jdText.length < 50) {
      setUploadError({ type: 'generic', message: 'Job description must be at least 50 characters.' });
      return;
    }

    setUploading(true);
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
      setActiveTab('jobs');
    } catch (e: any) {
      setUploadError({ type: 'generic', message: e.message });
    } finally {
      setUploading(false);
    }
  }, [jdText, mutateJobs]);

  // ── Upload CV for a job ────────────────────────
  const handleCVUpload = useCallback(async (file: File) => {
    if (!selectedJob) return;

    setCvUploading(true);
    setCvResult(null);

    const formData = new FormData();
    formData.append('cv_file', file);
    formData.append('job_id', selectedJob.id);

    try {
      const res = await fetch(`${API}/api/applications/apply`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setCvResult({ error: data.detail || 'CV upload failed' });
        return;
      }

      setCvResult(data);
    } catch (e: any) {
      setCvResult({ error: e.message });
    } finally {
      setCvUploading(false);
    }
  }, [selectedJob]);

  return (
    <div className="min-h-screen bg-surface">
      {/* ── Ambient Background ──────────────────── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full opacity-[0.025]"
             style={{ background: 'radial-gradient(circle, #34D399, transparent)' }} />
        <div className="absolute bottom-0 left-1/3 w-[400px] h-[400px] rounded-full opacity-[0.015]"
             style={{ background: 'radial-gradient(circle, #A78BFA, transparent)' }} />
      </div>

      {/* ── Top Bar ────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between px-8 py-4 border-b border-white/[0.04]">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => router.push('/')}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, #34D399, #2BC48E)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0B0B0F" strokeWidth="2.5"
                 strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="text-base font-bold tracking-tight text-text-primary">Catalyst</span>
          <span className="text-text-disabled mx-2">/</span>
          <span className="text-sm text-text-secondary">Recruiter Dashboard</span>
        </div>
      </header>

      <div className="relative z-10 max-w-7xl mx-auto px-8 py-8">
        {/* ── Tab Navigation ────────────────────── */}
        <div className="flex items-center gap-1 mb-8 p-1 rounded-xl w-fit"
             style={{ background: 'rgba(255,255,255,0.03)' }}>
          {(['upload', 'jobs', 'candidates'] as const).map(tab => (
            <button key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                      activeTab === tab
                        ? 'bg-surface-200 text-text-primary shadow-sm'
                        : 'text-text-muted hover:text-text-secondary'
                    }`}>
              {tab === 'upload' ? '📄 Upload JD' : tab === 'jobs' ? '💼 Active Jobs' : '👥 Candidates'}
            </button>
          ))}
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
                className="border-2 border-dashed border-white/[0.08] rounded-2xl p-10 text-center cursor-pointer hover:border-accent-emerald/30 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <svg className="mx-auto mb-3 text-text-disabled" width="32" height="32" viewBox="0 0 24 24"
                     fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p className="text-sm text-text-secondary mb-1">Click to upload PDF</p>
                <p className="text-xs text-text-disabled">Supports .pdf files</p>
              </div>
              <input ref={fileInputRef} type="file" accept=".pdf" className="hidden"
                     onChange={(e) => e.target.files?.[0] && handlePDFUpload(e.target.files[0])} />
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
              <button onClick={handleTextUpload} disabled={uploading || jdText.length < 50}
                      className="btn-primary w-full flex items-center justify-center gap-2">
                {uploading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  'Parse & Launch Pipeline'
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
                  <span className="text-lg">✅</span>
                  <h3 className="text-sm font-bold text-accent-emerald">Pipeline Launched Successfully</h3>
                </div>
                <p className="text-xs text-text-secondary mb-2">
                  <strong className="text-text-primary">{uploadSuccess.title}</strong> has been parsed and is now active.
                </p>
                {uploadSuccess.parsed_params && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {(uploadSuccess.must_haves || []).map((skill: string, i: number) => (
                      <span key={i} className="badge badge-emerald">{skill}</span>
                    ))}
                  </div>
                )}
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
                <div className="card-surface p-6 mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-text-primary">{selectedJob.title}</h2>
                    <p className="text-xs text-text-muted mt-1">
                      {selectedJob.parsed_params?.salary_range || 'Salary not specified'} ·{' '}
                      {selectedJob.parsed_params?.years_of_experience || 0}+ years
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => cvFileInputRef.current?.click()}
                            className="btn-primary text-xs flex items-center gap-2"
                            disabled={cvUploading}>
                      {cvUploading ? (
                        <>
                          <span className="w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                          Processing CV...
                        </>
                      ) : (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                          Upload Candidate CV
                        </>
                      )}
                    </button>
                    <input ref={cvFileInputRef} type="file" accept=".pdf" className="hidden"
                           onChange={(e) => e.target.files?.[0] && handleCVUpload(e.target.files[0])} />
                  </div>
                </div>

                {/* CV Upload Result */}
                {cvResult && (
                  <div className={`card-surface p-5 mb-6 border-l-4 animate-scale-in ${
                    cvResult.error ? 'border-red-500/60' : 'border-accent-emerald/60'
                  }`}>
                    {cvResult.error ? (
                      <p className="text-sm text-red-400">{cvResult.error}</p>
                    ) : (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">🎯</span>
                          <h3 className="text-sm font-bold text-accent-emerald">
                            {cvResult.candidate_name} — Match Score: {cvResult.match_score}%
                          </h3>
                        </div>
                        <p className="text-xs text-text-secondary mb-3">
                          Interview initialized with {cvResult.total_questions} STAR questions.
                        </p>
                        <button
                          onClick={() => router.push(`/interview/${cvResult.interview_id}?app=${cvResult.application_id}`)}
                          className="btn-primary text-xs"
                        >
                          Start Interview →
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Candidates Table */}
                <div className="card-surface overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/[0.04]">
                    <h3 className="text-sm font-bold text-text-primary">
                      Candidates
                      <span className="ml-2 text-text-disabled font-normal">
                        {Array.isArray(candidates) ? candidates.length : 0}
                      </span>
                    </h3>
                  </div>

                  {!Array.isArray(candidates) || candidates.length === 0 ? (
                    <div className="p-12 text-center">
                      <p className="text-xs text-text-muted">No candidates yet. Upload a CV to get started.</p>
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
                        {candidates.map((c: any) => (
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
                            <td><ScoreRing score={Math.round(c.final_interest_score)} color="#A78BFA" /></td>
                            <td>
                              <span className={`badge ${
                                c.status === 'interviewing' ? 'badge-amber' :
                                c.status === 'scored' ? 'badge-emerald' : 'badge-purple'
                              }`}>
                                {c.status}
                              </span>
                            </td>
                            <td>
                              <button className="btn-ghost text-[10px] py-1.5 px-3">
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
    </div>
  );
}
