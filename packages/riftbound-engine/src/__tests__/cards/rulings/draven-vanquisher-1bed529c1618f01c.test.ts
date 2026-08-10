/**
 * Ruling 1bed529c1618f01c — Draven, Vanquisher (SFD-020 → sfd-020-221) · Champion Unit · Fury · 4 · 4 Might
 *     "When I win a combat, play a Gold gear token exhausted.
 *      When I attack or defend, you may pay [fury]. If you do, give me +2 [Might] this turn."
 *   × Reaver's Row (OGN-285 → ogn-285-298) · Battlefield "When you defend here, you may move a friendly unit here to base."
 *
 * Q: When attacking with Draven, is the [fury] for his trigger paid when the ability goes on the chain or when it resolves?
 * A: On RESOLUTION. "you may pay [fury]. If you do, …" is a cost inside the effect text, decided as the ability resolves.
 *    Sequence: Draven's attack trigger goes on the chain (nothing paid) → the defender's "when you defend" triggers are
 *    added → reaction window → LIFO resolution; only when Draven's item resolves does his controller choose to pay, so
 *    they can first see whether e.g. Reaver's Row moved a defender away.
 * Rules: 205 + 444.2 (the CR's own examples: "pay [C]. If you do" is NOT a cost — the Pay is a game action performed,
 *    and declinable, as the ability RESOLVES), 336 (LIFO). Model note (383.3.a / 402.1): the LEADING "you may" is still
 *    answered while the trigger is finalized — a free "use it?" (timing FIN) that puts the item on the chain or drops
 *    it; the ruling's PAY timing (RES, fury uncommitted through the window) is exactly what the engine does.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAVEN = "sfd-020-221";
const REAVERS_ROW = "ogn-285-298";

/** P1's turn with exactly 1 fury. Draven (4) ready in base. P2 holds Reaver's Row (live) with Guard (3) + Runner (2). */
function board() {
  return scenario()
    .resources(P1, { power: { fury: 1 } })
    .battlefield("row", { controller: P2, def: REAVERS_ROW, inert: false })
    .unit(P1, "base", DRAVEN, "draven")
    .unit(P2, "row", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "row", { might: 2, name: "Runner" }, "runner");
}

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);

/** rule 383.3.a / 402.1 — Draven's leading "you may": P1 (turn player, asked first) opts in at FINALIZATION; nothing is paid (205). */
async function p1OptsIn(game: Game): Promise<void> {
  expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "draven" }, timing: "FIN" });
  await game.p1.yes();
  expect(game.p1.power("fury")).toBe(1);
}

/** P2 opts into Reaver's Row and CHOOSES the Runner (assert P2 is the one asked, with both units offered). */
async function p2SendsRunnerHome(game: Game): Promise<void> {
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
  await game.p2.yes();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P2 });
  expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["guard", "runner"]);
  await game.p2.pick("runner");
}

/** Pass priority until only Draven's item is left on the chain (Row resolved). */
async function resolveRowOnly(game: Game): Promise<void> {
  while (chainIds(game).length > 1 && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
  expect(chainIds(game)).toEqual(["draven"]);
}

describe("Ruling 1bed529c1618f01c — Draven's 'pay [fury]' is made when his trigger RESOLVES (the free 'use it?' opt-in is at finalization)", () => {
  test("Draven attacks Reaver's Row: his attack trigger goes on the chain with NOTHING paid — P1 only answers the free finalization opt-in (383.3.a), no PAY is asked; the defender's Row trigger is added above it and P2 is asked about it next", async () => {
    const game = await board().build();
    await game.p1.move("draven", "row");
    expect(game.state("draven").combatRole).toBe("attacker");
    expect(chainIds(game)).toEqual(["draven", "row"]);
    expect(game.chain()[0]).toMatchObject({ cardId: "draven", controller: P1, triggered: true });
    expect(game.chain()[1]).toMatchObject({ cardId: "row", controller: P2, triggered: true });
    await p1OptsIn(game);
    expect(game.p1.power("fury")).toBe(1);
    expect(game.state("draven").might).toBe(4);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "row" }, timing: "FIN" });
  });

  test("reaction window, then LIFO: Reaver's Row resolves first (Runner goes home) while Draven's item is still pending — and P1 STILL holds the fury at that point", async () => {
    const game = await board().build();
    await game.p1.move("draven", "row");
    await p1OptsIn(game);
    await p2SendsRunnerHome(game);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" }); // both may react now
    expect(game.p1.power("fury")).toBe(1);
    await resolveRowOnly(game);
    expect(game.locationOf("runner")).toBe("base"); // P1 has now SEEN the defender leave…
    expect(game.p1.power("fury")).toBe(1); // …and has not committed the fury
    expect(game.state("draven").might).toBe(4);
  });

  test("only when Draven's item resolves is P1 asked to pay: paying spends the fury and makes Draven 6 Might for the turn; he then beats the lone Guard", async () => {
    const game = await board().build();
    await game.p1.move("draven", "row");
    await p1OptsIn(game);
    await p2SendsRunnerHome(game);
    await resolveRowOnly(game);
    await game.acting().passPriority();
    if (game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    // Draven's item is resolving → the payment decision, for P1, now (444.2).
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "draven" }, timing: "RES" });
    expect(game.p1.power("fury")).toBe(1);
    await game.p1.yes();
    expect(game.p1.power("fury")).toBe(0);
    expect(game.state("draven").might).toBe(6);
    expect(game.state("draven").mightModifier).toBe(2);
    expect(game.chain()).toEqual([]);
    await game.settle(); // combat: 6 vs Guard 3
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("draven")).toBe("row");
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("444.2 — declining the pay at resolution: Draven stays 4 Might and keeps the fury", async () => {
    const game = await board().build();
    await game.p1.move("draven", "row");
    await p1OptsIn(game);
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no") {
        await game.seat(d.seat).no(); // P2 declines the Row move (FIN); P1 declines the fury (RES)
        if (d.seat === P1) {
          expect(d.timing).toBe("RES");
          break;
        }
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.acting().passPriority();
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.p1.power("fury")).toBe(1);
    expect(game.state("draven").might).toBe(4);
  });
});
