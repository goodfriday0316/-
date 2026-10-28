import type { CatalogItem, Item } from './catalog';

export type ItemDetailsRecord = {
  templateId: string;
  nameEn: string;
  nameKo?: string;
  koreanProvenance?: {
    kind: 'official-game-localization';
    source: string;
    key: string;
    sourceSHA256: string;
  };
  bazaardex?: {
    url: string;
    sourcePage: string;
    verifiedNameEn: string;
    verifiedAt: string;
  };
};
export type ItemDetailsFile = { format: 'bazaar-item-details-v1'; records: ItemDetailsRecord[] };
export type ItemDetailsReport = {
  totalRecords: number;
  matchedRecords: number;
  koreanMatched: number;
  koreanUnconfirmed: number;
  linksMatched: number;
  linksUnmatched: number;
  issues: { templateId?: string; reason: string }[];
};
export type ItemDetailsImport = { file: ItemDetailsFile; report: ItemDetailsReport };
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const text = (v: unknown, max: number): v is string => typeof v === 'string' && !!v.trim() && v.length <= max && !/[\u0000-\u001f]/.test(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** An imported record is a user's exact-page verification, never a generated slug.
 * The app does not fetch pages or claim to independently verify that attestation. */
export function validBazaardexUrl(value: unknown): value is string {
  if (!text(value, 2000) || /[?#]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.href === value && url.protocol === 'https:' && ['www.bazaardex.com', 'bazaardex.com'].includes(url.hostname) &&
      !url.username && !url.password && !url.port && !url.search && !url.hash &&
      url.pathname !== '/' && !/\/(?:search|login|signup|api|terms|privacy)(?:\/|$)/i.test(url.pathname) &&
      !/%(?:2f|5c|2e)/i.test(url.pathname) && !url.pathname.includes('\\');
  } catch { return false; }
}

export function parseItemDetails(value: unknown, items: readonly Pick<CatalogItem, 'source' | 'nameEn'>[]): ItemDetailsImport {
  if (!object(value) || value.format !== 'bazaar-item-details-v1' || !Array.isArray(value.records) || value.records.length > 20000)
    throw Error('아이템 이름·링크 매핑 파일 형식이 올바르지 않습니다.');
  const sources = new Map<string, string[]>();
  for (const item of items) sources.set(item.source.id, [...(sources.get(item.source.id) || []), item.nameEn]);
  const counts = new Map<string, number>();
  for (const r of value.records) if (object(r) && typeof r.templateId === 'string') counts.set(r.templateId, (counts.get(r.templateId) || 0) + 1);
  const records: ItemDetailsRecord[] = [];
  const report: ItemDetailsReport = { totalRecords: value.records.length, matchedRecords: 0, koreanMatched: 0, koreanUnconfirmed: items.length, linksMatched: 0, linksUnmatched: items.length, issues: [] };
  for (const raw of value.records) {
    const id = object(raw) && typeof raw.templateId === 'string' ? raw.templateId.slice(0, 100) : undefined;
    try {
      if (!object(raw) || !text(raw.templateId, 100) || !uuid.test(raw.templateId) || !text(raw.nameEn, 300)) throw Error('invalid-identity');
      if (counts.get(raw.templateId) !== 1) throw Error('duplicate-template-id');
      const names = sources.get(raw.templateId);
      if (!names || names.length !== 1 || names[0] !== raw.nameEn) throw Error('item-id-or-english-name-not-matched');
      const record: ItemDetailsRecord = { templateId: raw.templateId, nameEn: raw.nameEn };
      if (raw.nameKo !== undefined) {
        const p = raw.koreanProvenance;
        if (!text(raw.nameKo, 300) || !/[가-힣]/.test(raw.nameKo) || !object(p) || p.kind !== 'official-game-localization' ||
          !text(p.source, 500) || !text(p.key, 500) || typeof p.sourceSHA256 !== 'string' || !/^[a-f0-9]{64}$/.test(p.sourceSHA256)) throw Error('official-korean-provenance-required');
        record.nameKo = raw.nameKo;
        record.koreanProvenance = { kind: 'official-game-localization', source: p.source, key: p.key, sourceSHA256: p.sourceSHA256 };
      } else if (raw.koreanProvenance !== undefined) throw Error('korean-name-required');
      if (raw.bazaardex !== undefined) {
        const b = raw.bazaardex;
        if (!object(b) || !validBazaardexUrl(b.url) || b.sourcePage !== b.url || b.verifiedNameEn !== raw.nameEn ||
          !text(b.verifiedAt, 100) || !/^\d{4}-\d{2}-\d{2}T/.test(b.verifiedAt) || !Number.isFinite(Date.parse(b.verifiedAt))) throw Error('exact-page-verification-required');
        record.bazaardex = { url: b.url, sourcePage: b.url, verifiedNameEn: b.verifiedNameEn, verifiedAt: b.verifiedAt };
      }
      if (!record.nameKo && !record.bazaardex) throw Error('empty-mapping');
      records.push(record);
      if (record.nameKo) report.koreanMatched++;
      if (record.bazaardex) report.linksMatched++;
    } catch (error) { report.issues.push({ ...(id ? {templateId: id} : {}), reason: error instanceof Error ? error.message : 'invalid-record' }); }
  }
  report.matchedRecords = records.length;
  report.koreanUnconfirmed -= report.koreanMatched;
  report.linksUnmatched -= report.linksMatched;
  return { file: { format: 'bazaar-item-details-v1', records }, report };
}
let runtime = new Map<string, ItemDetailsRecord>();
export function setItemDetails(file: ItemDetailsFile | null): void {
  runtime = new Map((file?.records || []).map(r => [r.templateId, r]));
}
function lookup(item: Pick<CatalogItem, 'source' | 'nameEn'>): ItemDetailsRecord | undefined {
  const record = runtime.get(item.source.id);
  return record?.nameEn === item.nameEn ? record : undefined;
}
export function enrichItem<T extends Item>(item: T): T {
  const record = lookup(item);
  if (!record?.nameKo) return item;
  return { ...item, name: record.nameKo, nameKo: record.nameKo, translationStatus: 'official' };
}
export function getBazaardexUrl(item: Pick<CatalogItem, 'source' | 'nameEn'>): string | null {
  const b = lookup(item)?.bazaardex;
  return b && validBazaardexUrl(b.url) && b.sourcePage === b.url && b.verifiedNameEn === item.nameEn ? b.url : null;
}

const DB = 'bazaar-item-details-v1';
async function database(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) throw Error('이 브라우저에서는 이름·링크 파일을 저장할 수 없습니다.');
  return new Promise((resolve,reject) => {
    const r=indexedDB.open(DB,1);
    let settled=false;
    r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('mapping'))r.result.createObjectStore('mapping');};
    r.onsuccess=()=>{
      if(settled){r.result.close();return;}
      settled=true;r.result.onversionchange=()=>r.result.close();resolve(r.result);
    };
    r.onerror=()=>{settled=true;reject(Error('이름·링크 저장소를 열지 못했습니다.'));};
    r.onblocked=()=>{settled=true;reject(Error('다른 탭을 닫고 다시 시도하세요.'));};
  });
}
export async function loadItemDetails(): Promise<unknown | null> {
  const db=await database();
  try { return await new Promise((resolve,reject)=>{
    const tx=db.transaction('mapping','readonly');let value:unknown=null;
    const r=tx.objectStore('mapping').get('current');r.onsuccess=()=>{value=r.result??null;};
    tx.oncomplete=()=>resolve(value);tx.onabort=tx.onerror=()=>reject(Error('이름·링크 파일을 읽지 못했습니다.'));
  }); } finally { db.close(); }
}
export async function saveItemDetails(file: ItemDetailsFile | null): Promise<void> {
  const db=await database();
  try { await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('mapping','readwrite');
    if(file) tx.objectStore('mapping').put(file,'current');else tx.objectStore('mapping').delete('current');
    tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(Error('이름·링크 저장에 실패했습니다. 브라우저 저장 공간을 확인하세요.'));
  }); } finally { db.close(); }
}
