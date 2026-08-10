/**
 * Ruling 7f3f85f45b410106 — Hidden Blade (OGN-213 → ogn-213-298) · [Hidden] Action · [2]+[order] · "Kill a unit at a battlefield. Its
 *     controller draws 2."
 *   × Tideturner (OGN-199 → ogn-199-298) · 2 Might · [Hidden] · "When you play me, you may choose a unit you control at another location.
 *     Move me to its location and it to my original location."
 *
 * Q: My lone unit at battlefield A is targeted by the enemy's Hidden Blade; I flip Tideturner from hidden at battlefield B and swap it
 *    with that unit. What happens?
 * A: Tideturner resolves first and swaps them (it may choose across locations even from hidden). Then Hidden Blade resolves:
 *    – played from HAND: it only needed "a unit at a battlefield"; the target is followed to B and still dies (its controller draws 2);
 *    – played from HIDDEN at A: its target must be at A (811.1.d.2); the unit is now at B → mistarget: it survives, nobody draws.
 * Rules: 811.1.d.2, 359.3.e.9 (mistarget on resolution), 355.7 (targets follow the object), Tideturner exception (FAQ #7907).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const TIDETURNER = "ogn-199-298";

/**
 * P1's turn (turn 3, so cards hidden "earlier" are live). P2 controls bfA (Holder 4); P1 controls bfB (Sentry 1 + Tideturner facedown).
 * P1's Scout (3) attacks bfA from base. P2 has Hidden Blade in HAND (+[2][order]) or FACEDOWN at bfA. P1's deck top is known.
 */
function board(from: "hand" | "hidden") {
  const s = scenario()
    .turn(3)
    .battlefield("bfA", { controller: P2 })
    .battlefield("bfB", { controller: P1 })
    .unit(P2, "bfA", { might: 4, name: "Holder" }, "holder")
    .unit(P1, "bfB", { might: 1, name: "Sentry" }, "sentry")
    .facedown(P1, "bfB", TIDETURNER, "tt")
    .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
  return from === "hand"
    ? s.hand(P2, HIDDEN_BLADE, "blade").resources(P2, { energy: 2, power: { order: 1 } })
    : s.facedown(P2, "bfA", HIDDEN_BLADE, "blade");
}

/** Scout attacks bfA; P1 passes Focus; P2 plays the Blade (hand / flip) at Scout; P1 flips Tideturner at bfB choosing Scout; the swap resolves. */
async function bladeThenTideturner(from: "hand" | "hidden"): Promise<Game> {
  const game = await board(from).build();
  await game.p1.move("scout", "bfA");
  expect(game.state("scout").combatRole).toBe("attacker");
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  if (from === "hand") {
    await game.p2.cast("blade", { targets: "scout" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
  } else {
    expect(game.p2.can("reveal", "blade")).toBe(true);
    await game.p2.reveal("blade");
    if (game.decision()?.kind === "pick") {
      const d = game.decision();
      // From hidden at bfA the choice is restricted to units AT bfA.
      expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["holder", "scout"]);
      await game.p2.pick("scout");
    }
    expect(game.p2.energy()).toBe(0); // for [0]
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P2, targets: ["scout"] })]);
  await game.p2.passPriority();
  // My response: flip Tideturner at bfB; its play trigger may choose Scout at bfA (another location) even from hidden.
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "tt")).toBe(true);
  await game.p1.reveal("tt");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "tt" } });
  await game.p1.yes();
  if (game.decision()?.kind === "pick") {
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("scout");
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "tt"]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Tideturner's swap resolves first (LIFO)
  expect(game.locationOf("tt")).toBe("bfA");
  expect(game.locationOf("scout")).toBe("bfB");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", targets: ["scout"] })]);
  return game;
}

async function resolveBlade(game: Game): Promise<void> {
  for (let i = 0; i < 4 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("blade")).toBe("trash");
}

describe("Ruling 7f3f85f45b410106 — Tideturner dodge vs Hidden Blade depends on where the Blade came from", () => {
  test("steps 2–3: Tideturner flipped at B chooses my Scout at A and they trade places (TT now the attacker at A, Scout safe-for-now at B) while the Blade still waits on the chain", async () => {
    const game = await bladeThenTideturner("hand");
    expect(game.state("tt").combatRole).toBe("attacker");
    expect(game.zoneOf("scout")).toBe("battlefield-bfB");
  });

  test("Blade from HAND: no mistarget — Scout is still 'a unit at a battlefield' at B, dies there, and I (its controller) draw 2", async () => {
    const game = await bladeThenTideturner("hand");
    await resolveBlade(game);
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
    expect(game.p2.hand()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("Blade from HIDDEN at A: its target had to stay at A; Scout is at B → mistarget: Scout survives, nobody draws", async () => {
    const game = await bladeThenTideturner("hidden");
    await resolveBlade(game);
    expect(game.zoneOf("scout")).toBe("battlefield-bfB");
    expect(game.state("scout").damage).toBe(0);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("d1");
    expect(game.p2.hand()).toEqual([]);
    // Combat at A carries on with Tideturner (2) as the attacker into Holder (4): TT dies, P2 keeps A.
    await game.settle();
    expect(game.zoneOf("tt")).toBe("trash");
    expect(game.gameState.battlefields.bfA?.controller).toBe(P2);
    expect(game.zoneOf("scout")).toBe("battlefield-bfB");
    expect(game.violations()).toEqual([]);
  });
});
