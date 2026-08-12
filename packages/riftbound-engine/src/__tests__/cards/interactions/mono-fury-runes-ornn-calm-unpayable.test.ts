/**
 * Interaction: Ornn, Blacksmith (sfd-058-221) · Unit · Calm · [5] + [calm]
 *   × Daughter of the Void (ogn-247-298) · Champion Legend · Fury/Mind
 *       "[Exhaust]: [Reaction] — [Add] [rainbow]. Use only to play spells."
 *   × Gold (sfd-t03) · Gear token · domainless
 *       "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]."
 *   with a rune deck of 12 Fury Runes (ogn-007-298) only.
 *
 * Rules: 103.1.b.1 (cards in your deck must abide by your Domain Identity), 103.3.a.1 (rune
 * deck cards must be of the Champion Legend's Domain Identity), 135.2.e.4 (Power of a
 * specific Domain is its domain symbol), 135.2.e.5.a / 135.2.e.5.b ([rainbow] pays, and is
 * spent on, a Power cost of ANY Domain), 164.2.b / 164.2.b.1 (Recycle this: [Reaction] — Add
 * [C]; the Power added corresponds to the recycled Rune's Domain), 187.5 (a Gold gear token
 * is a DOMAINLESS gear token with "Kill this, [E]: [Add] [rainbow]" — no earmark), 358.2
 * (check that all costs were paid), 358.5 (if a check fails the actions taken are undone and
 * the play is cancelled).
 *
 * Question: with only Fury Runes in the rune deck, can this player EVER pay Ornn's [calm]?
 * (a) from runes alone; (b) from Daughter of the Void's [rainbow]; (c) from a Gold token's
 * [rainbow]. Is the domain gap surfaced BEFORE the game by deck validation, or only
 * discovered mid-game? When Ornn is unplayable, is the refusal clean — costs untouched?
 *
 * Expected: pregame, 103.3.a.1 + 103.1.b.1 make Ornn a Domain-Identity violation under
 * Daughter of the Void (fury/mind ∌ calm), and the validator MUST report it at deckbuild time
 * with a coded error naming the offending card and its domain; the 12 Fury Runes themselves
 * are legal (fury IS in the identity). Because an app may permit an illegal deck anyway, the
 * engine should also emit a pregame "unpayable cost" advisory — a static reachability check
 * comparing every printed Power pip in the main deck (135.2.e.4) against the domains
 * obtainable from the rune deck plus unrestricted Add sources — so a deck whose domains are
 * all legal but whose runes still cannot reach a pip is caught before turn 1. In game:
 * (a) Power comes from recycling runes (164.2.b/164.2.b.1: the Power added corresponds to the
 * recycled rune's Domain), so 12 Fury Runes can only ever add fury and Ornn's calm pip is
 * unreachable; (b) 135.2.e.5.a/b would let a [rainbow] satisfy [calm], but Daughter of the
 * Void's printed "Use only to play spells" earmarks the Power she adds and Ornn is a unit, so
 * the engine must refuse; (c) the Gold token's [rainbow] carries no such restriction (187.5),
 * legally pays the [calm] pip and Ornn plays normally — the affirmative side proving the
 * engine is not blanket-blocking off-domain cards. Refusal shape: the play fails the cost
 * check (358.2) and is undone and cancelled (358.5) — no Energy consumed, no rune exhausted,
 * Ornn still in hand; never a hang, never a partially-paid state.
 */
import { describe, expect, test } from "bun:test";
import type { BattlefieldCard, Card, LegendCard, RuneCard, UnitCard } from "@tcg/riftbound-types/cards";
import { P1, loadDefaultCardPool, scenario } from "../../../harness";
import { type DeckConfig, validateDeck } from "../../../validators/deck-validators";

const ORNN = "sfd-058-221";
const DAUGHTER_OF_THE_VOID = "ogn-247-298";
const GOLD = "sfd-t03";
const FURY_RUNE = "ogn-007-298";

// ---------------------------------------------------------------------------
// Pregame — deck validation
// ---------------------------------------------------------------------------

async function def<T>(id: string): Promise<T> {
  const pool = await loadDefaultCardPool();
  const card = pool.get(id);
  expect(card).toBeDefined();
  return card as unknown as T;
}

