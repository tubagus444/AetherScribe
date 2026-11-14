import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfirmDialog } from '../src/components/common/ConfirmDialog';

export function mountDialogFixture() {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  let finish = () => {};
  function Fixture() {
    const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [nested, setNested] = useState(false);
    finish = () => { setBusy(false); setOpen(false); };
    return <>
      <button onClick={() => setOpen(true)}>Buka dialog uji</button>
      <button>Di luar dialog</button>
      <ConfirmDialog open={open} title="Dialog uji F25" busy={busy} onCancel={() => setOpen(false)} onConfirm={() => setBusy(true)} message={<><p>Konfirmasi fixture sintetis.</p><button onClick={() => setNested(true)}>Buka dialog kedua</button></>} />
      <ConfirmDialog open={nested} title="Dialog kedua" message="Fixture bertingkat" onCancel={() => setNested(false)} onConfirm={() => setNested(false)} />
    </>;
  }
  root.render(<Fixture />);
  return { finish: () => finish() };
}
