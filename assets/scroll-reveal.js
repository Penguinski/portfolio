// Use explicit keyframes for scroll entries. Safari may coalesce CSS state
// changes during scrolling, or shorten a reveal by reversing a hidden-state
// transition caused by measurement/viewport changes.
export function animateScrollReveal(element) {
  element.classList.add('scroll-reveal-running');
  const hidden = getComputedStyle(element);
  const from = { opacity: 0, filter: hidden.filter, transform: hidden.transform };
  const rawDuration = hidden.getPropertyValue('--reveal-duration').trim();
  const value = Number.parseFloat(rawDuration);
  const duration = Number.isFinite(value) ? value * (rawDuration.endsWith('ms') ? 1 : 1000) : 700;
  const delay = Number.parseFloat(hidden.getPropertyValue('--reveal-delay')) || 0;
  const easing = hidden.getPropertyValue('--reveal-easing').trim() || 'cubic-bezier(.4, 0, .2, 1)';
  element.classList.add('is-revealed');
  const visible = getComputedStyle(element);
  const to = { opacity: 1, filter: visible.filter, transform: visible.transform };
  return element.animate([from, to], { duration, delay, easing, fill: 'both' });
}
