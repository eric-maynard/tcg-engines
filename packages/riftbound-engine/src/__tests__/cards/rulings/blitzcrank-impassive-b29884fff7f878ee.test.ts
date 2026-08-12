/**
 * Ruling b29884fff7f878ee — Blitzcrank, Impassive (OGN-067 → ogn-067-298) · Unit · [5][calm] · 5 [Might]
 *   "[Tank]. When you play me to a battlefield, you may move an enemy unit to here. When I hold, return me to my
 *    owner's hand."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · [Hidden] [Action] as the face-down card held elsewhere.
 *
 * Q: Can hidden cards be played at any eligible timing, or only when a showdown is happening at their battlefield?
 * A: Any timing at which you have priority, provided the card was not hidden this turn. Blitzcrank's trigger at bf2
 *    opens a normal reaction window and the card face down at bf1 can answer it — it just carries the implicit "here",
 *    so its effect stays at bf1. Being played later, it resolves first (LIFO).
 * Rules: 811.6 (playing a [Hidden] card is at reaction speed), 811.1.d.2 (implicit "here"), 336/337 (Chain is LIFO),
 *        383.3.a.2 (a declined "you may" trigger is removed and opens no window).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BLITZCRANK_IMPASSIVE = "ogn-067-298";
const HIDDEN_BLADE = "ogn-213-298";

/** P2's turn. bf1 is P1's, contested by a P2 body; bf2 is P2's. P1's Hidden Blade sits face down at bf1. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 4, name: "Holder" }, "holder")
    .unit(P2, "bf1", { might: 2, name: "Prey" }, "prey")
    .unit(P2, "bf2", { might: 2, name: "TheirHolder" }, "th")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
    .hand(P2, BLITZCRANK_IMPASSIVE, "blitz")
    .resources(P2, { energy: 5, power: { calm: 1 } });
}

describe("Ruling b29884fff7f878ee — a hidden card answers any trigger, wherever that trigger happened", () => {
  test("Blitzcrank arrives at bf2 and its 'you may' is decided at finalization by its own controller", async () => {
    const game = await board().build();
    await game.p2.play("blitz", { to: "bf2" });
    expect(game.locationOf("blitz")).toBe("bf2");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "blitz" }, timing: "FIN" });
  });

  test("once the trigger is on the Chain, P1 may play the card face down at the OTHER battlefield", async () => {
    const game = await board().build();
    await game.p2.play("blitz", { to: "bf2" });
    await game.p2.yes(); // Holder is the lone enemy unit, so the trigger's target is bound at once
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "blitz", controller: P2, targets: ["holder"], triggered: true }),
    ]);
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("reveal", "blade")).toBe(true);
  });

  test("its effect still carries 'here' — only units at bf1 are offered, never Blitzcrank's own battlefield", async () => {
    const game = await board().build();
    await game.p2.play("blitz", { to: "bf2" });
    await game.p2.yes();
    await game.p2.passPriority();
    await game.p1.reveal("blade");
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).toSorted() : []).toEqual(["holder", "prey"]);
    // "blitz" and "th", both at bf2, are absent.
  });

  test("played later it resolves first: Prey dies before Blitzcrank's trigger drags Holder away", async () => {
    const game = await board().build();
    await game.p2.play("blitz", { to: "bf2" });
    await game.p2.yes();
    await game.p2.passPriority();
    await game.p1.reveal("blade");
    await game.p1.pick("prey");
    expect(game.chain().map((c) => c.cardId)).toEqual(["blitz", "blade"]);
    await game.acting().pass();
    await game.acting().pass(); // Hidden Blade resolves
    expect(game.zoneOf("prey")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(2); // Prey's controller draws 2
    expect(game.locationOf("holder")).toBe("bf1"); // Blitzcrank's trigger has not run yet
    await game.acting().pass();
    await game.acting().pass(); // only now does Blitzcrank's trigger resolve
    expect(game.locationOf("holder")).toBe("bf2");
    expect(game.violations()).toEqual([]);
  });

  test("a declined 'you may' opens no window at all — the trigger never reaches the Chain", async () => {
    const game = await board().build();
    await game.p2.play("blitz", { to: "bf2" });
    await game.p2.no();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.can("reveal", "blade")).toBe(false);
  });
});
