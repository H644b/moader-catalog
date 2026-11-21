# Moader Catalog

The public mod catalog and creator studio for Moader. The Cloudflare Worker serves discovery, downloads and the console feed. Supabase Auth stores account credentials, private Supabase Storage holds packages and previews, and Cloudflare D1 stores releases and publishing state.

[Browse the catalog](https://moader.timsfun.com/) · [Console feed](https://moader.timsfun.com/catalog.json)

## Publish a mod

1. Create a username and password. Save the recovery key shown after signup.
2. Open **Creator studio → New mod**. Enter the game name, 16-character Title ID and stable mod ID.
3. Add your ZIP, previews, version, license and description. **Save draft** keeps edits private. **Publish release** makes them available on the website and in Moader.

Packages can be up to 128 MiB and use the same mod roots as the console importer. Previews are JPG or PNG files up to 2 MiB each. A 1920 × 1080 image fits the console’s preview limits. A new package for an existing mod needs a new version number. Unpublishing withdraws its public listing and file links.

In **Preview gallery**, choose **Delete** to remove a thumbnail from your uploads and every version that uses it. The next image becomes the cover. To edit only the draft gallery, use **Remove from draft** and **Save draft**.

## Run and deploy

Use Node.js 22 or newer and run `npm ci`. For local development, configure the Worker variables in `wrangler.jsonc`, apply the D1 migrations with `npx wrangler d1 migrations apply moader-community-catalog --local`, and run `npm run dev`. Put dedicated development credentials in the ignored `.dev.vars`.

Production uses a private Supabase bucket named `moader-community-files`. Supply the corresponding project’s `SUPABASE_PUBLIC_KEY` and `SUPABASE_SECRET_KEY` through Wrangler secrets. The Worker authenticates API requests and checks ownership before reaching storage. Browser sessions use secure, HTTP-only cookies. Supabase manages password credentials for internal account identities, so public signup and recovery work without a mail provider.

To restore the two initial releases, build the [publisher template](https://github.com/H644b/moader-mod-repo-template), then run `scripts/seed_starters.py` with Python, its built site directory, `--upload`, and `--out migrations/0002_starters.sql`. The script reads the project URL and secret key from the environment and verifies the original package checksums. New creator uploads go directly through Creator studio.

Run `npm test`, apply migrations with `npx wrangler d1 migrations apply moader-community-catalog --remote`, and deploy with `npm run deploy`. For an independent deployment, set your own D1 ID, hostname, origin and Supabase project first.

The console reads `/catalog.json` and follows same-origin catalog pages. Download URLs are stable for each file, support byte ranges and carry the verified size and SHA-256. Starter mods and branding retain their [individual credits](CREDITS.md).
