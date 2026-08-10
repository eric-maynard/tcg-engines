/**
 * Ruling 259c1bf5de082380 — Discipline (OGN-058 → ogn-058-298) · Reaction · Calm · [2] · "Give a unit +2 [Might] this
 *     turn. Draw 1."
 *   × Fight or Flight (OGN-168 → ogn-168-298) · Action · Chaos · [2] · "Move a unit from a battlefield to its base."
 *   × Gust (OGN-169) — mentioned only as "even if a unit is removed mid-showdown, the showdown continues".
 *
 * Q: I hold a battlefield; my opponent moves in. Can I Discipline (Reaction), and can they then Fight-or-Flight
 *    (Action) to save their unit and take the point?
 * A: Yes. The attacker gets focus first; if they pass, the defender may start a chain with Discipline. When that
 *    chain closes, focus passes back to the attacker, who may start a NEW chain with an Action (Fight or Flight).
 *    Actions can only start a chain, never join one. The showdown ends only when both pass focus in a row.
 * Rules: 340–341 (focus; Action = start a chain while you hold focus, Reaction = any time), 464.3 (attacker receives
 *        focus first; focus passes after each chain), 465–467 (combat resolution → conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DISCIPLINE = "ogn-058-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

/** P2's turn. P1 holds bf1 with Holder (3) and has Discipline + [2]. P2: Raider (2) in base, Fight or Flight + [2]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P2, FIGHT_OR_FLIGHT, "fof");
}

/** Raider attacks bf1; P2 (attacker) passes focus; P1 Disciplines the Holder and the chain resolves. */
async function attackPassDiscipline(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  await game.p2.passFocus();
  await game.p1.cast("disc", { targets: "holder" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain()).toEqual([]);
  return game;
}

describe("Ruling 259c1bf5de082380 — defender's Discipline, then the attacker regains focus and may Fight-or-Flight at Action speed", () => {
  test("the attacker (P2) receives focus first; only after P2 passes does the defender (P1) hold focus and may play Discipline", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("holder").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.legal()).toEqual([]); // P1 has nothing to do until focus reaches them
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "disc")).toBe(true);
    await game.p1.cast("disc", { targets: "holder" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "disc", controller: P1 })]);
  });

  test("while Discipline's chain is open, P2 may NOT add the Action-speed Fight or Flight to it (Actions only start chains)", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("disc", { targets: "holder" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "fof")).toBe(false);
  });

  test("Discipline resolves (Holder 3 → 5, P1 draws 1); the chain closes and focus passes BACK to the attacker P2 — the showdown is still open", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    const hand = game.p1.hand().length;
    await game.p1.cast("disc", { targets: "holder" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("holder").might).toBe(5);
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("holding focus on an empty chain, P2 casts Fight or Flight (Action) on the Holder → Holder to P1's base; the Raider is left alone, conquers bf1 and P2 scores 1", async () => {
    const game = await attackPassDiscipline();
    expect(game.p2.can("cast", "fof")).toBe(true);
    await game.p2.cast("fof", { targets: "holder" });
    expect(game.p2.energy()).toBe(0);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.state("holder")).toMatchObject({ controller: P1, location: "base" });
    // The showdown does not end by itself: focus moves on (to P1) and both must still pass in succession.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.state("raider").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — if P2 just passes after Discipline, both have passed in succession: combat resolves 2 into 5, the Raider dies and P1 keeps bf1", async () => {
    const game = await attackPassDiscipline();
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("holder")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });
});
