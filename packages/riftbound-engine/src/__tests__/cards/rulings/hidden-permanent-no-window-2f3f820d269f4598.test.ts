/**
 * Ruling 2f3f820d269f4598 — (no specific card) can a played permanent be answered before it lands?
 *   Exercised with Teemo, Scout (OGN-197 → ogn-197-298) · "[Hidden] … When you play me, give me +3 [Might]
 *   this turn." hidden at a battlefield, and Vengeance (OGN-229 → ogn-229-298) "Kill a unit."
 *
 * Q: I hold a battlefield with a unit and a hidden unit. In response to the opponent's chain I play the
 *    hidden unit — can the opponent then remove my original unit before the hidden one resolves, so that I
 *    lose control and lose both?
 * A: No. A permanent never lingers on the chain: playing it runs through to finalization and it becomes a
 *    game object at the battlefield at once, with no response window. Only abilities it triggers can be
 *    responded to.
 * Rules: 355 (playing a card: the permanent leaves the chain at finalization and enters the board),
 *        811.1 [Hidden] (Reaction timing, played from the facedown zone for [0]), 336–340 (only spells and
 *        abilities sit on the chain waiting to resolve), 383.3 (a triggered ability is a separate item).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TEEMO = "ogn-197-298"; // [Hidden] unit, 1 Might, "When you play me, give me +3 [Might] this turn."
const VENGEANCE = "ogn-229-298";

/** Turn 3, P2 active. P1 holds bf1 with a lone Warden and Teemo hidden there from an earlier turn. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 4, power: { order: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Warden" }, "warden")
    .facedown(P1, "bf1", TEEMO, "teemo")
    .hand(P2, VENGEANCE, "vengeance");
}

/** P2 aims Vengeance at the Warden and passes; P1 flips Teemo in response. */
async function flipInResponse(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("vengeance", { targets: "warden" });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.reveal("teemo");
  return game;
}

describe("Ruling 2f3f820d269f4598 — a played permanent lands immediately; nobody can answer it in between", () => {
  test("the moment Teemo is played he IS at the battlefield — he is not a pending item waiting to resolve", async () => {
    const game = await flipInResponse();
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect(game.locationOf("teemo")).toBe("bf1");
    expect(game.state("teemo").isHidden).toBe(false);
    // The only non-triggered item on the chain is still the opponent's spell.
    expect(game.chain().filter((i) => !i.triggered).map((i) => i.cardId)).toEqual(["vengeance"]);
    expect(game.p1.units("bf1").sort()).toEqual(["teemo", "warden"]);
  });

  test("what CAN be answered is the ability he triggers: 'when you play me' is its own chain item", async () => {
    const game = await flipInResponse();
    const trigger = game.chain().find((i) => i.cardId === "teemo");
    expect(trigger).toMatchObject({ controller: P1, triggered: true });
    expect(game.state("teemo").might).toBe(1); // the +3 has NOT happened yet — the trigger is pending
    await game.settle();
    expect(game.state("teemo").might).toBe(4);
  });

  test("so the opponent's removal cannot strand me: Vengeance kills the Warden, Teemo is already there and I keep the battlefield", async () => {
    const game = await flipInResponse();
    await game.settle();
    expect(game.zoneOf("warden")).toBe("trash");
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("removal aimed at the newcomer has to wait for a fresh chain: the [Action] kill spell is not castable while the chain is live, and by the time it is, Teemo is a normal legal target", async () => {
    const game = await board().hand(P2, VENGEANCE, "vengeance2").resources(P2, { energy: 8, power: { order: 4 } }).build();
    await game.p2.cast("vengeance", { targets: "warden" });
    await game.p2.passPriority();
    await game.p1.reveal("teemo");
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1");
    // P2 gets priority back, but Vengeance is [Action] timing — no Closed-State answer to the landing.
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ kind: "action", seat: P2 });
    expect(game.p2.can("cast", "vengeance2")).toBe(false);
    await game.settle();
    expect(game.zoneOf("warden")).toBe("trash");
    const targets = (game.p2.option("cast", "vengeance2")?.fields.find((f) => f.arg === "targets")?.options ?? []).flat();
    expect(targets).toContain("teemo");
  });
});
