/**
 * Ruling b31d0e4fdf5aaa07 — Unchecked Power (OGN-123 → ogn-123-298) · Action · 7+[mind][mind] · "Exhaust all friendly units, then deal 12 to
 *     ALL units at battlefields."
 *   × Thrill of the Hunt (UNL-184 → unl-184-219) · Reaction · 2+[fury/body] · "Banish a friendly unit, then its owner plays it to any
 *     battlefield, ignoring its cost."
 *
 * Q: My opponent plays Unchecked Power — can I Thrill of the Hunt my unit to save it?
 * A: You may respond with Thrill (it is a Reaction) and it resolves first (LIFO): your unit is banished and re-played to a
 *    battlefield as a new object. But Unchecked Power then resolves and deals 12 to ALL units at battlefields — the re-played
 *    unit is at a battlefield, so it still takes the 12 and dies. Thrill relocates / re-triggers the unit; it does not dodge.
 * Rules: 336–340 (chain, LIFO), 124 (zone change → new object), 359 (UP affects whatever is at battlefields when it resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UNCHECKED_POWER = "ogn-123-298";
const THRILL = "unl-184-219";

/** P1's turn with 7 + [mind][mind] for Unchecked Power. P2 holds bf1 with X (3, 1 damage) and bf2 with Y (2); P2 has 2 + [fury] and Thrill. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { mind: 2 } })
    .resources(P2, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Target X" }, "X", { damage: 1 })
    .unit(P2, "bf2", { might: 2, name: "Ally Y" }, "Y")
    .unit(P1, "base", { might: 2, name: "Home Guard" }, "home")
    .hand(P1, UNCHECKED_POWER, "up")
    .hand(P2, THRILL, "thrill");
}

/** P1 casts Unchecked Power; P2 responds with Thrill on X and re-plays it to bf2. Returns with the chain [up, thrill] resolved down to [up]. */
async function upThenThrill(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("up");
  expect(game.chain().map((c) => c.cardId)).toEqual(["up"]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "thrill")).toBe(true); // Reaction: legal in response
  await game.p2.cast("thrill", { targets: "X" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["up", "thrill"]);
  // Both pass → Thrill (top) resolves: banish X, then P2 (owner) plays it to a battlefield of their choice.
  await game.p2.passPriority();
  await game.p1.passPriority();
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P2) {
      const keys = d.options.map((o) => o.key);
      const bf2 = keys.find((k) => k.includes("bf2")) ?? keys[0]!;
      await game.p2.pick(bf2);
    } else {
      break;
    }
  }
  return game;
}

describe("Ruling b31d0e4fdf5aaa07 — Thrill of the Hunt in response to Unchecked Power relocates the unit but does not save it", () => {
  test("Thrill resolves first (LIFO): X left bf1 and was re-played to bf2 as a NEW object (damage cleared) while Unchecked Power still waits on the chain", async () => {
    const game = await upThenThrill();
    expect(game.zoneOf("thrill")).toBe("trash");
    expect(game.zoneOf("X")).toBe("battlefield-bf2");
    expect(game.state("X")).toMatchObject({ controller: P2, damage: 0 });
    expect(game.chain().map((c) => c.cardId)).toContain("up");
    expect(game.chain().find((c) => c.cardId === "up")).toMatchObject({ controller: P1 });
  });

  test("Unchecked Power then resolves: P1's units are exhausted and 12 is dealt to ALL units at battlefields — the re-played X (now at bf2) and Y both die; P1's unit in base is untouched", async () => {
    const game = await upThenThrill();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("up")).toBe("trash");
    expect(game.zoneOf("X")).toBe("trash"); // not saved
    expect(game.zoneOf("Y")).toBe("trash");
    expect(game.zoneOf("home")).toBe("base");
    expect(game.state("home")).toMatchObject({ damage: 0, isExhausted: true }); // "Exhaust all friendly units"
    expect(game.violations()).toEqual([]);
  });

  test("control: without the Thrill response X simply dies where it stood (bf1) along with Y", async () => {
    const game = await board().build();
    await game.p1.cast("up");
    await game.settle();
    expect(game.zoneOf("X")).toBe("trash");
    expect(game.zoneOf("Y")).toBe("trash");
    expect(game.p2.hand()).toContain("thrill");
  });
});
