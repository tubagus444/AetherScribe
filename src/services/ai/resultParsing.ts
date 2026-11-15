import { record } from '@/src/lib/dataContracts';
import type { ConsistencyFinding } from '@/src/types';

export interface CodexAuditFinding {
  severity: 'high' | 'medium' | 'low';
  type: string;
  issue: string;
  conflictsWith?: string;
  suggestion?: string;
}

export function sanitizeFinding(raw: unknown): ConsistencyFinding | null {
  if (!record(raw)) return null;
  const quote = typeof raw.quote === 'string' ? raw.quote.trim() : '';
  const explanation = typeof raw.explanation === 'string' ? raw.explanation.trim() : '';
  // Butuh minimal kutipan + penjelasan agar temuan bermakna & bisa dilacak penulis.
  if (!quote || !explanation) return null;

  const severity = raw.severity === 'high' || raw.severity === 'low' ? raw.severity : 'medium';
  return {
    severity,
    type: typeof raw.type === 'string' && raw.type.trim() ? raw.type.trim() : 'Lainnya',
    quote: quote.slice(0, 500),
    conflictsWith: typeof raw.conflictsWith === 'string' ? raw.conflictsWith.trim().slice(0, 500) : '',
    explanation: explanation.slice(0, 1000),
    suggestion: typeof raw.suggestion === 'string' ? raw.suggestion.trim().slice(0, 1000) : ''
  };
}

/**
 * Memeriksa satu bab terhadap knowledge base (Story Bible + Codex + relasi) dan
 * logika internalnya, lalu mengembalikan daftar temuan inkonsistensi terstruktur.
 * Selalu mengirim knowledge base penuh (bukan RAG-filtered) karena pengecekan
 * harus melihat seluruh entri untuk menangkap kontradiksi.
 */

export function sanitizeAuditFinding(raw: unknown): CodexAuditFinding | null {
  if (!record(raw)) return null;
  const issue = typeof raw.issue === 'string' ? raw.issue.trim() : '';
  if (!issue) return null; // tanpa deskripsi masalah, temuan tak bermakna
  const severity = raw.severity === 'high' || raw.severity === 'low' ? raw.severity : 'medium';
  return {
    severity,
    type: typeof raw.type === 'string' && raw.type.trim() ? raw.type.trim() : 'Lainnya',
    issue: issue.slice(0, 1000),
    conflictsWith: typeof raw.conflictsWith === 'string' ? raw.conflictsWith.trim().slice(0, 500) : undefined,
    suggestion: typeof raw.suggestion === 'string' ? raw.suggestion.trim().slice(0, 1000) : undefined,
  };
}


export function stripWrappers(text: string): string {
  let t = text.trim();
  const fence = t.match(/^```(?:\w+)?\s*([\s\S]*?)\s*```$/);
  if (fence) t = fence[1].trim();
  if (t.length > 1 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('“') && t.endsWith('”')))) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

/**
 * AI-assist Story Bible: menghasilkan draf SATU bidang (premis/latar/tema/…) yang
 * konsisten dengan profil cerita yang sudah diisi. Bidang target dikecualikan dari
 * profil agar model tak sekadar menyalinnya. Kreatif namun ter-grounded (temp 0.8),
 * dirutekan ke model penuh (actionType 'expand'). Bisa dibatalkan lewat cancelAI('bible-assist').
 */