/** A Kai'Sa champion unit for Daughter of the Void, kept minimal so the test states its own board. */
const kaisa: UnitCard = {
  cardType: "unit",
  domain: "fury",
  id: "test-kaisa" as UnitCard["id"],
  isChampion: true,
  might: 4,
  name: "Kai'Sa, Test Champion",
  tags: ["Kai'Sa"],
};

const filler = (i: number): Card =>
  ({
    cardType: "unit",
    domain: "fury",
    id: `test-filler-${i}`,
    might: 2,
    name: `Filler ${i}`,
  }) as unknown as Card;

const battlefield = (i: number): BattlefieldCard =>
  ({
    cardType: "battlefield",
    id: `test-bf-${i}`,
    name: `Test Battlefield ${i}`,
  }) as unknown as BattlefieldCard;

/** Daughter of the Void (fury/mind), 12 Fury Runes, and `extra` slotted into a 40-card main deck. */
async function deckWith(extra: Card[], legend?: LegendCard): Promise<DeckConfig> {
  const furyRune = await def<RuneCard>(FURY_RUNE);
  const main = [...extra, ...Array.from({ length: 40 - extra.length }, (_u, i) => filler(i))];
  return {
    battlefields: [battlefield(1), battlefield(2), battlefield(3)],
    chosenChampion: kaisa,
    legend: legend ?? (await def<LegendCard>(DAUGHTER_OF_THE_VOID)),
    mainDeck: main,
    mode: "duel",
    runeDeck: Array.from({ length: 12 }, () => furyRune),
  };
}

// ---------------------------------------------------------------------------
// In game
// ---------------------------------------------------------------------------

/** Ornn in hand, Daughter of the Void as the legend, six channelled Fury Runes, 5 Energy. */
function board() {
  return scenario()
    .legend(P1, DAUGHTER_OF_THE_VOID, "legend")
    .hand(P1, ORNN, "ornn")
    .runes(P1, "fury", 6)
    .resources(P1, { energy: 5 });
}

