/**
 * Interaction: Kraken Hunter (ogn-150-298) × Vaults of Helia (unl-219-219)
 *
 *   Kraken Hunter — Unit · Body · 3 + [body][body] · 5 Might
 *     "[Accelerate] (You may pay [1][body] as an additional cost to have me enter ready.) [Assault]
 *      As you play me, you may spend any number of buffs as an additional cost. Reduce my cost by [body] for each buff
 *      you spend."                                                                              — P1's hand
 *   Vaults of Helia — Battlefield · "When you hold here, your non-token units cost [1] more to play this turn."
 *                                                                                                — held by P1 this turn
 *   b1 (on the Vaults) and b2/b3/b4 (base) — four BUFFED vanilla P1 units (the buffs to spend).
 *
 * Rules: 355.1.a (optional additional costs are declared as the card is played), 356.1 (base cost [3][body][body]),
 * 356.2.b / 356.2.b.1 (additional costs: Accelerate +[1][body]; "spend N buffs" is a non-standard additional cost),
 * 356.3 (increases: Vaults +[1]), 356.4.b / 356.4.f / 356.4.f.1 (Kraken's own −[body] per buff applies to the total
 * Power and may eat the Accelerate pip — an additional cost discounted to nothing still counts as PAID), 356.6 (a
 * cost component cannot go below 0; a Power discount never touches Energy), 357.2 (single payment: energy + power +
 * the buffs are removed), 805.1.a.1 / 805.2 / 805.6 (Accelerate: [1] + [C] of MY domain → enter ready), 143.4 (units
 * otherwise enter exhausted), 745 / 702.2.b (spending a buff removes it).
 *
 * Question: after holding the Vaults, P1 (four buffed units) plays Kraken Hunter. (a) Accelerate + 3 buffs: payment,
 * and ready even though the Accelerate [body] was discounted away? (b) Accelerate + 2 buffs? (c) Accelerate + 4 buffs
 * — cheaper energy / negative power? is the 4th buff still removed? (d) baseline: no Vaults, no Accelerate, 2 buffs.
 * (e) can off-domain power stand in for a remaining [body] pip?
 *
 * Expected: total = [3][body][body] (+[1][body] Accelerate) +[1] Vaults − [body]×buffs, Power floored at 0, Energy never
 * discounted. (a) 5 energy + 0 power, 3 buffs gone, enters READY. (b) 5 energy + [body], ready. (c) still 5 energy + 0
 * power (the surplus discount is lost — 4 energy is NOT enough), all 4 buffs removed, ready. (d) 3 energy + 0 power,
 * exhausted. (e) No — a remaining pip must be BODY; calm is never accepted or spent.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KRAKEN_HUNTER = "ogn-150-298";
const VAULTS = "unl-219-219";
const BUFFS = ["b1", "b2", "b3", "b4"] as const;

/** P2 is about to end turn 2; P1 controls the Vaults (b1 standing on it) and has three more buffed units in base. */
function aboutToHold() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("vaults", { controller: P1, def: VAULTS, inert: false })
    .unit(P1, "vaults", { might: 2, name: "Holder b1" }, "b1", { buffed: true })
    .unit(P1, "base", { might: 1, name: "Buffed b2" }, "b2", { buffed: true })
    .unit(P1, "base", { might: 1, name: "Buffed b3" }, "b3", { buffed: true })
    .unit(P1, "base", { might: 1, name: "Buffed b4" }, "b4", { buffed: true })
    .hand(P1, KRAKEN_HUNTER, "kh")
    .fillDecks({ main: 10, runes: 0 }); // no channel noise — the pool is injected explicitly
}

/** Baseline board: P1's own turn 2, Vaults never held (inert, uncontested), same four buffed units. */
function baseline() {
  return scenario()
    .unit(P1, "base", { might: 2, name: "Holder b1" }, "b1", { buffed: true })
    .unit(P1, "base", { might: 1, name: "Buffed b2" }, "b2", { buffed: true })
    .unit(P1, "base", { might: 1, name: "Buffed b3" }, "b3", { buffed: true })
    .unit(P1, "base", { might: 1, name: "Buffed b4" }, "b4", { buffed: true })
    .hand(P1, KRAKEN_HUNTER, "kh");
}

