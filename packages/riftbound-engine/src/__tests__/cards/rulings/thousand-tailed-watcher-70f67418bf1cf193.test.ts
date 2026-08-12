/**
 * Ruling 70f67418bf1cf193 — Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · Unit · Mind · [7][mind] · 7 Might
 *     "[Accelerate] … When you play me, give enemy units -3 [Might] this turn, to a minimum of 1 [Might]."
 *   × Janna, Savior (sfd-053-221) · [Reaction] unit · [3][calm] · 3 Might
 *   × Gust (ogn-169-298) · [Reaction] spell · Fight or Flight (ogn-168-298) · [Action] spell
 *
 * Q: Can I react to the Watcher's ability?
 * A: Yes. Playing the unit itself makes no Chain and cannot be responded to; its "When you play me" trigger DOES go on
 *    the Chain, and players may answer it with [Reaction] cards (not [Action] cards on someone else's turn). A unit
 *    played in response is on the board when the trigger resolves, so it is caught by the -3; one played afterwards is not.
 * Rules: 406.4 (reactions before a Chain item resolves), 384 (LIFO), 355.1.b ([Action] = your turn or a showdown),
 *        359.3.f (an effect reads the board as it resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WATCHER = "ogn-116-298";
const JANNA_SAVIOR = "sfd-053-221";
const GUST = "ogn-169-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

/** Inline [1] action spell: deal 1 to a unit — used only to open a later Chain window on P1's turn. */
const STING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Test Sting",
  timing: "action",
};

/** P1's turn with [8][mind] (Watcher 7+[mind], then [1] for the Sting). P2 holds bf1 with a 5-Might Grunt and has reactions. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { mind: 1 } })
    .resources(P2, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Grunt" }, "grunt")
    .unit(P2, "bf1", { might: 2, name: "Runt" }, "runt") // small enough for Gust
    .hand(P1, WATCHER, "watcher")
    .hand(P1, STING, "sting")
    .hand(P2, JANNA_SAVIOR, "janna")
    .hand(P2, GUST, "gust")
    .hand(P2, FIGHT_OR_FLIGHT, "fof");
}

/** Pass priority on the chain until it empties. */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 12 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else if (d?.kind === "pick") {
      await game.seat(d.seat).pick(d.options[0]!.key);
    } else if (d?.kind === "yes-no") {
      await game.seat(d.seat).no();
    } else {
      return;
    }
  }
}

describe("Ruling 70f67418bf1cf193 — the Watcher's play trigger uses the Chain and can be answered with reactions", () => {
  test("playing the Watcher itself is not a Chain event: it is on the board at once, and what sits on the Chain is its trigger, with priority open", async () => {
    const game = await board().build();
    await game.p1.play("watcher", { to: "base" });
    expect(game.zoneOf("watcher")).toBe("base"); // the unit entered without using the chain
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "watcher", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.state("grunt").might).toBe(5); // nothing has resolved yet
  });

  test("P2 may answer the trigger with a [Reaction] (Gust) but NOT with an [Action] card on P1's turn", async () => {
    const game = await board().build();
    await game.p1.play("watcher", { to: "base" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    expect(game.p2.can("cast", "fof")).toBe(false); // [Action]: only on your turn or in a showdown
    expect((await game.p2.try((p) => p.cast("fof", { targets: "grunt" }))).ok).toBe(false);
    await game.p2.cast("gust", { targets: "runt" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["watcher", "gust"]);
    await resolveChain(game);
    expect(game.zoneOf("runt")).toBe("hand"); // Gust resolved first (LIFO)
  });

  test("a unit played as a reaction to the trigger IS on the board when it resolves, so it takes the -3 (down to the minimum of 1)", async () => {
    const game = await board().build();
    await game.p1.play("watcher", { to: "base" });
    await game.p1.passPriority();
    expect(game.p2.can("play", "janna")).toBe(true); // [Reaction] unit, playable inside the chain
    await game.p2.play("janna", { to: "base" });
    expect(game.zoneOf("janna")).toBe("base");
    await resolveChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("grunt").might).toBe(2); // 5 - 3
    expect(game.state("runt").might).toBe(1); // 2 - 3, floored at 1
    expect(game.state("janna").might).toBe(1); // 3 - 3, floored at 1
    expect(game.state("watcher").might).toBe(7); // "enemy units" — the Watcher's own side is untouched
  });

  test("…whereas a unit played AFTER the trigger has resolved is not affected: Janna played into a later Chain window keeps her 3 [Might]", async () => {
    const game = await board().build();
    await game.p1.play("watcher", { to: "base" });
    await resolveChain(game);
    expect(game.state("grunt").might).toBe(2);
    // A fresh Chain item gives P2 another window, this time after the -3 has already happened.
    await game.p1.cast("sting", { targets: "grunt" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.play("janna", { to: "base" });
    await resolveChain(game);
    expect(game.state("janna").might).toBe(3); // untouched by the already-resolved effect
    expect(game.state("grunt").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
