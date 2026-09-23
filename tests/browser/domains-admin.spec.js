import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('adding a domain retains the original domains and admin shares the green motion treatment',async({page},info)=>{
  test.setTimeout(60000);
  await page.goto('/#domains');const originals=await page.locator('.reference-domain h3').allTextContents();expect(originals.length).toBeGreaterThanOrEqual(4);
  await page.goto('/admin/login');await page.getByLabel('Username').fill('browser-editor');await page.getByLabel('Password',{exact:true}).fill('browser-test-only-password-2026');await page.getByRole('button',{name:'Sign in'}).click();
  await expect(page.locator('body')).toHaveClass(/admin-site/);await expect(page.locator('#ambient-matrix')).toBeVisible();await expect(page.locator('[data-motion-toggle]')).toHaveCount(0);
  await page.goto('/admin#edit-domains');
  const add=page.locator('#edit-domains .new-item');await add.locator('summary').click();
  const title=`Approved domain ${info.project.name} ${Date.now()}`;
  expect(Number(await add.getByLabel('Display order').inputValue())).toBeGreaterThanOrEqual(4);
  await add.getByLabel('Domain title').fill(title);await add.getByLabel('Domain description').fill('A verified student domain created for this isolated test.');await add.getByLabel(/Published/).check();
  await page.screenshot({path:`test-results/green-admin-${info.project.name}.png`});
  expect((await new AxeBuilder({page}).include('.studio').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.map(v=>v.id)).toEqual([]);
  await add.getByRole('button',{name:/Create domain/}).click();await expect(page.locator('#studio-notice')).toContainText('Content saved.');
  for(const path of ['/#domains','/about']){
    await page.goto(path);const selector=path==='/#domains'?'.reference-domain h3':'.domain-card h3';
    const after=await page.locator(selector).allTextContents();for(const original of originals)expect(after).toContain(original);expect(after).toContain(title);expect(after.length).toBe(originals.length+1);
  }
});

test('event gallery cards tilt with the pointer on Home and Events and respect reduced motion',async({page,isMobile},info)=>{
  test.setTimeout(45000);
  for(const path of ['/#events','/events']){
    await page.goto(path);await page.getByRole('button',{name:/View PROMPT.*gallery/}).click();
    const gallery=page.locator('#detail-dialog .gallery'),image=gallery.locator('.gallery-slide:not([hidden]) img');
    await expect.poll(()=>image.evaluate(el=>el.complete&&el.naturalWidth>0)).toBe(true);
    if(!isMobile){
      const box=await gallery.boundingBox();await page.mouse.move(box.x+box.width*.2,box.y+box.height*.3);
      await expect.poll(()=>gallery.evaluate(el=>parseFloat(el.style.getPropertyValue('--card-turn')))).toBeLessThan(0);
      await page.mouse.move(box.x+box.width*.8,box.y+box.height*.3);
      await expect.poll(()=>gallery.evaluate(el=>parseFloat(el.style.getPropertyValue('--card-turn')))).toBeGreaterThan(0);
      await expect(gallery.locator('.gallery-slide:not([hidden])')).not.toHaveCSS('transform','none');
      await page.mouse.move(2,2);await expect(gallery).not.toHaveClass(/card-hovering/);
    }
    await gallery.getByRole('button',{name:'Next photograph'}).click();await expect(gallery.locator('[data-gallery-count]')).toHaveText('02 / 08');
    await page.screenshot({path:`test-results/gallery-card-${path==='/events'?'events':'home'}-${info.project.name}.png`,animations:'disabled'});
    await page.emulateMedia({reducedMotion:'reduce'});await expect(gallery.locator('.gallery-slide:not([hidden])')).toHaveCSS('transform','none');
    await page.keyboard.press('Escape');await page.emulateMedia({reducedMotion:'no-preference'});
  }
});
