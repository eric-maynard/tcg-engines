/**
 * Ruling b0706bf15231f5a8 — Defy (OGN-045 → ogn-045-298) · Reaction [1][calm] · "Counter a spell that costs no more than [4] and no more
 *   than [rainbow]."   × Hidden Blade (OGN-213 → ogn-213-298) · Action [2][order] · "[Hidden] Kill a unit at a battlefield. Its controller
 *   draws 2."   × Deadbloom Predator (ogn-161-298) · 8 Might · "[Deflect] …" (our printing: Deflect 1; the ruling quotes 2 — same principle).
 *
 * Q: Can Defy counter a Hidden Blade whose caster had to pay extra power for Deadbloom's Deflect, or does Defy look at printed cost only?
 * A: Printed cost only. The Deflect surcharge (a mandatory additional cost paid on activation) — or the [0] of a play from hidden —
 *    never changes what Defy compares: Hidden Blade ([2] + 1 power printed) is always Defy-able.
 * Rules: 809 (Deflect: additional cost to choose), 356 (additional costs aren't the card's cost), 145 (cost = printed Energy +
 *        Power), 425 (counter), 811.1.c (hidden play ignores cost).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const HIDDEN_BLADE = "ogn-213-298";
const DEADBLOOM_PREDATOR = "ogn-161-298";

describe("Ruling b0706bf15231f5a8 — Defy ignores Deflect surcharges (and hidden discounts): Hidden Blade is counterable", () => {
  test("from hand: P1 pays [2] + 1 order + 1 more power for Deadbloom's Deflect (2 power total — over Defy's [rainbow] if it counted); P2's Defy still targets and counters it — Deadbloom lives, nobody draws, nothing refunded", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 2 } })
      .resources(P2, { energy: 1, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", DEADBLOOM_PREDATOR, "deadbloom")
      .hand(P1, HIDDEN_BLADE, "blade")
      .hand(P2, DEFY, "defy")
      .deck(P2, ["ogn-175-298", "ogn-175-298"], ["e1", "e2"])
      .build();
    await game.p1.cast("blade", { targets: "deadbloom" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // 1 for the [order] pip + 1 for Deflect
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", targets: ["deadbloom"] })]);
    await game.p1.passPriority();
    const targets = game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets");
    expect(targets?.options).toEqual([["blade"]]);
    await game.p2.cast("defy", { targets: "blade" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.state("deadbloom")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.p2.hand()).toEqual([]); // no "its controller draws 2"
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("nuance — no power for the Deflect: Deadbloom simply can't be chosen by Hidden Blade", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", DEADBLOOM_PREDATOR, "deadbloom")
      .hand(P1, HIDDEN_BLADE, "blade")
      .build();
    expect(game.p1.can("cast", "blade")).toBe(false);
    expect((await game.p1.try((p) => p.cast("blade", { targets: "deadbloom" }))).ok).toBe(false);
  });

  test("from hidden (played for [0], only the Deflect power paid) during Deadbloom's attack: Defy still counters it — printed cost is what counts, not the 0 actually paid", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P1, { energy: 0, power: { order: 1 } })
      .resources(P2, { energy: 1, power: { calm: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
      .unit(P2, "base", DEADBLOOM_PREDATOR, "deadbloom")
      .hand(P2, DEFY, "defy")
      .deck(P2, ["ogn-175-298", "ogn-175-298"], ["e1", "e2"])
      .build();
    await game.p2.move("deadbloom", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    expect(game.p1.can("reveal", "blade")).toBe(true);
    await game.p1.reveal("blade");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "blade" } });
    await game.p1.pick("deadbloom");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // [0] for the card, 1 for Deflect
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", targets: ["deadbloom"] })]);
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.cast("defy", { targets: "blade" });
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.state("deadbloom")).toMatchObject({ combatRole: "attacker", damage: 0, zone: "battlefield-bf1" });
    expect(game.p2.hand()).toEqual([]);
    // Combat then goes ahead: 8 vs 2 — the Holder dies and Deadbloom conquers.
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
