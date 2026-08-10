/**
 * Ruling 3efbe2a85dc7cc94 — Windsinger (SFD-138 → sfd-138-221) · Unit · Chaos · [2] · 1 Might
 *   "[Hidden] When you play me, you may return another unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: Can Windsinger target a unit at another battlefield if it is played from hidden?
 * A: No. When a card is played from its Hidden (face-down) state, the targets its "When you play me" ability chooses
 *    must be at the battlefield where it was hidden. A unit at a different battlefield cannot be chosen.
 * Rules: 811.1.d.2 (from-hidden: choices limited to that battlefield), 811.6 (face-down card is played as a Reaction),
 *        811.1.d.1 (it enters at that battlefield).
 *
 * This file exercises the Reaction case: the opponent attacks P1's OTHER battlefield with a 3-Might unit; revealing the
 * Windsinger hidden at bf1 cannot bounce that attacker at bf2.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WINDSINGER = "sfd-138-221";

type PickD = Extract<Decision, { kind: "pick" }>;

/**
 * P1's turn 2. P1 holds bf1 (Guard 2, Sentry 3) and bf2 (Holder 2). P2's 3-Might Raider waits in base.
 * P1 hides Windsinger at bf1 and passes; on P2's turn the Raider attacks bf2.
 */
async function raidOnBf2(): Promise<Game> {
  const game = await scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P1, "bf1", { might: 3, name: "Sentry" }, "sentry")
    .unit(P1, "bf2", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, WINDSINGER, "ws")
    .build();
  await game.p1.hide("ws", "bf1");
  expect(game.zoneOf("ws")).toBe("facedown-bf1");
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  await game.p2.move("raider", "bf2");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

/** Reveal Windsinger and step to her target prompt (answering the "you may" with yes). */
async function revealToPick(game: Game): Promise<PickD | null> {
  expect(game.p1.can("reveal", "ws")).toBe(true); // 811.6 — the face-down card is a Reaction
  await game.p1.reveal("ws");
  expect(game.zoneOf("ws")).toBe("battlefield-bf1"); // 811.1.d.1 — enters where she was hidden, not at the fight
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
    } else if (d?.kind === "pick" && d.seat === P1) {
      return d;
    } else {
      break;
    }
  }
  return null;
}

describe("Ruling 3efbe2a85dc7cc94 — played from hidden at bf1, Windsinger cannot choose the 3-Might attacker at bf2", () => {
  test("the target prompt offers exactly the other units at bf1 (Guard, Sentry): the Raider and the Holder at bf2 are not choices", async () => {
    const game = await raidOnBf2();
    const d = await revealToPick(game);
    expect(d).not.toBeNull();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d!.options.map((o) => o.card ?? o.key).toSorted()).toEqual(["guard", "sentry"]);
  });

  test("naming the Raider anyway is refused (a bf1 unit must be named instead); the Raider stays and the combat at bf2 goes ahead (Raider 3 kills Holder 2 and conquers bf2)", async () => {
    const game = await raidOnBf2();
    await revealToPick(game);
    const r = await game.p1.try((p) => p.pick("raider"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("raider")).toBe("battlefield-bf2");
    await game.p1.pick("sentry"); // having said "yes", one of the legal (bf1) units must be named
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("hand");
    expect(game.p2.hand()).not.toContain("raider");
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.locationOf("raider")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.zoneOf("ws")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("what IS legal from hidden: bouncing a unit at her own battlefield (the Guard returns to P1's hand)", async () => {
    const game = await raidOnBf2();
    await revealToPick(game);
    await game.p1.pick("guard");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("hand");
    expect(game.p1.hand()).toContain("guard");
    expect(game.locationOf("sentry")).toBe("bf1");
  });
});
