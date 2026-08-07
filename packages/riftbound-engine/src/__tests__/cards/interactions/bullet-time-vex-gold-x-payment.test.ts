/**
 * Interaction: Bullet Time (ogn-268-298) — Action spell, [1], Body/Chaos
 *     "Pay any amount of [rainbow] to deal that much damage to all enemy units at a battlefield."
 *   × Vex, Cheerless (sfd-146-221) — 5 Might Chaos champion
 *     "While I'm in combat, friendly spells cost [1][rainbow] less to a minimum of [1], and enemy
 *      spells cost [1][rainbow] more."
 *   × Gold token (sfd-t03) — gear: "Kill this, [Exhaust]: [Reaction] — [Add] [rainbow]."
 *
 * Question: during a combat showdown where the OPPONENT's Vex defends, what does Bullet Time cost
 * to put on the chain, when is X chosen/paid, does the Vex surcharge count toward X, and can you
 * crack Gold tokens mid-resolution to fund X? Contrast: your OWN Vex is the one in combat.
 *
 * Rules:
 *   356.3 / 135.2.e.5.a  cost increases apply when the spell is played; [rainbow] = Power of any
 *              domain → enemy Vex makes Bullet Time cost [2] + 1 Power. That Power is a play cost
 *              and never counts toward X.
 *   204.3.b    "Pay any amount of [rainbow] to …" is a cost-within-instructions paid ON RESOLUTION
 *              (Bullet Time is the printed example) — after the opponents' reaction window
 *              (359.3.c). X is not a play cost, so no increase/discount touches it.
 *   444.1/444.2  paying = removing Power from your pool at that moment; paying 0 is allowed.
 *   429.3 / 429.3.a / 444.2.c  Reaction [Add] abilities may be activated whenever a payment is
 *              asked for and resolve immediately — so Golds can be cracked mid-resolution.
 *   356.6 / card text  friendly Vex: the [1] discount is floored at [1] and there is no Power
 *              cost to reduce → Bullet Time still costs exactly [1]; X is unchanged.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BULLET_TIME = "ogn-268-298";
const VEX_CHEERLESS = "sfd-146-221";
const GOLD = "sfd-t03";

/**
 * P2 holds bf1 with Vex (5) and a 2-Might grunt. P1 has a 3-Might attacker in base, two Gold
 * tokens and Bullet Time in hand. `move("attacker","bf1")` opens the combat showdown with P1
 * holding Focus and Vex "in combat" as a defender.
 */
function enemyVexBoard(p1: { energy: number; rainbow?: number }) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .resources(P1, { energy: p1.energy, power: { rainbow: p1.rainbow ?? 0 } })
    .unit(P2, "bf1", VEX_CHEERLESS, "vex")
    .unit(P2, "bf1", { might: 2, name: "Grunt" }, "grunt")
    .unit(P1, "base", { might: 3, name: "Attacker" }, "attacker")
    .gear(P1, GOLD, "gold1")
    .gear(P1, GOLD, "gold2")
    .hand(P1, BULLET_TIME, "bt");
}

/** P1's own Vex defends bf1 against a P2 attack; P2 passes Focus so P1 may act in the showdown. */
function friendlyVexBoard(p1: { energy: number; rainbow?: number }) {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .resources(P1, { energy: p1.energy, power: { rainbow: p1.rainbow ?? 0 } })
    .unit(P1, "bf1", VEX_CHEERLESS, "vex")
    .unit(P2, "base", { might: 3, name: "Attacker" }, "attacker")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, BULLET_TIME, "bt");
}

