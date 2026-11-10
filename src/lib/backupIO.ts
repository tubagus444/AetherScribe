import { BACKUP_LIMITS } from './backupLimits';

export async function readBoundedStream(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('Ukuran cadangan melewati batas yang diizinkan.');
      chunks.push(value);
    }
  } catch (err) {
    await reader.cancel().catch(() => {});
    throw err;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

/** Gzip dikenali dari magic bytes; output dekompresi dibatasi selama streaming. */
export async function decodeBackupText(input: string | Uint8Array): Promise<string> {
  if (typeof input === 'string') {
    if (input.length > BACKUP_LIMITS.jsonBytes || new TextEncoder().encode(input).byteLength > BACKUP_LIMITS.jsonBytes) {
      throw new Error('Ukuran JSON cadangan melewati batas yang diizinkan.');
    }
    return input;
  }
  if (input.byteLength > BACKUP_LIMITS.fileBytes) throw new Error('Ukuran file cadangan melewati batas yang diizinkan.');
  let bytes = input;
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Browser ini belum mendukung pembacaan cadangan gzip.');
    const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream('gzip'));
    bytes = await readBoundedStream(stream, BACKUP_LIMITS.jsonBytes);
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export async function readBackupFile(file: Blob): Promise<unknown> {
  if (file.size > BACKUP_LIMITS.fileBytes) throw new Error('Ukuran file cadangan melewati batas 64 MiB.');
  return JSON.parse(await decodeBackupText(new Uint8Array(await file.arrayBuffer())));
}

/** Jangan pakai response.arrayBuffer() tanpa batas untuk unduhan Drive. */
export async function readBackupResponse(response: Response): Promise<unknown> {
  if (Number(response.headers.get('content-length')) > BACKUP_LIMITS.fileBytes) {
    await response.body?.cancel();
    throw new Error('Ukuran file cadangan melewati batas 64 MiB.');
  }
  if (!response.body) throw new Error('Isi cadangan kosong.');
  return JSON.parse(await decodeBackupText(await readBoundedStream(response.body, BACKUP_LIMITS.fileBytes)));
}
