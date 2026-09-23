# CIPHER: running and maintaining the website

The original starter README and LICENSE are preserved. This guide describes the implemented website. Nothing has been publicly deployed.

The current dashboard and public design are documented in [the premium upgrade guide](docs/PREMIUM-UPGRADE.md). This upgrade reuses the same Express/EJS/JavaScript/MongoDB implementation.

## Local launch (PowerShell / VS Code terminal)

Use Node.js **22.13 or newer**, npm, and the MongoDB service. The active application now uses MongoDB. The earlier SQLite files are preserved as legacy backups and are not used by the running website.

```powershell
cd C:\Users\shami\OneDrive\Desktop\BuildBlazer\cipher-buildblazer
npm ci
npm run dev
```

Open **http://localhost:3000**. Keep that terminal running. Ctrl+C stops it. Use `localhost`, not `127.0.0.1`, in the browser: form origins must match `BASE_URL` exactly.

The homepage now follows the supplied video's continuous scroll and automatic five-second opening. Its header links scroll to Home, About, Leadership, Events, and Join. Skip or Escape dismisses the opening. A reduced-motion system preference disables the continuous visual effects. The five standalone page routes remain working at `/`, `/about`, `/events`, `/team`, and `/join`.

Click **Join** in the bottom section to open the reference-style form. It saves to the same private inbox as `/join`, using the `/api/submissions` endpoint. Mouse movement bends the contour background and displaces the CIPHER particles; profile/gallery cards open dialogs and the leadership strip supports hover pause and dragging.

Move the mouse across **Who we are** to tilt the collage and shift its photos at different depths. Event/workshop galleries now show a layered photo deck. Hover reveals the stack; clicking either half, using arrows/dots or swiping changes the photo. Arrow keys work while the gallery has focus. Leaving keeps the selected photo. Single-photo events have no redundant controls. Reduced-motion mode disables decorative tilt and collage movement.

The updated presentation adds a visible matrix-rain background, slimmer desktop/mobile navigation, clearer local fonts, sliding section reveals and larger dialogs with a translucent backdrop. Scrollbar tracks are hidden, while scrolling, touch gestures and keyboard access remain available. Leadership cards have a staggered layout, previous/next controls and a strip-specific pause button. The global **Pause motion** button has been removed; the operating system's reduced-motion preference still disables decorative motion. The supplied opening sequence and black/green identity remain.

Admin pages share the matrix background, animated headings, section arrivals and mouse-position lighting. Forest, jade, mint and lime shades distinguish cards and editor panels while retaining the green/black theme. Text remains fully opaque during sliding entrances so it stays readable throughout the animation.

The later animation-inspiration recording adds flowing emerald SVG trails and a luminous horizon to the hero, staggered card entrances, mouse-position surface lighting, and floating popup panels with a slim CIPHER frame. The popup close button stays visible while long content scrolls; Escape and backdrop clicks restore focus. Brighter solid green accents and pale green text improve legibility on dark backgrounds without depending on glow. This cannot control a device's actual display brightness. Hero effects pause off screen or when the tab is hidden; no animation library or new dependency is required.

Production assets, served locally:

```powershell
# Stop the development server with Ctrl+C first.
npm run build
npm start
```

`npm start` uses the minified production assets. HTTP is allowed only for loopback local testing; a public production BASE_URL must use HTTPS.

## Content editor and enquiries

Open **http://localhost:3000/admin**. An initial local `editor` account has been generated. Its random password is in **data/admin-credentials.txt**, a gitignored private file. Do not share or commit it.

Access the editor directly at **http://localhost:3000/admin** (or `/admin/login`). Public desktop/mobile menus contain no admin link. Every editor operation still requires authentication, authorisation and CSRF validation.

The admin sidebar contains **Overview, Events, Team Members, Domains, Join Requests, Contact Messages, Mail Center, Settings and Logout**. Activities are inside Events. Saved members stay under Join Requests; individual replies, bulk email, mailbox testing and outgoing history are available through Mail Center. Public contact details, social links, homepage tagline and an optional verified participant count are editable in Settings. The `/contact` page opens the contact form with the correct purpose selected.

All nine supplied `Cipher_Photos` portraits are available in the image selectors. Five identified leaders appear on Home and Team. Their public portraits use transparent cutouts over live Matrix rain; the source photographs are retained outside the public folder in `content/original-team-photos`. Himansh Ullal, Parthipan J, Ruben Saldana, and Shamitha KV have unpublished draft profiles: confirm their roles and biographies in the editor, then publish them. The import preserves existing editor changes.

