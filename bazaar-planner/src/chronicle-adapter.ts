import { importRawCatalog } from './raw-adapter';
/** Metadata only: no fabricated effects, patch, activity, or external URLs. */
export function importChronicle(value: unknown, fileName: string, sha256: string) {
  const envelope = value as {format?: string; items?: unknown[]};
  if (envelope?.format !== 'bazaar-chronicle-metadata-v1' || !Array.isArray(envelope.items) || !envelope.items.length || envelope.items.length > 20000) throw Error('Chronicle 변환 JSON 형식이 올바르지 않습니다.');
  const raw: Record<string, unknown> = {};
  const metadata = new Map<string, {imageId: string | null; ignored: boolean}>();
  for (const entry of envelope.items) {
    const r = entry as {id:string;name:string;heroes:string[];size:string;tags:string[];ignored:boolean;imageId:string|null};
    if (!r || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(r.id) || metadata.has(r.id) || typeof r.ignored !== 'boolean' || (r.imageId !== null && r.imageId !== r.id) || !['small','medium','large'].includes(r.size)) throw Error('Chronicle ID 또는 이미지 식별자가 올바르지 않습니다.');
    metadata.set(r.id,{imageId:r.imageId,ignored:r.ignored});
    raw[r.id] = {type:'Item',id:r.id,name:r.name,heroes:r.heroes,size:r.size[0].toUpperCase()+r.size.slice(1),tags:r.tags,tiers:['Bronze'],description:'효과·등급 정보 미제공. 보드의 등급은 개인 메모입니다.',raw_effects:{tiers_raw:{Bronze:{Attributes:{},AbilityIds:[],AuraIds:[]}}}};
  }
  const result = importRawCatalog(raw,{fileName,sha256});
  for (const item of result.items) {
    const meta = metadata.get(item.source.id)!;
    item.image.localId = meta.imageId;
    item.local!.metadataOnly = true;
    item.local!.chronicleIgnored = meta.ignored;
    item.local!.warnings.push('Chronicle 메타데이터만 가져옴: 현재 활성 여부·게임 패치·등급·효과 미확인.',meta.ignored ? 'Chronicle ignored=1 (제외/숨김 표시; 게임 비활성 여부는 미확인).' : 'Chronicle ignored=0 (게임 활성 여부를 보증하지 않음).');
  }
  return result;
}
