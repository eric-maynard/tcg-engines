/**
 * On the Hunt — sfd-204-221 · Spell · Body/Chaos · 1 energy + 2 hybrid [body/chaos] power · no timing keyword
 *
 *   Ready your units.
 *
 * Rules: 415 (Ready: only exhausted permanents actually ready — 415.1.b/c; readying is an event
 * other cards may trigger on), 740.1.a ("your" = units you CONTROL), 355.10.d (a mass effect
 * chooses nothing → no targets needed, castable on an empty board), 155/159.2 (no
 * [Action]/[Reaction] printed → my turn, Neutral Open only), 144/420.3 (a readied unit may pay
 * the Standard Move's exhaust cost again this turn), 425 (Stunned is independent of ready).
 *
 * Head-judge corner cases for THIS card:
 *  1. Scope: ALL my units everywhere (base + every battlefield) — not my gear/legend/runes, and
 *     never enemy units.
 *  2. The payoff: a unit that already moved (exhausted) is ready again and may Standard-Move a
 *     second time this turn; a unit readied at a battlefield can walk home.
 *  3. Hybrid cost: the two pips are body/chaos hybrids — body+body, chaos+chaos, body+chaos all
 *     pay; fury does not; one pip short is unaffordable.
 *  4. Stunned + exhausted unit: becomes ready but stays stunned.
 *  5. Timing: cannot be fired inside a showdown (mine or theirs) nor on the opponent's turn.
 *  6. Control, not ownership: a P2-owned unit I control readies; my own unit under P2's control does not.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-204-221";

function board(power: Record<string, number> = { rainbow: 2 }, energy = 1) {
  return scenario()
    .resources(P1, { energy, power })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Home Tired" }, "homeTired", { exhausted: true })
    .unit(P1, "base", { might: 1, name: "Home Fresh" }, "homeFresh")
    .unit(P1, "bf1", { might: 3, name: "Field Tired" }, "fieldTired", { exhausted: true })
    .unit(P2, "bf2", { might: 2, name: "Foe Tired" }, "foeTired", { exhausted: true })
    .gear(P1, { name: "Trinket" }, "trinket", { exhausted: true })
    .hand(P1, CARD, "hunt");
}

describe("On the Hunt (sfd-204-221)", () => {
  test("costs 1 energy + 2 power; one non-triggered chain item that chooses nothing; readies every exhausted unit I control (base AND battlefield); spell → trash", async () => {
    const game = await board().build();
    await game.p1.cast("hunt");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hunt", controller: P1, triggered: false })]);
    expect(game.p1.option("cast", "hunt")).toBeUndefined(); // it left the hand
    await game.settle();
    expect(game.state("homeTired").isReady).toBe(true);
    expect(game.state("fieldTired").isReady).toBe(true);
    expect(game.state("homeFresh").isReady).toBe(true);
    expect(game.zoneOf("hunt")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("negative space: enemy units stay exhausted, and my exhausted GEAR is not a unit — it stays exhausted too", async () => {
    const game = await board().build();
    await game.p1.cast("hunt");
    await game.settle();
    expect(game.state("foeTired").isExhausted).toBe(true);
    expect(game.state("trinket").isExhausted).toBe(true);
  });

  test("no play-time choices at all: the cast option exposes no targets field, and it is castable with ZERO units on the board (resolves doing nothing)", async () => {
    const game = await board().build();
    expect(game.p1.option("cast", "hunt")?.fields.some((f) => f.arg === "targets")).toBe(false);
    const empty = await scenario().resources(P1, { energy: 1, power: { rainbow: 2 } }).hand(P1, CARD, "hunt").build();
    expect(empty.p1.can("cast", "hunt")).toBe(true);
    await empty.p1.cast("hunt");
    await empty.settle();
    expect(empty.zoneOf("hunt")).toBe("trash");
    expect(empty.decision()?.kind).toBe("action");
  });

  test("hybrid cost: body+body, chaos+chaos and body+chaos all pay the two pips; fury cannot; one pip or 0 energy is unaffordable", async () => {
    for (const ok of [{ body: 2 }, { chaos: 2 }, { body: 1, chaos: 1 }]) {
      const g = await board(ok).build();
      expect(g.p1.can("cast", "hunt")).toBe(true);
      await g.p1.cast("hunt");
      expect(g.p1.energy()).toBe(0);
      expect(g.p1.power()).toBe(0);
    }
    expect((await board({ fury: 2 }).build()).p1.can("cast", "hunt")).toBe(false);
    expect((await board({ body: 1 }).build()).p1.can("cast", "hunt")).toBe(false);
    expect((await board({ body: 2 }, 0).build()).p1.can("cast", "hunt")).toBe(false);
  });

  test("the payoff: a unit that already Standard-Moved this turn is readied and moves AGAIN (bf1 → back to base), ending exhausted at home", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", { might: 2, name: "Runner" }, "runner")
      .hand(P1, CARD, "hunt")
      .build();
    await game.p1.move("runner", "bf1");
    await game.settle();
    expect(game.locationOf("runner")).toBe("bf1");
    expect(game.state("runner").isExhausted).toBe(true);
    expect(game.p1.can("move")).toBe(false); // nothing ready to move
    await game.p1.cast("hunt");
    await game.settle();
    expect(game.state("runner").isReady).toBe(true);
    await game.p1.move("runner", "base");
    await game.settle();
    expect(game.locationOf("runner")).toBe("base");
    expect(game.state("runner").isExhausted).toBe(true);
  });

  test("full turn, one Ganking unit scoring TWICE: take empty bf1 (1 pt, exhausted) → On the Hunt readies it → gank into bf2's 2-Might defender, win the combat, conquer (2 pts)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { body: 2 } })
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", { keywords: ["Ganking"], might: 3, name: "Raider" }, "raider")
      .unit(P2, "bf2", { might: 2, name: "Defender" }, "def")
      .hand(P1, CARD, "hunt")
      .build();
    await game.p1.move("raider", "bf1");
    await game.settle(); // hands back the auto-begun showdown once
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("raider").isExhausted).toBe(true);
    expect(game.p1.can("gank", "raider")).toBe(false); // exhausted: no second move yet
    await game.p1.cast("hunt");
    await game.settle();
    expect(game.state("raider").isReady).toBe(true);
    await game.p1.gank("raider", "bf2");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.locationOf("raider")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
  });

  test("stunned AND exhausted: On the Hunt readies the unit but does not clear the stun", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { rainbow: 2 } })
      .unit(P1, "base", { might: 2 }, "dazed", { exhausted: true, stunned: true })
      .hand(P1, CARD, "hunt")
      .build();
    await game.p1.cast("hunt");
    await game.settle();
    expect(game.state("dazed")).toMatchObject({ isReady: true, isStunned: true });
  });

  test("timing: no [Action]/[Reaction] — not castable on the opponent's turn, nor with Focus inside my own showdown", async () => {
    const theirs = await board().active(P2).build();
    expect(theirs.p1.can("cast", "hunt")).toBe(false);
    const mine = await scenario()
      .resources(P1, { energy: 1, power: { rainbow: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "atk")
      .unit(P1, "base", { might: 2 }, "tired", { exhausted: true })
      .unit(P2, "bf1", { might: 5 }, "wall")
      .hand(P1, CARD, "hunt")
      .build();
    expect(mine.p1.can("cast", "hunt")).toBe(true);
    await mine.p1.move("atk", "bf1");
    expect(mine.decision() as ActionDecision).toMatchObject({ context: "showdown", seat: P1 });
    expect(mine.p1.can("cast", "hunt")).toBe(false);
  });

  test("'your units' is about CONTROL (740.1.a): a P2-owned unit I control is readied; a P1-owned unit P2 controls is not", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { rainbow: 2 } })
      .card("borrowed", { controller: P1, def: { cardType: "unit", might: 2, name: "Borrowed" }, meta: { exhausted: true }, owner: P2, zone: "base" })
      .card("lent", { controller: P2, def: { cardType: "unit", might: 2, name: "Lent" }, meta: { exhausted: true }, owner: P1, zone: "base" })
      .hand(P1, CARD, "hunt")
      .build();
    expect(game.state("borrowed")).toMatchObject({ controller: P1, isExhausted: true, owner: P2 });
    await game.p1.cast("hunt");
    await game.settle();
    expect(game.state("borrowed").isReady).toBe(true);
    expect(game.state("lent").isExhausted).toBe(true);
  });

  test("parsed abilities: a single standard-timed spell ability — ready, all friendly units, no target choice; cost 1 + two hybrid pips", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: ["body", "chaos"], energyCost: 1, timing: "standard" });
    expect(def?.powerCost).toEqual(["rainbow", "rainbow"]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { target: { controller: "friendly", quantity: "all", type: "unit" }, type: "ready" },
      type: "spell",
    });
  });
});
