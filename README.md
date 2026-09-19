# Our Love Story

A private social scrapbook that can be shared by **two lovers** or by a **group of friends/family**. It keeps the real-journal feel: book opening, page flips, chronological memory stream, photos that wrap with writing, and private shared spaces.

## Main features

- **Lovers scrapbook** — exactly two people can be bound together.
- **Group scrapbook** — invite friends, family, barkada, or any private circle.
- **@tag profiles** — every person has a unique tag for invitations.
- **Private invitations** — a scrapbook is visible only to its members.
- **Profiles** — display name, @tag, bio, and profile photo.
- **People view**
  - Lovers: two profile photos side by side with a heart binding them.
  - Groups: the viewer appears in the center with the other members connected around them.
- **Book mode** — physical-book-style pages and page-turn animation.
- **Memory Stream** — endless chronological scrolling.
- **Shared posts** — everyone in the scrapbook can read each other's journal entries.
- **Author controls** — only the writer of an entry can edit or delete it.
- **Resizable photos** — image size can be changed from 18% to 90%.
- **Direct photo dragging** — drag a photo in the live page preview:
  - left/right changes the side where text wraps
  - up/down changes its vertical placement
- **Text wrapping** — photos stay in the document flow instead of covering journal text.
- **Explicit Log out** button.
- Responsive desktop, tablet, and mobile layouts.

## Accounts and security

Existing production accounts supplied through `JOURNAL_USERS_HASHED` remain supported and are treated as bootstrap accounts.

New people can create their own profile and unique `@tag` from the sign-up screen. New passwords are never stored as plaintext: the application stores salted **scrypt** password hashes in persistent storage.

Uploaded photos, accounts, profiles, invitations, scrapbook memberships, and journal entries are stored outside Git.

## Existing couple migration

On the first run of this version, the original two bootstrap accounts are automatically placed into the original **Lovers** scrapbook. Existing entries without a scrapbook ID are assigned to that scrapbook, so previous memories are retained rather than reset.

## Run locally

Requires Node.js 20+.

```bash
npm start
```

Open `http://localhost:3000`.

For local development only, if no production account variables are supplied, the demo accounts remain available:

- `you / love123`
- `girlfriend / journal123`

## Railway / production

Recommended variables:

```text
JOURNAL_USERS_HASHED=yourname:<sha256>,partner:<sha256>
SESSION_SECRET=a-long-random-secret
JOURNAL_TITLE=Our Little Book of Us
JOURNAL_SUBTITLE=Every ordinary day deserves to be remembered.
NODE_ENV=production
STORAGE_DIR=/data
```

Attach a persistent Railway volume to `/data`. The app then stores:

- `journal.json` — scrapbook journal entries
- `social.json` — profiles, scrapbook membership, and invitations
- `accounts.json` — scrypt-hashed self-created accounts
- `uploads/` — private uploaded images

These files are ignored by Git.

## Privacy model

There is a public account-creation screen so friends can join the journal journey, but **scrapbook contents are not public**. Someone must be authenticated and be an accepted member of a scrapbook to read its entries.

A Lovers scrapbook is capped at two people. Group scrapbooks can contain multiple invited members. Invitations use exact `@tag` identities and appear when the invited person signs in.

## Repository security

The hardened `.gitignore` excludes real environment files, secrets, credentials, private keys, cloud credentials, journal/social/account data, uploaded photos, databases, logs, caches, backups, archives, and IDE/OS metadata.


## Android internal test

The repository includes a Capacitor 8 Android trial wrapper for **Our Love Story**.

For this first internal build, the native shell loads the existing production app at:

`https://our-love-story-production-47c9.up.railway.app`

This keeps the current login cookies, Railway backend, uploads, chats, scrapbook data, and live updates working exactly like the web version while the Android shell is evaluated.

### Automated APK

GitHub Actions workflow:

`.github/workflows/android-debug.yml`

Every relevant Android/client configuration change on `main` builds a debug APK and stores it as the workflow artifact:

`our-love-story-android-debug`

This remote-URL wrapper is intentionally an **internal testing configuration**. Before publishing to Google Play, migrate the Android/iOS apps to bundled local web assets with mobile-safe authentication/API handling and native push configuration.