If setting up a fresh checkout, or resetting the editor password:

```powershell
npm run admin:setup
```

This generates a new random password and revokes that editor's existing sessions. It does not reset website content. Store the password in a password manager. The CLI can also receive `ADMIN_USERNAME` and `ADMIN_PASSWORD` from environment variables; use 16–256 password characters. No default password is embedded in the app.

In the editor:

1. Expand an event, activity, or member to edit its fields and choose a photo directly from your computer or phone. Saving uploads the chosen file automatically; **Upload and use photo** is also available for an immediate preview.
2. Use **Add an event**, **Add an activity**, **Add a domain**, or **Add a team member** for new entries. New entries start as drafts.
3. Check **Published** to display an entry. Uncheck to hide it without deleting.
4. Event forms also accept multiple gallery photos directly from your device (up to 20 total). Uncheck a gallery photo or use **Remove image**, then save to detach it. JPG, PNG and WebP under 3 MB are converted to WebP. Convert HEIC first. The separate image-library section has been removed.
5. Read saved messages in **Community inbox**. Membership applications have a **Membership decision** selector: Pending review, Selected, or Declined. Save the decision, then expand **Write an email** to send the candidate a custom subject and message. Selection saves a permanent private member contact. It does not send an email or create a public team profile.
6. Open **Mail Center** to test the real mailbox, send to all/selected recipients, and check queued, sending, accepted, or failed messages. Retrying a failed email asks you to check your sender mailbox first, because an interrupted SMTP connection can leave delivery uncertain. Deleting an enquiry removes its reply history but preserves the saved member and that member's queued bulk emails. **Delete selected member** removes the permanent contact and cancels its queued messages. Already-sent mail cannot be recalled.

Forms save submissions and notification emails in MongoDB. The dashboard checks for new applications/enquiries every 15 seconds without replacing unsaved editor work. Refresh the inbox using its link to read new entries. Activity edits, publication choices and deletions are retained across restarts.

**Our Domains:** adding and publishing a domain keeps the existing domains and displays the new one on Home and About. Its default display order follows the current entries. Domains are saved in MongoDB `cipher.content` with `kind: "domains"`. A one-time migration persists the four supplied defaults without replacing existing edits or drafts. After that, deliberately deleted domains are not recreated on restart. Edit, unpublish or delete an existing domain using that domain's own form.

## Database and new admin controls

The configured database is **cipher** (`MONGO_DB_NAME`). The default local connection is `mongodb://127.0.0.1:27017` (`MONGO_URI`). View it in MongoDB Compass using the connection from your private `.env`. `submissions` stores candidate names, email addresses, messages, decisions and reviewer details. `members` stores selected members independently of the inbox, with no expiry. `outbox` stores individual outgoing messages/status; `bulk_campaigns` stores confirmed recipient lists and message previews; `content` stores events, activities, domains and team profiles. Upload files remain in `data/uploads`.

**Send to all** previews the union of permanent member contacts and application/enquiry addresses, or selected members only. It includes records beyond the 200 shown in the inbox. Review the list, then confirm. Each address receives a separate email. Do not click confirm with a real audience unless you intend to send it. Queued messages are delivered by the configured background mail worker. Recipients are rechecked before confirmation and delivery, so old previews cannot restore a deleted member.

**Delete email** works for every status, including stuck Sending entries. It removes the entry from the outbox, cancels queued delivery, and retains a minimal cancellation marker to prevent duplicate retries. It cannot recall mail already handed to SMTP. Deleting during a send does not make the entry reappear when that attempt completes.

Member forms offer direct portrait upload. Save with Published checked to show the public profile on Home and Team. **Delete member** removes that public profile; the private mailing list is managed separately under **Selected members**. **Remove image** detaches the current photo when saved; original files are preserved.

Selected contacts are in MongoDB Compass under **cipher → members**, while original enquiries remain under **cipher → submissions**. On selection the name, email, application message and selection details are retained independently. They survive restart, sign-out, enquiry deletion and email deletion. Only **Delete selected member** removes the saved contact; an ID-only deletion marker prevents accidental restoration. The empty submissions collection observed on 21 September contained no current applications and had no expiry index; previously deleted contacts were not reconstructed or invented.

