(() => {
  const collections = window.SiteWorks;
  if (!collections) return;

  const finePointer = () =>
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const reduceMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const escapeAttr = (value) =>
    window.CSS?.escape?.(value) ?? String(value).replace(/"/g, '\\"');

  const PREVIEW_DELAY = 150;
  const PREVIEW_LEAVE = 180;

  const placePreview = (panel) => {
    const anchor = panel.closest(".lede-expandable");
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    panel.style.top = `${rect.bottom}px`;
    panel.style.left = `${rect.left}px`;
    panel.style.width = `${rect.width}px`;
  };

  const clearPreviewPlace = (panel) => {
    panel.style.top = "";
    panel.style.left = "";
    panel.style.width = "";
  };

  const repositionPreviews = () => {
    document
      .querySelectorAll(".expand.is-preview, .expand.is-preview-leave")
      .forEach(placePreview);
  };

  window.addEventListener("scroll", repositionPreviews, { passive: true });
  window.addEventListener("resize", repositionPreviews);

  const bindExpand = ({
    trigger: btn,
    panel: pane,
    allowPreview = true,
    canPreview,
    onPreview,
    onCommit,
    onClose,
  }) => {
    let mode = "closed";
    pane.setAttribute("inert", "");
    let enterTimer = 0;
    let leaveTimer = 0;
    let leaveEnd = 0;

    const finishLeave = () => {
      window.clearTimeout(leaveEnd);
      if (mode !== "closed") return;
      pane.classList.remove("is-preview-leave");
      clearPreviewPlace(pane);
    };

    const set = (next) => {
      const prev = mode;
      if (next === prev) return;
      mode = next;
      window.clearTimeout(enterTimer);
      window.clearTimeout(leaveTimer);
      enterTimer = 0;

      pane.classList.toggle("is-open", next === "open");
      pane.classList.toggle("is-preview", next === "preview");
      btn.setAttribute("aria-expanded", String(next === "open"));
      if (next === "open") pane.removeAttribute("inert");
      else pane.setAttribute("inert", "");

      if (next === "preview") {
        pane.classList.remove("is-preview-leave");
        placePreview(pane);
      } else if (prev === "preview" && next === "closed") {
        pane.classList.add("is-preview-leave");
        window.clearTimeout(leaveEnd);
        leaveEnd = window.setTimeout(finishLeave, 520);
      } else {
        pane.classList.remove("is-preview-leave");
        clearPreviewPlace(pane);
      }

      if (next === "preview" && prev !== "preview") onPreview?.();
      if (next === "open" && prev !== "open") onCommit?.();
      if (next === "closed" && prev !== "closed") onClose?.();
    };

    pane.addEventListener("transitionend", (event) => {
      if (event.target !== pane || event.propertyName !== "grid-template-rows") return;
      if (!pane.classList.contains("is-preview-leave")) return;
      finishLeave();
    });

    const preview = () => {
      if (!allowPreview || mode === "open") return;
      if (!finePointer() || reduceMotion()) return;
      if (canPreview && !canPreview()) return;
      window.clearTimeout(leaveTimer);
      if (mode === "preview") return;
      window.clearTimeout(enterTimer);
      enterTimer = window.setTimeout(() => {
        enterTimer = 0;
        if (mode === "open") return;
        if (canPreview && !canPreview()) return;
        set("preview");
      }, PREVIEW_DELAY);
    };

    const commit = () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(enterTimer);
      set("open");
    };

    const close = () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(enterTimer);
      set("closed");
    };

    const scheduleClose = () => {
      window.clearTimeout(enterTimer);
      enterTimer = 0;
      if (mode !== "preview") return;
      window.clearTimeout(leaveTimer);
      leaveTimer = window.setTimeout(() => {
        if (mode === "preview") close();
      }, PREVIEW_LEAVE);
    };

    btn.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "mouse") preview();
    });
    btn.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "mouse") scheduleClose();
    });
    btn.addEventListener("click", () => {
      if (mode === "open") close();
      else commit();
    });

    return {
      getMode: () => mode,
      commit,
      close,
      preview,
    };
  };

  const parents = [];

  const mount = (name) => {
    const collection = collections[name];
    const trigger = document.querySelector(`[data-expand-trigger="${name}"]`);
    const panel = document.querySelector(`[data-expand-panel="${name}"]`);
    const root = document.querySelector(`[data-works-root="${name}"]`);
    const works = collection?.items;
    if (!trigger || !panel || !root || !works?.length) return;

    if (!root.querySelector(".works-list")) {
      root.innerHTML = window.SiteWorkMarkup(name, collection);
    }

    const workControls = [];
    works.forEach((work, index) => {
      const workTrigger = root.querySelector(
        `[data-work-trigger="${escapeAttr(work.id)}"]`
      );
      const workPanel = root.querySelector(
        `[data-work-panel="${escapeAttr(work.id)}"]`
      );
      workControls.push(
        bindExpand({
          trigger: workTrigger,
          panel: workPanel,
          allowPreview: false,
          onPreview: () => {
            workControls.forEach((other, otherIndex) => {
              if (otherIndex !== index) other.close();
            });
          },
          onCommit: () => {
            workControls.forEach((other, otherIndex) => {
              if (otherIndex !== index) other.close();
            });
          },
        })
      );
    });

    const closeWorks = () => {
      workControls.forEach((control) => control.close());
    };

    const parent = bindExpand({
      trigger,
      panel,
      onPreview: () => {
        parents.forEach((other) => {
          if (other.parent !== parent && other.parent.getMode() === "preview") {
            other.parent.close();
          }
        });
      },
      canPreview: () =>
        parents.every((entry) => entry.parent.getMode() !== "open"),
      onCommit: () => {
        parents.forEach((other) => {
          if (other.parent !== parent) other.parent.close();
        });
      },
      onClose: closeWorks,
    });

    parents.push({ parent, workControls });
  };

  mount("software");
  mount("designble");
  mount("dribbble");

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    for (const entry of parents) {
      const openWork = entry.workControls.find(
        (control) => control.getMode() === "open"
      );
      if (openWork) {
        event.preventDefault();
        openWork.close();
        return;
      }
    }
    const openParent = parents.find(
      (entry) => entry.parent.getMode() !== "closed"
    );
    if (openParent) {
      event.preventDefault();
      openParent.parent.close();
    }
  });
})();
