'use strict';

const {
  parseReport,
  formatScore,
  getScoreClass,
  scoreDelta,
  compareReports,
  getCategoryForAudit,
  escapeHtml,
  formatDate,
} = require('../app');

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeReport(overrides = {}) {
  return {
    lighthouseVersion: '10.0.0',
    fetchTime: '2024-01-01T12:00:00.000Z',
    finalUrl: 'https://example.com',
    categories: {
      performance: { id: 'performance', title: 'Performance', score: 0.72, auditRefs: [{ id: 'first-contentful-paint' }] },
      accessibility: { id: 'accessibility', title: 'Accessibility', score: 0.98, auditRefs: [{ id: 'image-alt' }] },
      'best-practices': { id: 'best-practices', title: 'Best Practices', score: 0.92, auditRefs: [] },
      seo: { id: 'seo', title: 'SEO', score: 0.88, auditRefs: [] },
      pwa: { id: 'pwa', title: 'Progressive Web App', score: null, auditRefs: [] },
    },
    audits: {
      'first-contentful-paint': {
        id: 'first-contentful-paint',
        title: 'First Contentful Paint',
        score: 0.92,
        displayValue: '0.5 s',
        numericValue: 500,
      },
      'image-alt': {
        id: 'image-alt',
        title: 'Image elements have [alt] attributes',
        score: 1,
        displayValue: '',
      },
    },
    ...overrides,
  };
}

// ── parseReport ───────────────────────────────────────────────────────────────

describe('parseReport', () => {
  it('extracts url, fetchTime, lighthouseVersion, categories and audits', () => {
    const raw = makeReport();
    const parsed = parseReport(raw);
    expect(parsed.url).toBe('https://example.com');
    expect(parsed.fetchTime).toBe('2024-01-01T12:00:00.000Z');
    expect(parsed.lighthouseVersion).toBe('10.0.0');
    expect(parsed.categories).toBe(raw.categories);
    expect(parsed.audits).toBe(raw.audits);
  });

  it('falls back to requestedUrl when finalUrl is absent', () => {
    const raw = makeReport({ finalUrl: undefined, requestedUrl: 'https://fallback.com' });
    expect(parseReport(raw).url).toBe('https://fallback.com');
  });

  it('returns empty url when neither finalUrl nor requestedUrl are present', () => {
    const raw = makeReport({ finalUrl: undefined });
    expect(parseReport(raw).url).toBe('');
  });

  it('throws for non-object input', () => {
    expect(() => parseReport(null)).toThrow('Invalid report: expected a JSON object');
    expect(() => parseReport('string')).toThrow('Invalid report: expected a JSON object');
    expect(() => parseReport(42)).toThrow('Invalid report: expected a JSON object');
  });

  it('throws when categories is missing', () => {
    expect(() => parseReport({ audits: {} })).toThrow('Invalid report: missing "categories" field');
  });

  it('throws when audits is missing', () => {
    expect(() => parseReport({ categories: {} })).toThrow('Invalid report: missing "audits" field');
  });
});

// ── formatScore ───────────────────────────────────────────────────────────────

describe('formatScore', () => {
  it('converts a 0–1 score to a percentage string', () => {
    expect(formatScore(1)).toBe('100');
    expect(formatScore(0.72)).toBe('72');
    expect(formatScore(0)).toBe('0');
    expect(formatScore(0.925)).toBe('93');
  });

  it('returns "N/A" for null or undefined', () => {
    expect(formatScore(null)).toBe('N/A');
    expect(formatScore(undefined)).toBe('N/A');
  });
});

// ── getScoreClass ─────────────────────────────────────────────────────────────

describe('getScoreClass', () => {
  it('returns "good" for scores >= 0.90', () => {
    expect(getScoreClass(1)).toBe('good');
    expect(getScoreClass(0.9)).toBe('good');
    expect(getScoreClass(0.95)).toBe('good');
  });

  it('returns "average" for scores 0.50–0.89', () => {
    expect(getScoreClass(0.89)).toBe('average');
    expect(getScoreClass(0.5)).toBe('average');
    expect(getScoreClass(0.72)).toBe('average');
  });

  it('returns "poor" for scores below 0.50', () => {
    expect(getScoreClass(0)).toBe('poor');
    expect(getScoreClass(0.49)).toBe('poor');
  });

  it('returns "na" for null or undefined', () => {
    expect(getScoreClass(null)).toBe('na');
    expect(getScoreClass(undefined)).toBe('na');
  });
});

// ── scoreDelta ────────────────────────────────────────────────────────────────

describe('scoreDelta', () => {
  it('returns a positive delta when B is better', () => {
    const result = scoreDelta(0.7, 0.9);
    expect(result.text).toBe('+20');
    expect(result.className).toBe('delta-positive');
  });

  it('returns a negative delta when B is worse', () => {
    const result = scoreDelta(0.9, 0.7);
    expect(result.text).toBe('-20');
    expect(result.className).toBe('delta-negative');
  });

  it('returns neutral when scores are equal', () => {
    const result = scoreDelta(0.8, 0.8);
    expect(result.text).toBe('±0');
    expect(result.className).toBe('delta-neutral');
  });

  it('returns neutral dash when either score is null', () => {
    expect(scoreDelta(null, 0.8)).toEqual({ text: '—', className: 'delta-neutral' });
    expect(scoreDelta(0.8, null)).toEqual({ text: '—', className: 'delta-neutral' });
    expect(scoreDelta(null, null)).toEqual({ text: '—', className: 'delta-neutral' });
  });

  it('handles small fractional differences correctly', () => {
    // 0.92 vs 0.93 → +1
    const result = scoreDelta(0.92, 0.93);
    expect(result.text).toBe('+1');
    expect(result.className).toBe('delta-positive');
  });
});