/**
 * P2 ends the turn → P1 holds the Vaults (+1 point, surcharge trigger resolves) → P1's open main phase with exactly
 * `pool`. (The engine currently raises a spurious "choose a target" for the Vaults trigger — answered with anything.)
 */
async function heldWith(pool: { energy?: number; power?: Record<string, number> }): Promise<Game> {
  const game = await aboutToHold().build();
  await game.p2.endTurn();
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "vaults") {
      await game.p1.pick(d.options[0]!.key);
    } else {
      break;
    }
  }
  const s = await game.settle();
  expect(s.reason).toBe("open");
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("main");
  expect(game.p1.points()).toBe(1);
  expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  await game.p1.do("addResources", pool);
  return game;
}

/** Play Kraken Hunter naming exactly which additional costs are paid (rule 355.1.a). */
async function playKraken(game: Game, opts: { accelerate: boolean; spend: readonly string[] }): Promise<void> {
  const paid: Record<string, true | readonly string[]> = { "spend-buff-any": opts.spend };
  if (opts.accelerate) {
    paid.accelerate = true;
  }
  await game.p1.play("kh", { costs: { paid }, to: "base" });
  await game.settle();
  expect(game.zoneOf("kh")).toBe("base");
}

/** The (accelerate?, buffs-spent) combinations the play menu offers right now. */
function offeredCombos(game: Game): { accelerate: boolean; spend: string[] }[] {
  return (game.p1.option("play", "kh")?.variants ?? []).map((v) => {
    const costs = (v.params.costs ?? {}) as { paid?: Record<string, unknown> };
    return { accelerate: Boolean(costs.paid?.accelerate), spend: [...((v.params.spentBuffIds as string[] | undefined) ?? [])].sort() };
  });
}
const offers = (game: Game, accelerate: boolean, n: number) => offeredCombos(game).some((c) => c.accelerate === accelerate && c.spend.length === n);
const buffsLeft = (game: Game) => BUFFS.filter((b) => game.state(b).isBuffed);