describe("Mono-fury runes vs Ornn's [calm] pip — restricted rainbow vs unrestricted rainbow", () => {
  // ---- pregame -------------------------------------------------------------------------

  test("PREGAME: Ornn is a Domain-Identity violation under Daughter of the Void (103.1.b.1) and the validator names the card and its domain", async () => {
    const result = validateDeck(await deckWith([await def<Card>(ORNN)]));
    expect(result.valid).toBe(false);
    const violation = result.errors.find((e) => e.code === "DOMAIN_IDENTITY_VIOLATION");
    expect(violation).toBeDefined();
    expect(violation?.message).toContain("Ornn, Blacksmith");
    expect(violation?.message).toContain("calm");
    expect(violation?.message).toContain("fury");
  });

  test("PREGAME: the 12 Fury Runes are NOT the problem — fury is in the identity, so 103.3.a.1 is satisfied", async () => {
    const result = validateDeck(await deckWith([await def<Card>(ORNN)]));
    expect(result.errors.filter((e) => e.code === "RUNE_DOMAIN_VIOLATION")).toEqual([]);
    expect(result.errors.filter((e) => e.code === "RUNE_DECK_WRONG_SIZE")).toEqual([]);
  });

  test("PREGAME: a deck with no off-domain card at all is clean — the report above is about Ornn, not about the shape of the deck", async () => {
    const result = validateDeck(await deckWith([]));
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  test.failing(
    "PREGAME BUG: no unpayable-cost advisory — a fully domain-LEGAL deck whose 12 Fury Runes can never reach a printed [calm] pip validates clean (135.2.e.4 / 164.2.b.1)",
    async () => {
      // A fury/calm legend makes both Ornn and the Fury Runes legal under 103.1.b.1 and
      // 103.3.a.1, yet no rune in the deck can ever add calm, so Ornn is dead weight.
      // Expected: a coded advisory naming the unreachable pip, reported before turn 1.
      // Actual: validateDeck only checks domain identity membership, so it returns valid.
      const furyCalmLegend = {
        cardType: "legend",
        championTag: "Kai'Sa",
        domain: ["fury", "calm"],
        id: "test-legend-fury-calm",
        name: "Test Legend, Fury/Calm",
      } as unknown as LegendCard;
      const result = validateDeck(await deckWith([await def<Card>(ORNN)], furyCalmLegend));
      expect(result.errors.filter((e) => e.code === "DOMAIN_IDENTITY_VIOLATION")).toEqual([]);
      const advisory = result.errors.find((e) => e.code.includes("UNPAYABLE"));
      expect(advisory).toBeDefined();
      expect(advisory?.message).toContain("calm");
    },
  );

  // ---- (a) runes alone ------------------------------------------------------------------

  test("(a) recycling a Fury Rune adds FURY power (164.2.b.1) — 12 Fury Runes can never add calm", async () => {
    const game = await board().build();
    expect(game.p1.resources().power).toEqual({});
    const runes = game.p1.runes();
    await game.p1.recycleRune(runes[0] as string);
    expect(game.p1.power("fury")).toBe(1);
    expect(game.p1.power("calm")).toBe(0);
    await game.p1.recycleRune(runes[1] as string);
    expect(game.p1.resources().power).toEqual({ fury: 2 });
  });

  test("(a) with Energy to spare and nothing but fury Power, Ornn is not playable", async () => {
    const game = await board().build();
    await game.p1.recycleRune(game.p1.runes()[0] as string);
    expect(game.p1.energy()).toBeGreaterThanOrEqual(5);
    expect(game.p1.can("play", "ornn")).toBe(false);
  });

  // ---- (b) Daughter of the Void's earmarked rainbow --------------------------------------

  test("(b) Daughter of the Void's ability adds a [rainbow] to the pool", async () => {
    const game = await board().build();
    await game.p1.activate("legend", 0);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.state("legend").isExhausted).toBe(true);
  });

  test("(b) that [rainbow] still cannot pay Ornn's [calm]: 'Use only to play spells' earmarks it and Ornn is a unit", async () => {
    const game = await board().build();
    await game.p1.activate("legend", 0);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.p1.can("play", "ornn")).toBe(false);
  });

  test("(b) the refusal is clean (358.2 / 358.5): the play is rejected, no Energy is spent, no rune is exhausted and Ornn stays in hand", async () => {
    const game = await board().build();
    await game.p1.activate("legend", 0);
    const energyBefore = game.p1.energy();
    const powerBefore = { ...game.p1.resources().power };
    const readyBefore = game.p1.runes({ ready: true }).length;

    const attempt = await game.p1.try((p) => p.play("ornn"));
    expect(attempt.ok).toBe(false);

    expect(game.p1.energy()).toBe(energyBefore);
    expect(game.p1.resources().power).toEqual(powerBefore);
    expect(game.p1.runes({ ready: true })).toHaveLength(readyBefore);
    expect(game.zoneOf("ornn")).toBe("hand");
    expect(game.p1.hand()).toContain("ornn");
    expect(game.violations()).toEqual([]);
  });

  // ---- (c) the Gold token's unrestricted rainbow -----------------------------------------

  test("(c) a Gold gear token adds an UNRESTRICTED [rainbow] (187.5) and Ornn becomes playable at once", async () => {
    const game = await board().gear(P1, GOLD, "gold").build();
    expect(game.p1.can("play", "ornn")).toBe(false); // nothing in the pool yet
    await game.p1.activate("gold", 0);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.p1.can("play", "ornn")).toBe(true);
  });

  test("(c) and Ornn actually plays: 135.2.e.5.b — the [rainbow] is spent on the [calm] pip, the Energy is paid, Ornn arrives at base", async () => {
    const game = await board().gear(P1, GOLD, "gold").build();
    await game.p1.activate("gold", 0);
    await game.p1.play("ornn");
    await game.settle();
    expect(game.zoneOf("ornn")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.p1.power("calm")).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("(c) the two rainbows differ only in the earmark: same board, Daughter of the Void's [rainbow] refuses where the Gold's pays", async () => {
    const viaLegend = await board().build();
    await viaLegend.p1.activate("legend", 0);
    expect(viaLegend.p1.can("play", "ornn")).toBe(false);

    const viaGold = await board().gear(P1, GOLD, "gold").build();
    await viaGold.p1.activate("gold", 0);
    expect(viaGold.p1.can("play", "ornn")).toBe(true);
  });
});
