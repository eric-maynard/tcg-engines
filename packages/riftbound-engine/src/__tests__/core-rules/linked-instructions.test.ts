/**
 * Core rules — LINKED INSTRUCTIONS (359.3.e.14) — the whole "kill/damage + rider" family, one rule.
 *
 * A card whose later instruction refers back to an earlier one ("Kill a unit at a battlefield. ITS CONTROLLER
 * draws 2") has LINKED instructions (359.3.e.14; the CR names Hidden Blade as its own example). Two rules decide
 * whether the rider runs, and the discriminator is "was the earlier instruction EXECUTED against a still-legal
 * target?" — never "did the unit survive?":
 *
 *   | branch | rule | object-referencing rider ("its controller") | action-referencing rider ("if you do") |
 *   | earlier instruction IGNORED (target bounced / banished / moved off the battlefield — no legal target left
 *     at resolution)                     | 359.3.e.14.a | ignored | ignored |
 *   | earlier instruction EXECUTED but its GAME ACTION was REPLACED (Zhonya's Hourglass, Guardian Angel, The
 *     Boss, any 371/390.3 replacement)   | 359.3.e.14.b | STILL RUNS | ignored |
 *   | earlier instruction executed, action merely MODIFIED (some damage prevented, unit entered elsewhere)
 *                                        | 359.3.e.14.c | runs | runs |
 *
 * An instruction that names no referent back to the earlier one is NOT linked and always runs (Void Seeker's
 * "Draw 1", Deathgrip's trailing "Draw 1").
 *
 * PRODUCT-OWNER ADJUDICATION 2026-08-13 (DESIGN.md § "Community rulings vs the CR"): "you still draw if the
 * death is replaced but not if the unit is like bounced" — the same line the CR draws, and the same line the
 * judge corpus draws (719c8ada539c1401, 1fc045432af63a65, 011d554b0b6c1783 for the replacement branch;
 * 049e79488aa69e06, 29e7c9678c51dfdc, 0642074d3ef03805, 3d4951350a95725f for the mistarget branch). An earlier
 * pass recorded the replacement branch as "no kill ⇒ no draw" (CONFLICTS-ADJUDICATED-2026-08-12.md item
 * 99cac87aa3a4); that reading cited 359.3.e.5 without 359.3.e.14.b and is superseded. Do not flip it back.
 *
 * This file pins the rule for the FAMILY, not for one card: every card whose text is "<kill/damage a thing> +
 * <rider bound to it>" must answer these questions the same way. Card-level facets live in
 * `cards/ogn-213-298.test.ts` (Hidden Blade), `cards/sfd-005-221.test.ts` (Detonate),
 * `cards/rulings/deathgrip-1dad7f3532488bcd.test.ts` (Deathgrip × Guardian Angel) and the
 * `cards/rulings/hidden-blade-*` suite.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const HIDDEN_BLADE = "ogn-213-298"; // "Kill a unit at a battlefield. Its controller draws 2."  → object rider
const DETONATE = "sfd-005-221"; //    "Kill a gear. Its controller draws 2."                    → object rider
const DISINTEGRATE = "ogn-005-298"; //"Deal 3 to a unit … If this kills it, do this: draw 1."   → action rider
const ZHONYA = "ogn-077-298"; //      "If a friendly unit would die, kill this instead. …"      → die replacement
const FLASH = "ogs-011-024"; //       "Move up to 2 friendly units to base."                    → takes the target away

/** Gear-scoped Zhonya's: the die replacement Detonate needs, since printed replacements only guard units. */
const GEAR_WARDEN = {
  abilities: [
    {
      replacement: { effects: [{ target: "self", type: "kill" }], type: "sequence" },
      replaces: "die",
      target: { controller: "friendly", type: "gear" },
      type: "replacement",
    },
  ],
  cardType: "gear",
  name: "Gear Warden",
} as const;

