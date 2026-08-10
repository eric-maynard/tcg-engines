/**
 * Ruling 9df4ad2a1c30677c — Lee Sin, Centered (OGN-151 → ogn-151-298) · 6 Might · "Other buffed friendly units at my
 *     battlefield have +2 [Might]."
 *   × Clockwork Keeper (OGN-044 → ogn-044-298) · 2 Might (buffed: 2 + 1 + Lee's 2 = 5)
 *
 * Q: Lee Sin dies to combat damage while buffing a Clockwork Keeper that also took (non-lethal) damage. Does the Keeper
 *    die once it loses Lee's +2?
 * A: No. Combat damage is dealt simultaneously, lethally-damaged units are killed, and all units are healed immediately —
 *    before any further state checks. By the time the Keeper's Might drops (Lee gone), its damage is already cleared.
 *    (Over-assignment is not allowed: lethal to one unit, then the rest to the next.)
 * Rules: 465.2.c (assignment: lethal before moving on), 466 (kill lethal units, then heal all in Combat Cleanup),
 *        statics end when their source leaves the board.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LEE_SIN = "ogn-151-298";
const CLOCKWORK_KEEPER = "ogn-044-298";

/** P2's turn. P1 holds bf1 with Lee Sin (6) and a BUFFED Clockwork Keeper (5 with Lee). P2's 10-Might Brute attacks from base. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", LEE_SIN, "lee")
    .unit(P1, "bf1", CLOCKWORK_KEEPER, "keeper", { buffed: true })
    .unit(P2, "base", { might: 10, name: "Brute" }, "brute");
}

/** Brute attacks; both pass focus; stop at P2's combat-damage assignment. */
async function toAssignment(): Promise<Game> {
  const game = await board().build();
  expect(game.state("lee").might).toBe(6);
  expect(game.state("keeper")).toMatchObject({ isBuffed: true, might: 5 }); // 2 + 1 buff + 2 Lee
  await game.p2.move("brute", "bf1");
  for (let i = 0; i < 6 && game.decision()?.kind === "action"; i++) {
    await game.acting().pass();
  }
  expect(game.decision()).toMatchObject({ kind: "distribute", seat: P2, total: 10 });
  return game;
}

describe("Ruling 9df4ad2a1c30677c — the damaged Keeper survives losing Lee Sin's aura because the combat heal comes first", () => {
  test("assignment: P2 distributes 10 — the offered buckets mark Lee lethal at 6 and the Keeper lethal at 5; P2 puts 6 on Lee (lethal) and the remaining 4 on the Keeper (not lethal at 5)", async () => {
    const game = await toAssignment();
    const d = game.decision();
    expect(d?.kind === "distribute" ? d.buckets.map((b) => [b.card, b.lethal]) : []).toEqual([
      ["lee", 6],
      ["keeper", 5],
    ]);
    await game.p2.distribute({ keeper: 4, lee: 6 });
    // P1's 11 back at the lone Brute is forced.
    await game.settle();
    expect(game.zoneOf("lee")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("trash"); // 6 + 5 = 11 ≥ 10
  });

  test("the Keeper LIVES: it took 4 (< 5), was healed in the Combat Cleanup, and only afterwards dropped to 3 Might (2 + buff) with Lee gone — 0 damage, still at bf1, P1 keeps the battlefield", async () => {
    const game = await toAssignment();
    await game.p2.distribute({ keeper: 4, lee: 6 });
    await game.settle();
    expect(game.zoneOf("keeper")).toBe("battlefield-bf1");
    expect(game.state("keeper")).toMatchObject({ damage: 0, isBuffed: true, might: 3 });
    expect(game.p1.trash()).toEqual(["lee"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("no over-assignment: P2 may not dump 7 on Lee and 3 on the Keeper (more than lethal on one unit while another is short) — rejected", async () => {
    const game = await toAssignment();
    const r = await game.p2.try((p) => p.distribute({ keeper: 3, lee: 7 }));
    expect(r.ok).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P2 });
  });
});
