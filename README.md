# STREETINT

**Street-level economic intelligence.** The world reads GDP. STREETINT reads pawn shops, cardboard boxes, and the planes over the Atlantic — ten unconventional indicators mined from *Freakonomics* and the wider tradition of alternative signals, each fact-checked, free-sourced, computed live, and served as an API.

An experiment by Hriday. Not investment advice.

## The indices (v1)

| Index | Reads | Source (keyless) |
|---|---|---|
| **Pawn Index** | Households reaching for quick cash | Yahoo FCFS·EZPW vs S&P, gold-controlled |
| **Dollar-Store Trade-Down** | Shoppers switching to cheaper stores | Yahoo DG·DLTR vs XLY |
| **Debt-Collector Barometer** | A default wave being priced early | Yahoo PRAA·ECPG |
| **Dr. Copper** | Growth vs fear | Yahoo copper ÷ gold |
| **Cardboard Box Index** | Goods economy cooling before GDP | Yahoo PKG·IP·SW |
| **RV Canary** | Big-ticket consumer retreat | Yahoo THO·WGO |
| **Quiet Fear** | Crash insurance bought while calm | CBOE SKEW vs VIX |
| **Big Mac Index** | Currency stress | The Economist CSV |
| **Baltic Dry** | World trade demand | Yahoo BDRY |
| **Tanker Tell** | Military mobilization, 1–7 day lead | adsb.lol live flight data |

## Architecture

- **`web/`** — the static site (Cloudflare Pages). Fetches `/v1/indices`, falls back to a bundled `data.json` snapshot.
- **`functions/v1/indices.js`** — the live API (Cloudflare Pages Function). Computes on request, edge-cached 15 minutes, CORS-open.
- **`functions/_compute.mjs`** — the shared, keyless computation. The single source of truth for every index.
- **`scripts/gen.mjs`** — regenerates `web/data.json` locally: `npm run gen`.

The weird front page and any serious dashboard (e.g. the Risk Intelligence Index) drink from the same `/v1/indices` tap.

## The API

```
GET https://<your-project>.pages.dev/v1/indices
```

Returns `{ updated, summary, indices: [ { key, name, value, unit, tone, signalText, spark, read, src, group } ] }`.
`tone` is one of `stress | warn | ok | live | neut` — ready to colour a UI directly.

## Deploy (Cloudflare Pages, free)

1. Push this repo to GitHub.
2. In the Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick this repo.
3. Build settings: framework preset **None**, build command **(empty)**, output directory **`web`**. Pages auto-detects `functions/`.
4. Deploy. Live at `https://<project>.pages.dev`, with the API at `/v1/indices`.

No API keys, no database, no servers.
