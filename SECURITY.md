# Security policy

PickBits Field Invoices 0.1.0 stores private business records on the device. Data loss, unintended disclosure, script injection, corrupted imports and duplicate invoice numbering are security-relevant bugs.

## Reporting

Report vulnerabilities privately through GitHub private vulnerability reporting on the repository where you obtained this project. Include the affected version, browser and OS, expected behavior, observed behavior and a synthetic reproduction. Never attach actual customer records, private backups, passphrases or credentials. The current default-branch version is supported before a stable release.

## Trust boundaries

There is no authentication or application encryption at rest. The unlocked browser profile and all same-origin JavaScript are trusted. Use a screen lock, trusted static host and an origin isolated from untrusted applications. Browser storage can be cleared or evicted; regular encrypted backups are essential. A site administrator can change JavaScript and therefore access future data entered on that origin.

Customer/catalogue/import text is data, never executable code. HTML output escapes it; logos accept locally resized PNG, JPEG and WebP only, and colours must be hex values. A Content Security Policy blocks third-party scripts, objects and remote images. No analytics or runtime third-party resources are loaded. CSV formula-leading fields receive a protective apostrophe; spreadsheet import behavior varies.

Backups may contain private notes, remembered prices and GPS coordinates. Passphrase exports use PBKDF2-SHA256 (600,000 iterations), AES-256-GCM, independent random salts and IVs, and authenticated envelope metadata. Decryption and validation precede import. Passphrases are neither retained nor recoverable. Plain JSON export remains available behind a warning. Imports have a 50 MB size limit and bounded KDF iteration count. A malformed or unauthenticated file must not mutate the store. Existing IDs are retained; import is not a synchronisation protocol.

Sequential numbering is local. Independent devices and restoration of stale backups cannot provide global uniqueness. A durable number ledger prevents reuse after soft deletion or failed writes while device state remains intact. Web Locks serialize concurrent transactions where supported; keep one writable tab open, particularly on older browsers. Quota failures are visible. Bucket writes and metadata are journaled so an interrupted save can be completed when reopening.

The optional Node server has no API or data persistence. It binds only the allocated loopback address and port, checks the Host header and serves an explicit public-asset allowlist. It refuses unknown paths and mutation methods. It is not intended as a network-facing server. Use an HTTPS static host for phones and tablets.

GPS is opt-in and uses only positions the owner saves locally. The browser/OS may use its own location services. Share and email actions intentionally transfer the chosen customer document to another app; that app controls delivery, retention and any charges. A recorded share/export action is not proof of delivery. Payment records are bookkeeping notes, not payment processing.
