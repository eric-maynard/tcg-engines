/**
 * Ruling fd57944d224952c3 — Prodigal Explorer (SFD-199 → sfd-199-221, Ezreal legend) · "[Exhaust]: [Reaction] — Draw 1. Use only if you've
 *     chosen enemy units and/or gear twice this turn with spells or unit abilities."
 *   × Defy (OGN-045 → ogn-045-298) · [Reaction] · "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Viktor, Innovator (OGN-117 → ogn-117-298) · "When you play a card on an opponent's turn, play a 1 [Might] Recruit unit token in your base."
 *
 * Q: If a spell is countered, does it still count toward Ezreal's legend?
 * A: Yes. The "chosen an enemy unit" requirement is met the moment the spell is FINALIZED on the chain with its target; a later Defy does not
 *    undo the choosing. After two such choices you may exhaust the legend and draw. Contrast: for effects that need a card to be PLAYED
 *    (Viktor, Innovator) the countered spell does not count.
 * Rules: 355 (targets chosen at finalization), 425.1.a–b (countered: no effect, not "played"), 419.4.a.1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PRODIGAL_EXPLORER = "sfd-199-221";
const DEFY = "ogn-045-298";
const VIKTOR = "ogn-117-298";
const FRIGID_TOUCH = "sfd-066-221"; // [Reaction] 2: "Give a unit -2 Might this turn." — chooses a unit, cheap enough for Defy
/** A free slow spell P2 uses to open a chain on ITS turn so P1 gets a Reaction window. */
const OPENER = { abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }], cardType: "spell", domain: "calm", energyCost: 0, name: "Opener", timing: "action" } as const;

/**
 * P2's turn (so Viktor's "on an opponent's turn" is live for P1). P1: Prodigal Explorer, Viktor in base, two Frigid Touches + [4], named deck
 * top. P2: Foe (5) in base, two Defys + [2]+2 calm, three Openers.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 4 })
    .resources(P2, { energy: 2, power: { calm: 2 } })
    .legend(P1, PRODIGAL_EXPLORER, "pe")
    .unit(P1, "base", VIKTOR, "viktor")
    .unit(P2, "base", { might: 5, name: "Foe" }, "foe")
    .hand(P1, FRIGID_TOUCH, "ft1")
    .hand(P1, FRIGID_TOUCH, "ft2")
    .hand(P2, DEFY, "defy1")
    .hand(P2, DEFY, "defy2")
    .hand(P2, OPENER, "op1")
    .hand(P2, OPENER, "op2")
    .hand(P2, OPENER, "op3")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

/** P2 opens a chain; P1 answers with a Frigid Touch CHOOSING the enemy Foe; P2 Defies that Touch; everything resolves. */
async function touchFoeGetDefied(game: Game, opener: string, touch: string, defy: string): Promise<void> {
  await game.p2.cast(opener);
  await game.p2.passPriority();
  expect(game.p1.can("cast", touch)).toBe(true);
  await game.p1.cast(touch, { targets: "foe" });
  // 1. finalized on the chain WITH its enemy target — the choice is locked in now
  expect(game.chain().at(-1)).toMatchObject({ cardId: touch, controller: P1, targets: ["foe"] });
  await game.p1.passPriority();
  // 2. the opponent reacts with Defy
  await game.p2.cast(defy, { targets: touch });
  await game.settle();
  // 3. countered: cleared to trash, no effect
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf(touch)).toBe("trash");
  expect(game.zoneOf(defy)).toBe("trash");
  expect(game.state("foe")).toMatchObject({ might: 5, mightModifier: 0 });
}

describe("Ruling fd57944d224952c3 — Defied spells still count as having CHOSEN enemies for Prodigal Explorer (but not as PLAYED for Viktor)", () => {
  test("one countered choice is not enough: after ft1 → Defy the legend is still unusable in P1's next Reaction window", async () => {
    const game = await board().build();
    await touchFoeGetDefied(game, "op1", "ft1", "defy1");
    await game.p2.cast("op2");
    await game.p2.passPriority();
    expect(game.p1.can("activate", "pe")).toBe(false);
  });

  test("4. after TWO Touches that each chose the Foe — both Defied, Foe untouched — P1 may exhaust the legend at Reaction speed: 'Draw 1' goes on the chain and P1 draws d1", async () => {
    const game = await board().build();
    await touchFoeGetDefied(game, "op1", "ft1", "defy1");
    await touchFoeGetDefied(game, "op2", "ft2", "defy2");
    await game.p2.cast("op3");
    await game.p2.passPriority();
    expect(game.p1.can("activate", "pe")).toBe(true);
    expect(game.p1.hand()).toEqual([]);
    await game.p1.activate("pe");
    expect(game.state("pe").isExhausted).toBe(true);
    expect(game.chain().at(-1)).toMatchObject({ cardId: "pe", controller: P1 });
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.violations()).toEqual([]);
  });

  test("contrast (Viktor, Innovator): the countered Touches were NOT 'played' on the opponent's turn — Viktor never made a Recruit; P1's base is still just Viktor", async () => {
    const game = await board().build();
    await touchFoeGetDefied(game, "op1", "ft1", "defy1");
    expect(game.p1.base()).toEqual(["viktor"]);
    await touchFoeGetDefied(game, "op2", "ft2", "defy2");
    expect(game.p1.base()).toEqual(["viktor"]);
    expect(game.p1.units("base").filter((u) => game.state(u).isToken)).toEqual([]);
  });

  test("control for the contrast: an UNcountered Frigid Touch on P2's turn IS played — Foe drops to 3 and Viktor plays a Recruit token", async () => {
    const game = await board().build();
    await game.p2.cast("op1");
    await game.p2.passPriority();
    await game.p1.cast("ft1", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").might).toBe(3);
    const tokens = game.p1.base().filter((u) => game.state(u).isToken);
    expect(tokens).toHaveLength(1);
    expect(game.state(tokens[0]!)).toMatchObject({ might: 1, name: "Recruit" });
  });
});
