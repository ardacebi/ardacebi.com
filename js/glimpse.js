(() => {
  const trigger = document.querySelector('[data-glimpse="designble"]');
  const entry = window.SiteGlimpses?.designble;
  if (!trigger || !entry) return;
  const MIN_SCALE = 0.58;
  const layer = document.createElement("div");
  layer.className = "glimpse-layer is-logo";
  layer.setAttribute("aria-hidden", "true");
  const frame = document.createElement("div");
  frame.className = "glimpse-frame";
  const image = new Image();
  image.className = "glimpse-image";
  image.alt = "";
  image.src = entry.src;
  frame.append(image);
  layer.append(frame);
  document.body.append(layer);
  const ready = image.decode().then(() => true, () => false);
  let hovered = false;
  let generation = 0;
  const pinned = () => trigger.getAttribute("aria-expanded") === "true";
  const inkBox = (el) => {
    if (!el) return null;
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = range.getClientRects();
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    let found = false;
    for (const rect of rects) {
      if (rect.width < 0.5 || rect.height < 0.5) continue;
      found = true;
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
    }
    if (!found) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 0.5 || rect.height < 0.5) return null;
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      };
    }
    return { left, top, right, bottom };
  };

  const unionRight = (nodes) => {
    let right = 0;
    nodes.forEach((el) => {
      const box = inkBox(el);
      if (box) right = Math.max(right, box.right);
    });
    return right;
  };

  const setSize = (width, height) => {
    layer.style.setProperty("--glimpse-w", `${Math.round(width)}px`);
    layer.style.setProperty("--glimpse-h", `${Math.round(height)}px`);
  };

  const place = (snap) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 16;
    layer.style.removeProperty("--glimpse-w");
    layer.style.removeProperty("--glimpse-h");
    const baseW = layer.offsetWidth || 264;
    const baseH = layer.offsetHeight || 176;
    const name = document.querySelector(".page h1");
    const ledeStart = document.querySelector(".page .lede p");
    const nameBox = inkBox(name);
    const ledeBox = ledeStart?.getBoundingClientRect();
    const pageBox = document.querySelector(".page")?.getBoundingClientRect();
    if (!nameBox || !ledeBox) return false;

    const stackRight = unionRight(
      document.querySelectorAll(".page h1, .page .contact, .page .links, .page .meta")
    );
    const sentenceRight = unionRight(document.querySelectorAll(".page .lede p")) || pageBox?.right || 0;
    const pocketLeft = stackRight + 10;
    const pocketRight = Math.min(sentenceRight, vw - pad);
    const pocketTop = nameBox.top;
    const pocketBottom = ledeBox.top;
    const pocketW = pocketRight - pocketLeft;
    const pocketH = pocketBottom - pocketTop;
    const scale = Math.min(1, pocketW / baseW, pocketH / baseH);
    if (pocketW < 72 || pocketH < 64 || scale < MIN_SCALE) {
      layer.classList.remove("is-in");
      return false;
    }

    const width = baseW * scale;
    const height = baseH * scale;
    const left = pocketRight - width;
    // Center the short wordmark on the heading's line box.
    const headingBox = name.getBoundingClientRect();
    const top = layer.classList.contains("is-logo")
      ? headingBox.top + (headingBox.height - height) / 2
      : pocketTop;

    if (snap) layer.classList.add("is-snap");
    setSize(width, height);
    layer.style.left = `${Math.round(left)}px`;
    layer.style.top = `${Math.round(top)}px`;
    if (snap) {
      layer.offsetHeight;
      layer.classList.remove("is-snap");
    }
    return true;
  };


  const sync = async () => {
    const request = ++generation;
    const isPinned = pinned();
    layer.classList.toggle("is-pinned", isPinned);
    if (!isPinned && !hovered) { layer.classList.remove("is-in"); return; }
    if (!await ready || request !== generation) return;
    if (place(true)) {
      layer.offsetHeight;
      layer.classList.add("is-in");
    }
  };
  trigger.addEventListener("pointerenter", event => {
    if (event.pointerType !== "mouse") return;
    hovered = true;
    sync();
  });
  trigger.addEventListener("pointerleave", () => { hovered = false; sync(); });
  new MutationObserver(sync).observe(trigger, { attributes: true, attributeFilter: ["aria-expanded"] });
  window.addEventListener("resize", sync);
  window.addEventListener("scroll", sync, { passive: true });
  document.fonts?.ready.then(sync);
})();
