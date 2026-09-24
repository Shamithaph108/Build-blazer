import express from 'express';
import {communityRoutes,readAnnouncement} from './community.js';
import {recoveryRoutes} from './recovery.js';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readFileSync,
  existsSync
} from 'node:fs';
import { randomUUID } from 'node:crypto';

import { connectMongo } from './mongo.js';
import { migrateReference } from './reference-migration.js';
import { migrateDomains } from './domain-migration.js';
import {readSiteSettings,eventState,publicMetrics,studioRoutes} from './studio.js';
import { createMailService } from './mail.js';
import { membershipRoutes } from './membership.js';
import { adminExtras } from './admin-extras.js';
import { migrateSelectedMembers, memberDirectoryRoutes } from './member-directory.js';
import {
  sessions,
  safeEqual,
  verifyPassword,
  hashPassword,
  validateSubmission,
  validateContent
} from './security.js';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

const pages = {
  '/': [
    'home',
    'CIPHER — Create. Connect. Collaborate.',
    'The student association of Computer Science and Engineering at St. Joseph Engineering College. Explore our community, events, and leadership.'
  ],
  '/about': [
    'about',
    'About CIPHER',
    'Meet the CSE student community at SJEC: technical learning, collaboration, leadership, and shared experiences.'
  ],
  '/events': [
    'events',
    'Events & Workshops',
    'Explore CIPHER’s events, from PROMPT OPS–2K26 to Lumière — The Gala. Read event details and browse photographs.'
  ],
  '/team': [
    'team',
    'Our Team',
    'Meet the leadership shown in the supplied CIPHER design reference. Current term confirmation is pending.'
  ],
  '/join': [
    'join',
    'Join & Contact',
    'Join the CIPHER community or send an enquiry to the student association of CSE at SJEC.'
  ]
};

