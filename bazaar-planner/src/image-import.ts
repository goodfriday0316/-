import { ZipReader, BlobReader, BlobWriter } from '@zip.js/zip.js';
import type { CatalogItem } from './catalog';
import { matchLocalImagePath, putLocalImage, getLocalImage } from './local-library';
export type ImageReport = {total:number; matched:number; failed:number; missingItemIds:string[]; issues:{path:string;reason:string}[]};
export async function importImageZip(file: File, items: CatalogItem[], progress: (text:string)=>void): Promise<ImageReport> {
  if (file.size > 512*1024*1024) throw Error('ZIP은 512MB 이하여야 합니다.');
  const reader = new ZipReader(new BlobReader(file), {useWebWorkers:false});
  const report: ImageReport = {total:0,matched:0,failed:0,missingItemIds:[],issues:[]};
  const successful = new Set<string>();
  try {
    const entries = await reader.getEntries();
    if(entries.length>20000) throw Error('ZIP 항목이 20,000개를 초과합니다.');
    const candidates = entries.filter(e=>!e.directory && /\.webp$/i.test(e.filename));
    report.total=candidates.length;
    const counts = new Map<string,number>();
    const matches = candidates.map(e=>matchLocalImagePath(e.filename,items));
    for(const m of matches) if(m.status==='matched') counts.set(m.itemId,(counts.get(m.itemId)||0)+1);
    let expanded=0;
    for(let i=0;i<candidates.length;i++) {
      const entry=candidates[i], match=matches[i];
      progress(`${i+1}/${candidates.length} 이미지 처리 중 · 저장 ${report.matched}`);
      try {
        if(match.status!=='matched') throw Error(match.status);
        if(counts.get(match.itemId)!==1) throw Error('동일 아이템 이미지 중복: 자동 선택하지 않음');
        if(entry.encrypted || entry.uncompressedSize>5*1024*1024 || !entry.uncompressedSize) throw Error('암호화 또는 이미지 크기 제한 초과');
        expanded+=entry.uncompressedSize;
        if(expanded>512*1024*1024) throw Error('전체 압축 해제 한도 초과');
        if(entry.directory || !entry.getData) throw Error('읽을 수 없는 ZIP 항목');
        const abort = new AbortController();
        const blob = await entry.getData(new BlobWriter('image/webp'),{checkSignature:true, signal:abort.signal, onprogress:(size)=>{if(size>5*1024*1024) abort.abort();}});
        // Decode validation prevents signature-only/corrupt files from being stored.
        const bitmap = await createImageBitmap(blob); bitmap.close();
        await putLocalImage({itemId:match.itemId,sourceId:match.sourceId,fileName:entry.filename,mimeType:'image/webp',blob,importedAt:new Date().toISOString()});
        successful.add(match.itemId);report.matched++;
      } catch(e) {report.failed++;report.issues.push({path:entry.filename,reason:e instanceof Error?e.message:String(e)});}
      // Each entry is decoded and committed separately; no whole-archive ArrayBuffer.
    }
    for(const item of items) if(!successful.has(item.id)) {
      const saved=await getLocalImage(item.id).catch(()=>null);
      if(!saved || saved.sourceId!==item.source.id) report.missingItemIds.push(item.id);
    }
    window.dispatchEvent(new Event('bazaar-local-images-changed'));
    return report;
  } finally { await reader.close(); }
}
