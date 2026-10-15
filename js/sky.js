(() => {
  "use strict";

  const root = document.documentElement;
  const anchor =
    document.querySelector("main.page") || document.querySelector("main.missing");
  if (!anchor || !window.matchMedia) return;

  const probe = document.createElement("canvas");
  if (!probe.getContext || !probe.getContext("2d")) return;

  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  const isDark = () => {
    const mode = root.dataset.theme;
    if (mode === "dark") return true;
    if (mode === "light") return false;
    return darkQuery.matches;
  };

  const TAU = Math.PI * 2;
  const SEED = 0x9e3a71;

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  /* The sky is the same sky on every visit, so the field is seeded, not random.
     Positions are laid out in CSS pixels and rebuilt on resize from the same
     seed, which keeps the constellations recognisable across window sizes. */
  const seeded = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const normal = (rnd) => {
    const u = Math.max(rnd(), 1e-7);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rnd());
  };

  /* Star counts grow roughly tenfold every two magnitudes, so sampling the
     cumulative count gives the real thing: a sky that is nearly all faint
     stars with a handful of bright anchors. */
  const MAG_MIN = 0.25;
  const MAG_MAX = 6.35;
  const MAG_SPAN = Math.pow(10, 0.6 * (MAG_MAX - MAG_MIN)) - 1;

  const sampleMagnitude = (rnd) =>
    MAG_MIN + Math.log10(rnd() * MAG_SPAN + 1) / 0.6;

  const fluxOf = (mag) => Math.pow(10, -0.4 * (mag - MAG_MAX));

  /* Planck locus, normalised to its peak channel so the colour carries hue
     only and the brightness stays with the alpha. */
  const blackbody = (kelvin) => {
    const t = kelvin / 100;
    let r;
    let g;
    let b;
    if (t <= 66) {
      r = 255;
      g = 99.4708025861 * Math.log(t) - 161.1195681661;
    } else {
      r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
      g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    }
    if (t >= 66) b = 255;
    else if (t <= 19) b = 0;
    else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    r = clamp(r, 0, 255);
    g = clamp(g, 0, 255);
    b = clamp(b, 0, 255);
    const peak = Math.max(r, g, b) || 1;
    return [(r / peak) * 255, (g / peak) * 255, (b / peak) * 255];
  };

  // Spectral mix of what the naked eye actually picks out of a dark sky.
  const sampleTemperature = (rnd) => {
    const u = rnd();
    if (u < 0.1) return 12000 + rnd() * 9000;
    if (u < 0.42) return 7300 + rnd() * 4400;
    if (u < 0.72) return 5600 + rnd() * 1700;
    if (u < 0.9) return 4400 + rnd() * 1200;
    return 3300 + rnd() * 1100;
  };

  // Rod vision is blue-shifted and nearly colourblind, so the faintest stars
  // wash out towards this instead of towards their own hue.
  const SCOTOPIC = [222, 232, 252];

  const mix = (from, to, amount) => [
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
  ];

  const quantise = (rgb) => [
    Math.min(255, Math.round(rgb[0] / 8) * 8),
    Math.min(255, Math.round(rgb[1] / 8) * 8),
    Math.min(255, Math.round(rgb[2] / 8) * 8),
  ];

  let container = null;
  let still = null;
  let live = null;
  let stillCtx = null;
  let liveCtx = null;
  let dpr = 1;
  let pixW = 0;
  let pixH = 0;
  let geoW = 0;
  let hold = 0;
  let fade = 0;
  let band = null;
  let stars = [];
  let meteors = [];
  let sprites = new Map();
  let raf = 0;
  let running = false;
  let animate = true;
  let built = false;
  let inView = true;
  let nextMeteor = Infinity;
  let hideTimer = 0;
  let resizeTimer = 0;
  let night = true;

  /* Density and brightness hold at full strength above the name, then ease
     away to nothing before the text starts. Baked into the geometry rather
     than applied as a mask so nothing is composited per frame. */
  const depthAt = (y) => {
    if (y <= hold) return 1;
    if (y >= fade) return 0;
    const t = (y - hold) / (fade - hold);
    return 1 - t * t * (3 - 2 * t);
  };

  /* ------------------------------------------------------------- rendering */

  /* `radiusCss` is the outer reach of the glow, not the core. The core stays
     tiny and the halo widens with brightness, which is how a point source
     behaves: a hard pinpoint wrapped in scattered light, never a soft disc. */
  const spriteFor = (radiusCss, rgb, spikes) => {
    const halo = Math.max(2, Math.round(radiusCss * dpr * 2) / 2);
    const key = `${halo}:${rgb[0]},${rgb[1]},${rgb[2]}${spikes ? ":s" : ""}`;
    const cached = sprites.get(key);
    if (cached) return cached;

    const reach = spikes ? halo * 1.9 : halo;
    const size = Math.ceil(reach * 2) + 2;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const g = canvas.getContext("2d");
    const m = size / 2;
    // A point source saturates its core towards white; the hue survives in
    // the glow around it, which is where the eye reads a star's colour.
    const core = mix(rgb, [255, 255, 255], 0.6);
    const paint = (c, a) =>
      `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${a})`;

    const glow = g.createRadialGradient(m, m, 0, m, m, halo);
    glow.addColorStop(0, paint(core, 1));
    glow.addColorStop(0.06, paint(core, 0.97));
    glow.addColorStop(0.13, paint(core, 0.78));
    glow.addColorStop(0.21, paint(mix(core, rgb, 0.6), 0.44));
    glow.addColorStop(0.32, paint(rgb, 0.19));
    glow.addColorStop(0.48, paint(rgb, 0.075));
    glow.addColorStop(0.68, paint(rgb, 0.025));
    glow.addColorStop(0.85, paint(rgb, 0.007));
    glow.addColorStop(1, paint(rgb, 0));
    g.fillStyle = glow;
    g.fillRect(0, 0, size, size);

    // Glare rays come from the observer's own eye, so the brightest few stars
    // share one orientation rather than each picking their own.
    if (spikes) {
      g.globalCompositeOperation = "lighter";
      g.translate(m, m);
      g.rotate(0.18);
      for (let i = 0; i < 6; i++) {
        const len = reach * (i % 2 === 0 ? 0.95 : 0.62);
        const ray = g.createLinearGradient(0, 0, len, 0);
        ray.addColorStop(0, paint(core, 0.13));
        ray.addColorStop(0.35, paint(rgb, 0.045));
        ray.addColorStop(1, paint(rgb, 0));
        g.fillStyle = ray;
        g.beginPath();
        g.moveTo(0, -halo * 0.09);
        g.lineTo(len, 0);
        g.lineTo(0, halo * 0.09);
        g.closePath();
        g.fill();
        g.rotate(Math.PI / 3);
      }
    }

    const sprite = { canvas, half: size / 2 };
    sprites.set(key, sprite);
    return sprite;
  };

  /* --------------------------------------------------------- the star field */

  const guardRects = () => {
    const offset = window.scrollY;
    const boxes = [];
    anchor
      .querySelectorAll("h1, .vitals, .missing-copy, .lede p")
      .forEach((el) => {
        const box = el.getBoundingClientRect();
        if (box.height < 1) return;
        boxes.push({
          left: box.left - 12,
          right: box.right + 12,
          top: box.top + offset - 10,
          bottom: box.bottom + offset + 10,
        });
      });
    return boxes;
  };

  const overType = (boxes, x, y) => {
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) return true;
    }
    return false;
  };

  const makeStar = (rnd, x, y, mag) => {
    const flux = fluxOf(Math.min(mag, MAG_MAX));
    const depth = depthAt(y);
    const alpha = clamp(0.42 * Math.pow(flux, 0.4), 0.27, 1) * depth;
    const radius = 1.15 + 0.8 * Math.pow(flux, 0.33);
    const hue = blackbody(sampleTemperature(rnd));
    const saturation = 0.42 + 0.58 * Math.pow(clamp(flux / 70, 0, 1), 0.4);
    const rgb = quantise(mix(SCOTOPIC, hue, saturation));

    /* Scintillation is atmospheric, so it grows with the air you look
       through: almost still overhead, restless down towards the horizon.
       Faint stars swing harder because they cross the visibility threshold. */
    const low = clamp(y / Math.max(1, fade), 0, 1);
    let amp = (0.13 + 0.24 * low) * (1 + 0.55 * (1 - clamp(flux / 70, 0, 1)));
    amp = Math.min(amp, 0.52);

    // Three incommensurate periods per star: never a pulse, never a loop.
    const period = (base) => TAU / (base * (0.6 + rnd() * 1.1));
    const star = {
      x: x * dpr,
      y: y * dpr,
      a: alpha,
      amp,
      f1: period(2.9),
      f2: period(5.3),
      f3: period(8.9),
      p1: rnd() * TAU,
      p2: rnd() * TAU,
      p3: rnd() * TAU,
      f4: 0,
      p4: 0,
      jf: 0,
      ja: 0,
      sprite: spriteFor(radius, rgb, flux > 45),
      warm: null,
      cool: null,
      cf: 0,
      cp: 0,
    };

    // A minority also flicker fast, the way a low bright star really does.
    if (rnd() < 0.2 + 0.3 * low) {
      star.f4 = TAU / (0.75 + rnd() * 0.9);
      star.p4 = rnd() * TAU;
    }

    // Hard-scintillating stars wander a fraction of a pixel as the air moves.
    if (amp > 0.3) {
      star.jf = TAU / (1.3 + rnd() * 1.2);
      star.ja = 0.35 * dpr;
    }

    // The brightest ones break into colour as they twinkle.
    if (flux > 40) {
      star.warm = spriteFor(radius, quantise(mix(rgb, [255, 208, 158], 0.45)), false);
      star.cool = spriteFor(radius, quantise(mix(rgb, [188, 214, 255], 0.45)), false);
      star.cf = TAU / (1.9 + rnd() * 2.4);
      star.cp = rnd() * TAU;
    }

    return star;
  };

  const buildStars = () => {
    const rnd = seeded(SEED);
    const boxes = guardRects();
    const effective = hold + (fade - hold) * 0.52;
    const target = clamp(Math.round((geoW * effective) / 900), 70, 760);
    const reach = Math.hypot(geoW, fade) * 1.6;
    const dirX = Math.cos(band.a);
    const dirY = Math.sin(band.a);

    // A couple of loose open clusters, the Pleiades of this sky.
    const clusters = [];
    for (let i = 0; i < 3; i++) {
      clusters.push({
        x: geoW * (0.12 + rnd() * 0.76),
        y: fade * (0.05 + rnd() * 0.4),
        r: 10 + rnd() * 16,
      });
    }

    const out = [];
    let attempts = 0;
    while (out.length < target && attempts < target * 60) {
      attempts++;
      let x;
      let y;
      let dimmer = 0;
      const roll = rnd();
      if (roll < 0.2) {
        // Unresolved crowd along the galactic band.
        const along = (rnd() - 0.5) * reach;
        const across = normal(rnd) * band.hw * 0.5;
        x = band.x + dirX * along - dirY * across;
        y = band.y + dirY * along + dirX * across;
        dimmer = 0.55;
      } else if (roll < 0.27) {
        const c = clusters[(rnd() * clusters.length) | 0];
        x = c.x + normal(rnd) * c.r;
        y = c.y + normal(rnd) * c.r * 0.8;
        dimmer = 0.85;
      } else {
        x = rnd() * geoW;
        y = rnd() * fade;
      }
      if (x < -8 || x > geoW + 8 || y < -8 || y >= fade) continue;

      const depth = depthAt(y);
      if (depth <= 0.012) continue;
      if (rnd() > Math.pow(depth, 0.55)) continue;

      let mag = Math.min(MAG_MAX, sampleMagnitude(rnd) + dimmer);
      // Nothing bright is allowed to sit on the type. Demoting rather than
      // moving keeps the field even, with no hole around the words.
      if (fluxOf(mag) > 12 && overType(boxes, x, y)) mag = 3.9 + rnd() * 1.6;

      out.push(makeStar(rnd, x, y, mag));

      // Doubles are everywhere in a real sky.
      if (fluxOf(mag) > 8 && rnd() < 0.16) {
        const angle = rnd() * TAU;
        const gap = 3 + rnd() * 6;
        const cx = x + Math.cos(angle) * gap;
        const cy = y + Math.sin(angle) * gap;
        if (cx > -8 && cx < geoW + 8 && cy > -8 && cy < fade) {
          out.push(makeStar(rnd, cx, cy, Math.min(MAG_MAX, mag + 1.3 + rnd() * 1.5)));
        }
      }
    }
    return out;
  };

  /* ------------------------------------------------ the still layer beneath */

  const taperSky = (g) => {
    g.globalCompositeOperation = "destination-in";
    const taper = g.createLinearGradient(0, 0, 0, fade);
    for (let i = 0; i <= 12; i++) {
      const y = (fade * i) / 12;
      taper.addColorStop(i / 12, `rgba(0, 0, 0, ${depthAt(y)})`);
    }
    g.fillStyle = taper;
    g.fillRect(0, 0, geoW, fade);
    g.globalCompositeOperation = "source-over";
  };

  const paintGrain = (g, rnd) => {
    const tile = document.createElement("canvas");
    tile.width = 128;
    tile.height = 128;
    const tileCtx = tile.getContext("2d");
    const noise = tileCtx.createImageData(128, 128);
    for (let i = 0; i < noise.data.length; i += 4) {
      noise.data[i] = 255;
      noise.data[i + 1] = 255;
      noise.data[i + 2] = 255;
      noise.data[i + 3] = (rnd() * 2.4) | 0;
    }
    tileCtx.putImageData(noise, 0, 0);
    g.globalCompositeOperation = "lighter";
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = g.createPattern(tile, "repeat");
    g.fillRect(0, 0, pixW, pixH);
    g.restore();
  };

  /* Daylight counterpart to the night field: a little Rayleigh blue at the
     zenith, dying into the paper before the type. No sun, no clouds. */
  const paintDay = () => {
    const g = stillCtx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, pixW, pixH);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rnd = seeded(SEED ^ 0x5c01);

    const air = g.createLinearGradient(0, 0, 0, fade);
    air.addColorStop(0, "rgba(132, 176, 216, 0.26)");
    air.addColorStop(0.32, "rgba(156, 190, 220, 0.13)");
    air.addColorStop(0.68, "rgba(198, 212, 224, 0.045)");
    air.addColorStop(1, "rgba(255, 255, 255, 0)");
    g.fillStyle = air;
    g.fillRect(0, 0, geoW, fade);

    g.globalCompositeOperation = "lighter";
    const lift = g.createRadialGradient(
      geoW * 0.62,
      fade * 0.06,
      0,
      geoW * 0.62,
      fade * 0.06,
      Math.max(geoW, fade) * 0.5
    );
    lift.addColorStop(0, "rgba(246, 251, 255, 0.06)");
    lift.addColorStop(0.4, "rgba(196, 214, 232, 0.03)");
    lift.addColorStop(1, "rgba(170, 196, 220, 0)");
    g.fillStyle = lift;
    g.fillRect(0, 0, geoW, fade);

    paintGrain(g, rnd);
    taperSky(g);
  };

  const paintStill = () => {
    if (!night) {
      paintDay();
      return;
    }

    const g = stillCtx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, pixW, pixH);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rnd = seeded(SEED ^ 0x2f19);

    // A real night sky is never quite black. Airglow keeps the top of it
    // barely, unnameably blue.
    const air = g.createLinearGradient(0, 0, 0, fade * 0.8);
    air.addColorStop(0, "rgba(32, 44, 80, 0.13)");
    air.addColorStop(0.45, "rgba(20, 28, 52, 0.05)");
    air.addColorStop(1, "rgba(12, 16, 30, 0)");
    g.fillStyle = air;
    g.fillRect(0, 0, geoW, fade);

    const along = () => (rnd() - 0.5) * Math.hypot(geoW, fade) * 1.25;
    const place = (distance, offset) => [
      band.x + Math.cos(band.a) * distance - Math.sin(band.a) * offset,
      band.y + Math.sin(band.a) * distance + Math.cos(band.a) * offset,
    ];

    // The galactic band, kept just above the threshold of "the black is not
    // flat here". Any brighter and it stops being sky and becomes fog.
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 26; i++) {
      const [px, py] = place(along(), normal(rnd) * band.hw * 0.42);
      const long = band.hw * (1.4 + rnd() * 2.4);
      const thick = band.hw * (0.22 + rnd() * 0.4);
      const a = 0.005 + rnd() * 0.009;
      g.save();
      g.translate(px, py);
      g.rotate(band.a + (rnd() - 0.5) * 0.3);
      g.scale(long, thick);
      const shade = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      shade.addColorStop(0, `rgba(208, 216, 240, ${a})`);
      shade.addColorStop(0.5, `rgba(190, 200, 232, ${a * 0.4})`);
      shade.addColorStop(1, "rgba(170, 184, 220, 0)");
      g.fillStyle = shade;
      g.fillRect(-1, -1, 2, 2);
      g.restore();
    }

    // Most of the band's substance is grain, not glow: stars too faint to
    // resolve individually. Static, because at this level nothing reads as
    // twinkling anyway.
    for (let i = 0; i < 1200; i++) {
      const [px, py] = place(along(), normal(rnd) * band.hw * 0.72);
      if (px < -4 || px > geoW + 4 || py < -4 || py > fade) continue;
      const r = 0.32 + rnd() * 0.42;
      const a = (0.04 + Math.pow(rnd(), 2.2) * 0.15) * depthAt(py);
      const grain = g.createRadialGradient(px, py, 0, px, py, r * 3);
      grain.addColorStop(0, `rgba(228, 234, 250, ${a})`);
      grain.addColorStop(0.34, `rgba(212, 222, 244, ${a * 0.34})`);
      grain.addColorStop(1, "rgba(198, 210, 238, 0)");
      g.fillStyle = grain;
      g.beginPath();
      g.arc(px, py, r * 3, 0, TAU);
      g.fill();
    }

    // Dust lanes cut the band apart; without them it reads as a smear.
    g.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 18; i++) {
      const [px, py] = place(along(), normal(rnd) * band.hw * 0.4);
      g.save();
      g.translate(px, py);
      g.rotate(band.a + (rnd() - 0.5) * 0.5);
      g.scale(band.hw * (0.8 + rnd() * 1.9), band.hw * (0.1 + rnd() * 0.26));
      const cut = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      cut.addColorStop(0, `rgba(0, 0, 0, ${0.45 + rnd() * 0.4})`);
      cut.addColorStop(1, "rgba(0, 0, 0, 0)");
      g.fillStyle = cut;
      g.fillRect(-1, -1, 2, 2);
      g.restore();
    }

    /* Eight-bit output quantises gradients this faint into visible steps, so
       the layer gets a one-to-two level dither at device resolution. It reads
       as sky grain rather than as noise, and the banding disappears. */
    paintGrain(g, rnd);

    // Same falloff the stars get, so the two layers die together.
    taperSky(g);
  };

  /* ------------------------------------------------------------- meteors */

  const spawnMeteor = (now) => {
    const rnd = Math.random;
    const right = rnd() < 0.5;
    const pitch = 0.26 + rnd() * 0.46;
    const length = geoW * (0.3 + rnd() * 0.5);
    const speed = 0.55 + rnd() * 1.15;
    const rare = rnd() < 0.06;
    const peak = rare ? 0.85 + rnd() * 0.15 : 0.3 + Math.pow(rnd(), 1.7) * 0.4;
    const tone = rnd();
    meteors.push({
      x0: geoW * (right ? rnd() * 0.5 - 0.06 : 0.56 + rnd() * 0.5),
      y0: fade * (rnd() * 0.32 - 0.05),
      dx: (right ? 1 : -1) * Math.cos(pitch),
      dy: Math.sin(pitch),
      len: length,
      dur: length / speed,
      t0: now,
      peak,
      hw: 0.45 + peak * 0.95,
      trail: 0.16 + rnd() * 0.22,
      tint:
        tone < 0.58
          ? [255, 247, 233]
          : tone < 0.86
            ? [226, 238, 255]
            : [223, 255, 234],
      flare: rnd() < 0.16 ? 0.62 + rnd() * 0.2 : 0,
    });
  };

  const drawMeteor = (g, m, now) => {
    const p = (now - m.t0) / m.dur;
    if (p >= 1) return false;
    if (p < 0) return true;

    const hx = m.x0 + m.dx * m.len * p;
    const hy = m.y0 + m.dy * m.len * p;
    const tail = m.len * Math.min(p, m.trail);
    const tx = hx - m.dx * tail;
    const ty = hy - m.dy * tail;
    const tailDepth = depthAt(ty);
    if (tailDepth <= 0.005) return false;

    // Brightens as it burns in, then fades; a few end in a terminal flare.
    let env = Math.pow(Math.sin(Math.PI * p), 0.75);
    if (m.flare) {
      const d = (p - m.flare) / 0.05;
      env *= 1 + 0.9 * Math.exp(-d * d);
    }
    const a = Math.min(1, env * m.peak);
    if (a <= 0.01) return true;

    const headDepth = depthAt(hy);
    const c = m.tint;
    const nx = -m.dy;
    const ny = m.dx;
    g.globalAlpha = a;

    // The train tapers to nothing behind the head, and both ends respect the
    // same vertical falloff, so a meteor dissolves as it drops.
    const streak = (halfWidth, scale) => {
      const grad = g.createLinearGradient(tx, ty, hx, hy);
      grad.addColorStop(0, `rgba(${c[0]}, ${c[1]}, ${c[2]}, 0)`);
      grad.addColorStop(
        0.55,
        `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${0.1 * scale * tailDepth})`
      );
      grad.addColorStop(
        0.88,
        `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${0.55 * scale * headDepth})`
      );
      grad.addColorStop(1, `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${scale * headDepth})`);
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(tx, ty);
      g.lineTo(hx + nx * halfWidth, hy + ny * halfWidth);
      g.lineTo(hx + m.dx * halfWidth * 1.3, hy + m.dy * halfWidth * 1.3);
      g.lineTo(hx - nx * halfWidth, hy - ny * halfWidth);
      g.closePath();
      g.fill();
    };

    streak(m.hw * 5, 0.16);
    streak(m.hw, 1);

    const glow = m.hw * 3.4;
    const head = g.createRadialGradient(hx, hy, 0, hx, hy, glow);
    head.addColorStop(0, `rgba(255, 255, 255, ${0.95 * headDepth})`);
    head.addColorStop(0.25, `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${0.5 * headDepth})`);
    head.addColorStop(1, `rgba(${c[0]}, ${c[1]}, ${c[2]}, 0)`);
    g.fillStyle = head;
    g.beginPath();
    g.arc(hx, hy, glow, 0, TAU);
    g.fill();
    return true;
  };

  /* ---------------------------------------------------------------- frames */

  const frame = (now) => {
    raf = 0;
    const g = liveCtx;
    const t = now / 1000;
    g.clearRect(0, 0, pixW, pixH);
    g.globalCompositeOperation = "lighter";

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      let a = s.a;
      let ox = 0;
      let oy = 0;
      if (animate) {
        let w =
          Math.sin(t * s.f1 + s.p1) * 0.54 +
          Math.sin(t * s.f2 + s.p2) * 0.31 +
          Math.sin(t * s.f3 + s.p3) * 0.15;
        if (s.f4) w += Math.sin(t * s.f4 + s.p4) * 0.2;
        a = s.a * (1 + s.amp * w);
        if (s.ja) {
          ox = Math.sin(t * s.jf + s.p1) * s.ja;
          oy = Math.cos(t * s.jf * 0.83 + s.p2) * s.ja;
        }
      }
      if (a <= 0.012) continue;
      if (a > 1) a = 1;
      const x = s.x + ox;
      const y = s.y + oy;
      g.globalAlpha = a;
      g.drawImage(s.sprite.canvas, x - s.sprite.half, y - s.sprite.half);
      if (s.warm && animate) {
        const c = Math.sin(t * s.cf + s.cp);
        const side = c > 0 ? s.warm : s.cool;
        g.globalAlpha = a * 0.17 * Math.abs(c);
        g.drawImage(side.canvas, x - side.half, y - side.half);
      }
    }

    if (animate) {
      if (now >= nextMeteor) {
        spawnMeteor(now);
        nextMeteor = now + 2500 + Math.random() * 4500;
      }
      if (meteors.length) {
        g.save();
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        meteors = meteors.filter((m) => drawMeteor(g, m, now));
        g.restore();
      }
    }

    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";

    if (running && animate) raf = requestAnimationFrame(frame);
    else running = false;
  };

  /* -------------------------------------------------------------- lifecycle */

  const create = () => {
    if (container) return;
    container = document.createElement("div");
    container.className = "sky";
    container.setAttribute("aria-hidden", "true");
    still = document.createElement("canvas");
    live = document.createElement("canvas");
    container.append(still, live);
    anchor.before(container);
    stillCtx = still.getContext("2d");
    liveCtx = live.getContext("2d");

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        (entries) => {
          inView = entries.some((entry) => entry.isIntersecting);
          if (inView && isDark()) start();
          else stop();
        },
        { rootMargin: "160px" }
      ).observe(container);
    }
  };

  const build = () => {
    const title = anchor.querySelector("h1");
    if (!title) return false;
    const box = title.getBoundingClientRect();
    if (box.height < 1) return false;

    const vh = window.innerHeight || root.clientHeight || 800;
    const width = container.clientWidth || root.clientWidth || window.innerWidth;
    if (width < 1) return false;
    const nextHold = Math.max(48, window.scrollY + box.top - 22);
    const nextFade = Math.max(
      nextHold + 120,
      Math.min(window.scrollY + box.bottom + Math.max(vh * 0.2, 150), vh * 0.94)
    );

    const nextNight = isDark();
    if (
      built &&
      nextNight === night &&
      Math.abs(width - geoW) < 2 &&
      Math.abs(nextFade - fade) < 2
    ) {
      return true;
    }

    geoW = width;
    hold = nextHold;
    fade = nextFade;
    night = nextNight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    pixW = Math.max(1, Math.round(geoW * dpr));
    pixH = Math.max(1, Math.round(fade * dpr));
    container.style.height = `${Math.round(fade)}px`;
    still.width = pixW;
    still.height = pixH;
    live.width = pixW;
    live.height = pixH;

    // The band sits high and rises slightly to the right, clear of the text.
    band = {
      x: geoW * 0.5,
      y: fade * 0.3,
      a: -0.18,
      hw: Math.max(42, fade * 0.2),
    };

    sprites = new Map();
    meteors = [];
    stars = night ? buildStars() : [];
    paintStill();
    built = true;
    return true;
  };

  const start = () => {
    if (running || !built || !inView || document.hidden || !night) return;
    running = true;
    animate = !motionQuery.matches;
    nextMeteor = performance.now() + 600 + Math.random() * 1400;
    raf = requestAnimationFrame(frame);
  };

  const stop = () => {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const sync = () => {
    create();
    window.clearTimeout(hideTimer);
    container.hidden = false;
    if (!build()) return;
    requestAnimationFrame(() => {
      container.classList.add("is-lit");
    });
    if (night) start();
    else {
      stop();
      if (liveCtx) {
        liveCtx.setTransform(1, 0, 0, 1, 0, 0);
        liveCtx.clearRect(0, 0, pixW, pixH);
      }
    }
  };

  const relayout = () => {
    if (!container) return;
    stop();
    sync();
  };

  new MutationObserver(sync).observe(root, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  darkQuery.addEventListener("change", sync);
  motionQuery.addEventListener("change", () => {
    stop();
    sync();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });

  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(relayout, 180);
  });
  window.addEventListener("orientationchange", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(relayout, 220);
  });

  document.fonts?.ready.then(relayout);

  sync();
})();
