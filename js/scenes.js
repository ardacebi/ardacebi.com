(() => {
  const entries = window.SiteGlimpses;
  if (!entries) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const cache = new Map();
  let desired = null;
  let revision = 0;
  let leaveTimer = 0;
  const host = document.createElement('div');
  host.className = 'scene-background';
  host.setAttribute('aria-hidden', 'true');
  document.body.prepend(host);

  const prepare = key => {
    const entry = entries[key];
    const isVideo = /\.(mp4|webm)(?:\?|$)/i.test(entry.src);
    const video = isVideo && !motion.matches;
    const cached = cache.get(key);
    if (cached?.video === video) return cached;
    if (cached) {
      clearTimeout(cached.pauseTimer);
      if (cached.video) {
        cached.media.pause();
        cached.media.removeAttribute('src');
        cached.media.load();
      }
      cached.layer.remove();
      cache.delete(key);
    }
    const layer = document.createElement('div');
    layer.className = 'scene';
    layer.dataset.scene = key;
    const media = video ? document.createElement('video') : new Image();
    media.className = 'scene-media';
    let ready;
    if (video) {
      media.muted = true;
      media.loop = true;
      media.playsInline = true;
      media.preload = 'auto';
      media.poster = entry.poster || '';
      ready = new Promise(resolve => {
        media.addEventListener('loadeddata', () => resolve(true), { once: true });
        media.addEventListener('error', () => resolve(false), { once: true });
      });
      media.src = entry.src;
      media.load();
    } else {
      media.alt = '';
      media.decoding = 'async';
      media.src = isVideo ? entry.poster : entry.src;
      ready = media.decode().then(() => true, () => false);
    }
    layer.append(media);
    host.append(layer);
    const item = { layer, media, video, ready, pauseTimer: 0 };
    cache.set(key, item);
    return item;
  };

  const fadeOut = except => {
    for (const [key, item] of cache) {
      if (key === except) continue;
      item.layer.classList.remove('is-visible');
      clearTimeout(item.pauseTimer);
      if (item.video) item.pauseTimer = setTimeout(() => item.media.pause(), 950);
    }
  };

  const show = async key => {
    clearTimeout(leaveTimer);
    desired = key;
    const request = ++revision;
    const item = prepare(key);
    const loaded = await item.ready;
    if (request !== revision || desired !== key) return;
    if (!loaded) { fadeOut(); return; }
    clearTimeout(item.pauseTimer);
    // Keep reduced-motion previews static, including the film poster.
    if (item.video && !motion.matches) {
      try { await item.media.play(); } catch { /* The decoded first frame remains visible. */ }
      if (request !== revision || desired !== key) { item.media.pause(); return; }
    }
    fadeOut(key);
    item.layer.offsetHeight;
    item.layer.classList.add('is-visible');
  };

  const hide = () => {
    desired = null;
    revision++;
    fadeOut();
  };

  document.querySelectorAll('[data-glimpse]').forEach(trigger => {
    const key = trigger.dataset.glimpse;
    if (!entries[key] || entries[key].fit === 'logo') return;
    trigger.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse') show(key);
    });
    trigger.addEventListener('pointerleave', () => {
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(hide, 140);
    });
    trigger.addEventListener('focus', () => show(key));
    trigger.addEventListener('blur', hide);
    if (trigger.tagName === 'SPAN') trigger.tabIndex = 0;
  });
  motion.addEventListener('change', () => {
    for (const item of cache.values()) if (item.video) item.media.pause();
    if (desired) show(desired);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearTimeout(leaveTimer); hide(); }
  });
  // Warm only still photos for hover-capable devices with an unconstrained connection.
  // Video and touch previews load on demand; reduced motion uses the video poster.
  const connection = navigator.connection;
  const canWarm = matchMedia('(hover: hover) and (pointer: fine)').matches &&
    !connection?.saveData && !/^(slow-)?2g$/.test(connection?.effectiveType || '');
  const warm = () => {
    if (document.hidden) return;
    Object.keys(entries).forEach(key => {
      if (entries[key].fit !== 'logo' && !/\.(mp4|webm)(?:\?|$)/i.test(entries[key].src)) prepare(key);
    });
  };
  if (canWarm) {
    if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 1800 });
    else setTimeout(warm, 600);
  }
})();
