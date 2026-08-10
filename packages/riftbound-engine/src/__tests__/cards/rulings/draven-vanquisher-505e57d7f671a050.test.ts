/**
 * Ruling 505e57d7f671a050 — Draven, Vanquisher (SFD-020 → sfd-020-221) · Champion Unit · Fury · [4] · 4 Might
 *     "When I win a combat, play a Gold gear token exhausted. When I attack or defend, you may pay [fury]. If you do, give me
 *      +2 [Might] this turn."
 *   × Reaver's Row (OGN-285 → ogn-285-298) · Battlefield · "When you defend here, you may move a friendly unit here to base."
 *   (Tideturner ogn-199-298 is cited only for the "late arrivals still trigger" aside.)
 *
 * Q: Can Draven decide whether to use his attack ability AFTER the opponent decides whether to retreat with Reaver's Row?
 * A: Yes. Draven's "may pay" is decided when HIS trigger resolves. Reaver's Row (the defender's trigger, added after his)
 *    resolves first — the defender decides the retreat — and only then does Draven's item resolve and the attacker choose.
 * Rules: 383.4 (attack/defend triggers on the initial chain), 336–340 (LIFO), 205 + 444.2 ("pay [C]. If you do" is a game
 *    action performed — and declinable — as the ability RESOLVES). Model note (383.3.a / 402.1): Draven's LEADING "you may" is
 *    still a free "use it?" answered while his trigger is finalized (turn player first) — it commits no fury; the ruling's point
 *    (the PAY decision comes after the Row has resolved) is exactly what happens.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAVEN = "sfd-020-221";
const REAVERS_ROW = "ogn-285-298";

/** P1's turn with exactly 1 fury; Draven (4) ready in base. P2 holds Reaver's Row (live) with Guard (3) + Runner (2). */
function board() {
  return scenario()
    .resources(P1, { power: { fury: 1 } })
    .battlefield("row", { controller: P2, def: REAVERS_ROW, inert: false })
    .unit(P1, "base", DRAVEN, "draven")
    .unit(P2, "row", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "row", { might: 2, name: "Runner" }, "runner");
}

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);

/** rule 383.3.a / 402.1 — P1 (turn player, asked first) takes Draven's free finalization opt-in; no fury is spent (205). */
async function dravenOptsIn(game: Game): Promise<void> {
  expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "draven" }, timing: "FIN" });
  await game.p1.yes();
  expect(game.p1.power("fury")).toBe(1);
}

describe("Ruling 505e57d7f671a050 — the defender's Reaver's Row decision comes first; Draven's 'may pay [fury]' is decided afterwards", () => {
  test("Draven attacks: his attack trigger and then the Row's defend trigger stack on the initial chain (Row on top); after Draven's free opt-in the first REAL question is the defender's (P2) — no pay is asked of P1 and no fury is spent yet", async () => {
    const game = await board().build();
    await game.p1.move("draven", "row");
    expect(game.state("draven").combatRole).toBe("attacker");
    expect(chainIds(game)).toEqual(["draven", "row"]);
    expect(game.chain()[0]).toMatchObject({ cardId: "draven", controller: P1, triggered: true });
    expect(game.chain()[1]).toMatchObject({ cardId: "row", controller: P2, triggered: true });
    await dravenOptsIn(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "row" }, timing: "FIN" });
    expect(game.p1.power("fury")).toBe(1);
    expect(game.state("draven").might).toBe(4);
  });

  test("full order: P2 decides the retreat (yes → picks the Guard) → the Row resolves and the Guard goes home while Draven's item still waits → THEN P1 is asked to pay [fury], seeing the board, pays → Draven 6 beats the lone Runner", async () => {
    const game = await board().build();
    await game.p1.move("draven", "row");
    await dravenOptsIn(game);
    // 1. Defender's decision.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2 });
    await game.p2.yes();
    const pick = game.decision();
    expect(pick).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "row" } });
    expect(pick?.kind === "pick" ? pick.options.map((o) => o.key).sort() : []).toEqual(["guard", "runner"]);
    await game.p2.pick("guard");
    // 2. Reaction window, then the Row (top) resolves; Draven's item is still pending and P1 has committed nothing.
    for (let i = 0; i < 6 && chainIds(game).length > 1; i++) {
      const d = game.decision();
      expect(d?.kind === "yes-no" && d.seat === P1).toBe(false); // P1 is not asked before the Row resolves
      if (d?.kind !== "action" || !d.passKey) {
        break;
      }
      await game.seat(d.seat).pass();
    }
    expect(chainIds(game)).toEqual(["draven"]);
    expect(game.locationOf("guard")).toBe("base"); // the retreat happened first …
    expect(game.p1.power("fury")).toBe(1); // … while the fury is still unspent
    // 3. Draven's item resolves: NOW the attacker decides.
    for (let i = 0; i < 4 && game.decision()?.kind === "action"; i++) {
      await game.acting().passPriority();
    }
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "draven" }, timing: "RES" });
    await game.p1.yes();
    expect(game.p1.power("fury")).toBe(0);
    expect(game.state("draven")).toMatchObject({ might: 6, mightModifier: 2 });
    expect(game.chain()).toEqual([]);
    await game.settle(); // combat: 6 vs Runner 2
    expect(game.zoneOf("runner")).toBe("trash");
    expect(game.locationOf("draven")).toBe("row");
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("and the attacker may equally decline after seeing the retreat: P2 pulls the Runner, P1 keeps the fury and Draven (4) still beats the Guard (3)", async () => {
    const game = await board().build();
    await game.p1.move("draven", "row");
    await dravenOptsIn(game);
    await game.p2.yes();
    await game.p2.pick("runner");
    let asked = false;
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        expect(game.locationOf("runner")).toBe("base"); // the retreat is already known
        asked = true;
        await game.p1.no();
        break;
      }
      if (d?.kind === "action" && d.context === "chain" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(asked).toBe(true);
    expect(game.p1.power("fury")).toBe(1);
    expect(game.state("draven").might).toBe(4);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
  });
});
