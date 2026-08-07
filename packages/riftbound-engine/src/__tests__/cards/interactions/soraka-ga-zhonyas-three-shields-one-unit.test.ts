/**
 * Interaction: Soraka, Wanderer (sfd-173-221) — 4 Might, Order champion unit
 *     "I must be assigned combat damage last.
 *      If another unit you control here would die, if it has less Might than me, instead heal
 *      it, exhaust it, and recall it."
 *   × Guardian Angel (sfd-051-221) — Equipment, +1 Might. Appends to the wearer: "If I would die,
 *      kill Guardian Angel instead. Heal me, exhaust me, and recall me." (373.2 example text)
 *   × Zhonya's Hourglass (ogn-077-298) — Gear: "If a friendly unit would die, kill this instead.
 *      Heal that unit, exhaust it, and recall it."
 *   × Recruit token (ogn-271-298, 1 Might) and Falling Star (ogn-029-298: "Deal 3 to a unit. Deal
 *      3 to a unit.") as the kill source.
 *
 * Question: P2 has Soraka (4) and a Recruit wearing Guardian Angel (1+1 = 2) together at bf1, plus a
 * face-up Zhonya's in base. P1 resolves Falling Star for 3+3 on the Recruit (or 3 on the Recruit and
 * 3 on Soraka, who survives). Only the Recruit would die. THREE of P2's replacement effects match
 * that single event. Who chooses, is a 3-way ordering prompt required, how many are consumed?
 *
 * Rules: 372 (several replacements on one event → the controller of the affected object orders
 * them; P2 controls the Recruit AND all three sources), 370.1.b (the first one applied replaces the
 * death entirely), 370.2 (the others may still look at the replacing events — but none of those is
 * "a friendly unit would die": Soraka's is heal/exhaust/recall, GA's and Zhonya's kill a gear),
 * 369.1 / 370.1.a.1 (a replaced death never happened), 373.2 (one sequence per replacement).
 *
 * Expected: a DECISION for P2 (order / pick-first) over {Soraka, Guardian Angel, Zhonya's}; exactly
 * ONE of the three is applied, the other two are untouched.
 *   - Soraka first  → Recruit healed, exhausted, recalled to base STILL wearing GA (2 Might); GA and
 *                     Zhonya's both stay on the board — nothing is spent (the free line).
 *   - GA first      → GA to trash, Recruit (1 Might) in base exhausted, Zhonya's stays.
 *   - Zhonya's first→ Zhonya's to trash, Recruit in base exhausted still wearing GA (2 Might).
 * In every branch the Recruit ends in P2's base exhausted and undamaged, never reaches the trash,
 * and Soraka stays at bf1. Soraka only qualifies because 2 < 4; a 4-Might ally is not saved by her.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SORAKA = "sfd-173-221";
const GUARDIAN_ANGEL = "sfd-051-221";
const ZHONYAS = "ogn-077-298";
const RECRUIT = "ogn-271-298";
const FALLING_STAR = "ogn-029-298";

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", SORAKA, "soraka")
    .unit(P2, "bf1", RECRUIT, "recruit", { equippedWith: ["ga"] })
    .gear(P2, GUARDIAN_ANGEL, "ga", { attachedTo: "recruit" })
    .gear(P2, ZHONYAS, "zh")
    .hand(P1, FALLING_STAR, "fs");
}

/** Keys/cards/labels named by an order-or-pick decision, flattened. */
function offered(d: Decision | null): string[] {
  if (!d) {
    return [];
  }
  const items = d.kind === "order" ? d.items : d.kind === "pick" ? d.options : [];
  return items.flatMap((o) => [o.key, o.card ?? "", o.label]);
}

/** P1 drops 3+3 on the Recruit and everyone passes until the replacement window. */
async function sixOnRecruit(): Promise<{ game: Game; reason: string }> {
  const game = await board().build();
  expect(game.state("recruit").might).toBe(2); // 1 + Guardian Angel
  await game.p1.cast("fs", { targets: ["recruit", "recruit"] });
  const r = await game.settle();
  return { game, reason: r.reason };
}

