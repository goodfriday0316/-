import { test, expect } from '@playwright/test';
import { ZipWriter, Uint8ArrayWriter, Uint8ArrayReader } from '@zip.js/zip.js';
const id='11111111-1111-4111-8111-111111111111';
const record={id,name:'Synthetic image test',heroes:['Vanessa'],size:'small',tags:[],ignored:false,imageId:id};
async function apply(page: import('@playwright/test').Page, buffer:Buffer) {
  await page.goto('/');
  await expect(page.getByTestId('raw-import')).toBeAttached();
  await expect(page.getByRole('button',{name:'원본 JSON 불러오기',exact:true})).toBeEnabled();
  await page.getByTestId('raw-import').setInputFiles({name:'metadata.json',mimeType:'application/json',buffer});
  await page.getByRole('button',{name:'이 파일을 개인 도감으로 사용'}).click();
}
test('ZIP UUID matching, invalid/duplicate reports, actual Blob rendering and persistence in a new page',async({page,context})=>{
  await apply(page,Buffer.from(JSON.stringify({format:'bazaar-chronicle-metadata-v1',items:[record,{...record,id:'22222222-2222-4222-8222-222222222222',name:'Missing image',imageId:null}]})));
  const bytes=await page.evaluate(async()=>{
    const c=document.createElement('canvas');c.width=8;c.height=8;c.getContext('2d')!.fillRect(0,0,8,8);
    const b=await new Promise<Blob>(resolve=>c.toBlob(b=>resolve(b!),'image/webp'));
    return [...new Uint8Array(await b.arrayBuffer())];
  });
  const writer=new ZipWriter(new Uint8ArrayWriter(),{useWebWorkers:false});
  await writer.add(`items/${id}.webp`,new Uint8ArrayReader(new Uint8Array(bytes)));
  await writer.add('items/unmatched.webp',new Uint8ArrayReader(new Uint8Array(bytes)));
  await writer.add('items/33333333-3333-4333-8333-333333333333.webp',new Uint8ArrayReader(new Uint8Array([1,2,3])));
  const zip=await writer.close();
  await page.getByRole('button',{name:'개인 도감 관리',exact:true}).click();
  await page.getByTestId('image-import').setInputFiles({name:'items.zip',mimeType:'application/zip',buffer:Buffer.from(zip)});
  await expect(page.getByRole('dialog',{name:'개인 도감 관리'}).getByRole('status')).toContainText('매칭·저장 1 / 실패 2 / 이미지 없는 아이템 1');
  await page.getByRole('button',{name:'개인 도감 닫기',exact:true}).click();
  await expect(page.locator('.item-grid img')).toHaveCount(1);
  await expect.poll(()=>page.locator('.item-grid img').evaluate((e:HTMLImageElement)=>e.naturalWidth)).toBe(8);
  await page.locator('.item-grid .item-card').filter({hasText:'Synthetic image test'}).click();
  await expect(page.getByRole('dialog',{name:'아이템 툴팁'}).locator('img')).toHaveCount(1);
  await page.getByRole('button',{name:'빈 공간에 추가'}).click();
  await expect(page.locator('.board img')).toHaveCount(1);
  const next=await context.newPage();await page.close();await next.goto('/');
  await expect(next.locator('.item-grid img')).toHaveCount(1);
  await expect(next.locator('.board img')).toHaveCount(1);
  await expect.poll(()=>next.locator('.board img').evaluate((e:HTMLImageElement)=>e.naturalWidth)).toBe(8);
  await next.close();
});
test('duplicate UUID paths and corrupt WebP never overwrite a saved image',async({page})=>{
  await apply(page,Buffer.from(JSON.stringify({format:'bazaar-chronicle-metadata-v1',items:[record]})));
  const writer=new ZipWriter(new Uint8ArrayWriter(),{useWebWorkers:false});
  for(const path of [`a/${id}.webp`,`b/${id}.webp`])await writer.add(path,new Uint8ArrayReader(new Uint8Array([1,2,3])));
  await page.getByRole('button',{name:'개인 도감 관리',exact:true}).click();
  await page.getByTestId('image-import').setInputFiles({name:'duplicate.zip',mimeType:'application/zip',buffer:Buffer.from(await writer.close())});
  await expect(page.getByRole('dialog',{name:'개인 도감 관리'}).getByRole('status')).toContainText('매칭·저장 0 / 실패 2 / 이미지 없는 아이템 1');
  const broken=new ZipWriter(new Uint8ArrayWriter(),{useWebWorkers:false});await broken.add(`${id}.webp`,new Uint8ArrayReader(new Uint8Array([1,2,3])));
  await page.getByTestId('image-import').setInputFiles({name:'broken.zip',mimeType:'application/zip',buffer:Buffer.from(await broken.close())});
  await expect(page.getByRole('dialog',{name:'개인 도감 관리'}).getByRole('status')).toContainText('매칭·저장 0 / 실패 1 / 이미지 없는 아이템 1');
});
test('actual read-only SQLite export imports all metadata and preserves deck on reload',async({page})=>{
  test.skip(!process.env.CHRONICLE_TEST_JSON,'Optional user-private dataset');
  const {readFile}=await import('node:fs/promises');
  await apply(page,await readFile(process.env.CHRONICLE_TEST_JSON!));
  await expect(page.getByRole('note')).toContainText('개인 파일 아이템 1117개');
  await page.reload();await expect(page.getByRole('note')).toContainText('개인 파일 아이템 1117개');
  await page.getByRole('checkbox', {name:'이미지 없는 아이템 표시'}).check();
  await expect(page.locator('.item-grid .item-card').first()).toBeVisible();
});
test('IndexedDB images and decks survive closing and restarting Chromium with the same profile',async()=>{
  const {chromium}=await import('@playwright/test');
  const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const profile=await mkdtemp(join(tmpdir(),'bazaar-profile-'));
  const options={executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',headless:true,baseURL:'http://127.0.0.1:5175'};
  let context=await chromium.launchPersistentContext(profile,options);
  try {
    const page=await context.newPage();
    await apply(page,Buffer.from(JSON.stringify({format:'bazaar-chronicle-metadata-v1',items:[record]})));
    const bytes=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=4;c.height=4;const b=await new Promise<Blob>(r=>c.toBlob(b=>r(b!),'image/webp'));return [...new Uint8Array(await b.arrayBuffer())];});
    const writer=new ZipWriter(new Uint8ArrayWriter(),{useWebWorkers:false});await writer.add(`${id}.webp`,new Uint8ArrayReader(new Uint8Array(bytes)));
    await page.getByRole('button',{name:'개인 도감 관리',exact:true}).click();
    await page.getByTestId('image-import').setInputFiles({name:'items.zip',mimeType:'application/zip',buffer:Buffer.from(await writer.close())});
    await expect(page.getByRole('dialog',{name:'개인 도감 관리'}).getByRole('status')).toContainText('매칭·저장 1');
    await page.getByRole('button',{name:'개인 도감 닫기',exact:true}).click();
    await page.locator('.item-grid .item-card').click();await page.getByRole('button',{name:'빈 공간에 추가'}).click();
    await expect(page.locator('.board img')).toHaveCount(1);
    await context.close();context=await chromium.launchPersistentContext(profile,options);
    const restored=await context.newPage();await restored.goto('/');
    await expect(restored.locator('.item-grid img')).toHaveCount(1);
    await expect.poll(()=>restored.locator('.board img').evaluate((e:HTMLImageElement)=>e.naturalWidth)).toBe(4);
  } finally {await context.close();await rm(profile,{recursive:true,force:true});}
});
for (const failure of ['missing-asset', 'constructor-blocked'] as const) {
  test(`JSON import still works when worker is ${failure}`, async ({ page }) => {
    if (failure === 'missing-asset') {
      await page.route('**/assets/raw-import.worker-*.js', route => route.abort());
    } else {
      await page.addInitScript(() => {
        window.Worker = function () { throw new DOMException('Worker blocked', 'SecurityError'); } as unknown as typeof Worker;
      });
    }
    const { readFile } = await import('node:fs/promises');
    const buffer = process.env.CHRONICLE_TEST_JSON
      ? await readFile(process.env.CHRONICLE_TEST_JSON)
      : Buffer.from(JSON.stringify({format:'bazaar-chronicle-metadata-v1',items:[record]}));
    const count = JSON.parse(buffer.toString('utf8')).items.length;
    await apply(page, buffer);
    await expect(page.getByRole('note')).toContainText(`개인 파일 아이템 ${count}개`);
    await expect(page.getByRole('note')).toContainText('이 브라우저에 보관됨');
    await page.reload();
    await expect(page.getByRole('note')).toContainText(`개인 파일 아이템 ${count}개`);
    // Invalid JSON must explain the error and leave the previous library intact.
    await page.getByTestId('raw-import').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{invalid')});
    await expect(page.getByRole('note')).toContainText('JSON 형식이 올바르지 않습니다.');
    await expect(page.getByRole('note')).toContainText(`개인 파일 아이템 ${count}개`);
  });
}
