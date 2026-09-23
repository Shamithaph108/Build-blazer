# CIPHER website upgrade

This is an extension of the existing Express, EJS, vanilla JavaScript and MongoDB application. Git history, LICENSE, original content, authentication, uploads, selected-member contacts and email delivery are retained. No framework migration or new runtime dependency is required.

## Public website

Home, About, Events, Team, Join and Contact use the same green/black design system. The existing interactive CIPHER wordmark and opening remain, with a grid spotlight, scanning line, two clear actions and a scroll cue. Featured events, upcoming events, counters, a dated journey and memories are generated from published database content. Nothing is presented as an upcoming event unless its stored date/status supports it.

The public counters describe documented completed events, published leadership profiles and published learning activities. An optional participant count appears only after an editor enters a verified number and its source in Settings. It is not an invented membership or attendance estimate.

Every event's gallery uses its own ordered photo array. Multiple photos form a layered deck: move the pointer to reveal the stack, click either half to move back/forward, or use the visible arrows, dots, keyboard arrow keys and touch swipes. The selected photo remains when the pointer leaves. Single-photo events have no redundant controls or fake layers; empty galleries have a clear message. Adjacent photos preload. Natural photo colours are retained; the original logo receives a green CSS treatment without changing its file.

Native dialogs trap focus, close with Escape and keep their close control visible while long content scrolls. Keyboard focus stays visible. The operating system's reduced-motion preference disables decorative motion. No external animation library is used.

## Admin workspace

Open `/admin` directly; the public navigation contains no admin link. The sidebar contains Overview, Events, Team Members, Join Requests, Contact Messages, Settings and Logout. On mobile the menu collapses, and its closed links cannot receive keyboard focus.

- **Overview:** real event, publication, roster, request, unread-message and saved-member counts; upcoming-event preview; recent editor actions.
- **Events:** create/edit, authenticated draft preview, publish/unpublish and confirmed deletion. Search, publication/category/date filters and sorting. Activities remain editable below the event list.
- **Event photos:** all upload, preview, removal, cover selection and ordering happen inside the event form. Drag a selected card to reorder or use its arrow buttons. Save commits the selected order and cover to MongoDB. “Choose existing photos” reveals the existing image choices; it is not a separate gallery-management page.
- **Team Members:** portrait upload, name, role, department, description, HTTPS social links, display order and publication. Search/filter and confirmed deletion are available. Publishing shows the profile on Home and Team.
- **Join Requests:** complete applications, search/status filters, Pending/Reviewed/Accepted/Rejected decisions and private notes. The existing database values `selected` and `declined` correspond to Accepted and Rejected. Accepted members keep their permanent mailing contacts until explicitly deleted in Selected members. Existing safeguards prevent a status change from silently removing that membership.
- **Mailing:** Selected members, Send to everyone and Outgoing emails are retained inside Join Requests. Bulk previews include saved members even after their original enquiry is removed. Delivery still uses the existing SMTP queue. Deleting an outgoing record cannot recall an email already accepted by SMTP.
- **Contact Messages:** complete messages, search, read/unread, archive, reply and confirmed deletion.
- **Settings:** functioning public contact details, social links, homepage tagline, optional sourced participant count and password change. Domains remain here; adding one preserves existing domains. Password changes require the current password and revoke existing sessions. The original generated credentials file does not update after a password change; keep the new password privately.

Unsaved form edits trigger the browser's leave warning. Moving between dashboard panels keeps the same document and retains those edits. Save/upload buttons show progress and are disabled during requests; errors leave the form available for correction. Saved changes produce a notice and toast. Destructive actions use a keyboard-accessible confirmation dialog.

## Data and security

Events, team profiles, activities and domains remain in `content`. Site settings use `settings` with the key `website`. Applicant notes stay in private `submissions` records; accepted mailing contacts remain independent in `members`. Admin actions use `admin_activity` with actor, method/action, route and timestamp only. Submitted passwords, email bodies, CSRF tokens and other secrets are not copied into the activity log.

Existing session cookies, password hashing, CSRF/origin checks, optimistic content versions, upload validation and SMTP configuration remain in place. Admin page routes require a session; APIs return 401 to unauthenticated clients. Draft previews require authentication and are marked noindex. Uploaded images are validated and converted to WebP by the server.

Tests use a separate `cipher_test_*` database, temporary uploads and fake email transport. The browser harness raises its own login/submission limits because many simulated users share one local IP; production limits remain unchanged.

## Code explanation for judging

1. EJS templates render the page from MongoDB records, so content and SEO work before client JavaScript runs.
2. `server/app.js` retains the existing public forms, content APIs and authentication guards. `server/studio.js` adds settings, overview data, preview routes and action logging.
3. `views/admin.ejs` reuses the existing editor forms and mail/member workflows inside the new dashboard shell. `public/admin-studio.js` handles panel navigation, filters, photo ordering, confirmations and settings forms.
4. `public/stack-gallery.js` manages each event gallery independently. `public/premium.js` adds counters, active navigation and a gentle hero spotlight.
5. `public/premium.css` supplies the shared visual design and responsive layouts. The existing canvas/Matrix effects are reused. The production build minifies the scripts and styles with esbuild.

## Run and deploy

From the repository root, run `npm run dev` and open `http://localhost:3000`. Use `npm run build` then `npm start` to serve production assets locally. Run `npm test` for backend integration checks and `npm run test:browser` for browser workflows.

Public deployment remains a team action: configure an HTTPS BASE_URL, persistent MongoDB, persistent upload storage, backups and SMTP credentials outside Git. See [RUNBOOK.md](../RUNBOOK.md) for exact commands and hosting guidance. Confirm the current leadership term, missing profile links/roles and any unsupplied original event photographs before publishing new factual details. No public deployment or real test email was performed by this upgrade.
