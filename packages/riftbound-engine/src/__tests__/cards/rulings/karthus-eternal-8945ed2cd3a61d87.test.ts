/**
 * Ruling 8945ed2cd3a61d87 — Karthus, Eternal (OGN-236 → ogn-236-298)
 *   3-Might Order champion unit: "Your [Deathknell] effects trigger an additional time."
 *   × Watchful Sentry (ogn-096-298) 1-Might unit: "[Deathknell] — Draw 1."
 *   × The Ruination (unl-180-219) "Kill all units."
 *   × Bullet Time (ogn-268-298) "Pay any amount of [rainbow] to deal that much damage to all enemy units
 *     at a battlefield." (simultaneous lethal damage → cleanup kill)
 *
 * Q: Does Karthus's ability apply if he dies from the same effect as the unit with Deathknell?
 * A: Yes. Deathknell triggers are queued as pending items BEFORE the dying units leave the board, and
 *    Karthus's passive is active while he is on the board — so when one kill (The Ruination) or one
 *    cleanup (lethal damage) takes both, Karthus is still present as the Deathknell triggers, and it
 *    triggers twice.
 * Rules: 808.1.d.2, 365.1, 370.1.a.2, 323.4 / 323.5 (cleanup: queue triggers, then move to trash).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const KARTHUS = "ogn-236-298";
const WATCHFUL_SENTRY = "ogn-096-298";
const THE_RUINATION = "unl-180-219"; // 9 energy + 3 [order]
const BULLET_TIME = "ogn-268-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P2's turn with exactly [9] + 3 order for The Ruination. P1 has Watchful Sentry at bf1 (and Karthus in
 * base when `karthus`); P2 has a grunt so "all units" visibly means everyone.
 */
function ruinationBoard(karthus: boolean) {
  const b = scenario()
    .active(P2)
    .resources(P2, { energy: 9, power: { order: 3 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", WATCHFUL_SENTRY, "sentry")
    .unit(P2, "base", { might: 2, name: "Grunt" }, "grunt")
    .hand(P2, THE_RUINATION, "ruin");
  return karthus ? b.unit(P1, "base", KARTHUS, "karthus") : b;
}

/** P2 casts The Ruination and both players pass so it resolves (Deathknell items may then be pending). */
async function ruinate(game: Game): Promise<void> {
  await game.p2.cast("ruin");
  expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["ruin"]);
  await game.p2.passPriority();
  await game.p1.passPriority();
}

describe("Ruling 8945ed2cd3a61d87 — Karthus dying together with a Deathknell unit still doubles that Deathknell", () => {
  test("control (no Karthus): The Ruination kills everything; Watchful Sentry's Deathknell draws P1 exactly 1", async () => {
    const game = await ruinationBoard(false).build();
    const hand = game.p1.hand().length;
    await ruinate(game);
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand + 1);
  });

  test("The Ruination kills Karthus and the Sentry with ONE kill action, and the Sentry's Deathknell is queued on the chain as they go to the trash (808.1.d.2)", async () => {
    const game = await ruinationBoard(true).build();
    await ruinate(game);
    // Right after The Ruination resolves: both P1 units are in the trash and at least one triggered
    // Sentry item is on the chain (queued before the move to trash).
    expect(game.zoneOf("karthus")).toBe("trash");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("grunt")).toBe("trash");
    const items = game.chain().filter((c) => c.cardId === "sentry" && c.triggered);
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(game.zoneOf("ruin")).toBe("trash");
  });

  // Expected: Karthus is still on the board when the simultaneous kill queues the Sentry's Deathknell, so
  // it triggers an additional time → P1 draws 2 in total.
  // Actual: P1 draws 1 — the engine never applies Karthus's "trigger an additional time" static (it draws
  // 1 even when Karthus survives), so a fortiori not in the simultaneous-death case.
  test("ruling 8945ed2cd3a61d87 — The Ruination kills Karthus + Sentry together: Sentry's Deathknell should trigger twice (P1 draws 2); engine draws 1 (Karthus doubling not applied)", async () => {
    const game = await ruinationBoard(true).build();
    const hand = game.p1.hand().length;
    const deck = game.p1.deck().length;
    await ruinate(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("karthus")).toBe("trash");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand + 2);
    expect(game.p1.deck()).toHaveLength(deck - 2);
  });

  // Cleanup case (323.4 → 323.5): both take lethal damage from one effect and die in the same cleanup;
  // triggers are queued (step 3a) before either is moved to the trash (step 3b) → still doubled.
  // Actual: P1 draws 1 (same missing doubling).
  test("ruling 8945ed2cd3a61d87 — lethal damage to Karthus (3) and Sentry (1) in one cleanup: Deathknell should still trigger twice (P1 draws 2); engine draws 1", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 8, power: { rainbow: 3 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", WATCHFUL_SENTRY, "sentry")
      .unit(P1, "bf1", KARTHUS, "karthus")
      .hand(P2, BULLET_TIME, "bt")
      .build();
    const hand = game.p1.hand().length;
    await game.p2.cast("bt", { targets: "bf1", x: 3 });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("karthus")).toBe("trash");
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand + 2);
  });
});
