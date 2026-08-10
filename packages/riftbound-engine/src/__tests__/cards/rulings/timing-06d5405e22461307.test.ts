/**
 * Ruling 06d5405e22461307 — (general timing; no specific card)
 *   Stand-ins: Discipline (ogn-058-298) · [Reaction] [2] "Give a unit +2 [Might] this turn. Draw 1." and Fight or Flight
 *   (ogn-168-298) · [Action] [2] "Move a unit from a battlefield to its base."
 *
 * Q: Can I use an Action in response to an opponent's Reaction?
 * A: No. An [Action] can only be played while the state is Open (empty chain) — on your turn or when you hold Focus in a
 *    showdown. An opponent's Reaction starts/extends a chain (Closed State); until it fully resolves you may only answer
 *    with Reactions. Once the chain is empty again the player with priority/Focus may play an Action.
 *    (The trailing "Sequence" bullets of the scraped answer just restate this.)
 * Rules: 336 / 341 (Closed State: Reactions only), 812 ([Action]: Open State on your turn or in showdowns), 340 (LIFO),
 *        347.1.b (Focus passes when the chain closes).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DISCIPLINE = "ogn-058-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

describe("Ruling 06d5405e22461307 — no [Action] in response to an opponent's [Reaction]; only Reactions until the chain is empty", () => {
  /** P1's turn, [4]: Scout (2) attacks P2's Guard (5) at bf1. P1 holds Fight or Flight (Action) + Discipline (Reaction); P2 holds Discipline + [2]. */
  function showdownBoard() {
    return scenario()
      .resources(P1, { energy: 4 })
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard")
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .hand(P1, FIGHT_OR_FLIGHT, "fof")
      .hand(P1, DISCIPLINE, "myDisc")
      .hand(P2, DISCIPLINE, "oppDisc");
  }

  /** Scout attacks; P1 passes Focus; P2 (Focus) plays Discipline on the Guard → a chain is open and P1 now has priority. */
  async function opponentReacts(): Promise<Game> {
    const game = await showdownBoard().build();
    await game.p1.move("scout", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, isCombatShowdown: true });
    // sanity: with Focus and an empty chain the Action IS playable
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "fof")).toBe(true);
    await game.p1.passFocus();
    await game.p2.cast("oppDisc", { targets: "guard" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "oppDisc", controller: P2 })]);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    return game;
  }

  test("showdown: the opponent's Reaction is on the chain (Closed State) — with priority I can NOT play Fight or Flight (Action), but I CAN play my own Discipline (Reaction)", async () => {
    const game = await opponentReacts();
    expect(game.p1.can("cast", "fof")).toBe(false);
    expect((await game.p1.try((p) => p.cast("fof", { targets: "scout" }))).ok).toBe(false);
    expect(game.p1.can("cast", "myDisc")).toBe(true);
    await game.p1.cast("myDisc", { targets: "scout" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["oppDisc", "myDisc"]);
    // still Closed: the Action stays illegal for everyone while anything is on the chain
    expect(game.p1.can("cast", "fof")).toBe(false);
  });

  test("LIFO then Open again: my Reaction resolves first, then theirs; once the chain is EMPTY the state is Open and the Focus holder may play an Action — Fight or Flight becomes legal for me only when I hold Focus with an empty chain", async () => {
    const game = await opponentReacts();
    await game.p1.cast("myDisc", { targets: "scout" });
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      expect(game.acting().can("cast", "fof")).toBe(false); // never mid-chain
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("scout").might).toBe(4);
    expect(game.state("guard").might).toBe(7);
    // Open showdown state again; whoever holds Focus acts. Drive until P1 holds Focus with an empty chain.
    for (let i = 0; i < 3 && !(game.actingSeat() === P1 && game.chain().length === 0); i++) {
      await game.acting().passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "fof")).toBe(true);
    await game.p1.cast("fof", { targets: "scout" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fof", controller: P1 })]);
  });

  test("neutral (my own turn, no showdown): I open with a Reaction, the opponent answers with a Reaction — I still cannot add an Action to that chain; after it resolves (Open State, my turn) I can play it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2, name: "Scout" }, "scout")
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .unit(P2, "bf2", { might: 5, name: "Guard" }, "guard")
      .hand(P1, FIGHT_OR_FLIGHT, "fof")
      .hand(P1, DISCIPLINE, "myDisc")
      .hand(P2, DISCIPLINE, "oppDisc")
      .build();
    expect(game.p1.can("cast", "fof")).toBe(true); // Open State on my turn
    await game.p1.cast("myDisc", { targets: "scout" });
    await game.p1.passPriority();
    await game.p2.cast("oppDisc", { targets: "guard" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["myDisc", "oppDisc"]);
    expect(game.p1.can("cast", "fof")).toBe(false); // Closed: no Action in response to their Reaction
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "fof")).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
