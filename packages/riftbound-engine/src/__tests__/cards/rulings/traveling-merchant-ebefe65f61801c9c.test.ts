/**
 * Ruling ebefe65f61801c9c — Traveling Merchant (OGN-185 → ogn-185-298) · Unit · 2 Might · [2]
 *   "When I move, discard 1, then draw 1."
 *   × Rengar, Pouncing (SFD-025 → sfd-025-221) · [Reaction] unit · 3 Might · [Assault 2]
 *     "I can be played to a battlefield you're attacking."
 *
 * Q: Moving the Merchant into a contested battlefield puts its trigger on the chain — can I answer that
 *    trigger by playing Rengar to that same battlefield so he joins as an attacker (and survives the
 *    discard)?
 * A: No. Contested is a status on the battlefield; ATTACKER is a designation handed to a player only when
 *    combat actually begins, which cannot happen while the move trigger is still on the chain (the game is
 *    in a closed state). With no attacker status yet, "a battlefield you're attacking" names nothing, so
 *    Rengar may be played to your base or to a battlefield you control — never to the contested one.
 * Rules: 344.2 (Contested applied on arrival; the showdown is staged), 320/336 (a showdown begins only in an
 *        Open State with the chain empty), 464.2.c.1 (Attacker designations are given when combat begins).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TRAVELING_MERCHANT = "ogn-185-298";
const RENGAR_POUNCING = "sfd-025-221";

/** P1's turn. bf1 is P2's with a Wall; bf2 is P1's. P1's Merchant is in base, Rengar + a spare card in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 1, name: "Wall" }, "wall")
    .unit(P1, "bf2", { might: 1, name: "Sitter" }, "sitter")
    .unit(P1, "base", TRAVELING_MERCHANT, "merchant")
    .hand(P1, RENGAR_POUNCING, "rengar")
    .hand(P1, { cardType: "unit", energyCost: 9, might: 9, name: "Ballast" }, "ballast");
}

const destinations = (game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>) => {
  const field = game.p1.option("play", "rengar")?.fields.find((f) => f.arg === "to");
  return (field?.options ?? []).map((o) => String(o)).toSorted();
};

describe("Ruling ebefe65f61801c9c — while the move trigger is on the chain you are not yet an attacker", () => {
  test("premise: moving in contests bf1 and puts the Merchant's trigger on the chain; combat has not begun", async () => {
    const game = await board().build();
    await game.p1.move("merchant", "bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", triggered: true })]);
    expect(game.state("merchant").combatRole).not.toBe("attacker");
    expect(game.gameState.interaction?.showdownStack?.some((s) => s.active)).toBeFalsy();
  });

  // The engine treats the contested battlefield as already "one you're attacking" while the arrival trigger is
  // still on the chain, so it offers bf1 as a destination for Rengar.
  test.failing("BUG: ruling ebefe65f61801c9c — Rengar should NOT be playable to the contested bf1 while the move trigger is on the chain (no attacker designation yet); the engine offers it", async () => {
    const game = await board().build();
    await game.p1.move("merchant", "bf1");
    expect(destinations(game)).not.toContain("battlefield-bf1");
    const attempt = await game.p1.try((p) => p.play("rengar", { to: "bf1" }));
    expect(attempt.ok).toBe(false);
    expect(game.zoneOf("rengar")).toBe("hand");
  });

  test("agreed: he can in any case be played to P1's base or to a battlefield P1 controls", async () => {
    const game = await board().build();
    await game.p1.move("merchant", "bf1");
    expect(destinations(game)).toContain("base");
    expect(destinations(game)).toContain("battlefield-bf2");
    await game.p1.play("rengar", { to: "bf2" });
    expect(game.locationOf("rengar")).toBe("bf2");
  });

  test("the attacker designation arrives only after the trigger resolves and combat begins — by then the discard has happened", async () => {
    const game = await board().build();
    await game.p1.move("merchant", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    // The trigger resolves: P1 discards 1 (choosing between Rengar and the Ballast), then draws 1.
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["ballast", "rengar"]);
    await game.p1.pick("rengar");
    expect(game.zoneOf("rengar")).toBe("trash"); // discarded — exactly the outcome the ruling describes
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: once a real combat showdown IS running, Rengar may be played to the battlefield P1 is attacking", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .hand(P1, RENGAR_POUNCING, "rengar")
      .build();
    await game.p1.move("scout", "bf1"); // no trigger in the way → showdown opens at once
    expect(game.state("scout").combatRole).toBe("attacker");
    const field = game.p1.option("play", "rengar")?.fields.find((f) => f.arg === "to");
    expect((field?.options ?? []).map(String)).toContain("battlefield-bf1");
    await game.p1.play("rengar", { to: "bf1" });
    expect(game.locationOf("rengar")).toBe("bf1");
  });
});
