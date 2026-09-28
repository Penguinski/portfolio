// Delegate to document because internal navigation replaces the About markup.
const copyAttempts = new WeakMap();
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const touchControls = window.matchMedia('(hover: none), (pointer: coarse)');

function copyWithSelection(text) {
  const activeElement = document.activeElement;
  const selection = window.getSelection();
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange())
    : [];
  const field = document.createElement('textarea');
  field.value = text;
  field.readOnly = true;
  field.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px;pointer-events:none';
  document.body.append(field);
  try {
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, text.length);
    if (!document.execCommand('copy')) throw new Error('Copy was not available');
  } finally {
    field.remove();
    activeElement?.focus({ preventScroll: true });
    if (selection) {
      selection.removeAllRanges();
      ranges.forEach(range => selection.addRange(range));
    }
  }
}

async function copyEmail(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Older browsers and restricted clipboard contexts can still allow selection-based copy.
    }
  }
  copyWithSelection(text);
}

document.addEventListener('click', async event => {
  const button = event.target.closest?.('button[data-copy-email]');
  if (!button || !button.closest('.about-contact')) return;
  if (document.documentElement.matches('.initial-intro-pending, .is-page-transitioning')) return;

  const previous = copyAttempts.get(button);
  if (previous?.pending) return;
  if (previous) window.clearTimeout(previous.timer);

  const attempt = { pending: true, timer: null };
  copyAttempts.set(button, attempt);
  const status = button.closest('.about-contact').querySelector('[data-copy-email-status]');
  const startedAt = performance.now();
  if (button.dataset.copyState !== 'copied') button.dataset.copyState = 'copying';
  if (status) status.textContent = '';

  try {
    // Start the clipboard request directly within the user gesture, before any visual delay.
    await copyEmail(button.dataset.copyEmail);
    if (!button.isConnected) return;
    const delay = reducedMotion.matches || touchControls.matches
      ? 0
      : Math.max(0, 160 - (performance.now() - startedAt));
    attempt.timer = window.setTimeout(() => {
      if (!button.isConnected) return;
      attempt.pending = false;
      button.dataset.copyState = 'copied';
      if (status) status.textContent = 'Email address copied.';
      attempt.timer = window.setTimeout(() => {
        if (!button.isConnected) return;
        delete button.dataset.copyState;
        if (status) status.textContent = '';
        copyAttempts.delete(button);
      }, touchControls.matches ? 2000 : 1500);
    }, delay);
  } catch {
    attempt.pending = false;
    copyAttempts.delete(button);
    delete button.dataset.copyState;
    if (status) status.textContent = 'Could not copy. Select the email address and copy it manually.';
  }
});
