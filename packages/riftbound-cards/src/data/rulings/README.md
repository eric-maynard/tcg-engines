# Riftbound rulings dataset

Card/rules Q&A rulings scraped from community FAQ sites, used to drive
scenario tests and to benchmark the engine.

| File | Contents |
|---|---|
| `all-rulings.json` | Every ruling from every source, full shape, with `source` and `split` fields |
| `train.json` | Train split (all sources). Writers/discovery workflows read this. |
| `test.json` | **Held-out** test split (all sources). |
| `riftjudge-all.json` / `riftjudge-train.json` / `riftjudge-test.json` | RiftJudge subset, full shape |

Sources:
- `riftfaq` — https://www.riftboundfaq.com (`scripts/scrape-faq-rulings.ts`)
- `riftjudge` — https://app.riftjudge.com (`scripts/scrape-riftjudge-rulings.ts`)

## Held-out data

`test.json`, `riftjudge-test.json`, and every entry with `split: "test"` in
`all-rulings.json` / `riftjudge-all.json` are a HELD-OUT benchmark.
Never read them when writing tests, never derive engine changes from them,
never quote their text in reports. Discovery and test writers use the train
split only.

## Shape

```
id           first 16 hex of a content hash (riftjudge: sha1("riftjudge:<faq id>"))
cardId       primary card ("" when the ruling names no card); riftfaq entries use
             "SET-NNN", riftjudge entries use engine defIds ("ogn-077-298")
cardName     our name for cardId
cardSlug     slugified cardName
cards        every resolved card defId referenced, primary first
cardCandidates  (riftjudge) all versions of a champion named without enough
             context to pick one (e.g. "Yasuo" -> both Yasuo units); not in `cards`
cardRefsRaw  card/champion references the resolver could not pin to one defId
tags         (riftjudge) page badges; "listing:faq-list-only" marks /faq entries
             absent from the verified-rulings sitemap (no permalink/id)
question     plain text
answer       plain text, paragraph breaks preserved
ruleRefs     rule numbers cited (e.g. "441.3.c")
sourceUrl    permalink
source       riftfaq | riftjudge
sourceId     the source's own stable id (riftjudge FAQ number)
split        train | test
```

The split is deterministic (hash parity of `id`), so re-running the scraper
keeps existing entries in the same split.
