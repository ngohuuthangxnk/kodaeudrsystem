# KODA EUDR 2.0 — incremental staging candidate

Status: 2026-10-06, staging source only. Production has not been updated.

The package extends the supplied vanilla HTML/CSS/JS → Netlify Function → signed Apps Script bridge → Google Sheet/Drive/Calendar architecture. It contains complete Apps Script service files, frontend files, configuration templates and 40 mocked service/security test groups. It does not certify EUDR compliance or submit an official declaration.

## Run locally

Node.js >=20, no npm dependency installation required.

```bash
npm test
npm run check
python3 -m http.server 8765 --directory public
```

Static server previews only the frontend shell. Authenticated workflows require the real staging Netlify proxy and Google backend; tests mock those services. Local browser UI QA could not be run in the audit environment.

## Package layout

- apps_script/: complete changed backend files and manifest.
- netlify/functions/call.mjs: signed server proxy and personal identity registry.
- public/: existing vanilla stack, official KODA logo and expanded workspace.
- evidence/: observed Sheet snapshot, exact final schema, endpoint map, QA output, source register and migration/QA checklist.
- changes.patch: textual diff against supplied baseline (logo binary included separately).
- backups/: unchanged source ZIP + checksum. This is not a retrieved backup of the live Apps Script project.

## Configuration

- **Spreadsheet ID**: `1xura5W6coeGeJsc1zQMP6Emw_QMTv5XAf0bqpC5Uk3A`. Production observed; replace with staging copy ID.
- **Drive Root Folder ID**: `1BWXpf-L6yBPQtXbskoQKMfN890aZXCJg`. Real folder verified from 09_CONFIG; use dedicated staging root.
- **Google Calendar ID**: `44c53155b661c93b06c6ee49bd9cce5764a91fa80cc57c805de639d3483cfce2@group.calendar.google.com`. Not visible to current connector account; test deploying account separately.
- **Netlify production URL**: `https://koda-eudr-system.netlify.app/`. Read-only inspection, no deployment.
- **ALLOWED_ORIGINS**: `Exact staging URL in both Netlify and Apps Script`. No wildcard; production origin only after release.
- **APPS_SCRIPT_WEBAPP_URL**: `New staging /exec deployment URL`. Netlify environment; live project was not retrieved.
- **DB_ID / ROOT_ID / CALENDAR_ID**: `Staging Sheet / Drive / Calendar IDs`. Apps Script properties; do not call prepared-sheet reconnect helpers.
- **BRIDGE_SECRET**: `Fresh random >=32 characters`. Same server-side secret in Netlify + Apps Script; never in frontend.
- **TOKEN_HASHES_JSON**: `SHA-256 personal token registry`. Netlify only: sha256, email, active, expires_at; distinct tokens >=32 random characters.
- **ALLOW_PILOT_ADMIN**: `false`. Shared pilot credential disabled by default.
- **TIME_ZONE / FRONTEND_URL**: `Asia/Ho_Chi_Minh / exact staging URL`. Set Google calendar timezone and Sheet 09_CONFIG explicitly.
- **Legal settings**: `NOT_REVIEWED until human verification`. LEGAL_RULE_VERSION, ANNEX_I_VERSION, COUNTRY_RISK_VERSION, LAST_LEGAL_REVIEW_DATE, LEGAL_REVIEWED_BY.

## Staged deployment and rollback

### 1. Capture production backup

Retrieve actual current Apps Script project files and manifest, deployment version/settings, Sheet values/formulas/format/protections, Drive inventory/ACLs and Calendar event mapping. Export Netlify/GAS settings securely outside Git. Supplied ZIP is a source backup, not independent proof of live deployed script code.

### 2. Create Git branch

Use the actual existing repository once its URL/access is supplied; create upgrade/eudr-v2-staging. Apply staging/ contents to repository root. Preserve backup ZIP outside deploy root. Do not create a competing production repository or replace hosting providers.

### 3. Create isolated Google staging

Copy current Sheet including auxiliary tabs and any formulas; use a dedicated staging Drive root and Calendar. Ensure the deploying owner is an existing active ADMIN in the staging user table. Do not test with production IDs.

### 4. Install complete Apps Script files

Replace project files with all supplied .gs files and appsscript.json. Set DB_ID, ROOT_ID, CALENDAR_ID, BRIDGE_SECRET, ALLOWED_ORIGINS to staging values in Script properties. Do not run attachPreparedSheet/reconnectPreparedSheet/setupFromProperties against copied production data.

### 5. Run additive migration

Run migrateV2() manually as active Admin on the backed-up staging copy. It validates all header prefixes before mutation; abort SCHEMA_MISMATCH without repair. Expect 21 modeled tables + preserved auxiliary tabs 12 and 13 = 23 visible tabs. Read back exact schema, records and preserved cells. Status mapping is a material data change and requires rollback snapshot.

### 6. Configure APIs and policy

Enable Advanced Calendar v3 and required Google Calendar/Drive APIs in the linked Cloud project; authorize expanded scopes as owner. Update 09_CONFIG FRONTEND_URL and timezone for staging. Keep RULES_CONFIRMED=NO and legal versions NOT_REVIEWED until a named human reviews current authoritative texts and policy.

### 7. Deploy staging Apps Script

Create a separate staging web-app deployment executing as the authorized owner. If anonymous endpoint exposure is used for Netlify, permit it only with mandatory signed bridge requests; doPost has no unauthenticated action path. Record exact /exec URL and Google deployment settings.

### 8. Configure Netlify staging

Deploy the Git branch to an isolated staging site or controlled branch deploy. Keep publish=public, functions=netlify/functions, no framework build. Set APPS_SCRIPT_WEBAPP_URL, fresh BRIDGE_SECRET, exact ALLOWED_ORIGINS and TOKEN_HASHES_JSON; ALLOW_PILOT_ADMIN=false. Origin must match Apps Script exactly.

