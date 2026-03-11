'use strict';

/**
 * Parses a Lighthouse JSON report and extracts key data.
 * @param {object} report - Parsed Lighthouse JSON object
 * @returns {{ url: string, fetchTime: string, lighthouseVersion: string, categories: object, audits: object }}
 */
function parseReport(report) {
  if (!report || typeof report !== 'object') {
    throw new Error('Invalid report: expected a JSON object');
  }
  if (!report.categories || typeof report.categories !== 'object') {
    throw new Error('Invalid report: missing "categories" field');
  }
  if (!report.audits || typeof report.audits !== 'object') {
    throw new Error('Invalid report: missing "audits" field');
  }
  return {
    url: report.finalUrl || report.requestedUrl || '',
    fetchTime: report.fetchTime || '',
    lighthouseVersion: report.lighthouseVersion || '',
    categories: report.categories,
    audits: report.audits,
  };
}

/**
 * Formats a Lighthouse score (0–1) as a percentage string, or 'N/A'.
 * @param {number|null|undefined} score
 * @returns {string}
 */
function formatScore(score) {
  if (score === null || score === undefined) return 'N/A';
  return Math.round(score * 100).toString();
}

/**
 * Returns a score colour class based on the numeric score (0–100).
 * Mirrors the Lighthouse scoring colours.
 * @param {number|null|undefined} score  - raw 0–1 score
 * @returns {'good'|'average'|'poor'|'na'}
 */
function getScoreClass(score) {
  if (score === null || score === undefined) return 'na';
  const pct = Math.round(score * 100);
  if (pct >= 90) return 'good';
  if (pct >= 50) return 'average';
  return 'poor';
}

/**
 * Computes the delta between two scores and returns a display string.
 * @param {number|null|undefined} scoreA
 * @param {number|null|undefined} scoreB
 * @returns {{ text: string, className: string }}
 */
function scoreDelta(scoreA, scoreB) {
  if (scoreA === null || scoreA === undefined || scoreB === null || scoreB === undefined) {
    return { text: '—', className: 'delta-neutral' };
  }
  const delta = Math.round((scoreB - scoreA) * 100);
  if (delta === 0) return { text: '±0', className: 'delta-neutral' };
  if (delta > 0) return { text: `+${delta}`, className: 'delta-positive' };
  return { text: `${delta}`, className: 'delta-negative' };
}

/**
 * Compares two parsed reports and returns a structured comparison result.
 * @param {ReturnType<parseReport>} reportA
 * @param {ReturnType<parseReport>} reportB
 * @returns {{ categories: Array, audits: Array }}
 */
function compareReports(reportA, reportB) {
  const categoryIds = new Set([
    ...Object.keys(reportA.categories),
    ...Object.keys(reportB.categories),
  ]);

  const categories = Array.from(categoryIds).map((id) => {
    const catA = reportA.categories[id];
    const catB = reportB.categories[id];
    const scoreA = catA ? catA.score : null;
    const scoreB = catB ? catB.score : null;
    const title = (catA || catB).title;
    return {
      id,
      title,
      scoreA,
      scoreB,
      delta: scoreDelta(scoreA, scoreB),
    };
  });

  const auditIds = new Set([
    ...Object.keys(reportA.audits),
    ...Object.keys(reportB.audits),
  ]);

  const audits = Array.from(auditIds)
    .map((id) => {
      const auditA = reportA.audits[id];
      const auditB = reportB.audits[id];
      const scoreA = auditA ? auditA.score : null;
      const scoreB = auditB ? auditB.score : null;
      const title = (auditA || auditB).title;
      const displayValueA = auditA ? auditA.displayValue || '' : '';
      const displayValueB = auditB ? auditB.displayValue || '' : '';
      return {
        id,
        title,
        scoreA,
        scoreB,
        displayValueA,
        displayValueB,
        delta: scoreDelta(scoreA, scoreB),
      };
    })
    .filter((a) => a.scoreA !== null || a.scoreB !== null);

  return { categories, audits };
}

/**
 * Returns the category ID that owns a given audit, given a parsed report.
 * @param {string} auditId
 * @param {object} categories
 * @returns {string|null}
 */
function getCategoryForAudit(auditId, categories) {
  for (const [catId, cat] of Object.entries(categories)) {
    if (cat.auditRefs && cat.auditRefs.some((ref) => ref.id === auditId)) {
      return catId;
    }
  }
  return null;
}

// ── DOM rendering helpers ────────────────────────────────────────────────────

/**
 * Renders the score gauge circle SVG.
 * @param {number|null|undefined} score  raw 0–1 score
 * @returns {string} SVG markup string
 */
