/**
 * Interaction: Piercing Light (sfd-023-221) · Spell · Fury · [2][fury] · [Action]
 *     "[Repeat] [2][fury] — Deal 2 to a unit at a battlefield, then deal 2 to up to one other unit."
 *   × The Boss (ogn-269-298) · Legend · Sett
 *     "If a buffed unit you control would die, you may pay [rainbow], exhaust me, and spend its buff to heal
 *      it, exhaust it, and recall it instead. (Send it to base. This isn't a move.)"
 *   × Counter Strike (sfd-194-221) · Spell · Calm/Body · [2] + 1 power · [Reaction]
 *     "Choose a unit. The next time that unit would be dealt damage this turn, prevent it. Draw 1."
 *
 * Question. P1's turn. P2 at bf1: buffed vanilla B (printed 1, +1 buff = 2 Might) and vanilla V (3 Might);
 * P2's legend is The Boss, ready, with power to spare. P1 casts Piercing Light paying [Repeat] [2][fury] —
 * execution 1: clause A → B, clause B → V; execution 2: clause A → B, clause B → V (4 damage instances in a
 * fixed order inside ONE chain item).
 *   (a) With no reaction, at WHICH instance is The Boss offered, and once P2 accepts (B healed + recalled to
 *       base), does execution 2's clause A ("Deal 2 to a unit AT A BATTLEFIELD") still hit B in base, while
 *       clause B ("up to one other unit", no location clause) still hits V?
 *   (b) P2 first reacts with Counter Strike naming B: does the fully-prevented first instance stop B from
 *       ever being lethal at instance 1, pushing The Boss's offer to instance 3?
 *   (c) If P2 DECLINES The Boss, does B die mid-item or only at the Cleanup?
 *
 * Rules: 820.1.d.1 / 820.3.a (Repeat executes the instructions one ADDITIONAL time inside the SAME chain
 * item; the spell is played once), 820.2.a (choices are all fixed at play), 321 / 321.1 (no Cleanup — hence
 * no death check — while a chain item resolves), 319.5 / 323.5 / 142.4.a / 142.4.b (lethal damage is marked
 * now and kills in the Cleanup after the item leaves the chain), 359.3.e.5 (an instruction whose target is
 * illegal is not followed — the rest still resolve), 437.2 / 437.3.a / 437.4 (prevented damage: the object
 * is dealt 0 and is not considered damaged at all; the one-shot shield is spent by the instance it
 * prevents), 370.1.a / 370.1.a.2 (a "would die" replacement; replaced deaths never happened, simultaneous
 * deaths resolve together), 702.2.b / 703 (spending a buff removes it), 418.1 (heal), 428.5.c (the Cleanup
 * kill is attributed to the spell).
 *
 * Expected. (a) The Boss is offered at instance 1 (B marked 2 ≥ 2 Might). Accept → [rainbow] paid, Boss
 * exhausted, buff spent (B is 1 Might, unbuffed), healed, exhausted, recalled to base. Instance 2: V 2/3.
 * Instance 3 targets B, now in base, so "at a battlefield" fails and that instruction is skipped. Instance
 * 4: V 4/3. ONE Cleanup after the spell leaves the chain: V dies, B alive in base. Marks by instance —
 * B: 2, 2, −, − ; V: −, 2, −, 4.
 * (b) Counter Strike resolves first (LIFO), P2 draws 1, the shield is armed on B. Instance 1: all 2
 * prevented, B is NOT considered damaged → no Boss offer, and the shield is spent. Instance 2: V 2/3.
 * Instance 3: B takes 2 → lethal → The Boss is offered NOW, same save. Instance 4: V 4/3. Same final board
 * as (a) — the prompt firing at instance 3 rather than 1 is the discriminator.
 * (c) Decline: B keeps 2/2 and does NOT die mid-item; instance 3 adds 2 → 4/2; in the single Cleanup B and V
 * die together. The Boss stays ready, its power unspent.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PIERCING_LIGHT = "sfd-023-221";
const THE_BOSS = "ogn-269-298";
const COUNTER_STRIKE = "sfd-194-221";

/** Execution order: clause A → B, clause B → V, run twice (820.2.a). */
const REPEAT_B_THEN_V = { repeat: 1, targets: ["b", "v"] } as const;

