/**
 * Ruling ad6c43a77840169b — Possession (OGN-203 → ogn-203-298) · Spell · Chaos · [8][chaos] · [Action]
 *   "Choose an enemy unit at a battlefield. Take control of it and recall it. (Send it to your base.
 *    This isn't a move.)"
 *
 * Q: Does the recalled character arrive exhausted or keep its current state, and can it move again if ready?
 * A: It keeps whatever state it was in — a Recall changes nothing and triggers nothing that keys on moving.
 *    If it comes home ready and it is your turn (and you are not in a showdown) you may then move it.
 * Rules: 453 (Recall: to base, state unchanged), 451.1 (a Recall is not a Move — no move triggers),
 *        451 (a Standard Move needs your Main Phase, Neutral Open, and a ready unit).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const POSSESSION = "ogn-203-298";
const HWEI = "unl-080-219"; // "When I move, draw 1, then discard 1. …" — the move-trigger oracle

/** P1's turn. P2 holds bf1 (a Keeper anchors control) plus the unit Possession will steal. */
function board(victimMeta: Record<string, unknown> = {}) {
  return scenario()
    .resources(P1, { energy: 9, power: { chaos: 3 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim", victimMeta)
    .unit(P2, "bf1", { might: 1, name: "Keeper" }, "keeper")
    .hand(P1, POSSESSION, "possession");
}

describe("Ruling ad6c43a77840169b — Possession recalls the stolen unit in whatever state it was in", () => {
  test("ruling: a READY enemy unit is taken and recalled to P1's base still ready", async () => {
    const game = await board({ exhausted: false }).build();
    expect(game.state("victim").isReady).toBe(true);
    await game.p1.cast("possession", { targets: "victim" });
    await game.settle();

    expect(game.state("victim").controller).toBe(P1);
    expect(game.state("victim").owner).toBe(P2);
    expect(game.locationOf("victim")).toBe("base");
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim").isReady).toBe(true);
    expect(game.state("victim").isExhausted).toBe(false);
  });

  test("ruling: an EXHAUSTED enemy unit stays exhausted after the recall — and cannot then be moved", async () => {
    const game = await board({ exhausted: true }).build();
    await game.p1.cast("possession", { targets: "victim" });
    await game.settle();
    expect(game.locationOf("victim")).toBe("base");
    expect(game.state("victim").isExhausted).toBe(true);
    const r = await game.p1.try((p) => p.move("victim", "bf2"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("victim")).toBe("base");
  });

  test("ruling: because it came home ready, P1 may move it on this same turn", async () => {
    const game = await board({ exhausted: false }).build();
    await game.p1.cast("possession", { targets: "victim" });
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    await game.p1.move("victim", "bf2");
    expect(game.locationOf("victim")).toBe("bf2");
    expect(game.state("victim").isExhausted).toBe(true); // the Standard Move DID exhaust it
  });

  test("nuance: the recall is not a Move — a stolen Hwei's 'When I move' ability does not trigger", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { chaos: 3 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P2, "bf1", HWEI, "hwei")
      .unit(P2, "bf1", { might: 1, name: "Keeper" }, "keeper")
      .hand(P1, POSSESSION, "possession")
      .build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;

    await game.p1.cast("possession", { targets: "hwei" });
    await game.settle();

    expect(game.locationOf("hwei")).toBe("base");
    expect(game.state("hwei").controller).toBe(P1);
    expect(game.chain()).toEqual([]);
    // "draw 1, then discard 1" never ran for either seat.
    expect(game.p1.hand().length).toBe(p1Hand - 1); // only Possession left the hand
    expect(game.p2.hand().length).toBe(p2Hand);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: a real Standard Move of that same Hwei DOES fire the move trigger", async () => {
    const game = await scenario()
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", HWEI, "hwei")
      .build();
    const deckBefore = game.p1.deck().length;
    await game.p1.move("hwei", "bf2");
    await game.settle();
    expect(game.p1.deck().length).toBe(deckBefore - 1); // draw 1 ran
    expect(game.p1.trash().length).toBe(1); // discard 1 ran
  });
});
