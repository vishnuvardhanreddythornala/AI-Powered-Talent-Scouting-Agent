'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

type InterviewState = 'LOADING' | 'MIC_CHECK' | 'PREPARING' | 'RECORDING' | 'PROCESSING' | 'COMPLETE' | 'ERROR';

/* ═══════════════════════════════════════════════════
   Circular Timer Component
   ═══════════════════════════════════════════════════ */
function CircularTimer({ seconds, total, color, label }: {
  seconds: number; total: number; color: string; label: string;
}) {
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (seconds / total) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="140" height="140" className="-rotate-90">
        <circle cx="70" cy="70" r={radius} fill="none"
                stroke="rgba(255,255,255,0.05)" strokeWidth="5" />
        <circle cx="70" cy="70" r={radius} fill="none"
                stroke={color} strokeWidth="5" strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={offset}
                style={{ transition: 'stroke-dashoffset 0.95s linear' }} />
      </svg>
      <div className="absolute text-center">
        <p className="text-3xl font-bold tabular-nums" style={{ color }}>{seconds}</p>
        <p className="text-[10px] uppercase tracking-widest text-text-muted mt-1">{label}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Confetti Component (pure CSS)
   ═══════════════════════════════════════════════════ */
function Confetti() {
  const colors = ['#34D399', '#A78BFA', '#F59E0B', '#60A5FA', '#F472B6', '#FBBF24', '#818CF8', '#FB923C'];
  const pieces = Array.from({ length: 80 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 3,
    duration: 2 + Math.random() * 3,
    color: colors[i % colors.length],
    size: 4 + Math.random() * 8,
    rotation: Math.random() * 360,
    type: Math.random() > 0.5 ? 'rect' : 'circle',
  }));

  return (
    <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden rounded-2xl">
      {pieces.map(p => (
        <div key={p.id}
             className="absolute animate-confetti-fall"
             style={{
               left: `${p.left}%`,
               top: '-10px',
               animationDelay: `${p.delay}s`,
               animationDuration: `${p.duration}s`,
             }}>
          <div style={{
            width: p.type === 'rect' ? p.size : p.size * 0.8,
            height: p.type === 'rect' ? p.size * 0.4 : p.size * 0.8,
            background: p.color,
            borderRadius: p.type === 'circle' ? '50%' : '2px',
            transform: `rotate(${p.rotation}deg)`,
          }} />
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   AI Interest Screening Page
   ═══════════════════════════════════════════════════ */
export default function InterviewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const interviewId = params.id as string;
  const applicationId = searchParams.get('app') || '';

  // ── Core State ─────────────────────────────────
  const [state, setState] = useState<InterviewState>('LOADING');
  const [interviewData, setInterviewData] = useState<any>(null);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [currentQNumber, setCurrentQNumber] = useState(1);
  const currentQNumberRef = useRef(1);
  useEffect(() => { currentQNumberRef.current = currentQNumber; }, [currentQNumber]);
  
  const [totalQuestions, setTotalQuestions] = useState(8);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const [scoringComplete, setScoringComplete] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // ── Session Timer ──────────────────────────────
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const sessionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ── Timer State ────────────────────────────────
  const [prepTimer, setPrepTimer] = useState(30);
  const [speakTimer, setSpeakTimer] = useState(30);
  const prepIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const speakIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ── Audio State ────────────────────────────────
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef('audio/webm');

  // ── Beep Audio ─────────────────────────────────
  const beepRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    // Generate a beep using Web Audio API
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.frequency.value = 880;
    gainNode.gain.value = 0;
    oscillator.start();
    beepRef.current = null; // We'll use audioCtx directly
    return () => { oscillator.stop(); audioCtx.close(); };
  }, []);

  const playBeep = useCallback(() => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.frequency.value = 880;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
      console.warn('Beep failed:', e);
    }
  }, []);

  // ── Detect Supported MIME Type ─────────────────
  useEffect(() => {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        mimeTypeRef.current = type;
        break;
      }
    }
  }, []);

  // ── AI Voice: Read Question Aloud ──────────────
  const speakQuestion = useCallback((text: string) => {
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // stop any previous speech
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        utterance.volume = 0.8;
        // Try to pick a natural-sounding voice
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en'))
          || voices.find(v => v.lang.startsWith('en') && v.name.includes('Female'))
          || voices.find(v => v.lang.startsWith('en'));
        if (preferred) utterance.voice = preferred;
        window.speechSynthesis.speak(utterance);
      }
    } catch (e) {
      console.warn('TTS failed:', e);
    }
  }, []);

  // Ensure voices are loaded
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices(); // trigger voice loading
      window.speechSynthesis.onvoiceschanged = () => {};
    }
  }, []);

  // ── Load Interview Data ────────────────────────
  useEffect(() => {
    if (!applicationId) return;

    fetch(`${API}/api/applications/${applicationId}/interview`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load interview');
        return res.json();
      })
      .then(data => {
        setInterviewData(data);
        setCurrentQuestion(data.current_question);
        setCurrentQNumber(data.current_q_number);
        setTotalQuestions(data.total_questions);

        if (data.status === 'completed') {
          setState('COMPLETE');
        } else {
          setState('MIC_CHECK');
        }
      })
      .catch(e => {
        setError(e.message);
        setState('ERROR');
      });
  }, [applicationId]);

  // ── Poll for Scoring Completion ────────────────
  useEffect(() => {
    if (state !== 'COMPLETE' || scoringComplete || !interviewId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/interview/${interviewId}/history`);
        if (res.ok) {
          const data = await res.json();
          const allScored = data.length > 0 && data.every((q: any) => q.candidate_answer === null || q.interest_score !== null);
          if (allScored) {
            setScoringComplete(true);
            setShowConfetti(true);
            setTimeout(() => setShowConfetti(false), 6000); // confetti for 6s
            clearInterval(interval);
          }
        }
      } catch (e) {
        // ignore network errors during polling
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [state, scoringComplete, interviewId]);

  // ── Request Microphone Permissions ─────────────
  const requestMicPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      setState('PREPARING');
      setPrepTimer(30);
      // Start session timer
      sessionIntervalRef.current = setInterval(() => {
        setSessionSeconds(prev => prev + 1);
      }, 1000);
      // Speak the first question
      if (currentQuestion) speakQuestion(currentQuestion);
    } catch (e) {
      setError('Microphone access is required to proceed with the AI screening.');
      setState('ERROR');
    }
  }, [currentQuestion, speakQuestion]);

  // ── PREPARING Timer ────────────────────────────
  useEffect(() => {
    if (state !== 'PREPARING') return;

    prepIntervalRef.current = setInterval(() => {
      setPrepTimer(prev => {
        if (prev <= 1) {
          clearInterval(prepIntervalRef.current!);
          // Transition to RECORDING
          playBeep();
          startRecording();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (prepIntervalRef.current) clearInterval(prepIntervalRef.current);
    };
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── RECORDING Timer ────────────────────────────
  useEffect(() => {
    if (state !== 'RECORDING') return;

    speakIntervalRef.current = setInterval(() => {
      setSpeakTimer(prev => {
        if (prev <= 1) {
          clearInterval(speakIntervalRef.current!);
          stopRecording();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (speakIntervalRef.current) clearInterval(speakIntervalRef.current);
    };
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Start Recording ────────────────────────────
  const activeRecorderRef = useRef<MediaRecorder | null>(null);

  const startRecording = useCallback(() => {
    // Detach and stop any existing recorder WITHOUT triggering submitAudio
    if (mediaRecorderRef.current) {
      const old = mediaRecorderRef.current;
      old.ondataavailable = null;
      old.onstop = null;
      if (old.state !== 'inactive') {
        try { old.stop(); } catch (e) { /* ignore */ }
      }
    }
    mediaRecorderRef.current = null;
    activeRecorderRef.current = null;

    // Use a fresh local array for THIS recording's chunks only
    const localChunks: Blob[] = [];
    audioChunksRef.current = localChunks;

    const stream = mediaStreamRef.current;
    if (!stream) {
      setError('Microphone stream lost. Please refresh and try again.');
      setState('ERROR');
      return;
    }

    try {
      const recorder = new MediaRecorder(stream, { mimeType: mimeTypeRef.current });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) localChunks.push(e.data);
      };
      recorder.onstop = () => {
        // Only submit if THIS recorder is still the active one
        if (activeRecorderRef.current !== recorder) return;
        const blob = new Blob(localChunks, { type: mimeTypeRef.current });
        submitAudio(blob);
      };
      // NO timeslice — produces a single clean WebM blob on stop
      recorder.start();
      mediaRecorderRef.current = recorder;
      activeRecorderRef.current = recorder;
      setSpeakTimer(30);
      setState('RECORDING');
    } catch (e: any) {
      setError(`Recording failed: ${e.message}`);
      setState('ERROR');
    }
  }, []);

  // ── Stop Recording ─────────────────────────────
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setState('PROCESSING');
  }, []);

  // ── Submit Audio to Backend ────────────────────
  const submitAudio = useCallback(async (blob: Blob) => {
    setState('PROCESSING');
    const formData = new FormData();

    // Determine file extension from MIME type
    let ext = '.webm';
    if (mimeTypeRef.current.includes('mp4')) ext = '.mp4';
    else if (mimeTypeRef.current.includes('ogg')) ext = '.ogg';

    formData.append('audio', blob, `answer${ext}`);
    formData.append('q_number', String(currentQNumberRef.current));

    try {
      const res = await fetch(`${API}/api/interview/${interviewId}/submit-audio`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Audio submission failed');
      }

      const data = await res.json();
      setTranscript(data.transcript);

      if (data.is_complete) {
        setState('COMPLETE');
        // Stop session timer
        if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current);
        window.speechSynthesis?.cancel();
      } else {
        // Move to next question
        setCurrentQuestion(data.next_question);
        setCurrentQNumber(data.questions_completed + 1);
        setPrepTimer(30);
        setState('PREPARING');
        // AI speaks the next question
        speakQuestion(data.next_question);
      }
    } catch (e: any) {
      setError(e.message);
      setState('ERROR');
    }
  }, [interviewId]);

  // ── Cleanup on unmount ─────────────────────────
  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (sessionIntervalRef.current) clearInterval(sessionIntervalRef.current);
      window.speechSynthesis?.cancel();
    };
  }, []);

  // ═══════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-[0.02]"
             style={{ background: state === 'RECORDING'
               ? 'radial-gradient(circle, #EF4444, transparent)'
               : 'radial-gradient(circle, #34D399, transparent)' }} />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-8 py-4 border-b border-white/[0.04]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, #34D399, #2BC48E)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0B0B0F" strokeWidth="2.5"
                 strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="text-base font-bold tracking-tight text-text-primary">TalentScope</span>
          <span className="text-text-disabled mx-2">/</span>
          <span className="text-sm text-text-secondary">AI Interest Screening</span>
        </div>

        {/* Session Timer + Progress */}
        {interviewData && state !== 'LOADING' && state !== 'ERROR' && (
          <div className="flex items-center gap-4">
            {/* Session Timer */}
            {sessionSeconds > 0 && state !== 'COMPLETE' && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span className="text-xs text-text-muted font-mono tabular-nums">
                  {Math.floor(sessionSeconds / 60)}:{String(sessionSeconds % 60).padStart(2, '0')}
                </span>
                <span className="text-[10px] text-text-disabled">elapsed</span>
              </div>
            )}
            {/* Estimated Remaining */}
            {sessionSeconds > 0 && state !== 'COMPLETE' && (
              <span className="text-[10px] text-text-disabled hidden md:block">
                ~{Math.max(1, Math.ceil((totalQuestions - currentQNumber + 1) * 1))} min left
              </span>
            )}
            {/* Progress dots */}
            <div className="flex gap-1">
              {Array.from({ length: totalQuestions }, (_, i) => (
                <div key={i} className={`w-2 h-2 rounded-full transition-all ${
                  i < currentQNumber - 1 ? 'bg-accent-emerald' :
                  i === currentQNumber - 1 ? 'bg-accent-emerald animate-pulse' :
                  'bg-white/[0.08]'
                }`} />
              ))}
            </div>
            <span className="text-xs text-text-muted font-medium">
              {currentQNumber}/{totalQuestions}
            </span>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-2xl w-full">

          {/* ── LOADING ──────────────────────────── */}
          {state === 'LOADING' && (
            <div className="text-center animate-fade-in">
              <div className="w-12 h-12 border-4 border-white/10 border-t-accent-emerald rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-text-muted">Loading screening...</p>
            </div>
          )}

          {/* ── MIC CHECK ────────────────────────── */}
          {state === 'MIC_CHECK' && (
            <div className="card-surface p-10 text-center animate-scale-in">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
                   style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.15)' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="1.8"
                     strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                  <path d="M19 10v2a7 7 0 01-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </div>

              <h2 className="text-xl font-bold text-text-primary mb-2">
                Welcome, {interviewData?.candidate_name || 'Candidate'}
              </h2>
              <p className="text-sm text-text-muted mb-2">
                Position: <span className="text-text-secondary font-medium">{interviewData?.job_title}</span>
              </p>
              <p className="text-xs text-text-muted mb-8 max-w-md mx-auto leading-relaxed">
                This quick AI-powered screening has {totalQuestions} conversational questions.
                You&apos;ll have <strong className="text-text-secondary">30 seconds to read</strong> and{' '}
                <strong className="text-text-secondary">30 seconds to respond</strong> to each question via your microphone.
              </p>

              <button onClick={requestMicPermission} className="btn-primary text-sm flex items-center gap-2 mx-auto">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                     strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                  <path d="M19 10v2a7 7 0 01-14 0v-2" />
                </svg>
                Enable Microphone & Begin
              </button>
            </div>
          )}

          {/* ── PREPARING ────────────────────────── */}
          {state === 'PREPARING' && (
            <div className="text-center animate-fade-in">
              {/* Question Card */}
              <div className="card-surface p-8 mb-8 text-left"
                   style={{ borderLeft: '3px solid rgba(52,211,153,0.4)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <span className="badge badge-emerald">Question {currentQNumber}</span>
                  <span className="text-[10px] text-text-disabled">of {totalQuestions}</span>
                </div>
                <p className="text-base text-text-primary leading-relaxed font-medium">
                  {currentQuestion}
                </p>
              </div>

              {/* Timer */}
              <CircularTimer seconds={prepTimer} total={30} color="#34D399" label="Read" />

              {/* Status */}
              <div className="mt-6 flex items-center justify-center gap-2">
                <div className="w-2 h-2 rounded-full bg-accent-emerald animate-pulse" />
                <p className="text-xs text-text-muted">
                  Read the question and think about your response. Recording starts automatically.
                </p>
              </div>

              {/* Mic Status */}
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg"
                   style={{ background: 'rgba(255,255,255,0.03)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2"
                     strokeLinecap="round" strokeLinejoin="round">
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
                  <path d="M17 16.95A7 7 0 015 12v-2m14 0v2c0 .93-.18 1.82-.5 2.64" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
                <span className="text-[10px] text-text-disabled">Microphone paused</span>
              </div>
            </div>
          )}

          {/* ── RECORDING ────────────────────────── */}
          {state === 'RECORDING' && (
            <div className="text-center animate-fade-in">
              {/* Question (collapsed) */}
              <div className="card-surface p-5 mb-8 text-left" style={{ borderLeft: '3px solid rgba(239,68,68,0.4)' }}>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {currentQuestion}
                </p>
              </div>

              {/* Recording Timer */}
              <CircularTimer seconds={speakTimer} total={30} color="#EF4444" label="Speaking" />

              {/* Recording Indicator */}
              <div className="mt-6 flex items-center justify-center gap-3">
                <div className="w-3 h-3 rounded-full bg-red-500 recording-pulse" />
                <p className="text-sm font-semibold text-red-400">Recording your answer...</p>
              </div>

              {/* Mic Status */}
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg"
                   style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2"
                     strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                  <path d="M19 10v2a7 7 0 01-14 0v-2" />
                </svg>
                <span className="text-[10px] text-red-400 font-medium">Microphone active</span>
              </div>

              {/* Early Stop Button */}
              <div className="mt-6">
                <button onClick={stopRecording} className="btn-ghost text-xs border-red-500/20 text-red-400 hover:bg-red-500/5">
                  Finish Early
                </button>
              </div>
            </div>
          )}

          {/* ── PROCESSING ───────────────────────── */}
          {state === 'PROCESSING' && (
            <div className="text-center animate-fade-in">
              <div className="card-surface p-10">
                <div className="w-14 h-14 border-4 border-white/10 border-t-accent-purple rounded-full animate-spin mx-auto mb-6" />
                <h3 className="text-base font-bold text-text-primary mb-2">Processing your answer</h3>
                <p className="text-xs text-text-muted max-w-sm mx-auto leading-relaxed">
                  Processing your response and generating the next question...
                </p>

                {transcript && (
                  <div className="mt-6 p-4 rounded-xl text-left" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <p className="text-[10px] uppercase tracking-wider text-text-disabled mb-2">Your transcript</p>
                    <p className="text-xs text-text-secondary leading-relaxed">{transcript}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── COMPLETE ─────────────────────────── */}
          {state === 'COMPLETE' && (
            <div className="text-center animate-scale-in">
              <div className="card-surface p-10 relative overflow-hidden">
                {/* Confetti overlay inside the card */}
                {showConfetti && <Confetti />}

                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 relative z-10"
                     style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.15)' }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2"
                       strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>

                <h2 className="text-xl font-bold text-text-primary mb-2">Screening Complete!</h2>
                <p className="text-sm text-text-muted mb-2 max-w-md mx-auto leading-relaxed">
                  Thank you for your time! Your responses have been recorded and will be shared
                  with the recruiting team. Your Interest Score is being calculated.
                </p>

                {/* Session Duration */}
                {sessionSeconds > 0 && (
                  <p className="text-[10px] text-text-disabled mb-6">
                    Session duration: {Math.floor(sessionSeconds / 60)}m {sessionSeconds % 60}s
                  </p>
                )}

                {scoringComplete ? (
                  <div className="flex flex-col items-center gap-6 mt-4">
                    <div className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl animate-scale-in"
                         style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span className="text-sm text-accent-emerald font-semibold">Scoring Complete!</span>
                    </div>
                    
                    <button onClick={() => window.location.href = '/'} className="btn-primary text-sm px-8 py-3">
                      Return to Home
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-6 mt-4">
                    <div className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl"
                         style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)' }}>
                      <div className="w-2 h-2 rounded-full bg-accent-purple animate-pulse" />
                      <span className="text-xs text-accent-purple font-medium">Scoring in progress... (You may safely close this window)</span>
                    </div>
                    
                    <button onClick={() => window.location.href = '/'} className="btn-primary text-sm px-8 py-3 opacity-90 hover:opacity-100">
                      Return to Home
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── ERROR ────────────────────────────── */}
          {state === 'ERROR' && (
            <div className="text-center animate-scale-in">
              <div className="card-surface p-10 border-l-4 border-red-500/60">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
                     style={{ background: 'rgba(239,68,68,0.08)' }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="1.8"
                       strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-red-400 mb-2">Oops! Something went wrong</h2>
                <p className="text-sm text-text-muted mb-4 max-w-sm mx-auto">
                  We encountered an issue processing your request: {error}. Don't worry, you can try answering this question again.
                </p>
                <div className="flex gap-4 justify-center mt-6">
                  <button 
                    onClick={() => {
                      setError('');
                      setPrepTimer(30);
                      setState('PREPARING');
                      speakQuestion(currentQuestion);
                    }} 
                    className="btn-primary text-xs px-6 py-2.5"
                  >
                    Try Answering Again
                  </button>
                  <button onClick={() => window.location.reload()} className="btn-ghost text-xs px-6 py-2.5 border-white/10 hover:bg-white/5">
                    Hard Reload
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
