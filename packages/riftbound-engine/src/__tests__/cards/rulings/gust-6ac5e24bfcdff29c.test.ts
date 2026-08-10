/**
 * Ruling 6ac5e24bfcdff29c — Gust (OGN-169 → ogn-169-298) · Chaos Reaction · [1] "Return a unit at a battlefield with 3 [Might]
 *     or less to its owner's hand."
 *   × Irresistible Faefolk (UNL-112 → unl-112-219) · Unit · Body · [2] · 1 Might "When I move to a battlefield, you may move an
 *     enemy unit to that battlefield."
 *
 * Q: Can you Gust "on a move trigger"?
 * A: Yes. The move itself can't be responded to, but the triggered ability it causes goes on the chain (Closed state) and
 *    Reactions like Gust may answer it. Gusting away the unit that triggered does not remove the trigger: it still resolves,
 *    using the location noted when it triggered (the enemy unit is still moved there).
 * Rules: 441.3.c (moves are not chain items), 383 / 359.3.f.3 (triggered ability on the chain; notes its information),
 *        336 (Reactions during a Closed state), trigger independence from its source.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const FAEFOLK = "unl-112-219";

/**
 * P1's turn. P1 holds bf1 with a 4-Might Holder; Faefolk (1) ready in P1's base. P2's 3-Might Victim holds bf2, a 2-Might
 * Homebody sits in P2's base; P2 has Gust + exactly [1].
 */
function board() {
  return scenario()
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 4, name: "Holder" }, "holder")
    .unit(P1, "base", FAEFOLK, "fae")
    .unit(P2, "bf2", { might: 3, name: "Victim" }, "victim")
    .unit(P2, "base", { might: 2, name: "Homebody" }, "home")
    .hand(P2, GUST, "gust");
}

/** Faefolk moves to bf1; P1 opts into the trigger and aims it at the Victim; stops at P1's priority on the trigger. */
async function faefolkMovesIn(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("fae", "bf1");
  expect(game.locationOf("fae")).toBe("bf1"); // the move itself is done — instantaneous, nothing to respond to
  for (let i = 0; i < 4; i++) {
    const d: Decision | null = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
    } else if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.key).toSorted()).toEqual(["home", "victim"]);
      await game.p1.pick("victim");
    } else if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fae", controller: P1, targets: ["victim"], triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 6ac5e24bfcdff29c — Gust can answer a move TRIGGER; the trigger still resolves without its source", () => {
  test("the move puts Faefolk's triggered ability on the chain (Closed state); when priority reaches P2, Gust — a Reaction — is legal and Faefolk (1 Might, at a battlefield) is a legal pick", async () => {
    const game = await faefolkMovesIn();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    const offered = (game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("fae");
    await game.p2.cast("gust", { targets: "fae" });
    expect(game.p2.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["fae", "gust"]);
  });

  test("LIFO: Gust resolves first — Faefolk returns to P1's hand — and the move trigger is STILL on the chain", async () => {
    const game = await faefolkMovesIn();
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "fae" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("fae")).toBe("hand");
    expect(game.p1.hand()).toContain("fae");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fae", targets: ["victim"], triggered: true })]);
    expect(game.locationOf("victim")).toBe("bf2");
  });

  test("ruling: the trigger then resolves anyway, at the NOTED location — the Victim is moved to bf1 (where Faefolk had arrived) even though Faefolk is gone; a combat opens there with P2 attacking", async () => {
    const game = await faefolkMovesIn();
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "fae" });
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fae")).toBe("hand");
    expect(game.locationOf("victim")).toBe("bf1");
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1" });
    expect(game.state("victim").combatRole).toBe("attacker");
    expect(game.state("holder").combatRole).toBe("defender");
    await game.settle(); // 3 vs 4: the dragged-in Victim dies
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: the MOVE itself offered P2 nothing — P2's first say came only once the trigger was a chain item (no decision for P2 between the move and the trigger's opt-in)", async () => {
    const game = await board().build();
    await game.p1.move("fae", "bf1");
    const d = game.decision();
    expect(d?.seat).toBe(P1); // straight to P1's own trigger handling; P2 was never asked about the move
    expect(d?.kind === "action" && d.seat === P2).toBe(false);
  });
});
