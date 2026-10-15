(() => {
  const EMAIL = "ardacebi@me.com";
  const trigger = document.querySelector("[data-email-trigger]");
  const copyBtn = document.querySelector("[data-email-copy]");
  if (!trigger || !copyBtn || !window.Popover) return;

  let copyReset = 0;

  const copyEmail = async () => {
    let copied = false;
    try {
      await navigator.clipboard.writeText(EMAIL);
      copied = true;
    } catch {
      const field = document.createElement("textarea");
      field.value = EMAIL;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.left = "-9999px";
      document.body.append(field);
      field.select();
      copied = document.execCommand("copy");
      field.remove();
    }

    if (!copied) return;
    copyBtn.classList.add("is-copied");
    copyBtn.setAttribute("aria-label", "Email copied");
    window.clearTimeout(copyReset);
    copyReset = window.setTimeout(() => {
      copyBtn.classList.remove("is-copied");
      copyBtn.removeAttribute("aria-label");
    }, 1800);
  };

  const openEmail = () => {
    Popover.show({
      trigger,
      view: "email",
      label: "Email options",
      placement: "below",
      autoClose: 0,
      closeOnLeave: false,
      focus: () => copyBtn,
    });
    Popover.setOnHide(() => {
      copyBtn.classList.remove("is-copied");
      window.clearTimeout(copyReset);
    });
  };

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (Popover.isOpen() && Popover.getTrigger() === trigger) {
      Popover.hide();
      return;
    }
    openEmail();
  });

  copyBtn.addEventListener("click", () => {
    copyEmail();
  });

  document.querySelector("[data-email-send]")?.addEventListener("click", () => {
    Popover.hide({ restoreFocus: true });
    window.setTimeout(() => {
      window.location.href = `mailto:${EMAIL}`;
    }, Popover.reduceMotion() ? 0 : 160);
  });
})();
