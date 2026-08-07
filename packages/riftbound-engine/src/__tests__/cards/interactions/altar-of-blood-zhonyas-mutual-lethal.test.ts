/**
 * Interaction: Altar of Blood (unl-206-219) · Battlefield
 *     "If a unit here would die during combat, its controller may pay [rainbow][rainbow][rainbow] to
 *      heal it, exhaust it, and recall it instead."
 *   × Zhonya's Hourglass (ogn-077-298) · Gear · Calm · 2
 *     "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Question: bf1 IS Altar of Blood, held by P2 with a 3-Might defender D. P2 also has a face-up Zhonya's
 * in base and 3 power. P1 (turn player, 3 power floating) attacks with 3-Might A. Combat damage: A and D
 * deal lethal to each other and would die simultaneously.
 *   (a) Who is prompted, in what order, about what? Can P2 order D's two replacements (pick Zhonya's
 *       and keep the power, or pay at the Altar and keep the Hourglass)?
 *   (b) "No" sides: P1 with only 2 power cannot use the Altar and A dies; a unit killed at the Altar
 *       OUTSIDE combat gets no Altar prompt at all.
 *
 * Rules: 370.1.a.2 (both deaths come from the one combat-damage step → simultaneous events), 373 (each
 * event is treated separately for replacement effects), 371.2 ("may" → the controller of the effect —
 * here "its controller", the dying unit's controller — chooses whether to apply it), 372 (two
 * replacements on D's death → D's controller P2 orders them), 370.2 (once one replacement has replaced
 * the death there is no "would die" left for the other), 373.1 (applied replacements with different
 * controllers execute in TURN ORDER → P1's first), 373.1.a (the heal/exhaust/recall happens before any
 * unmodified simultaneous death).
 *
 * Expected: decisions surface first to P1 (yes/no: pay [rainbow]x3 for A), then to P2 (order/pick
 * Altar-vs-Zhonya's for D; if Altar, pay 3). Tested branch: P1 pays → A healed, exhausted, recalled to
 * P1's base, P1's pool empty; P2 picks Zhonya's → Hourglass to trash, D healed, exhausted, recalled to
 * P2's base, P2's 3 power untouched. Alternative: P2 applies the Altar and pays → D saved, Zhonya's stays.
 * Nobody is left at bf1 → P1 does not conquer. (b) P1 with 2 power: never asked, A → trash. Outside
 * combat: no Altar prompt; a P2 unit is saved by Zhonya's automatically, a P1 unit just dies.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ALTAR = "unl-206-219";
const ZHONYAS = "ogn-077-298";

/** Inline 1-energy action spell: deal 3 to a unit — a plain lethal hit outside combat. */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};

/** P1's turn. bf1 = Altar of Blood (live text) held by P2's 3-Might D; P2 has Zhonya's; P1's 3-Might A in base. */
function board(opts: { p1Power?: number; zhonyas?: boolean } = {}) {
  const s = scenario()
    .resources(P1, { energy: 1, power: { rainbow: opts.p1Power ?? 3 } })
    .resources(P2, { power: { rainbow: 3 } })
    .battlefield("bf1", { controller: P2, def: ALTAR, inert: false })
    .unit(P2, "bf1", { might: 3, name: "Defender D" }, "D")
    .unit(P1, "base", { might: 3, name: "Attacker A" }, "A")
    .hand(P1, BOLT, "bolt");
  return opts.zhonyas === false ? s : s.gear(P2, ZHONYAS, "zh");
}

interface Answers {
  p1Pay?: boolean;
  p2First?: "altar" | "zhonyas";
  p2Pay?: boolean;
}

type Logged = Pick<Decision, "seat" | "kind" | "prompt">;

/** Key of the option standing for the Altar (the battlefield card "bf1") or the Hourglass ("zh"). */
function keyFor(d: Decision, which: "altar" | "zhonyas"): string {
  const want = which === "altar" ? "bf1" : "zh";
  const opts = d.kind === "pick" ? d.options : d.kind === "order" ? d.items : [];
  const hit = opts.find((o) => o.key === want || o.card === want || o.label.includes(which === "altar" ? "Altar" : "Zhonya"));
  return hit?.key ?? want;
}

/**
 * A attacks bf1; both players pass focus; combat damage is dealt. Every non-forced prompt raised on the
 * way is answered from `answers` and logged, until the game is back in an open state.
 */
