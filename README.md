# Papertrail - AI Document Intelligence

Upload PDFs (digital or scanned), ask questions with page-level citations,
extract structured invoice fields with consistency checks, and compare two
documents side by side.

Built with Next.js, NVIDIA NIM models, and Supabase. Deploys on Vercel's free
Hobby plan.

- Live demo: https://k-papertrail.vercel.app (open demo link)
- Repository: https://github.com/Karanaryaa/docintel

## What it does

- **PDF upload and extraction.** Digital PDFs are parsed text-first with
  `unpdf`. Scanned pages automatically fall back to vision-model OCR, with the
  detected page kept as a rendered image so you can check the original.
- **Q&A with citations.** Questions are answered by retrieval-augmented
  generation: the document is chunked, embedded, and the most relevant chunks
  ground the answer. Every answer cites the page it came from, and clicking a
  citation opens that page in the viewer. Questions the document can't answer
  get an honest refusal instead of a guess.
- **Invoice extraction.** Structured fields (vendor, invoice number, dates,
  line items, subtotal, tax, total, currency) are extracted into a typed
  record.
- **Consistency checks.** Each invoice is validated: line items vs subtotal,
  subtotal + tax vs total, and duplicate-invoice detection. The tax check
  compares tax against the itemized base, so mathematically consistent printed
  tax is not falsely flagged when items disagree with the subtotal.
- **Document comparison.** Two documents are diffed by section with an
  AI-written summary of what changed.

## How it works (data flow)

1. **Upload** - the PDF goes to private Supabase Storage; metadata lands in
   the `documents` table. Files over 25 MB are rejected.
2. **Extract** - `unpdf` pulls text per page. Pages with too little text are
   rendered to images and sent to the vision model for OCR. Text + page map is
   stored.
3. **Chunk + embed** - text is split into overlapping chunks, embedded with
   the NVIDIA embedding model, and stored in the `chunks` table.
4. **Ask** - the question is embedded, nearest chunks are retrieved, and the
   chat model answers with page citations. Answers stream back; a working
   indicator shows real elapsed time and rotating tips (no fake progress).
5. **Invoice mode** - the extraction model returns strict JSON, which is
   validated and checked by deterministic rules (no model arithmetic trusted).

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- PDF parsing: `unpdf`; scanned pages fall back to vision-model OCR
- AI: NVIDIA NIM (OpenAI-compatible API), all three tasks below
- Persistence: Supabase (Postgres + Storage) when `SUPABASE_URL` +
  `SUPABASE_SECRET_KEY` are set; ephemeral in-memory store for local
  development. Production refuses to boot without Supabase - fail closed, no
  silent data loss.

### Models (NVIDIA build.nvidia.com)

| Task | Model |
| --- | --- |
| Chat / Q&A / extraction | `nvidia/nemotron-3-ultra-550b-a55b` |
| Vision OCR (scanned pages) | `nvidia/nemotron-3.5-super-vl-120b-a12b` |
| Embeddings | `nvidia/nemotron-3.5-embed-1b` (2048 dims) |

Model choices were measured against the free tier, not guessed: several
catalog models return 404 on free-tier accounts, and the embedding default was
picked after probing the live endpoints. Chat default was kept on measured
answer accuracy. Change any of them with the env vars below.

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `AI_API_KEY` | production | - | NVIDIA NIM key from build.nvidia.com |
| `AI_BASE_URL` | no | `https://integrate.api.nvidia.com/v1` | OpenAI-compatible endpoint |
| `AI_CHAT_MODEL` | no | `nvidia/nemotron-3-ultra-550b-a55b` | Q&A + structured extraction |
| `AI_VISION_MODEL` | no | `nvidia/nemotron-3.5-super-vl-120b-a12b` | scanned-page OCR |
| `AI_EMBED_MODEL` | no | `nvidia/nemotron-3.5-embed-1b` | retrieval embeddings |
| `SUPABASE_URL` | production | - | e.g. `https://<ref>.supabase.co` |
| `SUPABASE_SECRET_KEY` | production | - | service-role key (server only) |
| `APP_ACCESS_CODE` | no | unset | optional shared passcode gate (off in the demo) |

## Access model

The demo deployment is **open**: anyone with the link shares one document
space - every visitor sees every uploaded document. That is deliberate for a
classroom demo, and it is why the synthetic-only rule below matters.

An optional passcode gate exists for private demos: set `APP_ACCESS_CODE`
and every page, API route, and page image requires it (the cookie stores
only the SHA-256 of the code, never the code). It is a single shared
passcode, not multi-user isolation.