Normal admin tab closure sends a logout signal with a 30-second grace period. Reloads and other open admin tabs renew the session, so routine navigation still works. Browsers do not guarantee close signals on crashes or forced termination: a browser-session cookie and a 15-minute server expiry without authenticated requests provide the fallback. Use Sign out for immediate logout.

## Email account setup

Email requires a real sending account. The implementation uses [Nodemailer's SMTP transport](https://nodemailer.com/smtp/) with TLS. Configure these in a private `.env` file at the project root (or your deployment host's secret settings), using `.env.example` as the template:

```dotenv
SMTP_HOST=your-provider-smtp-host
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASS=your-provider-issued-password
MAIL_FROM=your-club-mailbox@example.com
ADMIN_NOTIFY_EMAIL=your-inbox-owner@example.com
```

Use your provider's verified settings and its app password or SMTP credential if required. Port 587 requires STARTTLS; 465 uses TLS immediately. `MAIL_FROM` must be an address the provider authorizes you to send from. Supply one email address per address field. Do not put passwords into Git or send them in chat.

For Gmail, turn on 2-Step Verification for the sender Google account, create a fresh **App Password**, and use that 16-character value for `SMTP_PASS`. Use `smtp.gmail.com`, port `587`, and the same Gmail address for `SMTP_USER` and `MAIL_FROM`; a normal Google account password will be rejected. After restarting the server, open **Admin → Mail Center → Test mailbox connection**. The test reports a safe error category without showing credentials or sending a message.

Restart `npm run dev` after configuration. New applications queue an email to `ADMIN_NOTIFY_EMAIL` linking to the protected inbox. A background task sends queued messages every 15 seconds while the server is running. Replies are addressed to the email saved on the application; an admin cannot override the recipient through the reply API. Review queued messages before configuring email: they will send automatically after setup. Messages remain queued if configuration is missing; failed sends remain in history for an explicit retry. A duplicate form request reuses its reply ID and does not resend an already accepted message.

“Accepted” means the SMTP server accepted the email, not proof of arrival in the candidate's inbox. SMTP settings are present in the private environment; their secrets are not displayed or committed. The live handshake currently reaches Gmail but Gmail returns `EAUTH`, so the existing sender credential must be replaced with a valid App Password before real delivery can succeed. Automated tests use a fake transport and confirm notification, individual, retry and bulk-mail behavior without sending external email.

Authentication uses salted scrypt password hashes, random server-side sessions, HttpOnly/SameSite browser-session cookies, HTTPS Secure cookies in public production, login throttling, CSRF tokens and exact-origin validation. Inputs are validated before MongoDB updates; EJS escapes displayed text. Concurrent content and membership edits use version checks to prevent silent overwrites.

## Simple explanation for judging

**One Node application; no separate frontend service or cloud account needed locally.**

| Part | What it does |
| --- | --- |
| `server/app.js` | Express routes render the five pages and process forms, login, and editor actions. |
| `views/` | EJS templates produce real HTML. Shared header, footer, event cards, team cards, and galleries live in `views/partials/`. |
| `public/styles.css` | Responsive black-and-green design, keyboard focus, and reduced-motion support. |
| `public/site.js` | Small browser enhancements: mobile navigation, search/filtering, dialogs, galleries, and the glyph heading. |
| `public/reference.js` and `public/reference.css` | Homepage-only video presentation: opening, in-page scroll, particles, contour field, cursor, and join dialog. |
| `server/mongo.js` | Connects to MongoDB and creates unique indexes for records. `server/db.js` and `*.sqlite.js` are legacy SQLite files. |
| `server/membership.js` | Protected application decisions, notification counts and candidate replies. |
| `server/member-directory.js` | Permanent private selected-member contacts, recipient deduplication and explicit member deletion. |
| `public/visual.js` and `public/visual.css` | Shared public/admin matrix background, green surface lighting, staggered reveals, reduced-motion support, clearer typography and floating dialogs. `views/partials/signal-field.ejs` contains the decorative SVG trails. |
| `server/domain-migration.js` | Persists original domains once so adding custom domains never replaces the supplied defaults. Existing records are preserved. |
| `server/admin-extras.js` | Protected bulk-email previews/confirmation, email deletion, library removal and tab-close session expiry. |
| `server/mail.js` | Durable outgoing email queue and SMTP delivery; server configuration stays private. |
| `content/seed.json` | Verified original event/roster source data. The current MongoDB content is retained from the existing migration. |
| `public/admin.js` | Sends authenticated editor changes to the server; the server validates before saving. |
| `scripts/build.js` | esbuild minifies CSS/JS into `dist/`. Pages remain server-rendered for SEO and low client overhead. |