/** 0-cost Reaction that takes the Detonate target off the board (the gear equivalent of Flash). */
const RECLAIM = {
  abilities: [
    {
      effect: { target: { controller: "friendly", type: "gear" }, type: "return-to-hand" },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Reclaim",
  timing: "reaction",
} as const;

describe("359.3.e.14 — linked instructions: the rider follows the ATTEMPT, not the survival", () => {
  describe("object-referencing rider — Hidden Blade's 'Its controller draws 2'", () => {
    const board = (opts: { flash?: boolean; zhonya?: boolean } = {}) => {
      let s = scenario()
        .resources(P1, { energy: 2, power: { order: 1 } })
        .resources(P2, { energy: 2 })
        .battlefield("bf1", { controller: P2 })
        .unit(P2, "bf1", { might: 3, name: "Runner" }, "runner")
        .hand(P1, HIDDEN_BLADE, "blade");
      if (opts.zhonya === true) {
        s = s.gear(P2, ZHONYA, "zh");
      }
      if (opts.flash === true) {
        s = s.hand(P2, FLASH, "flash");
      }
      return s;
    };

    test("plain kill: the unit dies and ITS controller draws 2", async () => {
      const game = await board().build();
      const deck = game.p2.deck().length;
      await game.p1.cast("blade", { targets: "runner" });
      await game.settle();
      expect(game.zoneOf("runner")).toBe("trash");
      expect(game.p2.deck()).toHaveLength(deck - 2);
    });

    test("359.3.e.14.b — the death is REPLACED (Zhonya's): the unit lives in base and its controller STILL draws 2", async () => {
      const game = await board({ zhonya: true }).build();
      const deck = game.p2.deck().length;
      await game.p1.cast("blade", { targets: "runner" });
      await game.settle();
      expect(game.zoneOf("zh")).toBe("trash");
      expect(game.zoneOf("runner")).toBe("base");
      expect(game.p2.deck()).toHaveLength(deck - 2);
      expect(game.violations()).toEqual([]);
    });

    test("359.3.e.14.a — the target is GONE (Flash to base): nothing is killed and nobody draws", async () => {
      const game = await board({ flash: true }).build();
      const deck = game.p2.deck().length;
      await game.p1.cast("blade", { targets: "runner" });
      await game.p1.passPriority();
      await game.p2.cast("flash", { targets: "runner" });
      await game.settle();
      expect(game.zoneOf("runner")).toBe("base");
      expect(game.p2.deck()).toHaveLength(deck);
      expect(game.violations()).toEqual([]);
    });
  });

  describe("the same rule off a different card — Detonate's 'Kill a gear. Its controller draws 2'", () => {
    const board = (opts: { reclaim?: boolean; warden?: boolean } = {}) => {
      let s = scenario()
        .resources(P1, { energy: 1, power: { fury: 1 } })
        .resources(P2, { energy: 1 })
        .gear(P2, { cardType: "gear", name: "Trinket" }, "trinket")
        .hand(P1, DETONATE, "det");
      if (opts.warden === true) {
        s = s.gear(P2, GEAR_WARDEN, "warden");
      }
      if (opts.reclaim === true) {
        s = s.hand(P2, RECLAIM, "reclaim");
      }
      return s;
    };

    test("plain kill: the gear dies and ITS controller draws 2", async () => {
      const game = await board().build();
      const deck = game.p2.deck().length;
      await game.p1.cast("det", { targets: "trinket" });
      await game.settle();
      expect(game.zoneOf("trinket")).toBe("trash");
      expect(game.p2.deck()).toHaveLength(deck - 2);
    });

    test("359.3.e.14.b — the gear's death is REPLACED: the Trinket survives and its controller STILL draws 2", async () => {
      const game = await board({ warden: true }).build();
      const deck = game.p2.deck().length;
      await game.p1.cast("det", { targets: "trinket" });
      await game.settle();
      expect(game.zoneOf("warden")).toBe("trash");
      expect(game.zoneOf("trinket")).not.toBe("trash");
      expect(game.p2.deck()).toHaveLength(deck - 2);
      expect(game.violations()).toEqual([]);
    });

    test("359.3.e.14.a — the gear is GONE (returned to hand): nothing is killed and nobody draws", async () => {
      const game = await board({ reclaim: true }).build();
      const deck = game.p2.deck().length;
      await game.p1.cast("det", { targets: "trinket" });
      await game.p1.passPriority();
      await game.p2.cast("reclaim", { targets: "trinket" });
      await game.settle();
      expect(game.zoneOf("trinket")).toBe("hand");
      expect(game.p2.deck()).toHaveLength(deck);
      expect(game.violations()).toEqual([]);
    });
  });

  describe("action-referencing rider — Disintegrate's 'If this kills it, do this: draw 1'", () => {
    const board = (withZhonya: boolean) => {
      const s = scenario()
        .resources(P1, { energy: 5, power: { fury: 2 } })
        .battlefield("bf1", { controller: P2 })
        .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim")
        .hand(P1, DISINTEGRATE, "dis");
      return withZhonya ? s.gear(P2, ZHONYA, "zh") : s;
    };

    test("lethal damage kills it — the caster draws 1", async () => {
      const game = await board(false).build();
      const deck = game.p1.deck().length;
      await game.p1.cast("dis", { targets: "victim" });
      await game.settle();
      expect(game.zoneOf("victim")).toBe("trash");
      expect(game.p1.deck()).toHaveLength(deck - 1);
    });

    // The contrast the CR draws in 359.3.e.14.b's second example (Deathgrip): a rider that names the ACTION
    // ("if this kills it", "if you do") does NOT run when that action is replaced — unlike "its controller".
    test("359.3.e.14.b — the death is REPLACED (Zhonya's): the damage was dealt but nothing was killed, so NO draw", async () => {
      const game = await board(true).build();
      const deck = game.p1.deck().length;
      await game.p1.cast("dis", { targets: "victim" });
      await game.settle();
      expect(game.zoneOf("zh")).toBe("trash");
      expect(game.zoneOf("victim")).toBe("base");
      expect(game.p1.deck()).toHaveLength(deck);
      expect(game.violations()).toEqual([]);
    });
  });
});
