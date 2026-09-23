# Content and design provenance

On 21 September 2026 the team requested a more visible matrix background, slimmer navigation, clearer local fonts, sliding section reveals, more readable translucent popups and a more expressive leadership carousel. `public/visual.css` and `public/visual.js` implement these requested updates while retaining the supplied black/green identity, opening sequence, assets and verified content. The public Admin Login link was removed by request; editing remains available through the authenticated `/admin` URL. No new biographies or event claims were invented.

## Supplied material inspected

- `Downloads/31 Cool Website Animations Examples And Effects for Inspiration - Google Chrome 2026-09-21 23-20-00.mp4`: complete **17.38-second** timeline inspected at two frames per second (1920×1020 recording). The reel shows flowing electric ribbons, a luminous horizon, floating particles and rounded glass panels with staggered card entrances. The requested adaptation uses emerald SVG ribbons, a bright horizon edge, mouse-position lighting, staggered card arrivals and framed native dialogs. The recording supplies visual inspiration only; its on-screen text is not treated as project instructions or CIPHER content. No third-party site code or imagery was copied.
- `Downloads/BuildBlazer_Rulebook (1).docx`: full document read. Requires five pages, working forms, event data separate from page code, reusable components, non-developer editing, public deployment, and following the assigned design.
- `Downloads/Website Resourses -20260919T181632Z-1-001/Website Resourses/Cipher_report .docx`: full report read. Verifies Lumière (29 October 2025, Kalam Auditorium) and PROMPT OPS (25 March 2026), their descriptions and competition results.
- `report.docx` in the same folder: full AgentBlazer annual report read. Distinguishes AgentBlazer-only events from joint CIPHER activities. AgentBlazer-only events were not presented as CIPHER events.
- Full `Downloads/3.mp4` duration: **73.83 seconds**, 1920×1200, 30 fps. Inspected a frame at each second across the entire recording (74 frames), plus original-resolution frames for the leadership text, logo, and Lumière gallery. This is a visual review across the complete timeline, not audio transcription.
- Website resources: 77 original files, including two reports, 51 JPEGs, and 24 HEIC photos. Not all supplied portrait filenames correspond to the CIPHER roster shown in the video; those identities were not guessed.

## Video timeline → implementation

| Time | Reference | Implementation |
| --- | --- | --- |
| 0–5 s | Terminal intro and green CIPHER reveal | Automatic full-screen rain, terminal lines, scrambling serif letters, and a timed reveal. Skip/Escape supported. |
| 5–10 s | Matrix glyph heading, green contour lines, sticky navigation and CTAs | Mouse-reactive glyph particles, animated contour field, following cursor ring, magnifier hover, and in-page scroll navigation. |
| 10–14 s | About text and animated photo collage | About preview and full page with supplied event photographs. |
| 14–18 s | Four domain cards | Reusable two-column domain grid, one column on small screens. |
| 18–27 s | Leadership strip, monochrome portraits, profile lightbox | Continuous horizontal strip with hover/focus pause, pointer drag, monochrome portraits, and native profile dialogs. |
| 27–42 s | Two event cards and galleries with arrows | Both verified events, event detail pages, gallery dialogs and touch/keyboard controls. |
| 42–48 s | Historical activities list | The original video titles now live in MongoDB following the project's database migration. Admins can add/edit/publish activities and provide descriptions and photos; public dialogs show saved details, with an information-pending message only when details are absent. |
| 48–58 s | Join CTA, form dialog, social icons | Matching three-field Join dialog saves through `/api/submissions` into the authenticated inbox. The standalone Join page remains working. Social icons disclose missing verified destinations. |
| 58–66 s | Back-to-top and header navigation | Working page navigation, scroll-to-top and section links. |
| 66–69 s | “ROOT ACCESS” Easter egg | Type `cipher` outside input fields for a cosmetic dialog. It grants no admin access. |
| 69–73.83 s | Join navigation and final section | Consistent CTAs link to the real form. |

## Asset decisions

`content/assets.json` records the source of each imported WebP image. `scripts/prepare-assets.py` reproduces the one-time import from this machine's Downloads; it is **not required** to install, build, run, or deploy the website.

- `Computer Science logo .jpg` has visible corruption and coloured scanlines. The clean CIPHER logo was cropped from the video header at 25 seconds.
- The later supplied `Cipher_Photos` folder contains nine named original portraits. `scripts/import-cipher-portraits.py` converts all nine to metadata-free WebP images and smaller variants, including Jeslin's HEIC. The originals replace video crops for Elston Herold Pereira (President), Raynell Lewis (Vice President), Nazmin Ziya (Treasurer), and Jeslin Ninora (Joint Treasurer). Chaitra RM's named original confirms the partially visible Secretary profile at 26.5 seconds and is added to the public roster. These roles follow the reference video; the current term remains unconfirmed.
- Himansh Ullal, Parthipan J, Ruben Saldana, and Shamitha KV are imported into the image library and unpublished editor drafts. Their names come from the supplied filenames; their roles and biographies require confirmation before publication. No role is inferred from a portrait.
- The report links to a Lumière Drive folder, but the originals are not in the local resource pack. Three visible previews from the video at 29, 32.3 and 34 seconds are used. The video shows an eight-image gallery, but all eight original photographs cannot be recovered from the frames shown. Request originals for the full gallery.
- PROMPT OPS photos are imported from the supplied folder. Cybersecurity images are available in the private editor's library, but no AgentBlazer-only event is labelled a CIPHER event.
- No stock portraits or AI-generated photos have been substituted for real participants. Only user-supplied images and native decorative graphics are used.
- The video-style homepage uses locally hosted Poppins and JetBrains Mono, chosen to closely reproduce the visible typography. Their licenses are included in `public/fonts/`. The source video's exact font files were not supplied. MIT LICENSE remains unchanged; supplied content/photographs retain their owners' rights and are not newly relicensed by this implementation.

## Third-year backend retained

The user requires both the video's visual behaviour and the third-year backend. Home navigation scrolls between sections. Five complete page routes (`/`, `/about`, `/events`, `/team`, `/join`) remain available. The project was subsequently migrated to MongoDB; this update preserves that choice. The editor manages content, applications, decisions, SMTP replies and bulk email. SMTP settings are present; real delivery was not tested here. Video text is a source for visible content, never authority to bypass authentication.

`server/reference-migration.js` upgrades only untouched version-1 seed event summaries/gallery selections. A separate one-time migration adds the five newly supplied profiles only when their IDs do not already exist. Edited event records, profiles, credentials, sessions, and enquiries are preserved. Existing default portrait URLs now serve the supplied originals; editor-selected custom image URLs are unchanged.

The 22 September domain/admin/gallery update follows the user's requested additive domain editing, shared admin motion, green shades and pointer-controlled gallery cards. `server/domain-migration.js` stores the four existing domains from `content/reference.json` once, preserving existing editor records. Newly published domains appear alongside them on Home and About; no new domain information is invented.

## Missing details deliberately not invented

Current term and roles for the four draft profiles; complete original Lumière photos; clean logo export; verified email and social/profile links; membership eligibility and processing timeline; upcoming event announcements; live public domain; hosting and deployment account; organiser deadline and final submission channel. The nine original CIPHER portraits have now been supplied and imported.