function renderGauge(score) {
  const RADIUS = 56;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const pct = score === null || score === undefined ? null : Math.round(score * 100);
  const scoreClass = getScoreClass(score);
  const dashOffset =
    pct === null ? 0 : CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE;
  const label = pct === null ? 'N/A' : pct;

  return `<div class="gauge gauge--${scoreClass}" aria-label="Score: ${label}">
    <svg viewBox="0 0 120 120" class="gauge__svg">
      <circle class="gauge__base" cx="60" cy="60" r="${RADIUS}" />
      ${
        pct !== null
          ? `<circle class="gauge__arc" cx="60" cy="60" r="${RADIUS}"
          stroke-dasharray="${CIRCUMFERENCE}"
          stroke-dashoffset="${dashOffset.toFixed(2)}" />`
          : ''
      }
    </svg>
    <div class="gauge__label">${label}</div>
  </div>`;
}

/**
 * Renders the full comparison results into the container element.
 * @param {HTMLElement} container
 * @param {ReturnType<compareReports>} result
 * @param {{ url: string, fetchTime: string }} metaA
 * @param {{ url: string, fetchTime: string }} metaB
 */
function renderComparison(container, result, metaA, metaB) {
  const { categories, audits } = result;

  // Group audits by delta class for quick summary
  const improved = audits.filter((a) => a.delta.className === 'delta-positive').length;
  const regressed = audits.filter((a) => a.delta.className === 'delta-negative').length;
  const unchanged = audits.filter((a) => a.delta.className === 'delta-neutral').length;

  container.innerHTML = `
    <section class="meta-bar">
      <div class="meta-bar__item">
        <span class="meta-label">Report A</span>
        <span class="meta-url" title="${escapeHtml(metaA.url)}">${escapeHtml(metaA.url || '—')}</span>
        ${metaA.fetchTime ? `<span class="meta-time">${formatDate(metaA.fetchTime)}</span>` : ''}
      </div>
      <div class="meta-bar__item">
        <span class="meta-label">Report B</span>
        <span class="meta-url" title="${escapeHtml(metaB.url)}">${escapeHtml(metaB.url || '—')}</span>
        ${metaB.fetchTime ? `<span class="meta-time">${formatDate(metaB.fetchTime)}</span>` : ''}
      </div>
    </section>

    <section class="summary-bar">
      <div class="summary-bar__item summary-bar__item--positive">
        <span class="summary-bar__count">${improved}</span>
        <span class="summary-bar__label">Improved</span>
      </div>
      <div class="summary-bar__item summary-bar__item--neutral">
        <span class="summary-bar__count">${unchanged}</span>
        <span class="summary-bar__label">Unchanged</span>
      </div>
      <div class="summary-bar__item summary-bar__item--negative">
        <span class="summary-bar__count">${regressed}</span>
        <span class="summary-bar__label">Regressed</span>
      </div>
    </section>

    <section class="categories">
      <h2 class="section-title">Category Scores</h2>
      <div class="category-grid">
        ${categories.map((cat) => renderCategoryCard(cat)).join('')}
      </div>
    </section>

    <section class="audits">
      <h2 class="section-title">Audit Comparison</h2>
      <div class="audit-controls">
        <label class="filter-label">
          <span>Filter:</span>
          <select class="audit-filter" id="auditFilter">
            <option value="all">All audits</option>
            <option value="delta-positive">Improved</option>
            <option value="delta-negative">Regressed</option>
            <option value="delta-neutral">Unchanged</option>
          </select>
        </label>
        <label class="filter-label">
          <span>Search:</span>
          <input type="text" class="audit-search" id="auditSearch" placeholder="Search audits…" />
        </label>
      </div>
      <div class="audit-table-wrapper">
        <table class="audit-table" aria-label="Audit comparison table">
          <thead>
            <tr>
              <th class="audit-table__name">Audit</th>
              <th class="audit-table__score">Score A</th>
              <th class="audit-table__value">Value A</th>
              <th class="audit-table__score">Score B</th>
              <th class="audit-table__value">Value B</th>
              <th class="audit-table__delta">Delta</th>
            </tr>
          </thead>
          <tbody id="auditTbody">
            ${audits.map((a) => renderAuditRow(a)).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;

  // Wire up filter/search
  const filterEl = container.querySelector('#auditFilter');
  const searchEl = container.querySelector('#auditSearch');
  const tbody = container.querySelector('#auditTbody');

  function applyFilters() {
    const filterVal = filterEl.value;
    const searchVal = searchEl.value.toLowerCase();
    Array.from(tbody.querySelectorAll('tr')).forEach((row) => {
      const matchesFilter =
        filterVal === 'all' || row.dataset.delta === filterVal;
      const matchesSearch = row.dataset.title.includes(searchVal);
      row.hidden = !(matchesFilter && matchesSearch);
    });
  }

  filterEl.addEventListener('change', applyFilters);
  searchEl.addEventListener('input', applyFilters);
}

function renderCategoryCard(cat) {
  const { title, scoreA, scoreB, delta } = cat;
  return `<div class="category-card">
    <h3 class="category-card__title">${escapeHtml(title)}</h3>
    <div class="category-card__scores">
      <div class="category-card__gauge">
        <div class="gauge-label">A</div>
        ${renderGauge(scoreA)}
      </div>
      <div class="category-card__delta ${delta.className}">${delta.text}</div>
      <div class="category-card__gauge">
        <div class="gauge-label">B</div>
        ${renderGauge(scoreB)}
      </div>
    </div>
  </div>`;
}

function renderAuditRow(audit) {
  const { title, scoreA, scoreB, displayValueA, displayValueB, delta } = audit;
  return `<tr data-delta="${delta.className}" data-title="${escapeHtml(title.toLowerCase())}">
    <td class="audit-table__name">${escapeHtml(title)}</td>
    <td class="audit-table__score">
      <span class="score-badge score-badge--${getScoreClass(scoreA)}">${formatScore(scoreA)}</span>
    </td>
    <td class="audit-table__value">${escapeHtml(displayValueA)}</td>
    <td class="audit-table__score">
      <span class="score-badge score-badge--${getScoreClass(scoreB)}">${formatScore(scoreB)}</span>
    </td>
    <td class="audit-table__value">${escapeHtml(displayValueB)}</td>
    <td class="audit-table__delta ${delta.className}">${delta.text}</td>
  </tr>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(isoString) {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleString();
  } catch {
    return isoString;
  }
}