export async function createApp(options = {}) {
  const app = express();

  const production =
    options.production ??
    process.env.NODE_ENV === 'production';

  const dataDir = path.resolve(
    options.dataDir ||
      process.env.DATA_DIR ||
      path.join(root, 'data')
  );

  const baseUrl = new URL(
    options.baseUrl ||
      process.env.BASE_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : '') ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : '') ||
      'http://localhost:3000'
  ).origin;

  const secure = baseUrl.startsWith('https://');

  if (
    production &&
    !secure &&
    !['localhost', '127.0.0.1'].includes(
      new URL(baseUrl).hostname
    )
  ) {
    throw new Error(
      'Public production requires an HTTPS BASE_URL.'
    );
  }

  const db = options.db || await connectMongo();

  await migrateReference(db);
  await migrateDomains(db);
  await migrateSelectedMembers(db);

  const environmentAdmin = (
    process.env.ADMIN_USERNAME || ''
  ).trim().toLowerCase();
  const environmentPassword =
    process.env.ADMIN_PASSWORD || '';

  if (
    Boolean(environmentAdmin) !==
    Boolean(environmentPassword)
  ) {
    throw new Error(
      'Set both ADMIN_USERNAME and ADMIN_PASSWORD, or leave both empty.'
    );
  }

  if (environmentAdmin && environmentPassword) {
    if (!/^[a-z0-9._-]{3,80}$/.test(environmentAdmin)) {
      throw new Error(
        'ADMIN_USERNAME must use 3–80 letters, numbers, dots, underscores or hyphens.'
      );
    }

    if (
      environmentPassword.length < 16 ||
      environmentPassword.length > 256
    ) {
      throw new Error(
        'ADMIN_PASSWORD must contain 16–256 characters.'
      );
    }

    const existingAdmin = await db
      .collection('admins')
      .findOne(
        { username: environmentAdmin },
        { projection: { _id: 1 } }
      );

    if (!existingAdmin) {
      try {
        await db.collection('admins').insertOne({
          username: environmentAdmin,
          password_hash: await hashPassword(
            environmentPassword
          ),
          created_at: new Date().toISOString(),
          created_by: 'environment-bootstrap'
        });
      } catch (error) {
        if (error?.code !== 11000) throw error;
      }
    }
  }

  const mail = createMailService(
    db,
    options.mail || {}
  );

  app.locals.mail = mail;
  app.locals.db = db;

  const assets = JSON.parse(
    readFileSync(
      path.join(root, 'content/assets.json'),
      'utf8'
    )
  );

  const reference = JSON.parse(
    readFileSync(
      path.join(root, 'content/reference.json'),
      'utf8'
    )
  );

  app.locals.reference = reference;
  app.locals.baseUrl = baseUrl;
  app.locals.year = new Date().getFullYear();
  app.locals.eventState = eventState;
  app.locals.preview = false;

  app.locals.formatDate = date =>
    new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(new Date(date + 'T00:00:00Z'));

  app.locals.production = production;

  app.locals.imageSrcset = image => {
    const asset = assets.find(
      item => item.path === image
    );

    return asset?.smallWidth &&
      asset.width > asset.smallWidth
      ? `${image.replace(
          '.webp',
          '-small.webp'
        )} ${asset.smallWidth}w, ${image} ${asset.width}w`
      : '';
  };

  app.locals.assetVersion = existsSync(
    path.join(root, 'dist/version.txt')
  )
    ? readFileSync(
        path.join(root, 'dist/version.txt'),
        'utf8'
      ).trim()
    : 'dev';

  async function library() {
    const uploaded = await db
      .collection('media')
      .find(
        {},
        {
          projection: {
            _id: 0,
            path: 1,
            label: 1
          }
        }
      )
      .toArray();

    const removed=new Set((await db.collection('removed_media').find({}).toArray()).map(item=>item.path));
    return [...assets, ...uploaded].filter(item=>!removed.has(item.path));
  }

  async function listContent(
    kind,
    includeDrafts = false
  ) {
    const rows = await db
      .collection('content')
      .find({ kind })
      .toArray();

    return rows
      .map(row => {
        const payload =
          typeof row.payload === 'string'
            ? JSON.parse(row.payload)
            : row.payload;

        return {
          ...payload,
          version: row.version
        };
      })
      .filter(
        item => includeDrafts || item.published
      )
      .sort(
        kind === 'events'
          ? (a, b) =>
              (b.date || '').localeCompare(
                a.date || ''
              )
          : (a, b) =>
              (a.order || 0) -
                (b.order || 0) ||
              (
                a.name ||
                a.title ||
                ''
              ).localeCompare(
                b.name ||
                  b.title ||
                  ''
              )
      );
  }

  app.set('view engine', 'ejs');
  app.set('views', path.join(root, 'views'));

  app.disable('x-powered-by');

  // Vercel supplies/overwrites X-Forwarded-For with the client IP. Trust only
  // that last proxy hop; keep express-rate-limit's default IP/IPv6 validation.
  if (process.env.VERCEL === '1' || process.env.TRUST_PROXY === '1') {
    app.set('trust proxy', 1);
  }

  app.use(
    helmet({
      referrerPolicy: {
        policy:
          'strict-origin-when-cross-origin'
      },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: [
            "'self'",
            'data:',
            'blob:'
          ],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: secure
            ? []
            : null
        }
      },
      strictTransportSecurity: secure
        ? undefined
        : false
    })
  );

  app.use(
    '/assets',
    express.static(
      path.join(
        root,
        production ? 'dist' : 'public'
      ),
      {
        maxAge: production ? '1h' : 0
      }
    )
  );

  app.use(
    '/images',
    express.static(
      path.join(root, 'public/images'),
      {
        maxAge: '7d',
        immutable: false
      }
    )
  );

  app.use(
    '/fonts',
    express.static(
      path.join(root, 'public/fonts'),
      {
        maxAge: '30d'
      }
    )
  );

  app.use(
    '/uploads',
    express.static(
      path.join(dataDir, 'uploads'),
      {
        maxAge: '7d',
        dotfiles: 'deny'
      }
    )
  );

  app.get('/uploads/:name', async (req, res, next) => {
    try {
      if (!/^[a-f0-9-]{36}\.webp$/.test(req.params.name)) {
        return res.status(404).end();
      }

      const media = await db.collection('media').findOne(
        { path: `/uploads/${req.params.name}` },
        { projection: { data: 1, mime: 1 } }
      );

      const bytes = Buffer.isBuffer(media?.data)
        ? media.data
        : media?.data?.buffer
          ? Buffer.from(media.data.buffer)
          : null;

      if (!bytes?.length) return res.status(404).end();

      res
        .set('Cache-Control', 'public, max-age=604800, immutable')
        .type(media.mime || 'image/webp')
        .send(bytes);
    } catch (error) {
      next(error);
    }
  });

  app.get('/health', (_req, res) =>
    res.json({ status: 'ok' })
  );

  app.get('/robots.txt', (_req, res) =>
    res
      .type('text')
      .send(
        `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api\nSitemap: ${baseUrl}/sitemap.xml\n`
      )
  );

  app.get('/sitemap.xml', (_req, res) =>
    res.type('xml').send(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Object.keys(
        pages
      ).concat('/contact')
        .map(
          p =>
            `<url><loc>${baseUrl}${p}</loc></url>`
        )
        .join('')}</urlset>`
    )
  );

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 500,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message:
        'Too many requests. Please try again in 15 minutes.'
    })
  );

  app.use(
    express.json({
      limit: '5mb'
    })
  );

  app.use(
    express.urlencoded({
      extended: false,
      limit: '32kb'
    })
  );

  const auth = sessions(db, secure);

  app.use(auth.middleware);

  app.use(async (req, res, next) => {
    res.locals.siteSettings = await readSiteSettings(db);
    res.locals.currentPath = req.path;

    res.locals.noindex =
      req.path.startsWith('/admin') ||
      req.path.startsWith('/api');

    res.locals.errors = {};
    res.locals.values = {};
    res.locals.success = false;

    res.set('Cache-Control', 'no-store');

    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(
        req.method
      )
    ) {
      if (
        req.headers.origin !== baseUrl ||
        !safeEqual(
          req.get('x-csrf-token') ||
            req.body?._csrf,
          req.session?.csrf
        )
      ) {
        return req.path.startsWith('/api')
          ? res.status(403).json({
              error:
                'Your session expired or the request came from another site. Reload this page and try again.'
            })
          : res.status(403).render(
              'message',
              {
                title:
                  'Please reload the page',
                description:
                  'Your session expired or this request came from another site.',
                message:
                  'Reload the form and submit again.',
                status: 403
              }
            );
      }
    }

    next();
  });

  async function publicData() {
    const [events, team, activities, domainItems] =
      await Promise.all([
        listContent('events'),
        listContent('team'),
        listContent('activities'),
        listContent('domains')
      ]);

    const domains = domainItems;

    return {
      events,
      team,
      activities,
      announcement:await readAnnouncement(db),
      metrics:publicMetrics(events,team,activities,await readSiteSettings(db)),
      reference: {
        ...reference,
        domains
      }
    };
  }

  for (const [
    route,
    [view, title, description]
  ] of Object.entries(pages)) {
    app.get(route, async (req, res, next) => {
      try {
        res.render(view, {
          title,
          description,
          ...(await publicData()),
          success:
            ['/join','/contact'].includes(route) &&
            req.query.sent === '1'
        });
      } catch (error) {
        next(error);
      }
    });
  }

  app.get(
    '/events/:id',
    async (req, res, next) => {
      try {
        const events =
          await listContent('events');

        const event = events.find(
          item => item.id === req.params.id
        );

        if (!event) {
          return res
            .status(404)
            .render('message', {
              title: 'Event not found',
              description:
                'This event is unavailable.',
              message:
                'This event may have been unpublished. Browse our events for the latest updates.',
              status: 404
            });
        }

        res.render('event', {
          title: event.title,
          description: event.summary,
          event
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get('/contact',async(req,res)=>res.render('join',{title:'Contact CIPHER',description:'Contact the CSE student association at SJEC.',...(await publicData()),values:{purpose:'contact'},success:req.query.sent==='1'}));

  app.get(
    '/api/events',
    async (_req, res, next) => {
      try {
        res.json(
          await listContent('events')
        );
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    '/api/activities',
    async (_req, res, next) => {
      try {
        res.json(
          await listContent('activities')
        );
      } catch (error) {
        next(error);
      }
    }
  );

  async function saveSubmission(value) {
    const id = randomUUID();

    const submission = {
      id,
      name: value.name,
      email: value.email,
      purpose: value.purpose,
      message: value.message,
      created_at: new Date().toISOString(),
      status: 'new',
      decision: 'pending',
      version: 1,
      reviewed_by: null,
      reviewed_at: null
    };

    await db
      .collection('submissions')
      .insertOne(submission);

    try {
      const notificationId = 'notice-' + id;
      await mail.queue({
        id: notificationId,
        submissionId: id,
        kind: 'notification',
        subject:
          value.purpose === 'join'
            ? 'New CIPHER membership application'
            : 'New CIPHER enquiry',
        body:
          `A new ${
            value.purpose === 'join'
              ? 'membership application'
              : 'enquiry'
          } is ready for review.\n\n` +
          `Sign in to the private inbox: ${baseUrl}/admin#inbox\n\n` +
          `Reference: ${id}`
      });

      if (process.env.VERCEL && mail.configured) {
        await mail.send(notificationId);
      }
    } catch (error) {
      await db
        .collection('submissions')
        .deleteOne({ id });

      throw error;
    }

    return id;
  }

  const submissionLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: options.limits?.submissions ?? 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error:
        'Too many submissions. Please try again in an hour.'
    }
  });

  app.post(
    '/join',
    submissionLimit,
    async (req, res, next) => {
      try {
        const { errors, value } =
          validateSubmission(
            req.body || {}
          );

        if (Object.keys(errors).length) {
          return res
            .status(422)
            .render('join', {
              title:
                'Check your message',
              description:
                pages['/join'][2],
              errors,
              values: req.body
            });
        }

        await saveSubmission(value);

        res.redirect(
          303,
          (value.purpose==='contact'?'/contact':'/join')+'?sent=1#form-status'
        );
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    '/api/submissions',
    submissionLimit,
    async (req, res, next) => {
      try {
        const { errors, value } =
          validateSubmission(
            req.body || {}
          );

        if (Object.keys(errors).length) {
          return res.status(422).json({
            error:
              'Please check your details.',
            errors
          });
        }

        await saveSubmission(value);

        res.status(201).json({
          ok: true,
          message:
            'Message saved successfully. Your enquiry is in the team’s private inbox.'
        });
      } catch (error) {
        next(error);
      }
    }
  );

  const requireAdmin = (
    req,
    res,
    next
  ) => {
    if (!req.session?.username) {
      return req.originalUrl.startsWith('/api/')
        ? res.status(401).json({
            error:
              'Sign in to edit content.'
          })
        : res.redirect('/admin/login');
    }

    next();
  };

  app.get(
    '/admin/login',
    (req, res) => {
      if (req.session?.username) {
        return res.redirect('/admin');
      }

      res.render('login', {
        title: 'Editor sign in',
        description:
          'Private CIPHER content editor.',
        error: null
      });
    }
  );

  const dummyHash = hashPassword(
    'not-a-real-account-password'
  );

  const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: options.limits?.login ?? 8,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message:
      'Too many sign-in attempts. Please try again in 15 minutes.'
  });

  app.post(
    '/admin/login',
    loginLimit,
    async (req, res, next) => {
      try {
        const username =
          typeof req.body.username ===
          'string'
            ? req.body.username
                .trim()
                .toLowerCase()
                .slice(0, 80)
            : '';

        const password =
          typeof req.body.password ===
          'string'
            ? req.body.password
            : '';

        const user = await db
          .collection('admins')
          .findOne({ username });

        const valid =
          password.length <= 256 &&
          (await verifyPassword(
            password,
            user?.password_hash ||
              (await dummyHash)
          ));

        if (!user || !valid) {
          return res
            .status(401)
            .render('login', {
              title: 'Editor sign in',
              description:
                'Private CIPHER content editor.',
              error:
                'Username or password is incorrect.'
            });
        }

        await auth.login(
          req,
          res,
          username
        );
        await db.collection('admin_activity').insertOne({actor:username,action:'LOGIN',path:'/admin/login',created_at:new Date().toISOString()});

        res.redirect(303, '/admin');
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    '/admin/logout',
    requireAdmin,
    async (req, res, next) => {
      try {
        await db.collection('admin_activity').insertOne({actor:req.session.username,action:'LOGOUT',path:'/admin/logout',created_at:new Date().toISOString()});
        await auth.logout(req, res);

        res.redirect(
          303,
          '/admin/login'
        );
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    '/admin',
    requireAdmin,
    async (_req, res, next) => {
      try {
        const [
          events,
          team,
          activities,
          domainItems,
          assetsForAdmin,
          submissions,
          outbox,
          newCount,
          members
        ] = await Promise.all([
          listContent('events', true),
          listContent('team', true),
          listContent(
            'activities',
            true
          ),
          listContent(
            'domains',
            true
          ),
          library(),
          db
            .collection(
              'submissions'
            )
            .find({})
            .sort({
              created_at: -1
            })
            .toArray(),
          db
            .collection('outbox')
            .find({deleted_at:{$exists:false}})
            .sort({
              created_at: -1
            })
            .limit(500)
            .toArray(),
          db
            .collection(
              'submissions'
            )
            .countDocuments({
              status: 'new'
            }),
          db.collection('members').find({ deleted_at: { $exists: false } }).sort({ selected_at: -1 }).toArray()
        ]);

        const domains = domainItems;

        res.render('admin', {
          announcement:await readAnnouncement(db),
          recoveryEmail:(await db.collection('admins').findOne({username:_req.session.username}))?.recovery_email||'',
          title: 'Content studio',
          description:
            'Manage CIPHER events, activities, leadership, and applications.',
          events,
          team,
          activities,
          domains,
          assets: assetsForAdmin,
          submissions,
          outbox,
          members,
          mailConfigured:
            mail.configured,
          replyKey: randomUUID,
          newCount,
          username:_req.session.username
        });
      } catch (error) {
        next(error);
      }
    }
  );

  communityRoutes(app,{db,requireAdmin,listContent});
  recoveryRoutes(app,{db,mail,auth,requireAdmin,baseUrl});
  app.use('/api/admin',requireAdmin);
  studioRoutes(app,{db,requireAdmin,auth,listContent});
  app.use('/admin',requireAdmin);
  membershipRoutes(app, {
    db,
    mail,
    requireAdmin
  });
  adminExtras(app,{db,mail,requireAdmin,library});
  memberDirectoryRoutes(app, { db, requireAdmin });

  for (const kind of [
    'events',
    'team',
    'activities',
    'domains'
  ]) {
    app.post(
      `/api/admin/${kind}`,
      requireAdmin,
      async (req, res, next) => {
        try {
          await saveContent(
            kind,
            null,
            req,
            res
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.put(
      `/api/admin/${kind}/:id`,
      requireAdmin,
      async (req, res, next) => {
        try {
          await saveContent(
            kind,
            req.params.id,
            req,
            res
          );
        } catch (error) {
          next(error);
        }
      }
    );

    app.delete(
      `/api/admin/${kind}/:id`,
      requireAdmin,
      async (req, res, next) => {
        try {
          const result = await db
            .collection('content')
            .deleteOne({
              kind,
              id: req.params.id,
              version:
                Number(
                  req.body.version
                ) || 0
            });

          if (!result.deletedCount) {
            return res
              .status(409)
              .json({
                error:
                  'This item changed or was deleted. Reload before trying again.'
              });
          }

          res.json({ ok: true });
        } catch (error) {
          next(error);
        }
      }
    );
  }

  async function saveContent(
    kind,
    id,
    req,
    res
  ) {
    const allowedImages =
      new Set(
        (await library()).map(
          item => item.path
        )
      );

    const { errors, value } =
      validateContent(
        kind,
        req.body || {},
        allowedImages
      );

    if (Object.keys(errors).length) {
      return res.status(422).json({
        error:
          Object.values(errors).join(
            ' '
          ),
        errors
      });
    }

    const key = id || randomUUID();

    // Older clients may not yet submit the new optional fields. Preserve them.
    if(id){
      const old=await db.collection('content').findOne({kind,id});
      const prior=old?(typeof old.payload==='string'?JSON.parse(old.payload):old.payload):{};
      for(const field of ['time','eventStatus','department','github','linkedin','website']){
        if(!(field in req.body)&&field in prior)value[field]=prior[field];
      }
    }

    const payload = JSON.stringify({
      ...value,
      id: key
    });

    if (id) {
      const result = await db
        .collection('content')
        .updateOne(
          {
            kind,
            id,
            version:
              Number(
                req.body.version
              ) || 0
          },
          {
            $set: {
              payload
            },
            $inc: {
              version: 1
            }
          }
        );

      if (!result.modifiedCount) {
        return res
          .status(409)
          .json({
            error:
              'Another editor changed this item. Reload to avoid overwriting their work.'
          });
      }
    } else {
      await db
        .collection('content')
        .insertOne({
          kind,
          id: key,
          payload,
          version: 1
        });
    }

    res.json({
      ok: true,
      id: key
    });
  }

  app.patch(
    '/api/admin/submissions/:id',
    requireAdmin,
    async (req, res, next) => {
      try {
        if (
          !['new', 'read', 'archived'].includes(
            req.body.status
          )
        ) {
          return res
            .status(422)
            .json({
              error:
                'Invalid status.'
            });
        }

        const result = await db
          .collection(
            'submissions'
          )
          .updateOne(
            {
              id: req.params.id
              ,...(req.body.version?{version:Number(req.body.version)}:{})
            },
            {
              $set: {
                status:
                  req.body.status
              },$inc:{version:1}
            }
          );

        if (!result.matchedCount) {
          return res
            .status(404)
            .json({
              error:
                'Submission not found.'
            });
        }

        res.json({ ok: true });
      } catch (error) {
        next(error);
      }
    }
  );

  app.delete(
    '/api/admin/submissions/:id',
    requireAdmin,
    async (req, res, next) => {
      try {
        const sending = await db
          .collection('outbox')
          .findOne({
            submission_id:
              req.params.id,
            member_id: null,
            status: 'sending'
          });

        if (sending) {
          return res
            .status(409)
            .json({
              error:
                'An email is being sent. Wait before deleting this enquiry.'
            });
        }

        await db
          .collection('outbox')
          .deleteMany({
            submission_id:
              req.params.id,
            member_id: null
          });

        await db
          .collection(
            'submissions'
          )
          .deleteOne({
            id: req.params.id
          });

        res.json({ ok: true });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    '/api/admin/media',
    requireAdmin,
    async (req, res, next) => {
      try {
        if (
          typeof req.body.image !==
            'string' ||
          !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(
            req.body.image
          )
        ) {
          return res
            .status(422)
            .json({
              error:
                'Upload a JPG, PNG, or WebP image.'
            });
        }

        const bytes = Buffer.from(
          req.body.image.split(',')[1],
          'base64'
        );

        if (
          bytes.length >
          3 * 1024 * 1024
        ) {
          return res
            .status(422)
            .json({
              error:
                'Choose an image smaller than 3 MB.'
            });
        }

        const name =
          randomUUID() + '.webp';

        let optimized;
        try {
          const image = sharp(bytes, {
            limitInputPixels: 25e6
          });

          const metadata =
            await image.metadata();

          if (
            ![
              'jpeg',
              'png',
              'webp'
            ].includes(metadata.format)
          ) {
            throw new Error(
              'Unsupported image format'
            );
          }

          optimized = await image
            .rotate()
            .resize({
              width: 1400,
              height: 1400,
              fit: 'inside',
              withoutEnlargement: true
            })
            .webp({
              quality: 82
            })
            .toBuffer();
        } catch {
          return res
            .status(422)
            .json({
              error:
                'This image could not be decoded. Choose a valid JPG, PNG, or WebP.'
            });
        }

        const label =
          typeof req.body.label ===
          'string'
            ? req.body.label
                .trim()
                .slice(0, 100)
            : 'Uploaded image';

        const mediaPath =
          '/uploads/' + name;

        await db
          .collection('media')
          .insertOne({
            path: mediaPath,
            label:
              label ||
              'Uploaded image',
            mime: 'image/webp',
            data: optimized,
            created_at: new Date().toISOString()
          });

        res.json({
          ok: true,
          path: mediaPath
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.use((_req, res) =>
    res
      .status(404)
      .render('message', {
        title: 'Page not found',
        description:
          'The requested page was not found.',
        message:
          'That connection leads nowhere. Return home or explore our events.',
        status: 404
      })
  );

  app.use(
    (error, req, res, _next) => {
      const status =
        error.type ===
        'entity.too.large'
          ? 413
          : error instanceof SyntaxError
            ? 400
            : 500;

      if (status === 500) {
        console.error(
          'Request failed:',
          error.message
        );
      }

      const message =
        status === 413
          ? 'This request is too large.'
          : status === 400
            ? 'This request could not be read.'
            : 'We could not save or load this information. Please try again.';

      if (
        req.path.startsWith('/api')
      ) {
        return res
          .status(status)
          .json({ error: message });
      }

      res
        .status(status)
        .type('text')
        .send(message);
    }
  );

  return app;
}
