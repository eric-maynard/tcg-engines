/**
 * Interaction: Ruined Rex (unl-067-219) · Unit · Mind · 6 + [mind] · 6 Might
 *     "[Deathknell] — Deal 4 to an enemy unit. (When I die, get the effect.)"
 *   × Navori Scout (sfd-037-221) · Unit · Calm · 4 · 4 Might
 *     "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)"
 *
 * Question: P1's Ruined Rex dies. P2's only unit is Navori Scout at a battlefield (variant A),
 * or Navori Scout plus a vanilla 3-Might unit (variant B).
 *   (a) Does Deflect tax a *triggered ability* such as Deathknell?  — Yes: 809.1.c "spells AND
 *       abilities an opponent controls that target me"; 809.1.d it is a Mandatory Additional Cost.
 *       The target is chosen when the pending trigger is finalized (383.3 / 355.5).
 *   (b) Variant A, P1 has no power: the only legal target is the Scout, P1 cannot pay the incurred
 *       cost, so the pending ability is removed from the chain and never finalizes (404.2). It is
 *       NOT countered (404.2.a). Scout takes no damage.
 *   (c) Variant A, P1 has 1 power of any domain (809.1.c.1): P1 pays it, Scout takes 4 and dies.
 *   (d) Variant B: P1 may simply choose the vanilla unit — no Deflect cost — it takes 4 and dies.
 * 808.1.d.2: the Deathknell trigger becomes a Pending Item before Rex reaches the trash.
 *
 * Engine findings (why the BUG tests fail):
 *   1. Ruined Rex's Deathknell never triggers at all — its definition carries only a
 *      `{type:"keyword", keyword:"Deathknell", effect}` entry and the trigger runner only listens
 *      to `type:"triggered"` abilities, so nothing is ever put on the chain when Rex dies.
 *   2. Independently (control test with an inline "When I die" unit): a triggered ability that
 *      chooses an enemy Deflect unit is never charged the Deflect surcharge — Deflect is only
 *      enforced for spells.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RUINED_REX = "unl-067-219";
const NAVORI_SCOUT = "sfd-037-221";

/** Inline vanilla 6-damage spell P1 uses to kill its own Rex outside combat (no Deflect involved: own unit). */
const BOLT = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Bolt 6",
  timing: "action",
};

/**
 * P1: Ruined Rex in base + a free Bolt to kill it. All runes spent unless `power` is given.
 * P2: Navori Scout (Deflect) at bf1; variant B adds a vanilla 3-Might "grunt" next to it.
 */
