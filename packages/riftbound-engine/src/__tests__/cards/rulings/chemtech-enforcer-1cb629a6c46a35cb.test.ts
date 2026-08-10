/**
 * Ruling 1cb629a6c46a35cb — Chemtech Enforcer (OGN-003 → ogn-003-298) · Unit · Fury · 2 · 2 Might
 *     "[Assault 2] — When you play me, discard 1."
 *   × Super Mega Death Rocket! (OGN-252 → ogn-252-298) — "Deal 5 to a unit. When you conquer, you may discard 1 to
 *     return this from your trash to your hand."  (the "Jinx Rocket" of the question)
 *
 * Q: Can you use the Rocket's conquer effect with no cards in hand?
 * A: No — "discard 1 TO return" is a cost; with nothing to discard the Rocket stays in the trash. Nuance: this does not
 *    apply to non-cost templating like Chemtech Enforcer's "When you play me, discard 1" — that trigger still happens
 *    and simply discards nothing if your hand is empty when it resolves.
 * Rules: 383.3.b / 404 (a triggered ability's "[cost] to" is paid when finalized; unpayable ⇒ can't be used),
 *        422 (discard), 359.3 (do as much as possible for plain instructions).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SMDR = "ogn-252-298";
const ENFORCER = "ogn-003-298";

/** P1's turn. SMDR already in P1's trash; P1's 3-Might Attacker will conquer P2's bf1 (1-Might Speedbump). */
function rocketBoard() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Attacker" }, "att")
    .unit(P2, "bf1", { might: 1, name: "Speedbump" }, "bump")
    .trash(P1, SMDR, "rocket");
}

async function conquerBf1(game: Game): Promise<void> {
  await game.p1.move("att", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  if (game.decision()?.kind === "distribute") {
    await game.acting().distribute({ bump: 3 });
  }
  if (game.decision()?.kind === "order") {
    await game.acceptTriggerOrder();
  }
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
}

describe("Ruling 1cb629a6c46a35cb — SMDR's 'discard 1 to return this' needs a card in hand", () => {
  test("empty hand: on the conquer the Rocket's trigger cannot be used — either no prompt at all, or a prompt that cannot be accepted; the Rocket stays in the trash and P1's hand stays empty", async () => {
    const game = await rocketBoard().build();
    expect(game.p1.hand()).toEqual([]);
    await conquerBf1(game);
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "rocket") {
      // DESIGN (DESIGN.md § Paying costs): an unpayable optional trigger cost may still be SHOWN, but never accepted.
      expect(d.canAccept).toBe(false);
      expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
      await game.p1.no();
    }
    await game.settle();
    expect(game.zoneOf("rocket")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — one card in hand: the 'discard 1 to …' prompt is offered and payable; accepting discards that card and returns the Rocket to hand", async () => {
    const game = await rocketBoard().hand(P1, { might: 1, name: "Fodder" }, "fodder").build();
    await conquerBf1(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "rocket" } });
    expect(game.decision()?.kind === "yes-no" ? (game.decision() as { canAccept?: boolean }).canAccept : undefined).not.toBe(false);
    await game.p1.yes();
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("fodder");
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.zoneOf("rocket")).toBe("hand");
    expect(game.p1.hand()).toEqual(["rocket"]);
  });
});

describe("Ruling 1cb629a6c46a35cb — nuance: Chemtech Enforcer's 'When you play me, discard 1' is not a cost", () => {
  test("empty hand: the Enforcer is playable, its trigger goes on the chain anyway, and on resolution nothing is discarded — Enforcer in base, trash empty", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, ENFORCER, "enf").build();
    expect(game.p1.can("play", "enf")).toBe(true);
    await game.p1.play("enf");
    expect(game.zoneOf("enf")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "enf", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("enf")).toBe("base");
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("with a card in hand the same trigger DOES discard it (mandatory instruction, not optional)", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, ENFORCER, "enf").hand(P1, { might: 1, name: "Fodder" }, "fodder").build();
    await game.p1.play("enf");
    for (let i = 0; i < 6; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || d?.kind !== "pick" || d.seat !== P1) {
        break;
      }
      await game.p1.pick("fodder");
    }
    expect(game.zoneOf("enf")).toBe("base");
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
  });
});
