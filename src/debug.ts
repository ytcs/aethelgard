// Lightweight on-screen diagnostics, enabled only with ?debug=1 in the URL.
// Lets us read real failure state off devices we can't attach a debugger to
// (notably iPad Safari, where the PDF renders blank but works on desktop).

export const DEBUG_ENABLED =
  typeof location !== 'undefined' && /[?&]debug=1\b/.test(location.search);

type Listener = (lines: string[]) => void;

const lines: string[] = [];
const listeners = new Set<Listener>();
const MAX_LINES = 200;

function emit() {
  for (const l of listeners) l(lines.slice());
}

export function dlog(msg: string) {
  if (!DEBUG_ENABLED) return;
  const t = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm (perf.now-free)
  lines.push(`${t}  ${msg}`);
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
  emit();
  // Also mirror to the console for remote-inspector sessions.
  // eslint-disable-next-line no-console
  console.log('[diag]', msg);
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  fn(lines.slice());
  return () => listeners.delete(fn);
}

// Capture uncaught errors / rejections that would otherwise be invisible on the
// device. Installed once, only when debugging.
let installed = false;
export function installGlobalErrorCapture() {
  if (!DEBUG_ENABLED || installed) return;
  installed = true;
  window.addEventListener('error', (e) => {
    dlog(`window.error: ${e.message} @ ${e.filename}:${e.lineno}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r: any = e.reason;
    dlog(`unhandledrejection: ${r?.name || ''} ${r?.message || String(r)}`);
  });
  // One-time environment snapshot.
  dlog(
    `env: dpr=${window.devicePixelRatio} ` +
      `screen=${window.screen?.width}x${window.screen?.height} ` +
      `inner=${window.innerWidth}x${window.innerHeight} ` +
      `ua=${navigator.userAgent}`
  );
}
