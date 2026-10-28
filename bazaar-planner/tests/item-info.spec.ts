/** Synthetic metadata only: these names/URLs are test fixtures, not real game mappings. */
import {test,expect,type Page} from '@playwright/test';
const templateId='11111111-1111-4111-8111-111111111111';
const secondId='22222222-2222-4222-8222-222222222222';
const nameEn='SYNTHETIC EXTERNAL ITEM';
const nameKo='합성 테스트 기물';
const url='https://www.bazaardex.com/fixture/synthetic';
const record={id:templateId,name:nameEn,heroes:['Vanessa'],size:'small',tags:['Synthetic'],ignored:false,imageId:null};
const mapping={format:'bazaar-item-details-v1',records:[{
  templateId,nameEn,nameKo,
  koreanProvenance:{kind:'official-game-localization',source:'TEST ONLY synthetic localization fixture',key:'test.item.name',sourceSHA256:'a'.repeat(64)},
  bazaardex:{url,sourcePage:url,verifiedNameEn:nameEn,verifiedAt:'2026-10-28T00:00:00Z'},
}]};
async function loadCatalog(page:Page){
  await page.goto('/');
  await expect(page.getByRole('button',{name:'원본 JSON 불러오기',exact:true})).toBeEnabled();
  await page.getByTestId('raw-import').setInputFiles({name:'synthetic-metadata.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'bazaar-chronicle-metadata-v1',items:[record,{...record,id:secondId,name:'UNMAPPED ITEM'}]}))});
  await page.getByRole('button',{name:'이 파일을 개인 도감으로 사용',exact:true}).click();
  await page.getByRole('checkbox',{name:'이미지 없는 아이템 표시'}).check();
}
async function loadMapping(page:Page,value:unknown=mapping){
  await page.getByRole('button',{name:'한국어 이름·외부 링크 관리',exact:true}).click();
  await page.getByTestId('item-details-import').setInputFiles({name:'synthetic-details.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
}
async function saved(page:Page){return page.evaluate(()=>JSON.parse(localStorage.getItem('bazaar-planner-v1')!));}
test('exact local mapping gives bilingual search and direct secure link clicks without interfering with placement/removal',async({page})=>{
  await page.addInitScript(()=>{
    (window as any).__openedUrls=[];
    window.open=((url?:string|URL,target?:string,features?:string)=>{(window as any).__openedUrls.push({url:String(url),target,features});return null;}) as typeof window.open;
  });
  await loadCatalog(page);
  await loadMapping(page);
  await page.getByRole('button',{name:'이 이름·링크 매핑 적용',exact:true}).click();
  await page.getByRole('button',{name:'이름·링크 관리 닫기',exact:true}).click();
  await expect(page.getByRole('button',{name:nameKo,exact:true})).toBeVisible();
  for(const query of [nameKo,nameEn]){
    await page.getByLabel('아이템 검색',{exact:true}).fill(query);
    await expect(page.locator('.item-grid .item-card')).toHaveCount(1);
    await expect(page.locator('.item-grid .item-card')).toContainText(nameEn);
  }
  await page.getByRole('button',{name:nameKo,exact:true}).click();
  await expect(page.getByRole('dialog',{name:'아이템 툴팁'})).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).__openedUrls)).toEqual([{url,target:'_blank',features:'noopener,noreferrer'}]);
  await page.getByRole('button',{name:`${nameKo} 보드에 추가`,exact:true}).click();
  const existing=await saved(page);
  expect(existing.decks[0].items[0].itemId).toBe('local-raw:'+templateId);
  existing.decks[0].items[0].tier='다이아몬드';existing.decks[0].items[0].enchant='화염';
  await page.getByTestId('deck-import').setInputFiles({name:'old-grades.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(existing))});
  const source=page.getByRole('button',{name:`${nameKo} 보드 아이템`,exact:true});
  await expect(source).not.toContainText('다이아몬드');await expect(source).not.toContainText('화염');
  await source.scrollIntoViewIfNeeded();const a=(await source.boundingBox())!,b=(await page.getByTestId('slot-3').boundingBox())!;
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(a.x+a.width/2+10,a.y+a.height/2,{steps:3});await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:20});await page.mouse.up();
  await expect.poll(async()=>(await saved(page)).decks[0].items[0].start).toBe(3);
  expect(await page.evaluate(()=>(window as any).__openedUrls.length)).toBe(1);
  await page.reload();await page.getByRole('checkbox',{name:'이미지 없는 아이템 표시'}).check();
  await expect(page.getByRole('button',{name:nameKo,exact:true})).toBeVisible();
  const restored=await saved(page);expect(restored.decks[0].items[0]).toMatchObject({tier:'다이아몬드',enchant:'화염',start:3});
  await page.getByRole('button',{name:`${nameKo} 보드에서 제거`,exact:true}).click();
  await expect.poll(async()=>(await saved(page)).decks[0].items.length).toBe(0);
  await page.getByLabel('아이템 검색',{exact:true}).fill('UNMAPPED');
  await page.getByRole('button',{name:'UNMAPPED ITEM',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'아이템 툴팁'});
  await expect(dialog.getByRole('button',{name:/^Bazaardex에서 보기/})).toBeDisabled();
  await expect(dialog).not.toContainText('브론즈');await expect(dialog).not.toContainText(secondId);
});
test('wrong-name link mapping cannot replace an existing exact mapping',async({page})=>{
  await loadCatalog(page);await loadMapping(page);
  await page.getByRole('button',{name:'이 이름·링크 매핑 적용',exact:true}).click();await page.getByRole('button',{name:'이름·링크 관리 닫기',exact:true}).click();
  const wrong=structuredClone(mapping);wrong.records[0].nameEn='SIMILAR BUT WRONG';wrong.records[0].bazaardex.verifiedNameEn='SIMILAR BUT WRONG';
  await loadMapping(page,wrong);
  await expect(page.getByRole('button',{name:'이 이름·링크 매핑 적용',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'이름·링크 관리 닫기',exact:true}).click();
  await expect(page.getByRole('button',{name:nameKo,exact:true})).toBeVisible();
});
