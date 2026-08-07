/**
 * Interaction: Soraka, Wanderer (sfd-173-221) — 4 Might champion unit, Order
 *     "I must be assigned combat damage last.
 *      If another unit you control here would die, if it has less Might than me, instead heal
 *      it, exhaust it, and recall it. (Send it to base. This isn't a move.)"
 *   × Zhonya's Hourglass (ogn-077-298) — Gear
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Firestorm (ogs-002-024) — Spell, 6 + [fury]: "Deal 3 to all enemy units at a battlefield."
 *   (+ Recruit token ogn-271-298 (1 Might), Vanguard Sergeant ogn-219-298 (4 Might vanilla))
 *
 * Question: P2 holds bf1 with Soraka (4), a Recruit (1) and a Vanguard Sergeant (4, already
 * carrying 1 damage); P2 has one Zhonya's Hourglass in base. P1 casts Firestorm at bf1. Soraka
 * takes 3 and lives; the Recruit (3 ≥ 1) and the Sergeant (1+3 ≥ 4) would die simultaneously.
 * Is P2 prompted so that Soraka saves the Recruit and Zhonya's is routed to the Sergeant (both
 * survive)? Is Soraka ever an option for the Sergeant? What if Zhonya's is burnt on the Recruit?
 *
 * Rules:
 *   370.1.a.2  both deaths result from one game action (Firestorm's single damage instruction)
 *              → simultaneous events.
 *   373        simultaneous events are treated separately for replacement effects; effects with
 *              the same controller (P2 controls Soraka and Zhonya's) are applied in the order of
 *              P2's choosing — the CR's own example is "two units die in the same cleanup, that
 *              player also controls Zhonya's Hourglass: they must decide which event to apply
 *              Zhonya's to first" → a DECISION must be surfaced to P2.
 *   372        Recruit's event has two applicable replacements {Soraka, Zhonya's} → P2 orders.
 *   Card text  "less Might than me": Sergeant 4 vs Soraka 4 is not less → Soraka is NOT an
 *              applicable replacement for the Sergeant's event; only Zhonya's is.
 *   373.2      Soraka's effect may cover any number of qualifying simultaneous events in its one
 *              sequence; Zhonya's kills itself as part of its instruction, so once applied it is
 *              off the board (365.1) and cannot apply to a second event (370.2).
 *   373.1.a    the heal/exhaust/recall of replaced deaths executes before any unmodified death.
 *   370.4      (Soraka survives here anyway, but would still apply if she were dying too.)
 *
 * Expected rule-correct line: Soraka → Recruit (healed, exhausted, recalled), Zhonya's → Sergeant
 * (Hourglass killed → trash; Sergeant healed to 0, exhausted, recalled). End state: Recruit and
 * Sergeant in P2's base exhausted/undamaged, Zhonya's the only card in P2's trash, Soraka alone at
 * bf1 with 3 damage, P2 still controls bf1. Legal-but-worse branch: Zhonya's applied to the
 * Recruit first → Recruit saved by Zhonya's, Hourglass gone, nothing can save the Sergeant → trash.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SORAKA = "sfd-173-221";
const ZHONYAS = "ogn-077-298";
const FIRESTORM = "ogs-002-024";
const RECRUIT = "ogn-271-298";
const VANGUARD_SERGEANT = "ogn-219-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1's turn. P2 holds bf1 with Soraka, a Recruit and a pre-damaged Sergeant; optional Zhonya's. */
function board(opts: { zhonyas: boolean; soraka?: boolean } = { zhonyas: true }) {
  let s = scenario()
    .resources(P1, { energy: 6, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 });
  if (opts.soraka !== false) {
    s = s.unit(P2, "bf1", SORAKA, "soraka");
  }
  s = s
    .unit(P2, "bf1", RECRUIT, "recruit")
    .unit(P2, "bf1", VANGUARD_SERGEANT, "sergeant", { damage: 1 })
    .hand(P1, FIRESTORM, "storm");
  return opts.zhonyas ? s.gear(P2, ZHONYAS, "zh") : s;
}

