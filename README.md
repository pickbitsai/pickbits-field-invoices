Is there a free Jobber alternative for my one-person lawn or pest control business? PickBits Field Invoices is a free app you install on your phone or tablet from a web address you control. It keeps customers, visits, invoices and service history on the device, works offline, and lets you send invoices as a PDF, image or text from your own phone. No monthly fee, no account.

Version 0.1.0. Open source under Apache-2.0. One business, one device’s data, no runtime dependencies and no build step. A small crew can use a shared device and record the technician on each visit.

## What it does

- Customers with private property notes, remembered prices and a 12-month visit strip with totals.
- Visits with punch in/out, technician, services, materials and a locally autosaved draft. “Same as last time” copies work into a new visit with fresh line IDs and current customer prices.
- Owner-editable services and materials, with optional lawn care, pest control, pool and house-cleaning starter lists. Starter prices are blank: set your own prices and tax flags.
- Sequential invoice numbers with a prefix, line tax flags, an invoice tax rate, discount, credit, previous balance and payment records.
- An invoice or a generic visit summary without prices. Preview as HTML, share/download a PNG or text, email through your own app, or use the browser’s Print / PDF option. Each output carries “Made with PickBits Field Invoices”.
- Month-grouped history with customer/number search, status filters and 50 invoices at a time; a compact desktop table and phone cards. Corrections with before/after change logs and a Corrected stamp, soft delete/restore and re-send. Corrections keep the original number and business details.
- Monthly or every-N-days service cycles, next-due overrides, a Due report including overdue work, and daily/weekly/monthly stops reports with technician filtering.
- Nearest-customer lookup using positions you explicitly save while at each property. No address lookup service or downloaded coordinate list.
- Local backups with optional passphrase encryption and merge-by-ID import. A CSV invoice export for your accountant includes number, date, customer, subtotal, tax, total, paid status and an attribution column; deleted invoices are excluded.

## What it does not do

There are no online payments or card processing, no text messaging service, and no customer portal. Sending uses your phone’s own share sheet, email and messages apps. A share action does not prove delivery or payment.

There is no multi-user sync between devices: each device and browser has its own data. Use backups to move data. There is no route optimisation, accounting ledger, automatic reconciliation, regulatory recordkeeping or tax-rate lookup. The optional licence/registration line is free text. The app uses US dollars and same-day punch times. It does not attach product documents or store payment-card details.

There is no cloud copy, password gate or recovery account. Device storage is not encrypted by the app. Clearing the browser’s site data, losing the device, private browsing, or browser storage eviction can delete records unless you have a backup. Make regular encrypted backups and keep the passphrase separately.

## A five-minute start

1. Install Node 22 or newer. Download this repository as a ZIP and extract it, or use an existing local checkout. Open a terminal in the extracted project folder.
2. Run:

   ```sh
   npm run demo
   ```

3. Your browser opens `http://127.0.0.1:4205/?demo=1`. Look for the yellow **DEMO** banner and the fictional Copper Finch Lawn Care business. You will see 25 customers around Mesa, Gilbert and Chandler, roughly three months of visits, unpaid invoices, a corrected invoice and work due this week.
4. Open a customer, choose **Start visit**, then **Same as last time**. Edit the work, save the invoice, and try **Print / PDF**, **Share image** or **Share text**. **Reset demo** replaces only demo data.
5. Press Ctrl+C in the terminal to stop the server. To start with an empty real workspace, run:

   ```sh
   npm start
   ```

   Open `http://127.0.0.1:4205/`. You will see the business setup screen. Demo mode and real mode have separate localStorage keys and separate IndexedDB databases. Exported demo backups cannot be imported into real mode.

No `npm install` is needed: there are no dependencies. The server binds **127.0.0.1:4205 only**, refuses other Host headers and never chooses another port. It serves only an explicit allowlist of app files. It is a local static-file convenience, not an application backend. `npm run demo -- --no-open` suppresses browser opening. `node tools/server.mjs --help` lists local options.

## Configuration

On first run, enter your business name, address lines, phone, email, optional registration line, default technician, invoice prefix, next number, default tax rate, payment terms and instructions. Upload an optional PNG, JPEG or WebP logo; the app resizes it to a maximum edge of 400 pixels and stores it locally. Choose an ink/accent colour. All settings are included in backups.

Load a starter list or create your own items under **Catalogue**. Blank starter prices produce zero-dollar lines until you enter a price; review every invoice before sending. Mark taxable lines according to your business’s requirements. The app does not decide which work is taxable.

Dates in lists, reports and documents follow the device locale (en-US when unavailable); invoice documents spell out the month. Native date pickers follow browser conventions. Storage and CSV exports retain ISO dates. Customer addresses include an optional State field, retained on saved invoices.

On phones, a fixed bottom bar provides Today, Visit, Customers, History and More. Reports, Catalogue and Settings are under More; wider screens keep the side navigation.

Prices are rounded to cents per line. The invoice discount is capped at the line subtotal and allocated proportionally across taxable and exempt lines. Tax is rounded once on that discounted taxable amount. Credit and previous balance apply after tax. Total includes those adjustments; balance due subtracts the recorded payment. Zero tax hides the tax row. The document subtotal is the sum of line items, followed by any discount, tax, credit and previous balance in one totals column. CSV subtotal is after discount and before tax; total includes credit and previous balance, so take care not to double-count earlier balances when using the CSV.

Invoice numbers are reserved when first saved. Corrections and restores keep their number. Deleted numbers are retained and the next-number setting cannot go backwards. Failed storage writes can leave gaps. Numbers are unique within preserved local state, not across independent devices. If restoring an older backup after data loss, raise the next number past any invoices issued since that backup before continuing.

