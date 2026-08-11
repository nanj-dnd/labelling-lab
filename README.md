# AMP Label Lab

A browser workspace for turning cricket video into expert-reviewed, training-ready
labels. An annotator uploads a clip, marks each delivery to the millisecond, scores
the KPIs that the AMP workbooks define for that player's discipline and tier, and
exports a long-format CSV that a model can train on directly.

The lab is opinionated about one thing above all: **an empty label never means
"fine"**. Every KPI a rubric asks for is either scored with evidence, or explicitly
recorded as unscorable with a reason. That distinction survives into the CSV, which
is why the export can be used for supervised training without silently teaching the
model that missing observations are good ones.

## What's in this repository

This is the **annotator-facing application** — the full labelling UI, the KPI
catalogs, the scoring and validation rules, and the CSV export contract.

The **API service** it talks to (project storage, video media, annotation
persistence, session issuing) is a separate deployment and is *not* in this repo.
See [API contract](#api-contract) for the endpoints the UI expects, which is enough
to implement or point at your own.

```
src/app/labelling/
  LabelLab.tsx           the whole annotation workspace (upload → segment → label → review)
  LabellingGate.tsx      secure-session gate; exchanges a Supabase token for a lab session
  page.tsx               the /labelling route, noindex
  labelling.css          every style the lab uses, scoped under .amp-labelling
  data/
    amp-tiered-kpi-catalog.json   the live catalog: 9 routes, 131 KPIs
    amp-kpi-catalog.json          the earlier flat catalog, kept for legacy documents
  lib/
    rubric.ts            route selection, KPI definitions, camera-view normalization
    labels.ts            annotation document model, scoring, validation, CSV export
    training-contract.ts footwork applicability and evidence-frame canonicalization
    timecode.ts          ms ↔ frame conversion and timecode formatting

src/app/                 the minimal shell that makes the lab a standalone app
tests/                   node:test suites over the route wiring and the label contract
docs/CSV-CONTRACT.md     the `amp-training-labels-long-v2` export specification
integrations/gavel/      the host-app client for the account-deletion purge hook
```

## Quick start

```bash
npm install
cp .env.local.example .env.local   # fill in Supabase + API origin
npm run dev                        # http://localhost:3000/labelling
```

```bash
npm test        # 11 contract tests, no network or browser needed
npm run build
npm run lint
```

`npm test` runs against the source files directly, so it is a fast way to check
that a change hasn't broken the CSV column order, the scoring rules, or the
same-origin API wiring.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project that issues annotator identities |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | yes | Supabase anon/publishable key |
| `AMP_LABEL_LAB_API_ORIGIN` | yes | Origin of the Label Lab API service |

The Supabase client is constructed lazily, so `next build` succeeds without any
Supabase values present — nothing calls Supabase during prerender.

## How the labelling flow works

**1 · Setup.** The annotator uploads a video and records the player reference,
discipline, sex benchmark, age group, camera angle, and frame rate. If multiple
people are visible, the annotator also selects the person to analyse by cricket
role and adds a concrete visual description. The browser computes a SHA-256 of
the file before upload, so every exported row can be traced back to exact source
media.

**2 · Route selection.** Discipline + tier + variant select one of nine routes:

| Discipline | Foundation (~5–9) | Development (~9–13) | Performance (~15+) |
| --- | --- | --- | --- |
| Batting | 7 KPIs | 12 KPIs | Pace 19 · Spin 20 |
| Bowling | 6 KPIs | 10 KPIs | Fast pace 20 · Off-spin 18 · Leg-spin 19 |

Age bands are **hints only**. The source workbooks overlap around age 9 and leave a
gap between roughly 13 and 15, so the annotator always picks the tier explicitly.
Each route's KPI weights sum to 100%.

**3 · Segmentation.** Deliveries are marked as millisecond-precision segments. The
scrubber offers a 2-second precision window with 1 ms steps and single-frame
nudges, because evidence timestamps have to land inside the delivery they describe.

**4 · Labelling.** For each batting delivery the annotator records a controlled
shot type and shot footwork (`front_foot` / `back_foot` / `both` / `unclear`), then
works the KPI list. Shot type and footwork are separate human judgements and are
never inferred from each other or from the outcome note. A KPI is either scored
0–10 with a confidence and at least one evidence timestamp, or marked
`occluded`, `low_quality`, `uncertain`, or `not_applicable` — each of which requires
a reason. KPIs outside the selected camera view are auto-marked `wrong_angle`.

Footwork drives applicability: a `Front-Foot Only` KPI applies to `front_foot` and
`both` deliveries and is excluded on `back_foot`. Excluded rows still appear in the
export, with their scores suppressed, so the exclusion itself is part of the record.

**5 · Review and export.** Validation blocks export on missing footwork where the
route needs it, on evidence outside its delivery segment, and on incomplete required
labels. The video score is a deterministic weighted mean of per-KPI means; below 50%
scored weight the score is suppressed in the UI rather than shown at low confidence.
Export produces `amp-training-labels-long-v2`.

## Data model

An annotation document is one JSON object stored against the video project:

```ts
interface AnnotationDocument {
  schemaVersion: "amp-labels-long-v1";
  deliveries: Delivery[];   // segments, outcome, shotType, shotFootwork
  labels: DeliveryLabel[];  // one per delivery × KPI, keyed `deliveryId::kpiId`
  review: ReviewState;      // annotator/reviewer/adjudicator, tier, bowler type,
                            // capture session, subject focus, and athlete metadata
}
```

Labels are never deleted when they go stale — a label that becomes footwork-excluded
keeps its history in the saved JSON for auditability, and is suppressed only at
export time. Duplicate labels resolve by newest `label_updated_at`, then by `label_id`
as a deterministic tie-breaker.

## CSV export

`docs/CSV-CONTRACT.md` is the full specification and the authority on column
semantics. In short: one row per video × delivery × KPI, `record_id` is the compound
key `video_id::delivery_id::kpi_id`, human ground truth is prefixed `human_`, model
suggestions are prefixed `model_` and never overwrite the human fields.

Crowded-video focus fields repeat on every row, while shot type appears on batting
delivery rows only. Missing required focus or shot metadata remains explicit as
`exclude_incomplete`; no role or shot is guessed for legacy annotations.

For supervised score training use `training_score_eligible=true` with
`training_row_status=ready_scored_label`; include `ready_null_label` rows when
training visibility. Split on `dataset_group_key` so one player and capture session
never straddles train and test.

Column order is version-locked in `LABELS_CSV_COLUMNS`. The footwork and
multi-evidence fields were appended after the original v2 columns, so every
pre-existing column keeps its name and ordinal position. Files are UTF-8 with a BOM,
RFC-4180 quoted, CRLF-terminated.

## API contract

Everything the UI calls is same-origin under `/labelling/api/*`, rewritten in
`next.config.ts` to `AMP_LABEL_LAB_API_ORIGIN`. The rewrite is deliberate: a redirect
would move the browser to the API host and the lab session cookie would stop being
first-party. Every mutating request carries `X-AMP-Lab-CSRF: 1`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/labelling/api/session` | Exchange a Supabase bearer token for a lab session; returns `{ viewer, expiresAt }` |
| `DELETE` | `/labelling/api/session` | Tear the lab session down (also called on sign-out) |
| `GET` | `/labelling/api/videos` | List projects → `{ videos: VideoProject[] }` |
| `POST` | `/labelling/api/videos` | Create a project from upload metadata → `{ video }` |
| `GET` | `/labelling/api/videos/:id` | Load one project with its annotations → `{ video }` |
| `PUT` | `/labelling/api/videos/:id` | Save annotations; send `revision` for optimistic concurrency |
| `PUT` | `/labelling/api/videos/:id/media` | Upload the raw video bytes |
| `GET` | `/labelling/api/videos/:id/media` | Stream media back for playback |
| `DELETE` | `/api/internal/account-purge` | Server-to-server erasure hook (see below) |

Errors are `{ error: string }` with a non-2xx status. The gate additionally requires
a valid RFC-3339 `expiresAt`; it refreshes the session 90 seconds before expiry.

The session is refreshed rather than long-lived, and `LabellingGate` re-establishes
it on Supabase `TOKEN_REFRESHED` events, so a long labelling session doesn't lose
work to an expired token.

## Host-app integration

`integrations/gavel/ampLabelLab.ts` is the client the parent product used to satisfy
account deletion: when a user deletes their account there, it calls the lab's
`DELETE /api/internal/account-purge` with the user's token plus a 32-byte server
secret (`LABEL_LAB_PURGE_SECRET`), so labelling data is erased along with everything
else. It runs on the host's server, not in this app — it lives here so the purge
contract is documented next to the service that implements it. Wire it up if you
mount Label Lab behind a product that has its own account lifecycle; delete the
directory if you don't.

## Notes on the extraction

This repo was split out of a larger Next.js application. The lab code itself is
unchanged; the shell around it is new, and four things differ from the original:

- `next.config.ts` reads the API origin from `AMP_LABEL_LAB_API_ORIGIN` instead of
  hardcoding it.
- `/login` is a minimal Supabase email/password form. The original used the host
  product's branded login with Google and Microsoft SSO. If you front the lab with an
  existing product, delete this page and send users to your own login with
  `?next=/labelling`.
- `LAB_EXIT_PATH` in `LabellingGate.tsx` and `DEFAULT_AUTH_RETURN_PATH` in
  `authReturnPath.ts` point at this app's routes rather than the host product's.
- `AuthContext` keeps session handling and sign-out and drops the host's
  email-change flow.

`tests/labelling-route.test.mjs` was updated to match; the label and CSV contract
tests are byte-identical to the originals.

## License

AGPL-3.0-only. See [LICENSE](LICENSE).