Rate limits are enforced server-side and are durable across serverless
instances (counters in the `rate_limits` table, not in-memory):

| Route | Limit |
| --- | --- |
| `POST /api/auth` (login attempts) | 5 / minute / IP |
| `POST /api/documents` (uploads) | 12 / hour / IP |
| `POST /api/chat` | 20 / minute / IP |
| `POST /api/compare` | 10 / minute / IP |

## Privacy and terms (please read before demoing)

- **Synthetic fixtures only.** This deployment runs on NVIDIA's API trial,
  which prohibits personal data and uses submitted content to improve NVIDIA
  products. Only upload the synthetic sample PDFs in `scripts/fixtures/` or
  other non-personal documents. The app shows this warning on screen.
- The trial is **not licensed for production use** - this is a college
  project demo.
- NVIDIA's free tier is rate-limited (roughly 40 requests/minute), so a
  classroom full of simultaneous users will see queuing and 429s.
- Supabase holds uploaded PDFs and extracted text for the life of the demo.

## Local development

```bash
npm install
npm run dev        # works with no keys (ephemeral store, local embeddings)
```

For the full AI path locally, create `.env.local` with `AI_API_KEY` (and
optionally `SUPABASE_URL` + `SUPABASE_SECRET_KEY`). Without `AI_API_KEY`,
development falls back to local transformers.js embeddings
(Xenova/multilingual-e5-small); production never falls back.

## Database setup

Run `scripts/supabase-setup.sql` once against the Supabase project (SQL
editor or psql). It creates:

- `documents`, `chunks`, `invoices` tables + indexes
- `rate_limits` table (durable serverless rate limiting)
- fail-closed row-level security (all access goes through the service role,
  server-side only)
- a private `documents` storage bucket
- the `GRANT`s the service role needs on new projects

## Deploy on Vercel

1. Import the repo into Vercel (Hobby plan works).
2. Set `AI_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SECRET_KEY` as production
   environment variables (plus `APP_ACCESS_CODE` if you want the gate).
3. Deploy. API routes export `maxDuration = 300` (Hobby maximum with fluid
   compute), which covers vision OCR of large scanned pages.

Hobby plan gotchas:

- Git-triggered deploys require every commit author to have Vercel access to
  the project, and Hobby teams can't add members for private repos. If a
  teammate's push gets blocked, deploy from the CLI as the project owner
  (`vercel deploy --prod`) - note the CLI attaches git metadata, so deploy
  from a copy without `.git` if the author rule still bites.
- No SLA; cold starts happen on the first request after idle.

## Tests and evaluation

```bash
npm test           # unit tests (chunking, invoice consistency rules) - 13 tests
npm run test:e2e   # extraction + chunking + retrieval on a fixture PDF
node scripts/eval-nim.mjs   # live-model evals against NVIDIA NIM (needs AI_API_KEY)
```

Live eval results on the fixture set (7 synthetic PDFs - small sample,
indicative not exhaustive):

- Q&A: 2/2 questions answered with correct page citations (2-5s each)
- Invoice extraction: 15/15 expected fields correct across 4 invoices
- Consistency checks: clean invoice - no flags; bad-math invoice -
  LINE_SUM_MISMATCH + TOTAL_MISMATCH + TAX_MISMATCH (all correct); duplicate
  detection - DUPLICATE flagged; discount/shipping and cent-rounding invoices -
  no false flags
- Adversarial PDF (embedded "ignore previous instructions" text) - instruction
  resisted, correct answer
- Unanswerable question - honest refusal, no fabricated citation
- Vision OCR on a scanned fixture - correct text in ~2s

## Troubleshooting

- **429 from the AI API** - NVIDIA free-tier rate limit; wait a minute and
  retry. The app surfaces this as a retryable error.
- **"Server is not configured"** - `AI_API_KEY` (or Supabase vars in
  production) missing.
- **Empty answers on a scanned PDF** - check `AI_VISION_MODEL` is available on
  your NVIDIA account; some catalog models are paid-tier only.
- **Upload rejected** - over 25 MB or not a PDF.
- **Vercel deploy blocked on commit author** - see Hobby gotchas above.

## Repo layout

```
src/app/            pages (viewer, chat, invoices, compare) + API routes
src/components/     UI components (viewer, chat, working indicator, ...)
src/lib/            pdf-extract, chunk, embed, rag, invoice checks, store, ratelimit
src/lib/store/      supabase.ts (production) + local.ts (development)
scripts/            supabase-setup.sql, fixtures/, e2e + live-model evals
```