/**
 * P1's main phase with exactly [4] + [fury][fury] (base + Repeat) and Piercing Light in hand. P2 owns bf1
 * with the buffed 2-Might B and the 3-Might V on it, has The Boss ready, Counter Strike in hand and
 * [2] + two power (one for Counter Strike, one for The Boss).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 2 } })
    .resources(P2, { energy: 2, power: { body: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Unit B" }, "b", { buffed: true })
    .unit(P2, "bf1", { might: 3, name: "Unit V" }, "v")
    .legend(P2, THE_BOSS, "boss")
    .hand(P1, PIERCING_LIGHT, "pl")
    .hand(P2, COUNTER_STRIKE, "cs")
    .fillDecks({ main: 10, runes: 0 });
}

const isBossOffer = (d: Decision | null): boolean => d?.kind === "yes-no" && d.seat === P2 && /The Boss/.test(d.prompt);

/** Cast with Repeat and let both seats pass priority so Piercing Light starts resolving. */
async function castAndResolve(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("pl", REPEAT_B_THEN_V);
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

/** Same, but P2 answers with Counter Strike on B first and lets it resolve (LIFO) before passing. */
async function castThenCounterStrikeB(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("pl", REPEAT_B_THEN_V);
  await game.p1.passPriority();
  await game.p2.cast("cs", { targets: "b" });
  await game.p2.passPriority();
  await game.p1.passPriority(); // Counter Strike resolves
  await game.p1.passPriority();
  await game.p2.passPriority(); // Piercing Light starts resolving
  return game;
}

/** Drain to P1's open main phase, recording every non-priority prompt and answering Boss offers with `boss`. */
async function drain(game: Game, boss?: boolean): Promise<Decision[]> {
  const prompts: Decision[] = [];
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    // DESIGN.md §Pausing inside a resolving item — a Chain Item stopped at a
    // resume point shows as an `action` decision with `context: "procedure"`
    // where passing is illegal; continue it instead.
    if (d.kind === "action" && d.context === "procedure") {
      await game.resume();
      continue;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).pass();
      continue;
    }
    prompts.push(d);
    if (isBossOffer(d) && boss !== undefined) {
      await game.p2.answer(boss);
    } else {
      break;
    }
  }
  await game.settle();
  return prompts;
}