// ── File loading helpers ─────────────────────────────────────────────────────

/**
 * Reads a File object and parses it as JSON.
 * @param {File} file
 * @returns {Promise<object>}
 */
function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(JSON.parse(e.target.result));
      } catch {
        reject(new Error(`Could not parse "${file.name}" as JSON`));
      }
    };
    reader.onerror = () => reject(new Error(`Could not read "${file.name}"`));
    reader.readAsText(file);
  });
}

// ── Bootstrap (only runs in browser) ────────────────────────────────────────

/* istanbul ignore next */
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const dropZoneA = document.getElementById('dropZoneA');
  const dropZoneB = document.getElementById('dropZoneB');
  const inputA = document.getElementById('fileA');
  const inputB = document.getElementById('fileB');
  const compareBtn = document.getElementById('compareBtn');
  const errorMsg = document.getElementById('errorMsg');
  const resultsEl = document.getElementById('results');

  let parsedA = null;
  let parsedB = null;

  function setError(msg) {
    errorMsg.textContent = msg;
    errorMsg.hidden = !msg;
  }

  function updateCompareButton() {
    compareBtn.disabled = !(parsedA && parsedB);
  }

  async function handleFile(file, slot) {
    setError('');
    try {
      const json = await readJsonFile(file);
      const parsed = parseReport(json);
      if (slot === 'A') {
        parsedA = parsed;
        setDropZoneLoaded(dropZoneA, file.name);
      } else {
        parsedB = parsed;
        setDropZoneLoaded(dropZoneB, file.name);
      }
    } catch (err) {
      setError(err.message);
    }
    updateCompareButton();
  }

  function setDropZoneLoaded(zone, filename) {
    zone.classList.add('drop-zone--loaded');
    zone.querySelector('.drop-zone__filename').textContent = filename;
  }

  function setupDropZone(zone, input, slot) {
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drop-zone--over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drop-zone--over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drop-zone--over');
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file, slot);
    });
    input.addEventListener('change', () => {
      if (input.files[0]) handleFile(input.files[0], slot);
    });
  }

  setupDropZone(dropZoneA, inputA, 'A');
  setupDropZone(dropZoneB, inputB, 'B');

  compareBtn.addEventListener('click', () => {
    if (!parsedA || !parsedB) return;
    try {
      const result = compareReports(parsedA, parsedB);
      resultsEl.hidden = false;
      renderComparison(
        resultsEl,
        result,
        { url: parsedA.url, fetchTime: parsedA.fetchTime },
        { url: parsedB.url, fetchTime: parsedB.fetchTime },
      );
      resultsEl.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      setError(err.message);
    }
  });
}

// ── Exports (for Node.js / Jest) ─────────────────────────────────────────────
if (typeof module !== 'undefined') {
  module.exports = {
    parseReport,
    formatScore,
    getScoreClass,
    scoreDelta,
    compareReports,
    getCategoryForAudit,
    escapeHtml,
    formatDate,
  };
}