### 9. Issue scoped personal credentials

Create users/suppliers and assignments in staging as Admin. Generate random personal credentials outside chat, store only SHA-256 + email + active/expiry in Netlify registry, and provide tokens to each user through an authorized secure channel. Admin web management does not generate tokens or send invitations.

### 10. Adopt legacy evidence deliberately

Map known SO25-2183 and exact folder IDs to reviewed database records before allowing a duplicate create. Do not infer EUDR25-06780 equals KODA SO; do not fuzzy-match folder names. Preserve originals and verify original sharing ACLs before supplier rollout. No automatic legacy-record adoption tool is supplied.

### 11. Complete real QA

Run pending matrix and capture API request IDs, before/after Sheet rows, folder/file hashes, event IDs, screenshots and supplier isolation attempts. Test 17.8 MB PDF under the 25-second proxy timeout; inspect quota/memory failure recovery and export caps. The 40 mock tests do not substitute for these checks.

### 12. Release production incrementally

Only after staging QA, business/legal review and migration verification: take a fresh production backup, revalidate schema/config/ACLs, migrate the real Sheet, deploy matching GAS and Netlify versions through existing GitHub pipeline, rotate any temporary credentials and verify production URLs without public rollout until acceptance.

### 13. Rollback

Restore matching original code, deployment versions, configuration and the pre-migration Sheet snapshot together. Old code may not understand uppercase statuses and new relationships. Do not erase newly uploaded originals or audit history; reconcile post-release records into a retained archive before restoring a snapshot.

## Known limits and release gates

- Distinct personal token login is implemented; Google SSO/OTP/self-service credential issuance is not.
- Only PDF, PNG, JPG, JSON and GeoJSON evidence is accepted; SO and product image inputs are limited to 3 MiB each. Evidence and processed PDF chunk transfers support up to 25 MiB.
- Full in-app ZIP source size is capped at 23 MiB; larger case packages require selected exports or a separately implemented asynchronous export path.
- Plot geometry supports points and single-ring polygons only; holes, MultiPolygon and antimeridian crossing are held for specialist review. Source precision is declared and human-reviewed; it is never fabricated.
- N-level lineage supports MDF/veneer forest-origin gaps; quantitative wood mixing, allocation and mass-balance validation is not implemented.
- Assignment operates at order and individual task scope; no independent material/block assignment table. Notifications cover assignments/review/expiry events, without scheduled overdue notices or mentions.
- Sheet audit is append-only through the app, not tamper-proof against Google Sheet owners. Supplier app scope does not override previously shared Drive ACLs.
- Ready-for-operator-review is an internal evidence state. Legal baseline, Annex I, production-country benchmarking and source assertions require human review.
- Repository URL/access, actual Apps Script project access, Netlify deployment permission, target Calendar access and real staging QA remain necessary before release. Do not post secrets in chat.

## Changelog

- **apps_script/Code.gs**: Retained Sheet/storage setup helpers; strict user resolution and expanded append audit. Legacy prepared IDs retained as reference only.
- **apps_script/Migration.gs**: All-table header preflight, additive columns/new tabs, legacy status mapping, safe review defaults; preserves tabs 12–13.
- **apps_script/AuthService.gs**: Role/scope checks; user and supplier management, legal settings, login audit.
- **apps_script/OrderService.gs**: SO/material/folder creation, preview confirmation, parent graph, assignment, operation journal, notifications.
- **apps_script/DocumentService.gs**: MIME/signature checks, original preservation, document versions, comments, reviewer workflow, original-only processed lineage and human verification.
- **apps_script/CalendarService.gs**: Deterministic Calendar v3 event identity and updates, 7/3/1 reminders, permission error handling, completion history.
- **apps_script/GeoService.gs**: Bounded geometry validation, plot lineage and human review, source evidence gates.
- **apps_script/PromptService.gs**: Manual no-API prompts, exact structured import validation, prompt version history.
- **apps_script/MetadataService.gs**: Cited material fields, human scope review, versioned country risk, FSC validity/renewal metadata.
- **apps_script/ExportService.gs**: Approved-active package selection, manifest/index CSV, history Admin gate, server-authorized download.
- **apps_script/TransferService.gs**: Durable actor-bound uploads, chunk integrity, source checksum and bounded Google Drive downloads.
- **apps_script/WorkspaceService.gs**: Scoped bootstrap including supplier material-level chain/GEO isolation, readiness exceptions and controlled internal case closure.
- **apps_script/Bridge.gs**: Uniform response, signed actor, origin checks, HMAC freshness, nonce replay prevention, action allowlist.
- **apps_script/appsscript.json**: Calendar advanced service and server-side external-request scope.
- **netlify/functions/call.mjs**: Preserved Netlify-to-Apps Script bridge; per-user hashed credential registry and uniform errors.
- **netlify.toml**: Preserved deployment structure; hardened CSP including blob document preview and OSM tiles.
- **public/app.js**: Existing vanilla JS expanded to order/evidence/review/chain/GEO/calendar/administration workflows; menus reflect allowed roles.
- **public/index.html / public/style.css**: Responsive work screens and original official KODA logo, without a new framework.
- **public/koda-logo.png**: Unmodified official Drive brand PNG; SHA-256 recorded in evidence register.
- **tests/v2.test.mjs / package.json**: 40 focused Node test groups with mocked Google services; executable standalone test command.
- **.env.example / README_VI.md**: Blank server-secret templates and staged deployment, migration and rollback runbook.
- Replaced obsolete pilot test scripts with the new test matrix; unchanged originals remain in the backup ZIP.
