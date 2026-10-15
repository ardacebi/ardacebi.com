(() => {
  const layer = document.querySelector("[data-popover-layer]");
  const backdrop = document.querySelector("[data-popover-backdrop]");
  const panel = document.querySelector("[data-popover-panel]");
  if (!layer || !backdrop || !panel) return;

  const AUTO_CLOSE_MS = 4000;
  const CLOSE_MS = 180;

  const reduceMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let open = false;
  let activeTrigger = null;
  let activePlacement = "auto";
  let closeTimer = 0;
  let focusTimer = 0;
  let autoCloseTimer = 0;
  let autoCloseMs = AUTO_CLOSE_MS;
  let dismissOnLeave = true;
  let onHide = null;
  let hovered = false;
  let pointerOpened = false;
  let animGen = 0;
  let hideGen = 0;
  let leaveTimer = 0;
  let holdTrigger = null;

  const clearAutoClose = () => {
    window.clearTimeout(autoCloseTimer);
    autoCloseTimer = 0;
  };

  const clearLeave = () => {
    window.clearTimeout(leaveTimer);
    leaveTimer = 0;
  };

  const pointerOverHold = () =>
    Boolean(
      (panel.matches(":hover") && !panel.hidden) ||
        activeTrigger?.matches?.(":hover")
    );

  const armAutoClose = (ms = autoCloseMs) => {
    clearAutoClose();
    if (!ms || hovered || pointerOverHold()) return;
    autoCloseTimer = window.setTimeout(() => {
      if (pointerOverHold()) return;
      hide({ restoreFocus: false });
    }, ms);
  };

  const scheduleLeaveDismiss = () => {
    clearLeave();
    leaveTimer = window.setTimeout(() => {
      if (!open || pointerOverHold()) {
        hovered = pointerOverHold();
        return;
      }
      hovered = false;
      if (autoCloseMs) armAutoClose(autoCloseMs);
      else if (dismissOnLeave) hide({ restoreFocus: false });
    }, 180);
  };

  const cancelPending = () => {
    animGen += 1;
    window.clearTimeout(closeTimer);
    window.clearTimeout(focusTimer);
    clearLeave();
    closeTimer = 0;
    focusTimer = 0;
  };

  const detachHold = () => {
    if (!holdTrigger) return;
    holdTrigger.removeEventListener("pointerenter", onHoldEnter);
    holdTrigger.removeEventListener("pointerleave", onHoldLeave);
    holdTrigger = null;
  };

  const onHoldEnter = () => {
    hovered = true;
    clearLeave();
    clearAutoClose();
  };

  const onHoldLeave = () => {
    scheduleLeaveDismiss();
  };

  const attachHold = (trigger) => {
    detachHold();
    holdTrigger = trigger;
    trigger.addEventListener("pointerenter", onHoldEnter);
    trigger.addEventListener("pointerleave", onHoldLeave);
  };

  const placePanel = (trigger, placement = activePlacement) => {
    if (!trigger) return;
    panel.style.right = "auto";
    const triggerBox = trigger.getBoundingClientRect();
    const margin = 12;
    const gap = 8;
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const spaceAbove = triggerBox.top - margin;
    const spaceBelow = window.innerHeight - triggerBox.bottom - margin;
    const fitsAbove = spaceAbove >= height + gap;
    const fitsBelow = spaceBelow >= height + gap;

    let above;
    if (placement === "above") {
      above = true;
    } else if (placement === "below") {
      above = !(fitsBelow || !fitsAbove);
    } else {
      above = fitsAbove;
    }

    let left = triggerBox.left;
    if (left + width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - width - margin);
    }
    left = Math.max(margin, left);

    if (above) {
      panel.style.top = "auto";
      panel.style.bottom = `${Math.max(
        margin,
        window.innerHeight - triggerBox.top + gap
      )}px`;
    } else {
      let top = triggerBox.bottom + gap;
      top = Math.max(margin, Math.min(top, window.innerHeight - height - margin));
      panel.style.bottom = "auto";
      panel.style.top = `${top}px`;
    }

    panel.style.left = `${left}px`;
    panel.classList.toggle("is-above", above);
  };

  const setView = (name) => {
    panel.querySelectorAll("[data-popover-view]").forEach((view) => {
      const match = view.getAttribute("data-popover-view") === name;
      view.hidden = !match;
    });
  };

  const focusInitial = (focus) => {
    if (pointerOpened) {
      if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1");
      panel.focus({ preventScroll: true });
      return;
    }

    const target =
      focus?.() ||
      panel.querySelector(
        "[data-popover-view]:not([hidden]) button, [data-popover-view]:not([hidden]) [href]"
      );
    target?.focus?.({ preventScroll: true });
  };

  const animateIn = ({ fromHidden }) => {
    const frame = ++animGen;
    if (reduceMotion()) {
      panel.style.transition = "none";
      panel.classList.remove("is-out");
      panel.classList.add("is-in");
      return;
    }

    if (!fromHidden) {
      panel.style.transition = "";
      panel.classList.remove("is-out");
      panel.classList.add("is-in");
      return;
    }

    panel.style.transition = "none";
    panel.classList.remove("is-in", "is-out");
    void panel.offsetWidth;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (frame !== animGen || !open) return;
        panel.style.transition = "";
        panel.classList.add("is-in");
      });
    });
  };

  const show = ({
    trigger,
    view,
    label,
    focus,
    prepare,
    placement = "auto",
    autoClose = AUTO_CLOSE_MS,
    closeOnLeave = true,
  } = {}) => {
    if (!trigger) return;

    autoCloseMs = autoClose;
    dismissOnLeave = closeOnLeave;
    activePlacement = placement;
    pointerOpened =
      document.documentElement.dataset.inputModality !== "keyboard";

    if (open && activeTrigger === trigger) {
      prepare?.();
      setView(view);
      placePanel(trigger, placement);
      panel.classList.remove("is-out");
      panel.classList.add("is-in");
      hovered = pointerOverHold();
      armAutoClose(autoCloseMs);
      return;
    }

    const fromHidden = panel.hidden;
    if (open) hide({ restoreFocus: false, immediate: false });

    open = true;
    activeTrigger = trigger;
    hovered = trigger.matches?.(":hover") ?? false;
    hideGen += 1;
    cancelPending();
    clearAutoClose();
    prepare?.();
    setView(view);
    if (label) panel.setAttribute("aria-label", label);

    layer.classList.add("is-open");
    panel.hidden = false;
    backdrop.hidden = false;
    panel.removeAttribute("inert");
    trigger.setAttribute?.("aria-expanded", "true");
    attachHold(trigger);
    placePanel(trigger, placement);
    animateIn({ fromHidden });
    armAutoClose(autoCloseMs);

    focusTimer = window.setTimeout(() => {
      if (!open) return;
      focusInitial(focus);
    }, reduceMotion() || !fromHidden ? 0 : 140);
  };

  const hide = ({ restoreFocus = true, immediate = false } = {}) => {
    if (!open) return;
    open = false;
    hovered = false;
    clearAutoClose();
    cancelPending();
    detachHold();
    const trigger = activeTrigger;
    const thisHide = ++hideGen;
    activeTrigger = null;
    activePlacement = "auto";
    trigger?.setAttribute?.("aria-expanded", "false");
    panel.classList.remove("is-in");
    panel.classList.add("is-out");
    onHide?.();
    onHide = null;

    const finish = () => {
      if (thisHide !== hideGen || open) return;
      layer.classList.remove("is-open");
      panel.hidden = true;
      backdrop.hidden = true;
      panel.classList.remove("is-out", "is-above");
      panel.style.transition = "";
      panel.style.top = "";
      panel.style.bottom = "";
      panel.setAttribute("inert", "");
      if (restoreFocus) trigger?.focus?.({ preventScroll: true });
    };

    if (immediate || reduceMotion()) {
      finish();
      return;
    }

    closeTimer = window.setTimeout(finish, CLOSE_MS);
  };

  const isOpen = () => open;
  const getTrigger = () => activeTrigger;

  const setOnHide = (fn) => {
    onHide = fn;
  };

  const markPointer = () => {
    document.documentElement.dataset.inputModality = "pointer";
  };

  const markKeyboard = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    document.documentElement.dataset.inputModality = "keyboard";
  };

  const isTriggerEvent = (event) => {
    if (!activeTrigger) return false;
    const path = event.composedPath?.() || [];
    if (path.includes(activeTrigger)) return true;
    return activeTrigger.contains(event.target) || event.target === activeTrigger;
  };

  document.addEventListener("pointerdown", markPointer, true);
  document.addEventListener("keydown", markKeyboard, true);

  panel.addEventListener("pointerenter", () => {
    hovered = true;
    clearLeave();
    clearAutoClose();
  });

  panel.addEventListener("pointerleave", () => {
    hovered = false;
    if (open) scheduleLeaveDismiss();
  });

  panel.addEventListener("pointerdown", () => {
    hovered = true;
    clearLeave();
    clearAutoClose();
  });

  document.addEventListener("click", (event) => {
    if (!open) return;
    if (panel.contains(event.target)) return;
    if (isTriggerEvent(event)) return;
    hide();
  });

  document.addEventListener("keydown", (event) => {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      hide();
      return;
    }
    if (event.key !== "Tab") return;
    const nodes = [...panel.querySelectorAll("button, [href]")].filter(
      (node) => !node.closest("[hidden]")
    );
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (
      event.shiftKey &&
      document.activeElement === panel &&
      last
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      document.activeElement === panel &&
      first
    ) {
      event.preventDefault();
      first.focus();
    }
  });

  const syncPosition = () => {
    if (!open) return;
    placePanel(activeTrigger, activePlacement);
  };

  window.addEventListener("resize", syncPosition);
  window.addEventListener("scroll", syncPosition, { passive: true });
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(() => {
      if (open) placePanel(activeTrigger, activePlacement);
    }).observe(panel);
  }

  window.Popover = {
    show,
    hide,
    isOpen,
    getTrigger,
    setOnHide,
    place: () => placePanel(activeTrigger, activePlacement),
    refreshAutoClose: () => armAutoClose(autoCloseMs),
    reduceMotion,
  };
})();