describe("Piercing Light [Repeat] × The Boss × Counter Strike — which damage instance raises the save", () => {
  // ── premise ───────────────────────────────────────────────────────────────────────────────────

  test("premise: B is a buffed 2-Might unit (printed 1) and V a 3-Might one, both at P2's bf1; the Repeat line costs [4] + [fury][fury] up front (820.1.c.1) and puts ONE chain item naming B and V on the chain", async () => {
    const game = await board().build();
    expect(game.state("b")).toMatchObject({ baseMight: 1, isBuffed: true, location: "bf1", might: 2 });
    expect(game.state("v")).toMatchObject({ isBuffed: false, location: "bf1", might: 3 });
    expect(game.state("boss")).toMatchObject({ isReady: true, zone: "legendZone" });
    expect((game.p1.option("cast", "pl")?.fields ?? []).find((f) => f.name === "repeatCount")).toMatchObject({ max: 1, min: 0 });
    await game.p1.cast("pl", REPEAT_B_THEN_V);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pl", controller: P1, targets: ["b", "v"], triggered: false, type: "spell" })]);
    expect(game.state("b").damage).toBe(0); // nothing has resolved yet (419.4.a)
    expect(game.state("v").damage).toBe(0);
  });

  test("the [Repeat] additional cost really is charged: without it the same cast leaves [2] + [fury] in the pool (820.1.c.1)", async () => {
    const game = await board().build();
    await game.p1.cast("pl", { targets: ["b", "v"] });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1 } });
  });

  // ── (a) no reaction ───────────────────────────────────────────────────────────────────────────

  test("(a) The Boss is a DAMAGE-time shield offered at instance 1: B is marked 2 on a 2-Might body — lethal damage (142.4.b) — while Piercing Light is still on the chain and V is untouched", async () => {
    const game = await castAndResolve();
    expect(isBossOffer(game.decision())).toBe(true);
    expect(game.state("b")).toMatchObject({ damage: 2, isBuffed: true, location: "bf1", might: 2 });
    expect(game.state("v").damage).toBe(0); // instance 2 has not run yet
    expect(game.zoneOf("pl")).toBe("chain"); // 321 — no Cleanup runs while the item resolves
    expect(game.actingSeat()).toBe(P2);
  });

  test("(a) accepting pays exactly [rainbow] and exhausts The Boss, spends B's buff (702.2.b / 703 → 1 Might, unbuffed) and heals it (418.1 → 0 damage)", async () => {
    const game = await castAndResolve();
    await game.p2.yes();
    expect(game.p2.power()).toBe(1); // one of the two pips is gone; energy untouched
    expect(game.p2.energy()).toBe(2);
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.state("b")).toMatchObject({ damage: 0, isBuffed: false, might: 1 });
  });

  // Expected (370.1.a): the replacement means the death never happened — B is healed, exhausted and RECALLED
  // to base, alive. Actual: the engine applies the payment and the heal/spend-buff but B still ends in the
  // trash, so the "instead" never replaces the death on this line.
  test("after accepting The Boss, B must be RECALLED to base and ALIVE — the replaced death never happened (370.1.a, 418.1)", async () => {
    const game = await castAndResolve();
    await game.p2.yes();
    await game.settle();
    expect(game.zoneOf("b")).toBe("base");
    expect(game.state("b")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true, location: "base", might: 1 });
    expect(game.p2.trash()).not.toContain("b");
  });

  // Expected (820.1.d.1 / 820.3.a): four damage instances in one chain item — B 2, V 2, (B in base: "at a
  // battlefield" fails, 359.3.e.5, skipped), V 2 more → V at 4 on a 3-Might body dies in the single Cleanup
  // after the spell leaves the chain (323.5, 428.5.c). Actual: the Repeat cost is charged but the
  // instructions run exactly once, so V is only ever dealt 2 and survives.
  test.failing("BUG: [Repeat] must run the instructions one ADDITIONAL time in the same item (820.1.d.1) — instance 4 puts V at 4 damage on 3 Might and it dies in the single Cleanup; the engine executes only once and V lives at 2", async () => {
    const game = await castAndResolve();
    await game.p2.yes();
    await game.settle();
    expect(game.state("v").damage).toBe(4);
    expect(game.zoneOf("v")).toBe("trash");
    expect(game.zoneOf("pl")).toBe("trash");
  });

  test("(a) what does happen: exactly one Boss prompt is raised, V is dealt 2 by execution 1's second clause and survives at 2/3, and P1 ends back in an open main phase with Piercing Light in the trash", async () => {
    const game = await castAndResolve();
    const prompts = await drain(game, true);
    expect(prompts.filter(isBossOffer)).toHaveLength(1);
    expect(prompts.filter((p) => p.seat === P1)).toEqual([]);
    expect(game.state("v")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
    expect(game.zoneOf("pl")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) Counter Strike first ──────────────────────────────────────────────────────────────────

  test("(b) Counter Strike is a legal Reaction on top of Piercing Light, offers both battlefield units, resolves FIRST (LIFO) and draws P2 a card — Piercing Light has still done nothing", async () => {
    const game = await board().build();
    await game.p1.cast("pl", REPEAT_B_THEN_V);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "cs")).toBe(true);
    const offered = (game.p2.option("cast", "cs")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect([...offered].toSorted()).toEqual(["b", "v"]);
    const hand = game.p2.hand().length;
    await game.p2.cast("cs", { targets: "b" });
    expect(game.chain().map((c) => c.name)).toEqual(["Piercing Light", "Counter Strike"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain().map((c) => c.name)).toEqual(["Piercing Light"]);
    expect(game.p2.hand()).toHaveLength(hand - 1 + 1); // spent Counter Strike, drew 1
    expect(game.state("b").damage).toBe(0);
  });

  test("(b) the first instance is FULLY prevented: B is dealt 0 and is not considered damaged at all (437.2 / 437.4), so The Boss is NOT offered at instance 1 — B keeps its buff and The Boss stays ready", async () => {
    const game = await castThenCounterStrikeB();
    expect(isBossOffer(game.decision())).toBe(false);
    expect(game.state("b")).toMatchObject({ damage: 0, isBuffed: true, location: "bf1", might: 2 });
    expect(game.state("boss").isReady).toBe(true);
  });

  // Expected: the shield is one-shot (437.3.a) — spent by instance 1 — so instance 3 (execution 2's clause A)
  // deals B its 2, that is lethal, and The Boss is offered THERE, for the first time in the game; B is saved
  // and recalled unbuffed and V ends at 4 and dies. Actual: no second execution runs, so the offer never
  // comes at all and B stands untouched at bf1, still buffed.
  test.failing("BUG: the one-shot prevention is spent by instance 1 (437.3.a), so The Boss must be offered at instance 3 and save B there — B recalled to base unbuffed, V dead; the engine never reaches instance 3 and never asks", async () => {
    const game = await castThenCounterStrikeB();
    const prompts = await drain(game, true);
    expect(prompts.filter(isBossOffer)).toHaveLength(1);
    expect(game.zoneOf("b")).toBe("base");
    expect(game.state("b")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true });
    expect(game.zoneOf("v")).toBe("trash");
    expect(game.state("boss").isExhausted).toBe(true);
  });

  test("(b) what does happen: no prompt of any kind, B ends unharmed and still buffed at bf1 with The Boss ready and its power unspent, V takes execution 1's 2 and survives", async () => {
    const game = await castThenCounterStrikeB();
    const prompts = await drain(game);
    expect(prompts).toEqual([]);
    expect(game.state("b")).toMatchObject({ damage: 0, isBuffed: true, zone: "battlefield-bf1" });
    expect(game.state("v")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
    expect(game.state("boss").isReady).toBe(true);
    expect(game.p2.power()).toBe(1); // Counter Strike's pip only
    expect(game.zoneOf("pl")).toBe("trash");
    expect(game.zoneOf("cs")).toBe("trash");
  });

  // ── (c) declining The Boss ────────────────────────────────────────────────────────────────────

  test("(c) declining is a real 'not applied' (371.2.b): The Boss stays READY with both power pips intact, B keeps its buff-spend un-spent and simply dies, and Piercing Light finishes in the trash", async () => {
    const game = await castAndResolve();
    await game.p2.no();
    await game.settle();
    expect(game.state("boss").isReady).toBe(true);
    expect(game.p2.resources()).toEqual({ energy: 2, power: { body: 2 } });
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("pl")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // Expected (321 / 321.1 / 359.3.e.7): B's lethal damage kills nothing while the item is still resolving,
  // so execution 1's second clause still deals 2 to V and execution 2 adds 2 more — V ends at 4 and dies in
  // the SAME single Cleanup as B (370.1.a.2, 323.5). Actual: declining kills B immediately and abandons the
  // rest of the item, so V is never dealt anything.
  test.failing("BUG: a declined save must not abort the item — B dies only in the Cleanup and the remaining instructions still run, leaving V dealt 4 and dying alongside it (321, 359.3.e.7, 370.1.a.2); the engine leaves V untouched", async () => {
    const game = await castAndResolve();
    await game.p2.no();
    await game.settle();
    expect(game.state("v").damage).toBe(4);
    expect(game.zoneOf("v")).toBe("trash");
    expect(game.p2.units("bf1")).toEqual([]);
  });

  // Narrower half of the same defect, isolated from the [Repeat] bug: even with only ONE execution, the
  // "then deal 2 to up to one other unit" clause must still resolve after B has taken lethal damage.
  test("at minimum execution 1's SECOND clause must still resolve after B's death — V is dealt its 2 (321, 359.3.e.7)", async () => {
    const game = await castAndResolve();
    await game.p2.no();
    await game.settle();
    expect(game.state("v").damage).toBeGreaterThanOrEqual(2);
  });
});
