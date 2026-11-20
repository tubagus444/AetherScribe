import { CODEX_COVER_BYTES, CODEX_COVER_SOURCE_BYTES, isCodexCoverType, type CodexCoverPair } from '@/src/lib/codexCoverLimits';

async function encodeImage(bitmap: ImageBitmap, maxSide: number, maxBytes: number) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Browser tidak dapat memproses gambar sampul.');
  const longest = Math.max(bitmap.width, bitmap.height);
  for (let side = Math.min(maxSide, longest); side >= 1; side = Math.floor(side * 0.75)) {
    canvas.width = Math.max(1, Math.round(bitmap.width * side / longest));
    canvas.height = Math.max(1, Math.round(bitmap.height * side / longest));
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.66, 0.5]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', quality));
      if (!blob) throw new Error('Gambar sampul tidak dapat dikodekan.');
      if (blob.size <= maxBytes) return blob;
      if (blob.type !== 'image/webp') break;
    }
  }
  throw new Error('Gambar sampul tidak dapat diperkecil. Coba gambar lain.');
}

export async function prepareCodexCover(file: File): Promise<CodexCoverPair> {
  if (!isCodexCoverType(file.type)) throw new Error('Gunakan gambar JPG, PNG, atau WebP.');
  if (!file.size || file.size > CODEX_COVER_SOURCE_BYTES) throw new Error('Ukuran gambar maksimal 20 MiB.');
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('Gambar tidak bisa dibuka. Periksa format dan coba lagi.'); });
  try {
    const cover = await encodeImage(bitmap, 1200, CODEX_COVER_BYTES.cover);
    const thumbnail = await encodeImage(bitmap, 192, CODEX_COVER_BYTES.thumbnail);
    return { cover, thumbnail };
  } finally {
    bitmap.close();
  }
}