async function fight(game: Game, answers: Answers = {}): Promise<Logged[]> {
  const log: Logged[] = [];
  await game.p1.move("A", "bf1");
  for (let i = 0; i < 8; i++) {
    const r = await game.settle();
    if (r.reason !== "unanswered") {
      return log;
    }
    const d = game.decision() as Decision;
    log.push({ kind: d.kind, prompt: d.prompt, seat: d.seat });
    if (d.kind === "yes-no" && d.seat === P1) {
      await (answers.p1Pay ? game.p1.yes() : game.p1.no());
    } else if (d.kind === "yes-no" && d.seat === P2) {
      await (answers.p2Pay ? game.p2.yes() : game.p2.no());
    } else if (d.kind === "pick" && d.seat === P2) {
      await game.p2.pick(keyFor(d, answers.p2First ?? "zhonyas"));
    } else if (d.kind === "order" && d.seat === P2) {
      const first = keyFor(d, answers.p2First ?? "zhonyas");
      await game.p2.order([first, ...d.items.map((it) => it.key).filter((k) => k !== first)]);
    } else {
      throw new Error(`unexpected decision: ${JSON.stringify(d)}`);
    }
  }
  return log;
}

describe("Altar of Blood × Zhonya's Hourglass — mutual lethal in combat, two controllers, turn-order replacement prompts", () => {
  test("setup sanity: bf1 carries the Altar's text, A and D are both 3 Might, both pools hold 3 [rainbow]", async () => {
    const game = await board().build();
    expect(game.state("bf1").name).toBe("Altar of Blood");
    expect(game.state("A").might).toBe(3);
    expect(game.state("D").might).toBe(3);
    expect(game.p1.power("rainbow")).toBe(3);
    expect(game.p2.power("rainbow")).toBe(3);
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.p1.can("move")).toBe(true);
  });

  // ---- (a) the prompt sequence -------------------------------------------------------------------

  // Expected: after combat damage both units carry lethal damage; A's death has exactly one (optional,
  // costed) replacement whose chooser is A's controller P1, and P1 is the turn player, so the very
  // first prompt is P1's yes/no "pay [rainbow][rainbow][rainbow]" — before anything is done about D.
  // Actual: battlefield-card replacement abilities are never consulted; A simply dies, no prompt.
  test("BUG: (a) first prompt after combat damage is P1's optional Altar payment for A — yes/no, payable, D's side untouched yet (371.2, 373.1)", async () => {
    const game = await board().build();
    await game.p1.move("A", "bf1");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(d?.kind).toBe("yes-no");
    expect((d as Extract<Decision, { kind: "yes-no" }>).canAccept).not.toBe(false);
    // Nothing has been applied to D's event yet: turn order puts P1's replacement first (373.1).
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.zoneOf("A")).toBe("battlefield-bf1");
    expect(game.p1.power("rainbow")).toBe(3);
  });

  // Expected: paying 3 replaces A's death — A healed (0 damage), exhausted, in P1's base; pool 3 → 0.
  // Actual: no prompt; A is in P1's trash and the 3 power is never spent.
  test("BUG: (a) P1 pays [rainbow]x3 → A is healed, exhausted and recalled to P1's base instead of dying; P1's pool is drained (373.1.a)", async () => {
    const game = await board().build();
    await fight(game, { p1Pay: true, p2First: "zhonyas" });
    expect(game.zoneOf("A")).toBe("base");
    expect(game.p1.units("base")).toContain("A");
    expect(game.state("A").damage).toBe(0);
    expect(game.state("A").isExhausted).toBe(true);
    expect(game.p1.trash()).not.toContain("A");
    expect(game.p1.power("rainbow")).toBe(0);
  });

  // Expected: once P1 has answered, D's death has TWO applicable replacements (Altar: optional + cost;
  // Zhonya's: mandatory) → D's controller P2 is asked to order/pick between them (372).
  // Actual: Zhonya's is applied silently; P2 is never asked and P1 was never asked either.
  test("BUG: (a) after P1's answer, P2 (D's controller) is asked to order the Altar vs Zhonya's for D (372)", async () => {
    const game = await board().build();
    await game.p1.move("A", "bf1");
    let r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()?.seat).toBe(P1);
    await game.p1.yes();
    r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision() as Decision;
    expect(d.seat).toBe(P2);
    expect(["pick", "order"]).toContain(d.kind);
    const keys = (d.kind === "pick" ? d.options : d.kind === "order" ? d.items : []).map((o) => o.card ?? o.key);
    expect(keys).toContain("zh");
    expect(keys).toContain("bf1");
  });

  test("(a) D's side of the tested branch: Zhonya's replaces D's death — Hourglass → P2's trash, D healed + exhausted in P2's base, P2's 3 power untouched (370.1.a.1)", async () => {
    // Holds today already (Zhonya's is auto-applied); when the engine learns to ask, `fight` picks Zhonya's.
    const game = await board().build();
    await fight(game, { p1Pay: true, p2First: "zhonyas" });
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.p2.trash()).toContain("zh");
    expect(game.zoneOf("D")).toBe("base");
    expect(game.p2.units("base")).toContain("D");
    expect(game.state("D").damage).toBe(0);
    expect(game.state("D").isExhausted).toBe(true);
    expect(game.p2.power("rainbow")).toBe(3);
  });

  // Expected full end state of the tested branch: each unit saved by exactly one effect, both in their
  // controller's base exhausted, Hourglass in trash, P1 at 0 power, P2 at 3, both trash piles free of units.
  // Actual: A is in P1's trash with P1's power unspent.
  test("BUG: (a) tested branch end state — A exhausted in P1's base (paid 3), D exhausted in P2's base via Zhonya's (paid 0), Hourglass in trash", async () => {
    const game = await board().build();
    const log = await fight(game, { p1Pay: true, p2First: "zhonyas" });
    expect(log.map((l) => l.seat).slice(0, 2)).toEqual([P1, P2]); // turn order (373.1)
    expect(game.p1.units("base")).toContain("A");
    expect(game.p2.units("base")).toContain("D");
    expect(game.state("A").isExhausted).toBe(true);
    expect(game.state("D").isExhausted).toBe(true);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p2.trash()).toEqual(["zh"]);
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.p2.power("rainbow")).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  // Expected: P2 may instead apply the Altar first and pay 3 → D healed/exhausted/recalled; its death is
  // fully replaced so Zhonya's finds no "would die" (370.2) and stays on the board; P2's pool 3 → 0.
  // Actual: no ordering prompt; Zhonya's is consumed and P2 keeps the power.
  test("BUG: (a) alternative branch — P2 orders the Altar first and pays: D saved, Zhonya's Hourglass STAYS in base, P2's pool drained (372, 370.2)", async () => {
    const game = await board().build();
    await fight(game, { p1Pay: true, p2First: "altar", p2Pay: true });
    expect(game.zoneOf("D")).toBe("base");
    expect(game.state("D").isExhausted).toBe(true);
    expect(game.state("D").damage).toBe(0);
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.p2.gear()).toContain("zh");
    expect(game.p2.power("rainbow")).toBe(0);
  });

  // Expected: P1 may decline (371.2) — then A's death is unmodified: A → P1's trash, power kept.
  // Actual: the outcome matches but only because P1 is never asked; the prompt assertion fails.
  test("BUG: (a) P1 is asked and DECLINES → A dies to P1's trash and P1 keeps the 3 power (371.2.b)", async () => {
    const game = await board().build();
    const log = await fight(game, { p1Pay: false, p2First: "zhonyas" });
    expect(log[0]).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.p1.power("rainbow")).toBe(3);
  });

  test("(a) with both units recalled/removed nobody remains at bf1 — P1 does not conquer or score, bf1 is not P1's (466.3.d, 466.5.b)", async () => {
    const game = await board().build();
    await fight(game, { p1Pay: true, p2First: "zhonyas" });
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller ?? null).not.toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
  });

  // ---- (b) the "no" sides ------------------------------------------------------------------------

  test("(b) P1 with only 2 [rainbow]: the Altar's cost is unpayable → P1 is never prompted, A dies to trash, the 2 power stays", async () => {
    const game = await board({ p1Power: 2 }).build();
    const log = await fight(game, { p2First: "zhonyas" });
    expect(log.filter((l) => l.seat === P1)).toEqual([]);
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.p1.trash()).toContain("A");
    expect(game.p1.power("rainbow")).toBe(2);
    // P2's side is unchanged by P1's poverty: D is still saved (here by Zhonya's).
    expect(game.zoneOf("D")).toBe("base");
  });

  test("(b) outside combat — P1 bolts P2's D at the Altar in the action phase: no prompt for anyone; Zhonya's (mandatory) saves D automatically; P2's power untouched", async () => {
    const game = await board().build();
    await game.p1.cast("bolt", { targets: "D" });
    const r = await game.settle();
    expect(r.reason).toBe("open"); // straight back to P1's main phase — no yes/no, no ordering
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("D")).toBe("base");
    expect(game.state("D").isExhausted).toBe(true);
    expect(game.state("D").damage).toBe(0);
    expect(game.p2.power("rainbow")).toBe(3);
  });

  test("(b) outside combat, no Zhonya's — D bolted at the Altar just dies: no Altar prompt although P2 could pay ('during combat' is false)", async () => {
    const game = await board({ zhonyas: false }).build();
    await game.p1.cast("bolt", { targets: "D" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.p2.power("rainbow")).toBe(3);
  });

  test("(b) outside combat — P1 bolts its OWN unit sitting at the Altar: nothing applies to a P1 unit, it dies with no prompt and P1 keeps its power", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { rainbow: 3 } })
      .battlefield("bf1", { controller: P1, def: ALTAR, inert: false })
      .unit(P1, "bf1", { might: 3, name: "Own Unit" }, "A")
      .gear(P2, ZHONYAS, "zh") // enemy Hourglass: irrelevant to a P1 unit
      .hand(P1, BOLT, "bolt")
      .build();
    await game.p1.cast("bolt", { targets: "A" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("A")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.p1.power("rainbow")).toBe(3);
  });
});
