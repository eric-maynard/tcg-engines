/**
 * Ruling f5514802707e0e74 — Bullet Time (OGN-268 → ogn-268-298) · [Action] · Body/Chaos · [1]
 *     "Pay any amount of [rainbow] to deal that much damage to all enemy units at a battlefield."
 *   × Retreat (OGN-104 → ogn-104-298) · [Reaction] · Mind · [1] "Return a friendly unit to its owner's hand. Its owner
 *     channels 1 rune exhausted."
 *
 * Q: When do I pay Bullet Time's power — can my opponent react before I pay?
 * A: Casting pays only the base [1] and puts it on the chain; the opponent then gets priority and may play Reactions
 *    (e.g. Retreat) WITHOUT knowing the amount. Only when Bullet Time resolves do you choose and pay the [rainbow], and
 *    the damage is dealt immediately — no reaction window after the payment. Countered ⇒ no power is ever paid.
 * Rules: 204.3.b (amount chosen/paid on resolution), 332/336 (priority & Reactions on a chain), 340 (LIFO), 346.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BULLET_TIME = "ogn-268-298";
const RETREAT = "ogn-104-298";

/** P1: exactly [1] + 2 floating rainbow, Bullet Time in hand. P2 holds bf1 with Grunt A (2) + Grunt B (2), Retreat in hand + [1]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { rainbow: 2 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Grunt A" }, "ga")
    .unit(P2, "bf1", { might: 2, name: "Grunt B" }, "gb")
    .hand(P1, BULLET_TIME, "bt")
    .hand(P2, RETREAT, "retreat");
}

async function castBulletTime(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("bt", { targets: "bf1" });
  return game;
}

describe("Ruling f5514802707e0e74 — Bullet Time's power is paid on resolution; the opponent reacts first, blind", () => {
  test("1. Cast: only the base [1] energy is paid, the battlefield is chosen, Bullet Time is on the chain — no amount asked, power untouched", async () => {
    const game = await board().build();
    expect((game.p1.option("cast", "bt")?.fields ?? []).map((f) => f.arg)).toEqual(["targets"]); // no amount at play time
    await game.p1.cast("bt", { targets: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 2 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bt", controller: P1, targets: ["bf1"] })]);
    expect(game.decision()?.kind).toBe("action"); // a priority window, not a payment
  });

  test("2. Reaction window: after P1 passes, P2 holds priority with Bullet Time unresolved (still no amount chosen) and may cast Retreat on Grunt A", async () => {
    const game = await castBulletTime();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p1.power("rainbow")).toBe(2); // nothing paid yet — P2 decides blind
    expect(game.p2.can("cast", "retreat")).toBe(true);
    await game.p2.cast("retreat", { targets: "ga" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["bt", "retreat"]);
  });

  test("3. Retreat resolves first (Grunt A → P2's hand, P2 channels 1 rune exhausted); THEN Bullet Time resolves and only now asks P1 how much [rainbow] to pay", async () => {
    const game = await castBulletTime();
    await game.p1.passPriority();
    await game.p2.cast("retreat", { targets: "ga" });
    const runesBefore = game.p2.runes().length;
    await game.p2.passPriority();
    await game.p1.passPriority(); // Retreat resolves
    expect(game.zoneOf("ga")).toBe("hand");
    expect(game.p2.runes()).toHaveLength(runesBefore + 1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["bt"]);
    // both pass on Bullet Time → it resolves → the payment question
    for (let i = 0; i < 3 && game.decision()?.kind === "action"; i++) {
      await game.acting().passPriority();
    }
    expect(game.decision()).toMatchObject({ kind: "integer", seat: P1, source: { cardId: "bt" }, unit: "rainbow" });
    expect(game.p1.power("rainbow")).toBe(2); // still unpaid until answered
  });

  test("paying 2 on resolution: the damage lands IMMEDIATELY (no window for P2 in between) — Grunt B (2) dies; the retreated Grunt A is safe in hand", async () => {
    const game = await castBulletTime();
    await game.p1.passPriority();
    await game.p2.cast("retreat", { targets: "ga" });
    for (let i = 0; i < 6 && game.decision()?.kind === "action"; i++) {
      await game.acting().passPriority();
    }
    expect(game.decision()).toMatchObject({ kind: "integer", seat: P1 });
    await game.p1.chooseX(2);
    // No P2 priority between payment and damage: Bullet Time is already done.
    expect(game.chain().some((c) => c.cardId === "bt")).toBe(false);
    expect(game.zoneOf("bt")).toBe("trash");
    expect(game.p1.power("rainbow")).toBe(0);
    await game.settle();
    expect(game.zoneOf("gb")).toBe("trash");
    expect(game.zoneOf("ga")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });
});
