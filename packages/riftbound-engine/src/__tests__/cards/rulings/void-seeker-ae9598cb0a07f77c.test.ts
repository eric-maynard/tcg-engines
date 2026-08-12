/**
 * Ruling ae9598cb0a07f77c — Void Seeker (OGN-024 → ogn-024-298) · Spell · Fury · [3][fury] · [Action]
 *   "Deal 4 to a unit at a battlefield. Draw 1."
 *
 * Q: I move a unit to an empty battlefield and it becomes open; can my opponent play Void Seeker, an
 *    [Action] card? Is that a non-combat showdown? Or are only reactions allowed?
 * A: Moving onto an empty battlefield contests it and starts a showdown — a NON-combat one (a combat
 *    showdown needs enemy units already there). In the Showdown OPEN state the Focus holder may start a
 *    chain with an [Action] or a [Reaction], so yes, Void Seeker is legal. The moment it is played the turn
 *    is Showdown CLOSED and only [Reaction] cards may be added until that chain resolves.
 * Rules: 429.1 (contest ⇒ showdown), 440.1 (combat showdown needs enemies present), 310.3/310.4
 *        (Showdown Open vs Closed), 309.1.a (closed state: Reactions only), 345/347 (Focus).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_SEEKER = "ogn-024-298";
const CLEAVE = "ogn-004-298"; // [Action]
const EN_GARDE = "ogn-046-298"; // [Reaction]

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1's turn. bf1 is empty and uncontrolled; P1 walks a Scout onto it. P2 holds Void Seeker. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { calm: 1, fury: 1 } })
    .resources(P2, { energy: 4, power: { fury: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 5, name: "Scout" }, "scout")
    .hand(P1, CLEAVE, "cleave")
    .hand(P1, EN_GARDE, "garde")
    .hand(P2, VOID_SEEKER, "seeker");
}

describe("Ruling ae9598cb0a07f77c — moving onto an empty battlefield opens a NON-combat showdown in which an [Action] is legal", () => {
  test("ruling: the move contests the empty battlefield and begins a showdown that is not a combat showdown", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(showdown(game)).toMatchObject({ active: true, isCombatShowdown: false });
    expect(game.state("scout").combatRole).not.toBe("attacker");
  });

  test("Focus starts with the contesting player: P2 must wait for P1 to pass Focus before playing anything", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    expect(showdown(game)).toMatchObject({ focusPlayer: P1 });
    expect(game.p2.can("cast", "seeker")).toBe(false);

    await game.p1.passFocus();
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P2 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("ruling 1+2: with Focus in a Showdown OPEN state P2 may start the chain with the [Action] Void Seeker", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    await game.p1.passFocus();
    expect(game.p2.can("cast", "seeker")).toBe(true);
    await game.p2.cast("seeker", { targets: "scout" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["seeker"]);
  });

  test("ruling 3: once the chain exists the state is Showdown CLOSED — P1 may add a [Reaction] but not an [Action]", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("seeker", { targets: "scout" });
    await game.p2.passPriority();

    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "cleave")).toBe(false); // [Action] — illegal while the chain is open
    const action = await game.p1.try((p) => p.cast("cleave", { targets: "scout" }));
    expect(action.ok).toBe(false);

    expect(game.p1.can("cast", "garde")).toBe(true); // [Reaction] — always legal
    await game.p1.cast("garde", { targets: "scout" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["seeker", "garde"]);
  });

  test("after the chain resolves the showdown is Open again and an [Action] is playable once more", async () => {
    const game = await board().build();
    await game.p1.move("scout", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("seeker", { targets: "scout" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Void Seeker resolves

    expect(game.chain()).toEqual([]);
    expect(game.state("scout").damage).toBe(4);
    expect(showdown(game)).toMatchObject({ active: true });
    // Focus came back to P1 when the chain P2 started emptied.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "cleave")).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
