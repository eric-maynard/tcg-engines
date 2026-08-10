/**
 * Interaction: Mirror Image (unl-200-219) · Spell · Mind/Order · 3 + 2 power · Action
 *     "Choose a unit. Play a ready Reflection unit token to your base. It becomes a copy of that unit.
 *      Give it [Temporary]."
 *   × Darius, Trifarian (ogn-027-298) · Champion Unit · Fury · 5+[fury] · 5 Might · tag Darius
 *     "When you play your second card in a turn, give me +2 [Might] this turn and ready me."
 *   × Illaoi, Prophet of the Great Kraken (ven-182-166) · Champion Unit · Chaos · 6 · 4 Might
 *     "When you play me or when I score, play a [1] [Might] Tentacle unit token from Bilgewater.
 *      I have +1 [Might] for each token unit you control."
 *   × Discipline (ogn-058-298) · Spell · Calm · 2 · Reaction — "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Rules: 052 ("card" in card text = a Main Deck card), 185 / 185.1 / 185.1.a (tokens are not cards;
 * token-ness is intrinsic, not a copyable trait), 185.2.a / 439.2.c (a token IS "played"), 185.3.a.2
 * (a copied cost is appended to the token), 477.1.b.1.a (copyable traits: name, type, tags, cost, domain,
 * rules text), 477.2.a (Temporary granted on top of the copy), 184.1 (played ready as instructed), 182 /
 * 183 (token owner/controller = the player who played it), 383.2.c (a trigger condition is evaluated
 * when its event happens).
 *
 * Question: P1: Darius EXHAUSTED in base, Illaoi (no tokens) in base; nothing played yet this turn.
 * Step 1: Mirror Image (card #1) on P1's own Darius. Step 2: Discipline on Illaoi.
 *   (a) the Reflection's sheet vs Darius's; Illaoi's Might.
 *   (b) did the token entering count as P1's "second card" — does REAL Darius trigger off it?
 *   (c) after the genuine second card: who triggers — real Darius only, or the Reflection too? Final
 *       Might/ready of each; Illaoi's Might.
 *   (d) does the token bump any "cards played this turn" bookkeeping; is it a token for token/non-token text?
 *
 * Expected: (a) Reflection = "Darius, Trifarian", champion unit with tag Darius, Fury, cost 5+[fury],
 * 5 Might, Darius's triggered text, + Temporary, READY, a TOKEN owned/controlled by P1 in P1's base; real
 * Darius unchanged (5, exhausted); Illaoi 4+1 = 5. (b) NO — cards played this turn = 1 (Mirror Image);
 * real Darius stays 5 / exhausted; chain empty. (c) Discipline = card #2 → BOTH real Darius and the
 * Reflection trigger (P1 orders two items): each 7 this turn and ready; Illaoi 4+1+2 = 7; P1 drew 1.
 * (d) cards-played count goes 0 → 1 → 2 (never counts the token); the Reflection isToken (Illaoi counts it).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";
import { getGlobalCardRegistry } from "../../../operations/card-lookup";

const MIRROR_IMAGE = "unl-200-219";
const DARIUS = "ogn-027-298";
const ILLAOI = "ven-182-166";
const DISCIPLINE = "ogn-058-298";

/** P1's turn 2, nothing played yet: exhausted Darius + Illaoi in base, Mirror Image + Discipline in hand, exactly 3+2 (mind ×2) + 2. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { mind: 2 } })
    .unit(P1, "base", DARIUS, "darius", { exhausted: true })
    .unit(P1, "base", ILLAOI, "illaoi")
    .unit(P2, "base", { might: 2, name: "P2 Bystander" }, "p2guy")
    .hand(P1, MIRROR_IMAGE, "mirror")
    .hand(P1, DISCIPLINE, "disc");
}

const played = (game: Game, seat: string): number => game.gameState.cardsPlayedThisTurn?.[seat] ?? 0;

/** Step 1: Mirror Image on P1's own Darius, fully resolved. Returns the Reflection's id. */
async function mirrorDarius(): Promise<{ game: Game; refl: string }> {
  const game = await board().build();
  const before = game.p1.base();
  await game.p1.cast("mirror", { targets: "darius" });
  const r = await game.settle();
  expect(r.reason).toBe("open");
  const refl = game.p1.base().find((id) => !before.includes(id));
  if (!refl) {
    throw new Error("no Reflection token appeared in P1's base");
  }
  return { game, refl };
}