/** Cards named by the options of the current pick/order decision. */
function decisionCards(game: Game): string[] {
  const d = game.decision();
  if (d?.kind === "pick") {
    return d.options.map((o) => o.card ?? o.key);
  }
  if (d?.kind === "order") {
    return d.items.map((o) => o.card ?? o.key);
  }
  return [];
}

/**
 * Cast Firestorm at bf1 and settle. Whenever P2 is asked to order/assign replacements, answer
 * with `prefer` (Soraka or Zhonya's) if offered, else the first option. Returns once the game is
 * back in P1's open main phase.
 */
async function firestormAndRoute(game: Game, prefer: "soraka" | "zh"): Promise<number> {
  await game.p1.cast("storm", { targets: "bf1" });
  let prompts = 0;
  for (let i = 0; i < 10; i++) {
    const r = await game.settle();
    if (r.reason !== "unanswered") {
      break;
    }
    const d = game.decision();
    expect(d?.seat).toBe(P2);
    prompts++;
    if (d?.kind === "pick") {
      const want = d.options.find((o) => o.card === prefer || o.key === prefer) ?? d.options[0];
      await game.p2.pick(want?.key as string);
    } else if (d?.kind === "order") {
      const keys = d.items.map((o) => o.key);
      const first = d.items.find((o) => o.card === prefer || o.key === prefer)?.key;
      await game.p2.order(first ? [first, ...keys.filter((k) => k !== first)] : keys);
    } else {
      throw new Error(`unexpected ${d?.kind} prompt for ${d?.seat}: ${d?.prompt}`);
    }
  }
  expect(game.violations()).toEqual([]);
  return prompts;
}

