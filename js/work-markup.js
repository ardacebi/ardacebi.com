window.SiteWorkMarkup = (name, collection) => {
  const works = collection.items;
  const escapeHtml = (value) =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  return `
    <ul class="works-list">
      ${works
        .map(
          (work, index) => `
        <li class="work" data-work="${escapeHtml(work.id)}" style="--work-i: ${index}">
          <button
            class="work-trigger"
            type="button"
            data-work-trigger="${escapeHtml(work.id)}"
            aria-expanded="false"
            aria-controls="work-${name}-${escapeHtml(work.id)}"
          >
            <span class="work-title">${escapeHtml(work.title)}</span>
            <span class="work-meta">${
              work.year
                ? `${escapeHtml(work.year)} · ${escapeHtml(work.role)}`
                : escapeHtml(work.role)
            }</span>
          </button>
          <div class="expand work-detail" id="work-${name}-${escapeHtml(work.id)}" data-work-panel="${escapeHtml(work.id)}">
            <div class="expand-clip">
              <div class="expand-stack">
                <div class="expand-body work-body">
                  ${
                    work.image
                      ? `<figure class="work-figure"><img src="${escapeHtml(work.image)}" alt="${escapeHtml(work.title)}" width="800" height="600" decoding="async" loading="lazy"></figure>`
                      : ""
                  }
                  ${work.body ? `<p>${escapeHtml(work.body)}</p>` : ""}
                  ${work.contribution ? `<p class="work-contribution">${escapeHtml(work.contribution)}</p>` : ""}
                  ${work.technologies?.length ? `<p class="work-technologies" aria-label="Technologies">${work.technologies.map(escapeHtml).join(' <span aria-hidden="true">·</span> ')}</p>` : ""}
                  ${work.apps?.length ? `<ul class="early-apps" aria-label="Early mobile apps">${work.apps.map(app => `
                    <li>
                      <a class="early-app" href="${escapeHtml(app.href)}" target="_blank" rel="noopener noreferrer">
                        <img class="early-app-icon" src="${escapeHtml(app.icon)}" alt="" width="36" height="36" loading="lazy" decoding="async">
                        <span class="early-app-copy"><span class="early-app-name">${escapeHtml(app.name)}</span><span class="early-app-purpose">${escapeHtml(app.purpose)}</span></span>
                        <span class="early-app-arrow" aria-hidden="true">↗</span>
                      </a>
                    </li>`).join('')}</ul>` : ""}
                  ${
                    work.current
                      ? `<p class="work-link">${escapeHtml(work.linkLabel)}</p>`
                      : work.href
                      ? `<p class="work-link"><a href="${escapeHtml(work.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(work.linkLabel || "Visit site")}</a></p>`
                      : ""
                  }
                </div>
                <div class="expand-veil" aria-hidden="true"></div>
              </div>
            </div>
          </div>
        </li>`
        )
        .join("")}
    </ul>
    ${
      collection.visit
        ? `<p class="works-visit" style="--work-i: ${works.length}"><a href="${escapeHtml(collection.visit.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(collection.visit.label)}${collection.visit.arrow ? ' <span class="visit-arrow" aria-hidden="true">↗</span>' : ''}</a></p>`
        : ""
    }
  `;
};
