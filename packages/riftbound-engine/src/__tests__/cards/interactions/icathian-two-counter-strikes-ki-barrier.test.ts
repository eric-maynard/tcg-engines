/**
 * Interaction: Icathian Rain (ogn-248-298) · Spell · Fury/Mind · 7 + 3 power
 *     "Deal 2 to a unit." ×6
 *   × Counter Strike (sfd-194-221) · Reaction spell · Calm/Body · 2 + [rainbow]
 *     "Choose a unit. The next time that unit would be dealt damage this turn, prevent it. Draw 1."
 *   × Ki Barrier (ven-126-166) · Reaction spell · Order · 2 + [order]
 *     "Choose a unit. Prevent the next 7 damage that would be dealt to it this turn."
 *   on P2's vanilla V (5 Might; contrasts at 9 / 6) alone at bf1, on P1's turn.
 *
 * Question: P1 casts Icathian Rain with all six instances on V.
 *   (a) P2 responds with TWO Counter Strikes on V. Are both shields eaten by instance 1, or one per
 *       instance? Damage on V after each instance; does V die; how many cards did P2 draw? Contrast 9-Might V.
 *   (b) P2 responds with ONE Ki Barrier: damage after each instance, does the pool expire mid-spell, does V
 *       die? Contrast 6-Might V.
 *   (c) P2 responds with one Counter Strike AND one Ki Barrier: who orders them at instance 1, and what are
 *       the final marks if P2 puts Counter Strike first vs Ki Barrier first every time?
 *
 * Rules: 437.1.b.2 / 437.7 (Prevent is a damage-time replacement matched per damage EVENT — each "Deal 2"
 * is its own event), 437.2 (dealt = amount − prevented), 437.3 / 437.3.a (a Prevent Value counts down and
 * expires at 0), 437.4 (fully prevented damage is not dealt at all), 372 (the AFFECTED object's controller
 * orders several replacements), 370.2 / 371.2.b (a replacement that ends up with nothing to replace is not
 * applied and not used up), 321 / 323.5 (lethal damage kills at the Cleanup after the spell leaves the
 * chain — not between instances), 142.4.b (draw).
 *
 * Expected: both reactions resolve before Rain (LIFO); P2 draws 1 per Counter Strike.
 *   (a) inst1: one Counter Strike prevents the 2 → 0 dealt; the other has nothing left to apply to and stays
 *       armed; inst2: it prevents → 0; inst3–6: 2 each. Marks 0,0,2,4,6,8 → V (5) dies in the single Cleanup
 *       after Rain (all six instances landed); P2 drew 2. A 9-Might V survives on 8.
 *   (b) Ki: inst1 0 (7→5), inst2 0 (5→3), inst3 0 (3→1), inst4 1 prevented + 1 dealt (pool 0 → expires),
 *       inst5 2, inst6 2 → marks 0,0,0,1,3,5 → V (5) dies at the Cleanup; a 6-Might V survives on 5.
 *   (c) P2 orders. Counter Strike first at inst1: CS spent, Ki untouched (7); then Ki alone: 5,3,1, inst5
 *       1 dealt (expires), inst6 2 → V ends on 3, alive; asked once (afterwards only one effect remains).
 *       Ki first every time: inst1–3 Ki prevents all (7→5→3→1), CS never applies and stays armed; inst4 Ki
 *       prevents 1, CS prevents the remaining 1 (spent); inst5 2, inst6 2 → V ends on 4, alive; asked at each
 *       of inst1–4 (both still live). 3 ≠ 4 proves the order is asked and applied per instance.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ICATHIAN_RAIN = "ogn-248-298";
const COUNTER_STRIKE = "sfd-194-221";
const KI_BARRIER = "ven-126-166";

type Reaction = "cs" | "ki";
const DEF: Record<Reaction, string> = { cs: COUNTER_STRIKE, ki: KI_BARRIER };

/**
 * P1's turn. P2 holds bf1 with a lone vanilla V (`might`) and holds `reactions` (aliases cs1/cs2/ki1…) with
 * EXACTLY the resources to cast them all (2 energy each; [rainbow] per Counter Strike, [order] per Ki Barrier).
 * P1 holds Icathian Rain with exactly 7 + 3 rainbow. P2's hand is otherwise empty.
 */
