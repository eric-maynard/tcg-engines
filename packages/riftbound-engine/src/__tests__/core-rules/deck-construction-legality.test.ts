/**
 * Core rules — Deck construction legality (card-independent).
 *
 * Rules covered:
 *   103.1      1 Champion Legend; its domains ARE the deck's Domain Identity
 *   103.1.b    domain identity: single-domain card must be in identity (103.1.b.3),
 *              multi-domain card needs EVERY printed domain (103.1.b.4), domainless is free
 *   103.2      Main Deck of at least 40 cards (no maximum)
 *   103.2.a    the Chosen Champion is a champion UNIT carrying the legend's champion TAG
 *   103.2.b    at most 3 cards with the same printed NAME — the Champion-Zone copy counts
 *   103.2.c    every Main Deck card obeys the Domain Identity
 *   103.2.d    at most 3 Signature cards TOTAL; 103.2.d.2 each must carry the legend's tag;
 *              103.2.d.3 champion units are not Signature cards
 *   103.2.e    validation reports every violation, it does not short-circuit
 *   103.3      Rune Deck of EXACTLY 12 runes, all in the Domain Identity (103.3.a.1);
 *              the 3-per-name Main Deck limit does not reach it
 *   103.4      3 battlefields per deck, distinct names (103.4.c), domain identity if
 *              applicable (103.4.b); 485.4/486.4.a duel & match, 487.4.a–489.4.a multiplayer
 *   825.1–4    [Unique]: at most ONE card of that name in a deck; no gameplay effect
 *   112/133.4  the chosen champion is a Main Deck card that merely BEGINS in the Champion Zone
 *
 * Everything is built from inline definitions; the only real card ids appear in the last
 * describe, where a deliberately illegal deck is seated through the game constructor.
 */

import { describe, expect, test } from "bun:test";
import type { Domain } from "@tcg/riftbound-types";
import {
  type BattlefieldCard,
  type Card,
  type LegendCard,
  type RuneCard,
  type UnitCard,
  createCardId,
} from "@tcg/riftbound-types/cards";
import { type DeckConfig, validateDeck } from "../../validators/deck-validators";
import { Game, P1, loadDefaultCardPool } from "../../harness";

// ---------------------------------------------------------------------------
// Inline card factories (no printed cards anywhere in this section)
// ---------------------------------------------------------------------------

let counter = 0;
const nextId = (): string => `dcl-${(counter += 1)}`;

const legend = (overrides: Partial<LegendCard> = {}): LegendCard => ({
  cardType: "legend",
  championTag: "Tag",
  domain: ["fury"] as Domain[],
  id: createCardId(nextId()),
  name: "Test Legend",
  ...overrides,
});

const champion = (overrides: Partial<UnitCard> = {}): UnitCard => ({
  cardType: "unit",
  domain: "fury" as Domain,
  id: createCardId(nextId()),
  isChampion: true,
  might: 5,
  name: "Hero, Alpha",
  tags: ["Tag"],
  ...overrides,
});

const unit = (overrides: Partial<UnitCard> = {}): UnitCard => ({
  cardType: "unit",
  domain: "fury" as Domain,
  id: createCardId(nextId()),
  might: 2,
  name: `Filler ${counter}`,
  ...overrides,
});

const rune = (overrides: Partial<RuneCard> = {}): RuneCard => ({
  cardType: "rune",
  domain: "fury" as Domain,
  id: createCardId(nextId()),
  isBasic: true,
  name: "Fury Rune",
  ...overrides,
});

let bfCounter = 0;
const battlefield = (overrides: Partial<BattlefieldCard> = {}): BattlefieldCard => ({
  cardType: "battlefield",
  domain: "fury" as Domain,
  id: createCardId(nextId()),
  name: `Test Battlefield ${(bfCounter += 1)}`,
  ...overrides,
});

/** `n` distinct filler names, `copies` of each — never more than 3 of a name. */
const fillers = (n: number, copies = 1, domain: Domain = "fury"): Card[] => {
  const out: Card[] = [];
  for (let i = 0; i < n; i++) {
    const name = `Filler ${i + 1}`;
    for (let c = 0; c < copies; c++) {
      out.push(unit({ domain, name }));
    }
  }
  return out;
};

