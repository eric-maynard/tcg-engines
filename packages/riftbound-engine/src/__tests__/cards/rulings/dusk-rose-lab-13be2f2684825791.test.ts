/**
 * Ruling 13be2f2684825791 — Dusk Rose Lab (UNL-209 → unl-209-219) · Battlefield
 *   "At the start of your Beginning Phase, you may kill a unit you control here to draw 1. (This happens before scoring.)"
 *
 * Q: Can the opponent react to Dusk Rose Lab's ability in the Beginning Phase, even if there are no units there?
 * A: No. The ability is optional ("you may"): you decide at the start of your Beginning Phase; if you use it,
 *    killing the unit is a COST paid during finalization — before opponents get priority — and "draw 1" is the
 *    finalized chain item they may then react to. With no unit there the cost can't be paid, so the ability never
 *    becomes a finalized item and there is nothing to react to.
 * Rules: 383.3.a (leading "you may" decided at finalization), 383.3.b / 404.1 (kill = base cost, paid at
 *        finalization), 402.4 / 404.2 (unpayable ⇒ removed, no chain item), 187.6.c ("you" = the controller),
 *        190.4.c (and with no unit there, control itself lapses in an Open State).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DUSK_ROSE_LAB = "unl-209-219";
/** P2's would-be answer: a free [Reaction] (pools are empty at the start of P1's turn). */
const ZAP = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Zap",
  timing: "reaction",
} as const;
/** P2's own-turn removal: a free [Action] "Kill a unit." */
const CULL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Cull",
  timing: "action",
} as const;

/** End of P2's turn 2. P1 controls the live Lab; `withUnit` puts P1's Assistant (2) on it. P2 holds Zap (Reaction) and Cull (Action). */
function board(withUnit: boolean) {
  const s = scenario()
    .turn(2)
    .active(P2)
    .battlefield("lab", { controller: P1, def: DUSK_ROSE_LAB, inert: false, owner: P1 })
    .unit(P2, "base", { might: 3, name: "Theirs" }, "theirs")
    .unit(P1, "base", { might: 3, name: "Homebody" }, "home")
    .hand(P2, ZAP, "zap")
    .hand(P2, CULL, "cull");
  return withUnit ? s.unit(P1, "lab", { might: 2, name: "Assistant" }, "assistant") : s;
}

interface Seen {
  kind: Decision["kind"];
  seat: string;
  context?: string;
  chain: string[];
  assistantAlive: boolean;
}

/** P2 ends the turn; walk P1's Beginning Phase recording every decision until P1's open main phase. */
async function beginP1Turn(withUnit: boolean, optIn: boolean, prebuilt?: Game): Promise<{ game: Game; seen: Seen[] }> {
  const game = prebuilt ?? (await board(withUnit).build());
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  const seen: Seen[] = [];
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    seen.push({
      assistantAlive: game.has("assistant") && game.zoneOf("assistant") === "battlefield-lab",
      chain: game.chain().map((c) => c.cardId),
      context: d.kind === "action" ? d.context : undefined,
      kind: d.kind,
      seat: d.seat,
    });
    if (d.kind === "yes-no" && d.seat === P1) {
      await (optIn ? game.p1.yes() : game.p1.no());
    } else if (d.kind === "pick" && d.seat === P1) {
      await game.p1.pick("assistant");
    } else if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else {
      await game.settle({ maxSteps: 1 });
    }
  }
  return { game, seen };
}

describe("Ruling 13be2f2684825791 — Dusk Rose Lab: optional, cost paid at finalization; nothing to react to when it can't be paid", () => {
  test("with a unit there: P1 is ASKED first (a 'you may' opt-in at finalization, seat P1) — before anyone has priority and before anything is killed", async () => {
    const { seen } = await beginP1Turn(true, true);
    expect(seen[0]).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(seen[0]?.assistantAlive).toBe(true);
    // No priority window preceded the question.
    expect(seen.findIndex((s) => s.kind === "action")).toBeGreaterThan(0);
  });

  test("opting in: the Assistant is killed AS THE COST during finalization — by the time P2 first holds priority the unit is already in the trash and the finalized item ('draw 1') is on the chain for P2 to react to", async () => {
    const { game, seen } = await beginP1Turn(true, true);
    const p2Window = seen.find((s) => s.kind === "action" && s.context === "chain" && s.seat === P2);
    expect(p2Window).toBeDefined();
    expect(p2Window!.assistantAlive).toBe(false);
    expect(p2Window!.chain).toEqual(["lab"]);
    // …and it all resolves: P1 drew 1 off the Lab + 1 in the Draw step; the Lab, now empty, scores no hold.
    expect(game.zoneOf("assistant")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("(P2 really can react in that window: Zap resolves on top of the Lab's draw)", async () => {
    const game = await board(true).build();
    await game.p2.endTurn();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("assistant");
    }
    expect(game.zoneOf("assistant")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["lab"]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "zap")).toBe(true);
    await game.p2.cast("zap", { targets: "home" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["lab", "zap"]);
    await game.settle();
    expect(game.state("home").damage).toBe(1);
    expect(game.p1.hand()).toHaveLength(2);
  });

  test("declining the 'you may': no cost paid, NO chain item at all — P2 never receives priority during P1's Beginning Phase; the Assistant lives and holds the Lab (1 point)", async () => {
    const { game, seen } = await beginP1Turn(true, false);
    expect(seen.some((s) => s.kind === "action" && s.seat === P2)).toBe(false);
    expect(seen.every((s) => s.chain.length === 0 || s.kind === "yes-no")).toBe(true);
    expect(game.zoneOf("assistant")).toBe("battlefield-lab");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(1); // Draw step only
  });

  test("the ruling's hypothetical — P1 controls the Lab but has NO unit there: the kill cost is unpayable, so no item is ever finalized — no question worth answering, nothing on the chain, and P2 gets NO reaction window before P1's main phase; no Lab draw", async () => {
    const { game, seen } = await beginP1Turn(false, true);
    expect(seen.some((s) => s.seat === P2)).toBe(false);
    expect(seen.every((s) => s.chain.length === 0)).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(1); // Draw step only
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("the way that state really arises — P2 kills the Assistant on P2's turn (so P1's control lapses in the open Cleanup, 190.4.c) then ends the turn: again no Lab prompt, no chain, no window for P2, no draw and no hold", async () => {
    const game = await board(true).build();
    await game.p2.cast("cull", { targets: "assistant" });
    await game.settle();
    expect(game.zoneOf("assistant")).toBe("trash");
    expect(game.gameState.battlefields.lab?.controller ?? null).toBeNull();
    const { seen } = await beginP1Turn(true, true, game);
    expect(seen.some((s) => s.kind === "yes-no")).toBe(false);
    expect(seen.some((s) => s.seat === P2)).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
