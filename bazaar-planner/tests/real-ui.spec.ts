/** Optional integration checks against a user-private, previously imported profile.
 * No game data or artwork is embedded in the repository or build. */
import {test, expect, chromium} from '@playwright/test';
import {cp,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
for(const mobile of [false,true]) test(`real artwork stays within board; image visibility and backup (${mobile?'mobile':'PC'})`,async()=>{
  test.skip(!process.env.BAZAAR_PRIVATE_PROFILE || !process.env.CHRONICLE_TEST_JSON,'Requires private local files');
  test.setTimeout(120000);
  const dir=await mkdtemp(join(tmpdir(),'bazaar-ui-profile-'));
  await cp(process.env.BAZAAR_PRIVATE_PROFILE!,dir,{recursive:true});
  const context=await chromium.launchPersistentContext(dir,{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',headless:true,acceptDownloads:true,downloadsPath:join(dir,"downloads"),viewport:mobile?{width:390,height:844}:{width:1440,height:1100},isMobile:mobile,hasTouch:mobile});
  try{
    const page=await context.newPage();await page.goto('http://127.0.0.1:5175');
    await expect(page.getByRole('note')).toContainText('1117개');
    const input=JSON.parse(await readFile(process.env.CHRONICLE_TEST_JSON!,'utf8'));
    const pairs=[['Vanessa','바네사'],['Pygmalien','피그말리엔'],['Dooley','둘리'],['Mak','막'],['Stelle','스텔'],['Jules','쥴스'],['Karnok','카르녹'],['Dragons','드래곤즈'],['Common','중립']];
    let withImages=0,all=0; const visibleIds = new Set<string>(), allIds = new Set<string>();
    for(const [id,label] of pairs){
      await page.getByLabel('영웅 선택',{exact:true}).selectOption({label});
      const expected=input.items.filter((i:any)=>i.heroes.includes(id));
      if(!expected.length) await expect(page.locator('.empty-search')).toContainText('불러온 도감에 이 영웅의 아이템이 없습니다.');
      await expect(page.locator('.item-grid .item-card')).toHaveCount(expected.filter((i:any)=>i.imageId).length);
      withImages+=await page.locator('.item-grid .item-card').count();
      for(const id of await page.locator('.item-grid .item-card').evaluateAll(cards=>cards.map(c=>c.getAttribute('data-item-id')!))) visibleIds.add(id);
      await page.getByRole('checkbox',{name:'이미지 없는 아이템 표시'}).check();
      await expect(page.locator('.item-grid .item-card')).toHaveCount(expected.length);
      all+=await page.locator('.item-grid .item-card').count();
      for(const id of await page.locator('.item-grid .item-card').evaluateAll(cards=>cards.map(c=>c.getAttribute('data-item-id')!))) allIds.add(id);
      await page.getByRole('checkbox',{name:'이미지 없는 아이템 표시'}).uncheck();
    }
    // Multi-hero records occur in several filters; count unique stable item IDs.
    expect(visibleIds.size).toBe(1080); expect(allIds.size).toBe(1117); expect(allIds.size-visibleIds.size).toBe(37);
    await expect(page.locator('.image-filter-help')).toContainText('1080 / 1117개');
    await page.getByRole('checkbox',{name:'이미지 없는 아이템 표시'}).check();
    await expect(page.locator('.image-filter-help')).toContainText('1117 / 1117개');
    await page.getByRole('checkbox',{name:'이미지 없는 아이템 표시'}).uncheck();
    await page.getByLabel('영웅 선택',{exact:true}).selectOption({label:'바네사'});
    await page.getByRole('button',{name:'새 덱',exact:true}).click();
    const names:string[]=[];
    for(const size of ['small','medium','large']){
      const item=input.items.find((i:any)=>i.size===size&&i.heroes.includes('Vanessa')&&i.imageId&&!i.ignored);
      names.push(item.name);
      await page.getByLabel('아이템 검색',{exact:true}).fill(item.name);
      await page.getByRole('button',{name:item.name,exact:true}).click();await page.getByRole('button',{name:'빈 공간에 추가'}).click();
    }
    await expect(page.locator('.board img')).toHaveCount(3);
    await expect.poll(()=>page.locator('.board img').evaluateAll(imgs=>imgs.every(i=>(i as HTMLImageElement).naturalWidth>0))).toBe(true);
    const bounds=await page.locator('.board').evaluate(board=>{
      const b=board.getBoundingClientRect();
      return [...board.querySelectorAll('.on-board')].map(card=>{
        const c=card.getBoundingClientRect(),wrap=card.parentElement!.getBoundingClientRect();
        const placement=card.closest('.placed-wrap')!;
        const start=parseInt((placement as HTMLElement).style.gridColumn,10)-1;
        const slot=board.querySelector(`[data-testid="slot-${start}"]`)!.getBoundingClientRect();
        const remove=placement.querySelector('.card-controls button')!.getBoundingClientRect();
        const art=card.querySelector('.art')!.getBoundingClientRect(),name=card.querySelector('strong')!.getBoundingClientRect();
        const img=card.querySelector('img')!;
        return {slotTopDelta:Math.abs(c.top-slot.top),slotBottomDelta:Math.abs(c.bottom-slot.bottom),removeInside:c.bottom-remove.bottom,removeBelowName:remove.top-name.bottom,top:c.top-b.top,bottom:b.bottom-c.bottom,height:c.height,wrapHeight:wrap.height,scrollHeight:card.scrollHeight,clientHeight:card.clientHeight,artHeight:art.height,nameBottom:c.bottom-name.bottom,fit:getComputedStyle(img).objectFit};
      });
    });
    for(const b of bounds){expect(b.slotTopDelta).toBeLessThanOrEqual(1);expect(b.slotBottomDelta).toBeLessThanOrEqual(1);expect(b.removeInside).toBeGreaterThanOrEqual(0);expect(b.removeBelowName).toBeGreaterThanOrEqual(0);expect(b.top).toBeGreaterThanOrEqual(0);expect(b.bottom).toBeGreaterThanOrEqual(0);expect(b.height).toBeLessThanOrEqual(b.wrapHeight+1);expect(b.scrollHeight).toBeLessThanOrEqual(b.clientHeight+1);expect(b.artHeight).toBeGreaterThan(10);expect(b.nameBottom).toBeGreaterThanOrEqual(0);expect(b.fit).toBe('contain');}
    const source=page.getByRole('button',{name:names[2]+' 보드 아이템',exact:true});
    if(!mobile){
      const a=(await source.boundingBox())!,b=(await page.getByTestId('slot-6').boundingBox())!;
      await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(a.x+a.width/2+9,a.y+a.height/2,{steps:3});await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:20});await page.mouse.up();
    }else{
      // Touch long press with repeated target measurements, including scrolled board.
      await page.locator('.board-scroll').evaluate(e=>{e.scrollLeft=180;});
      await source.scrollIntoViewIfNeeded();const cdp=await context.newCDPSession(page);const a=(await source.boundingBox())!;
      const start={x:a.x+a.width/2,y:a.y+a.height/2};await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});await page.waitForTimeout(300);
      const b=(await page.getByTestId('slot-6').boundingBox())!;
      for(let n=1;n<=25;n++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(b.x+b.width/2-start.x)*n/25,y:start.y+(b.y+b.height/2-start.y)*n/25}]});await page.waitForTimeout(16);}
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }
    const active=()=>page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('bazaar-planner-v1')!);return s.decks.find((d:any)=>d.id===s.activeId);});
    await expect.poll(async()=>(await active()).items[2].start).toBe(6);
    // An image-less item can remain on the board even when hidden in the catalog.
    await page.getByLabel('아이템 검색',{exact:true}).fill('');await page.getByRole('checkbox',{name:'이미지 없는 아이템 표시'}).check();
    const missing=input.items.find((i:any)=>i.heroes.includes('Vanessa')&&!i.imageId&&i.size==='small');
    await page.getByLabel('아이템 검색',{exact:true}).fill(missing.name);await page.getByRole('button',{name:missing.name,exact:true}).click();await page.getByRole('button',{name:'빈 공간에 추가'}).click();
    await page.getByRole('checkbox',{name:'이미지 없는 아이템 표시'}).uncheck();
    await expect(page.getByRole('button',{name:missing.name+' 보드 아이템',exact:true})).toBeAttached();
    await page.screenshot({path:test.info().outputPath(`board-fixed-${mobile?'mobile':'pc'}.png`),fullPage:true});
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('bazaar-planner-v1')!));
    // Capture the actual exported Blob before the OS download handoff. Standard
    // planner tests separately exercise real downloads; copied persistent Chromium
    // profiles in this runner can exit at that handoff.
    await page.evaluate(() => {
      const blobs = new Map<string, Blob>();
      const create = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => { const url=create(blob); if(blob instanceof Blob) blobs.set(url,blob); return url; };
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        const blob=blobs.get(this.href);
        if(this.download && blob) (window as any).__deckExport={name:this.download,text:blob.text()};
        else click.call(this);
      };
    });
    await page.getByRole('button',{name:'JSON 내보내기',exact:true}).click();
    const exported=await page.evaluate(async()=>({name:(window as any).__deckExport.name,text:await (window as any).__deckExport.text}));
    expect(exported.name).toMatch(/bazaar.*\.json$/);expect(JSON.parse(exported.text)).toEqual(saved);
    const backup=join(dir,'backup.json');await writeFile(backup,exported.text);
    await page.getByRole('button',{name:'새 덱',exact:true}).click();await page.getByTestId('deck-import').setInputFiles(backup);
    await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('bazaar-planner-v1')!))).toEqual(saved);
    await page.reload();await expect(page.getByRole('button',{name:missing.name+' 보드 아이템',exact:true})).toBeAttached();
    await expect(page.locator('.board img')).toHaveCount(3);
    console.log(JSON.stringify({mobile,withImages,all,uniqueImages:1080,uniqueItems:1117,bounds}));
  }finally{await context.close();await rm(dir,{recursive:true,force:true});}
});
