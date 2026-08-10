/**
 * Ruling 77055e7c9dd5339b — Sett, Brawler (OGN-164 → ogn-164-298) · 5+[body] · 4 Might "When I'm played and when I conquer, buff me.
 *   Spend my buff: Give me +4 [Might] this turn." × Call to Glory (OGN-207 → ogn-207-298) · Reaction · [3] "As you play this, you may
 *   spend a buff as an additional cost. If you do, ignore this spell's cost. Give a unit +3 [Might] this turn."
 *   × Defy (OGN-045 → ogn-045-298) · Reaction · [1][calm] "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *
 * Q: Why doesn't Sett get +4 when his buff is spent to play Call to Glory during a showdown (and it gets Defied)?
 * A: Spending the buff is a COST of Call to Glory, paid as it goes on the chain — it is not Sett's activated ability (which is
 *    only usable on your turn with an empty chain and no showdown). Call to Glory gives +3 only if it resolves; countered by
 *    Defy it never does. Net: buff gone, no +4, no +3.
 * Rules: 356.4 (additional costs paid on play), 425.1 (countered → no effect, costs not refunded), 402 (activated-ability timing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SETT = "ogn-164-298";
const CALL_TO_GLORY = "ogn-207-298";
const DEFY = "ogn-045-298";

/** P1's turn. Buffed Sett (4+1 = 5) ready in base, P1 has 0 energy but Call to Glory in hand. P2 holds bf1 with a Wall (6) and has Defy + [1][calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 0 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
    .unit(P1, "base", SETT, "sett", { buffed: true })
    .hand(P1, CALL_TO_GLORY, "ctg")
    .hand(P2, DEFY, "defy");
}

/** Sett attacks bf1 (showdown, P1 has Focus). */
async function settAttacks(): Promise<Game> {
  const game = await board().build();
  expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });
  await game.p1.move("sett", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 77055e7c9dd5339b — spending Sett's buff on Call to Glory is a cost, not his +4 ability; Defied, he gets nothing", () => {
  test("control: in the open main phase (his turn, empty chain, no showdown) Sett's activated ability IS usable: spend the buff → +4 this turn (5 → 8)", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "sett")).toBe(true);
    await game.p1.activate("sett");
    await game.settle();
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 8, mightModifier: 4 });
  });

  test("during the showdown Sett's activated ability is NOT available (only on your turn with no chain and no showdown)", async () => {
    const game = await settAttacks();
    expect(game.p1.can("activate", "sett")).toBe(false);
    const r = await game.p1.try((p) => p.activate("sett"));
    expect(r.ok).toBe(false);
  });

  test("P1 (0 energy) plays Call to Glory on Sett spending his buff: the buff is gone AS IT GOES ON THE CHAIN (cost), and Sett is 4 — no +4 triggered, no +3 yet", async () => {
    const game = await settAttacks();
    expect(game.p1.can("cast", "ctg")).toBe(true);
    await game.p1.cast("ctg", { payOptional: true, targets: "sett" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ctg"]); // just the spell — no Sett ability/trigger
    expect(game.p1.energy()).toBe(0);
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 4, mightModifier: 0 });
  });

  test("P2 Defies it (Call to Glory costs [3], no Power — a legal Defy object): countered, never resolves → Sett stays at 4 with no buff, no +3, no +4", async () => {
    const game = await settAttacks();
    await game.p1.cast("ctg", { payOptional: true, targets: "sett" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.cast("defy", { targets: "ctg" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ctg", "defy"]);
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind !== "action") {
        break;
      }
      await game.seat(d.seat).passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("ctg")).toBe("trash");
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 4, mightModifier: 0, zone: "battlefield-bf1" });
    // The buff (the cost) is not refunded; the showdown goes on with a 4-Might Sett into a 6-Might Wall.
    await game.settle();
    expect(game.zoneOf("sett")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    // (The harness's costPaid invariant flags the ignored [3] — that IS the card text, not a rules breach.)
    expect(game.violations().filter((v) => v.invariant !== "costPaid")).toEqual([]);
  });

  test("contrast: un-Defied, Call to Glory RESOLVES for +3 (not +4): Sett 4 → 7 this turn", async () => {
    const game = await settAttacks();
    await game.p1.cast("ctg", { payOptional: true, targets: "sett" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("ctg")).toBe("trash");
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 7, mightModifier: 3 });
  });
});
