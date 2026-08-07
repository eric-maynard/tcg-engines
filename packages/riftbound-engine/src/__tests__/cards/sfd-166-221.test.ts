/**
 * Rally the Troops — sfd-166-221 · Spell · Order · 2 energy (no power)
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   When a friendly unit is played this turn, buff it. (If it doesn't have a buff, it gets a
 *   +1 [Might] buff.)
 *   Draw 1.
 *
 * Head-judge notes — the tricky spots for this card:
 *  - Sentence 2 creates a DELAYED TRIGGERED ability (390.2) whose window is "this turn": it fires for
 *    EVERY friendly unit played after Rally resolves until the turn ends — not just the next one, not
 *    units already on the board / played earlier this turn, and never on a later turn (expiry across
 *    advanceTurn()).
 *  - "friendly" is relative to Rally's controller: an enemy unit played the same turn is not buffed.
 *  - "played" covers unit TOKENS that are played (Forge of the Future's Recruit) — the 1-Might Recruit
 *    becomes 2 — but NOT tokens/units that merely enter or move without being played.
 *  - Buff cap (702.3 / 426.1.b.1): a unit that buffs itself on play (Sea Monkey, paid) plus Rally still
 *    carries exactly one buff (+1), and two Rallies the same turn still give one buff.
 *  - "Draw 1" is unconditional and immediate on resolution (even with no units anywhere).
 *  - [Action] timing: castable while I hold Focus in a showdown (also on the opponent's turn — then
 *    "this turn" is THEIR turn and my next-turn plays get nothing); not as a plain-chain response.
 *  - Cost: 2 energy flat; 1 is not enough.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-166-221";
const SKULKER = "ogn-175-298"; // Shipyard Skulker — vanilla 3-cost 3-Might unit
const FORGE = "ogn-212-298"; // gear 2: "When you play this, play a 1 [Might] Recruit unit token at your base."
const SEA_MONKEY = "sfd-098-221"; // 2-cost 2-Might: "You may pay [1]… When you play me, if you paid, buff me."

function board(energy = 12) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Sentinel" }, "sentinel")
    .unit(P1, "base", { might: 2, name: "Veteran" }, "veteran")
    .hand(P1, CARD, "rally")
    .hand(P1, SKULKER, "s1")
    .hand(P1, SKULKER, "s2");
}

describe("Rally the Troops (sfd-166-221)", () => {
  test("cost + Draw 1: 2 energy, one chain item, draws exactly 1 on resolution, spell to trash; unaffordable at 1", async () => {
    const game = await board(2).build();
    const hand = game.p1.hand().length; // rally + s1 + s2
    const deck = game.p1.deck().length;
    await game.p1.cast("rally");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.hand()).toHaveLength(hand - 1); // not drawn yet
    await game.settle();
    expect(game.zoneOf("rally")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    expect(game.p1.deck()).toHaveLength(deck - 1);
    expect((await board(1).build()).p1.can("cast", "rally")).toBe(false);
  });

  test("Draw 1 needs no unit anywhere: castable on an empty board and still draws", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "rally").build();
    expect(game.p1.can("cast", "rally")).toBe(true);
    await game.p1.cast("rally");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.zoneOf("rally")).toBe("trash");
  });

  test("resolving Rally does NOT buff units already on the board", async () => {
    const game = await board().build();
    await game.p1.cast("rally");
    await game.settle();
    expect(game.state("veteran").isBuffed).toBe(false);
    expect(game.state("veteran").might).toBe(2);
    expect(game.state("sentinel").isBuffed).toBe(false);
  });

  test("a friendly unit played later this turn enters and gets buffed (3-Might Skulker → buffed 4)", async () => {
    // Expected: after Rally resolves, playing Shipyard Skulker triggers "buff it" → isBuffed, might 4.
    // Actual: the delayed trigger is modelled as an unhandled player keyword grant; nothing buffs the unit.
    const game = await board().build();
    await game.p1.cast("rally");
    await game.settle();
    await game.p1.play("s1");
    await game.settle();
    expect(game.zoneOf("s1")).toBe("base");
    expect(game.state("s1").isBuffed).toBe(true);
    expect(game.state("s1").might).toBe(4);
    expect(game.state("veteran").isBuffed).toBe(false); // only the played unit
  });

  test("the delayed trigger lasts the WHOLE turn — a second unit played the same turn is buffed too", async () => {
    const game = await board().build();
    await game.p1.cast("rally");
    await game.settle();
    await game.p1.play("s1");
    await game.settle();
    await game.p1.play("s2");
    await game.settle();
    expect(game.state("s1").isBuffed).toBe(true);
    expect(game.state("s2").isBuffed).toBe(true);
    expect(game.state("s2").might).toBe(4);
  });

  test("order matters: a unit played BEFORE Rally is cast this turn is not buffed retroactively (only the draw happens)", async () => {
    const game = await board().build();
    await game.p1.play("s1");
    await game.settle();
    await game.p1.cast("rally");
    await game.settle();
    expect(game.state("s1").isBuffed).toBe(false);
    expect(game.state("s1").might).toBe(3);
  });

  test("'this turn' expires: after advancing to my NEXT turn, a unit I play is not buffed", async () => {
    const game = await board().build();
    await game.p1.cast("rally");
    await game.settle();
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 again
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 3 });
    await game.p1.play("s1");
    await game.settle();
    expect(game.zoneOf("s1")).toBe("base");
    expect(game.state("s1").isBuffed).toBe(false);
    expect(game.state("s1").might).toBe(3);
  });

  test("'friendly' only, SAME turn: I cast Rally in a showdown on P2's turn; the unit P2 then plays that very turn is not buffed", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .resources(P2, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 2, name: "Attacker" }, "attacker")
      .hand(P1, CARD, "rally")
      .hand(P2, SKULKER, "theirs")
      .build();
    await game.p2.move("attacker", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("rally");
    await game.settle(); // Rally resolves, combat resolves (attacker dies), back to P2's main phase
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    await game.p2.play("theirs", { to: "base" });
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("base");
    expect(game.state("theirs").isBuffed).toBe(false);
    expect(game.state("theirs").might).toBe(3);
  });

  test("an enemy unit played on the following (their) turn is not buffed either", async () => {
    const game = await board().hand(P2, SKULKER, "theirs").build();
    await game.p1.cast("rally");
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 3 });
    await game.p2.play("theirs", { to: "base" });
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("base");
    expect(game.state("theirs").isBuffed).toBe(false);
  });

  test("played unit TOKENS count — Forge of the Future's 1-Might Recruit played this turn is buffed to 2", async () => {
    const game = await board().hand(P1, FORGE, "forge").build();
    await game.p1.cast("rally");
    await game.settle();
    await game.p1.play("forge");
    await game.settle({ policy: "first" });
    const recruits = game.p1.units("base").filter((u) => game.state(u).name === "Recruit");
    expect(recruits).toHaveLength(1);
    expect(game.state(recruits[0] as string)).toMatchObject({ isBuffed: true, might: 2 });
  });

  test("buff cap (702.3): a paid Sea Monkey (buffs itself on play) played under Rally carries exactly ONE buff — 2 + 1 = 3 Might, never 4", async () => {
    const game = await board().hand(P1, SEA_MONKEY, "monkey").build();
    await game.p1.cast("rally");
    await game.settle();
    await game.p1.play("monkey", { payOptional: true, to: "base" });
    await game.settle({ policy: "first" });
    expect(game.state("monkey").isBuffed).toBe(true);
    expect(game.state("monkey").might).toBe(3);
  });

  test("two Rallies the same turn still place a single buff on the played unit (702.3) — Skulker is buffed to exactly 4", async () => {
    // Expected: isBuffed, might 4. Actual: Rally's delayed trigger never buffs, so the unit stays 3.
    const two = await board().hand(P1, CARD, "rally2").build();
    await two.p1.cast("rally");
    await two.settle();
    await two.p1.cast("rally2");
    await two.settle();
    await two.p1.play("s1");
    await two.settle();
    expect(two.state("s1").isBuffed).toBe(true);
    expect(two.state("s1").might).toBe(4);
  });

  test("[Action] timing: castable while I hold Focus in a showdown on my turn (draws 1, combat then proceeds); not as a response on a plain chain", async () => {
    const game = await board().unit(P1, "base", { might: 3, name: "Raider" }, "raider").build();
    await game.p1.move("raider", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "rally")).toBe(true);
    const hand = game.p1.hand().length;
    await game.p1.cast("rally");
    await game.settle();
    expect(game.zoneOf("rally")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    expect(game.zoneOf("sentinel")).toBe("trash"); // 3 vs 2
    // Plain chain (no showdown): my own Skulker play trigger-less → use a second Rally as the chain opener.
    const closed = await board().hand(P1, CARD, "rally2").build();
    await closed.p1.cast("rally");
    expect(closed.chain()).toHaveLength(1);
    expect(closed.p1.can("cast", "rally2")).toBe(false);
  });

  test("[Action] on the opponent's turn: castable once Focus passes to me in their showdown; NOT castable in their open main phase", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 2, name: "Attacker" }, "attacker")
      .hand(P1, CARD, "rally")
      .build();
    expect(game.p1.can("cast", "rally")).toBe(false);
    await game.p2.move("attacker", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "rally")).toBe(true);
    const hand = game.p1.hand().length;
    await game.p1.cast("rally");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    expect(game.zoneOf("rally")).toBe("trash");
  });

  test("cast on the OPPONENT's turn, 'this turn' is their turn: a unit I play on my own following turn is not buffed", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 2, name: "Attacker" }, "attacker")
      .hand(P1, CARD, "rally")
      .hand(P1, SKULKER, "s1")
      .build();
    await game.p2.move("attacker", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("rally");
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 3 });
    await game.p1.play("s1", { to: "base" });
    await game.settle();
    expect(game.state("s1").isBuffed).toBe(false);
  });

  test("parsed abilities vs printed text: one Action spell ability = [turn-scoped 'buff friendly units when played' effect, draw 1]; 2 energy, order, no power", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "order", energyCost: 2, name: "Rally the Troops", timing: "action" });
    expect(def?.powerCost ?? []).toEqual([]);
    const abilities = (def?.abilities ?? []) as { type: string; timing?: string; effect?: { type: string; effects?: { type: string; duration?: string; amount?: number }[] } }[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({ timing: "action", type: "spell" });
    expect(abilities[0]?.effect?.type).toBe("sequence");
    const steps = abilities[0]?.effect?.effects ?? [];
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ duration: "turn" });
    expect(steps[1]).toEqual({ amount: 1, type: "draw" });
  });
});