function board(opts: { power?: number; variantB?: boolean } = {}) {
  const b = scenario()
    .resources(P1, { energy: 0, power: opts.power ? { mind: opts.power } : {} })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", RUINED_REX, "rex")
    .unit(P2, "bf1", NAVORI_SCOUT, "scout")
    .hand(P1, BOLT, "bolt");
  if (opts.variantB) {
    b.unit(P2, "bf1", { might: 3 }, "grunt");
  }
  return b;
}

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1 bolts its own Rex; both pass so the Bolt resolves and Rex dies (Deathknell condition met). */
async function killRex(game: G) {
  await game.p1.cast("bolt", { targets: "rex" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("rex")).toBe("trash");
}

describe("Ruined Rex Deathknell × Navori Scout Deflect", () => {
  test.failing("BUG: Rex dying puts its Deathknell on the chain as a triggered ability controlled by P1 (808.1.d.2, 383.3)", async () => {
    // Expected: after the Bolt resolves, a triggered chain item sourced from Rex, controller P1.
    // Actual: Ruined Rex's keyword-only Deathknell is never synthesised into a trigger; chain stays empty.
    const game = await board({ power: 1 }).build();
    await killRex(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rex", controller: P1, triggered: true })]);
  });

  test("(b) variant A, no power: the trigger cannot be paid for → removed, not countered; Navori Scout is untouched (404.2, 404.2.a)", async () => {
    const game = await board().build();
    await killRex(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.chain().some((i) => i.countered)).toBe(false);
    expect(game.zoneOf("scout")).toBe("battlefield-bf1");
    expect(game.state("scout").damage).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    // Nothing is left waiting on P1: back to an open main phase.
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1, context: "main" });
  });

  test.failing("BUG: (a)+(c) variant A with 1 power: Deflect taxes the triggered ability — P1 pays 1 power of any domain to choose the Scout (809.1.c, 809.1.c.1, 809.1.d)", async () => {
    // Expected: the mind power is spent as the mandatory additional cost of finalizing the trigger.
    // Actual: no trigger fires (and even for triggers that do fire, no Deflect surcharge is charged).
    const game = await board({ power: 1 }).build();
    await killRex(game);
    await game.settle();
    expect(game.p1.power("mind")).toBe(0);
    expect(game.p1.power()).toBe(0);
  });

  test.failing("BUG: (c) variant A with 1 power: on resolution Navori Scout takes 4 and, being 4 Might, dies", async () => {
    // Expected: Scout is dealt 4 → lethal → trash at cleanup. Actual: Deathknell never triggers; Scout undamaged.
    const game = await board({ power: 1 }).build();
    await killRex(game);
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.p2.units("bf1")).not.toContain("scout");
  });

  test.failing("BUG: (d) variant B, no power: P1 picks the vanilla unit — no Deflect cost incurred — it takes 4 and dies; Scout untouched", async () => {
    // Expected: target choice is P1's; choosing "grunt" costs nothing extra; 4 damage kills the 3-Might grunt.
    // Actual: Deathknell never triggers, grunt survives undamaged.
    const game = await board({ variantB: true }).script(P1, ["grunt"]).build();
    await killRex(game);
    await game.settle();
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("battlefield-bf1");
    expect(game.state("scout").damage).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([]);
  });

  test.failing("BUG: (d) variant B with 1 power: choosing the vanilla unit still spends no power (Deflect only taxes choosing the Scout)", async () => {
    // Expected: grunt dies, the mind power is still in P1's pool. Actual: no trigger at all.
    const game = await board({ power: 1, variantB: true }).script(P1, ["grunt"]).build();
    await killRex(game);
    await game.settle();
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.p1.power("mind")).toBe(1);
    expect(game.state("scout").damage).toBe(0);
  });

  // ---- control: same board with an inline "When I die, deal 4 to an enemy unit" unit whose trigger DOES fire,
  // isolating question (a) from the Ruined-Rex-never-triggers defect.
  const INLINE_DEATHKNELL = {
    abilities: [
      {
        effect: { amount: 4, target: { controller: "enemy", type: "unit" }, type: "damage" },
        trigger: { event: "die", on: "self" },
        type: "triggered",
      },
    ],
    cardType: "unit",
    domain: "mind",
    energyCost: 6,
    might: 6,
    name: "Dying Lizard (inline)",
  };

  function controlBoard(power: number) {
    return scenario()
      .resources(P1, { energy: 0, power: power ? { mind: power } : {} })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", INLINE_DEATHKNELL, "rex")
      .unit(P2, "bf1", NAVORI_SCOUT, "scout")
      .hand(P1, BOLT, "bolt");
  }

  test("control: an inline 'When I die' trigger does go on the chain under P1's control when the unit dies", async () => {
    const game = await controlBoard(1).build();
    await killRex(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rex", controller: P1, triggered: true })]);
  });

  test("(a) control — Deflect must tax the triggered ability: with 1 power P1 pays it to hit the Scout (809.1.c)", async () => {
    // Expected: Scout takes 4 and dies AND the mind power is spent on the Deflect surcharge.
    // Actual: Scout dies but P1 keeps the power — the surcharge is only applied to spells.
    const game = await controlBoard(1).build();
    await killRex(game);
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.p1.power("mind")).toBe(0);
  });

  test("(b) control — with NO power the Scout cannot be chosen: the trigger is dropped and Scout takes no damage (404.2)", async () => {
    // Expected: only legal target has Deflect, P1 cannot pay → pending ability removed, Scout undamaged.
    // Actual: the engine auto-targets the Scout for free and kills it.
    const game = await controlBoard(0).build();
    await killRex(game);
    await game.settle();
    expect(game.zoneOf("scout")).toBe("battlefield-bf1");
    expect(game.state("scout").damage).toBe(0);
    expect(game.chain()).toEqual([]);
  });
});