/** A main deck of exactly `size` cards headed by `head` (the chosen champion et al). */
const mainDeckOf = (size: number, head: Card[] = []): Card[] => {
  const rest: Card[] = [];
  let i = 0;
  while (head.length + rest.length < size) {
    const name = `Body ${Math.floor(i / 3) + 1}`;
    rest.push(unit({ name }));
    i += 1;
  }
  return [...head, ...rest];
};

const runes = (n: number, domain: Domain = "fury"): RuneCard[] =>
  Array.from({ length: n }, () => rune({ domain, name: `${domain} Rune` }));

const threeBattlefields = (): BattlefieldCard[] => [battlefield(), battlefield(), battlefield()];

/** A legal duel deck: chosen champion C inside a 40-card main deck, 12 runes, 3 battlefields. */
const legalConfig = (overrides: Partial<DeckConfig> = {}): DeckConfig => {
  const L = legend();
  const C = champion();
  return {
    battlefields: threeBattlefields(),
    chosenChampion: C,
    legend: L,
    mainDeck: mainDeckOf(40, [C]),
    mode: "duel",
    runeDeck: runes(12),
    ...overrides,
  };
};

const codes = (config: DeckConfig): string[] => validateDeck(config).errors.map((e) => e.code);
const messagesFor = (config: DeckConfig, code: string): string[] =>
  validateDeck(config)
    .errors.filter((e) => e.code === code)
    .map((e) => e.message);

// ---------------------------------------------------------------------------
// 103 — a minimal legal deck
// ---------------------------------------------------------------------------

