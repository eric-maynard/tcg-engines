/**
 * Interaction: Smite (unl-007-219) "Deal 3 to a unit at a battlefield. If it would die this turn,
 *                banish it instead."  — Action, Fury, [2][fury]
 *   × Zhonya's Hourglass (ogn-077-298) "If a friendly unit would die, kill this instead. Heal that
 *                unit, exhaust it, and recall it."  — Gear
 *   × LeBlanc, Fragmented (unl-172-219) 3 Might, "[Deathknell] Draw 1."
 *
 * Question: P2's LeBlanc (3 Might) is at a battlefield, P2 has a face-up Zhonya's in base. P1
 * resolves Smite on LeBlanc. Banished, or saved? Does Deathknell draw? Contrast: no Zhonya's.
 *
 * Rules: 369.1 / 370.1.a.1 (a replaced death never happened), 370.2 (a replacement applies once
 * to an event or its replacements), 372 (two replacements on the same event → the controller of
 * the affected object, P2, orders them), 427.2.a (banish is not a kill), 808.1.d / 808.1.d.1
 * (Deathknell needs "killed and sent to trash"; a replaced death removes the trigger).
 *
 * Expected: Smite deals 3 → lethal → LeBlanc "would die". With Zhonya's, two replacement effects
 * apply and P2 chooses the order. Zhonya's first: Hourglass killed → trash, LeBlanc healed,
 * exhausted, recalled to base, NOT banished, no draw. Smite first: LeBlanc banished, Zhonya's
 * stays (banish is not a kill), no draw. Without Zhonya's: banished, no draw.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SMITE = "unl-007-219";
const ZHONYA = "ogn-077-298";
const LEBLANC = "unl-172-219";

/** Inline 1-energy action spell: deal 3 to a unit (a plain lethal hit, no banish clause). */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};

function board(opts: { zhonyas: boolean }) {
  const s = scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", LEBLANC, "leblanc")
    .hand(P1, SMITE, "smite")
    .hand(P1, BOLT, "bolt");
  return opts.zhonyas ? s.gear(P2, ZHONYA, "zh") : s;
}

describe("Smite × Zhonya's Hourglass × LeBlanc, Fragmented — replacement ordering", () => {
  // ---- baseline: Deathknell works when she is actually killed --------------------------------

  test("control: a plain lethal 3 (no Smite, no Zhonya's) kills LeBlanc → trash, Deathknell draws 1", async () => {
    const game = await board({ zhonyas: false }).build();
    const hand = game.p2.hand().length;
    await game.p1.cast("bolt", { targets: "leblanc" });
    await game.settle();
    expect(game.zoneOf("leblanc")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(hand + 1);
  });

  // ---- No side: Smite alone ------------------------------------------------------------------

  test("no Zhonya's: Smite's 3 damage is lethal and its replacement banishes LeBlanc instead of killing her", async () => {
    const game = await board({ zhonyas: false }).build();
    await game.p1.cast("smite", { targets: "leblanc" });
    await game.settle();
    expect(game.zoneOf("leblanc")).toBe("banishment");
    expect(game.p2.trash()).not.toContain("leblanc");
    expect(game.zoneOf("smite")).toBe("trash");
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.power("fury")).toBe(0);
  });

  test("no Zhonya's: banish is not a kill (427.2.a) — Deathknell does not trigger, P2 draws nothing (808.1.d)", async () => {
    const game = await board({ zhonyas: false }).build();
    const hand = game.p2.hand().length;
    const deck = game.p2.deck().length;
    await game.p1.cast("smite", { targets: "leblanc" });
    await game.settle();
    expect(game.p2.hand()).toHaveLength(hand);
    expect(game.p2.deck()).toHaveLength(deck);
    expect(game.chain()).toEqual([]);
  });

  // ---- Yes side: Smite + Zhonya's ------------------------------------------------------------

  // Expected: after Smite resolves and the lethal damage is found, two replacement effects want the
  // same death event; rule 372 hands the ordering to P2 (LeBlanc's controller). Actual: the engine
  // applies Smite's banish replacement silently and never consults Zhonya's or asks P2.
  test("with Zhonya's on board P2 (controller of the dying unit) should be asked to order the two replacement effects (rule 372)", async () => {
    const game = await board({ zhonyas: true }).build();
    await game.p1.cast("smite", { targets: "leblanc" });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()?.seat).toBe(P2);
    expect(["pick", "order"]).toContain(game.decision()?.kind as string);
  });

  // Expected: P2 applies Zhonya's first → Hourglass is killed (trash), LeBlanc healed, exhausted,
  // recalled to base; the death is fully replaced so Smite's "banish instead" finds nothing (370.2).
  // Actual: no ordering prompt; LeBlanc is banished and the Hourglass never leaves base.
  test("P2 applying Zhonya's first saves LeBlanc — Hourglass to trash, LeBlanc in base healed + exhausted, not banished (370.2, 370.1.a.1)", async () => {
    const game = await board({ zhonyas: true }).build();
    await game.p1.cast("smite", { targets: "leblanc" });
    await game.settle();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.pick("zh");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("leblanc")).toBe("base");
    expect(game.state("leblanc").damage).toBe(0);
    expect(game.state("leblanc").isExhausted).toBe(true);
    expect(game.p2.banishment()).not.toContain("leblanc");
  });

  // Expected: whichever order is applied, LeBlanc is never "killed and sent to the trash", so her
  // Deathknell must not draw (808.1.d.1). Under the Zhonya's-first order she is in base.
  // Actual: cannot reach the Zhonya's-first branch (see above).
  test("Zhonya's-first save does not trigger Deathknell — LeBlanc in base and P2's hand unchanged (808.1.d.1)", async () => {
    const game = await board({ zhonyas: true }).build();
    const hand = game.p2.hand().length;
    await game.p1.cast("smite", { targets: "leblanc" });
    await game.settle();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.pick("zh");
    await game.settle();
    expect(game.zoneOf("leblanc")).toBe("base");
    expect(game.p2.hand()).toHaveLength(hand);
  });

  test("Smite-first ordering (the engine's current default): LeBlanc is banished, Zhonya's stays on board since banish is not a kill (427.2.a), no Deathknell draw", async () => {
    const game = await board({ zhonyas: true }).build();
    const hand = game.p2.hand().length;
    await game.p1.cast("smite", { targets: "leblanc" });
    const r = await game.settle();
    // When the engine learns to ask (rule 372), P2 picks Smite's replacement here.
    if (r.reason === "unanswered" && game.actingSeat() === P2) {
      await game.p2.pick("smite");
      await game.settle();
    }
    expect(game.zoneOf("leblanc")).toBe("banishment");
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.p2.gear()).toContain("zh");
    expect(game.p2.hand()).toHaveLength(hand);
    expect(game.zoneOf("smite")).toBe("trash");
  });
});
