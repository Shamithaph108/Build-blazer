# CIPHER — Create. Connect. Collaborate.

Official student-association website for CIPHER, Department of Computer Science and Engineering, St. Joseph Engineering College.

The project is a maintainable Node.js and Express application with server-rendered EJS pages, MongoDB persistence, a protected content studio, real contact and membership workflows, SMTP delivery, responsive layouts, and the supplied CIPHER black-and-green visual identity.

## Website

- Home, About, Events, Team, and Join/Contact pages
- Interactive event galleries and Matrix leadership portraits
- Responsive keyboard-accessible dialogs and navigation
- MongoDB-backed events, activities, team profiles and settings
- Private join requests and contact messages
- Individual and bulk email outbox with delivery history
- Authenticated admin studio at `/admin`

## Stack

- Node.js 22 and Express 5
- EJS server-rendered templates
- MongoDB
- Nodemailer SMTP transport
- Sharp image processing
- Plain CSS and JavaScript, bundled with esbuild
- Vercel Functions for production hosting

## Local development

```powershell
npm install
Copy-Item .env.example .env
# Configure the private .env values.
npm run admin:setup
npm run dev
```

Open `http://localhost:3000`. The admin login is available directly at `http://localhost:3000/admin` and is intentionally absent from the public navigation.

## Validation

```powershell
npm test
npm run build
npm start
```

## Deployment

The application is prepared for Vercel's Express runtime. Production requires:

- `MONGODB_URI` from MongoDB Atlas or Vercel's MongoDB Atlas integration
- `MONGO_DB_NAME=cipher`
- `ADMIN_USERNAME` and a 16-character-or-longer `ADMIN_PASSWORD` for first-run admin creation
- `BASE_URL` set to the final HTTPS origin
- SMTP settings when real email delivery is required

Admin-uploaded images are optimized and stored in MongoDB, so they remain available across Vercel Function restarts. Secrets, local credentials, uploads and development databases are excluded from Git.

Detailed operating, email and deployment instructions are in [RUNBOOK.md](RUNBOOK.md).

## Team

Team-member details are awaiting confirmation and should be added here rather than invented.

## License

See [LICENSE](LICENSE).

---

Built for the BuildBlazer challenge by the CIPHER student team at SJEC.
