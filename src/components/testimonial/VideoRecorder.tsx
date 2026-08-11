import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Video as VideoIcon, Circle, Square, RotateCcw, Upload, AlertCircle } from 'lucide-react';

type RecorderState = 'idle' | 'requesting' | 'live' | 'recorded' | 'denied';

type VideoRecorderProps = {
  onVideoReady: (file: Blob) => void;
  onClear: () => void;
  // Lets the parent force a reset (e.g. after a successful submit) without
  // this component needing to know anything about submission state.
  resetKey?: number;
};

// Soft safety cap, not a stated requirement — keeps recordings well under
// the 100MB storage bucket limit without the user having to think about it.
const MAX_DURATION_SECONDS = 120;

export default function VideoRecorder({ onVideoReady, onClear, resetKey }: VideoRecorderProps) {
  const [state, setState] = useState<RecorderState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const videoLiveRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  // Full cleanup on unmount, and whenever the parent bumps resetKey
  // (post-submit reset).
  useEffect(() => {
    return () => {
      stopStream();
      stopTimer();
    };
  }, [stopStream, stopTimer]);

  useEffect(() => {
    if (resetKey === undefined) return;
    stopStream();
    stopTimer();
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setState('idle');
    setSeconds(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const stopRecording = useCallback(() => {
    stopTimer();
    recorderRef.current?.stop();
  }, [stopTimer]);

  const startTimer = () => {
    setSeconds(0);
    timerRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_DURATION_SECONDS) {
          stopRecording();
        }
        return s + 1;
      });
    }, 1000);
  };

  const startRecording = async () => {
    setState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoLiveRef.current) {
        videoLiveRef.current.srcObject = stream;
        await videoLiveRef.current.play().catch(() => {});
      }

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : '';

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setState('recorded');
        stopStream();
        onVideoReady(blob);
      };

      recorderRef.current = recorder;
      recorder.start();
      setState('live');
      startTimer();
    } catch (err) {
      console.error('Camera/mic permission error:', err);
      setState('denied');
    }
  };

  const reRecord = () => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setState('idle');
    setSeconds(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onClear();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setState('recorded');
    onVideoReady(file);
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="rounded-2xl border-2 border-dashed border-zinc-800 bg-zinc-950/60 p-5">
      {state === 'idle' && (
        <div className="flex flex-col items-center text-center gap-3 py-6">
          <div className="w-14 h-14 rounded-full bg-red-600/10 border border-red-600/30 flex items-center justify-center">
            <VideoIcon className="text-red-500" size={26} />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Record a Video Testimonial</p>
            <p className="text-zinc-500 text-xs mt-1">Tell us what you think about VSTRK — on camera</p>
          </div>
          <button
            type="button"
            onClick={startRecording}
            className="mt-2 bg-red-600 hover:bg-red-500 text-white h-12 px-8 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(220,38,38,0.3)]"
          >
            <Circle size={14} fill="currentColor" />
            Start Recording
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-white transition-colors inline-flex items-center gap-1.5"
          >
            <Upload size={12} />
            Or upload a video instead
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      )}

      {state === 'requesting' && (
        <div className="flex flex-col items-center justify-center gap-3 py-10">
          <div className="w-8 h-8 border-2 border-zinc-700 border-t-red-600 rounded-full animate-spin" />
          <p className="text-zinc-500 text-xs uppercase tracking-widest font-bold">
            Requesting camera access…
          </p>
        </div>
      )}

      {state === 'denied' && (
        <div className="flex flex-col items-center text-center gap-3 py-8">
          <AlertCircle className="text-amber-500" size={28} />
          <div>
            <p className="text-sm font-bold text-white">Camera access denied</p>
            <p className="text-zinc-500 text-xs mt-1">
              You can still upload a video testimonial from your device instead.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-white h-11 px-6 rounded-xl text-xs font-black uppercase tracking-widest transition-all inline-flex items-center gap-2"
          >
            <Upload size={14} />
            Upload a Video
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      )}

      {state === 'live' && (
        <div className="flex flex-col items-center gap-3">
          <div className="relative w-full rounded-xl overflow-hidden bg-black aspect-video">
            <video ref={videoLiveRef} muted playsInline className="w-full h-full object-cover" />
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur px-2.5 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-[10px] font-bold tabular-nums">{formatTime(seconds)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={stopRecording}
            className="bg-white text-zinc-950 h-12 px-8 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-zinc-200 transition-all flex items-center gap-2"
          >
            <Square size={14} fill="currentColor" />
            Stop Recording
          </button>
        </div>
      )}

      {state === 'recorded' && previewUrl && (
        <div className="flex flex-col items-center gap-3">
          <div className="w-full rounded-xl overflow-hidden bg-black aspect-video">
            <video src={previewUrl} controls playsInline className="w-full h-full object-contain" />
          </div>
          <button
            type="button"
            onClick={reRecord}
            className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-white transition-colors inline-flex items-center gap-1.5"
          >
            <RotateCcw size={12} />
            Re-record / choose a different video
          </button>
        </div>
      )}
    </div>
  );
}
