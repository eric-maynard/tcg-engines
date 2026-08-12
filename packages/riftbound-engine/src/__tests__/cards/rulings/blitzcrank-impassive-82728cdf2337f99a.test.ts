/**
 * Ruling 82728cdf2337f99a — Blitzcrank, Impassive (OGN-067 → ogn-067-298) · Unit · Calm · [5][calm] · 5 Might
 *   "[Tank] … When I hold, return me to my owner's hand."
 *   × a [Hidden] card (Hidden Blade, ogn-213-298) facedown at the same battlefield.
 *
 * Q: Once Blitzcrank is recalled to hand, can I still react with the hidden card at that battlefield?
 * A: You can react to Blitzcrank's hold TRIGGER — while it is on the chain the state is closed and control
 *    of the battlefield is unchanged, so the hidden card is still yours to reveal. But once Blitzcrank has
 *    actually left, you control nothing there any more and the hidden cards go to the trash.
 * Rules: 315.2 / hold scoring ("when I hold"), 401.1 / 808.1.d.2 (a trigger on the chain = Closed State, so
 *        control does not lapse yet), 323.6/190.4 (control lapses at the first Open-State Cleanup with no
 *        unit of yours there), 323.7 (facedown cards follow in that same Cleanup).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BLITZCRANK = "ogn-067-298";
const HIDDEN_BLADE = "ogn-213-298";

/** Turn 2, P2 to act. P1 holds bf1 with Blitzcrank alone and a facedown Hidden Blade there. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", BLITZCRANK, "blitz")
    .facedown(P1, "bf1", HIDDEN_BLADE, "hid")
    .unit(P2, "base", { might: 1, name: "Scout" }, "scout")
    .unit(P2, "bf1", { might: 1, name: "Bystander" }, "bystanderPlaceholder");
}

/** Without the enemy bystander — the plain board the ruling describes. */
function soloBoard() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", BLITZCRANK, "blitz")
    .facedown(P1, "bf1", HIDDEN_BLADE, "hid")
    .unit(P2, "base", { might: 1, name: "Scout" }, "scout");
}

describe("Ruling 82728cdf2337f99a — the hold trigger is a reaction window; the hidden card is lost only once Blitzcrank has gone", () => {
  test("P1's turn begins: bf1 is held (P1 scores), Blitzcrank's return trigger is ON THE CHAIN and the hidden card is still facedown", async () => {
    const game = await soloBoard().build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1); // the hold scored first
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blitz", controller: P1, triggered: true })]);
    expect(game.zoneOf("blitz")).toBe("battlefield-bf1"); // not returned yet
    expect(game.zoneOf("hid")).toBe("facedown-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("in that window P1 MAY reveal (react with) the hidden card — the reveal is a legal move while the trigger is unresolved", async () => {
    const game = await soloBoard().build();
    await game.p2.endTurn();
    expect(game.p1.can("reveal", "hid")).toBe(true);
    expect(game.p1.legal().map((o) => o.verb)).toContain("reveal");
  });

  test("if P1 does nothing, the trigger resolves: Blitzcrank goes to hand, control of bf1 lapses and the facedown card is trashed", async () => {
    const game = await soloBoard().build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.zoneOf("blitz")).toBe("hand");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.zoneOf("hid")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("using the window works: revealing Hidden Blade in response kills the enemy unit at bf1 before Blitzcrank ever leaves", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    expect(game.chain().map((c) => c.cardId)).toContain("blitz");
    await game.p1.reveal("hid");
    for (let i = 0; i < 8; i++) {
      const stop = await game.settle();
      const d = game.decision();
      if (stop.reason !== "unanswered" || !d) break;
      if (d.kind === "pick") await game.seat(d.seat).pick(d.options.find((o) => (o.card ?? o.key) === "bystanderPlaceholder")?.key ?? d.options[0]!.key);
      else if (d.kind === "yes-no") await game.seat(d.seat).yes();
      else break;
    }
    expect(game.zoneOf("bystanderPlaceholder")).toBe("trash");
    expect(game.zoneOf("hid")).toBe("trash"); // it was played, not discarded
    expect(game.zoneOf("blitz")).toBe("hand");
  });
});
