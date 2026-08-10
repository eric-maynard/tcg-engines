/**
 * Ruling 56b551c37c880ba0 — Switcheroo (SFD-145 → sfd-145-221) · [Hidden] Action · [2][chaos][chaos]
 *     "Swap the Might of two units at the same battlefield this turn."
 *   × Not So Fast (SFD-045 → sfd-045-221) · Reaction · [2][calm] · "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *   × Cull the Weak (OGN-209 → ogn-209-298) · [2][order] · "Each player kills one of their units."  (the non-targeting contrast;
 *     Cull sfd-134-221 is a name-collision extra in the scrape.)
 *
 * Q: Can Switcheroo be countered by Not So Fast?
 * A: Yes. Switcheroo CHOOSES two units as it is played; if one of them is yours, the enemy Switcheroo "chooses a friendly unit"
 *    and NSF (played while it is still on the chain) counters it — it does nothing, goes to trash, no refund. Unlike Cull the
 *    Weak, which targets nothing and so can never be Not-So-Fasted.
 * Rules: 355 (targets chosen at play), 412.1 / 425.1 (countered: no effect, to trash, cost not refunded), FAQ #2005.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SWITCHEROO = "sfd-145-221";
const NOT_SO_FAST = "sfd-045-221";
const CULL_THE_WEAK = "ogn-209-298";

const nsfTargets = (game: Game) => (game.p1.option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();

/**
 * P2's turn. At P1's bf1: P1's Giant (6) and P2's Runt (1). P2 holds Switcheroo + Cull the Weak with [4] + chaos×2 + order;
 * P1 holds NSF with exactly [2][calm].
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 4, power: { chaos: 2, order: 1 } })
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 6, name: "Giant" }, "giant")
    .unit(P2, "bf1", { might: 1, name: "Runt" }, "runt")
    .hand(P2, SWITCHEROO, "sw")
    .hand(P2, CULL_THE_WEAK, "cull")
    .hand(P1, NOT_SO_FAST, "nsf");
}

describe("Ruling 56b551c37c880ba0 — Switcheroo targets, so Not So Fast can counter it", () => {
  test("1. targeting: Switcheroo names its two units AS IT IS PLAYED — the chain item carries [runt, giant] before anyone responds", async () => {
    const game = await board().build();
    await game.p2.cast("sw", { targets: ["runt", "giant"] });
    expect(game.p2.resources()).toEqual({ energy: 2, power: { chaos: 0, order: 1 } });
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "sw", controller: P2 });
    expect([...(game.chain()[0]?.targets ?? [])].sort()).toEqual(["giant", "runt"]);
    expect(game.state("giant").might).toBe(6); // nothing swapped yet
  });

  test("2–3. while it is on the chain, NSF may choose it (it chose MY Giant); NSF resolves first and counters it: no swap, both spells to trash, P2's [2][chaos][chaos] stays spent", async () => {
    const game = await board().build();
    await game.p2.cast("sw", { targets: ["runt", "giant"] });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(nsfTargets(game)).toEqual(["sw"]);
    await game.p1.cast("nsf", { targets: "sw" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sw", "nsf"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.zoneOf("sw")).toBe("trash");
    expect(game.state("giant")).toMatchObject({ might: 6, mightModifier: 0 });
    expect(game.state("runt")).toMatchObject({ might: 1, mightModifier: 0 });
    expect(game.p2.resources()).toEqual({ energy: 2, power: { chaos: 0, order: 1 } }); // not refunded
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("control: un-countered, the swap happens (Giant 1, Runt 6 this turn)", async () => {
    const game = await board().build();
    await game.p2.cast("sw", { targets: ["runt", "giant"] });
    await game.settle();
    expect(game.state("giant").might).toBe(1);
    expect(game.state("runt").might).toBe(6);
  });

  test("contrast — Cull the Weak chooses nothing when played: with it on the chain NSF has no legal object", async () => {
    const game = await board().build();
    await game.p2.cast("cull", { targets: [] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P2 })]);
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(nsfTargets(game)).toEqual([]);
    expect(game.p1.can("cast", "nsf")).toBe(false);
  });
});
