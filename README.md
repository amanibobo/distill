# Distill

Distill turns NISAR radar data into a searchable, self-explaining map of how Earth's surface is changing. It was built for NASA Space Apps 2026, *Dancing with the SARs*.

Read [docs/prd.md](docs/prd.md) for the product, and [docs/decisions.md](docs/decisions.md) for every choice since. Decisions win where the two differ.

## Layout

- `pipeline/` holds the Python code. It streams NISAR GCOV windows from ASF, detects space-time change events, labels them with rules, scores them against independent maps, and captions them with Claude.
- `db/migrations/` holds the Postgres schema (PostGIS and pgvector).
- `web/` is the Next.js app. It has a landing page, `/map`, `/process` and `/writeup`.

## Run it

You need an Earthdata login in `~/.netrc`, and `ANTHROPIC_API_KEY` in `.env`. Add `DATABASE_URL` to `.env` too if you want to use Postgres.

```sh
cd pipeline
uv run python -m distill.fetch           # stream and cache every site (resumable)
uv run python -m distill.run             # detect, label, score, caption, export
uv run python -m distill.load            # load out/*.json into Postgres (needs DATABASE_URL)
uv run pytest

cd ../web
pnpm install
pnpm dev
```

Without `DATABASE_URL`, the app reads `pipeline/out/*.json` directly, so the map works before Postgres is set up.

Accuracy numbers are in [pipeline/reports/accuracy.md](pipeline/reports/accuracy.md).