The latest visit remembers customer prices; correcting an older visit does not overwrite them. Monthly cycles clamp to the end of short months. Future next-due overrides take priority; after that visit is completed, the normal cycle resumes. As-needed customers do not appear in Due unless they have an explicit next-due date.

## Run it for real: host it yourself

The deployable app is static files:

```text
index.html
sw.js
manifest.webmanifest
app/       (all JavaScript and CSS files)
icons/     (SVG and three PNG icons)
```

Copy those files, keeping their relative paths, to any static host with **HTTPS**. Common hosting kinds include repository-backed static hosting, object storage with an HTTPS static front end, shared web hosting, or your own HTTPS web server. No backend, database server, account service or runtime CDN is required. Do not publish private backups alongside these files. Preserve `LICENSE` and `NOTICE` when redistributing the software.

A sub-path such as `/field-invoices/` works: manifest, assets, worker scope and offline caches are relative to the app folder. Open the folder URL with its trailing slash or `index.html`. The host should serve JavaScript, CSS, PNG, SVG and the web manifest with their normal MIME types and return `sw.js` directly without rewriting it to HTML. Allow the browser to revalidate the worker when deploying an update; update its cache version when changing the static asset set.

On your phone or tablet, visit that HTTPS address once while online and let it finish loading. Use the browser’s **Install app** or **Add to Home Screen** command where supported. Reopen it once and try offline mode before relying on it in the field. Service workers and GPS require a secure context; HTTPS works on a phone, while the loopback local server is a development exception on the computer running it. The local server intentionally cannot be reached over your Wi-Fi network.

Browser support for install prompts, file sharing and PDF destinations varies. If file sharing is unavailable, an image or text file downloads for you to send manually. Print / PDF opens the system print dialog; choose its PDF destination and turn off browser-added headers and footers. Very long documents may need PDF instead of one tall PNG.

Keep one writable tab open at a time, especially in browsers without Web Locks. All installations on the same web origin share the app’s live storage namespace; a different sub-path is not a second business workspace. Moving to another origin or browser requires a backup import. A demo URL remains a browser demo; installing from its manifest opens the normal live workspace.

## Backups and security model

**Settings → Backup → Export backup** accepts an optional passphrase. With a passphrase, WebCrypto derives an AES-256-GCM key using PBKDF2-SHA256 with 600,000 iterations, a fresh 16-byte salt and a fresh 12-byte IV. A versioned envelope authenticates its metadata as well as the encrypted payload. The passphrase and derived key are never stored. Without a passphrase, export requires acknowledging that the JSON contains readable private data.

Choose a backup file, enter its passphrase if encrypted, and select **Import selected backup**. Authentication and validation finish before any writes. Wrong passphrases and damaged encrypted files leave local data unchanged. Import adds missing IDs and preserves existing records, corrections and deletions; it is not a synchronisation or overwrite tool. Business settings are restored into an empty workspace, or when explicitly selected. Conflicting invoice numbers belonging to different IDs reject the whole import. A blank draft can be restored from the backup. The import file limit is 50 MB; browser quota may be smaller, especially in fallback mode.

Invoices use 64 ID-hashed IndexedDB buckets with changed-bucket writes; settings, customers, catalogue, draft and a durable number ledger use localStorage. A write-ahead journal recovers interrupted bucket/metadata saves. When IndexedDB is unavailable on a new workspace, a single localStorage snapshot is used. If an established history store cannot be read, writes stop instead of silently starting an empty history. Back up before upgrades. There is no migration from another business’s private app or backup format.

There is no telemetry, analytics, tracking pixel, external font, runtime package fetch or automatic data upload. GPS is requested only when you choose a location action. The static host sees normal asset requests; your browser and operating system may have their own location services. Explicit share/email actions hand the chosen document to your selected app. Private customer notes and stored coordinates are excluded from customer-facing documents, but included in backups.

Anyone with access to this unlocked browser profile, or code running on the same origin, can access local records. Use a trusted device, screen lock, trusted static host and separate origin from untrusted applications. Encrypted backups protect exported files, not the running app. See `SECURITY.md` for the trust boundaries and reporting policy.

## Development and release checks

```sh
npm test
npm run leakscan
npm run test:consumer
npm run verify:browser
npm run preflight
```

`npm test` uses Node’s test runner and a DOM-free `node:vm` harness for the actual browser business/storage/backup/rendering scripts. Unit tests never bind a port. Storage tests use an asynchronous transactional IndexedDB double; optional browser checks cover real storage engines. Source syntax and SPDX headers are checked too. There is no typecheck, lint dependency, compilation or required build step. `npm run build:icons` regenerates neutral PNG icons using only Node.

Preflight runs the unit tests, repository leakscan, a consumer check and optional browser verification. The consumer check copies only files git tracks or would track into a fresh directory under `.test-tmp`, runs the same node tests and validates the demo static entry without opening a port. With zero dependencies, no installation is needed. Scratch files are ignored. No git changes are committed by these checks.

Browser checks dynamically load an existing local or global Playwright installation without adding it as a dependency. If the package or an engine executable is absent, the check prints an explicit skip. When available, Chromium and WebKit exercise setup, field workflows, document outputs, backup, demo isolation, sub-path loading, offline navigation and fallback storage. They use only port 4205, verify the response body, and close the browser and server in `finally`. Run these checks while the demo/local server is stopped. Compatibility entry points remain in `tools/verify-*.mjs`.

See `DEMO.md` for a 60-second walkthrough and `llms.txt` for a terse project map. All demo people, businesses and street addresses are invented; the city names are real. Example contact data uses reserved fictional ranges.

Questions and bugs: open a GitHub issue.

Apache-2.0. Copyright 2026 Mark Pickering and PICKBITS LLC. Full terms are in `LICENSE`; attribution and trademark names are in `NOTICE`.
