## Announcements

Open `/admin#announcements`, enter a title and message, optionally add a website path or HTTPS link, check **Published**, and save. The notice appears above the homepage hero, outside the navigation. Uncheck Published to keep a saved draft. MongoDB stores the notice in `settings`, under `key: announcement`.

## Website chatbot

**Ask CIPHER** answers questions using published events, leadership, activities, domains, contact settings and announcements. It is a lightweight website guide, not a general-purpose AI service. It needs no API key and does not send content to an AI provider. Questions are not saved by the application. Unknown questions are directed to the contact page. Private submissions, admin records and draft content are excluded.

## Admin password recovery

First sign in and open **Settings → Password recovery**. Enter the recovery email and current password. Open the verification email and confirm within 15 minutes. Until verification succeeds, any previously verified address remains active.

On the login screen, **Forgot password?** accepts the admin username and sends a reset link to that account's verified address. Reset links expire after 15 minutes and work once. Passwords must contain at least eight characters. A successful reset invalidates existing sessions; it does not sign in automatically.

Recovery uses the existing configured mail transport. SMTP settings and normal outbox delivery are unchanged. Security emails are sent directly, so reset tokens are never stored in the shared outgoing-mail history. MongoDB stores only token hashes, expiry and a password-version binding in the admin record. No new paid services are required.

Existing accounts must verify a recovery email while signed in before Forgot password can work. The generic reset response deliberately does not reveal whether an account exists. Delivery still depends on the configured mail provider; acceptance by SMTP does not guarantee inbox delivery.

## Verification

`npm test` includes the isolated database integration test for publication, draft privacy, chatbot access, verification, password reset and token reuse. `npm run test:browser -- tests/browser/community.spec.js` checks desktop/mobile controls. Tests use temporary databases and simulated email delivery, never production recipients.
