/**
 * Ruling 02de1a0ad99dd941 — (general Hidden timing; no specific card)
 *   Stand-ins: Fight or Flight (ogn-168-298) · [Hidden] [Action] [2] "Move a unit from a battlefield to its base." — the
 *   opponent's move EFFECT; Sprite Call (ogn-094-298) · [Hidden] [Action] "Play a ready 3 [Might] Sprite unit token with
 *   [Temporary]." — my card hidden at that battlefield on an earlier turn.
 *
 * Q: Can you play a hidden card at a battlefield in reaction to your unit being moved from that battlefield to base?
 * A: Yes — if the move comes from a spell/ability: that item goes on the chain, the state is Closed, you get priority and
 *    may flip the hidden card (hidden on a previous turn); it lands on top and resolves first (LIFO), then the move. You
 *    keep control of the battlefield while the chain is pending. A Standard Move never uses the chain, so there is
 *    nothing to react to.
 * Rules: 811 (Hidden: Reaction timing for [0], not the turn it was hidden, "here"), 332/336 (priority on a chain),
 *        340 (LIFO), 190.4/323.6 (control re-evaluated at an Open-State Cleanup), 140 (Standard Move: no chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";
const SPRITE_CALL = "ogn-094-298";

/** Turn 3, P2 active with [2]. P1 holds bf1 with a lone Warden (3) and Sprite Call facedown there (hidden earlier). */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Warden" }, "warden")
    .unit(P2, "bf2", { might: 2, name: "Sentry" }, "sentry")
    .facedown(P1, "bf1", SPRITE_CALL, "call")
    .hand(P2, FIGHT_OR_FLIGHT, "fof");
}

/** P2 casts Fight or Flight on the Warden and passes; P1 flips Sprite Call in response. */
async function flipInResponse(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("fof", { targets: "warden" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fof", controller: P2, targets: ["warden"] })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "call")).toBe(true);
  await game.p1.reveal("call");
  return game;
}

describe("Ruling 02de1a0ad99dd941 — flipping a hidden card in response to an EFFECT that moves your unit off that battlefield", () => {
  test("the opponent's move spell goes on the chain (Closed State) → I get priority and may play my hidden card there for [0]; it lands ON TOP: chain = [Fight or Flight, Sprite Call]", async () => {
    const game = await flipInResponse();
    expect(game.chain().map((c) => c.cardId)).toEqual(["fof", "call"]);
    expect(game.state("call").isHidden).toBe(false);
    expect(game.locationOf("warden")).toBe("bf1"); // nothing has moved yet
    expect(game.p1.energy()).toBe(0); // played from hidden for [0]
  });

  test("LIFO: my hidden card resolves FIRST (a ready Sprite token appears at bf1) while the Warden is still there; THEN Fight or Flight resolves and moves the Warden to base", async () => {
    const game = await flipInResponse();
    for (let i = 0; i < 8 && game.chain().some((c) => c.cardId === "call"); i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick(d.options.find((o) => o.key.includes("bf1"))?.key ?? d.options[0]!.key);
      } else if (d?.kind === "action") {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      const d = game.decision() as Extract<ReturnType<Game["decision"]>, { kind: "pick" }>;
      await game.p1.pick(d.options.find((o) => o.key.includes("bf1"))?.key ?? d.options[0]!.key);
    }
    expect(game.zoneOf("call")).toBe("trash");
    const sprite = game.p1.units("bf1").find((id) => id !== "warden");
    expect(sprite).toBeDefined();
    expect(game.state(sprite!)).toMatchObject({ isReady: true, isToken: true, might: 3 });
    expect(game.locationOf("warden")).toBe("bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fof" })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("warden")).toBe("base");
    // The battlefield was never lost: P1 held it throughout the chain and the Sprite holds it afterwards.
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("timing constraint: a card hidden THIS turn cannot be flipped in response (it must have been hidden on a previous turn)", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .resources(P1, { power: { rainbow: 1 } })
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Warden" }, "warden")
      .hand(P1, SPRITE_CALL, "call")
      .hand(P2, FIGHT_OR_FLIGHT, "fof")
      .build();
    await game.p1.hide("call", "bf1");
    expect(game.zoneOf("call")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "call")).toBe(false); // same turn
  });

  test("a STANDARD MOVE off the battlefield uses no chain: nobody gets priority, there is nothing to flip the card in response to — and with no unit of mine left there, control (and the facedown card) is gone at the next Cleanup", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 3, name: "Warden" }, "warden")
      .unit(P2, "bf2", { might: 2, name: "Sentry" }, "sentry")
      .facedown(P1, "bf1", SPRITE_CALL, "call")
      .build();
    expect(game.p1.can("reveal", "call")).toBe(true); // it IS flippable in an open state on my turn…
    await game.p1.move("warden", "base");
    // …but the Standard Move created no chain item and no reaction window for anyone.
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.locationOf("warden")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.zoneOf("call")).toBe("trash"); // 323.7: facedown card removed once control is lost
    expect(game.p1.can("reveal", "call")).toBe(false);
  });
});
