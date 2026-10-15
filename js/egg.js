(() => {
  const name = document.querySelector("[data-egg-trigger]");
  const titleEl = document.querySelector("[data-egg-title]");
  const detailEl = document.querySelector("[data-egg-detail]");
  const moreEl = document.querySelector("[data-egg-more]");
  if (!name || !titleEl || !detailEl || !moreEl || !window.Popover) return;

  const shortText = "CEO of Machine Learning";
  const detailText =
    "Softmax, linear regression, U-Net, gradient descent, backpropagation, neural networks, CNNs, transformers, attention, regularization";
  const longLabel = `${shortText}. ${detailText}`;

  let clicks = 0;

  const setExpanded = (expanded) => {
    moreEl.classList.toggle("is-open", expanded);
  };

  const relayout = () => {
    if (Popover.isOpen() && Popover.getTrigger() === name) {
      Popover.place();
      Popover.refreshAutoClose();
    }
  };

  moreEl.addEventListener("transitionend", relayout);

  const fillEgg = () => {
    titleEl.textContent = shortText;
    detailEl.textContent = detailText;
  };

  const showEgg = ({ expanded } = {}) => {
    fillEgg();
    setExpanded(Boolean(expanded));

    Popover.show({
      trigger: name,
      view: "egg",
      label: expanded ? longLabel : shortText,
      placement: "above",
      autoClose: 0,
      prepare: () => {
        fillEgg();
        setExpanded(Boolean(expanded));
      },
    });
    Popover.setOnHide(() => {
      setExpanded(false);
      clicks = 0;
    });
    requestAnimationFrame(relayout);
  };

  name.addEventListener("mousedown", (event) => {
    if (event.detail > 1) event.preventDefault();
  });

  name.addEventListener("click", (event) => {
    event.stopPropagation();
    window.getSelection()?.removeAllRanges();
    clicks += 1;

    if (Popover.isOpen() && Popover.getTrigger() === name) {
      Popover.refreshAutoClose();
    }

    if (clicks >= 20) {
      showEgg({ expanded: true });
      return;
    }

    if (clicks >= 10) {
      showEgg({ expanded: false });
    }
  });
})();