function board(might: number, reactions: readonly Reaction[]) {
  const cs = reactions.filter((r) => r === "cs").length;
  const ki = reactions.filter((r) => r === "ki").length;
  let s = scenario()
    .resources(P1, { energy: 7, power: { rainbow: 3 } })
    .resources(P2, { energy: 2 * reactions.length, power: { order: ki, rainbow: cs } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might, name: "Vanilla V" }, "v")
    .hand(P1, ICATHIAN_RAIN, "rain");
  const count: Record<Reaction, number> = { cs: 0, ki: 0 };
  for (const r of reactions) {
    count[r] += 1;
    s = s.hand(P2, DEF[r], `${r}${count[r]}`);
  }
  return { aliases: reactions.map((r, i) => `${r}${reactions.slice(0, i + 1).filter((x) => x === r).length}`), s };
}

/**
 * P1 casts Rain (all six on V) and passes; P2 responds with every reaction on V (in `reactions` order);
 * everybody passes until only Rain is left on the chain (the reactions resolved LIFO). P1 holds priority.
 */
async function shieldsUp(might: number, reactions: readonly Reaction[]): Promise<Game> {
  const { s, aliases } = board(might, reactions);
  const game = await s.build();
  await game.p1.cast("rain", { targets: ["v", "v", "v", "v", "v", "v"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  await game.p1.passPriority();
  for (const a of aliases) {
    await game.p2.cast(a, { targets: "v" });
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["rain", ...aliases]);
  while (game.chain().length > 1 && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["rain"]);
  for (const a of aliases) {
    expect(game.zoneOf(a)).toBe("trash");
  }
  return game;
}

interface OrderAsk {
  readonly decision: PickDecision;
  readonly ki: unknown;
  readonly cs: unknown;
  readonly dealtSoFar: number;
}

/**
 * Let Rain resolve: pass priority; whenever a rule-372 ordering question appears answer it with `first`
 * (recording the ask and the shields' state at that moment). Stops at the open main phase.
 */
async function resolveRain(game: Game, first?: "prevent-next" | "prevent-shield"): Promise<OrderAsk[]> {
  const asks: OrderAsk[] = [];
  for (let i = 0; i < 40; i++) {
    const d: Decision | null = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "action" && d.context === "chain") {
      await game.acting().passPriority();
      continue;
    }
    if (d.kind === "pick" && d.semantics === "replacement-order") {
      asks.push({ cs: csArmed(game), dealtSoFar: totalDealt(game), decision: d, ki: kiValue(game) });
      expect(first).toBeDefined();
      await game.seat(d.seat).pick(first as string);
      continue;
    }
    break;
  }
  return asks;
}

/** Rain's damage records on V, in order (a fully prevented instance deals nothing and leaves no record — 437.4). */
const rainHits = (game: Game) => (game.gameState.damageLog ?? []).filter((r) => r.target === "v" && r.source.cardId === "rain");
/** Running total of damage marked on V after each instance that actually dealt damage. */
const marks = (game: Game): number[] => {
  let sum = 0;
  return rainHits(game).map((r) => (sum += r.amount));
};
const totalDealt = (game: Game) => rainHits(game).reduce((s, r) => s + r.amount, 0);
/** Number of armed Counter Strike one-shots on V (the engine keeps a count). */
const csArmed = (game: Game): number => {
  const v = game.state("v").meta.preventNextDamageInstance;
  return v === true ? 1 : typeof v === "number" ? v : 0;
};
const kiValue = (game: Game) => game.state("v").meta.damagePreventionShield as number | undefined;

describe("(a) Icathian Rain ×6 on V vs TWO Counter Strikes — one shield per instance", () => {
  test("premise: both Counter Strikes resolve before Rain (LIFO); V carries TWO armed one-shot prevents; P2 paid 4 + 2 rainbow and drew 2 (one per Counter Strike)", async () => {
    const { s } = board(5, ["cs", "cs"]);
    const probe = await s.build();
    const p2Deck = probe.p2.deck().length;
    const game = await shieldsUp(5, ["cs", "cs"]);
    expect(csArmed(game)).toBe(2);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0, rainbow: 0 } });
    expect(game.p2.hand()).toHaveLength(2); // cs1 + cs2 left the hand, 2 drawn
    expect(game.p2.deck()).toHaveLength(p2Deck - 2);
    expect(game.state("v").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("instance 1 consumes exactly ONE Counter Strike (the other has nothing left to prevent and stays armed, 370.2 / 371.2.b); instance 2 consumes the second; instances 3–6 deal 2 each → dealt records [2,2,2,2], marks 2,4,6,8 (437.4, 437.7)", async () => {
    const game = await shieldsUp(5, ["cs", "cs"]);
    await resolveRain(game, "prevent-next");
    expect(rainHits(game).map((r) => r.amount)).toEqual([2, 2, 2, 2]); // instances 1 and 2 dealt nothing
    expect(marks(game)).toEqual([2, 4, 6, 8]);
    expect(rainHits(game).every((r) => r.original === 2 && r.modifiedBy.length === 0)).toBe(true);
    expect(game.zoneOf("rain")).toBe("trash");
  });

  test("V (5 Might) dies — but only in the Cleanup after Rain left the chain: all SIX instances landed (4 dealt records although 6 ≥ 5 was reached after instance 5), then V went to P2's trash; no shield state lingers", async () => {
    const game = await shieldsUp(5, ["cs", "cs"]);
    await resolveRain(game, "prevent-next");
    expect(rainHits(game)).toHaveLength(4);
    expect(totalDealt(game)).toBe(8);
    expect(game.zoneOf("v")).toBe("trash");
    expect(game.p2.trash()).toContain("v");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: a 9-Might V takes the same 0,0,2,2,2,2 and SURVIVES on 8 damage with both Counter Strikes spent", async () => {
    const game = await shieldsUp(9, ["cs", "cs"]);
    await resolveRain(game, "prevent-next");
    expect(marks(game)).toEqual([2, 4, 6, 8]);
    expect(game.state("v")).toMatchObject({ damage: 8, might: 9, zone: "battlefield-bf1" });
    expect(csArmed(game)).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});

describe("(b) Icathian Rain ×6 on V vs ONE Ki Barrier — the Prevent Value counts down across instances and expires mid-spell", () => {
  test("premise: Ki Barrier resolves first; V tracks a Prevent Value of 7; P2 paid 2 + [order] and drew nothing", async () => {
    const game = await shieldsUp(5, ["ki"]);
    expect(kiValue(game)).toBe(7);
    expect(csArmed(game)).toBe(0);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0, rainbow: 0 } });
    expect(game.p2.hand()).toHaveLength(0);
  });

  test("instances 1–3 are fully prevented (7→5→3→1), instance 4 has 1 prevented and 1 DEALT — the pool hits 0 and expires (437.3.a) — instances 5 and 6 deal 2 each: dealt records [1,2,2], marks 1,3,5", async () => {
    const game = await shieldsUp(5, ["ki"]);
    const asks = await resolveRain(game);
    expect(asks).toEqual([]); // a single replacement: nothing to order
    const hits = rainHits(game);
    expect(hits.map((r) => r.amount)).toEqual([1, 2, 2]);
    expect(hits[0]).toMatchObject({ amount: 1, original: 2 });
    expect(hits[0]?.modifiedBy).toEqual([expect.objectContaining({ after: 1, before: 2, key: "prevent-shield", sourceCardId: "ki1" })]);
    expect(hits[1]?.modifiedBy).toEqual([]); // the pool was gone by instance 5
    expect(marks(game)).toEqual([1, 3, 5]);
  });

  test("V (5 Might) dies at the Cleanup after Rain (5 ≥ 5) — again only after all six instances (3 dealt records incl. instance 6)", async () => {
    const game = await shieldsUp(5, ["ki"]);
    await resolveRain(game);
    expect(rainHits(game)).toHaveLength(3);
    expect(totalDealt(game)).toBe(5);
    expect(game.zoneOf("v")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: a 6-Might V takes the same 0,0,0,1,2,2 and SURVIVES on 5 damage; the Ki pool is no longer tracked", async () => {
    const game = await shieldsUp(6, ["ki"]);
    await resolveRain(game);
    expect(marks(game)).toEqual([1, 3, 5]);
    expect(game.state("v")).toMatchObject({ damage: 5, might: 6, zone: "battlefield-bf1" });
    expect(kiValue(game)).toBeUndefined();
    expect(game.state("v").meta.damagePreventionSource).toBeUndefined();
  });
});

describe("(c) Icathian Rain ×6 on V (5) vs Counter Strike + Ki Barrier — P2 orders per instance; the order changes the marks", () => {
  test("premise: both resolve; V has one armed Counter Strike AND Ki 7; P2 drew 1", async () => {
    const game = await shieldsUp(5, ["cs", "ki"]);
    expect(csArmed(game)).toBe(1);
    expect(kiValue(game)).toBe(7);
    expect(game.p2.hand()).toHaveLength(1);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0, rainbow: 0 } });
  });

  test("at instance 1 the engine parks on a replacement-order pick for P2 — V's controller, not caster/turn player P1 — listing exactly the two prevents; nothing has been dealt yet (372)", async () => {
    const game = await shieldsUp(5, ["cs", "ki"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Rain starts resolving
    const d = game.decision();
    expect(game.actingSeat()).toBe(P2);
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", seat: P2, semantics: "replacement-order", timing: "RPL" });
    expect(d?.kind === "pick" ? d.options.map((o) => `${o.key}:${o.card}`).toSorted() : []).toEqual(["prevent-next:cs1", "prevent-shield:ki1"]);
    expect(rainHits(game)).toEqual([]);
    expect(game.state("v").damage).toBe(0);
    // P1 sees only that P2 is deciding.
    expect(game.view(P1).decision).toMatchObject({ kind: "pick", seat: P2 });
  });

  test("Counter Strike FIRST: asked exactly once (at instance 1 — afterwards only Ki remains); CS is spent there with Ki untouched at 7; Ki then soaks 2,2,2 and 1 of instance 5 (expires); instance 6 deals 2 → dealt [1,2], V ends on 3 and LIVES", async () => {
    const game = await shieldsUp(5, ["cs", "ki"]);
    const asks = await resolveRain(game, "prevent-next");
    expect(asks).toHaveLength(1);
    expect(asks[0]).toMatchObject({ cs: 1, dealtSoFar: 0, ki: 7 });
    const hits = rainHits(game);
    expect(hits.map((r) => r.amount)).toEqual([1, 2]);
    expect(hits[0]?.modifiedBy).toEqual([expect.objectContaining({ after: 1, before: 2, key: "prevent-shield", sourceCardId: "ki1" })]);
    expect(marks(game)).toEqual([1, 3]);
    expect(game.state("v")).toMatchObject({ damage: 3, might: 5, zone: "battlefield-bf1" });
    expect(csArmed(game)).toBe(0);
    expect(kiValue(game)).toBeUndefined();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("Ki Barrier FIRST every time: asked at EACH of instances 1–4 (both effects still live: Ki 7/5/3/1, CS armed, 0 dealt so far); Ki prevents 1–3 outright without spending CS (371.2.b); at instance 4 Ki takes 1 and CS prevents the remaining 1 (spent); instances 5–6 deal 2,2 → V ends on 4 and LIVES", async () => {
    const game = await shieldsUp(5, ["cs", "ki"]);
    const asks = await resolveRain(game, "prevent-shield");
    expect(asks).toHaveLength(4);
    expect(asks.map((a) => [a.ki, a.cs, a.dealtSoFar])).toEqual([
      [7, 1, 0],
      [5, 1, 0],
      [3, 1, 0],
      [1, 1, 0],
    ]);
    expect(asks.every((a) => a.decision.seat === P2 && a.decision.options.length === 2)).toBe(true);
    const hits = rainHits(game);
    expect(hits.map((r) => r.amount)).toEqual([2, 2]); // instances 1–4 dealt nothing at all
    expect(hits.every((r) => r.modifiedBy.length === 0)).toBe(true);
    expect(marks(game)).toEqual([2, 4]);
    expect(game.state("v")).toMatchObject({ damage: 4, might: 5, zone: "battlefield-bf1" });
    expect(csArmed(game)).toBe(0); // consumed at instance 4, on the 1 that Ki let through
    expect(kiValue(game)).toBeUndefined();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("either way V (5) survives Rain, but the marks differ — 3 (CS first) vs 4 (Ki first) — so the order is genuinely asked and applied per damage instance; no invariant violations", async () => {
    const csFirst = await shieldsUp(5, ["cs", "ki"]);
    await resolveRain(csFirst, "prevent-next");
    const kiFirst = await shieldsUp(5, ["cs", "ki"]);
    await resolveRain(kiFirst, "prevent-shield");
    expect(csFirst.zoneOf("v")).toBe("battlefield-bf1");
    expect(kiFirst.zoneOf("v")).toBe("battlefield-bf1");
    expect([csFirst.state("v").damage, kiFirst.state("v").damage]).toEqual([3, 4]);
    expect(csFirst.violations()).toEqual([]);
    expect(kiFirst.violations()).toEqual([]);
  });
});
