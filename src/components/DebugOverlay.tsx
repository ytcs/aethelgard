import React, { useEffect, useState } from 'react';
import { DEBUG_ENABLED, subscribe } from '../debug';

// On-screen log panel for ?debug=1. Fixed to the bottom of the screen, scrollable,
// with a button to copy the whole log so it can be pasted back for diagnosis.
export const DebugOverlay: React.FC = () => {
  const [lines, setLines] = useState<string[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!DEBUG_ENABLED) return;
    return subscribe(setLines);
  }, []);

  if (!DEBUG_ENABLED) return null;

  const copy = () => {
    const text = lines.join('\n');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        background: 'rgba(0,0,0,0.85)',
        color: '#0f0',
        font: '11px/1.35 ui-monospace, Menlo, monospace',
        maxHeight: open ? '45vh' : '28px',
        overflow: 'hidden',
        borderTop: '1px solid #0f0',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '4px 8px',
          background: 'rgba(0,0,0,0.95)',
          alignItems: 'center',
        }}
      >
        <strong style={{ color: '#0f0' }}>diag ({lines.length})</strong>
        <button onClick={() => setOpen((o) => !o)} style={btn}>
          {open ? 'hide' : 'show'}
        </button>
        <button onClick={copy} style={btn}>
          copy
        </button>
      </div>
      <div style={{ overflowY: 'auto', maxHeight: 'calc(45vh - 28px)', padding: '4px 8px' }}>
        {lines.map((l, i) => (
          <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {l}
          </div>
        ))}
      </div>
    </div>
  );
};

const btn: React.CSSProperties = {
  background: '#020',
  color: '#0f0',
  border: '1px solid #0f0',
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: 11,
};
