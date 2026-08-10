/**
 * Ruling 6c9e71e568fb56c2 — Hidden Blade (OGN-213 → ogn-213-298) · Action · Order · [2][order] · [Hidden]
 *   "Kill a unit at a battlefield. Its controller draws 2."
 *   × Tideturner (OGN-199 → ogn-199-298) · 2 Might · [Hidden] — "When you play me, you may choose a unit you control at
 *     another location. Move me to its location and it to my original location."
 *
 * Q: I Hidden Blade a unit at a battlefield; in response the opponent flips Tideturner from the OTHER battlefield and
 *    swaps it with my target. Does the target still die now that it's at a different battlefield?
 * A: Depends how the Blade was played. From HAND: yes — it only needs "a unit at a battlefield", the target is tracked
 *    to the other battlefield, dies, and its controller draws 2. From HIDDEN: no — a hidden-played spell's target must be
 *    at the battlefield it was hidden at; after the swap it isn't, so the Blade mistargets: no kill, no draw.
 * Rules: 355.7 (target follows the object), 359.3.e (re-check legality on resolution), 811.1.d.2 (hidden-play "here"
 *        restriction), Tideturner may choose across locations even from hidden (card text).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const TIDETURNER = "ogn-199-298";

/**
 * P2's turn (turn 3). P1 controls bf1 (Holder 4). P2 controls bf2 (Guard 1 + Tideturner facedown there) and attacks bf1
 * with Victim (3) from base. P1 has Hidden Blade either in HAND (+ [2][order]) or FACEDOWN at bf1. P2's deck top known.
 */
function board(from: "hand" | "hidden") {
  const s = scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 4, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 1, name: "Guard" }, "guard")
    .facedown(P2, "bf2", TIDETURNER, "tt")
    .unit(P2, "base", { might: 3, name: "Victim" }, "victim")
    .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
  return from === "hand"
    ? s.hand(P1, HIDDEN_BLADE, "blade").resources(P1, { energy: 2, power: { order: 1 } })
    : s.facedown(P1, "bf1", HIDDEN_BLADE, "blade");
}

/**
 * Victim attacks bf1; P2 passes Focus; P1 plays the Blade (from hand or by flipping it) at Victim; P2 responds by
 * flipping Tideturner at bf2 and swapping it with Victim; the swap resolves. Leaves the Blade alone on the chain.
 */
async function bladeThenSwap(from: "hand" | "hidden"): Promise<Game> {
  const game = await board(from).build();
  await game.p2.move("victim", "bf1");
  expect(game.state("victim").combatRole).toBe("attacker");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  if (from === "hand") {
    await game.p1.cast("blade", { targets: "victim" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  } else {
    await game.p1.reveal("blade");
    if (game.decision()?.kind === "pick") {
      // From hidden the choice is among units HERE (bf1): Holder and the attacking Victim.
      const d = game.decision();
      expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["holder", "victim"]);
      await game.p1.pick("victim");
    }
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, targets: ["victim"] })]);
  await game.p1.passPriority();
  // Tideturner (hidden at bf2) may be flipped in response and may choose Victim at bf1 — across locations.
  expect(game.p2.can("reveal", "tt")).toBe(true);
  await game.p2.reveal("tt");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "tt" } });
  await game.p2.yes();
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("victim");
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "tt"]);
  expect(game.chain()[1]).toMatchObject({ controller: P2, targets: ["victim"], triggered: true });
  await game.p2.passPriority();
  await game.p1.passPriority(); // the swap resolves (LIFO)
  expect(game.locationOf("tt")).toBe("bf1");
  expect(game.locationOf("victim")).toBe("bf2"); // no longer at bf1, but still "at a battlefield"
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", targets: ["victim"] })]);
  return game;
}

async function resolveBlade(game: Game): Promise<void> {
  for (let i = 0; i < 4 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("blade")).toBe("trash");
}

describe("Ruling 6c9e71e568fb56c2 — Tideturner swaps the Hidden Blade target to another battlefield: hand-cast Blade still kills, hidden-played Blade mistargets", () => {
  test("the swap itself works either way: Tideturner flipped at bf2 chooses Victim at bf1 (another location) — TT → bf1, Victim → bf2 — with the Blade still pending on Victim", async () => {
    const game = await bladeThenSwap("hand");
    expect(game.zoneOf("victim")).toBe("battlefield-bf2");
    expect(game.p2.hand()).toEqual([]);
  });

  test("Blade played from HAND ('a unit at a battlefield'): it tracks Victim to bf2 and kills it there; its controller P2 draws 2, P1 draws nothing", async () => {
    const game = await bladeThenSwap("hand");
    const p1Hand = game.p1.hand().length;
    await resolveBlade(game);
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.p2.hand()).toEqual(["d1", "d2"]);
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.violations()).toEqual([]);
  });

  // Expected (811.1.d.2): a spell played from facedown keeps the "at the battlefield where it was hidden" requirement on
  // its target through resolution; Victim is now at bf2, so the Blade mistargets — Victim lives, nobody draws.
  // Actual: the engine re-checks only "a unit at a battlefield", so the hidden-played Blade still kills Victim and P2 draws 2.
  test("ruling 6c9e71e568fb56c2 — a hidden-played Hidden Blade mistargets once its target is swapped off the hiding battlefield", async () => {
    const game = await bladeThenSwap("hidden");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // played from hidden for [0]
    await resolveBlade(game);
    expect(game.zoneOf("victim")).toBe("battlefield-bf2"); // survives
    expect(game.p2.hand()).toEqual([]); // no draw
    expect(game.p2.deck()[0]).toBe("d1");
    expect(game.violations()).toEqual([]);
  });
});
