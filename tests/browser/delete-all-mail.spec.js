import {test,expect} from '@playwright/test';

test('bulk mail deletion can be cancelled and confirmed without losing the click target',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/admin/login');
  await page.getByLabel('Username').fill('browser-editor');
  await page.getByLabel('Password',{exact:true}).fill('browser-test-only-password-2026');
  await page.getByRole('button',{name:'Sign in'}).click();
  await expect(page).toHaveURL(/\/admin$/);
  const status=await page.evaluate(async()=>{
    const csrf=document.querySelector('meta[name="csrf-token"]').content;
    const response=await fetch('/api/submissions',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({name:'Delete Test',email:'delete-test@example.com',purpose:'contact',message:'Temporary browser test for outbox deletion.',consent:'yes',website:''})});
    return response.status;
  });
  expect(status).toBe(201);
  await page.goto('/admin?refresh=outbox#mail-center');
  const items=page.locator('[data-mail-id]');
  const count=await items.count();expect(count).toBeGreaterThan(0);
  await page.locator('[data-delete-all-mail]').click();
  await page.locator('#confirm-dialog [value="cancel"]').click();
  await expect(items).toHaveCount(count);
  await page.locator('[data-delete-all-mail]').click();
  const responsePromise=page.waitForResponse(response=>response.url().endsWith('/api/admin/outbox')&&response.request().method()==='DELETE');
  await page.locator('#confirm-dialog [value="confirm"]').click();
  expect((await responsePromise).status()).toBe(200);
  await expect(items).toHaveCount(0);
  await page.reload();
  await expect(items).toHaveCount(0);
  expect(errors).toEqual([]);
});
