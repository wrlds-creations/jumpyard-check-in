export type SafetyPlaybackState = {
  phase: 'idle' | 'loading' | 'playing' | 'paused' | 'error' | 'done';
  progress: number;
};

export const SAFETY_VIDEO_TIMEOUT_MS = 12_000;

type Timers = Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'>;

// Media events, not a requested play(), decide what the guest sees. Each retry
// owns its promise and watchdog; old callbacks cannot finish or fail a new run.
export function createSafetyPlayback(
  video: HTMLVideoElement,
  onChange: (state: SafetyPlaybackState) => void,
  timers: Timers = globalThis,
) {
  let state: SafetyPlaybackState = { phase: 'idle', progress: 0 };
  let disposed = false;
  let active = false;
  let started = false;
  let attempt = 0;
  let lastTime = 0;
  let watchdog: ReturnType<typeof setTimeout> | undefined;

  function update(phase: SafetyPlaybackState['phase'], progress = state.progress) {
    if (disposed) return;
    state = { phase, progress };
    onChange(state);
  }

  function clearWatchdog() {
    if (watchdog !== undefined) timers.clearTimeout(watchdog);
    watchdog = undefined;
  }

  function fail() {
    if (disposed || !active) return;
    active = false;
    attempt += 1;
    clearWatchdog();
    update('error');
    video.pause();
  }

  function watchProgress() {
    clearWatchdog();
    watchdog = timers.setTimeout(fail, SAFETY_VIDEO_TIMEOUT_MS);
  }

  function playing() {
    if (disposed) return;
    if (!active) { video.pause(); return; }
    if (video.paused || video.readyState < 3) return;
    started = true;
    update('playing');
    if (watchdog === undefined) watchProgress();
  }

  function progress() {
    if (!active || video.paused || video.currentTime <= lastTime) return;
    lastTime = video.currentTime;
    started = true;
    const percent = Number.isFinite(video.duration) && video.duration > 0
      ? Math.min(99, (video.currentTime / video.duration) * 100) : 0;
    update('playing', percent);
    watchProgress();
  }

  function waiting() {
    if (!active) return;
    update('loading');
    // Repeated waiting/stalled events must not extend the no-progress deadline.
    if (watchdog === undefined) watchProgress();
  }

  function stalled() {
    // A network stall may occur while buffered frames are still playing.
    if (video.readyState < 3) waiting();
  }

  function paused() {
    if (!active || video.ended) return;
    active = false;
    attempt += 1;
    clearWatchdog();
    update('paused');
  }

  function ended() {
    if (!active || !started || !video.ended || !Number.isFinite(video.duration)
      || video.duration <= 0 || video.currentTime < video.duration - 0.1) return;
    active = false;
    attempt += 1;
    clearWatchdog();
    update('done', 100);
  }

  function mediaError() {
    if (video.error) fail();
  }

  const listeners = { playing, timeupdate: progress, waiting, stalled, pause: paused, ended, error: mediaError };
  for (const [name, handler] of Object.entries(listeners)) video.addEventListener(name, handler);

  return {
    start({ automatic = false }: { automatic?: boolean } = {}) {
      if (disposed || active) return;
      const resume = state.phase === 'paused' && !video.error;
      const reload = state.phase === 'error' || Boolean(video.error);
      const ownedAttempt = ++attempt;
      active = true;
      if (!resume) {
        started = false;
        lastTime = 0;
      }
      update('loading', resume ? state.progress : 0);
      watchProgress();
      const playFailed = (error: unknown) => {
        if (ownedAttempt !== attempt || disposed) return;
        if (automatic && error instanceof Error && error.name === 'NotAllowedError') {
          // #530: even a muted start can be refused (an iPhone in Low Power Mode). Nothing has
          // played, so the poster's play button starts the film with a tap, instead of treating
          // permission as broken media.
          active = false;
          attempt += 1;
          clearWatchdog();
          update('idle', 0);
          video.pause();
        } else {
          fail();
        }
      };
      try {
        if (reload) video.load();
        if (!resume) video.currentTime = 0;
        // #530: the film's audio track is silent (Love: "Det finns ingen ljud på videon"), so it
        // always plays muted, which lets every browser start it without a tap.
        video.muted = true;
        Promise.resolve(video.play()).catch(playFailed);
      } catch (error) {
        playFailed(error);
      }
    },
    dispose() {
      disposed = true;
      active = false;
      attempt += 1;
      clearWatchdog();
      for (const [name, handler] of Object.entries(listeners)) video.removeEventListener(name, handler);
      video.pause();
    },
  };
}
