// Keep handles ordered and inside the source clip, including at its endpoints.
export function moveTrimHandle(duration, start, end, edge, value) {
  const gap = Math.min(0.1, duration);
  start = Math.max(0, Math.min(Number.isFinite(start) ? start : 0, duration - gap));
  end = Math.max(start + gap, Math.min(Number.isFinite(end) ? end : duration, duration));
  if (edge === 'in') start = Math.max(0, Math.min(value, end - gap));
  else end = Math.max(start + gap, Math.min(value, duration));
  return { in: start, out: end };
}
