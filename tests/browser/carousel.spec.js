import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('public content carousels support arrows, keyboard, drag and filtered events',async({page,isMobile},info)=>{
  test.setTimeout(60000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/#about');await expect(page.locator('[data-motion-toggle]')).toHaveCount(0);
  for(const [name,minimum] of [['CIPHER moments',4],['Domains',4],['Leadership',5],['Events and workshops',2],['Activities',17]]){
    const region=page.getByRole('region',{name,exact:true});
    const total=await region.locator('.carousel-slot:not([hidden])').count();expect(total).toBeGreaterThanOrEqual(minimum);
    await region.getByRole('button',{name:`Next: ${name}`,exact:true}).click();
    await expect(region.locator('.carousel-count')).toHaveText(`02 / ${String(total).padStart(2,'0')}`);
    await expect.poll(()=>region.locator('.carousel-track').evaluate(el=>el.scrollLeft)).toBeGreaterThan(30);
    await region.locator('.carousel-track').focus();await page.keyboard.press('Home');
    await expect(region.locator('.carousel-count')).toHaveText(`01 / ${String(total).padStart(2,'0')}`);
  }
  const photos=page.getByRole('region',{name:'CIPHER moments',exact:true}),track=photos.locator('.carousel-track');
  await track.scrollIntoViewIfNeeded();const box=await track.boundingBox();
  if(!isMobile){await page.mouse.move(box.x+box.width*.8,box.y+box.height*.4);await page.mouse.down();await page.mouse.move(box.x+box.width*.15,box.y+box.height*.4,{steps:12});await page.mouse.up();}
  else{
    const cdp=await page.context().newCDPSession(page),y=box.y+box.height*.4;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width*.8,y}]});
    for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width*(.8-i*.075),y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  }
  await expect.poll(()=>track.evaluate(el=>el.scrollLeft)).toBeGreaterThan(30);
  await page.screenshot({path:`test-results/carousels-${info.project.name}.png`});
  await page.goto('/events');await page.getByRole('searchbox').fill('PROMPT');
  const events=page.locator('.carousel-shell[aria-label="Event archive"]');await expect(events.locator('.carousel-count')).toHaveText('01 / 01');await expect(events.getByRole('button',{name:'Next: Event archive'})).toBeDisabled();
  await page.getByRole('searchbox').fill('no matching event');await expect(page.locator('#no-events')).toBeVisible();await expect(events).not.toBeVisible();
  await page.getByRole('searchbox').fill('');const archiveTotal=await events.locator('.carousel-slot:not([hidden])').count();await expect(events.locator('.carousel-count')).toHaveText(`01 / ${String(archiveTotal).padStart(2,'0')}`);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});

test('member popups fit without scrolling and paginate complete long biographies',async({page,isMobile},info)=>{
  test.setTimeout(60000);await page.goto('/#leadership');
  const trigger=page.locator('.reference-person .profile-button').first();await trigger.click();
  const dialog=page.locator('#detail-dialog');await expect(dialog).toBeVisible();
  await expect.poll(()=>dialog.locator('#dialog-content').evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true);
  await expect(dialog.locator('[data-profile-bio]')).toContainText('Treasurer');
  const first=await dialog.locator('h2').textContent();await dialog.getByRole('button',{name:'Next member',exact:true}).click();await expect(dialog.locator('h2')).not.toHaveText(first);
  await expect(dialog.getByRole('button',{name:'Close dialog'})).toBeInViewport();
  await expect(dialog.locator('.member-navigation')).toBeInViewport();
  expect((await new AxeBuilder({page}).include('#detail-dialog').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.map(v=>v.id)).toEqual([]);
  await page.screenshot({path:`test-results/fitted-profile-${info.project.name}.png`});await page.keyboard.press('Escape');
  const longBio=('CIPHER members learn, collaborate and build projects together. '.repeat(20))+'End of complete biography.';
  await page.locator('template[id^="member-"]').first().evaluate((template,bio)=>template.content.querySelector('[data-profile-bio]').textContent=bio,longBio);
  await trigger.click();await expect(dialog.locator('.bio-pagination')).toBeVisible();
  let combined='';
  for(let i=0;i<30;i++){
    combined+=(await dialog.locator('[data-profile-bio]').textContent()).replace(/\s/g,'');
    expect(await dialog.locator('.member-bio').evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true);
    const next=dialog.getByRole('button',{name:'Next biography page'});if(await next.isDisabled())break;await next.click();
  }
  expect(combined).toBe(longBio.replace(/\s/g,''));
  if(isMobile){await page.setViewportSize({width:844,height:390});await expect.poll(()=>dialog.evaluate(el=>el.getBoundingClientRect().height<innerHeight)).toBe(true);await expect(dialog.getByRole('button',{name:'Close dialog'})).toBeInViewport();}
  await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
});
