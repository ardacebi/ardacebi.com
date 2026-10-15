(() => {
  const root = document.documentElement;
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  let chosen = null;
  const effective = () => chosen || (system.matches ? "dark" : "light");
  const apply = () => {
    const mode = effective();
    if (chosen) root.dataset.theme = mode;
    else delete root.dataset.theme;
    const button = document.querySelector("[data-theme-toggle]");
    if (button) {
      button.dataset.mode = mode;
      button.setAttribute("aria-label", `Switch to ${mode === "dark" ? "light" : "dark"} mode`);
    }
    const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
    const meta = metas.shift() || document.head.appendChild(document.createElement("meta"));
    meta.name = "theme-color";
    meta.removeAttribute("media");
    meta.content = mode === "dark" ? "#000000" : "#ffffff";
    metas.forEach(other => other.remove());
    const favicon = document.querySelector('link[type="image/svg+xml"]');
    if (favicon) favicon.href = new URL(`favicon-${mode}.svg`, favicon.href).href;
  };
  if (window.self !== window.top) root.dataset.embed = "";
  document.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
    chosen = effective() === "dark" ? "light" : "dark";
    apply();
  });
  system.addEventListener("change", () => { if (!chosen) apply(); });
  apply();

  const time = document.querySelector("[data-clock-time]");
  if (time) {
    const format = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Europe/Rome",
    });

    const tick = () => {
      const parts = format.formatToParts(new Date());
      const part = type => parts.find(p => p.type === type)?.value || "00";
      time.textContent = `${part("hour")}:${part("minute")}`;
      const seconds = document.querySelector("[data-clock-seconds]");
      if (seconds) seconds.textContent = `:${part("second")}`;
    };

    tick();
    setInterval(tick, 1000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) tick();
    });
  }
})();
