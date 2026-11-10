import { useCallback, useEffect, useState } from 'react';

const replayDuration = 10000;

export function playbackFrames(segments, timestamps) {
  const frames = [];
  let elapsed = 0;
  segments?.forEach((segment, part) => {
    const times = timestamps?.[part];
    segment.forEach((position, index) => {
      if (index > 0) {
        const interval = times?.[index] - times?.[index - 1];
        elapsed += Number.isFinite(interval) && interval > 0 ? interval : 1000;
      }
      frames.push({ position, at: times?.[index], elapsed, part, index });
    });
  });
  return frames;
}

export function useReplay(frames) {
  const [progress, setProgress] = useState(null);
  const [startedAt, setStartedAt] = useState(null);
  const total = frames.at(-1)?.elapsed ?? 0;
  const elapsed = progress * total;
  const index = progress === null ? -1 : frames.findLastIndex(item => item.elapsed <= elapsed);
  const frame = frames[index];
  const nextFrame = frames[index + 1];
  let position = frame?.position;
  if (frame && startedAt !== null && nextFrame?.part === frame.part &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const ratio = (elapsed - frame.elapsed) / (nextFrame.elapsed - frame.elapsed);
    const [lat, lon] = position;
    const [nextLat, nextLon] = nextFrame.position;
    const delta = ((nextLon - lon + 540) % 360) - 180;
    position = [lat + (nextLat - lat) * ratio, lon + delta * ratio];
  }
  const clear = useCallback(() => {
    setStartedAt(null);
    setProgress(null);
  }, []);

  useEffect(() => {
    if (startedAt === null) return;
    let frameId;
    function tick(now) {
      const next = Math.min(1, (now - startedAt) / replayDuration);
      setProgress(next);
      if (next === 1) setStartedAt(null);
      else frameId = requestAnimationFrame(tick);
    }
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [startedAt]);

  return {
    frame: frame ? { ...frame, position } : null, progress, playing: startedAt !== null, clear,
    toggle() {
      if (startedAt !== null) {
        setStartedAt(null);
        return;
      }
      const next = progress === 1 ? 0 : progress ?? 0;
      setProgress(next);
      setStartedAt(performance.now() - next * replayDuration);
    },
    seek(value) {
      setStartedAt(null);
      setProgress(value);
    }
  };
}
