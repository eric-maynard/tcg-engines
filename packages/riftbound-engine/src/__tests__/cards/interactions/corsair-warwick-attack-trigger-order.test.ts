/**
 * Interaction: Crackshot Corsair (ogn-130-298) · Unit · Body · 3 · 3 Might
 *     "When I attack, deal 1 to an enemy unit here."
 *   × Warwick, Hunter (ogn-159-298) · Champion Unit · Body · 6 · 5 Might
 *     "I enter ready. When I attack, kill all damaged enemy units here."
 *   vs a single undamaged vanilla 6-Might defender ("Guard").
 *
 * Rules: 464.2.c.3 (all of the attacker's units at the battlefield gain the Attacker designation in
 * the same step), 383.4.e / 383.4.e.2 ("When I attack" triggers become pending items right after
 * that), 383.3.d (simultaneous triggers controlled by ONE player are ordered onto the chain by that
 * player), 464.2.e.1 (attacker places triggers before the defender — who has none here), 337.1.b /
 * 355.5 (choices such as Corsair's target are made at finalization), LIFO resolution of the chain,
 * 465–466 (combat damage step; with no defenders left no damage is exchanged and the attacker conquers).
 *
 * Question: P1 moves Corsair + Warwick together into bf1 held by P2's lone undamaged 6-Might Guard.
 * Both attack triggers fire at once; P1 controls both, so P1 must be asked to order them, and the
 * order is outcome-determinative:
 *   Order A — Warwick appended first, Corsair on top: Corsair resolves (Guard 1 damage, survives),
 *     then Warwick kills the now-damaged Guard. No defenders → no combat damage; both attackers
 *     survive; P1 conquers bf1.
 *   Order B — Corsair appended first, Warwick on top: Warwick resolves first (nothing damaged →
 *     nothing dies), Corsair pings Guard (1). Combat: 3+5 = 8 ≥ 6 kills Guard, but Guard deals 6
 *     back, assigned by P2 (e.g. 3/3 kills Corsair, or 5 to Warwick +1 kills Warwick). P1 conquers
 *     but loses a unit.
 *
 * Engine note: the engine currently places same-controller simultaneous triggers in board-scan
 * order (no ordering prompt). The Order A / Order B boards below differ ONLY in the order the two
 * attackers were put into P1's base, which is what drives that scan order; each test asserts the
 * resulting chain layout before relying on it, and answers an "order" decision if one is offered.
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CRACKSHOT_CORSAIR = "ogn-130-298";
const WARWICK_HUNTER = "ogn-159-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;
type Order = "A" | "B";

/**
 * P1's turn. P2 holds bf1 with one undamaged vanilla 6-Might Guard. P1 has Corsair (3) and Warwick (5)
 * ready in base. `order` only changes which attacker is placed first (see Engine note above).
 */
function board(order: Order) {
  const s = scenario().battlefield("bf1", { controller: P2 });
  if (order === "A") {
    s.unit(P1, "base", WARWICK_HUNTER, "ww").unit(P1, "base", CRACKSHOT_CORSAIR, "corsair");
  } else {
    s.unit(P1, "base", CRACKSHOT_CORSAIR, "corsair").unit(P1, "base", WARWICK_HUNTER, "ww");
  }
  return s.unit(P2, "bf1", { might: 6, name: "Guard" }, "guard");
}

/** Bottom → top chain as [cardId, …]. */
function chainIds(game: Game): string[] {
  return game.chain().map((c) => c.cardId);
}

/**
 * Move both attackers in and put the two triggers on the chain in the requested order
 * (first-listed = appended first = bottom). If the engine offers an ordering decision it is
 * answered; Corsair's lone legal target (Guard) is picked if asked.
 */
