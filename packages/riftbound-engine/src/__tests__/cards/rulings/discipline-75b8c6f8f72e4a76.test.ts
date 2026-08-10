/**
 * Ruling 75b8c6f8f72e4a76 — Discipline (OGN-058 → ogn-058-298) · Reaction [2] "Give a unit +2 [Might] this turn. Draw 1."
 *   × Blade Dancer (SFD-195 → sfd-195-221, Irelia legend)
 *     "When you choose a friendly unit, you may exhaust me and pay [rainbow] to ready it.
 *      When you conquer, you may pay [1] to ready me."
 *
 * Q: I conquer with a READY Blade Dancer. Can I put the "pay [1] to ready me" trigger on the chain, then
 *    Discipline my (exhausted) unit, and use the legend's choose-trigger to ready that unit for [rainbow]?
 * A: Yes, all of it. The conquer trigger is opted into (pay [1]) at finalization and stays on the chain; the
 *    state is Closed but Discipline is a Reaction; choosing the unit triggers Blade Dancer #1 (exhaust + pay
 *    [rainbow] → ready the unit). LIFO: #1 readies the unit, Discipline resolves, then the conquer trigger
 *    readies the (now exhausted) legend — it ends ready. Readying an already-ready thing does nothing.
 * Rules: 383.4/383.3.a-b (optional trigger + cost at finalization), 309.1.a (Closed → Reactions), 340.1 (LIFO),
 *        415.1.c (ready a ready permanent = no-op).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DISCIPLINE = "ogn-058-298";
const BLADE_DANCER = "sfd-195-221";

/** P1's turn. Blade Dancer ready. bf1 open. Raider (3) in base; P1 has [3] (Discipline 2 + trigger 1) and 1 rainbow. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 1 } })
    .legend(P1, BLADE_DANCER, "bd")
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, DISCIPLINE, "disc");
}

/** Raider walks onto the open bf1 (exhausting itself), both pass Focus → P1 conquers; the legend's conquer trigger asks P1. */
async function conquer(): Promise<Game> {
  const game = await board().build();
  expect(game.state("bd").isReady).toBe(true);
  await game.p1.move("raider", "bf1");
  expect(game.state("raider").isExhausted).toBe(true);
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
  return game;
}

describe("Ruling 75b8c6f8f72e4a76 — conquer trigger on the chain → Discipline → Blade Dancer readies the unit → legend ends ready", () => {
  test("conquering surfaces Blade Dancer's 'you may pay [1] to ready me' as P1's opt-in at finalization, even though the legend is already ready", async () => {
    const game = await conquer();
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "bd", pendingChoiceType: "opt-in" } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bd", controller: P1, triggered: true })]);
    await game.p1.yes();
    expect(game.p1.energy()).toBe(2); // [1] paid now (383.3.b.1)
    expect(game.chain().map((c) => c.cardId)).toEqual(["bd"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("with that trigger pending (Closed state) Discipline — a Reaction — is playable on the exhausted Raider, and CHOOSING it triggers Blade Dancer #1: P1 is asked to exhaust the legend + pay [rainbow]", async () => {
    const game = await conquer();
    await game.p1.yes();
    expect(game.p1.can("cast", "disc")).toBe(true);
    await game.p1.cast("disc", { targets: "raider" });
    expect(game.p1.energy()).toBe(0);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "bd", pendingChoiceType: "opt-in" } });
    await game.p1.yes();
    expect(game.state("bd").isExhausted).toBe(true); // cost: exhaust me …
    expect(game.p1.power("rainbow")).toBe(0); // … and pay [rainbow]
    // Chain bottom→top: conquer trigger, Discipline, choose trigger.
    expect(game.chain().map((c) => c.cardId)).toEqual(["bd", "disc", "bd"]);
    expect(game.state("raider").isReady).toBe(false); // nothing resolved yet
  });

  test("LIFO resolution: choose-trigger readies the Raider → Discipline gives +2 and draws 1 → conquer trigger readies the exhausted legend; end state: Raider ready at 5, legend READY, all resources spent", async () => {
    const game = await conquer();
    await game.p1.yes();
    await game.p1.cast("disc", { targets: "raider" });
    await game.p1.yes();
    const handBefore = game.p1.hand().length;
    // 1) Blade Dancer #1
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain().map((c) => c.cardId)).toEqual(["bd", "disc"]);
    expect(game.state("raider")).toMatchObject({ isReady: true, might: 3 });
    expect(game.state("bd").isExhausted).toBe(true);
    // 2) Discipline
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain().map((c) => c.cardId)).toEqual(["bd"]);
    expect(game.state("raider")).toMatchObject({ isReady: true, might: 5 });
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.state("bd").isExhausted).toBe(true); // still exhausted until its own trigger resolves
    // 3) conquer trigger → ready me
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("bd").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("catch (415.1.c): had P1 NOT played Discipline, the paid-for conquer trigger resolves on an already-ready legend and simply does nothing", async () => {
    const game = await conquer();
    await game.p1.yes();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("bd").isReady).toBe(true);
    expect(game.p1.energy()).toBe(2); // the [1] is gone regardless
    expect(game.state("raider").isExhausted).toBe(true);
  });
});
