/**
 * Ruling 867dcf4b7be2ebf2 — (no specific card) is the [Deflect] surcharge refunded if the spell is
 *   countered?
 *   Exercised with a Bird token (UNL-t02 → unl-t02, bare "[Deflect]"), Void Seeker
 *   (OGN-024 → ogn-024-298) "Deal 4 to a unit at a battlefield. Draw 1." and Defy
 *   (OGN-045 → ogn-045-298) "[Reaction] Counter a spell that costs no more than [4] and no more
 *   than [rainbow]."
 *
 * Q: If I play a spell targeting something with [Deflect] and my spell gets countered, do I still
 *    pay the Deflect cost?
 * A: Yes. Targets are chosen and every cost — including the mandatory [Deflect] additional cost —
 *    is paid as the spell is put on the chain and Finalized. Only after that can anyone react to
 *    it, so a counter always arrives after the money is gone. Nothing is refunded.
 * Rules: 355.5/355.6/357 (choose targets, then pay all costs, at Finalization), 809.1.d
 *        (Deflect is a MANDATORY additional cost), 359.3.c (reactions come after Finalization),
 *        425.1.c (a countered card's costs are not refunded).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BIRD = "unl-t02";
const VOID_SEEKER = "ogn-024-298"; // [3] + [fury]
const DEFY = "ogn-045-298"; // [1] + [calm], counters a spell costing ≤ [4] / ≤ [rainbow]

const SPARE = 3;

/** P2's turn. P2 casts Void Seeker at P1's Deflect Bird; P1 holds Defy. */
const board = () =>
  scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { fury: 1, mind: SPARE } })
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", BIRD, "bird")
    .hand(P2, VOID_SEEKER, "seeker")
    .hand(P1, DEFY, "defy");

describe("Ruling 867dcf4b7be2ebf2 — the Deflect surcharge is paid before anyone can counter", () => {
  test("the surcharge is gone the moment the spell hits the chain, before priority is ever offered", async () => {
    const game = await board().build();
    await game.p2.cast("seeker", { targets: "bird" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["seeker"]);
    expect(game.p2.energy()).toBe(0);
    expect(game.p2.power("fury")).toBe(0);
    expect(game.p2.power("mind")).toBe(SPARE - 1); // the [Deflect] 1 was already taken
  });

  test("countering it afterwards refunds nothing — the Bird lives and the payer is still down the Power", async () => {
    const game = await board().build();
    await game.p2.cast("seeker", { targets: "bird" });
    await game.p2.passPriority();
    await game.p1.cast("defy", { targets: "seeker" });
    await game.settle();
    expect(game.zoneOf("seeker")).toBe("trash"); // countered
    expect(game.state("bird").damage).toBe(0); // it never resolved
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0, mind: SPARE - 1 } });
    expect(game.violations()).toEqual([]);
  });

  test("and if you cannot afford the Deflect surcharge the spell is never offered at all — you never reach the counter", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3, power: { fury: 1 } }) // exactly the printed cost, no spare
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", BIRD, "bird")
      .hand(P2, VOID_SEEKER, "seeker")
      .build();
    const denied = await game.p2.try((p) => p.cast("seeker", { targets: "bird" }));
    expect(denied.ok).toBe(false);
    expect(game.zoneOf("seeker")).toBe("hand");
    expect(game.chain()).toEqual([]);
  });
});
