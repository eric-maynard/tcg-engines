/**
 * Interaction: Unlicensed Armory (ogn-023-298) · Gear · Fury · 2
 *     "Discard 1, [Exhaust]: Choose a friendly unit. The next time it would die this turn, you may
 *      pay [fury] to heal it, exhaust it, and recall it instead."
 *   × Zhonya's Hourglass (ogn-077-298) · Gear · Calm · 2
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Question: P1's turn. P1 activates the Armory choosing friendly X (2 Might); P1 also controls a
 * face-up Zhonya's and has exactly 1 fury. P1 attacks bf1 with X (2) and Y (2) into P2's 5-Might
 * defender; the defender assigns lethal to both, so X and Y would die simultaneously in the combat
 * Cleanup (defender survives on 4). (a) Is P1 prompted mid-Cleanup to order/assign the replacements
 * and to optionally pay [fury], and can P1 end with BOTH units alive? (b) With 0 fury is the Armory
 * shield inapplicable, so Zhonya's saves exactly one unit of P1's choice? (c) Is the shield single-use
 * and this-turn only?
 *
 * Rules: 390.3 (Armory installs a delayed replacement), 371.2 ("may" replacement — optional; the
 * embedded [fury] must be payable), 370.1.c (replacements are applied before the event, so paying a
 * cost inside a Cleanup is fine), 373 (simultaneous events are handled one by one; same-controller
 * replacements are applied in the order that controller chooses — the printed example is exactly two
 * deaths + one Zhonya's), 372 (two replacements on X's event → X's controller orders them), 373.1.a
 * (replacement action-sets run before unmodified deaths), 370.2 / 373.2 (a replacement applies once),
 * 365.1 ("this turn").
 *
 * Expected: (a) P1 decides. Best line: Armory → X (pay 1 fury; X healed/exhausted/recalled) and
 * Zhonya's → Y (Hourglass to trash; Y healed/exhausted/recalled). No P1 unit in trash, fury 0, no
 * attackers left so no conquest — defender keeps bf1. (b) 0 fury: Armory cannot be applied; P1 picks
 * which of X / Y Zhonya's saves, the other dies. (c) The shield is consumed by one event and expires at
 * end of turn.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ARMORY = "ogn-023-298";
const ZHONYAS = "ogn-077-298";
const FILLER = "ogn-175-298"; // discard fodder for the Armory's cost
/** 0-cost action spell "Deal 3 to a unit" — a plain lethal hit for the single-use / expiry facets. */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Bolt",
  timing: "action",
};

function board(opts: { fury: number; zhonyas?: boolean } = { fury: 1 }) {
  const b = scenario()
    .resources(P1, { energy: 0, power: { fury: opts.fury } })
    .battlefield("bf1", { controller: P2 })
    .gear(P1, ARMORY, "armory")
    .unit(P1, "base", { might: 2, name: "Unit X" }, "x")
    .unit(P1, "base", { might: 2, name: "Unit Y" }, "y")
    .unit(P2, "bf1", { might: 5, name: "Defender" }, "wall")
    .hand(P1, FILLER, "junk")
    .hand(P1, BOLT, "bolt")
    .hand(P1, BOLT, "bolt2");
  return opts.zhonyas === false ? b : b.gear(P1, ZHONYAS, "zh");
}

/** Armory shield on `unit`, then X+Y attack bf1 and both players pass focus until the Cleanup prompts (or ends). */
async function shieldAndAttack(game: Game, unit = "x"): Promise<Decision[]> {
  await game.p1.activate("armory", 0, { discard: "junk", targets: [unit] });
  await game.settle();
  expect(game.chain()).toEqual([]);
  await game.p1.move(["x", "y"], "bf1");
  return drive(game);
}

/**
 * Pass focus/priority and take default damage splits until a non-action prompt or the open main
 * phase; returns every non-action decision seen (unanswered one last).
 */
async function drive(game: Game, answer?: (d: Decision) => Promise<boolean>): Promise<Decision[]> {
  const seen: Decision[] = [];
  for (let i = 0; i < 24; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "action") {
      if (d.passKey) {
        await game.seat(d.seat).pass();
      } else if (d.context === "procedure" && d.options[0]) {
        await game.seat(d.seat).choose(d.options[0].key);
      } else {
        break;
      }
      continue;
    }
    if (d.kind === "distribute" && d.defaultAllocation) {
      await game.seat(d.seat).distribute({ ...d.defaultAllocation });
      continue;
    }
    seen.push(d);
    if (answer && (await answer(d))) {
      continue;
    }
    break;
  }
  return seen;
}