async function attack(game: Game, order: Order): Promise<void> {
  await game.p1.move(["corsair", "ww"], "bf1");
  const wanted = order === "A" ? ["ww", "corsair"] : ["corsair", "ww"];
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "order" && d.seat === P1) {
      const keyOf = (card: string) => d.items.find((it) => (it.card ?? it.key) === card)?.key ?? card;
      await game.p1.order(wanted.map(keyOf));
    } else if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "guard")) {
      await game.p1.pick("guard");
    } else {
      break;
    }
  }
  expect(chainIds(game)).toEqual(wanted);
}

/** Both players pass priority once each → the top chain item resolves (taking a forced Guard pick if asked). */
async function resolveTop(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1 && d.options.length === 1) {
    await game.p1.pick(d.options[0]?.key as string);
  }
}

describe("Crackshot Corsair × Warwick, Hunter — ordering two simultaneous attack triggers (383.3.d)", () => {
  // ── shared premise ─────────────────────────────────────────────────────────────────────────

  test("moving both in together makes BOTH attackers at once and puts BOTH 'When I attack' triggers on the chain, both controlled by P1 (464.2.c.3, 383.4.e.2)", async () => {
    const game = await board("B").build();
    await game.p1.move(["corsair", "ww"], "bf1");
    expect(game.state("corsair").combatRole).toBe("attacker");
    expect(game.state("ww").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    const d = game.decision();
    if (d?.kind === "order") {
      await game.p1.order(d.items.map((i) => i.key));
    }
    expect(game.chain()).toHaveLength(2);
    expect(game.chain()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardId: "corsair", controller: P1, triggered: true }),
        expect.objectContaining({ cardId: "ww", controller: P1, triggered: true }),
      ]),
    );
    expect(game.state("guard").damage).toBe(0); // nothing has resolved yet
  });

  // Expected (383.3.d): both triggers are P1's and became pending simultaneously, so P1 must be
  // offered an ordering decision (kind "order", seat P1, listing corsair + ww) before either is
  // finalized on the chain. Actual: the engine silently uses board-scan order and goes straight to
  // the priority window — no decision of kind "order" is ever surfaced.
  test("BUG: P1 is asked to ORDER the two simultaneous triggers — an 'order' decision for P1 listing Corsair and Warwick (383.3.d)", async () => {
    const game = await board("B").build();
    await game.p1.move(["corsair", "ww"], "bf1");
    const d = game.decision() as Decision | null;
    expect(d?.kind).toBe("order");
    expect(d?.seat).toBe(P1);
    const items = d?.kind === "order" ? d.items.map((i) => i.card ?? i.key) : [];
    expect(new Set(items)).toEqual(new Set(["corsair", "ww"]));
    // And the answer is honoured: Warwick first (bottom), Corsair on top.
    await game.p1.order(
      ["ww", "corsair"].map((c) => (d?.kind === "order" ? (d.items.find((i) => (i.card ?? i.key) === c)?.key ?? c) : c)),
    );
    expect(chainIds(game)).toEqual(["ww", "corsair"]);
  });

  // Same bug seen from the other side: with an identical position P1 must be able to obtain EITHER
  // chain layout. Actual: the layout is fixed by placement order, so one of the two requests fails.
  test("BUG: from one and the same position P1 can choose either layout — [ww, corsair] or [corsair, ww] (383.3.d)", async () => {
    const a = await board("B").build();
    await attack(a, "A");
    const b = await board("B").build();
    await attack(b, "B");
  });

  // ── Order A: Warwick bottom, Corsair top ──────────────────────────────────────────────────

  test("Order A: chain is [ww, corsair] (Corsair on top); Corsair resolves first → Guard takes exactly 1 and survives (6 Might), Warwick's trigger still pending", async () => {
    const game = await board("A").build();
    await attack(game, "A");
    await resolveTop(game);
    expect(game.state("guard").damage).toBe(1);
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(chainIds(game)).toEqual(["ww"]);
  });

  test("Order A: Warwick then resolves → the now-damaged Guard is killed before any combat damage", async () => {
    const game = await board("A").build();
    await attack(game, "A");
    await resolveTop(game); // Corsair
    await resolveTop(game); // Warwick
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.chain()).toEqual([]);
    // Still in the showdown; no combat damage has been dealt to anyone.
    expect(game.state("corsair").damage).toBe(0);
    expect(game.state("ww").damage).toBe(0);
    expect(game.locationOf("corsair")).toBe("bf1");
    expect(game.locationOf("ww")).toBe("bf1");
  });

  test("Order A end state: no defender → no combat damage is assigned (P2 is never asked), both attackers survive at bf1, P1 conquers bf1 and scores 1", async () => {
    const game = await board("A").build();
    let p2AskedToAssign = false;
    game.script(P2, [
      (d) => {
        if (d.kind === "distribute") {
          p2AskedToAssign = true;
        }
        return undefined;
      },
    ]);
    await attack(game, "A");
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(p2AskedToAssign).toBe(false);
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("corsair")).toBe("bf1");
    expect(game.locationOf("ww")).toBe("bf1");
    expect(game.p1.units("bf1").sort()).toEqual(["corsair", "ww"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  // ── Order B: Corsair bottom, Warwick top ──────────────────────────────────────────────────

  test("Order B: chain is [corsair, ww] (Warwick on top); Warwick resolves first with NO damaged enemy → nothing dies; then Corsair pings Guard to 1 damage, Guard survives", async () => {
    const game = await board("B").build();
    await attack(game, "B");
    await resolveTop(game); // Warwick: no damaged enemies here
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.state("guard").damage).toBe(0);
    expect(chainIds(game)).toEqual(["corsair"]);
    await resolveTop(game); // Corsair
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.state("guard").damage).toBe(1);
    expect(game.chain()).toEqual([]);
    // Warwick's trigger does not re-check later: Guard is damaged now but stays alive into combat.
    expect(game.p2.units("bf1")).toEqual(["guard"]);
  });

  test("Order B: combat damage step happens — P2 (the defender) is the one asked to assign Guard's 6 damage among Corsair and Warwick", async () => {
    const game = await board("B").build();
    await attack(game, "B");
    await resolveTop(game);
    await resolveTop(game);
    await game.acting().passFocus();
    await game.acting().passFocus();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P2, total: 6 });
    const buckets = d?.kind === "distribute" ? d.buckets.map((b) => b.card ?? b.key) : [];
    expect(new Set(buckets)).toEqual(new Set(["corsair", "ww"]));
  });

  test("Order B, P2 assigns 3/3: attackers' 8 kills Guard; Corsair (3) dies, Warwick survives (healed at cleanup); P1 conquers bf1 but is a unit down", async () => {
    const game = await board("B").build();
    game.script(P2, [(d) => (d.kind === "distribute" ? { allocation: { corsair: 3, ww: 3 }, kind: "distribute" } : undefined)]);
    await attack(game, "B");
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("corsair")).toBe("trash");
    expect(game.locationOf("ww")).toBe("bf1");
    expect(game.state("ww").damage).toBe(0); // 3 < 5, then combat cleanup heals
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.units()).toEqual(["ww"]);
  });

  test("Order B, P2 assigns 5 to Warwick + 1 to Corsair: Warwick dies instead, Corsair survives and conquers", async () => {
    const game = await board("B").build();
    game.script(P2, [(d) => (d.kind === "distribute" ? { allocation: { corsair: 1, ww: 5 }, kind: "distribute" } : undefined)]);
    await attack(game, "B");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(game.locationOf("corsair")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.units()).toEqual(["corsair"]);
  });

  test("the ordering is outcome-determinative: Order A keeps both attackers, Order B always costs P1 exactly one of them", async () => {
    const a = await board("A").build();
    await attack(a, "A");
    await a.settle();
    const b = await board("B").build();
    await attack(b, "B");
    await b.settle(); // default (greedy) assignment by P2
    expect(a.p1.units().sort()).toEqual(["corsair", "ww"]);
    expect(b.p1.units()).toHaveLength(1);
    expect(a.p1.points()).toBe(1);
    expect(b.p1.points()).toBe(1);
  });
});