// ── compareReports ────────────────────────────────────────────────────────────

describe('compareReports', () => {
  let parsedA, parsedB;

  beforeEach(() => {
    parsedA = parseReport(makeReport());
    parsedB = parseReport(
      makeReport({
        categories: {
          performance: { id: 'performance', title: 'Performance', score: 0.85, auditRefs: [{ id: 'first-contentful-paint' }] },
          accessibility: { id: 'accessibility', title: 'Accessibility', score: 0.95, auditRefs: [] },
          'best-practices': { id: 'best-practices', title: 'Best Practices', score: 0.92, auditRefs: [] },
          seo: { id: 'seo', title: 'SEO', score: 0.88, auditRefs: [] },
          pwa: { id: 'pwa', title: 'Progressive Web App', score: null, auditRefs: [] },
        },
        audits: {
          'first-contentful-paint': {
            id: 'first-contentful-paint',
            title: 'First Contentful Paint',
            score: 0.98,
            displayValue: '0.3 s',
          },
          'image-alt': {
            id: 'image-alt',
            title: 'Image elements have [alt] attributes',
            score: 1,
            displayValue: '',
          },
        },
      }),
    );
  });

  it('returns a categories array with delta info', () => {
    const { categories } = compareReports(parsedA, parsedB);
    expect(Array.isArray(categories)).toBe(true);
    const perf = categories.find((c) => c.id === 'performance');
    expect(perf).toBeDefined();
    expect(perf.scoreA).toBeCloseTo(0.72);
    expect(perf.scoreB).toBeCloseTo(0.85);
    expect(perf.delta.className).toBe('delta-positive');
    expect(perf.delta.text).toBe('+13');
  });

  it('returns a neutral delta for unchanged scores', () => {
    const { categories } = compareReports(parsedA, parsedB);
    const seo = categories.find((c) => c.id === 'seo');
    expect(seo.delta.className).toBe('delta-neutral');
  });

  it('returns negative delta when score regresses', () => {
    const { categories } = compareReports(parsedA, parsedB);
    const acc = categories.find((c) => c.id === 'accessibility');
    expect(acc.delta.className).toBe('delta-negative');
    expect(acc.delta.text).toBe('-3');
  });

  it('returns neutral when both scores are null', () => {
    const { categories } = compareReports(parsedA, parsedB);
    const pwa = categories.find((c) => c.id === 'pwa');
    expect(pwa.delta.className).toBe('delta-neutral');
  });

  it('returns an audits array filtered to those with at least one score', () => {
    const { audits } = compareReports(parsedA, parsedB);
    expect(Array.isArray(audits)).toBe(true);
    expect(audits.length).toBeGreaterThan(0);
    audits.forEach((a) => {
      expect(a.scoreA !== null || a.scoreB !== null).toBe(true);
    });
  });

  it('includes displayValues from both reports', () => {
    const { audits } = compareReports(parsedA, parsedB);
    const fcp = audits.find((a) => a.id === 'first-contentful-paint');
    expect(fcp.displayValueA).toBe('0.5 s');
    expect(fcp.displayValueB).toBe('0.3 s');
  });

  it('handles an audit present in only one report', () => {
    const onlySideB = parseReport({
      ...makeReport(),
      audits: {
        ...makeReport().audits,
        'new-audit': { id: 'new-audit', title: 'New Audit', score: 0.8, displayValue: '' },
      },
    });
    const { audits } = compareReports(parsedA, onlySideB);
    const newAudit = audits.find((a) => a.id === 'new-audit');
    expect(newAudit).toBeDefined();
    expect(newAudit.scoreA).toBeNull();
    expect(newAudit.scoreB).toBeCloseTo(0.8);
  });
});

// ── getCategoryForAudit ───────────────────────────────────────────────────────

describe('getCategoryForAudit', () => {
  it('returns the category id that owns the audit', () => {
    const categories = makeReport().categories;
    expect(getCategoryForAudit('first-contentful-paint', categories)).toBe('performance');
    expect(getCategoryForAudit('image-alt', categories)).toBe('accessibility');
  });

  it('returns null when the audit is not referenced by any category', () => {
    const categories = makeReport().categories;
    expect(getCategoryForAudit('non-existent', categories)).toBeNull();
  });
});

// ── escapeHtml ────────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
    expect(escapeHtml("it's & \"great\" <b>nice</b>")).toBe(
      "it&#39;s &amp; &quot;great&quot; &lt;b&gt;nice&lt;/b&gt;",
    );
  });

  it('returns empty string for falsy input', () => {
    expect(escapeHtml('')).toBe('');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

// ── formatDate ────────────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('returns a non-empty string for a valid ISO date', () => {
    const result = formatDate('2024-01-15T10:30:00.000Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns empty string for empty input', () => {
    expect(formatDate('')).toBe('');
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
  });
});