describe("Soraka, Wanderer × Zhonya's Hourglass × Firestorm — per-event replacement routing with a Might gate", () => {
  test("Firestorm (6 + [fury]) deals 3 to every ENEMY unit at bf1: Soraka takes 3 and survives; the spell goes to P1's trash", async () => {
    const game = await board({ zhonyas: true }).build();
    await firestormAndRoute(game, "soraka");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("storm")).toBe("trash");
    expect(game.zoneOf("soraka")).toBe("battlefield-bf1");
    expect(game.state("soraka").damage).toBe(3);
  });

  test("control (no Zhonya's): Soraka replaces the Recruit's death (1 < 4) but NOT the Sergeant's (4 is not less than 4) — Recruit exhausted in base, Sergeant in trash", async () => {
    const game = await board({ zhonyas: false }).build();
    const prompts = await firestormAndRoute(game, "soraka");
    expect(prompts).toBe(0); // one applicable replacement per event → nothing to order
    expect(game.zoneOf("recruit")).toBe("base");
    expect(game.state("recruit")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("sergeant")).toBe("trash");
    expect(game.p2.trash()).toEqual(["sergeant"]);
    expect(game.zoneOf("soraka")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  // Expected: with two P2-controlled replacements applicable to the Recruit's death (Soraka and
  // Zhonya's) and Zhonya's also applicable to the Sergeant's simultaneous death, rule 373 (its own
  // Zhonya's example) / 372 require P2 to choose the order → a P2 decision naming Soraka and the
  // Hourglass. Actual: the engine resolves the whole cleanup silently — no prompt is surfaced.
  test("BUG: P2 (controller of both replacements) should be prompted to order/assign Soraka vs Zhonya's for the simultaneous deaths (373, 372)", async () => {
    const game = await board({ zhonyas: true }).build();
    await game.p1.cast("storm", { targets: "bf1" });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()?.seat).toBe(P2);
    expect(["pick", "order"]).toContain(game.decision()?.kind as string);
    const offered = decisionCards(game);
    expect(offered).toContain("soraka");
    expect(offered).toContain("zh");
  });

  test("rule-correct line (P2 routes Soraka → Recruit, Zhonya's → Sergeant): both survive in base exhausted and undamaged, Hourglass is the only card in P2's trash (373.2, 373.1.a)", async () => {
    const game = await board({ zhonyas: true }).build();
    await firestormAndRoute(game, "soraka");
    expect(game.zoneOf("recruit")).toBe("base");
    expect(game.state("recruit")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("sergeant")).toBe("base");
    expect(game.state("sergeant")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.p2.trash()).toEqual(["zh"]);
    expect([...game.p2.base()].sort()).toEqual(["recruit", "sergeant"]);
  });

  test("rule-correct line: Soraka stays alone at bf1 with 3 damage and P2 keeps control of bf1 (recall is not a move, 456)", async () => {
    const game = await board({ zhonyas: true }).build();
    await firestormAndRoute(game, "soraka");
    expect(game.p2.units("bf1")).toEqual(["soraka"]);
    expect(game.state("soraka")).toMatchObject({ damage: 3, isExhausted: false });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.unitsMovedThisTurn?.[P2] ?? 0).toBe(0);
    expect(game.p1.points()).toBe(0);
    expect(game.chain()).toEqual([]);
  });

  // Expected: if P2 applies Zhonya's to the Recruit's event first, the Hourglass kills itself
  // saving the Recruit; it is then off the board (365.1) and already applied (370.2), Soraka's
  // "less Might than me" is false for the Sergeant → the Sergeant's death is unmodified → trash.
  // Actual: no prompt exists, so this legal-but-worse branch cannot be chosen; the engine also
  // lets one Hourglass replace both deaths (see next test), so the Sergeant never dies.
  test("BUG: alternate legal branch — P2 burns Zhonya's on the Recruit first → Recruit saved by the Hourglass, Sergeant dies to trash (365.1, 370.2)", async () => {
    const game = await board({ zhonyas: true }).build();
    const prompts = await firestormAndRoute(game, "zh");
    expect(prompts).toBeGreaterThanOrEqual(1);
    expect(game.zoneOf("recruit")).toBe("base");
    expect(game.state("recruit")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("sergeant")).toBe("trash");
    expect([...game.p2.trash()].sort()).toEqual(["sergeant", "zh"]);
    expect(game.zoneOf("soraka")).toBe("battlefield-bf1");
  });

  // Expected: without Soraka, ONE Hourglass can replace only ONE of the two simultaneous deaths
  // ("kill this instead" removes it from the board — 365.1; a replacement applies once — 370.2);
  // P2 picks which (373 example) and the other unit dies. Actual: the engine matches the Hourglass
  // against every death in the batch before executing any, so both units are healed/recalled and
  // nobody dies — a single Zhonya's saves two units.
  test("BUG: a single Zhonya's Hourglass must not save two simultaneously dying units — exactly one of Recruit/Sergeant survives, the other goes to trash (373, 370.2, 365.1)", async () => {
    const game = await board({ soraka: false, zhonyas: true }).build();
    await firestormAndRoute(game, "zh");
    expect(game.zoneOf("zh")).toBe("trash");
    const saved = ["recruit", "sergeant"].filter((c) => game.zoneOf(c) === "base");
    const dead = ["recruit", "sergeant"].filter((c) => game.zoneOf(c) === "trash");
    expect(saved).toHaveLength(1);
    expect(dead).toHaveLength(1);
  });

  // Expected: same board as above — 373's own example says P2 "must decide which event to apply
  // Zhonya's Hourglass to first", i.e. a P2 decision between the Recruit and the Sergeant.
  // Actual: no decision; both are silently saved.
  test("BUG: without Soraka, P2 should be asked which dying unit the lone Hourglass saves (373 example)", async () => {
    const game = await board({ soraka: false, zhonyas: true }).build();
    await game.p1.cast("storm", { targets: "bf1" });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()?.seat).toBe(P2);
    expect(["pick", "order"]).toContain(game.decision()?.kind as string);
    expect([...decisionCards(game)].sort()).toEqual(expect.arrayContaining(["recruit", "sergeant"]));
  });
});
