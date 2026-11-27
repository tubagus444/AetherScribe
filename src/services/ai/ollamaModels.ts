import { record } from '@/src/lib/dataContracts';

export async function fetchOllamaModels(baseUrl?: string, signal?: AbortSignal) {
  const response = await fetch('/api/ai/ollama-models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl }),
    signal,
  });
  if (response.status === 400) {
    throw new Error('Alamat Ollama ditolak. Gunakan http://localhost:11434, http://127.0.0.1:11434, atau http://[::1]:11434.');
  }
  if (response.status === 503) {
    throw new Error('Ollama tidak dapat dijangkau. Jalankan Ollama di perangkat ini lalu coba lagi.');
  }
  if (response.status === 504) {
    throw new Error('Ollama terlalu lama merespons. Coba lagi setelah Ollama siap.');
  }
  if (!response.ok) throw new Error('Daftar model Ollama gagal dimuat. Periksa alamat dan coba lagi.');

  const data: unknown = await response.json().catch(() => null);
  if (!record(data) || !Array.isArray(data.models)) throw new Error('Respons daftar model Ollama tidak valid.');

  return data.models.map((model: unknown) => {
    if (!record(model) || typeof model.name !== 'string' || !model.name.trim()) {
      throw new Error('Respons daftar model Ollama tidak valid.');
    }
    return { name: model.name, size: typeof model.size === 'number' && model.size > 0 ? model.size : 0 };
  });
}

export const NO_OLLAMA_MODELS = 'Ollama terhubung, tetapi belum ada model terpasang. Pasang model di Ollama, lalu muat ulang daftar.';
