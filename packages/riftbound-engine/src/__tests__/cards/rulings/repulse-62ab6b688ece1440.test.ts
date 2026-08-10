/**
 * Ruling 62ab6b688ece1440 — Repulse (UNL-106 → unl-106-219) · Reaction · [1][body]
 *     "Choose a friendly unit at a battlefield. Counter an enemy spell or ability that chooses it and no other friendly unit."
 *   × Bellows Breath (SFD-080 → sfd-080-221) · Action · [1][mind] · [Repeat][1][mind] "Deal 1 to up to three units at the same location."
 *
 * Q: Bellows Breath chooses 3 units in base and is Repeated to choose 1 unit at battlefield A. Can the opponent Repulse it — all of it,
 *    or one of the repeats?
 * A: Neither. A Repeated spell is played ONCE with all targets of both executions chosen together at finalization; this instance
 *    chooses four (friendly-to-the-Repulse-player) units, so it fails Repulse's "chooses it and no other friendly unit" — Repulse
 *    is not a legal play against it.
 * Rules: 820.3.a (Repeat: one spell, effect executed again; all choices made when finalized), 355.9.b / 359.3.e.9.a (Repulse's
 *        exclusivity condition), 355.8 (no legal object → can't play).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REPULSE = "unl-106-219";
const BELLOWS_BREATH = "sfd-080-221";

/**
 * P1's turn with [2] + mind×2 (Bellows + its Repeat). P2 controls bfA with a Sentinel (3) and has B1/B2/B3 (2 each) in base;
 * P2 holds Repulse with [1][body].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 2 } })
    .resources(P2, { energy: 1, power: { body: 1 } })
    .battlefield("bfA", { controller: P2 })
    .unit(P2, "bfA", { might: 3, name: "Sentinel" }, "sentinel")
    .unit(P2, "base", { might: 2, name: "B1" }, "b1")
    .unit(P2, "base", { might: 2, name: "B2" }, "b2")
    .unit(P2, "base", { might: 2, name: "B3" }, "b3")
    .hand(P1, BELLOWS_BREATH, "bellows")
    .hand(P2, REPULSE, "repulse");
}

/** P1 plays Bellows Breath with Repeat paid: execution 1 → B1, B2, B3 (P2's base); execution 2 → Sentinel (bfA). P1 passes priority. */
async function repeatedBellows(): Promise<Game> {
  const game = await board().build();
  // The 3+1 target line is passed straight to the engine (the harness menu samples fewer combinations).
  await game.p1.do("playSpell", { cardId: "bellows", repeatCount: 1, targets: ["b1", "b2", "b3", "sentinel"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // [1][mind] + Repeat [1][mind]
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 62ab6b688ece1440 — a Repeated Bellows Breath choosing 3 + 1 units is ONE spell with four targets: Repulse can't touch it", () => {
  test("the Repeat does not make two spells: exactly ONE Bellows Breath item is on the chain, finalized with all four targets at once", async () => {
    const game = await repeatedBellows();
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "bellows", controller: P1 });
    expect([...(game.chain()[0]?.targets ?? [])].sort()).toEqual(["b1", "b2", "b3", "sentinel"]);
  });

  test("with priority, P2 can NOT play Repulse: the enemy spell chooses the Sentinel AND three other friendly units, so no legal Repulse object exists; forcing it fails and nothing is spent", async () => {
    const game = await repeatedBellows();
    expect(game.p2.can("cast", "repulse")).toBe(false);
    const forced = await game.p2.try((p) => p.cast("repulse", { targets: "bellows" }));
    expect(forced.ok).toBe(false);
    expect(game.zoneOf("repulse")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 1, power: { body: 1 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["bellows"]);
  });

  // Expected: execution 1 deals 1 to B1/B2/B3 (P2's base), execution 2 deals 1 to the Sentinel (bfA) — every unit ends on exactly
  // 1 damage. Actual: the engine's first execution already hits ALL FOUR declared targets (two different locations), then asks
  // which original targets the repeat affects; answering "the Sentinel" (the ruling's second execution) leaves it on 2 damage.
  test("ruling 62ab6b688ece1440 — engine applies the first Bellows execution to all four targets across both locations (Sentinel ends on 2)", async () => {
    const game = await repeatedBellows();
    await game.p2.passPriority();
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("sentinel"); // the repeat execution: the one unit at battlefield A
      } else if (d?.kind === "action" && d.context !== "main") {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.zoneOf("bellows")).toBe("trash");
    for (const u of ["b1", "b2", "b3", "sentinel"]) {
      expect(game.zoneOf(u)).not.toBe("trash");
      expect(game.state(u).damage).toBe(1);
    }
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: an UN-repeated Bellows Breath choosing only the Sentinel (one friendly unit at a battlefield, no other) IS a legal Repulse object — Repulse counters it and the Sentinel takes nothing", async () => {
    const game = await board().build();
    await game.p1.cast("bellows", { targets: ["sentinel"] });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1 } });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "repulse")).toBe(true);
    await game.p2.cast("repulse", { answers: ["sentinel", "bellows"], targets: "bellows" });
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P2) {
        await game.p2.answer({ keys: [d.options[0]!.key], kind: "pick" });
      } else {
        break;
      }
    }
    expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("repulse")).toBe("trash");
    expect(game.zoneOf("bellows")).toBe("trash");
    expect(game.state("sentinel")).toMatchObject({ damage: 0, zone: "battlefield-bfA" });
  });
});
