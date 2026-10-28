import test from 'node:test';
import assert from 'node:assert/strict';
import {parseItemDetails,setItemDetails,enrichItem,getBazaardexUrl,validBazaardexUrl} from '../src/item-details.ts';
const id='11111111-1111-4111-8111-111111111111';
const item={id:`local-raw:${id}`,name:'Synthetic item',nameEn:'Synthetic item',nameKo:null,translationStatus:'untranslated',size:1,heroes:['Vanessa'],tags:[],tiers:{bronze:{effects:['Legacy effect']}},image:{path:null,sourceUrl:null,status:'missing'},source:{id,url:'local://fixture',patchVersion:'unknown'}} as any;
const korean={kind:'official-game-localization',source:'synthetic-test-ko.json',key:'synthetic_name_key',sourceSHA256:'a'.repeat(64)};
const link={url:'https://www.bazaardex.com/synthetic-exact-page',sourcePage:'https://www.bazaardex.com/synthetic-exact-page',verifiedNameEn:item.nameEn,verifiedAt:'2026-10-28T00:00:00Z'};
const envelope=(records:unknown[])=>({format:'bazaar-item-details-v1',records});
test('exact stable ID and English name match; overlay keeps source item and tiers intact',()=>{
 const before=structuredClone(item);
 const result=parseItemDetails(envelope([{templateId:id,nameEn:item.nameEn,nameKo:'합성 테스트 이름',koreanProvenance:korean,bazaardex:link}]),[item]);
 assert.equal(result.report.koreanMatched,1);assert.equal(result.report.linksMatched,1);
 setItemDetails(result.file);const next=enrichItem(item);
 assert.equal(next.name,'합성 테스트 이름');assert.equal(next.nameEn,item.nameEn);assert.equal(next.tiers,item.tiers);assert.deepEqual(item,before);assert.equal(getBazaardexUrl(item),link.url);
 assert.equal(getBazaardexUrl({...item,nameEn:'Another item'}),null);assert.equal(enrichItem({...item,nameEn:'Another item'}).name,item.name);
 setItemDetails(null);
});
test('no fuzzy names or conflicting duplicate IDs are accepted',()=>{
 const r=parseItemDetails(envelope([{templateId:id,nameEn:'synthetic item',bazaardex:link},{templateId:'22222222-2222-4222-8222-222222222222',nameEn:item.nameEn,bazaardex:link}]),[item]);
 assert.equal(r.file.records.length,0);assert.equal(r.report.issues.length,2);
 const repeated={templateId:id,nameEn:item.nameEn,bazaardex:link};
 assert.equal(parseItemDetails(envelope([repeated,repeated]),[item]).file.records.length,0);
});
test('machine translation labels and missing official source hashes are rejected',()=>{
 for(const p of [{...korean,kind:'machine-translation'},{...korean,sourceSHA256:''},undefined]) {
  const r=parseItemDetails(envelope([{templateId:id,nameEn:item.nameEn,nameKo:'테스트',koreanProvenance:p}]),[item]);
  assert.equal(r.report.koreanMatched,0);assert.equal(r.report.issues.length,1);
 }
});
test('root/search/foreign hosts and redirect-like query values never become links',()=>{
 for(const url of ['https://www.bazaardex.com/','https://www.bazaardex.com/search','https://www.bazaardex.com/synthetic?url=https://evil.example','https://www.bazaardex.com.evil.example/item','http://www.bazaardex.com/item','https://user@www.bazaardex.com/item','https://www.bazaardex.com/item#fragment','https://www.bazaardex.com/item?','https://www.bazaardex.com/item#','https://www.bazaardex.com/%2e%2e/item']) assert.equal(validBazaardexUrl(url),false,url);
});
test('link records require exact page/name attestation, counts distinguish unmatched items',()=>{
 const r=parseItemDetails(envelope([{templateId:id,nameEn:item.nameEn,bazaardex:{...link,verifiedNameEn:'Wrong name'}}]),[item]);
 assert.equal(r.report.linksMatched,0);assert.equal(r.report.linksUnmatched,1);
 const valid=parseItemDetails(envelope([{templateId:id,nameEn:item.nameEn,bazaardex:link}]),[item]);
 assert.equal(valid.report.koreanMatched,0);assert.equal(valid.report.koreanUnconfirmed,1);assert.equal(valid.report.linksMatched,1);
});
