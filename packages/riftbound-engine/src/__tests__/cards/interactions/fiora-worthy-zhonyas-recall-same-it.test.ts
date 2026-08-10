/**
 * Interaction: Fiora, Worthy (sfd-180-221) · Champion Unit · Order · 3 · 3 Might
 *     "When a unit you control becomes [Mighty], you may pay [order] to ready it."
 *   × Zhonya's Hourglass (ogn-077-298) · Gear · Calm · 2
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Shakedown (ogn-033-298) · Spell · Fury · 2+[fury] · Reaction
 *     "Choose an enemy unit. Deal 6 to it unless its controller has you draw 2."
 *   (+ Discipline ogn-058-298 "Give a unit +2 [Might] this turn. Draw 1." as the Mighty-maker, and
 *    Not So Fast sfd-045-221 "Counter an enemy spell or ability that chooses a friendly unit or gear.")
 *
 * Question: Fiora's trigger has a LEADING "you may" + cost, and its object ("it") is REFERENCED, not
 * chosen. P1 controls Fiora (base), an exhausted 4-Might unit X at bf1 and a face-up Zhonya's. P1
 * Disciplines X (4→6) → X becomes Mighty → Fiora triggers.
 *   (a) When does P1 decide the "may" and pay [order] — finalization or resolution?
 *   (b) P2 responds with Shakedown on X, P1 elects to take the 6. Zhonya's saves X: healed,
 *       exhausted, RECALLED to base. When Fiora's trigger resolves, is the recalled X still "it"?
 *   (c) Same without Zhonya's: X dies. Does the trigger still resolve, does anything ready, is the
 *       [order] refunded?
 *   (d) Could P2 have Not-So-Fast'ed Fiora's trigger?
 *
 * Rules: 383.3.a / 383.3.b / 383.3.b.1 (leading "you may" + cost → both settled at FINALIZATION);
 * 709 (becomes Mighty = crosses to ≥5; a recall changes nothing about Might → no new event); 367
 * (Zhonya's replacement); 455 (a recall is not a move and not a zone change → same object); 124 (a
 * card that leaves the board and returns is a new object); 359.3.e.6 / 359.3.e.12 (impossible
 * instruction ignored, the rest resolves); 425.1.c (a paid cost stays paid); 355.9.b (NSF needs an
 * item that CHOOSES a unit friendly to NSF's controller — a back-reference is not a choice, and X is
 * not friendly to P2 anyway).
 *
 * Expected: (a) FIN yes/no + [order] paid before anyone gets priority; the item carries no chosen
 * targets. (b) Zhonya's → trash, X healed/exhausted/in base, same id, still 6 (still Mighty, no
 * second trigger); Fiora resolves → X READY in base. (c) X → trash; trigger resolves doing nothing;
 * [order] not refunded. (d) No — NSF is not castable at Fiora's trigger.
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIORA = "sfd-180-221";
const ZHONYAS = "ogn-077-298";
const SHAKEDOWN = "ogn-033-298";
const DISCIPLINE = "ogn-058-298";
const NOT_SO_FAST = "sfd-045-221";

interface BoardOpts {
  zhonyas?: boolean;
}

/**
 * P1's turn, Neutral Open. P1: Fiora (ready) in base, exhausted 4-Might Duelist "x" holding bf1, a
 * face-up Zhonya's in base when asked, Discipline in hand, pool 2 energy + exactly one [order].
 * P2: a 2-Might body in base, Shakedown + Not So Fast in hand, pool 4 energy + [fury] + [calm]
 * (enough for either reaction at any point).
 */
