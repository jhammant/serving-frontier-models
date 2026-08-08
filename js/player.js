/* ============================================================
   player.js — YouTube IFrame API wrapper.

   Owns playback state and broadcasts a tick so the rest of the
   page (Follow stage, TOC, scrubber) can stay in step. Degrades
   to timestamp deep-links if the iframe API never arrives.
   ============================================================ */

const Player = (() => {
  const VIDEO_ID = 'xmkSf5IS-zw';
  const listeners = [];
  let yt = null, ready = false, playing = false, timer = null, cur = 0, duration = 8020;

  function emit() {
    for (const fn of listeners) { try { fn(cur, playing, ready); } catch (e) { console.error(e); } }
  }

  function startTicking() {
    stopTicking();
    timer = setInterval(() => {
      if (!yt || !yt.getCurrentTime) return;
      const t = yt.getCurrentTime();
      if (typeof t === 'number' && Math.abs(t - cur) > 0.05) { cur = t; emit(); }
    }, 250);
  }
  function stopTicking() { if (timer) { clearInterval(timer); timer = null; } }

  // The API script calls this global when it loads.
  window.onYouTubeIframeAPIReady = function () {
    yt = new YT.Player('player', {
      videoId: VIDEO_ID,
      playerVars: {
        rel: 0, modestbranding: 1, playsinline: 1,
        origin: location.origin, enablejsapi: 1,
      },
      events: {
        onReady(e) {
          ready = true;
          const d = e.target.getDuration();
          if (d > 0) duration = d;
          const fb = document.getElementById('playerFallback');
          if (fb) fb.remove();
          emit();
        },
        onStateChange(e) {
          playing = e.data === YT.PlayerState.PLAYING;
          if (playing) startTicking(); else stopTicking();
          if (yt.getCurrentTime) cur = yt.getCurrentTime();
          emit();
        },
        onError() {
          const fb = document.getElementById('playerFallback');
          if (fb) fb.innerHTML = '<p><b>The embedded player was blocked.</b></p>'
            + '<p class="muted">Timestamp buttons will open YouTube in a new tab instead.</p>';
        },
      },
    });
  };

  // If the API never loads (offline, blocked), fall back gracefully.
  setTimeout(() => {
    if (!ready) {
      const fb = document.getElementById('playerFallback');
      if (fb && /Loading the video/.test(fb.textContent)) {
        fb.innerHTML = '<p><b>Player unavailable offline.</b></p>'
          + '<p class="muted">Everything else works. Timestamp buttons will open '
          + '<a href="https://www.youtube.com/watch?v=' + VIDEO_ID + '" target="_blank" rel="noopener">YouTube</a> at the right moment.</p>';
      }
    }
  }, 6000);

  return {
    onTick(fn) { listeners.push(fn); fn(cur, playing, ready); },
    get ready() { return ready; },
    get playing() { return playing; },
    get time() { return cur; },
    get duration() { return duration; },

    seek(sec, autoplay = true) {
      sec = Math.max(0, Math.min(sec, duration - 1));
      if (ready && yt && yt.seekTo) {
        yt.seekTo(sec, true);
        if (autoplay) yt.playVideo();
        cur = sec;
        emit();
        return true;
      }
      window.open(`https://www.youtube.com/watch?v=${VIDEO_ID}&t=${Math.floor(sec)}s`, '_blank', 'noopener');
      return false;
    },

    toggle() {
      if (!ready || !yt) return;
      if (playing) yt.pauseVideo(); else yt.playVideo();
    },

    nudge(delta) { this.seek(cur + delta, playing); },
  };
})();

window.Player = Player;
