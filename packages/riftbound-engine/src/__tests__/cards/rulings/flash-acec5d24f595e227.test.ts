/**
 * Ruling acec5d24f595e227 — Flash (OGS-011 → ogs-011-024) · Reaction [2] · "Move up to 2 friendly units to base."
 *   × Traveling Merchant (OGN-185 → ogn-185-298) · 2 Might · "When I move, discard 1, then draw 1."
 *   × Charm (OGN-043 → ogn-043-298) · [1][calm] · "Move an enemy unit."
 *
 * Q: Can you Flash in response to Traveling Merchant's move trigger, and how do the multiple move triggers resolve?
 * A: Yes. Opponent Charms your Merchant from base to a battlefield → Charm resolves, the Merchant moves and its trigger goes on the
 *    chain → you Flash in response → Flash resolves, moving it again: now TWO move triggers are on the chain and they resolve
 *    one after the other (with an empty hand the first to resolve just draws; the next discards that card and draws). Between
 *    Flash resolving and the triggers, the Merchant is not an attacker.
 * Rules: 331 (LIFO; a new trigger goes on top), 383 (each move is its own trigger event), 337 (Reactions may be played while a
 *        triggered ability is on the chain), 359.3.e (discard with an empty hand does nothing; the draw still happens).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FLASH = "ogs-011-024";
const TRAVELING_MERCHANT = "ogn-185-298";
const CHARM = "ogn-043-298";

/** P1's turn. P1 holds bf1 with a Holder and has Charm + [1][calm]. P2: Merchant in base, Flash + [2] as the only hand card, deck d1 d2 d3. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P2, "base", TRAVELING_MERCHANT, "merchant")
    .hand(P1, CHARM, "charm")
    .hand(P2, FLASH, "flash")
    .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** P1 Charms the Merchant to bf1; both pass; Charm resolves → the Merchant is at bf1 and its move trigger is on the chain. */
async function charmed(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("charm", { targets: "merchant" });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("battlefield-bf1");
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("charm")).toBe("trash");
  expect(game.zoneOf("merchant")).toBe("battlefield-bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P2, triggered: true })]);
  return game;
}

describe("Ruling acec5d24f595e227 — Flash in response to Traveling Merchant's move trigger stacks a second move trigger", () => {
  test("with the Merchant's move trigger on the chain, P2 may cast Flash on it (a Reaction in response to a triggered ability)", async () => {
    const game = await charmed();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "flash")).toBe(true);
    await game.p2.cast("flash", { targets: ["merchant"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["merchant", "flash"]);
    expect(game.p2.energy()).toBe(0);
    expect(game.p2.hand()).toEqual([]);
  });

  test("Flash resolves first: the Merchant is back in P2's base (not an attacker, no showdown), and now TWO Merchant move triggers are on the chain", async () => {
    const game = await charmed();
    await game.p2.cast("flash", { targets: ["merchant"] });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.state("merchant")).toMatchObject({ combatRole: null, zone: "base" });
    expect(game.state("holder").combatRole).toBeNull();
    expect((game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active)).toEqual([]);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "merchant", controller: P2, triggered: true }),
      expect.objectContaining({ cardId: "merchant", controller: P2, triggered: true }),
    ]);
    expect(game.p2.hand()).toEqual([]); // nothing drawn yet
  });

  test("the triggers resolve one at a time: first (empty hand) just draws d1; the second discards d1 and draws d2 — P2 ends with [d2] in hand, flash + d1 in trash", async () => {
    const game = await charmed();
    await game.p2.cast("flash", { targets: ["merchant"] });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Flash
    await game.p2.passPriority();
    await game.p1.passPriority(); // top Merchant trigger: discard (nothing) then draw d1
    expect(game.p2.hand()).toEqual(["d1"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", triggered: true })]);
    // A window exists here (P2 could play d1 if it were a Reaction) before the last trigger resolves.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    await game.p1.passPriority(); // last trigger: discard 1 (d1, forced) then draw d2
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("d1");
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p2.hand()).toEqual(["d2"]);
    expect(game.p2.trash().sort()).toEqual(["d1", "flash"]);
    expect(game.zoneOf("merchant")).toBe("base");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