function board(opts: BoardOpts = {}) {
  const b = scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .resources(P2, { energy: 4, power: { calm: 1, fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", FIORA, "fiora")
    .unit(P1, "bf1", { might: 4, name: "Duelist" }, "x", { exhausted: true })
    .unit(P2, "base", { might: 2, name: "P2 Body" }, "p2body")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P2, SHAKEDOWN, "shake")
    .hand(P2, NOT_SO_FAST, "nsf");
  if (opts.zhonyas) {
    b.gear(P1, ZHONYAS, "zh");
  }
  return b;
}

/** Discipline X and let it resolve (both pass) → X is 6, Fiora's trigger is pending with its FIN opt-in up. */
async function makeMighty(opts: BoardOpts = {}): Promise<Game> {
  const game = await board(opts).build();
  expect(game.state("x")).toMatchObject({ isExhausted: true, might: 4 });
  await game.p1.cast("disc", { targets: "x" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.state("x").might).toBe(6);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fiora", triggered: true, type: "ability" })]);
  return game;
}

/** From the FIN prompt: P1 pays, passes; P2 Shakedowns X; both pass; P1 (X's controller) elects "Deal 6". */
async function payThenShakedownForSix(game: Game): Promise<void> {
  await game.p1.yes();
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  await game.p2.cast("shake", { targets: "x" });
  expect(game.chain().map((i) => i.cardId)).toEqual(["fiora", "shake"]); // Shakedown on top (LIFO)
  await game.p2.passPriority();
  await game.p1.passPriority();
  const d = game.decision() as PickDecision;
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "mode", source: { cardId: "shake" } });
  const dealSix = d.options.find((o) => /Deal 6/.test(o.label));
  expect(dealSix).toBeDefined();
  await game.p1.answer({ keys: [dealSix?.key as string], kind: "pick" });
}

describe("Fiora, Worthy × Zhonya's Hourglass × Shakedown — FIN cost, and 'it' after a recall vs after a death", () => {
  // ── (a) timing of the "may" + [order] ────────────────────────────────────────────────

  test("(a) the 'you may pay [order]' is decided AND paid at FINALIZATION: a FIN yes/no on Fiora's pending item comes up before anyone holds priority; yes → [order] 1→0 immediately, only then does P1 get chain priority (383.3.a/.b/.b.1)", async () => {
    const game = await makeMighty({ zhonyas: true });
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "fiora", pendingChoiceType: "opt-in" }, timing: "FIN" });
    expect(d?.kind === "yes-no" ? d.source?.chainItemId : undefined).toBe(game.chain()[0]?.id);
    await game.p1.yes();
    expect(game.p1.power("order")).toBe(0);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1, source: { cardId: "fiora" } });
    // The finalized item has NO chosen targets — "it" is a back-reference, not a choice.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fiora", triggered: true })]);
    expect(game.chain()[0]?.targets).toBeUndefined();
  });

  test("(a) control — nothing is asked again at resolution: with no response the trigger just resolves and X (still at bf1) readies", async () => {
    const game = await makeMighty({ zhonyas: true });
    await game.p1.yes();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("x")).toMatchObject({ isReady: true, location: "bf1", might: 6 });
    expect(game.p1.power("order")).toBe(0);
  });

  // ── (b) Zhonya's on board: X is recalled, still "it" ────────────────────────────────

  test("(b) Shakedown for 6 with Zhonya's out: at the Cleanup after Shakedown resolves Zhonya's is killed INSTEAD (367) and X is healed, exhausted and RECALLED to base — same object (455): same id, damage 0, still 6 Might, still carrying its +2", async () => {
    const game = await makeMighty({ zhonyas: true });
    await payThenShakedownForSix(game);
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("shake")).toBe("trash");
    expect(game.has("x")).toBe(true);
    expect(game.zoneOf("x")).toBe("base");
    expect(game.state("x")).toMatchObject({ damage: 0, id: "x", isExhausted: true, location: "base", might: 6, mightModifier: 2 });
  });

  test("(b) the recall is not a new 'becomes Mighty' event (709): after Zhonya's fires the chain still holds exactly the ONE Fiora item and P1 is handed priority, not a second FIN prompt", async () => {
    const game = await makeMighty({ zhonyas: true });
    await payThenShakedownForSix(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fiora", triggered: true })]);
    expect(game.chain()).toHaveLength(1);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1, source: { cardId: "fiora" } });
    expect(game.decision()?.kind).not.toBe("yes-no");
  });

  test("(b) Fiora's trigger then resolves and 'ready it' finds the SAME X in base → X.isReady === true, location base, same instance id; the [order] stays spent", async () => {
    const game = await makeMighty({ zhonyas: true });
    await payThenShakedownForSix(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("x")).toMatchObject({ id: "x", isReady: true, location: "base", might: 6 });
    expect(game.p1.power("order")).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (c) no Zhonya's: X dies, the trigger whiffs ─────────────────────────────────────

  test("(c) without Zhonya's the 6 kills X (→ trash); Fiora's item is NOT removed — it is still on the chain awaiting resolution (it was never countered)", async () => {
    const game = await makeMighty();
    await payThenShakedownForSix(game);
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fiora", countered: false, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(c) the trigger resolves doing nothing: 'ready it' is impossible (359.3.e.6/.12) — X stays in the trash, nothing else (Fiora) is readied/exhausted, and the [order] paid at FIN is NOT refunded (425.1.c)", async () => {
    const game = await makeMighty();
    await payThenShakedownForSix(game);
    const fioraReady = game.state("fiora").isReady;
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.state("fiora").isReady).toBe(fioraReady);
    expect(game.p1.power("order")).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (d) Not So Fast vs Fiora's trigger ───────────────────────────────────────────────

  test("(d) with Fiora's finalized trigger the only item on the chain and P2 holding priority (4 energy + [calm] in pool), Not So Fast is NOT castable — the trigger chooses nothing ('it' is a back-reference) and X is not friendly to P2 (355.9.b)", async () => {
    const game = await makeMighty({ zhonyas: true });
    await game.p1.yes();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.resources()).toEqual({ energy: 4, power: { calm: 1, fury: 1 } });
    expect(game.p2.can("cast", "nsf")).toBe(false);
    expect(game.p2.option("cast", "nsf")).toBeUndefined();
    await expect(game.p2.cast("nsf", { targets: "fiora" })).rejects.toThrow();
    expect(game.zoneOf("nsf")).toBe("hand");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fiora", countered: false })]);
    // …whereas Shakedown (chooses an ENEMY unit) is live in the same window.
    expect(game.p2.can("cast", "shake")).toBe(true);
  });

  test("(d) control — NSF itself is live when its condition holds: P1's Discipline aimed at P2's OWN unit is an enemy spell choosing a unit friendly to P2 → NSF offered with Discipline as its target, and it counters it", async () => {
    const game = await board({ zhonyas: true }).build();
    await game.p1.cast("disc", { targets: "p2body" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "nsf")).toBe(true);
    const field = game.p2.option("cast", "nsf")?.fields.find((f) => f.name === "targets");
    const offered = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
    expect(offered).toEqual(["disc"]);
    await game.p2.cast("nsf", { targets: "disc" });
    await game.settle();
    expect(game.state("p2body").might).toBe(2); // Discipline countered
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.zoneOf("nsf")).toBe("trash");
  });
});
