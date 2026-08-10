/**
 * Ruling e928e677e0981115 — Prodigal Explorer (SFD-199 → sfd-199-221, Ezreal legend) · "[Exhaust]: [Reaction] — Draw 1. Use only
 *     if you've chosen enemy units and/or gear twice this turn with spells or unit abilities."
 *   × Defy (OGN-045 → ogn-045-298) · Reaction · "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   (Virtuoso unl-181-219 is cited only as the contrasting "when you PLAY a spell" kind of trigger.)
 *
 * Q: Does the Ezreal legend still work if the spells I chose enemies with were countered?
 * A: Yes. The "chosen" requirement is met the moment each spell is finalized on the chain with its target; a later counter
 *    doesn't undo that. After two such choices you may exhaust the legend and draw 1 (in an Open State), even though neither
 *    countered spell counts as "played".
 * Rules: 355 (targets chosen at finalization), 425.1 (countered: no effect, not played), 377.2.b ("Use only if…" checks history).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PRODIGAL_EXPLORER = "sfd-199-221";
const DEFY = "ogn-045-298";
const FRIGID_TOUCH = "sfd-066-221"; // [2] Mind Reaction: give a unit −2 Might this turn — CHOOSES a unit
const FILLER = "ogn-175-298";

/** P1's turn: legend + two Frigid Touches ([4]); P2: Foe (5) in base and two Defys with [2]+2 calm; P1's deck top named. */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .resources(P2, { energy: 2, power: { calm: 2 } })
    .legend(P1, PRODIGAL_EXPLORER, "pe")
    .unit(P2, "base", { might: 5, name: "Foe" }, "foe")
    .hand(P1, FRIGID_TOUCH, "ft1")
    .hand(P1, FRIGID_TOUCH, "ft2")
    .hand(P2, DEFY, "defy1")
    .hand(P2, DEFY, "defy2")
    .deck(P1, [FILLER, FILLER, FILLER], ["d1", "d2", "d3"]);
}

/** P1 casts a Frigid Touch choosing the enemy Foe; P2 Defies it; the chain resolves — the Touch is countered. */
async function touchFoeAndGetDefied(game: Game, touch: string, defy: string): Promise<void> {
  await game.p1.cast(touch, { targets: "foe" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: touch, targets: ["foe"] })]); // finalized WITH its enemy target
  await game.p1.passPriority();
  await game.p2.cast(defy, { targets: touch });
  await game.settle();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf(touch)).toBe("trash");
  expect(game.zoneOf(defy)).toBe("trash");
  expect(game.state("foe").might).toBe(5); // countered: no −2, the spell never resolved / was never "played"
}

describe("Ruling e928e677e0981115 — countered spells still count as having CHOSEN enemy units for Prodigal Explorer", () => {
  test("before any choice, and after only ONE (countered) choice, the legend is not usable", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "pe")).toBe(false);
    await touchFoeAndGetDefied(game, "ft1", "defy1");
    expect(game.p1.can("activate", "pe")).toBe(false); // once is not twice
  });

  test("after TWO spells that each chose the enemy Foe — both Defied, Foe untouched at 5 — the legend IS usable in the open state: exhaust it, 'Draw 1' goes on the chain, and P1 draws d1", async () => {
    const game = await board().build();
    await touchFoeAndGetDefied(game, "ft1", "defy1");
    await touchFoeAndGetDefied(game, "ft2", "defy2");
    expect(game.state("foe")).toMatchObject({ might: 5, mightModifier: 0 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // Open State
    expect(game.p1.can("activate", "pe")).toBe(true);
    expect(game.p1.hand()).toEqual([]);
    await game.p1.activate("pe");
    expect(game.state("pe").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pe", controller: P1 })]);
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.violations()).toEqual([]);
  });
});
