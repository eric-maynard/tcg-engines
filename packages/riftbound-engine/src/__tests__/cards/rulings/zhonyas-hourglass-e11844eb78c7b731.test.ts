/**
 * Ruling e11844eb78c7b731 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · 2
 *   "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: Played from hidden, does Zhonya's only protect units at the battlefield where it was hidden?
 * A: No. After it is played it is recalled to base during Cleanup (gear can't exist at battlefields) and then works
 *    normally from base: it replaces the next friendly death ANYWHERE. Zhonya's does not target, so the from-hidden
 *    "targets must be here" restriction never applies to it.
 * Rules: 811.1.d (from-hidden targeting restriction — only for choices), 145/457.1 (gear recalled to base),
 *        366–373 (replacement effects are not targeted).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const BOLT = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
} as const;

/** P2's turn. P1: Guard (3) at bf1 with Zhonya's facedown there; Ranger (2) at bf2; Squire (1) in base. P2: two Bolts. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "bf2", { might: 2, name: "Ranger" }, "ranger")
    .unit(P1, "base", { might: 1, name: "Squire" }, "squire")
    .facedown(P1, "bf1", ZHONYAS, "zhonya")
    .hand(P2, BOLT, "bolt1")
    .hand(P2, BOLT, "bolt2");
}

describe("Ruling e11844eb78c7b731 — a Zhonya's played from hidden at bf1 protects the next friendly death anywhere", () => {
  test("P2 Bolts the Ranger at bf2 (NOT where Zhonya's is hidden); P1 flips Zhonya's at bf1 in response → it lands in base and replaces the Ranger's death at bf2", async () => {
    const game = await board().build();
    await game.p2.cast("bolt1", { targets: "ranger" });
    await game.p2.passPriority();
    expect(game.p1.can("reveal", "zhonya")).toBe(true);
    await game.p1.reveal("zhonya");
    // The reveal asks for no target at all — Zhonya's does not target (nothing bound to bf1).
    expect(game.decision()?.kind).toBe("action");
    await game.settle();
    expect(game.zoneOf("bolt1")).toBe("trash");
    expect(game.zoneOf("zhonya")).toBe("trash"); // killed instead of the Ranger
    expect(game.zoneOf("ranger")).toBe("base");
    expect(game.state("ranger")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.locationOf("guard")).toBe("bf1");
  });

  test("flipped with nothing dying, it simply sits in P1's base (a Cleanup recalls gear from the battlefield); a LATER Bolt on the Squire in base is then replaced from there", async () => {
    const game = await board().build();
    await game.p2.cast("bolt1", { targets: "guard" }); // 6 to the 3-Might Guard — but first let P1 flip in response…
    await game.p2.passPriority();
    await game.p1.reveal("zhonya");
    await game.settle();
    // Guard's death was the next friendly death: replaced.
    expect(game.zoneOf("zhonya")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("base");
    // Second case on a fresh board: flip first (in response to a Bolt at the base Squire).
    const g2 = await board().build();
    await g2.p2.cast("bolt2", { targets: "squire" });
    await g2.p2.passPriority();
    await g2.p1.reveal("zhonya");
    for (let i = 0; i < 4 && g2.chain().some((c) => c.cardId === "zhonya"); i++) {
      await g2.acting().passPriority();
    }
    expect(g2.zoneOf("zhonya")).toBe("base"); // already home before Bolt resolves
    await g2.settle();
    expect(g2.zoneOf("zhonya")).toBe("trash");
    expect(g2.zoneOf("squire")).toBe("base");
    expect(g2.state("squire")).toMatchObject({ damage: 0, isExhausted: true });
    expect(g2.violations()).toEqual([]);
  });
});
