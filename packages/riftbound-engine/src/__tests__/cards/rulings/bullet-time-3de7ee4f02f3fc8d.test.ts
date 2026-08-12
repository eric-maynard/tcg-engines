/**
 * Ruling 3de7ee4f02f3fc8d — Bullet Time (OGN-268 → ogn-268-298)
 *   "[Action] Pay any amount of [rainbow] to deal that much damage to all enemy units at a battlefield."
 *   × Defy (ogn-045-298) "[Reaction] Counter a spell that costs no more than [4] and no more than [rainbow]."
 *
 * Q: Once the opponent has let Bullet Time through and I start paying the Power, can they still react?
 * A: No. The reaction window is while the spell sits on the Chain — and they must decide there without
 *    knowing how much you will pay. Once everyone has passed, the payment and the damage happen inside
 *    the resolution; no priority window exists between paying and dealing damage.
 * Rules: 444.2 (payment inside resolution), 340 (priority only between chain items), 425.1.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BULLET_TIME = "ogn-268-298";
const DEFY = "ogn-045-298";

function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 3 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Small" }, "small")
    .unit(P2, "bf1", { might: 5, name: "Big" }, "big")
    .hand(P1, BULLET_TIME, "bt")
    .hand(P2, DEFY, "defy");
}

describe("Ruling 3de7ee4f02f3fc8d — the reaction window is BEFORE Bullet Time resolves, never after the Power is paid", () => {
  test("while Bullet Time is on the Chain P2 may react — and must do so blind: nothing has been paid yet", async () => {
    const game = await board().build();
    await game.p1.cast("bt", { targets: "bf1" });
    await game.p1.passPriority();

    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "defy")).toBe(true);
    // The amount is not on the Chain item: P2 decides without knowing it.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bt", targets: ["bf1"] })]);
    expect(game.p1.power("rainbow")).toBe(3); // nothing paid yet

    await game.p2.cast("defy", { targets: "bt" });
    await game.settle();
    expect(game.state("small").damage).toBe(0);
    expect(game.state("big").damage).toBe(0);
    expect(game.p1.power("rainbow")).toBe(3); // countered before any Power was spent
    expect(game.violations()).toEqual([]);
  });

  test("once both have passed, the payment prompt belongs to P1 alone — P2 has no decision and cannot Defy", async () => {
    const game = await board().build();
    await game.p1.cast("bt", { targets: "bf1" });
    await game.p1.passPriority();
    await game.p2.passPriority();

    expect(game.decision()).toMatchObject({ kind: "integer", seat: P1, timing: "RES" });
    expect(game.actingSeat()).toBe(P1);
    expect(game.p2.decision()).toBeNull();
    expect(game.p2.legal()).toEqual([]);
    expect(game.p2.can("cast", "defy")).toBe(false);
    const late = await game.p2.try((p) => p.cast("defy", { targets: "bt" }));
    expect(late.ok).toBe(false);
    expect(game.zoneOf("defy")).toBe("hand");
  });

  test("answering the payment deals the damage immediately: no window opens between paying and the damage", async () => {
    const game = await board().build();
    await game.p1.cast("bt", { targets: "bf1" });
    await game.p1.passPriority();
    await game.p2.passPriority();

    await game.p1.answer(3);
    // One answer: paid AND dealt AND the spell has left the Chain — P2 was never asked in between.
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.state("big").damage).toBe(3);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("bt")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("hand"); // still stuck in P2's hand
    expect(game.violations()).toEqual([]);
  });
});
