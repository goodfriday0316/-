import { importChronicle } from './chronicle-adapter';
import { importRawCatalog } from './raw-adapter';

/** The worker and browser fallback use exactly the same local conversion. */
export async function convertLocalFile(text: string, fileName: string) {
  const bytes = new TextEncoder().encode(text);
  if (bytes.byteLength > 25 * 1024 * 1024)
    throw Error('JSON 파일은 25MB 이하여야 합니다.');
  if (!globalThis.crypto?.subtle)
    throw Error('파일 변환은 HTTPS 또는 localhost에서 실행해야 합니다.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw Error('JSON 형식이 올바르지 않습니다. 변환 프로그램으로 생성한 .json 파일을 선택하세요.');
  }
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map(n => n.toString(16).padStart(2, '0')).join('');
  const format = (parsed as { format?: unknown } | null)?.format;
  const result = format === 'bazaar-chronicle-metadata-v1'
    ? importChronicle(parsed, fileName, digest)
    : importRawCatalog(parsed, { fileName, sha256: digest });
  return { digest, result };
}
