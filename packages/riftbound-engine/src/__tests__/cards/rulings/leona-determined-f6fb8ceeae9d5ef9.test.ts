/**
 * Ruling f6fb8ceeae9d5ef9 — Leona, Determined (OGN-238 → ogn-238-298) · Order · [4] · 4 Might · "[Shield] When I attack, stun an
 *     enemy unit here."
 *   × Fight or Flight (OGN-168 → ogn-168-298) · Chaos · [2] · [Hidden] [Action] · "Move a unit from a battlefield to its base."
 *
 * Q: Leona attacks and her stun trigger goes on the chain; before it resolves the opponent Fight-or-Flights Leona back to base.
 *    Is the defender still stunned?
 * A: No. "Here" is wherever Leona is when the ability resolves. With Leona in base, the chosen enemy unit is no longer "here",
 *    the instruction has no legal target and does nothing.
 * Rules: 359.3.e.5 (targets re-checked on resolution; illegal → not affected), first-person "here" = the source's current
 *        location, 811 (a hidden card is played at Reaction speed with priority).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LEONA = "ogn-238-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

/**
 * Turn 3, P1's turn. P2 holds bf1 with a Guard (3) and hid Fight or Flight there on an earlier turn. Leona ready in P1's base.
 */
function board() {
  return scenario()
    .turn(3)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
    .unit(P1, "base", LEONA, "leona");
}

/** Leona attacks bf1: her trigger is finalized on the Guard (the only enemy unit here); P1 passes → P2 has priority. */
async function leonaAttacks(game: Game): Promise<void> {
  await game.p1.move("leona", "bf1");
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("guard");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "leona", controller: P1, targets: ["guard"], triggered: true })]);
  expect(game.state("leona").combatRole).toBe("attacker");
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

describe("Ruling f6fb8ceeae9d5ef9 — Fight or Flight on the attacking Leona makes her 'stun an enemy unit HERE' miss", () => {
  test("control: unanswered, Leona's trigger resolves with her at bf1 and the Guard IS stunned", async () => {
    const game = await board().build();
    await leonaAttacks(game);
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("guard").isStunned).toBe(true);
    expect(game.locationOf("leona")).toBe("bf1");
  });

  test("P2 (priority) flips the hidden Fight or Flight at bf1 onto Leona: it goes on the chain above her trigger and resolves first — Leona is back in P1's base while her trigger still waits", async () => {
    const game = await board().build();
    await leonaAttacks(game);
    expect(game.p2.can("reveal", "fof")).toBe(true);
    await game.p2.reveal("fof");
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("leona");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["leona", "fof"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Fight or Flight resolves
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.locationOf("leona")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["leona"]); // her trigger is still pending resolution
    expect(game.state("guard").isStunned).toBe(false);
  });

  test("Leona's trigger then resolves with 'here' = P1's base: the Guard (at bf1) is not a legal object any more → nobody is stunned; P2 keeps bf1", async () => {
    const game = await board().build();
    await leonaAttacks(game);
    await game.p2.reveal("fof");
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("leona");
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("guard")).toMatchObject({ isStunned: false, zone: "battlefield-bf1" });
    expect(game.state("leona")).toMatchObject({ isStunned: false, location: "base" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
