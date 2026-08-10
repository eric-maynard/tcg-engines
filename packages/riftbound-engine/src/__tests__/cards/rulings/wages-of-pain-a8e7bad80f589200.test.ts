/**
 * Ruling a8e7bad80f589200 — Wages of Pain (SFD-070 → sfd-070-221) · [Action] · [3] · "Deal 3 to a unit at a battlefield. Play a Gold
 *     gear token exhausted."
 *   × Prodigal Explorer (SFD-199 → sfd-199-221, Ezreal legend) "[Exhaust]: [Reaction] — Draw 1. Use only if you've chosen enemy units
 *     and/or gear twice this turn with spells or unit abilities."
 *   × Defy (OGN-045 → ogn-045-298) · Reaction · [1][calm] · "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *
 * Q: If Wages of Pain was played twice and BOTH were Defied, can the Ezreal legend still be exhausted?
 * A: Yes. The enemy unit is chosen when the spell is played and put on the chain; that satisfies the legend's condition even
 *    though the spell is later countered and never resolves.
 * Rules: 355.5 (choices made when the spell is finalized), 425 (countered: no effect), 377.2.b ("Use only if" restriction).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WAGES_OF_PAIN = "sfd-070-221";
const PRODIGAL_EXPLORER = "sfd-199-221";
const DEFY = "ogn-045-298";

/** P1 (Ezreal): two Wages in hand, exactly [6]; known deck. P2: Victim (5) at P2's bf1, two Defies with exactly [2] + calm×2. */
function board() {
  return scenario()
    .legend(P1, PRODIGAL_EXPLORER, "ezreal")
    .resources(P1, { energy: 6 })
    .resources(P2, { energy: 2, power: { calm: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Victim" }, "victim")
    .hand(P1, WAGES_OF_PAIN, "wop1")
    .hand(P1, WAGES_OF_PAIN, "wop2")
    .hand(P2, DEFY, "defy1")
    .hand(P2, DEFY, "defy2")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

const golds = (game: Game) => game.p1.gear().filter((id) => game.state(id).isToken);

/** P1 plays a Wages at the Victim; P2 answers with a Defy; everything resolves. */
async function wagesDefied(game: Game, wop: string, defy: string): Promise<void> {
  await game.p1.cast(wop, { targets: "victim" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: wop, controller: P1, targets: ["victim"] })]); // the choice is made NOW
  await game.p1.passPriority();
  await game.p2.cast(defy, { targets: wop });
  await game.settle();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf(wop)).toBe("trash");
  expect(game.zoneOf(defy)).toBe("trash");
}

describe("Ruling a8e7bad80f589200 — two Defied Wages of Pain still satisfy Prodigal Explorer's 'chosen enemy units twice'", () => {
  test("before any spell the legend is not usable; after ONE (countered) Wages it is still one choice short", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "ezreal")).toBe(false);
    await wagesDefied(game, "wop1", "defy1");
    expect(game.state("victim").damage).toBe(0); // countered: no damage …
    expect(golds(game)).toEqual([]); // … and no Gold
    expect(game.p1.can("activate", "ezreal")).toBe(false);
  });

  test("after the SECOND Wages is also Defied — no damage, no Gold, neither spell resolved — the legend IS usable: exhaust it, Draw 1", async () => {
    const game = await board().build();
    await wagesDefied(game, "wop1", "defy1");
    await wagesDefied(game, "wop2", "defy2");
    expect(game.state("victim")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(golds(game)).toEqual([]);
    expect(game.p1.energy()).toBe(0);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.can("activate", "ezreal")).toBe(true);
    await game.p1.activate("ezreal");
    expect(game.state("ezreal").isExhausted).toBe(true);
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