describe("Bullet Time × Vex, Cheerless × Gold — what is a play cost and what is X", () => {
  // ── enemy Vex in combat: the surcharge ────────────────────────────────────────────────

  test("enemy Vex defending — Bullet Time is NOT playable with only [1] and no Power (needs [2] + 1 Power; 356.3)", async () => {
    // Expected: the +[1][rainbow] increase makes a 1-energy/0-power pool insufficient.
    // Actual: Vex's static cost increase is not applied; the cast is offered at [1].
    const game = await enemyVexBoard({ energy: 1 }).build();
    await game.p1.move("attacker", "bf1");
    expect(game.state("vex").combatRole).toBe("defender");
    expect(game.p1.can("cast", "bt")).toBe(false);
    await expect(game.p1.cast("bt", { targets: "bf1", x: 0 })).rejects.toThrow();
  });

  test("enemy Vex defending — putting Bullet Time on the chain drains exactly [2] + 1 Power of any domain (356.3, 135.2.e.5.a)", async () => {
    // Expected: pool 2E/1R → 0E/0R once Bullet Time is on the chain, before anything resolves.
    // Actual: only [1] is taken (surcharge ignored) → 1E/1R remain.
    const game = await enemyVexBoard({ energy: 2, rainbow: 1 }).build();
    await game.p1.move("attacker", "bf1");
    await game.p1.cast("bt", { targets: "bf1", x: 0 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bt", controller: P1 })]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  });

  // ── X is a resolution-time Power payment, not a play cost ─────────────────────────────

  test("X is not chosen or paid when Bullet Time is played — it goes on the chain with no X and the Power for X stays in the pool until resolution (204.3.b)", async () => {
    // Expected: cast needs only a battlefield choice; 2E+1R leave for the (surcharged) play cost,
    // the 2 rainbow earmarked for X are still there while P2 has its reaction window.
    // Actual: the engine demands X at play time and deducts it immediately — as ENERGY.
    const game = await enemyVexBoard({ energy: 2, rainbow: 3 }).build();
    await game.p1.move("attacker", "bf1");
    await game.p1.cast("bt", { targets: "bf1" });
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 2 } });
    // Both pass → Bullet Time resolves and only NOW asks how much [rainbow] to pay.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "integer", seat: P1 });
    await game.p1.chooseX(2);
    expect(game.p1.power()).toBe(0);
    expect(game.state("vex").damage).toBe(2);
    expect(game.zoneOf("grunt")).toBe("trash");
  });

  test("X is paid in Power, never Energy — with 0 Power beyond the surcharge, no amount of spare Energy can buy damage (444.1)", async () => {
    // Expected: 6E/1R with enemy Vex → after the [2]+1R play cost there is 4E/0R; Energy cannot be
    // spent as [rainbow], so the only legal payment is 0 and nothing is damaged.
    // Actual: the engine lets X be bought with Energy (x up to remaining energy) and deals it.
    const game = await enemyVexBoard({ energy: 6, rainbow: 1 }).build();
    await game.p1.move("attacker", "bf1");
    const xField = game.p1.option("cast", "bt")?.fields.find((f) => f.name === "xAmount");
    // Either no play-time X at all (rules-correct) or, at worst, an X capped at 0.
    expect(xField === undefined || xField.max === 0).toBe(true);
    await expect(game.p1.cast("bt", { targets: "bf1", x: 3 })).rejects.toThrow();
  });

  // ── Gold tokens: Reaction [Add] around / during resolution ────────────────────────────

  test("Gold's 'Kill this: [Reaction] — [Add] [rainbow]' can be activated while Bullet Time is on the chain and resolves immediately without becoming a chain item (429.3.a)", async () => {
    const game = await enemyVexBoard({ energy: 2, rainbow: 1 }).build();
    await game.p1.move("attacker", "bf1");
    await game.p1.cast("bt", { targets: "bf1", x: 0 });
    const before = game.p1.power("rainbow");
    expect(game.p1.can("activate", "gold1")).toBe(true);
    await game.p1.activate("gold1", 0, { sacrifice: "gold1" });
    expect(game.p1.power("rainbow")).toBe(before + 1);
    expect(game.p1.gear()).not.toContain("gold1"); // killed as part of the cost
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bt" })]); // Add did not use the chain
    await game.p1.activate("gold2", 0, { sacrifice: "gold2" });
    expect(game.p1.power("rainbow")).toBe(before + 2);
    expect(game.violations()).toEqual([]);
  });

  test("two Golds cracked after Bullet Time is already on the chain fund X = 2 at resolution → 2 damage to Vex and to the grunt (204.3.b, 429.3, 444.2)", async () => {
    // Expected: play for [2]+1R (pool now empty), crack both Golds (+2 rainbow), resolve, pay 2 →
    // every enemy unit at bf1 takes 2 (grunt dies, Vex 2 damage), pool empty again.
    // Actual: X had to be fixed (and paid from Energy) at play time, before the Golds existed as Power.
    const game = await enemyVexBoard({ energy: 2, rainbow: 1 }).build();
    await game.p1.move("attacker", "bf1");
    await game.p1.cast("bt", { targets: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.p1.activate("gold1", 0, { sacrifice: "gold1" });
    await game.p1.activate("gold2", 0, { sacrifice: "gold2" });
    expect(game.p1.power("rainbow")).toBe(2);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "integer", seat: P1 });
    await game.p1.chooseX(2);
    expect(game.p1.power()).toBe(0);
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.state("vex").damage).toBe(2);
    expect(game.zoneOf("vex")).toBe("battlefield-bf1");
    expect(game.zoneOf("bt")).toBe("trash");
  });

  test("Golds can be cracked in the MIDDLE of Bullet Time's resolution, at the moment the payment is asked for (429.3, 429.3.a, 444.2.c)", async () => {
    // Expected: with an empty Power pool when Bullet Time starts resolving, the pay-X prompt still
    // allows activating Reaction [Add] abilities; each Gold resolves immediately and the fresh
    // [rainbow] can be paid right there. Actual: there is no resolution-time payment step at all.
    const game = await enemyVexBoard({ energy: 2, rainbow: 1 }).build();
    await game.p1.move("attacker", "bf1");
    await game.p1.cast("bt", { targets: "bf1" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "integer", seat: P1 });
    expect(game.p1.power()).toBe(0);
    await game.p1.activate("gold1", 0, { sacrifice: "gold1" });
    await game.p1.activate("gold2", 0, { sacrifice: "gold2" });
    expect(game.p1.power("rainbow")).toBe(2);
    expect(game.decision()).toMatchObject({ kind: "integer", seat: P1 }); // still mid-resolution
    await game.p1.chooseX(2);
    expect(game.state("vex").damage).toBe(2);
    expect(game.zoneOf("grunt")).toBe("trash");
  });

  test("paying 0 is legal: Bullet Time resolves, goes to trash, and no enemy unit at bf1 is damaged (444.2)", async () => {
    const game = await enemyVexBoard({ energy: 2, rainbow: 1 }).build();
    await game.p1.move("attacker", "bf1");
    await game.p1.cast("bt", { targets: "bf1", x: 0 });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Bullet Time resolves; showdown continues (combat not yet fought)
    expect(game.zoneOf("bt")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.state("vex").damage).toBe(0);
    expect(game.state("grunt").damage).toBe(0);
    expect(game.zoneOf("grunt")).toBe("battlefield-bf1");
  });

  test("Bullet Time chooses a battlefield, not units — the only 'target' offered is bf1 (so Deflect-style protections are irrelevant)", async () => {
    const game = await enemyVexBoard({ energy: 2, rainbow: 1 }).build();
    await game.p1.move("attacker", "bf1");
    const targets = game.p1.option("cast", "bt")?.fields.find((f) => f.name === "targets")?.options;
    expect(targets).toEqual([["bf1"]]);
  });

  // ── contrast: Vex not in combat / friendly Vex in combat ──────────────────────────────

  test("enemy Vex NOT in combat (sitting at bf1, no showdown): no surcharge — Bullet Time costs exactly [1] on your own turn", async () => {
    const game = await enemyVexBoard({ energy: 1 }).build();
    expect(game.state("vex").combatRole).toBeNull();
    expect(game.p1.can("cast", "bt")).toBe(true);
    await game.p1.cast("bt", { targets: "bf1", x: 0 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bt" })]);
  });

  test("friendly Vex defending: the [1] discount is floored at her minimum of [1] and there is no Power cost to reduce — Bullet Time still costs exactly [1] (356.6)", async () => {
    const game = await friendlyVexBoard({ energy: 1, rainbow: 2 }).build();
    expect(game.p1.can("cast", "bt")).toBe(false); // Action spell: not on the opponent's turn outside a showdown
    await game.p2.move("attacker", "bf1");
    expect(game.state("vex").combatRole).toBe("defender");
    await game.p2.passFocus();
    expect(game.p1.can("cast", "bt")).toBe(true);
    await game.p1.cast("bt", { targets: "bf1", x: 0 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 2 } }); // not free, no rainbow refund
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bt", controller: P1 })]);
  });

  test("friendly Vex defending with [0] Energy: Bullet Time is NOT free — the minimum of [1] still applies", async () => {
    const game = await friendlyVexBoard({ energy: 0, rainbow: 2 }).build();
    await game.p2.move("attacker", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("cast", "bt")).toBe(false);
  });

  test("friendly Vex does not make X cheaper — with [1] + 2 rainbow you pay [1] to play and 2 Power at resolution for exactly 2 damage to the attacker (204.3.b, 356.6)", async () => {
    // Expected: X is a resolution-time Power payment untouched by Vex's discount; 2 rainbow → 2 damage.
    // Actual: X is capped by (and paid from) Energy at play time, so with [1] the only X is 0.
    const game = await friendlyVexBoard({ energy: 1, rainbow: 2 }).build();
    await game.p2.move("attacker", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("bt", { targets: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 2 } });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "integer", seat: P1 });
    await game.p1.chooseX(2);
    expect(game.p1.power()).toBe(0);
    expect(game.state("attacker").damage).toBe(2);
    expect(game.state("bystander").damage).toBe(0); // in base, not "at a battlefield"
  });
});
