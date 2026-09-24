## Announcements

Open `/admin#announcements`, enter a title and message, optionally add a website path or HTTPS link, check **Published**, and save. The Announcements button sits below the menu at the top right of the homepage and opens all published notices. Use Add another announcement to keep earlier notices. Uncheck Published to keep a saved draft. MongoDB stores the notice in `settings`, under `key: announcement`.

## Website chatbot

**Ask CIPHER** answers questions using published events, leadership, activities, domains, contact settings and announcements. It is a lightweight website guide, not a general-purpose AI service. It needs no API key and does not send content to an AI provider. Questions are not saved by the application. Unknown questions are directed to the contact page. Private submissions, admin records and draft content are excluded.

## Verification

`npm test` includes the isolated database integration test for publication, draft privacy, chatbot access, removal of password-recovery endpoints. `npm run test:browser -- tests/browser/community.spec.js` checks desktop/mobile controls. Tests use temporary databases and simulated email delivery, never production recipients.

Use Delete all announcements and confirm to clear the saved notices and remove them from the popup.