describe("Unlicensed Armory × Zhonya's Hourglass — two simultaneous combat deaths (373)", () => {
  // ---- (a) 1 fury: both can be saved --------------------------------------------------------------

  test("(a) mid-Cleanup P1 is asked whether to pay [fury] for the Armory shield — an optional replacement with a payable cost (371.2, 370.1.c)", async () => {
    const game = await board({ fury: 1 }).build();
    const seen = await shieldAndAttack(game);
    const ask = seen.at(-1);
    expect(ask).toMatchObject({ kind: "yes-no", seat: P1 });
    expect((ask as Extract<Decision, { kind: "yes-no" }>).canAccept).not.toBe(false);
    // Nothing has actually died yet while the question is open (370.1.c).
    expect(game.p1.trash()).not.toContain("x");
    expect(game.p1.trash()).not.toContain("y");
    expect(game.p1.power("fury")).toBe(1);
  });

  // Expected (372 / 373 example): X's death has two applicable replacements {Armory, Zhonya's} and
  // Zhonya's could go to either death, all controlled by P1 → P1 must get an order/assignment choice
  // (e.g. decline the Armory and put Zhonya's on X, letting Y die). Actual: the engine silently assigns
  // Zhonya's to Y and only asks the [fury] question; declining it just kills X.
  test("BUG: (a) P1 should also get an order/assignment decision for the replacements across the two deaths (372, 373)", async () => {
    const game = await board({ fury: 1 }).build();
    await game.p1.activate("armory", 0, { discard: "junk", targets: ["x"] });
    await game.settle();
    await game.p1.move(["x", "y"], "bf1");
    const seen = await drive(game, async (d) => {
      if (d.kind === "yes-no") {
        await game.p1.no(); // decline the shield so the Zhonya's assignment genuinely matters
        return true;
      }
      return false;
    });
    const ordering = seen.find((d) => d.seat === P1 && (d.kind === "pick" || d.kind === "order"));
    expect(ordering).toBeDefined();
  });

  test("(a) best line: pay [fury] → Armory saves X and Zhonya's saves Y — both in base healed + exhausted, Hourglass in trash, fury 0 (373.1.a)", async () => {
    const game = await board({ fury: 1 }).build();
    await shieldAndAttack(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await drive(game);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    for (const u of ["x", "y"]) {
      expect(game.zoneOf(u)).toBe("base");
      expect(game.state(u).damage).toBe(0);
      expect(game.state(u).isExhausted).toBe(true);
    }
    expect(game.zoneOf("zh")).toBe("trash");
    expect([...game.p1.trash()].sort()).toEqual(["junk", "zh"]); // no P1 unit died
    expect(game.p1.power("fury")).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("(a) no attackers remain, so the combat ends without a conquest: defender keeps bf1 (healed), P1 scores nothing", async () => {
    const game = await board({ fury: 1 }).build();
    await shieldAndAttack(game);
    await game.p1.yes();
    await drive(game);
    await game.settle();
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.state("wall").damage).toBe(0); // took 4 of 5, healed at end of combat
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.chain()).toEqual([]);
  });

  test("(a) declining the [fury] payment: the Armory is not applied — X dies, fury is kept, Zhonya's still saves exactly one unit", async () => {
    const game = await board({ fury: 1 }).build();
    await shieldAndAttack(game);
    await game.p1.no();
    await drive(game, async (d) => {
      // If the engine ever asks which death Zhonya's replaces, keep it on Y.
      if (d.kind === "pick" && d.seat === P1) {
        await game.p1.pick(d.options.find((o) => o.card === "y" || o.key === "y")?.key ?? d.options[0]!.key);
        return true;
      }
      return false;
    });
    await game.settle();
    expect(game.p1.power("fury")).toBe(1);
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.zoneOf("y")).toBe("base");
    expect(game.state("y").isExhausted).toBe(true);
    expect(game.zoneOf("zh")).toBe("trash");
  });

  test("(a) the shield watches only the chosen unit: with the Armory on Y instead, it is Y that the [fury] saves and Zhonya's covers X", async () => {
    const game = await board({ fury: 1 }).build();
    await shieldAndAttack(game, "y");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await drive(game);
    await game.settle();
    expect(game.zoneOf("x")).toBe("base");
    expect(game.zoneOf("y")).toBe("base");
    expect(game.p1.power("fury")).toBe(0);
    expect(game.zoneOf("zh")).toBe("trash");
  });

  // ---- (b) 0 fury: Armory inapplicable, Zhonya's saves one ------------------------------------------

  test("(b) with 0 fury the optional cost cannot be paid, so no usable [fury] prompt is offered (371.2)", async () => {
    const game = await board({ fury: 0 }).build();
    const seen = await shieldAndAttack(game);
    const payable = seen.filter((d) => d.kind === "yes-no" && d.canAccept !== false);
    expect(payable).toEqual([]);
  });

  // Expected (373 example): only Zhonya's applies, to X's death or Y's — P1 chooses which. Actual: the
  // engine picks Y on its own and never asks.
  test("BUG: (b) P1 should be asked which of the two simultaneous deaths Zhonya's replaces (373)", async () => {
    const game = await board({ fury: 0 }).build();
    const seen = await shieldAndAttack(game);
    const choice = seen.find((d) => d.seat === P1 && (d.kind === "pick" || d.kind === "order"));
    expect(choice).toBeDefined();
  });

  /** 0-fury line driven to the open main phase, taking whatever save-choice the engine may offer. */
  async function zeroFuryCleanup(): Promise<Game> {
    const game = await board({ fury: 0 }).build();
    await shieldAndAttack(game);
    await drive(game, async (d) => {
      if (d.kind === "yes-no") {
        await game.seat(d.seat).no();
        return true;
      }
      if (d.kind === "pick" && d.seat === P1) {
        await game.p1.pick(d.options[0]!.key);
        return true;
      }
      return false;
    });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    return game;
  }

  // Expected (373 example, 370.2): a single Zhonya's replaces ONE death — "kill this instead" consumes
  // it — so exactly one of X / Y ends in base (healed, exhausted) and the other goes to trash; the
  // unpaid Armory shield does nothing for X. Actual: the engine lets the one Hourglass replace BOTH
  // simultaneous deaths — X and Y are both recalled to base and nobody dies.
  test("BUG: (b) Zhonya's saves exactly ONE of the two dying units — the other goes to trash (373, 370.2)", async () => {
    const game = await zeroFuryCleanup();
    const saved = ["x", "y"].filter((u) => game.zoneOf(u) === "base");
    const dead = ["x", "y"].filter((u) => game.zoneOf(u) === "trash");
    expect(saved).toHaveLength(1);
    expect(dead).toHaveLength(1);
    expect(game.state(saved[0]!).damage).toBe(0);
    expect(game.state(saved[0]!).isExhausted).toBe(true);
  });

  test("(b) the Hourglass is consumed (→ trash), whatever it saved is in base healed + exhausted, and the defender keeps bf1", async () => {
    const game = await zeroFuryCleanup();
    expect(game.zoneOf("zh")).toBe("trash");
    const saved = ["x", "y"].filter((u) => game.zoneOf(u) === "base");
    expect(saved.length).toBeGreaterThanOrEqual(1);
    for (const u of saved) {
      expect(game.state(u).damage).toBe(0);
      expect(game.state(u).isExhausted).toBe(true);
    }
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("(b) control without Zhonya's: 0 fury and no Hourglass — both attackers simply die", async () => {
    const game = await board({ fury: 0, zhonyas: false }).build();
    await shieldAndAttack(game);
    await drive(game, async (d) => {
      if (d.kind === "yes-no") {
        await game.seat(d.seat).no();
        return true;
      }
      return false;
    });
    await game.settle();
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.zoneOf("y")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  // ---- (c) single-use, this turn only ---------------------------------------------------------------

  test("(c) single-use: after the shield saves X once (paid), a second lethal hit the same turn kills X with no prompt (370.2, 373.2)", async () => {
    const game = await board({ fury: 2, zhonyas: false }).build();
    await game.p1.activate("armory", 0, { discard: "junk", targets: ["x"] });
    await game.settle();
    await game.p1.cast("bolt", { targets: "x" });
    await drive(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("x")).toBe("base");
    expect(game.state("x").damage).toBe(0);
    expect(game.p1.power("fury")).toBe(1);

    await game.p1.cast("bolt2", { targets: "x" });
    const seen = await drive(game);
    await game.settle();
    expect(seen.filter((d) => d.kind === "yes-no")).toEqual([]);
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.p1.power("fury")).toBe(1); // nothing more was paid
  });

  test("(c) 'this turn': an unused shield expires — on P2's turn X dies to a lethal hit with no [fury] prompt (365.1)", async () => {
    const game = await board({ fury: 1, zhonyas: false }).hand(P2, BOLT, "p2bolt").build();
    await game.p1.activate("armory", 0, { discard: "junk", targets: ["x"] });
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.cast("p2bolt", { targets: "x" });
    const seen = await drive(game);
    await game.settle();
    expect(seen.filter((d) => d.kind === "yes-no")).toEqual([]);
    expect(game.zoneOf("x")).toBe("trash");
  });
});
