import {test,expect} from '@playwright/test';
test('chat and recovery controls work on desktop and mobile',async({page})=>{
  test.setTimeout(60000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await page.getByRole('button',{name:'Ask CIPHER'}).click();
  await expect(page.locator('#cipher-chat')).toBeVisible();
  await page.getByLabel('Your question').fill('How can I join CIPHER?');await page.locator('#cipher-chat-form button').click();
  await expect(page.locator('.chat-messages')).toContainText('Use Join / Contact');
  expect(await page.locator('#cipher-chat').evaluate(e=>e.getBoundingClientRect().right<=innerWidth)).toBe(true);
  await page.keyboard.press('Escape');await expect(page.locator('#cipher-chat')).not.toBeVisible();
  await page.goto('/admin/login');await page.getByRole('link',{name:'Forgot password?'}).click();await expect(page.getByRole('heading',{name:'Forgot password?'})).toBeVisible();
  await page.getByLabel('Username').fill('nonexistent');await page.getByRole('button',{name:'Send reset link'}).click();await expect(page.getByRole('status').first()).toContainText('If that account');
  await page.goto('/admin/login');await page.getByLabel('Username').fill('browser-editor');await page.getByLabel('Password',{exact:true}).fill('browser-test-only-password-2026');await page.getByRole('button',{name:'Sign in'}).click();
  await page.goto('/admin#announcements');await expect(page.getByRole('heading',{name:'Announcements',exact:true})).toBeVisible();
  const notice=page.locator('.announcement-form');await notice.getByLabel('Title',{exact:true}).fill('Community test announcement');await notice.getByLabel('Message',{exact:true}).fill('An announcement for the browser test only.');await notice.getByLabel('Published',{exact:true}).check();await notice.getByRole('button',{name:'Save announcement'}).click();await expect(page.locator('#studio-notice')).toContainText('Announcement published');
  await page.goto('/');await expect(page.locator('#announcement')).toContainText('Community test announcement');expect(await page.locator('#announcement').evaluate(e=>e.getBoundingClientRect().left>=0&&e.getBoundingClientRect().right<=innerWidth)).toBe(true);
  await page.goto('/admin#settings');await expect(page.getByRole('heading',{name:'Password recovery'})).toBeVisible();
  expect(errors).toEqual([]);
});
