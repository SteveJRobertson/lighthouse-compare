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
 * Formats a raw Lighthouse numeric value with its unit into a human-readable string.
 * @param {number} value
 * @param {string} numericUnit - Lighthouse unit string (e.g. 'millisecond', 'byte')
 * @returns {string}
 */
function formatNumeric(value, numericUnit) {
  if (numericUnit === 'millisecond') {
    if (value >= 1000) return `${parseFloat((value / 1000).toFixed(2))} s`;
    return `${Math.round(value)} ms`;
  }
  if (numericUnit === 'byte') {
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${Math.round(value)} bytes`;
  }
  if (numericUnit === 'second') return `${parseFloat(value.toFixed(2))} s`;
  if (!numericUnit) return String(Math.round(value));
  return `${Math.round(value)} ${numericUnit}`;
}

/**
 * Generates a human-readable sentence describing an audit change between two reports.
 * @param {object} audit - An audit comparison entry (subset of compareReports output)
 * @returns {string}
 */
function describeChange(audit) {
  const {
    scoreA,
    scoreB,
    displayValueA,
    displayValueB,
    numericValueA,
    numericValueB,
    numericUnit,
    delta,
  } = audit;

  // Audit only appears in Report B (new)
  if (scoreA === null && scoreB !== null) {
    const pct = formatScore(scoreB);
    const val = displayValueB ? ` (${displayValueB})` : '';
    return `New in Report B — scored ${pct}${val}.`;
  }

  // Audit only appears in Report A (removed in B)
  if (scoreB === null && scoreA !== null) {
    const pct = formatScore(scoreA);
    const val = displayValueA ? ` (${displayValueA})` : '';
    return `Not present in Report B — was scored ${pct}${val}.`;
  }

  // Both null (informational / not applicable)
  if (scoreA === null && scoreB === null) {
    return 'Not applicable in either report.';
  }

  const pctA = formatScore(scoreA);
  const pctB = formatScore(scoreB);

  // Numeric metric comparison (e.g. FCP: 500 ms → 300 ms)
  let metricDesc = '';
  if (
    numericValueA !== null &&
    numericValueB !== null &&
    Math.round(numericValueA) !== Math.round(numericValueB)
  ) {
    const a = formatNumeric(numericValueA, numericUnit);
    const b = formatNumeric(numericValueB, numericUnit);
    const diff = numericValueB - numericValueA;
    const diffAbs = formatNumeric(Math.abs(diff), numericUnit);
    const arrow = diff < 0 ? '↓' : '↑';
    metricDesc = ` Metric: ${a} → ${b} (${arrow}\u2009${diffAbs}).`;
  }

  const deltaPoints = Math.abs(Math.round((scoreB - scoreA) * 100));

  if (delta.className === 'delta-positive') {
    return `Score improved by ${deltaPoints} point${deltaPoints !== 1 ? 's' : ''} (${pctA} → ${pctB}).${metricDesc}`;
  }

  if (delta.className === 'delta-negative') {
    return `Score regressed by ${deltaPoints} point${deltaPoints !== 1 ? 's' : ''} (${pctA} → ${pctB}).${metricDesc}`;
  }

  // Neutral — surface value-only changes
  if (metricDesc) return `Score unchanged at ${pctA}.${metricDesc}`;

  const valueChanged = displayValueA && displayValueB && displayValueA !== displayValueB;
  if (valueChanged) {
    return `Score unchanged at ${pctA}. Value changed from "${displayValueA}" to "${displayValueB}".`;
  }

  return `No change — score: ${pctA}.`;
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
      const description = (auditA || auditB).description || '';
      const displayValueA = auditA ? auditA.displayValue || '' : '';
      const displayValueB = auditB ? auditB.displayValue || '' : '';
      const numericValueA =
        auditA != null && auditA.numericValue != null ? auditA.numericValue : null;
      const numericValueB =
        auditB != null && auditB.numericValue != null ? auditB.numericValue : null;
      const numericUnit = (auditA || auditB).numericUnit || '';
      const explanation = auditB
        ? auditB.explanation || ''
        : auditA
          ? auditA.explanation || ''
          : '';
      const delta = scoreDelta(scoreA, scoreB);
      const entry = {
        id,
        title,
        description,
        explanation,
        scoreA,
        scoreB,
        displayValueA,
        displayValueB,
        numericValueA,
        numericValueB,
        numericUnit,
        delta,
      };
      return { ...entry, summary: describeChange(entry) };
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

  // Top 5 most impactful changes for the narrative section
  const topChanged = audits
    .filter((a) => a.delta.className !== 'delta-neutral')
    .sort(
      (a, b) =>
        Math.abs(Math.round((b.scoreB - b.scoreA) * 100)) -
        Math.abs(Math.round((a.scoreB - a.scoreA) * 100)),
    )
    .slice(0, 5);

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

    ${
      topChanged.length > 0
        ? `<section class="notable-changes">
      <h2 class="section-title">Notable Changes</h2>
      <ul class="notable-changes__list">
        ${topChanged
          .map(
            (a) => `<li class="notable-changes__item notable-changes__item--${a.delta.className === 'delta-positive' ? 'positive' : 'negative'}">
            <span class="notable-changes__audit">${escapeHtml(a.title)}</span>
            <span class="notable-changes__summary">${escapeHtml(a.summary)}</span>
          </li>`,
          )
          .join('')}
      </ul>
    </section>`
        : ''
    }

    <section class="audits">
      <h2 class="section-title">Audit Comparison</h2>
      <p class="audits__hint">Click <strong>▼</strong> on any row to expand its description and change summary.</p>
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
    Array.from(tbody.querySelectorAll('tr.audit-row')).forEach((row) => {
      const matchesFilter = filterVal === 'all' || row.dataset.delta === filterVal;
      const matchesSearch = row.dataset.title.includes(searchVal);
      const visible = matchesFilter && matchesSearch;
      row.hidden = !visible;
      // Collapse and hide the associated detail row when the main row is filtered out
      const detailRow = row.nextElementSibling;
      if (detailRow && detailRow.classList.contains('audit-detail-row') && !visible) {
        detailRow.hidden = true;
        const expandBtn = row.querySelector('.audit-expand-btn');
        if (expandBtn) {
          expandBtn.setAttribute('aria-expanded', 'false');
          expandBtn.textContent = '▼';
        }
      }
    });
  }

  filterEl.addEventListener('change', applyFilters);
  searchEl.addEventListener('input', applyFilters);

  // Wire up expand/collapse buttons
  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('.audit-expand-btn');
    if (!btn) return;
    const row = btn.closest('tr.audit-row');
    const detailRow = row.nextElementSibling;
    if (!detailRow || !detailRow.classList.contains('audit-detail-row')) return;
    const isExpanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!isExpanded));
    btn.textContent = isExpanded ? '▼' : '▲';
    detailRow.hidden = isExpanded;
  });
}

function renderCategoryCard(cat) {
  const { title, scoreA, scoreB, delta } = cat;

  let summarySentence = '';
  if (scoreA !== null && scoreB !== null) {
    const pA = Math.round(scoreA * 100);
    const pB = Math.round(scoreB * 100);
    const pts = Math.abs(Math.round((scoreB - scoreA) * 100));
    if (delta.className === 'delta-positive') {
      summarySentence = `Improved by ${pts} point${pts !== 1 ? 's' : ''} (${pA} → ${pB})`;
    } else if (delta.className === 'delta-negative') {
      summarySentence = `Regressed by ${pts} point${pts !== 1 ? 's' : ''} (${pA} → ${pB})`;
    } else {
      summarySentence = `Score unchanged at ${pA}`;
    }
  } else if (scoreA === null && scoreB !== null) {
    summarySentence = `New in Report B — ${Math.round(scoreB * 100)}`;
  } else if (scoreB === null && scoreA !== null) {
    summarySentence = 'Not in Report B';
  }

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
    ${summarySentence ? `<p class="category-card__summary ${delta.className}">${escapeHtml(summarySentence)}</p>` : ''}
  </div>`;
}

function renderAuditRow(audit) {
  const { title, scoreA, scoreB, displayValueA, displayValueB, delta, description } = audit;
  return `<tr class="audit-row" data-delta="${delta.className}" data-title="${escapeHtml(title.toLowerCase())}">
    <td class="audit-table__name">
      <button class="audit-expand-btn" aria-expanded="false" title="Show details">▼</button>
      <span title="${escapeHtml(description)}">${escapeHtml(title)}</span>
    </td>
    <td class="audit-table__score">
      <span class="score-badge score-badge--${getScoreClass(scoreA)}">${formatScore(scoreA)}</span>
    </td>
    <td class="audit-table__value">${escapeHtml(displayValueA)}</td>
    <td class="audit-table__score">
      <span class="score-badge score-badge--${getScoreClass(scoreB)}">${formatScore(scoreB)}</span>
    </td>
    <td class="audit-table__value">${escapeHtml(displayValueB)}</td>
    <td class="audit-table__delta ${delta.className}">${delta.text}</td>
  </tr>
  ${renderAuditDetailRow(audit)}`;
}

function renderAuditDetailRow(audit) {
  const { description, explanation, summary } = audit;
  return `<tr class="audit-detail-row" hidden>
    <td colspan="6" class="audit-detail-cell">
      ${description ? `<p class="audit-detail__description">${escapeHtml(description)}</p>` : ''}
      ${explanation ? `<p class="audit-detail__explanation"><strong>Explanation:</strong> ${escapeHtml(explanation)}</p>` : ''}
      <p class="audit-detail__summary">${escapeHtml(summary)}</p>
    </td>
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
    formatNumeric,
    getScoreClass,
    scoreDelta,
    describeChange,
    compareReports,
    getCategoryForAudit,
    escapeHtml,
    formatDate,
  };
}
