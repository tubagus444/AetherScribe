import { privateErrorRecord } from '@/src/lib/errorPrivacy';
import { db } from '@/src/db';
import { AppError } from '@/src/types';

// Batas waktu penulisan log ke IndexedDB. Handler error global (main.tsx) memanggil
// `log` fire-and-forget; bila IndexedDB TERBLOKIR (mis. upgrade tertunda), `db.errors.add`
// bisa MENGGANTUNG selamanya (try/catch tak menangkap hang) → promise bocor. Timeout
// memaksa promise settle. db.ts sengaja tak memakai ErrorService untuk isu DB; ini
// membuat ErrorService sendiri tahan saat DB jadi penyebab error.
const LOG_WRITE_TIMEOUT_MS = 3000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('log write timed out')), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export const ErrorService = {
  async log(error: Partial<AppError>) {
    const appError = privateErrorRecord({ ...error, timestamp: Date.now() });

    // Console DULU: tak bergantung DB → error tetap terlihat walau IndexedDB bermasalah.
    console.error(`[AppError] ${appError.message}`, appError);

    try {
      await withTimeout(db.errors.add(appError), LOG_WRITE_TIMEOUT_MS);
    } catch (e) {
      // Gagal/menggantung → abaikan (sudah tercatat di console). Jangan biarkan kegagalan
      // logging menjatuhkan/menghang jalur error global.
      console.error('Gagal menyimpan error ke DB (diabaikan).');
    }
  },

  async clearAll() {
    await db.errors.clear();
  },

  async clearBefore(timestamp: number) {
    await db.errors.where('timestamp').below(timestamp).delete();
  },

  async getRecent(limit = 100) {
    return (await db.errors.orderBy('timestamp').reverse().limit(limit).toArray()).map(privateErrorRecord);
  }
};
