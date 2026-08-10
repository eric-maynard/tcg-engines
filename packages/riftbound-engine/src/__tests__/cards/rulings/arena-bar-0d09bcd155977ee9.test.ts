/**
 * Ruling 0d09bcd155977ee9 — Arena Bar (OGN-124 → ogn-124-298) · Gear · Body · [3]
 *     "[Exhaust]: Buff an exhausted friendly unit."
 *   × Sett, Brawler (OGN-164 → ogn-164-298) · 4 Might · "When I'm played and when I conquer, buff me.
 *     Spend my buff: Give me +4 [Might] this turn."
 *
 * Q: Can Sett's spend-a-buff ability be used during a showdown, and can Arena Bar re-buff him during a showdown so
 *    he can spend again for +8 in total?
 * A: No to both — neither ability has [Action]/[Reaction], so they are base speed only (your Action Phase, empty
 *    chain, no showdown). The +8 IS reachable before a showdown: Bar buffs the (exhausted) Sett → spend (+4) → a
 *    second Bar buffs him again → spend (+4) ⇒ +8 and no buff left.
 * Rules: 377/381 + 313.1.a / 343.1.b (untagged activated abilities only in a Neutral Open State on your turn),
 *        702.2/702.3 (one buff at a time; spending removes it), Arena Bar targets EXHAUSTED friendly units only.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ARENA_BAR = "ogn-124-298";
const SETT_BRAWLER = "ogn-164-298";

/** P1's turn. Buffed, READY Sett (4+1) in base; two ready Arena Bars; P2 holds bf1 with a Wall (9). */
function showdownBoard() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "base", SETT_BRAWLER, "sett", { buffed: true })
    .gear(P1, ARENA_BAR, "bar1")
    .gear(P1, ARENA_BAR, "bar2")
    .autoProcedures(false);
}

/** P1's turn, open main phase. Unbuffed, EXHAUSTED Sett (4) in base and two ready Arena Bars. */
function comboBoard() {
  return scenario()
    .unit(P1, "base", SETT_BRAWLER, "sett", { exhausted: true })
    .gear(P1, ARENA_BAR, "bar1")
    .gear(P1, ARENA_BAR, "bar2");
}

async function barOnSett(game: Game, bar: string): Promise<void> {
  const asksNow = game.p1.option("activate", bar)?.fields.some((f) => f.name === "targets") === true;
  await game.p1.activate(bar, 0, asksNow ? { targets: "sett" } : { answers: ["sett"] });
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("sett");
  }
  expect(game.state(bar).isExhausted).toBe(true);
  await game.settle();
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("sett");
    await game.settle();
  }
}

describe("Ruling 0d09bcd155977ee9 — Sett's 'Spend my buff' and Arena Bar are base speed: nothing during a showdown", () => {
  test("Sett attacks bf1 (showdown, P1 has Focus): his activated ability is NOT offered and activating it is refused; he stays 5", async () => {
    const game = await showdownBoard().build();
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });
    await game.p1.move("sett", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("sett").isExhausted).toBe(true); // moved ⇒ exhausted, so he would even be a legal Bar target
    expect(game.p1.can("activate", "sett")).toBe(false);
    const r = await game.p1.try((p) => p.activate("sett", 1));
    expect(r.ok).toBe(false);
    expect(game.state("sett")).toMatchObject({ isBuffed: true, mightModifier: 0 });
  });

  test("…and Arena Bar cannot be activated during that showdown either (same reason: no Action/Reaction keyword)", async () => {
    const game = await showdownBoard().build();
    await game.p1.move("sett", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "bar1")).toBe(false);
    expect(game.p1.can("activate", "bar2")).toBe(false);
    const r = await game.p1.try((p) => p.activate("bar1", 0, { targets: "sett" }));
    expect(r.ok).toBe(false);
    expect(game.state("bar1").isReady).toBe(true);
    expect(game.p1.legal().map((o) => o.verb)).not.toContain("activate");
  });

  test("after P1 passes Focus, P2's showdown window offers P1 nothing either; once combat is over and the state is open again on P1's turn, Bar becomes usable", async () => {
    const game = await showdownBoard().autoProcedures(true).build();
    await game.p1.move("sett", "bf1");
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.can("activate", "bar1")).toBe(false);
    await game.settle(); // 5 into 9: Sett dies
    expect(game.zoneOf("sett")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    // No exhausted friendly unit left ⇒ still nothing to buff, but the speed restriction itself is gone.
    expect(game.p1.can("activate", "bar1")).toBe(false);
  });
});

describe("Ruling 0d09bcd155977ee9 — the +8 line works at base speed: Bar → spend → Bar → spend", () => {
  test("step 1: Arena Bar only buffs an EXHAUSTED friendly unit — the exhausted, unbuffed Sett is its (only) legal target; a ready Sett would not be", async () => {
    const game = await comboBoard().build();
    expect(game.p1.option("activate", "bar1")?.fields.find((f) => f.arg === "targets")?.options).toEqual([["sett"]]);
    const ready = await scenario().unit(P1, "base", SETT_BRAWLER, "sett").gear(P1, ARENA_BAR, "bar1").build();
    expect(ready.p1.can("activate", "bar1")).toBe(false);
  });

  test("full sequence in the open main phase: Bar1 buffs Sett (5) → spend (+4 → 8, no buff) → Bar2 buffs again (9) → spend (+4 → 12): Sett ends at 4 + 8 = 12 with NO buff, both Bars exhausted, nothing paid from the pool", async () => {
    const game = await comboBoard().build();
    expect(game.state("sett")).toMatchObject({ isBuffed: false, isExhausted: true, might: 4 });
    expect(game.p1.can("activate", "sett")).toBe(false); // no buff to spend yet

    await barOnSett(game, "bar1");
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });

    expect(game.p1.can("activate", "sett")).toBe(true);
    await game.p1.activate("sett", 1);
    expect(game.state("sett").isBuffed).toBe(false); // the buff is the cost, gone on activation
    await game.settle();
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 8, mightModifier: 4 });

    await barOnSett(game, "bar2");
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 9 });

    await game.p1.activate("sett", 1);
    await game.settle();
    expect(game.state("sett")).toMatchObject({ isBuffed: false, isExhausted: true, might: 12, mightModifier: 8 });
    expect(game.state("bar1").isExhausted).toBe(true);
    expect(game.state("bar2").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance: the +8 is 'this turn' — after the turn passes Sett is back to a plain unbuffed 4", async () => {
    const game = await comboBoard().build();
    await barOnSett(game, "bar1");
    await game.p1.activate("sett", 1);
    await game.settle();
    await barOnSett(game, "bar2");
    await game.p1.activate("sett", 1);
    await game.settle();
    expect(game.state("sett").might).toBe(12);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 4, mightModifier: 0 });
  });
});