/** If the engine asks P2 to order/pick the replacement, apply `first`; otherwise carry on. */
async function applyFirst(game: Game, first: string): Promise<void> {
  const d = game.decision();
  if (d && d.seat === P2 && (d.kind === "pick" || d.kind === "order")) {
    if (d.kind === "order") {
      const keys = d.items.map((i) => i.key);
      const k = d.items.find((i) => i.key === first || i.card === first)?.key ?? first;
      await game.p2.order([k, ...keys.filter((x) => x !== k)]);
    } else {
      await game.p2.pick(first);
    }
    await game.settle();
  }
}

describe("Soraka × Guardian Angel × Zhonya's — three replacements, one dying Recruit", () => {
  // ---- controls: each shield works on its own, and Soraka's Might condition ----------------------

  test("control: Soraka alone saves the Recruit from Falling Star (3 to each; Soraka survives with 3) — Recruit healed, exhausted, recalled", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", SORAKA, "soraka")
      .unit(P2, "bf1", RECRUIT, "recruit")
      .hand(P1, FALLING_STAR, "fs")
      .build();
    await game.p1.cast("fs", { targets: ["soraka", "recruit"] });
    await game.settle();
    expect(game.zoneOf("recruit")).toBe("base");
    expect(game.state("recruit")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("soraka")).toBe("battlefield-bf1");
    expect(game.state("soraka").damage).toBe(3);
  });

  test("control: 'less Might than me' — a 4-Might ally next to Soraka (4) is NOT saved and dies", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", SORAKA, "soraka")
      .unit(P2, "bf1", { might: 4, name: "Peer" }, "peer")
      .hand(P1, FALLING_STAR, "fs")
      .build();
    await game.p1.cast("fs", { targets: ["peer", "peer"] });
    await game.settle();
    expect(game.zoneOf("peer")).toBe("trash");
    expect(game.zoneOf("soraka")).toBe("battlefield-bf1");
  });

  // ---- the question proper -----------------------------------------------------------------------

  // Expected: one event ("Recruit would die"), three applicable replacements all controlled by P2 →
  // rule 372 hands P2 an ordering decision naming Soraka, Guardian Angel and Zhonya's.
  // Actual: no prompt — the engine silently applies Guardian Angel's replacement.
  test("BUG: P2 (controller of the Recruit and of all three effects) must be asked to order Soraka / Guardian Angel / Zhonya's (rule 372)", async () => {
    const { game, reason } = await sixOnRecruit();
    expect(reason).toBe("unanswered");
    const d = game.decision();
    expect(d?.seat).toBe(P2);
    expect(["order", "pick"]).toContain(d?.kind as string);
    const names = offered(d);
    expect(names).toEqual(expect.arrayContaining(["soraka", "ga", "zh"]));
  });

  // Expected (Soraka first, 370.1.b): the death is replaced by heal/exhaust/recall; neither GA's nor
  // Zhonya's effect finds a "would die" event in that (370.2) → Recruit in base, exhausted, 0 damage,
  // STILL wearing Guardian Angel (2 Might); GA and Zhonya's both still on the board. Nothing spent.
  // Actual: the ordering prompt never appears, GA is consumed instead.
  test("BUG: Soraka applied first — Recruit recalled exhausted still wearing GA (2 Might); GA and Zhonya's both untouched (370.1.b, 370.2)", async () => {
    const { game } = await sixOnRecruit();
    expect(game.actingSeat()).toBe(P2);
    await applyFirst(game, "soraka");
    expect(game.zoneOf("recruit")).toBe("base");
    expect(game.state("recruit")).toMatchObject({ damage: 0, isExhausted: true, might: 2 });
    expect(game.state("recruit").attachments).toEqual(["ga"]);
    expect(game.state("ga").attachedTo).toBe("recruit");
    expect(game.zoneOf("ga")).not.toBe("trash");
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.zoneOf("soraka")).toBe("battlefield-bf1");
  });

  test("Guardian Angel applied first (the engine's current default): GA goes to trash, Zhonya's stays in base, Soraka untouched — exactly ONE shield is consumed (370.2)", async () => {
    const { game } = await sixOnRecruit();
    await applyFirst(game, "ga");
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.p2.gear()).toContain("zh");
    expect(game.zoneOf("soraka")).toBe("battlefield-bf1");
    expect(game.state("soraka")).toMatchObject({ damage: 0, isExhausted: false });
    expect(game.state("recruit").attachments).toEqual([]);
    expect(game.state("recruit").might).toBe(1);
    expect(game.zoneOf("fs")).toBe("trash");
  });

  // Expected (GA first): GA's appended text is "kill Guardian Angel instead. Heal me, exhaust me, and
  // recall me" → the Recruit (now 1 Might) ends in P2's base exhausted with no damage.
  // Actual: GA is killed but the Recruit is left READY at bf1 — no exhaust, no recall.
  test("BUG: Guardian Angel applied first — the Recruit (1 Might) must end in P2's base exhausted and undamaged (373.2 GA text; 370.1.a.1)", async () => {
    const { game } = await sixOnRecruit();
    await applyFirst(game, "ga");
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("recruit")).toBe("base");
    expect(game.state("recruit")).toMatchObject({ damage: 0, isExhausted: true, might: 1 });
    expect(game.p2.units("bf1")).toEqual(["soraka"]);
  });

  // Expected (Zhonya's first): Hourglass to trash; Recruit healed, exhausted, recalled to base still
  // wearing GA (2 Might); GA and Soraka untouched. Actual: cannot reach this branch (no prompt).
  test("BUG: Zhonya's applied first — Hourglass to trash, Recruit in base exhausted still wearing GA (2 Might), GA untouched (370.1.b, 370.2)", async () => {
    const { game } = await sixOnRecruit();
    expect(game.actingSeat()).toBe(P2);
    await applyFirst(game, "zh");
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("recruit")).toBe("base");
    expect(game.state("recruit")).toMatchObject({ damage: 0, isExhausted: true, might: 2 });
    expect(game.state("recruit").attachments).toEqual(["ga"]);
    expect(game.zoneOf("ga")).not.toBe("trash");
    expect(game.zoneOf("soraka")).toBe("battlefield-bf1");
  });

  // ---- invariants that hold whichever branch is taken --------------------------------------------

  test("in every branch the death is replaced: the Recruit token still exists, is undamaged and never reaches the trash; Soraka stays at bf1; Falling Star is spent (369.1, 370.1.a.1)", async () => {
    const { game } = await sixOnRecruit();
    await applyFirst(game, "ga"); // whichever the engine offers/defaults to
    expect(game.has("recruit")).toBe(true);
    expect(game.zoneOf("recruit")).not.toBe("trash");
    expect(game.p2.trash()).not.toContain("recruit");
    expect(game.state("recruit").damage).toBe(0);
    expect(game.state("recruit").controller).toBe(P2);
    expect(game.zoneOf("soraka")).toBe("battlefield-bf1");
    expect(game.zoneOf("fs")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([]);
  });

  test("at most one of the three shields is ever consumed by the single death event — never two gear in the trash (370.2)", async () => {
    const { game } = await sixOnRecruit();
    await applyFirst(game, "ga");
    const spent = ["ga", "zh"].filter((g) => game.zoneOf(g) === "trash").length + (game.zoneOf("soraka") === "trash" ? 1 : 0);
    expect(spent).toBeLessThanOrEqual(1);
  });

  test("3 to the Recruit + 3 to Soraka: Soraka (4) survives with 3 damage and it is still ONE dying unit — same single-shield outcome, Soraka never in danger", async () => {
    const game = await board().build();
    await game.p1.cast("fs", { targets: ["soraka", "recruit"] });
    await game.settle();
    await applyFirst(game, "ga");
    expect(game.zoneOf("soraka")).toBe("battlefield-bf1");
    expect(game.state("soraka").damage).toBe(3);
    expect(game.has("recruit")).toBe(true);
    expect(game.zoneOf("recruit")).not.toBe("trash");
    const spent = ["ga", "zh"].filter((g) => game.zoneOf(g) === "trash").length;
    expect(spent).toBeLessThanOrEqual(1);
    expect(game.violations()).toEqual([]);
  });
});
