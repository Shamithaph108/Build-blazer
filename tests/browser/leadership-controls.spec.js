import {test,expect} from '@playwright/test';

test('leadership pause, previous and next work and profiles keep their full text reachable',async({page})=>{
  await page.goto('/#leadership');
  const track=page.locator('.reference-team-track');
  await page.locator('[data-team-pause]').click();
  await expect(page.locator('[data-team-pause]')).toHaveText('Resume scroll');
  const position=()=>track.evaluate(e=>e.style.transform);
  const before=await position();await page.waitForTimeout(250);expect(await position()).toBe(before);
  await page.locator('[data-team-step="1"]').click();const next=await position();expect(next).not.toBe(before);
  await page.locator('[data-team-step="-1"]').click();expect(await position()).not.toBe(next);
  await page.locator('[data-team-pause]').click();await expect(page.locator('[data-team-pause]')).toHaveText('Pause scroll');
  await page.locator('[data-team-pause]').click();
  await page.locator('.reference-person:not([data-clone]) [data-member]').first().click();
  const content=page.locator('#dialog-content');await expect(content).toBeVisible();
  const bio=content.locator('.preserve-lines');await expect(bio).toBeVisible();
  expect(await bio.evaluate(e=>getComputedStyle(e.parentElement).textAlign)).toBe('center');
  await content.evaluate(e=>e.scrollTop=e.scrollHeight);
  expect(await content.evaluate(e=>e.scrollHeight-e.scrollTop<=e.clientHeight+2)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#detail-dialog')).not.toBeVisible();
});

test('event photos expose usable cover, reorder and remove controls',async({page})=>{
  await page.goto('/admin/login');
  await page.getByLabel('Username').fill('browser-editor');
  await page.getByLabel('Password',{exact:true}).fill('browser-test-only-password-2026');
  await page.getByRole('button',{name:'Sign in'}).click();
  await page.goto('/admin#edit-events');
  const record=page.locator('#edit-events .record-item').filter({has:page.locator('.photo-option input:checked')}).first();
  await record.locator('summary').first().click();
  const photos=record.locator('.photo-option').filter({has:page.locator('input:checked')});
  const first=photos.first();
  await first.locator('[data-photo-cover]').scrollIntoViewIfNeeded();
  await expect(first.locator('[data-photo-cover]')).toBeVisible();
  expect(await first.evaluate(e=>{const box=e.getBoundingClientRect(),button=e.querySelector('[data-photo-cover]').getBoundingClientRect();return button.bottom<=box.bottom+1;})).toBe(true);
  if(await photos.count()>1){
    const path=await first.locator('input').inputValue();
    await first.locator('[data-photo-move="1"]').click();
    expect(await photos.nth(1).locator('input').inputValue()).toBe(path);
    await photos.nth(1).locator('[data-photo-cover]').click();
    await expect(record.locator('select[name="image"]')).toHaveValue(path);
  }
});