describe("103 — a minimal legal deck validates clean", () => {
  test("40 main (champion included), 12 runes, 3 duel battlefields, one legend: valid with NO errors at all", async () => {
    const result = validateDeck(legalConfig());
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  test("the deck's 3 battlefields are legal in duel even though only 2 end up in play (485.4, 486.4.a)", async () => {
    // 485.4: a duel puts 2 battlefields in play; 485.4.a: each deck still PROVIDES 3.
    expect(codes(legalConfig({ mode: "duel" }))).toEqual([]);
    expect(codes(legalConfig({ mode: "match" }))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 103.2 — main deck size
// ---------------------------------------------------------------------------

describe("103.2 — Main Deck minimum of 40 counts the Champion-Zone copy, and has no maximum", () => {
  test("39 cards (champion + 38) is one MAIN_DECK_TOO_SMALL error naming 39 and nothing else", async () => {
    const C = champion();
    const config = legalConfig({ chosenChampion: C, mainDeck: mainDeckOf(39, [C]) });
    expect(codes(config)).toEqual(["MAIN_DECK_TOO_SMALL"]);
    expect(messagesFor(config, "MAIN_DECK_TOO_SMALL")[0]).toContain("39");
  });

  test("40 cards (champion + 39) is legal — the champion is a Main Deck card that merely BEGINS in the Champion Zone (112, 133.4)", async () => {
    const C = champion();
    const config = legalConfig({ chosenChampion: C, mainDeck: mainDeckOf(40, [C]) });
    expect(validateDeck(config).valid).toBe(true);
    // …and the size the validator judged is 40, not 41 (no double count) nor 39 (not ignored).
    expect(config.mainDeck).toHaveLength(40);
    expect(config.mainDeck.filter((c) => c.id === C.id)).toHaveLength(1);
  });

  test("60 cards is legal: 103.2 states a minimum only — no 'deck too large' error exists", async () => {
    const C = champion();
    expect(codes(legalConfig({ chosenChampion: C, mainDeck: mainDeckOf(60, [C]) }))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 103.2.b — copies per printed NAME
// ---------------------------------------------------------------------------

describe("103.2.b — at most 3 cards of the same printed NAME", () => {
  test("a 4th copy of one name is a single TOO_MANY_COPIES error naming the card and the count 4; the 3-ofs beside it stay clean", async () => {
    const C = champion();
    const four = Array.from({ length: 4 }, () => unit({ name: "Overplayed" }));
    const threes = fillers(2, 3); // two other names at the legal limit
    const config = legalConfig({
      chosenChampion: C,
      mainDeck: mainDeckOf(40, [C, ...four, ...threes]),
    });
    const errs = validateDeck(config).errors.filter((e) => e.code === "TOO_MANY_COPIES");
    expect(errs).toHaveLength(1); // one per offending NAME, not one per excess copy
    expect(errs[0]?.message).toContain("Overplayed");
    expect(errs[0]?.message).toContain("4");
  });

  test("reducing that name to 3 makes the deck legal again", async () => {
    const C = champion();
    const three = Array.from({ length: 3 }, () => unit({ name: "Overplayed" }));
    expect(codes(legalConfig({ chosenChampion: C, mainDeck: mainDeckOf(40, [C, ...three]) }))).toEqual([]);
  });

  test("the Champion-Zone copy counts toward its own name's 3 (103.2.b.1): champion + 2 is legal, champion + 3 is not", async () => {
    const C = champion({ name: "Hero, Alpha" });
    const legal = legalConfig({
      chosenChampion: C,
      mainDeck: mainDeckOf(40, [C, champion({ name: "Hero, Alpha" }), champion({ name: "Hero, Alpha" })]),
    });
    expect(codes(legal)).toEqual([]);

    const illegal = legalConfig({
      chosenChampion: C,
      mainDeck: mainDeckOf(40, [
        C,
        champion({ name: "Hero, Alpha" }),
        champion({ name: "Hero, Alpha" }),
        champion({ name: "Hero, Alpha" }),
      ]),
    });
    const errs = validateDeck(illegal).errors.filter((e) => e.code === "TOO_MANY_COPIES");
    expect(errs).toHaveLength(1);
    expect(errs[0]?.message).toContain("Hero, Alpha");
    expect(errs[0]?.message).toContain("4");
  });

  test("same character, different NAMES: 3 'Hero, Alpha' + 3 'Hero, Beta' sharing one champion tag is legal (103.2.b.2, 103.2.d.3)", async () => {
    const C = champion({ name: "Hero, Alpha" });
    const alphas = [C, champion({ name: "Hero, Alpha" }), champion({ name: "Hero, Alpha" })];
    const betas = Array.from({ length: 3 }, () => champion({ name: "Hero, Beta" }));
    const config = legalConfig({ chosenChampion: C, mainDeck: mainDeckOf(40, [...alphas, ...betas]) });
    const result = validateDeck(config);
    expect(result.errors).toEqual([]);
    // The limit is per full card NAME — never per character, tag or artwork…
    expect(codes(config)).not.toContain("TOO_MANY_COPIES");
    // …and champion units are not Signature cards, so the 3-Signature cap is untouched (103.2.d.3).
    expect(codes(config)).not.toContain("TOO_MANY_SIGNATURE_CARDS");
  });
});

// ---------------------------------------------------------------------------
// 825 — [Unique]
// ---------------------------------------------------------------------------

describe("825.3.a — [Unique] tightens the name limit from 3 to 1", () => {
  const uniqueFlat = (name: string): Card =>
    unit({ name, ...({ keywords: ["Unique"] } as Record<string, unknown>) } as Partial<UnitCard>);
  const uniqueAbility = (name: string): Card =>
    unit({
      abilities: [{ keyword: "Unique", type: "keyword" }] as UnitCard["abilities"],
      name,
    });

  test("two copies of a [Unique] card (flat keywords encoding) is TOO_MANY_UNIQUE_COPIES, and the generic 3-copy check does NOT also fire", async () => {
    const C = champion();
    const config = legalConfig({
      chosenChampion: C,
      mainDeck: mainDeckOf(40, [C, uniqueFlat("Solitary Relic"), uniqueFlat("Solitary Relic")]),
    });
    const errs = validateDeck(config).errors;
    expect(errs.map((e) => e.code)).toEqual(["TOO_MANY_UNIQUE_COPIES"]);
    expect(errs[0]?.message).toContain("Solitary Relic");
    expect(errs.map((e) => e.code)).not.toContain("TOO_MANY_COPIES");
  });

  test("the abilities encoding ({type:'keyword', keyword:'Unique'}) is recognised identically", async () => {
    const C = champion();
    const config = legalConfig({
      chosenChampion: C,
      mainDeck: mainDeckOf(40, [C, uniqueAbility("Sole Survivor"), uniqueAbility("Sole Survivor")]),
    });
    expect(codes(config)).toEqual(["TOO_MANY_UNIQUE_COPIES"]);
  });

  test("ONE copy of the Unique card is clean, and a non-Unique filler at 3 copies beside it stays clean", async () => {
    const C = champion();
    const config = legalConfig({
      chosenChampion: C,
      mainDeck: mainDeckOf(40, [C, uniqueFlat("Solitary Relic"), ...fillers(1, 3)]),
    });
    expect(validateDeck(config).errors).toEqual([]);
  });

  test("a Unique SIGNATURE card counts once against the 3-Signature cap: three Signatures including it is legal", async () => {
    const L = legend({ championTag: "Tag" });
    const C = champion({ tags: ["Tag"] });
    const sig = (name: string, isUnique = false): Card =>
      unit({
        isSignature: true,
        name,
        tags: ["Tag"],
        ...(isUnique ? ({ keywords: ["Unique"] } as Record<string, unknown>) : {}),
      } as Partial<UnitCard>);
    const config = legalConfig({
      chosenChampion: C,
      legend: L,
      mainDeck: mainDeckOf(40, [C, sig("Signed Blade", true), sig("Signed Cape"), sig("Signed Boots")]),
    });
    expect(validateDeck(config).errors).toEqual([]);
  });

  test("that Unique Signature at 2 copies (4 Signatures total) reports BOTH TOO_MANY_UNIQUE_COPIES and TOO_MANY_SIGNATURE_CARDS", async () => {
    const L = legend({ championTag: "Tag" });
    const C = champion({ tags: ["Tag"] });
    const uniqueSig = (): Card =>
      unit({
        isSignature: true,
        name: "Signed Blade",
        tags: ["Tag"],
        ...({ keywords: ["Unique"] } as Record<string, unknown>),
      } as Partial<UnitCard>);
    const plainSig = (name: string): Card => unit({ isSignature: true, name, tags: ["Tag"] });
    const config = legalConfig({
      chosenChampion: C,
      legend: L,
      mainDeck: mainDeckOf(40, [C, uniqueSig(), uniqueSig(), plainSig("Signed Cape"), plainSig("Signed Boots")]),
    });
    const found = codes(config);
    expect(found).toContain("TOO_MANY_UNIQUE_COPIES");
    expect(found).toContain("TOO_MANY_SIGNATURE_CARDS");
  });

  test("825.4 — [Unique] is construction-only: one copy in a legal deck raises nothing that a keyword-bearing card would raise in play", async () => {
    // Nothing in the validator's output distinguishes a legal Unique card from a
    // plain one: the keyword must never become a second copy-limit or a domain rule.
    const C = champion();
    const withUnique = legalConfig({
      chosenChampion: C,
      mainDeck: mainDeckOf(40, [C, uniqueFlat("Solitary Relic")]),
    });
    const withoutUnique = legalConfig({
      chosenChampion: C,
      mainDeck: mainDeckOf(40, [C, unit({ name: "Ordinary Relic" })]),
    });
    expect(validateDeck(withUnique).errors).toEqual(validateDeck(withoutUnique).errors);
  });
});

// ---------------------------------------------------------------------------
// 103.2.d — Signature cards
// ---------------------------------------------------------------------------

describe("103.2.d — Signature cards cap at 3 TOTAL and must carry the legend's champion tag", () => {
  const sig = (name: string, tag = "Tag"): Card => unit({ isSignature: true, name, tags: [tag] });

  test("3 Signature cards of three DIFFERENT names is legal; a 4th distinct name is TOO_MANY_SIGNATURE_CARDS reporting 4", async () => {
    const L = legend({ championTag: "Tag" });
    const C = champion({ tags: ["Tag"] });
    const three = [sig("Sig One"), sig("Sig Two"), sig("Sig Three")];
    expect(
      codes(legalConfig({ chosenChampion: C, legend: L, mainDeck: mainDeckOf(40, [C, ...three]) })),
    ).toEqual([]);

    const config = legalConfig({
      chosenChampion: C,
      legend: L,
      mainDeck: mainDeckOf(40, [C, ...three, sig("Sig Four")]),
    });
    const errs = validateDeck(config).errors.filter((e) => e.code === "TOO_MANY_SIGNATURE_CARDS");
    expect(errs).toHaveLength(1);
    expect(errs[0]?.message).toContain("4");
    // Every NAME is at 1 copy — the cap is a SUM across names, not a per-name limit.
    expect(codes(config)).not.toContain("TOO_MANY_COPIES");
  });

  test("the Signature census excludes champion units carrying the tag (103.2.d.3): 3 champion copies + 3 Signatures is legal", async () => {
    const L = legend({ championTag: "Tag" });
    const C = champion({ name: "Hero, Alpha", tags: ["Tag"] });
    const config = legalConfig({
      chosenChampion: C,
      legend: L,
      mainDeck: mainDeckOf(40, [
        C,
        champion({ name: "Hero, Alpha", tags: ["Tag"] }),
        champion({ name: "Hero, Alpha", tags: ["Tag"] }),
        sig("Sig One"),
        sig("Sig Two"),
        sig("Sig Three"),
      ]),
    });
    expect(validateDeck(config).errors).toEqual([]);
  });

  test("103.2.d.2 — a Signature card carrying ANOTHER champion's tag is SIGNATURE_TAG_MISMATCH, even while the tag-T census reads 3", async () => {
    const L = legend({ championTag: "Tag" });
    const C = champion({ tags: ["Tag"] });
    const foreign = sig("Foreign Signature", "OtherTag");
    const config = legalConfig({
      chosenChampion: C,
      legend: L,
      mainDeck: mainDeckOf(40, [C, sig("Sig One"), sig("Sig Two"), sig("Sig Three"), foreign]),
    });
    const found = codes(config);
    expect(found).toContain("SIGNATURE_TAG_MISMATCH");
    expect(messagesFor(config, "SIGNATURE_TAG_MISMATCH")[0]).toContain("Foreign Signature");
    expect(messagesFor(config, "SIGNATURE_TAG_MISMATCH")[0]).toContain("Tag");
    // The three legal Signatures are still exactly 3 — the foreign card is not counted
    // into the tag-T cap, so a validator that models Signature as "shares the tag"
    // alone would see nothing wrong here.
    expect(found).not.toContain("TOO_MANY_SIGNATURE_CARDS");
  });
});

// ---------------------------------------------------------------------------
// 103.2.a — the Chosen Champion
// ---------------------------------------------------------------------------

describe("103.2.a — the Chosen Champion is a champion UNIT bearing the legend's champion TAG", () => {
  test("a champion unit with the wrong tag is CHAMPION_TAG_MISMATCH", async () => {
    const L = legend({ championTag: "Zed" });
    const C = champion({ tags: ["Unrelated"] });
    expect(codes(legalConfig({ chosenChampion: C, legend: L, mainDeck: mainDeckOf(40, [C]) }))).toContain(
      "CHAMPION_TAG_MISMATCH",
    );
  });

  test("the tag must be CONTAINED in the champion's tag list, not equal to it: tags ['Zed','Ninja'] is clean", async () => {
    const L = legend({ championTag: "Zed" });
    const C = champion({ tags: ["Zed", "Ninja"] });
    expect(validateDeck(legalConfig({ chosenChampion: C, legend: L, mainDeck: mainDeckOf(40, [C]) })).errors).toEqual(
      [],
    );
  });

  test("a NON-champion unit with the right tag is CHAMPION_NOT_CHAMPION_UNIT — the correct tag alone is not sufficient", async () => {
    const L = legend({ championTag: "Zed" });
    const notAChampion = unit({ isChampion: false, isSignature: true, name: "Zed's Blade", tags: ["Zed"] });
    const config = legalConfig({
      chosenChampion: notAChampion as UnitCard,
      legend: L,
      mainDeck: mainDeckOf(40, [notAChampion]),
    });
    const found = codes(config);
    expect(found).toContain("CHAMPION_NOT_CHAMPION_UNIT");
    // …and it is NOT excused by the tag matching.
    expect(found).not.toContain("CHAMPION_TAG_MISMATCH");
  });

  test("matching is never NAME-based: a champion tagged with the legend's printed NAME is CHAMPION_TAG_MISMATCH", async () => {
    const L = legend({ championTag: "Zed", name: "Blade Dancer" });
    const C = champion({ tags: ["Blade Dancer"] });
    expect(codes(legalConfig({ chosenChampion: C, legend: L, mainDeck: mainDeckOf(40, [C]) }))).toContain(
      "CHAMPION_TAG_MISMATCH",
    );
  });
});

// ---------------------------------------------------------------------------
// 103.1.b / 103.2.c — Domain Identity
// ---------------------------------------------------------------------------

describe("103.1.b — Domain Identity: single-domain in-set, multi-domain needs ALL, domainless always legal", () => {
  const duo = (): LegendCard => legend({ domain: ["fury", "chaos"] as Domain[] });

  test("under a [fury, chaos] legend: [fury] ok, [fury,chaos] ok, domainless ok, [fury,calm] violates and the message lists the full domain list", async () => {
    const L = duo();
    const C = champion({ domain: "fury" as Domain });
    const config = legalConfig({
      chosenChampion: C,
      legend: L,
      mainDeck: mainDeckOf(40, [
        C,
        unit({ domain: "fury" as Domain, name: "Mono In" }),
        unit({ domain: ["fury", "chaos"] as Domain[], name: "Duo In" }),
        unit({ domain: undefined, name: "Colorless" }),
        unit({ domain: ["fury", "calm"] as Domain[], name: "Duo Out" }),
      ]),
    });
    const errs = validateDeck(config).errors.filter((e) => e.code === "DOMAIN_IDENTITY_VIOLATION");
    expect(errs).toHaveLength(1);
    expect(errs[0]?.message).toContain("Duo Out");
    expect(errs[0]?.message).toContain("fury");
    expect(errs[0]?.message).toContain("calm");
  });

  test("the same main deck under a mono-[fury] legend: the [fury,chaos] card now violates too (103.1.b.4 — EVERY domain must be present), while [fury] and domainless stay clean", async () => {
    const C = champion({ domain: "fury" as Domain });
    const mainDeck = mainDeckOf(40, [
      C,
      unit({ domain: "fury" as Domain, name: "Mono In" }),
      unit({ domain: ["fury", "chaos"] as Domain[], name: "Duo Partial" }),
      unit({ domain: undefined, name: "Colorless" }),
    ]);
    expect(codes(legalConfig({ chosenChampion: C, legend: legend({ domain: ["fury", "chaos"] as Domain[] }), mainDeck }))).toEqual(
      [],
    );
    const mono = legalConfig({ chosenChampion: C, legend: legend({ domain: ["fury"] as Domain[] }), mainDeck });
    const errs = validateDeck(mono).errors.filter((e) => e.code === "DOMAIN_IDENTITY_VIOLATION");
    expect(errs).toHaveLength(1);
    expect(errs[0]?.message).toContain("Duo Partial");
  });
});

// ---------------------------------------------------------------------------
// 103.3 — Rune Deck
// ---------------------------------------------------------------------------

describe("103.3 — the Rune Deck is EXACTLY 12, in identity, with no per-name copy limit", () => {
  test("11 and 13 are both RUNE_DECK_WRONG_SIZE (reporting the actual count); 12 is clean — the count is exact, never 'at least'", async () => {
    const short = legalConfig({ runeDeck: runes(11) });
    expect(codes(short)).toEqual(["RUNE_DECK_WRONG_SIZE"]);
    expect(messagesFor(short, "RUNE_DECK_WRONG_SIZE")[0]).toContain("11");

    const long = legalConfig({ runeDeck: runes(13) });
    expect(codes(long)).toEqual(["RUNE_DECK_WRONG_SIZE"]);
    expect(messagesFor(long, "RUNE_DECK_WRONG_SIZE")[0]).toContain("13");

    expect(codes(legalConfig({ runeDeck: runes(12) }))).toEqual([]);
  });

  test("an off-identity rune among 12 is RUNE_DOMAIN_VIOLATION with NO size error beside it (103.3.a.1)", async () => {
    const L = legend({ domain: ["fury", "chaos"] as Domain[] });
    const runeDeck = [...runes(11, "fury" as Domain), rune({ domain: "calm" as Domain, name: "Calm Rune" })];
    const config = legalConfig({ legend: L, runeDeck });
    expect(codes(config)).toEqual(["RUNE_DOMAIN_VIOLATION"]);
    expect(messagesFor(config, "RUNE_DOMAIN_VIOLATION")[0]).toContain("Calm Rune");
  });

  test("12 copies of ONE named rune is legal: 103.2.b is a Main Deck rule and a rune is not a Main Deck card", async () => {
    const config = legalConfig({ runeDeck: runes(12) });
    expect(config.runeDeck.every((r) => r.name === "fury Rune")).toBe(true);
    expect(validateDeck(config).errors).toEqual([]);
    // The rune deck must not be folded into the main-deck name census.
    expect(codes(config)).not.toContain("TOO_MANY_COPIES");
  });
});

// ---------------------------------------------------------------------------
// 103.4 — Battlefields
// ---------------------------------------------------------------------------

describe("103.4 — battlefields: three per deck, distinct names, identity if applicable", () => {
  test("two battlefields sharing a name is DUPLICATE_BATTLEFIELD_NAME, reported once (103.4.c)", async () => {
    const config = legalConfig({
      battlefields: [battlefield({ name: "Twin Peak" }), battlefield({ name: "Twin Peak" }), battlefield()],
    });
    const errs = validateDeck(config).errors.filter((e) => e.code === "DUPLICATE_BATTLEFIELD_NAME");
    expect(errs).toHaveLength(1);
    expect(errs[0]?.message).toContain("Twin Peak");
  });

  test("4 battlefields in duel or match is WRONG_BATTLEFIELD_COUNT expecting 3", async () => {
    for (const mode of ["duel", "match"] as const) {
      const config = legalConfig({ battlefields: [...threeBattlefields(), battlefield()], mode });
      expect(codes(config)).toEqual(["WRONG_BATTLEFIELD_COUNT"]);
      expect(messagesFor(config, "WRONG_BATTLEFIELD_COUNT")[0]).toContain("3");
    }
  });

  test("only 2 battlefields in duel is WRONG_BATTLEFIELD_COUNT — the duel's '2' is how many end up IN PLAY (485.4), not what the deck provides", async () => {
    const config = legalConfig({ battlefields: [battlefield(), battlefield()], mode: "duel" });
    expect(codes(config)).toEqual(["WRONG_BATTLEFIELD_COUNT"]);
  });

  test("an off-identity battlefield is BATTLEFIELD_DOMAIN_VIOLATION; a domainless battlefield is clean ('if applicable', 103.4.b)", async () => {
    const offIdentity = legalConfig({
      battlefields: [battlefield({ domain: "calm" as Domain, name: "Calm Ruins" }), battlefield(), battlefield()],
    });
    expect(codes(offIdentity)).toEqual(["BATTLEFIELD_DOMAIN_VIOLATION"]);
    expect(messagesFor(offIdentity, "BATTLEFIELD_DOMAIN_VIOLATION")[0]).toContain("Calm Ruins");

    const domainless = legalConfig({
      battlefields: [battlefield({ domain: undefined, name: "Neutral Ground" }), battlefield(), battlefield()],
    });
    expect(validateDeck(domainless).errors).toEqual([]);
  });

  // rule 488.4.a / 489.4.a (mirroring 485.4.a): EVERY mode's deck provides three
  // battlefields — the mode's "Battlefield Count" is how many end up in play.
  test("488.4.a/489.4.a — ffa4 decks also provide 3 battlefields", async () => {
    // Each player provides three; the first player's three are removed at setup,
    // which is a setup step, not a deck-construction reduction.
    expect(codes(legalConfig({ battlefields: threeBattlefields(), mode: "ffa4" }))).toEqual([]);
    expect(codes(legalConfig({ battlefields: [...threeBattlefields(), battlefield()], mode: "ffa4" }))).toEqual([
      "WRONG_BATTLEFIELD_COUNT",
    ]);
  });

  test("ffa3 and magmaChamber likewise want exactly 3", async () => {
    for (const mode of ["ffa3", "magmaChamber"] as const) {
      expect(codes(legalConfig({ mode }))).toEqual([]);
      expect(codes(legalConfig({ battlefields: [battlefield(), battlefield()], mode }))).toEqual([
        "WRONG_BATTLEFIELD_COUNT",
      ]);
    }
  });
});

// ---------------------------------------------------------------------------
// 103.2.e — the report, and what it is NOT
// ---------------------------------------------------------------------------

describe("103 — validation reports every violation at once, and is a report rather than a gate", () => {
  test("a deck violating five rules reports all five codes in one result (no short-circuit)", async () => {
    const L = legend({ championTag: "Tag", domain: ["fury"] as Domain[] });
    const C = champion({ tags: ["WrongTag"] });
    const config: DeckConfig = {
      battlefields: threeBattlefields(),
      chosenChampion: C,
      legend: L,
      mainDeck: mainDeckOf(37, [
        C,
        ...Array.from({ length: 4 }, () => unit({ name: "Overplayed" })),
        unit({ domain: "calm" as Domain, name: "Off Identity" }),
      ]),
      mode: "duel",
      runeDeck: runes(13),
    };
    const result = validateDeck(config);
    expect(result.valid).toBe(false);
    for (const code of [
      "MAIN_DECK_TOO_SMALL",
      "TOO_MANY_COPIES",
      "DOMAIN_IDENTITY_VIOLATION",
      "CHAMPION_TAG_MISMATCH",
      "RUNE_DECK_WRONG_SIZE",
    ]) {
      expect(result.errors.map((e) => e.code)).toContain(code);
    }
  });

  test("an illegal-by-construction deck still SEATS as a playable game (legality is the Format's business, not the rules engine's); only an empty main deck is refused, with a message naming the reason", async () => {
    const pool = await loadDefaultCardPool();
    const filler = "ogn-175-298"; // Shipyard Skulker — vanilla 3-might unit
    const runeId = pool.all().find((c) => c.cardType === "rune")?.id as string;
    const bfIds = pool
      .all()
      .filter((c) => c.cardType === "battlefield")
      .slice(0, 3)
      .map((c) => c.id as string);
    expect(runeId).toBeDefined();
    expect(bfIds).toHaveLength(3);

    // 20 copies of one name, 13 runes: every construction rule above is broken.
    const illegal = {
      battlefieldIds: bfIds,
      mainDeckCardIds: Array(20).fill(filler) as string[],
      runeDeckCardIds: Array(13).fill(runeId) as string[],
    };
    const game = await Game.fromDecks({ p1: illegal, p2: illegal, seed: "illegal-deck" });
    await game.settle();
    expect(game.isOver()).toBe(false);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.legal().length).toBeGreaterThan(0);
    expect(game.violations()).toEqual([]);

    // …but a structurally impossible deck is refused, and says why.
    const empty = { battlefieldIds: bfIds, mainDeckCardIds: [], runeDeckCardIds: [runeId] };
    let error: unknown;
    try {
      await Game.fromDecks({ p1: empty, p2: illegal, seed: "empty-deck" });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).message)).toContain("empty main deck");
  });
});