describe("setup — the Vaults hold and its surcharge", () => {
  // BUG — expected: "your non-token units cost [1] more to play this turn" involves no choice at all; the hold trigger
  // should finalize/resolve without asking anything. Actual: P1 is asked to "Choose a target for Vaults of Helia" among
  // its board units before the trigger resolves (the surcharge itself is applied correctly afterwards).
  test("holding the Vaults asks P1 for NO target — the surcharge is a blanket rider on P1's unit plays", async () => {
    const game = await aboutToHold().build();
    await game.p2.endTurn();
    const d = game.decision();
    expect(d?.kind === "pick" && d.source?.cardId === "vaults").toBe(false);
  });

  test("after the hold, WITHOUT Accelerate and spending 2 buffs Kraken Hunter costs 3 + 1 (Vaults) = 4 energy and 0 power: not playable on 3, playable on 4 (pool drained), enters EXHAUSTED (143.4)", async () => {
    const short = await heldWith({ energy: 3 });
    expect(offers(short, false, 2)).toBe(false);
    expect((await short.p1.try((p) => p.play("kh", { costs: { paid: { "spend-buff-any": ["b2", "b3"] } }, to: "base" }))).ok).toBe(false);
    expect(short.zoneOf("kh")).toBe("hand");

    const game = await heldWith({ energy: 4 });
    expect(offers(game, false, 2)).toBe(true);
    await playKraken(game, { accelerate: false, spend: ["b2", "b3"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("kh")).toMatchObject({ isExhausted: true, might: 5 });
    expect(buffsLeft(game)).toEqual(["b1", "b4"]);
  });
});

describe("(a) Accelerate + 3 buffs after the hold: [3]+[1]+[1] = 5 energy, [body]×3 − 3 = 0 power, enters READY", () => {
  test("with 5 energy and NO power at all the Accelerate + 3-buff play IS offered (0 power needed) — and Accelerate with fewer than 3 buffs is not", async () => {
    const game = await heldWith({ energy: 5 });
    expect(offers(game, true, 3)).toBe(true);
    expect(offers(game, true, 4)).toBe(true);
    expect(offers(game, true, 2)).toBe(false); // would still need one [body]
    expect(offers(game, true, 1)).toBe(false);
    expect(offers(game, true, 0)).toBe(false);
  });

  test("with a spare body in the pool: exactly 5 energy is charged (3 + 1 Accelerate + 1 Vaults), the calm is untouched, the three named buffs are removed, the 4th stays, and Kraken Hunter enters READY", async () => {
    const game = await heldWith({ energy: 5, power: { body: 1, calm: 1 } });
    await playKraken(game, { accelerate: true, spend: ["b2", "b3", "b4"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("calm")).toBe(1);
    expect(buffsLeft(game)).toEqual(["b1"]);
    expect(game.state("kh")).toMatchObject({ isReady: true, might: 5, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  // BUG — expected (356.4.f): "Reduce my cost by [body] for each buff" discounts the TOTAL Power, Accelerate's [body]
  // included, so 3 buffs bring [body]×3 to 0 and NO body is taken from the pool. Actual: the discount is only applied to
  // the printed [body][body]; the Accelerate pip is charged from the pool anyway (body 1 → 0) — P1 overpays one body and
  // the third buff bought nothing.
  test("with a spare body in the pool NO power is spent — the 3rd buff pays Accelerate's [body] pip (356.4.f)", async () => {
    const game = await heldWith({ energy: 5, power: { body: 1, calm: 1 } });
    await playKraken(game, { accelerate: true, spend: ["b2", "b3", "b4"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 1, calm: 1 } });
  });

  // BUG — expected: with NO body in the pool the (offered!) Accelerate + 3-buff play still pays Accelerate — [1] energy,
  // its [body] discounted to 0 — so 5 energy total and, per 356.4.f.1 / 805.6, Kraken Hunter enters READY. Actual: the
  // engine executes the variant but silently drops Accelerate: only 4 energy is charged and it enters EXHAUSTED.
  test("with no body in the pool the declared Accelerate is honoured — 5 energy charged and Kraken Hunter enters READY (356.4.f.1, 805.6)", async () => {
    const game = await heldWith({ energy: 5 });
    await playKraken(game, { accelerate: true, spend: ["b2", "b3", "b4"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("kh")).toMatchObject({ isExhausted: false, isReady: true, might: 5, zone: "base" });
  });

  test("even in the buggy no-body execution the three declared buffs ARE removed and nothing goes negative", async () => {
    const game = await heldWith({ energy: 5 });
    await playKraken(game, { accelerate: true, spend: ["b2", "b3", "b4"] });
    expect(buffsLeft(game)).toEqual(["b1"]);
    expect(game.p1.energy()).toBeGreaterThanOrEqual(0);
    expect(Object.values(game.p1.resources().power).every((v) => v >= 0)).toBe(true);
  });

  test("contrast inside (a): the very same board WITHOUT declaring Accelerate (3 buffs) is 4 energy, 0 power, exhausted — so the READY/5-energy outcome hinges on the declaration alone", async () => {
    const game = await heldWith({ energy: 4, power: { calm: 1 } });
    expect(offers(game, false, 3)).toBe(true);
    await playKraken(game, { accelerate: false, spend: ["b2", "b3", "b4"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 1 } });
    expect(game.state("kh").isExhausted).toBe(true);
    expect(buffsLeft(game)).toEqual(["b1"]);
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) Accelerate + 2 buffs after the hold: 5 energy + ONE [body], ready", () => {
  test("needs a real [body]: not offered with 5 energy and no body; offered once 1 body is in the pool", async () => {
    const none = await heldWith({ energy: 5, power: { calm: 2 } });
    expect(offers(none, true, 2)).toBe(false);
    const game = await heldWith({ energy: 5, power: { body: 1 } });
    expect(offers(game, true, 2)).toBe(true);
  });

  test("payment: 5 energy + 1 body (calm untouched), b2/b3 lose their buffs, b1/b4 keep theirs, enters READY", async () => {
    const game = await heldWith({ energy: 5, power: { body: 1, calm: 1 } });
    await playKraken(game, { accelerate: true, spend: ["b2", "b3"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, calm: 1 } });
    expect(buffsLeft(game)).toEqual(["b1", "b4"]);
    expect(game.state("kh").isReady).toBe(true);
  });

  test("4 energy is one short even with plenty of body (the Vaults +[1] is real): Accelerate + 2 buffs not offered / rejected", async () => {
    const game = await heldWith({ energy: 4, power: { body: 3 } });
    expect(offers(game, true, 2)).toBe(false);
    expect((await game.p1.try((p) => p.play("kh", { costs: { paid: { accelerate: true, "spend-buff-any": ["b2", "b3"] } }, to: "base" }))).ok).toBe(false);
    expect(game.zoneOf("kh")).toBe("hand");
    expect(buffsLeft(game)).toEqual([...BUFFS]); // nothing spent on a play that did not happen
  });
});

describe("(c) Accelerate + 4 buffs: the 4th [body] of discount is lost to the floor (356.6) — energy is NOT reduced, power is not negative, the buff is still spent", () => {
  test("with only 4 energy the Accelerate + 4-buff play is NOT legal — the surplus power discount does not spill into energy", async () => {
    const game = await heldWith({ energy: 4, power: { body: 1, calm: 1 } });
    expect(offers(game, true, 4)).toBe(false);
    expect((await game.p1.try((p) => p.play("kh", { costs: { paid: { accelerate: true, "spend-buff-any": [...BUFFS] } }, to: "base" }))).ok).toBe(false);
    expect(game.zoneOf("kh")).toBe("hand");
    expect(buffsLeft(game)).toEqual([...BUFFS]);
  });

  test("with 5 energy (+ a spare body) it is legal: the FULL 5 energy is charged, calm untouched, nothing driven below zero, and it enters READY", async () => {
    const game = await heldWith({ energy: 5, power: { body: 1, calm: 1 } });
    expect(offers(game, true, 4)).toBe(true);
    await playKraken(game, { accelerate: true, spend: [...BUFFS] });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("calm")).toBe(1);
    expect(Object.values(game.p1.resources().power).every((v) => v >= 0)).toBe(true);
    expect(game.state("kh").isReady).toBe(true);
  });

  test("all FOUR buffs are removed — a declared additional cost is paid in full even when the 4th buys nothing (357.2, 745)", async () => {
    const game = await heldWith({ energy: 5, power: { body: 1, calm: 1 } });
    await playKraken(game, { accelerate: true, spend: [...BUFFS] });
    expect(buffsLeft(game)).toEqual([]);
    expect(game.state("kh")).toMatchObject({ isBuffed: false, might: 5, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  // BUG — expected (356.4.f / 356.6): four buffs more than cover [body]×3, so 0 power is paid and the spare body stays in
  // the pool. Actual: Accelerate's [body] is still taken from the pool (body 1 → 0) — same defect as in (a).
  test("Accelerate + 4 buffs spends NO power — the spare body stays in the pool (356.4.f)", async () => {
    const game = await heldWith({ energy: 5, power: { body: 1, calm: 1 } });
    await playKraken(game, { accelerate: true, spend: [...BUFFS] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 1, calm: 1 } });
  });

  // BUG — expected: with no body in the pool at all, Accelerate + 4 buffs is still 5 energy + 0 power and READY. Actual:
  // 4 energy charged, enters exhausted (Accelerate dropped), although all four buffs are removed.
  test("with no body in the pool Accelerate + 4 buffs still charges 5 energy and enters READY (356.4.f.1, 805.6)", async () => {
    const game = await heldWith({ energy: 5 });
    await playKraken(game, { accelerate: true, spend: [...BUFFS] });
    expect(buffsLeft(game)).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("kh")).toMatchObject({ isExhausted: false, isReady: true });
  });
});

describe("(d) baseline — Vaults NOT held, no Accelerate, 2 buffs: 3 energy + 0 power, enters exhausted", () => {
  test("on P1's own turn with no surcharge: exactly 3 energy and no power suffices; b2/b3 spent; EXHAUSTED (143.4)", async () => {
    const game = await baseline().resources(P1, { energy: 3 }).build();
    expect(offers(game, false, 2)).toBe(true);
    await playKraken(game, { accelerate: false, spend: ["b2", "b3"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("kh")).toMatchObject({ isExhausted: true, might: 5, zone: "base" });
    expect(buffsLeft(game)).toEqual(["b1", "b4"]);
  });

  test("baseline Accelerate + 2 buffs with 1 body: 3 + 1 = 4 energy + [body], READY — one energy less than the same play after the hold", async () => {
    const game = await baseline().resources(P1, { energy: 4, power: { body: 1 } }).build();
    expect(offers(game, true, 2)).toBe(true);
    await playKraken(game, { accelerate: true, spend: ["b2", "b3"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.state("kh").isReady).toBe(true);
    expect(buffsLeft(game)).toEqual(["b1", "b4"]);
  });

  test("baseline Accelerate + 3 buffs is offered at 4 energy + 0 power (no Vaults +1) and not at 3", async () => {
    const game = await baseline().resources(P1, { energy: 4 }).build();
    expect(offers(game, true, 3)).toBe(true);
    const short = await baseline().resources(P1, { energy: 3 }).build();
    expect(offers(short, true, 3)).toBe(false);
    expect(offers(short, false, 3)).toBe(true); // without Accelerate 3 energy is enough
  });

  // BUG — expected: baseline Accelerate + 3 buffs pays 4 energy + 0 power and enters READY (356.4.f.1, 805.6). Actual:
  // 3 energy is charged and it enters exhausted — the Vaults are not involved; the defect is Accelerate-with-a-
  // discounted-pip on its own.
  test("baseline Accelerate + 3 buffs charges 4 energy and enters READY (356.4.f.1) — independent of the Vaults", async () => {
    const game = await baseline().resources(P1, { energy: 4 }).build();
    await playKraken(game, { accelerate: true, spend: ["b2", "b3", "b4"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("kh").isReady).toBe(true);
  });
});

describe("(e) any [body] pip that remains must be BODY power — off-domain power is never accepted (805.1.a.1)", () => {
  test("after the hold with 5 energy + 3 CALM (no body): every offered variant needs 0 power — plain ≥ 2 buffs, Accelerate ≥ 3 buffs; nothing that would leave a [body] pip to pay", async () => {
    const game = await heldWith({ energy: 5, power: { calm: 3 } });
    const combos = offeredCombos(game);
    expect(combos.length).toBeGreaterThan(0);
    expect(combos.filter((c) => !c.accelerate).every((c) => c.spend.length >= 2)).toBe(true);
    expect(combos.filter((c) => c.accelerate).every((c) => c.spend.length >= 3)).toBe(true);
    expect(offers(game, false, 1)).toBe(false); // [body] left over
    expect(offers(game, true, 2)).toBe(false); // Accelerate's [body] left over
  });

  test("forcing Accelerate + 2 buffs with calm only is rejected; nothing is spent and the buffs stay", async () => {
    const game = await heldWith({ energy: 5, power: { calm: 3 } });
    const t = await game.p1.try((p) => p.play("kh", { costs: { paid: { accelerate: true, "spend-buff-any": ["b2", "b3"] } }, to: "base" }));
    expect(t.ok).toBe(false);
    expect(game.zoneOf("kh")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 5, power: { calm: 3 } });
    expect(buffsLeft(game)).toEqual([...BUFFS]);
  });

  test("and when a legal all-discounted variant IS taken with calm in the pool (plain, 2 buffs → 4 energy), the calm is never touched", async () => {
    const game = await heldWith({ energy: 4, power: { calm: 3 } });
    await playKraken(game, { accelerate: false, spend: ["b2", "b3"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 3 } });
    expect(game.state("kh").isExhausted).toBe(true);

    const acc = await heldWith({ energy: 5, power: { calm: 3 } });
    await playKraken(acc, { accelerate: true, spend: ["b2", "b3", "b4"] });
    expect(acc.p1.power("calm")).toBe(3);
  });
});
