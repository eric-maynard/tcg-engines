/**
 * Ruling 4326a65a002ee203 — Consult the Past (OGN-083 → ogn-083-298)
 *   "[Hidden] (Hide now for [rainbow] to react with later for [0].) [Reaction] Draw 2."
 *
 * Q: Can I reveal a hidden Consult the Past on my opponent's turn even when they aren't attacking the
 *    battlefield it is hidden at, and without them starting a chain?
 * A: You may reveal it whenever you actually have priority/Focus — in any showdown (it need not be the
 *    battlefield it hides at) or in response to a spell or ability. With no showdown and nothing on the
 *    Chain there is no such moment. And it can never be revealed on the turn it was hidden.
 * Rules: 811 ([Hidden]), 340 / 345 (priority and Focus windows), 811.1.d (not on the turn it was hidden).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CONSULT = "ogn-083-298";
const DESERTS_CALL = "sfd-031-221"; // any spell P2 can cast to open a Chain

/** P2's turn. P1 holds two battlefields and hides Consult at bf2 (on an earlier turn). */
function board(hiddenOnTurn = 0) {
  return scenario()
    .active(P2)
    .turn(2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "bf2", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .facedown(P1, "bf2", CONSULT, "consult", { hiddenOnTurn });
}

describe("Ruling 4326a65a002ee203 — hidden Consult the Past needs a priority window, not the attacked battlefield", () => {
  test("P2's open main phase with nothing on the Chain: P1 has no decision at all, so it cannot be revealed", async () => {
    const game = await board().build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.decision()).toBeNull();
    expect(game.p1.can("reveal", "consult")).toBe(false);
    expect(game.zoneOf("consult")).toBe("facedown-bf2");
  });

  test("a showdown at the OTHER battlefield is enough: P1 reveals a card hidden at bf2 during a combat at bf1", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1"); // combat at bf1; the hidden card sits at bf2

    // While P2 holds Focus, P1 has no window.
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.can("reveal", "consult")).toBe(false);

    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("reveal", "consult")).toBe(true);

    await game.p1.reveal("consult");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.zoneOf("consult")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("responding to a spell works too — no showdown needed, just a Chain to react to", async () => {
    const game = await board().resources(P2, { energy: 2 }).hand(P2, DESERTS_CALL, "call").build();
    expect(game.p1.can("reveal", "consult")).toBe(false);

    await game.p2.cast("call", { repeat: 0 });
    expect(game.p1.can("reveal", "consult")).toBe(false); // P2 still holds priority
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("reveal", "consult")).toBe(true);
    await game.p1.reveal("consult");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.zoneOf("consult")).toBe("trash");
  });

  test("it can never be revealed on the turn it was hidden", async () => {
    const game = await board(2).build(); // hidden this very turn
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1); // P1 does hold Focus …
    expect(game.p1.can("reveal", "consult")).toBe(false); // … but the card is still locked
    const refused = await game.p1.try((p) => p.reveal("consult"));
    expect(refused.ok).toBe(false);
    expect(game.zoneOf("consult")).toBe("facedown-bf2");
  });

  test("no window during the combat damage step: once both pass Focus the combat just resolves", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.passFocus();
    // The showdown is closed; P1 gets no further chance before damage is worked out.
    expect(game.p1.can("reveal", "consult")).toBe(false);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // 3 into a 4-Might defender
    expect(game.zoneOf("consult")).toBe("facedown-bf2"); // never revealed
    expect(game.p1.hand()).toEqual([]);
  });
});