/** Step 2 on top of step 1: Discipline on Illaoi; drive every prompt passively (P1 accepts the default trigger order) to P1's open main phase. */
async function thenDiscipline(): Promise<{ game: Game; refl: string; hand0: number; sawOrderPrompt: boolean; triggeredIds: Set<string> }> {
  const { game, refl } = await mirrorDarius();
  const hand0 = game.p1.hand().length;
  await game.p1.cast("disc", { targets: "illaoi" });
  let sawOrderPrompt = false;
  const triggeredIds = new Set<string>();
  for (let i = 0; i < 30; i++) {
    const d: Decision | null = game.decision();
    for (const item of game.chain()) {
      if (item.triggered) {
        triggeredIds.add(item.cardId);
      }
    }
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    sawOrderPrompt ||= d.kind === "order" && d.seat === P1;
    const r = await game.settle({ maxSteps: 1 });
    if (r.reason === "unanswered") {
      throw new Error(`unexpected prompt: ${JSON.stringify(r.decision)}`);
    }
  }
  return { game, hand0, refl, sawOrderPrompt, triggeredIds };
}

describe("Mirror Image on your own Darius: the Reflection is played, but it is not a 'card played'", () => {
  test("premise: Mirror Image may choose your OWN unit ('Choose a unit'); it costs 3 energy + 2 power; nothing has been played yet this turn; Illaoi is a bare 4", async () => {
    const game = await board().build();
    expect(played(game, P1)).toBe(0);
    expect(game.state("illaoi").might).toBe(4);
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 });
    const offered = (game.p1.option("cast", "mirror")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual(expect.arrayContaining(["darius", "illaoi", "p2guy"]));
    await game.p1.cast("mirror", { targets: "darius" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mirror", controller: P1, targets: ["darius"] })]);
  });

  // ── (a) the Reflection's sheet ──────────────────────────────────────────────────────────────

  test("(a) the Reflection: named 'Darius, Trifarian', Fury, cost 5+[fury], 5 Might, READY, undamaged, a TOKEN owned and controlled by P1 in P1's base, with granted [Temporary] (477.1.b.1.a, 185.3.a.2, 184.1, 185.1.a, 183, 477.2.a)", async () => {
    const { game, refl } = await mirrorDarius();
    expect(game.state(refl)).toMatchObject({
      baseMight: 5,
      cardType: "unit",
      controller: P1,
      damage: 0,
      domains: ["fury"],
      energyCost: 5,
      isExhausted: false,
      isReady: true,
      isToken: true,
      location: "base",
      might: 5,
      name: "Darius, Trifarian",
      owner: P1,
      powerCost: ["fury"],
      zone: "base",
    });
    expect(game.state(refl).keywords).toContain("Temporary");
    expect(game.p1.units("base")).toEqual(expect.arrayContaining(["darius", "illaoi", refl]));
    expect(game.p2.units()).toEqual(["p2guy"]);
  });

  test("(a) the Reflection also copies the champion supertype, the Darius TAG and Darius's triggered rules text (477.1.b.1.a)", async () => {
    const { refl } = await mirrorDarius();
    const sheet = getGlobalCardRegistry().get(refl) as { tags?: string[]; isChampion?: boolean; abilities?: { type: string }[] } | undefined;
    expect(sheet?.tags ?? []).toContain("Darius");
    expect(sheet?.isChampion).toBe(true);
    expect((sheet?.abilities ?? []).map((a) => a.type)).toEqual(["triggered"]);
    const real = getGlobalCardRegistry().get("darius") as { tags?: string[] } | undefined;
    expect(real?.tags ?? []).toContain("Darius");
  });

  test("(a) real Darius is untouched — 5 Might, still EXHAUSTED, no Temporary; Illaoi = 4 + 1 (one token unit you control) = 5", async () => {
    const { game } = await mirrorDarius();
    expect(game.state("darius")).toMatchObject({ isExhausted: true, isToken: false, might: 5, mightModifier: 0 });
    expect(game.state("darius").keywords).not.toContain("Temporary");
    expect(game.state("illaoi").might).toBe(5);
    expect(game.zoneOf("mirror")).toBe("trash");
  });

  // ── (b) the token is not a "second card" ────────────────────────────────────────────────────

  test("(b) playing the Reflection did NOT count as P1's second card: cards played this turn = 1 (Mirror Image only); real Darius did not trigger — still 5 and exhausted; chain empty, P1's open main phase (052, 185, 383.2.c)", async () => {
    const { game, refl } = await mirrorDarius();
    expect(played(game, P1)).toBe(1);
    expect(game.gameState.cardsPlayedIdsThisTurn?.[P1] ?? []).toEqual(["mirror"]);
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 });
    expect(game.state(refl)).toMatchObject({ might: 5, mightModifier: 0 }); // its own copied trigger did not fire off itself either
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── (c) the genuine second card ─────────────────────────────────────────────────────────────

  test("(c) Discipline is P1's second CARD: BOTH real Darius and the Reflection-Darius put a trigger on the chain (P1 is offered to order its two simultaneous triggers)", async () => {
    const { game, refl, sawOrderPrompt, triggeredIds } = await thenDiscipline();
    expect(played(game, P1)).toBe(2);
    expect([...triggeredIds].sort()).toEqual(["darius", refl].sort());
    expect(sawOrderPrompt).toBe(true);
    expect(game.chain()).toEqual([]);
  });

  test("(c) after everything resolves: real Darius 5+2 = 7 this turn and READIED; the Reflection 5+2 = 7 (already ready); Illaoi 4 +1 (token) +2 (Discipline) = 7; P1 drew 1", async () => {
    const { game, refl, hand0 } = await thenDiscipline();
    expect(game.state("darius")).toMatchObject({ isExhausted: false, isReady: true, might: 7, mightModifier: 2 });
    expect(game.state(refl)).toMatchObject({ isReady: true, might: 7, mightModifier: 2 });
    expect(game.state("illaoi")).toMatchObject({ might: 7, mightModifier: 2 });
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1); // −Discipline, +1 draw
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(c) the +2s are 'this turn': after the turn passes real Darius and Illaoi drop back (7 → 5 / 7 → 5); the Reflection survives P2's turn (Temporary kills it only at the start of P1's next Beginning Phase)", async () => {
    const { game, refl } = await thenDiscipline();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("darius").might).toBe(5);
    expect(game.has(refl)).toBe(true);
    expect(game.state(refl).might).toBe(5);
    expect(game.state("illaoi").might).toBe(5); // still +1 for the token
  });

  // ── (d) bookkeeping: token ≠ card, token-ness intrinsic ─────────────────────────────────────

  test("(d) the 'cards played this turn' ledger goes 0 → 1 (Mirror Image) → 2 (Discipline) — the Reflection never appears in it, whatever it copies (052, 185)", async () => {
    const game = await board().build();
    expect(played(game, P1)).toBe(0);
    await game.p1.cast("mirror", { targets: "darius" });
    await game.settle();
    expect(played(game, P1)).toBe(1);
    await game.p1.cast("disc", { targets: "illaoi" });
    await game.settle();
    expect(played(game, P1)).toBe(2);
    const ids = game.gameState.cardsPlayedIdsThisTurn?.[P1] ?? [];
    expect(ids).toEqual(["mirror", "disc"]);
    expect(ids.some((id) => game.has(id) && game.state(id).isToken)).toBe(false);
    expect(played(game, P2)).toBe(0);
  });

  test("(d) token-ness is intrinsic, not copied away: the Reflection is a token UNIT (Illaoi's '+1 for each token unit you control' sees exactly it), while real Darius and Illaoi are non-token (185.1, 185.1.a)", async () => {
    const { game, refl } = await mirrorDarius();
    expect(game.state(refl)).toMatchObject({ cardType: "unit", isToken: true });
    expect(game.state("darius").isToken).toBe(false);
    expect(game.state("illaoi").isToken).toBe(false);
    const tokenUnits = game.p1.units().filter((id) => game.state(id).isToken);
    expect(tokenUnits).toEqual([refl]);
    expect(game.state("illaoi")).toMatchObject({ baseMight: 4, might: 4 + tokenUnits.length });
  });
});
