import {test,expect} from '@playwright/test';
test('chat and recovery controls work on desktop and mobile',async({page})=>{
  test.setTimeout(60000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');expect(await page.locator('.brand img').evaluate(e=>getComputedStyle(e).filter)).toBe('none');await page.getByRole('button',{name:'Ask CIPHER'}).click();
  await expect(page.locator('#cipher-chat')).toBeVisible();
  await page.getByLabel('Your question').fill('How can I join CIPHER?');await page.locator('#cipher-chat-form button').click();
  await expect(page.locator('.chat-messages')).toContainText('Use Join / Contact');
  expect(await page.locator('#cipher-chat').evaluate(e=>e.getBoundingClientRect().right<=innerWidth)).toBe(true);
  for(let i=0;i<3;i++){await page.getByLabel('Your question').fill('How can I join CIPHER?');await page.locator('#cipher-chat-form button').click();await expect(page.locator('#cipher-chat-form button')).toBeEnabled();}
  const history=page.locator('.chat-messages');expect(await history.evaluate(e=>e.scrollHeight>e.clientHeight)).toBe(true);await history.evaluate(e=>e.scrollTop=0);expect(await history.evaluate(e=>e.scrollTop)).toBe(0);await history.focus();await page.keyboard.press('End');
  await page.getByRole('button',{name:'Close chat',exact:true}).click();await expect(page.locator('#cipher-chat')).not.toBeVisible();
  await page.goto('/admin/login');await page.getByRole('link',{name:'Forgot password?'}).click();await expect(page.getByRole('heading',{name:'Forgot password?'})).toBeVisible();
  await page.getByLabel('Username').fill('nonexistent');await page.getByRole('button',{name:'Send reset link'}).click();await expect(page.getByRole('status').first()).toContainText('If that account');
  await page.goto('/admin/login');await page.getByLabel('Username').fill('browser-editor');await page.getByLabel('Password',{exact:true}).fill('browser-test-only-password-2026');await page.getByRole('button',{name:'Sign in'}).click();
  await page.goto('/admin#announcements');await expect(page.getByRole('heading',{name:'Announcements',exact:true})).toBeVisible();
  const notice=page.locator('.announcement-form');await notice.getByLabel('Title',{exact:true}).fill('Community test announcement');await notice.getByLabel('Message',{exact:true}).fill('An announcement for the browser test only.');await notice.getByLabel('Published',{exact:true}).check();await notice.getByRole('button',{name:'Save announcement'}).click();await expect(page.locator('#studio-notice')).toContainText('Announcement published');
  await page.goto('/');await page.locator('[data-announcements-open]').click();await expect(page.locator('#announcements-dialog')).toContainText('Community test announcement');await page.getByRole('button',{name:'Close announcements',exact:true}).click();await expect(page.locator('#announcements-dialog')).not.toBeVisible();
  await expect(page.locator('.site-header .nav-cta')).toHaveCount(0);
  await page.goto('/admin#announcements');await page.getByRole('button',{name:'Delete all announcements',exact:true}).click();await page.locator('[data-confirm-accept]').click();await expect(page.locator('#studio-notice')).toContainText('Announcement deleted');await page.goto('/');await page.locator('[data-announcements-open]').click();await expect(page.locator('#announcements-dialog')).toContainText('No announcements right now');await page.keyboard.press('Escape');
  await page.goto('/admin#settings');await expect(page.getByRole('heading',{name:'Password recovery'})).toBeVisible();
  expect(errors).toEqual([]);
});
