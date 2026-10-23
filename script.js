(() => {
  'use strict';
  const data = window.homepage;
  if (!data) return;
  const $ = (selector) => document.querySelector(selector);
  const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (value, protocols = ['http:', 'https:', 'mailto:']) => {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value, location.href);
      return protocols.includes(url.protocol) ? url.href : null;
    } catch { return null; }
  };
  const imageUrl = (value) => safeUrl(value, location.protocol === 'file:'
    ? ['http:', 'https:', 'file:']
    : ['http:', 'https:']);
  const link = (label, url) => {
    const valid = safeUrl(url);
    return valid ? `<a href="${escape(valid)}"${/^https?:/.test(valid) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escape(label)} <span aria-hidden="true">↗</span></a>` : '';
  };
  const richText = (value) => {
    if (!Array.isArray(value)) return escape(value);
    return value.map((part) => {
      if (typeof part === 'string') return escape(part);
      const text = escape(part.text);
      const url = safeUrl(part.href);
      if (url) return `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      return part.strong ? `<strong>${text}</strong>` : text;
    }).join('');
  };
  document.title = `${data.name}${data.chineseName ? ` · ${data.chineseName}` : ''} · Academic Homepage`;
  $('#name').textContent = data.name;
  $('#chinese-name').textContent = data.chineseName || '';
  $('#footer-name').textContent = data.name;
  $('#copyright-year').textContent = new Date().getFullYear();
  $('#contact-email').textContent = data.links.emailLabel || data.links.email;
  $('#biography').innerHTML = data.biography.map((p) => `<p>${richText(p)}</p>`).join('');
  const profileLink = (label, url, icon, extra = '') => {
    const valid = safeUrl(url);
    if (!valid) return '';
    const external = /^https?:/.test(valid) ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a class="profile-link" href="${escape(valid)}"${external}><img class="social-icon" src="assets/icons/${icon}.svg" width="18" height="18" alt="" aria-hidden="true"><span>${label}</span>${extra}</a>`;
  };
  $('#profile-links').innerHTML = [
    profileLink('Email', `mailto:${data.links.email}`, 'mail'),
    profileLink('Google Scholar', data.links.scholar, 'graduation-cap', '<span class="citation-count" id="citation-count" aria-live="polite"></span>'),
    profileLink('GitHub', data.links.github, 'github')
  ].join('');
  const loadCitations = async () => {
    const counter = $('#citation-count');
    if (!counter || !data.links.scholar) return;
    try {
      const response = await fetch('assets/scholar-stats.json', { cache: 'no-store', signal: AbortSignal.timeout(25000) });
      if (!response.ok) throw new Error('Citation data unavailable');
      const stats = await response.json();
      const profileId = new URL(data.links.scholar).searchParams.get('user');
      if (stats.profileId !== profileId || !Number.isSafeInteger(stats.citations) || stats.citations < 0) return;
      counter.innerHTML = `[<strong>${stats.citations.toLocaleString('en-US')}</strong> citations]`;
      counter.title = 'Total citations on Google Scholar';
    } catch {

    }
  };
  loadCitations();
  setInterval(() => { if (!document.hidden) loadCitations(); }, 3600000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadCitations(); });
  $('#news-list').innerHTML = data.news.map((item) => `<div class="news-row"><span class="entry-date">${escape(item.date)}</span><p>${richText(item.text)}${item.latest ? '<span class="new-label">NEW</span>' : ''}</p></div>`).join('');
  const renderAwards = (items) => items.map((item) => `<div class="award-row"><span class="entry-date">${escape(item.year)}</span><p class="award-title">${escape(item.title)}</p>${item.issuer ? `<span class="award-issuer">${escape(item.issuer)}</span>` : ''}</div>`).join('');
  $('#awards-list').innerHTML = renderAwards(data.awards);
  $('#reviewer-awards-list').innerHTML = renderAwards(data.reviewerAwards || []);
  const years = ['All', ...new Set(data.publications.map((p) => String(p.year)).sort((a, b) => Number(b) - Number(a)))];
  $('#year-filters').innerHTML = years.map((year, i) => `<button type="button" data-year="${escape(year)}" aria-pressed="${i === 0}">${escape(year)}</button>`).join('');
  const starCache = new Map();
  const starRequests = new Set();
  const starAttempts = new Map();
  const githubRepo = (value) => {
    const valid = safeUrl(value);
    if (!valid) return null;
    const url = new URL(valid);
    const parts = url.pathname.split('/').filter(Boolean);
    return url.hostname === 'github.com' && parts.length >= 2
      && parts.slice(0, 2).every((part) => /^[\w.-]+$/.test(part))
      ? `${parts[0]}/${parts[1].replace(/\.git$/, '')}` : null;
  };
  const cachedStars = (repo) => {
    if (!starCache.has(repo)) {
      try {
        const saved = JSON.parse(localStorage.getItem(`homepage:github-stars:${repo}`));
        if (saved && Number.isSafeInteger(saved.count) && saved.count >= 0) starCache.set(repo, saved.count);
      } catch {  }
    }
    return starCache.get(repo);
  };
  const githubCodeLink = (url) => {
    const repo = githubRepo(url);
    if (!repo) return link('Github', url);
    const count = cachedStars(repo);
    const pending = !starAttempts.has(repo) || starRequests.has(repo);
    const label = count === undefined ? (pending ? 'Loading GitHub stars' : 'GitHub star count temporarily unavailable') : `${count} GitHub stars`;
    return `<a class="github-code-link" data-github-repo="${escape(repo)}" href="${escape(safeUrl(url))}" target="_blank" rel="noopener noreferrer"><span>Github</span><span class="github-stars" title="GitHub stars"><svg class="star-icon" viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="m12 2.8 2.84 5.75 6.35.92-4.6 4.48 1.09 6.33L12 17.3l-5.68 2.98 1.09-6.33-4.6-4.48 6.35-.92Z"/></svg><span class="github-star-count" aria-live="polite" aria-label="${label}">${count === undefined ? (pending ? '…' : '—') : count.toLocaleString('en-US')}</span></span></a>`;
  };
  const paintStars = (repo, count) => {
    document.querySelectorAll('.github-code-link').forEach((anchor) => {
      if (anchor.dataset.githubRepo !== repo) return;
      const counter = anchor.querySelector('.github-star-count');
      counter.textContent = count.toLocaleString('en-US');
      counter.setAttribute('aria-label', `${count} GitHub stars`);
    });
  };
  const refreshGithubStars = async () => {
    const repositories = new Set([...document.querySelectorAll('.github-code-link')].map((anchor) => anchor.dataset.githubRepo));
    await Promise.all([...repositories].map(async (repo) => {

      if (starRequests.has(repo) || Date.now() - (starAttempts.get(repo) || 0) < 60000) return;
      starRequests.add(repo);
      starAttempts.set(repo, Date.now());
      try {
        const response = await fetch(`https://api.github.com/repos/${repo}`, {
          headers: { Accept: 'application/vnd.github+json' },
          cache: 'no-store',
          signal: AbortSignal.timeout(12000)
        });
        if (!response.ok) throw new Error('GitHub stars unavailable');
        const result = await response.json();
        if (result.full_name?.toLowerCase() !== repo.toLowerCase()
          || !Number.isSafeInteger(result.stargazers_count) || result.stargazers_count < 0) throw new Error('Invalid GitHub star count');
        starCache.set(repo, result.stargazers_count);
        paintStars(repo, result.stargazers_count);
        try { localStorage.setItem(`homepage:github-stars:${repo}`, JSON.stringify({ count: result.stargazers_count })); } catch {  }
      } catch {
        document.querySelectorAll('.github-code-link').forEach((anchor) => {
          if (anchor.dataset.githubRepo !== repo || cachedStars(repo) !== undefined) return;
          const counter = anchor.querySelector('.github-star-count');
          counter.textContent = '—';
          counter.setAttribute('aria-label', 'GitHub star count temporarily unavailable');
        });
      } finally { starRequests.delete(repo); }
    }));
  };
  const renderPublications = (year = 'All') => {
    const filtered = data.publications.filter((p) => year === 'All' || String(p.year) === year);
    const renderPaper = (p) => {
      const image = imageUrl(p.thumbnail);
      const figure = image
        ? `<img src="${escape(image)}" alt="Figure for ${escape(p.title)}" loading="lazy" width="${escape(p.thumbnailWidth || 146)}" height="${escape(p.thumbnailHeight || 105)}">`
        : `<div class="paper-mark" aria-label="${escape(p.shortTitle)} publication"><strong>${escape(p.shortTitle)}</strong><span>${escape(p.badge)}</span></div>`;
      return `<article class="publication">
        <div class="publication-figure">${figure}</div>
        <div class="publication-content">
          <h3 class="publication-title">${link(p.title, (p.links || {}).Paper) || escape(p.title)}</h3>
          <p class="publication-authors">${p.authors.map((author) => author === data.name ? `<strong>${escape(author)}</strong>` : escape(author)).join(', ')}</p>
          <p class="publication-venue">${escape(p.venue)}${p.venueAbbreviation ? ` (${escape(p.venueAbbreviation)})` : ''}${p.venueTrack ? `, ${escape(p.venueTrack)}` : ''}, ${escape(p.year)}.</p>
          <div class="publication-actions">${Object.entries(p.links || {}).map(([label, url]) => label === 'Code' ? githubCodeLink(url) : link(label, url)).join('')}${p.note ? `<span>${escape(p.note)}</span>` : ''}</div>
          ${p.abstract ? `<details><summary>Abstract</summary><p>${escape(p.abstract)}</p></details>` : ''}
        </div>
      </article>`;
    };
    $('#publication-list').innerHTML = filtered.sort((a, b) => b.year - a.year).map(renderPaper).join('');
    refreshGithubStars();
  };
  renderPublications();
  setInterval(() => { if (!document.hidden) refreshGithubStars(); }, 600000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshGithubStars(); });
  $('#year-filters').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-year]');
    if (!button) return;
    $('#year-filters').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    renderPublications(button.dataset.year);
  });
  const navLinks = [...document.querySelectorAll('nav a')];
  const sections = [...document.querySelectorAll('main section[id]')];
  let scheduled = false;
  const updateNavigation = () => {
    let active = sections[0].id;
    for (const section of sections) if (section.getBoundingClientRect().top <= 150) active = section.id;
    if (window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8) active = sections[sections.length - 1].id;
    navLinks.forEach((a) => a.hash === `#${active}` ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current'));
    scheduled = false;
  };
  window.addEventListener('scroll', () => { if (!scheduled) { scheduled = true; requestAnimationFrame(updateNavigation); } }, { passive: true });
  updateNavigation();
})();
