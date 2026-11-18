# Papertrail - AI Document Intelligence

Upload PDFs (digital or scanned), ask questions with page-level citations, extract
structured invoice fields, and compare documents side by side.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- PDF parsing: unpdf; scanned pages fall back to vision-model OCR
- Q&A + structured extraction + vision OCR: NVIDIA NIM (OpenAI-compatible API)
- Embeddings: NVIDIA NIM `/v1/embeddings` when `AI_API_KEY` is set, otherwise local
  transformers.js (Xenova/multilingual-e5-small) for development and tests
- Persistence: Supabase (Postgres + Storage) when `SUPABASE_URL` +
  `SUPABASE_SECRET_KEY` are set; ephemeral in-memory store for local development
  (production refuses to boot without Supabase - fail closed, no silent data loss)

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

## Local development

```bash
npm install
npm run dev        # works with no keys (ephemeral store, local embeddings)
npm test           # unit tests
npm run test:e2e   # extraction + chunking + retrieval on fixture PDF
```

## Database setup

Run `scripts/supabase-setup.sql` once against the Supabase project
(SQL editor or psql). It creates `documents`, `chunks`, `invoices`, indexes,
fail-closed RLS, and a private `documents` storage bucket.

## Deploy on Vercel

Import the repo, set the production variables above, deploy. API routes export
`maxDuration = 300` (Hobby plan maximum with fluid compute).
