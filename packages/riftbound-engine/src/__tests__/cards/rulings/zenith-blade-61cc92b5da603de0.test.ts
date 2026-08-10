/**
 * Ruling 61cc92b5da603de0 — Zenith Blade (OGN-262 → ogn-262-298) · Action · [3][rainbow][rainbow]
 *     "Stun an enemy unit at a battlefield. You may move a friendly unit to that enemy unit's battlefield."
 *   × Salvage (OGN-224 → ogn-224-298) — cited only as the pre-errata precedent for "'may' still targets".
 *
 * Q: Does Zenith Blade target a friendly unit?
 * A: Yes. Despite the "you may", the friendly unit is a target chosen as the spell is played — Zenith Blade targets BOTH an enemy
 *    unit and a friendly unit — so it cannot be played at all without a friendly unit on the board (even if you would decline
 *    the move).
 * Rules: 355.4 / 355.10 (targets are declared at play time; "may … a friendly unit" is still a targeting instruction),
 *        355.8 (no legal choice for a required target → the spell can't be played), 423 (Stun).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZENITH_BLADE = "ogn-262-298";

/** P1's turn with [3] + 2 rainbow. P2's Foe (3) at P2's bf1. With `withFriend`, P1's Friend (2) sits in base. */
function board(withFriend: boolean) {
  const s = scenario()
    .resources(P1, { energy: 3, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .hand(P1, ZENITH_BLADE, "zb");
  return withFriend ? s.unit(P1, "base", { might: 2, name: "Friend" }, "friend") : s;
}

const targetField = (game: Game) => game.p1.option("cast", "zb")?.fields.find((f) => f.name === "targets");

describe("Ruling 61cc92b5da603de0 — Zenith Blade targets a friendly unit too; no friendly unit → unplayable", () => {
  test("with a friendly unit: the play requires TWO targets — [enemy at a battlefield, friendly unit] — and naming only the enemy is rejected", async () => {
    const game = await board(true).build();
    expect(game.p1.can("cast", "zb")).toBe(true);
    expect(targetField(game)).toMatchObject({ max: 2, min: 2, options: [["foe", "friend"]], required: true });
    const enemyOnly = await game.p1.try((p) => p.cast("zb", { targets: "foe" }));
    expect(enemyOnly.ok).toBe(false);
    expect(game.zoneOf("zb")).toBe("hand");
    await game.p1.cast("zb", { targets: ["foe", "friend"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "zb", targets: ["foe", "friend"] })]); // both locked in at play time
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  });

  test("the 'may' is only about the MOVE: on resolution the Foe is stunned and P1 may decline moving the (still-targeted) Friend, who stays in base", async () => {
    const game = await board(true).build();
    await game.p1.cast("zb", { targets: ["foe", "friend"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toEqual(["battlefield-bf1"]); // "to that enemy unit's battlefield"
    await game.p1.decline();
    await game.settle();
    expect(game.zoneOf("zb")).toBe("trash");
    expect(game.state("foe").isStunned).toBe(true);
    expect(game.locationOf("friend")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("accepting the move sends the Friend to the Foe's battlefield (a combat opens there against the stunned Foe)", async () => {
    const game = await board(true).build();
    await game.p1.cast("zb", { targets: ["foe", "friend"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.pick("battlefield-bf1");
    expect(game.locationOf("friend")).toBe("bf1");
    expect(game.state("foe").isStunned).toBe(true);
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
  });

  // Expected (ruling): with NO friendly unit on the board Zenith Blade has no legal friendly target and cannot be played at all
  // (355.8) — `can("cast")` is false and an enemy-only cast is rejected. Actual: the engine drops the friendly slot and offers a
  // one-target variant (targets=[["foe"]]), letting the spell be cast to just stun the Foe.
  test("ruling 61cc92b5da603de0 — engine lets Zenith Blade be played with no friendly unit on the board (enemy-only variant offered)", async () => {
    const game = await board(false).build();
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.can("cast", "zb")).toBe(false);
    const r = await game.p1.try((p) => p.cast("zb", { targets: "foe" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("zb")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { rainbow: 2 } });
    expect(game.state("foe").isStunned).toBe(false);
  });
});
