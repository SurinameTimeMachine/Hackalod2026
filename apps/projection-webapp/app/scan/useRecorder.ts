// MediaRecorder wrapper: tap to start, tap to stop, max 3 minutes. iOS
// records audio/mp4, Android/desktop audio/webm; the transcriber takes both.
// `level` (0–1) drives the wave while recording.
import { useCallback, useEffect, useRef, useState } from 'react';

export const MAX_SECONDS = 180;

const pickType = () =>
  ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) ?? '';

export function useRecorder(onDone: (audio: Blob) => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const cleanup = useRef<() => void>(() => {});
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  const stop = useCallback(() => {
    if (rec.current?.state === 'recording') rec.current.stop();
  }, []);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const type = pickType();
    const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    // Input level for the wave.
    const audio = new AudioContext();
    const analyser = audio.createAnalyser();
    analyser.fftSize = 256;
    audio.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    let raf = 0;
    const meter = () => {
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      setLevel(Math.min(1, peak / 64));
      raf = requestAnimationFrame(meter);
    };
    meter();

    const t0 = Date.now();
    const tick = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) r.stop();
    }, 250);

    cleanup.current = () => {
      clearInterval(tick);
      cancelAnimationFrame(raf);
      audio.close().catch(() => {});
      stream.getTracks().forEach((t) => t.stop());
      setLevel(0);
    };
    r.onstop = () => {
      cleanup.current();
      setRecording(false);
      rec.current = null;
      if (chunks.length) done.current(new Blob(chunks, { type: r.mimeType || type || 'audio/webm' }));
    };
    rec.current = r;
    setSeconds(0);
    r.start(1000);
    setRecording(true);
  }, []);

  useEffect(() => () => {
    if (rec.current) {
      rec.current.onstop = null;
      rec.current.stop();
    }
    cleanup.current();
  }, []);

  return { recording, seconds, level, start, stop };
}
