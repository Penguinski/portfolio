// Site-wide entry settings. Set enabled to false to restore simultaneous entry.
export const motionSettings = {
  stagger: {
    enabled: true,
    stepMs: 75,
    maxDelayMs: 475,
    rowTolerancePx: 2,
  },
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const defaults = { ...motionSettings.stagger };
const clamp = (value, fallback, max) => Number.isFinite(Number(value))
  ? Math.min(max, Math.max(0, Number(value)))
  : fallback;

export function maximumEntryDelay() {
  return motionSettings.stagger.enabled && !reducedMotion.matches
    ? clamp(motionSettings.stagger.maxDelayMs, defaults.maxDelayMs, 1000)
    : 0;
}

// Measure once, group aligned tops, then order each row from left to right.
// Compress the interval for large groups so every item keeps its own turn.
export function entryStagger(items, getRect = item => item.element.getBoundingClientRect(), notBefore = 0) {
  const delays = new Map(items.map(item => [item, 0]));
  const budget = maximumEntryDelay();
  if (!budget || !items.length) return delays;
  const tolerance = clamp(motionSettings.stagger.rowTolerancePx, defaults.rowTolerancePx, 10);
  const measured = items.map((item, index) => ({ item, index, rect: getRect(item) }));
  measured.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left || a.index - b.index);
  const rows = [];
  for (const item of measured) {
    let row = rows[rows.length - 1];
    if (!row || item.rect.top - row.top > tolerance) {
      row = { top: item.rect.top, items: [] };
      rows.push(row);
    }
    row.items.push(item);
  }
  const ordered = rows.flatMap(row => row.items.sort((a, b) => a.rect.left - b.rect.left || a.index - b.index));
  const interval = clamp(motionSettings.stagger.stepMs, defaults.stepMs, 200);
  const waiting = Math.min(budget, Math.max(0, notBefore));
  const start = waiting > 0 ? waiting + Math.min(interval, (budget - waiting) / ordered.length) : 0;
  const step = Math.min(interval, (budget - start) / Math.max(1, ordered.length - 1));
  ordered.forEach(({ item }, index) => delays.set(item, start + index * step));
  return delays;
}

// Optional tuning panel: /about/?motion=1. Changes stay in this tab's preview;
// ordinary visits continue to use the defaults above.
if (new URLSearchParams(location.search).get('motion') === '1') {
  const storageKey = 'portfolio-motion-preview';
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    if (saved) {
      motionSettings.stagger.enabled = saved.enabled !== false;
      motionSettings.stagger.stepMs = clamp(saved.stepMs, defaults.stepMs, 200);
      motionSettings.stagger.maxDelayMs = clamp(saved.maxDelayMs, defaults.maxDelayMs, 1000);
    }
  } catch { /* Preview storage is optional. */ }
  const panel = document.createElement('aside');
  panel.className = 'motion-tuning-panel';
  panel.setAttribute('aria-label', 'Prova animazioni');
  panel.innerHTML = `
    <strong>Stagger · anteprima</strong>
    <label><input type="checkbox" data-motion-enabled> Attivo</label>
    <label>Intervallo <output data-motion-step-value></output>
      <input type="range" min="0" max="200" step="5" data-motion-step>
    </label>
    <label>Ritardo massimo <output data-motion-max-value></output>
      <input type="range" min="0" max="1000" step="25" data-motion-max>
    </label>
    <small>Le regolazioni valgono solo per questa anteprima.</small>
    <div><button type="button" data-motion-replay>Riprova ingresso</button>
      <button type="button" data-motion-reset>Ripristina</button>
      <button type="button" data-motion-close>Chiudi</button></div>`;
  const enabled = panel.querySelector('[data-motion-enabled]');
  const step = panel.querySelector('[data-motion-step]');
  const max = panel.querySelector('[data-motion-max]');
  function render() {
    enabled.checked = motionSettings.stagger.enabled;
    step.value = motionSettings.stagger.stepMs;
    max.value = motionSettings.stagger.maxDelayMs;
    panel.querySelector('[data-motion-step-value]').value = `${step.value} ms`;
    panel.querySelector('[data-motion-max-value]').value = `${max.value} ms`;
  }
  function save() {
    try { sessionStorage.setItem(storageKey, JSON.stringify(motionSettings.stagger)); } catch { /* Optional. */ }
  }
  panel.addEventListener('input', () => {
    Object.assign(motionSettings.stagger, { enabled: enabled.checked, stepMs: Number(step.value), maxDelayMs: Number(max.value) });
    save(); render();
  });
  panel.querySelector('[data-motion-replay]').addEventListener('click', () => {
    const url = new URL(location.href);
    url.searchParams.set('motion', '1');
    location.assign(url.href);
  });
  panel.querySelector('[data-motion-reset]').addEventListener('click', () => {
    Object.assign(motionSettings.stagger, defaults); save(); render();
  });
  panel.querySelector('[data-motion-close]').addEventListener('click', () => {
    Object.assign(motionSettings.stagger, defaults);
    const url = new URL(location.href);
    url.searchParams.delete('motion');
    history.replaceState(history.state, '', url.href);
    panel.remove();
  });
  render();
  document.documentElement.append(panel);
}