Example data flow: an editor updates an event or activity → the server verifies their session and CSRF token → checks the fields and record version → saves MongoDB → the next public request renders the new data. A visitor's application is validated and saved → the dashboard shows a notification → SMTP notifies the admin → the admin selects or declines the member and writes a reply. `/api/events` and `/api/activities` expose published content only.

Only supplied event images, a clean reference logo, and reference portraits are included. WebP versions are smaller than the original photo pack; EXIF orientation is corrected. Images below the fold load lazily. Fonts are hosted locally, with their licenses included. There are no external font requests, tracking scripts, or UI framework runtime.

## Validation commands

```powershell
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Tests use isolated temporary databases and test-only accounts, not the local inbox. Browser tests cover desktop/mobile layouts, broken images, WCAG automated checks, dialogs, filtering, submissions, editor changes, and a form submission without JavaScript. Automated checks supplement, not replace, manual accessibility testing.

## Deployment preparation

This is a **stateful Node/MongoDB app** prepared for Vercel Functions as well as a conventional Node or Docker host. A static-only upload cannot run its forms or editor. Content, accounts, sessions, submissions, mail history and optimized admin-uploaded images are stored in MongoDB so Vercel restarts do not lose them.

Local build: `npm ci && npm run build`. Local production start: `npm start`. Vercel uses `api/index.js` as its Express Function entry and routes all requests to it through `vercel.json`.

Current production URL: `https://cipher-buildblazer-chi.vercel.app`

Set these private deployment environment variables:

```text
BASE_URL=https://your-confirmed-domain.example
MONGODB_URI=your-private-mongodb-atlas-connection
MONGO_DB_NAME=cipher
ADMIN_USERNAME=your-private-editor-name
ADMIN_PASSWORD=use-at-least-16-characters
```

Vercel's MongoDB Atlas integration supplies `MONGODB_URI` automatically. On a new database, `ADMIN_USERNAME` and `ADMIN_PASSWORD` create the first editor once; later password changes are not overwritten during cold starts. Keep both values private. SMTP variables from `.env.example` are also required for real mail delivery.

1. Link the GitHub repository to Vercel and provision/connect MongoDB Atlas.
2. Add the private environment variables above for Production, Preview and Development as appropriate.
3. Deploy once to obtain the HTTPS production URL, set `BASE_URL` to that exact origin, and redeploy.
4. Test all pages, a real enquiry, editor login, an uploaded image, a content update, and persistence after a redeployment.
5. Configure MongoDB backups and an enquiry retention policy. Keep data and credentials out of Git.

For another Node host, `MONGO_URI` remains supported as a local fallback. Docker deployment may still use `HOST`, `PORT` and `DATA_DIR`, but uploaded images now persist in MongoDB rather than the container filesystem.

Optional Docker preparation: `docker build -t cipher .`; run with the same environment and a volume mounted at `/data`. The container runs as the Node user (UID 1000); pre-existing mounted folders must be writable by that user. Docker deployment has been documented, not executed or published here.

## Remaining handoff / submission requirements

- Confirm the current leadership term and roles for the four draft profiles. All nine original CIPHER portraits are imported; five identified leaders are published.
- Configure the sending mailbox and admin notification address in private environment settings, then verify a real notification and candidate reply.
- Confirm official association email, social/profile links, membership process, and inbox owner. Unverified links are not invented.
- Supply original Lumière photographs and a clean logo export. The available logo JPG is visibly corrupted; clean video crops are used as documented in `docs/SOURCES.md`.
- Obtain organiser confirmation if needed for using this supplied video in place of the rulebook's Figma handoff. The team explicitly authorised this video as the implementation reference.
- Fill in confirmed team-member details in README.
- Confirm the deadline and submission method (PR or organiser form), then submit the fork URL plus public deployment URL.

Official implementation references: [Express security guidance](https://expressjs.com/en/advanced/best-practice-security.html), [Node SQLite API](https://nodejs.org/api/sqlite.html).
