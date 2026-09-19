# Our Private Journal

A private two-person digital scrapbook/journal designed to feel like a real keepsake book.

## What is already implemented

- Private two-account login; there is no public sign-up page.
- Romantic cover-opening introduction.
- Desktop two-page book spread and mobile single-page book.
- Animated page-turn effect with arrow buttons and keyboard arrows.
- Daily journal entries with title, date, text, author, edit, and delete.
- Multiple photo uploads per entry.
- Photo sizing from 24%–70% of the writing area.
- Drag a photo toward the left/right side in the editor to change its placement.
- Text wraps around photos instead of overlapping them.
- Continuous **Memory Stream** view, newest journal date first.
- Responsive phone/tablet layout.
- Server-side storage for entries and photos.
- Private photo URLs: uploaded images require an authenticated session.
- Signed HttpOnly session cookies, SameSite protection, CSP, and no public registration.

## Run locally

Requires Node.js 20+.

1. Open a terminal in this folder.
2. Set environment variables, or use the built-in development demo accounts.
3. Run:

```bash
npm start
```

4. Open `http://localhost:3000`.

Development-only demo logins if `JOURNAL_USERS` is not set:

- `you` / `love123`
- `girlfriend` / `journal123`

Do **not** deploy with those demo credentials.

## Private production setup

Set these environment variables in your host:

```text
JOURNAL_USERS=yourname:a-strong-private-password,hername:another-private-password
SESSION_SECRET=a-long-random-secret-at-least-32-characters
JOURNAL_TITLE=Our Little Book of Us
JOURNAL_SUBTITLE=Every ordinary day deserves to be remembered.
NODE_ENV=production
```

There is intentionally **no registration route**. Only the two accounts supplied in `JOURNAL_USERS` can unlock the journal.

## Railway persistence

The app stores journal entries and uploaded photos on disk. For Railway, attach a persistent Volume to the service, mount it at `/data`, and set:

```text
STORAGE_DIR=/data
```

This prevents your journal and photos from disappearing during redeploys.

Start command:

```text
npm start
```

The server automatically uses Railway's `PORT` environment variable.

## Repository security

The included hardened `.gitignore` excludes:

- all real environment files and secrets
- certificates and private keys
- journal content and uploaded photos
- local database files
- logs, caches and build output
- IDE and operating-system metadata
- backups and archives that might contain private memories

Only `.env.example` is committed as a safe configuration template.

## Folder structure

```text
love-journal/
  client/
    index.html
    styles.css
    app.js
  server/
    server.js
    storage/
      uploads/
        .gitkeep
  .env.example
  .gitignore
  package.json
  README.md
```

## Privacy note

The login protects the journal from normal unauthorized browsing and images are not served without a valid session. For a shared private journal on the public internet, keep HTTPS enabled, use unique passwords, keep `SESSION_SECRET` private, and use persistent storage. End-to-end encryption can be added later if you want the hosting layer itself to be unable to read journal content.
