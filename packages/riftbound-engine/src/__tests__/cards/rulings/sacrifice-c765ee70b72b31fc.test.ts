/**
 * Ruling c765ee70b72b31fc — Sacrifice (UNL-173 → unl-173-219) · Spell · Order · 1 · Reaction
 *   "As an additional cost to play this, kill a friendly [Mighty] unit. Draw 2 and channel 1 rune exhausted."
 *   × Stupefy (ogn-095-298, Reaction) "Give a unit -1 [Might] this turn, to a minimum of 1. Draw 1." — the
 *     kind of response an opponent might want to aim at the chosen unit.
 *
 * Q: Can my opponent interact before the Mighty unit chosen for the additional cost is killed?
 * A: No. The unit is a COST, not a target (355.10.c); costs are paid in finalization step 4, which
 *    does not pass priority (357.2, 337.1.a) — only the caster's own Reaction-speed Add abilities may be
 *    used there (357.1.a, 429.3). By the time any normal priority window opens the unit is in the trash.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SACRIFICE = "unl-173-219";
const STUPEFY = "ogn-095-298";

/** P1's turn: exactly 1 for Sacrifice; a 6-Might (Mighty) ally and a 2-Might one. P2 holds Stupefy with its cost ready. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 2, power: { rainbow: 1 } })
    .unit(P1, "base", { might: 6, name: "Big Ally" }, "big")
    .unit(P1, "base", { might: 2, name: "Small Ally" }, "small")
    .unit(P2, "base", { might: 5, name: "Enemy Brute" }, "enemyBrute")
    .hand(P1, SACRIFICE, "sac")
    .hand(P2, STUPEFY, "stupefy");
}

/** Cast Sacrifice naming `victim` for the kill cost through whichever parameter the engine exposes for it. */
async function castSacrifice(game: Game, victim: string): Promise<void> {
  const opt = game.p1.option("cast", "sac");
  if (opt?.fields.some((f) => f.arg === "sacrifice" || f.name === "sacrificeId")) {
    await game.p1.cast("sac", { sacrifice: victim });
  } else if (opt?.fields.some((f) => f.name === "targets")) {
    await game.p1.cast("sac", { targets: victim });
  } else {
    await game.p1.cast("sac");
  }
}

describe("Ruling c765ee70b72b31fc — Sacrifice's cost-kill happens inside finalization; no window to respond", () => {
  test("finalization does not pass priority: right after the cast Sacrifice is on the chain, its cost is paid, and P1 — the caster — still holds priority (337.1.a, 357.2)", async () => {
    const game = await board().build();
    await castSacrifice(game, "big");
    expect(game.zoneOf("sac")).toBe("chain");
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sac", controller: P1, triggered: false })]);
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  // Expected (355.10.c, 357.2): choosing Big Ally IS paying the cost — it is killed during finalization, so
  // it is already in the trash before anyone (even P1) gets priority, and it never appears as a target
  // of the chain item. Actual: play-spell ignores `additionalCost.kill`; no unit is asked for or killed.
  test("ruling c765ee70b72b31fc — the chosen Mighty unit is dead (in the trash) the instant Sacrifice hits the chain, before any priority", async () => {
    const game = await board().build();
    const offered = game.p1.option("cast", "sac")?.fields.find((f) => f.arg === "sacrifice" || f.name === "sacrificeId" || f.name === "targets");
    expect(offered?.options ?? []).toEqual(expect.arrayContaining([expect.anything()]));
    await castSacrifice(game, "big");
    expect(game.zoneOf("sac")).toBe("chain");
    expect(game.zoneOf("big")).toBe("trash"); // paid, not pending
    expect(game.locationOf("small")).toBe("base");
    expect(game.actingSeat()).toBe(P1); // still no priority passed to P2
  });

  // Expected: the first moment P2 can act at all is a normal priority window on Sacrifice — by then Big
  // Ally is in the trash, so P2's Stupefy cannot be aimed at it (only the surviving units are offered).
  // Actual: Big Ally is never killed, so it is still on the board and targetable when P2 gets priority.
  test("ruling c765ee70b72b31fc — when P2 first receives priority the unit is already gone: Stupefy cannot target Big Ally", async () => {
    const game = await board().build();
    await castSacrifice(game, "big");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.zoneOf("big")).toBe("trash");
    const stupefyTargets = (game.p2.option("cast", "stupefy")?.fields.find((f) => f.arg === "targets")?.options ?? []).flat();
    expect(stupefyTargets).not.toContain("big");
    expect(stupefyTargets).toEqual(expect.arrayContaining(["small", "enemyBrute"]));
    const r = await game.p2.try((p) => p.cast("stupefy", { targets: "big" }));
    expect(r.ok).toBe(false);
  });

  test("Sacrifice then resolves normally once both pass: P1 draws 2 and channels 1 rune exhausted", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length; // includes sac
    const runesBefore = game.p1.runes().length;
    await castSacrifice(game, "big");
    await game.settle();
    expect(game.zoneOf("sac")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 2);
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
  });
});
