/**
 * Ruling 1246cd4a68e62b0b — Relentless Pursuit (SFD-184 → sfd-184-221) · Spell · Fury/Body · 2 + [rainbow] · [Action]
 *     "Move a friendly unit. You may attach an Equipment with the same controller to it. This turn, that unit has 'When I
 *      conquer, you may move me to my base.'"
 *   × Lucian, Merciless (sfd-113-221) · 3 Might "[Weaponmaster] The first time I conquer each turn, ready me."
 *
 * Q: Does the Relentless Pursuit move to base after conquering "use up" the unit's ready (Lucian's own ready trigger)?
 * A: No. The granted "you may move me to my base" and Lucian's printed "ready me" are two SEPARATE triggered abilities
 *    that trigger simultaneously on the conquer; you choose their order. The move is an effect, not a Standard Move — it
 *    costs no exhaustion and consumes nothing. Either order, Lucian ends up in base AND ready.
 * Rules: 383.3.d (simultaneous triggers of one controller — that player orders them), 364.3 (granted ability this turn),
 *        421 vs 141 (move by effect ≠ Standard Move; no exhaust), 469.1 (conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game, OrderDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RELENTLESS_PURSUIT = "sfd-184-221";
const LUCIAN_MERCILESS = "sfd-113-221";

/** P1's turn. Lucian is EXHAUSTED in base (so "ready me" is observable). P2 holds bf1 with Weak (1); bf2 open. Pursuit + [2][rainbow]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 1, name: "Weak" }, "weak")
    .unit(P1, "base", LUCIAN_MERCILESS, "lucian", { exhausted: true })
    .hand(P1, RELENTLESS_PURSUIT, "pursuit");
}

/**
 * Pursuit moves the exhausted Lucian to bf1 (destination asked at once); Pursuit resolves; showdown: both pass; Lucian (3)
 * kills Weak (1) and CONQUERS. Stop at the first post-conquer prompt.
 */
async function lucianConquersViaPursuit(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("pursuit", { targets: "lucian" });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
  await game.p1.pick("battlefield-bf1");
  await game.p1.passPriority();
  await game.p2.passPriority(); // Pursuit resolves: Lucian arrives (still exhausted — an effect move)
  expect(game.locationOf("lucian")).toBe("bf1");
  expect(game.state("lucian").isExhausted).toBe(true);
  await game.p1.passFocus();
  await game.p2.passFocus(); // combat
  expect(game.zoneOf("weak")).toBe("trash");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
  return game;
}

describe("Ruling 1246cd4a68e62b0b — Pursuit's 'move me to base' and Lucian's 'ready me' are independent conquer triggers; the move consumes no ready", () => {
  test("on the conquer TWO separate triggers of Lucian's are created: the granted 'you may move me to my base' asks its opt-in, and P1 is offered the ORDER of the two simultaneous triggers", async () => {
    const game = await lucianConquersViaPursuit();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "lucian", pendingChoiceType: "opt-in" }, timing: "FIN" });
    await game.p1.yes();
    const d = game.decision() as OrderDecision;
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    expect(d.items).toHaveLength(2);
    expect(d.items.every((i) => i.card === "lucian")).toBe(true);
    await game.acceptTriggerOrder();
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "lucian", controller: P1, triggered: true }),
      expect.objectContaining({ cardId: "lucian", controller: P1, triggered: true }),
    ]);
  });

  test("order A (move-to-base resolves first, then ready): Lucian goes home still exhausted, THEN readies — ends in base, READY", async () => {
    const game = await lucianConquersViaPursuit();
    await game.p1.yes();
    await game.acceptTriggerOrder(); // listed order: the granted move on top
    await game.p1.passPriority();
    await game.p2.passPriority(); // top item
    expect(game.locationOf("lucian")).toBe("base");
    expect(game.state("lucian").isExhausted).toBe(true); // the move neither readied nor exhausted him
    await game.p1.passPriority();
    await game.p2.passPriority(); // ready me
    expect(game.state("lucian")).toMatchObject({ isReady: true, zone: "base" });
    expect(game.chain()).toEqual([]);
  });

  test("order B (ready first, then move-to-base): Lucian readies at bf1, THEN is moved home — and is STILL ready there: the effect move did not 'use' the ready", async () => {
    const game = await lucianConquersViaPursuit();
    await game.p1.yes();
    const d = game.decision() as OrderDecision;
    expect(d.kind).toBe("order");
    await game.p1.order([...d.items.map((i) => i.key)].reverse()); // put the ready trigger on top
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("lucian")).toMatchObject({ isReady: true, location: "bf1" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("lucian")).toMatchObject({ isReady: true, zone: "base" });
  });

  test("payoff: back in base and ready, Lucian can take a Standard Move again this very turn (onto open bf2 → a second conquer point)", async () => {
    const game = await lucianConquersViaPursuit();
    await game.p1.yes();
    await game.settle();
    expect(game.state("lucian")).toMatchObject({ isReady: true, zone: "base" });
    expect(game.p1.legal().some((o) => o.verb === "move")).toBe(true);
    await game.p1.move("lucian", "bf2");
    expect(game.state("lucian").isExhausted).toBe(true); // THIS is a Standard Move — it exhausts
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no(); // the turn-long grant offers the move home again; not needed here
      await game.settle();
    }
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
