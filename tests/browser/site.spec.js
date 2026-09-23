import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';
test.use({actionTimeout:15000});
async function confirmChange(page){await page.locator('#confirm-dialog [value="confirm"]').click();}
async function logout(page,isMobile){if(isMobile)await page.getByRole('button',{name:'Menu'}).click();await page.getByRole('button',{name:'Logout',exact:true}).click();}

async function skipOpening(page){
  const intro=page.locator('#intro');
  // The timed intro may finish while a busy browser is preparing the next action.
  if(await intro.isVisible())await page.keyboard.press('Escape');
  if(await intro.count())await expect(intro).not.toBeVisible();
}

test('all pages work without overflow, browser errors, broken images or serious accessibility violations',async({page},testInfo)=>{
  test.setTimeout(60000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const route of ['/','/about','/events','/team','/join']){
    await page.goto(route);if(route==='/')await skipOpening(page);await expect(page.locator('h1')).toBeVisible();
    await page.locator('footer').scrollIntoViewIfNeeded();
    // Off-screen carousel copies intentionally stay lazy until they enter view.
    // Force loading here so the asset-integrity assertion covers every source.
    await page.locator('img').evaluateAll(images=>images.forEach(image=>image.loading='eager'));
    await expect.poll(()=>page.locator('img').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth>0))).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const accessibility=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect(accessibility.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
  }
  expect(errors).toEqual([]);
  await page.goto('/');await skipOpening(page);await page.screenshot({path:`test-results/home-${testInfo.project.name}.png`,fullPage:true});
});
test('navigation, event filters, gallery and profile dialogs work with keyboard and touch',async({page,isMobile})=>{
  await page.goto('/');await skipOpening(page);
  if(isMobile){await page.getByRole('button',{name:'Menu'}).click();await expect(page.locator('#primary-nav')).toBeVisible();}
  await page.locator('#primary-nav').getByRole('link',{name:'Events',exact:true}).click();
  await expect(page).toHaveURL(/#events$/);
  await page.getByRole('button',{name:/View PROMPT.*gallery/}).click();await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Next photograph'}).click();await expect(page.locator('dialog [data-gallery-count]')).toHaveText('02 / 08');
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.goto('/events');
  await page.getByRole('button',{name:'Workshop',exact:true}).click();await expect(page.locator('#no-events')).toBeVisible();
  await page.getByRole('button',{name:'All',exact:true}).click();
  await page.getByRole('searchbox').fill('PROMPT');await expect(page.locator('.event-card:visible')).toHaveCount(1);
  await page.getByRole('button',{name:/View PROMPT.*gallery/}).click();await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Next photograph'}).click();await expect(page.locator('dialog [data-gallery-count]')).toHaveText('02 / 08');
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.goto('/team');await page.getByRole('button',{name:'Read about Elston Herold Pereira'}).click();await expect(page.getByRole('dialog')).toContainText('President');await page.getByRole('button',{name:'Close dialog'}).click();
  await page.goto('/');await expect(page.locator('#intro')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#intro')).not.toBeVisible();
});

test('automatic opening completes, pointer effects respond, and home join dialog saves to backend',async({page,isMobile})=>{
  await page.goto('/');await expect(page.locator('#intro')).toBeVisible();
  await expect(page.locator('#intro')).not.toBeVisible({timeout:8000});
  await expect(page.locator('body')).toHaveClass(/opening-complete/);
  if(!isMobile){await page.mouse.move(300,220);await expect(page.locator('body')).toHaveClass(/cursor-active/);await expect(page.locator('#reference-cursor')).toHaveCSS('opacity','1');}
  await page.locator('.reference-join [data-join-modal]').click();
  await expect(page.locator('#detail-dialog')).toBeVisible();
  await page.locator('#modal-name').fill('Reference Video Student');await page.locator('#modal-email').fill('reference@example.com');await page.locator('#modal-message').fill('I would like to join the CIPHER community through this dialog.');
  await page.getByRole('button',{name:'Send →',exact:true}).click();await expect(page.locator('.reference-form-status')).toContainText('Message saved successfully.');
  await page.keyboard.press('Escape');
  await page.goto('/admin/login');await page.getByLabel('Username').fill('browser-editor');await page.getByLabel('Password',{exact:true}).fill('browser-test-only-password-2026');await page.getByRole('button',{name:'Sign in'}).click();
  await expect(page.locator('#inbox')).toContainText('reference@example.com');
});
test('real enquiry appears in protected inbox and editor updates persist',async({page,isMobile})=>{
  await page.goto('/join');await page.getByLabel('Your name').fill('Browser Test Student');await page.getByLabel('Email address').fill('browser@example.com');await page.getByLabel('Your message').fill('I would like to volunteer at a future CIPHER event.');await page.getByLabel(/I agree/).check();await page.getByRole('button',{name:'Send message'}).click();await expect(page.locator('#form-status')).toContainText('Message saved successfully.');
  await page.goto('/admin');await expect(page).toHaveURL(/login/);await page.getByLabel('Username').fill('browser-editor');await page.getByLabel('Password', {exact:true}).fill('browser-test-only-password-2026');await page.getByRole('button',{name:'Sign in'}).click();await expect(page).toHaveURL(/\/admin$/);await expect(page.locator('#inbox')).toContainText('browser@example.com');
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.map(v=>v.id)).toEqual([]);
  await page.goto('/admin#edit-events');const details=page.locator('#edit-events details').filter({hasText:'PROMPT OPS–2K26'});await details.locator('summary').click();await details.getByLabel('Short introduction').fill('An updated community story saved through the editor.');await details.getByRole('button',{name:'Save changes'}).click();await expect(page.locator('#studio-notice')).toContainText('Content saved.');
  await page.goto('/events');await expect(page.locator('.event-card').first()).toContainText('An updated community story saved through the editor.');
  await page.goto('/admin');await logout(page,isMobile);await expect(page).toHaveURL(/login/);
});
test('reduced motion and no-JavaScript forms remain usable',async({browser})=>{
  const context=await browser.newContext({javaScriptEnabled:false,reducedMotion:'reduce'});const page=await context.newPage();await page.goto('http://localhost:3100/join');await page.getByLabel('Your name').fill('No JS Student');await page.getByLabel('Email address').fill('nojs@example.com');await page.getByLabel('Your message').fill('A real enquiry without client-side JavaScript.');await page.getByLabel(/I agree/).check();await page.getByRole('button',{name:'Send message'}).click();await expect(page.locator('#form-status')).toContainText('Message saved successfully.');await context.close();
});

test('matrix motion, slim navigation, hidden scrollbars and readable translucent popups work',async({page,isMobile},testInfo)=>{
  test.setTimeout(45000);
  await page.goto('/#about');
  await expect(page.locator('#ambient-matrix')).toBeVisible();
  expect(await page.locator('.site-header').evaluate(el=>el.getBoundingClientRect().height)).toBeLessThanOrEqual(isMobile?64:78);
  expect(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollbarWidth)).toBe('none');
  await expect(page.locator('[data-motion-toggle]')).toHaveCount(0);
  await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('body')).toHaveClass(/motion-paused/);
  await page.emulateMedia({reducedMotion:'no-preference'});await expect(page.locator('body')).not.toHaveClass(/motion-paused/);
  await page.locator('#activities').scrollIntoViewIfNeeded();await expect(page.locator('#activities')).toHaveClass(/is-revealed/);
  await page.locator('.reference-activity').first().click();
  const popup=page.locator('#detail-dialog');await expect(popup).toBeVisible();
  const backdrop=await popup.evaluate(el=>getComputedStyle(el,'::backdrop').backgroundColor);
  expect(Number(backdrop.match(/,\s*([\d.]+)\)$/)?.[1])).toBeLessThan(.6);
  expect(await popup.locator('p').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(15);
  await page.screenshot({path:`test-results/activity-popup-${testInfo.project.name}.png`});await page.keyboard.press('Escape');
  await page.locator('#leadership').scrollIntoViewIfNeeded();await expect(page.locator('[data-team-pause]')).toHaveCount(0);await expect(page.getByRole('region',{name:'Leadership',exact:true})).toBeVisible();
  const profile=page.locator('.reference-person:not([data-clone]) .profile-button').first();
  // Keyboard focus brings the original card into the moving carousel's viewport.
  await profile.focus();await profile.click();await expect(popup).toHaveAttribute('data-kind','profile');
  expect((await popup.boundingBox()).width).toBeGreaterThan(isMobile?280:650);await page.screenshot({path:`test-results/profile-popup-${testInfo.project.name}.png`});await page.keyboard.press('Escape');
  await page.locator('#events').scrollIntoViewIfNeeded();await page.getByRole('button',{name:/View PROMPT.*gallery/}).click();await expect(popup).toHaveAttribute('data-kind','event');await expect(popup.locator('.gallery')).toBeVisible();
  await page.getByRole('button',{name:'Next photograph'}).click();await expect(popup.locator('[data-gallery-count]')).toHaveText('02 / 08');
  await expect.poll(()=>popup.locator('.gallery-slide:not([hidden]) img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
  await page.screenshot({path:`test-results/event-popup-${testInfo.project.name}.png`,animations:'disabled'});
  await popup.locator('#dialog-content').evaluate(el=>el.scrollTop=el.scrollHeight);await expect(page.getByRole('button',{name:'Close dialog'})).toBeInViewport();await page.getByRole('button',{name:'Close dialog'}).click();await expect(popup).not.toBeVisible();
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.mouse.wheel(0,400);await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(100);
  await page.screenshot({path:`test-results/matrix-home-${testInfo.project.name}.png`});
});

test('emerald animation panels preserve focus, contrast and reduced-motion controls',async({page,isMobile},testInfo)=>{
  await page.goto('/#home');
  const ribbon=page.locator('.signal-trace');await expect(ribbon).toBeVisible();
  await expect(ribbon).toHaveCSS('animation-play-state','running');
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(ribbon).toHaveCSS('animation-name','none');
  await page.screenshot({path:`test-results/emerald-home-${testInfo.project.name}.png`});
  // An explicitly labelled screen-dimming approximation, not a hardware brightness test.
  await page.evaluate(()=>document.documentElement.style.filter='brightness(.45)');
  await page.screenshot({path:`test-results/emerald-home-dim-simulation-${testInfo.project.name}.png`});await page.evaluate(()=>document.documentElement.style.removeProperty('filter'));
  await page.emulateMedia({reducedMotion:'no-preference'});
  const trigger=page.locator('.reference-activity').first();await trigger.click();
  const popup=page.locator('#detail-dialog');await expect(popup).toBeVisible();
  await expect(popup.locator('[data-dialog-label]')).toHaveText('CIPHER / EXPLORE');
  await popup.evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
  await expect(popup).toHaveCSS('transform','none');
  if(!isMobile){
    const box=await popup.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;await page.mouse.move(x,y);
    await expect.poll(()=>popup.evaluate(el=>el.style.getPropertyValue('--light-x'))).not.toBe('');
    await expect.poll(async()=>{const cursor=await page.locator('#reference-cursor').boundingBox();return Math.hypot(cursor.x+cursor.width/2-x,cursor.y+cursor.height/2-y);}).toBeLessThan(6);
  }
  expect((await new AxeBuilder({page}).include('#detail-dialog').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.map(v=>v.id)).toEqual([]);
  await page.keyboard.press('Escape');await expect(popup).not.toBeVisible();await expect(trigger).toBeFocused();
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(ribbon).toHaveCSS('animation-name','none');
  await trigger.click();await expect(popup).toBeVisible();await expect(popup).toHaveCSS('animation-name','none');
  await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
  await trigger.click();await page.mouse.click(2,2);await expect(popup).not.toBeVisible();
});

test('public menus have no admin link and the direct admin URL requires authentication',async({page,isMobile})=>{
  for(const route of ['/','/events']){
    await page.goto(route);if(route==='/')await skipOpening(page);
    if(isMobile)await page.getByRole('button',{name:'Menu',exact:true}).click();
    await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
    await page.goto('/admin');await expect(page).toHaveURL(/\/admin\/login$/);await expect(page.getByRole('button',{name:'Sign in'})).toBeVisible();
  }
  if(!isMobile){
    await page.setViewportSize({width:900,height:900});await page.goto('/#about');
    await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});

test('photo carousel responds to controls and galleries retain selection on pointer leave',async({page,isMobile})=>{
  test.skip(isMobile,'Mouse-hover behaviour is exercised on a fine pointer. Touch controls are covered separately.');
  await page.goto('/#about');
  const moments=page.getByRole('region',{name:'CIPHER moments',exact:true}),collage=moments.locator('.carousel-track');await moments.scrollIntoViewIfNeeded();
  await moments.getByRole('button',{name:'Next: CIPHER moments',exact:true}).click();await expect(moments.locator('.carousel-count')).toHaveText('02 / 04');await expect.poll(()=>collage.evaluate(el=>el.scrollLeft)).toBeGreaterThan(30);
  await page.screenshot({path:'test-results/about-pointer.png'});
  await page.getByRole('button',{name:/View PROMPT.*gallery/}).click();
  const gallery=page.locator('dialog .gallery'),count=gallery.locator('[data-gallery-count]');
  const galleryBox=await gallery.boundingBox();
  await page.mouse.move(galleryBox.x+galleryBox.width*.6,galleryBox.y+galleryBox.height*.3);
  await expect(count).toHaveText('01 / 08');
  await page.mouse.move(10,10);
  const stopped=await count.textContent();await page.waitForTimeout(1900);await expect(count).toHaveText(stopped);
  await gallery.getByRole('button',{name:'Next photograph'}).click();await expect(count).toHaveText('02 / 08');
  await page.mouse.move(galleryBox.x+galleryBox.width*.7,galleryBox.y+galleryBox.height*.35);
  await page.screenshot({path:'test-results/gallery-pointer.png'});
  await page.emulateMedia({reducedMotion:'reduce'});
  const reducedCount=await count.textContent();await page.waitForTimeout(1900);await expect(count).toHaveText(reducedCount);
  await page.keyboard.press('Escape');
  expect(await collage.evaluate(el=>el.style.transform)).toBe('');
});

test('admin sees new applications, selects a member, replies and edits activities',async({page,browser})=>{
  test.setTimeout(90000);
  page.on('dialog',dialog=>dialog.accept());
  const candidateEmail=`workflow-${Date.now()}@example.com`,activityTitle=`Student Project Showcase ${Date.now()}`;
  await page.goto('/admin/login');await page.getByLabel('Username').fill('browser-editor');await page.getByLabel('Password',{exact:true}).fill('browser-test-only-password-2026');await page.getByRole('button',{name:'Sign in'}).click();
  await expect(page.locator('#application-notice')).toBeVisible();
  const initial=Number(await page.locator('#application-notice').getAttribute('data-count'));
  const context=await browser.newContext(),candidate=await context.newPage();
  await candidate.goto('http://localhost:3100/join');await candidate.getByLabel('Your name').fill('Membership Workflow Student');await candidate.getByLabel('Email address').fill(candidateEmail);await candidate.getByLabel('Your message').fill('I would like to join and help organise club activities.');await candidate.getByLabel(/I agree/).check();await candidate.getByRole('button',{name:'Send message'}).click();await expect(candidate.locator('#form-status')).toContainText('Message saved successfully.');await context.close();
  // The visibility handler refreshes the same notification endpoint as the timer.
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#application-notice')).toContainText(`Inbox updated: ${initial+1}`);
  await page.locator('#application-notice').getByRole('link',{name:'Refresh inbox'}).click();
  const application=page.locator('#inbox [data-submission]').filter({hasText:candidateEmail});
  await application.locator('.message-detail > summary').click();await application.getByLabel('Membership decision').selectOption('selected');await application.getByRole('button',{name:'Save decision'}).click();
  await expect(application.locator('.badge').first()).toContainText('Accepted');
  await application.locator('.editor-item > summary').click();await application.getByLabel('Email message').fill('Welcome to CIPHER. You have been selected; please meet the coordinator.');await application.getByRole('button',{name:'Send email',exact:false}).click();
  await expect(page.locator('#studio-notice')).toContainText('Email accepted by the mail server');
  const sent=page.locator('#mail-outbox article').filter({hasText:candidateEmail});await expect(sent.locator('.badge')).toContainText('accepted');
  await page.goto('/admin#edit-activities');const activity=page.locator('#edit-activities > details').filter({hasText:'Applied Machine Learning'});
  await activity.locator('summary').click();await activity.getByLabel('Activity information').fill('Updated workshop information approved by the coordinator.');await activity.getByRole('button',{name:'Save changes'}).click();await expect(page.locator('#studio-notice')).toContainText('Content saved.');
  const create=page.locator('#edit-activities .new-item');await create.locator('summary').click();await create.getByLabel('Activity title').fill(activityTitle);await create.getByLabel('Activity information').fill('A showcase of approved student projects.');await create.getByLabel('Display order').fill('25');await create.getByLabel(/Published/).check();
  const activityPhoto=await sharp({create:{width:100,height:80,channels:3,background:'#40aa78'}}).png().toBuffer();await create.getByLabel('Upload a cover image').setInputFiles({name:'activity.png',mimeType:'image/png',buffer:activityPhoto});
  await create.getByRole('button',{name:'Create activity'}).click();await expect(page.locator('#studio-notice')).toContainText('Content saved.');
  await page.goto('/#activities');await page.getByRole('button',{name:/Applied Machine Learning/}).click();await expect(page.locator('#detail-dialog')).toContainText('Updated workshop information approved by the coordinator.');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:new RegExp(activityTitle)}).click();await expect(page.locator('#detail-dialog')).toContainText('A showcase of approved student projects.');
  await expect(page.locator('#detail-dialog .activity-image')).toHaveAttribute('src',/^\/uploads\//);await page.keyboard.press('Escape');
  await page.goto('/admin#join-requests');await expect(page.locator('#selected-members')).toContainText(candidateEmail);
  await application.getByRole('button',{name:'Delete enquiry',exact:true}).click();await confirmChange(page);await expect(page.locator('#studio-notice')).toContainText('Enquiry deleted.');await expect(page.locator('#selected-members')).toContainText(candidateEmail);
  const bulk=page.locator('#bulk-email-form');await bulk.getByLabel('Recipients').selectOption('selected');await bulk.getByLabel('Subject',{exact:true}).fill('Selected members');await bulk.getByLabel('Message',{exact:true}).fill('A club update for all our selected members.');await bulk.getByRole('button',{name:'Preview recipients'}).click();await expect(page.locator('#bulk-addresses')).toContainText(candidateEmail);
  const savedMember=page.locator('#selected-members article').filter({hasText:candidateEmail});await savedMember.getByRole('button',{name:'Delete selected member'}).click();await confirmChange(page);await expect(page.locator('#studio-notice')).toContainText('Selected member deleted.');await expect(savedMember).toHaveCount(0);
});

test('admin can preview bulk mail, delete mail and upload images directly in member and event forms',async({page},testInfo)=>{
  test.setTimeout(90000);page.on('dialog',dialog=>dialog.accept());
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/join');await page.getByLabel('Your name').fill('Bulk Mail Test Student');await page.getByLabel('Email address').fill(`bulk-${testInfo.project.name}-${Date.now()}@example.com`);await page.getByLabel('Your message').fill('I would like to receive CIPHER membership updates.');await page.getByLabel(/I agree/).check();await page.getByRole('button',{name:'Send message'}).click();await expect(page.locator('#form-status')).toContainText('Message saved successfully.');
  await page.goto('/admin/login');await page.getByLabel('Username').fill('browser-editor');await page.getByLabel('Password',{exact:true}).fill('browser-test-only-password-2026');await page.getByRole('button',{name:'Sign in'}).click();
  await page.goto('/admin#join-requests');const subject=`Group notice ${testInfo.project.name} ${Date.now()}`;
  const bulk=page.locator('#bulk-email-form');await bulk.getByLabel('Subject',{exact:true}).fill(subject);await bulk.getByLabel('Message',{exact:true}).fill('An update for everyone in the club database.');await bulk.getByRole('button',{name:'Preview recipients'}).click();
  await expect(page.locator('#bulk-summary')).toContainText('unique email');await bulk.getByRole('button',{name:'Confirm and send to all shown'}).click();await expect(page.locator('#studio-notice')).toContainText('Queued for');
  const mails=page.locator('#mail-outbox article').filter({hasText:subject});const count=await mails.count();expect(count).toBeGreaterThan(0);await mails.first().getByRole('button',{name:'Delete email'}).click();await confirmChange(page);await expect(mails).toHaveCount(count-1);
  await page.goto('/admin#edit-team');const memberName=`Uploaded Member ${testInfo.project.name} ${Date.now()}`;
  const form=page.locator('#edit-team .new-item');await form.locator('summary').click();await form.getByLabel('Full name').fill(memberName);await form.getByLabel('Role',{exact:true}).fill('Volunteer');await form.getByLabel('Introduction').fill('An approved club volunteer.');
  const image=await sharp({create:{width:100,height:140,channels:3,background:'#40aa78'}}).png().toBuffer();
  await form.getByLabel('Add a portrait photo').setInputFiles({name:'portrait.png',mimeType:'image/png',buffer:image});await form.getByRole('button',{name:'Upload and use photo'}).click();await expect(form.locator('.editor-status')).toContainText('Photo attached');await form.getByLabel(/Published/).check();await form.getByRole('button',{name:'Create member'}).click();await expect(page.locator('#studio-notice')).toContainText('Content saved.');
  await page.goto('/#leadership');await expect(page.locator('.reference-team-track').locator('h3').filter({hasText:memberName}).first()).toBeAttached();
  await page.goto('/team');await expect(page.getByRole('button',{name:'Read about '+memberName})).toBeVisible();
  await page.goto('/admin#edit-team');await expect(page.locator('.studio-heading h1')).toHaveClass(/admin-decode/);const member=page.locator('#edit-team [data-record]').filter({has:page.locator('summary').filter({hasText:memberName})});await member.locator('summary').click();await member.getByRole('button',{name:'Remove image',exact:true}).click();await member.getByRole('button',{name:'Save changes'}).click();await expect(page.locator('#studio-notice')).toContainText('Content saved.');await member.locator('summary').click();await expect(member.getByRole('combobox',{name:'Portrait',exact:true})).toHaveValue('');await member.getByRole('button',{name:'Delete member'}).click();await confirmChange(page);await expect(page.locator('#studio-notice')).toContainText('Item deleted.');await expect(member).toHaveCount(0);
  await expect(page.locator('#media-library')).toHaveCount(0);await expect(page.getByText('Give the story a face.')).toHaveCount(0);
  await page.goto('/admin#edit-events');const event=page.locator('#edit-events .new-item').first(),eventTitle=`Inline photos ${testInfo.project.name}`;await event.locator('summary').click();await event.getByLabel('Event title').fill(eventTitle);await event.getByLabel('Date',{exact:true}).fill('2026-10-10');await event.getByLabel('Venue / location').fill('Test room');await event.getByLabel('Short introduction').fill('Direct desktop photo upload test.');await event.getByLabel('Full event story').fill('An event used for testing the inline upload form.');await event.getByLabel('Information source').fill('Test fixture');
  await event.getByLabel('Upload a cover image').setInputFiles({name:'cover.png',mimeType:'image/png',buffer:image});await event.getByLabel('Upload gallery photos').setInputFiles([{name:'gallery-1.png',mimeType:'image/png',buffer:image},{name:'gallery-2.png',mimeType:'image/png',buffer:image}]);await event.getByRole('button',{name:'Create event'}).click();await expect(page.locator('#studio-notice')).toContainText('Content saved.');
  const uploadedEvent=page.locator('#edit-events [data-record]').filter({has:page.locator('summary').filter({hasText:eventTitle})});await uploadedEvent.locator('summary').click();await expect(uploadedEvent.getByRole('combobox',{name:'Cover image',exact:true})).toHaveValue(/^\/uploads\//);await expect(uploadedEvent.locator('[name="gallery"]:checked')).toHaveCount(2);
  await page.goto('/admin#bulk-email');await expect(page.locator('#bulk-email h2')).toHaveText('Send to everyone.');
  await expect.poll(()=>page.locator('#bulk-email h2').evaluate(heading=>{const top=heading.getBoundingClientRect().top;return top>=(document.querySelector('.admin-mobile-bar')?.getBoundingClientRect().bottom||0)&&top<innerHeight;})).toBe(true);
  await expect(bulk.getByRole('button',{name:'Preview recipients'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
  await page.screenshot({path:`test-results/admin-controls-${testInfo.project.name}.png`});
});
