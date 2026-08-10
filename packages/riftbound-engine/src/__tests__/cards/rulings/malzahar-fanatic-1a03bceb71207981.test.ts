/**
 * Ruling 1a03bceb71207981 — Malzahar, Fanatic (OGN-113 → ogn-113-298) · Unit · Mind · 4 · 3 Might
 *   "Kill a friendly unit or gear, [Exhaust]: [Action] — [Add] [rainbow][rainbow]."
 *   × Herald of the Arcane (ogn-265-298, legend) "[1], [Exhaust]: Play a 1 [Might] Recruit unit token."  — no speed tag
 *   × Fire Below the Mountain (sfd-189-221, legend) "[Exhaust]: [Reaction] — [Add] [rainbow]. Use only to play gear …"
 *
 * Q: Can activated abilities be used during an opponent's turn, and what timing restrictions apply?
 * A: They follow spell timing. [Reaction] abilities: any reaction window on any turn. [Action] abilities (Malzahar): any
 *    action window, e.g. during a showdown on the opponent's turn while you hold Focus/priority. No tag: only on your own
 *    turn outside of combat/showdowns.
 * Rules: 151.2 (activated abilities use spell timing), 345–347 (Focus in showdowns), 341 (Reaction windows).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MALZAHAR = "ogn-113-298";
const HERALD = "ogn-265-298";
const FIRE_BELOW = "sfd-189-221";

/** P2's turn. P1 holds bf1 with a Guard, has Malzahar + a Trinket gear in base, 1 energy, and the given legend. P2's Raider attacks; P2 also holds a cheap spell. */
function board(legend: string = HERALD) {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "base", MALZAHAR, "malz")
    .gear(P1, { cardType: "gear", energyCost: 1, name: "Trinket" }, "trinket")
    .legend(P1, legend, "legend")
    .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
    .hand(P2, { cardType: "spell", energyCost: 1, name: "Poke", rulesText: "Draw 1.", timing: "action" }, "poke");
}

/** P2's Raider attacks bf1; P2 (attacker) passes Focus so P1 holds Focus in the showdown on P2's turn. */
async function p1HasFocusOnP2sTurn(legend?: string): Promise<Game> {
  const game = await board(legend).build();
  await game.p2.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.turnPlayer()).toBe(P2);
  return game;
}

describe("Ruling 1a03bceb71207981 — activated-ability timing follows the speed tag", () => {
  test("[Action] ability (Malzahar) IS usable during a showdown on the opponent's turn while you hold Focus: kill the Trinket, exhaust Malzahar, add 2 rainbow power", async () => {
    const game = await p1HasFocusOnP2sTurn();
    expect(game.p1.can("activate", "malz")).toBe(true);
    await game.p1.activate("malz", 0, { sacrifice: "trinket" });
    expect(game.zoneOf("trinket")).toBe("trash");
    expect(game.state("malz").isExhausted).toBe(true);
    expect(game.p1.power("rainbow")).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("[Action] ability is NOT usable on the opponent's turn outside a showdown (Neutral Open belongs to the turn player) — P1 has no activate option at all", async () => {
    const game = await board().build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.can("activate", "malz")).toBe(false);
    expect(game.p1.legal().some((o) => o.verb === "activate")).toBe(false);
  });

  test("[Action] ability is NOT usable as a reaction: with P2's spell on the chain and P1 holding priority (Closed state), Malzahar cannot be activated", async () => {
    const game = await board().build();
    await game.p2.cast("poke");
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "malz")).toBe(false);
  });

  test("[Reaction] ability (Fire Below the Mountain) IS usable in that same reaction window on the opponent's turn", async () => {
    const game = await board(FIRE_BELOW).build();
    await game.p2.cast("poke");
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "legend")).toBe(true);
    await game.p1.activate("legend");
    expect(game.state("legend").isExhausted).toBe(true);
  });

  test("no speed tag (Herald of the Arcane) IS usable on your own turn in the open main phase", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).legend(P1, HERALD, "legend").build();
    expect(game.p1.can("activate", "legend")).toBe(true);
    await game.p1.activate("legend");
    await game.settle();
    expect(game.state("legend").isExhausted).toBe(true);
    expect(game.p1.units("base")).toHaveLength(1);
  });

  test("no speed tag (Herald) is NOT usable during a showdown on the opponent's turn, even while holding Focus with the energy to pay", async () => {
    const game = await p1HasFocusOnP2sTurn(HERALD);
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.can("activate", "legend")).toBe(false);
  });

  test("no speed tag is NOT usable as a reaction on the opponent's turn (Closed state)", async () => {
    const game = await board(HERALD).build();
    await game.p2.cast("poke");
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "legend")).toBe(false);
  });
});
