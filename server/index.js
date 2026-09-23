import { createApp } from './app.js';
import { closeMongo } from './mongo.js';

const production =
  process.argv.includes('--production') ||
  process.env.NODE_ENV === 'production';

const app = await createApp({ production });

let flushing = false;

const sendQueuedMail = async () => {
  if (flushing) return;

  flushing = true;

  try {
    await app.locals.mail.flush();
  } catch {
    console.error(
      'Email queue could not be processed. Check the private outbox.'
    );
  } finally {
    flushing = false;
  }
};

const mailTimer = setInterval(
  sendQueuedMail,
  15000
);

mailTimer.unref();

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '127.0.0.1';

const server = app.listen(
  port,
  host,
  () => {
    console.log(
      `CIPHER running at ${
        process.env.BASE_URL ||
        `http://localhost:${port}`
      } (${production ? 'production' : 'development'})`
    );
  }
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    clearInterval(mailTimer);

    server.close(async () => {
      await closeMongo();
      process.exit(0);
    });
  });
}