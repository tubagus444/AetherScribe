import { useState } from 'react';
import { knownOutputLimit, sessionOutput, validChatOutput } from '@/src/lib/chatOutputLimit';
import { updateChatSession } from '@/src/services/chatSessionOperations';
import { useToast } from '@/src/hooks/useToast';

const presets = [[2048, 'Ringkas'], [4096, 'Standar'], [8192, 'Panjang']] as const;
const format = (value: number) => value.toLocaleString('id-ID');

export function ChatOutputControl({ id, value, provider, model }: {
  id: number; value?: number; provider: string; model: string;
}) {
  const { toast } = useToast();
  const limit = sessionOutput(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const custom = editing || !presets.some(([n]) => n === limit);
  const capacity = knownOutputLimit(provider, model);
  async function save(next: number) {
    if (!validChatOutput(next)) return;
    setSaving(true);
    try {
      await updateChatSession(id, { maxOutputTokens: next });
      setEditing(false);
    } catch { toast.error('Batas jawaban gagal disimpan.'); }
    finally { setSaving(false); }
  }

  return <div className="flex flex-wrap items-center gap-2 border-b px-3 py-1.5 text-xs dark:border-slate-800">
    <label className="flex items-center gap-2">Panjang jawaban
      <select disabled={saving} className="rounded border bg-white px-2 py-1 dark:bg-slate-900"
        value={custom ? 'custom' : limit} onChange={event => {
          if (event.target.value === 'custom') { setDraft(String(limit)); setEditing(true); }
          else void save(Number(event.target.value));
        }}>
        {presets.map(([n, label]) => <option key={n} value={n}>{label} · {format(n)}</option>)}
        <option value="custom">Khusus{custom && !editing ? ' · ' + format(limit) : ''}</option>
      </select>
    </label>
    {custom && <form className="flex items-center gap-1" onSubmit={e => { e.preventDefault(); void save(Number(draft)); }}>
      <input type="number" min="1" step="1" required aria-label="Jumlah token khusus" disabled={saving}
        className="w-20 rounded border px-1 py-1 dark:bg-slate-900" value={editing ? draft : limit}
        onChange={e => { setDraft(e.target.value); setEditing(true); }} />
      <button type="submit" disabled={saving || !editing || !validChatOutput(Number(draft))} className="px-2 text-indigo-600 disabled:opacity-50">Simpan</button>
    </form>}
    {capacity && capacity < limit && <span>Batas model {format(capacity)} token</span>}
  </div>;
}
