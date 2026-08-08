/**
 * Factory Recall — sfd-135-221 · Spell · Chaos · 1 energy (no power)
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Return a gear to its owner's hand.
 *
 * Head-judge notes — the tricky spots for this card:
 *  - [Action] timing (806): own turn in an Open state, or during a showdown on EITHER player's turn
 *    while holding Focus; never as a response on a plain (non-showdown) chain — that needs Reaction.
 *  - "a gear": ANY gear on the board (148.1.a.3) — friendly or enemy, plain gear, Equipment (150.4:
 *    Equipment are gear) even while attached to a unit at a battlefield, and gear TOKENS (Gold).
 *    Gear in a trash is a card, not a board object (148.1.b.2) → never a legal choice.
 *  - "its OWNER's hand", not its controller's: a gear P1 controls but P2 owns goes to P2's hand.
 *  - A Gold token returned to hand ceases to exist (186.1) — it must not sit in anyone's hand.
 *  - Attached Equipment bounced → the wearer loses the Might bonus immediately (layers re-evaluate).
 *  - 355.8: no gear anywhere on the board → the spell cannot be played at all.
 *  - Mistarget (359.3.e.5): if the chosen gear leaves the board in response (Poro Snax cashes itself
 *    in), the spell resolves doing nothing and still goes to trash.
 *  - Natural partners/counters: Poro Snax (re-buy for another "When you play this, draw 1"),
 *    Doran's Blade on an attacker mid-showdown (defender strips 2 Might before combat damage).
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-135-221";
const PORO_SNAX = "sfd-046-221"; // gear 1[calm]: "When you play this, draw 1. [1][calm], [Exhaust], Kill this: Draw 1."
const DORANS_BLADE = "sfd-095-221"; // Equipment, +2 Might
const GOLD = "sfd-t03"; // gear token

function board(energy = 1) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .gear(P1, PORO_SNAX, "mySnax")
    .gear(P2, PORO_SNAX, "theirSnax")
    .trash(P2, PORO_SNAX, "deadSnax")
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .hand(P1, CARD, "recall");
}

describe("Factory Recall (sfd-135-221)", () => {
  test("cost + plain clause: 1 energy, returns the chosen enemy gear to its owner's (P2's) hand, spell to trash", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("recall", { targets: "theirSnax" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.zoneOf("theirSnax")).toBe("hand");
    expect(game.state("theirSnax").owner).toBe(P2);
    expect(game.p2.hand()).toContain("theirSnax");
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.zoneOf("mySnax")).toBe("base");
    expect(game.zoneOf("recall")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("unaffordable with 0 energy; not castable with no gear on the board (355.8) even though a gear sits in a trash", async () => {
    const poor = await board(0).build();
    expect(poor.p1.can("cast", "recall")).toBe(false);
    const noGear = await scenario().resources(P1, { energy: 1 }).trash(P2, PORO_SNAX, "deadSnax").unit(P2, "base", { might: 2 }, "u").hand(P1, CARD, "recall").build();
    expect(noGear.p1.can("cast", "recall")).toBe(false);
  });

  test("targets: friendly AND enemy gear on the board are offered; gear in trash and units are not", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "recall")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual(expect.arrayContaining([["mySnax"], ["theirSnax"]]));
    expect(targets).toHaveLength(2);
    const bad = await game.p1.try((p) => p.cast("recall", { targets: "deadSnax" }));
    expect(bad.ok).toBe(false);
    const unit = await game.p1.try((p) => p.cast("recall", { targets: "guard" }));
    expect(unit.ok).toBe(false);
    expect(game.zoneOf("recall")).toBe("hand");
  });

  test("own gear: bouncing my own Poro Snax puts it in MY hand, and re-playing it draws again (partner line)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { calm: 1 } })
      .gear(P1, PORO_SNAX, "mySnax")
      .hand(P1, CARD, "recall")
      .build();
    await game.p1.cast("recall", { targets: "mySnax" });
    await game.settle();
    expect(game.p1.hand()).toEqual(["mySnax"]);
    await game.p1.play("mySnax");
    await game.settle();
    expect(game.zoneOf("mySnax")).toBe("base");
    expect(game.p1.hand()).toHaveLength(1); // drew 1 off the replayed Snax
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  test("owner ≠ controller: a P2-owned gear that P1 currently controls returns to P2's hand, not P1's", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .card("stolen", { controller: P1, def: PORO_SNAX, owner: P2, zone: "base" })
      .hand(P1, CARD, "recall")
      .build();
    expect(game.state("stolen")).toMatchObject({ controller: P1, owner: P2 });
    await game.p1.cast("recall", { targets: "stolen" });
    await game.settle();
    expect(game.zoneOf("stolen")).toBe("hand");
    expect(game.p2.hand()).toContain("stolen");
    expect(game.p1.hand()).not.toContain("stolen");
  });

  test("Equipment is gear: a Doran's Blade attached to an enemy unit at a battlefield is a legal choice; bouncing it strips the +2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Wielder" }, "wielder", { equippedWith: ["blade"] })
      .gear(P2, DORANS_BLADE, "blade", { attachedTo: "wielder" })
      .hand(P1, CARD, "recall")
      .build();
    expect(game.state("wielder").might).toBe(5);
    await game.p1.cast("recall", { targets: "blade" });
    await game.settle();
    expect(game.zoneOf("blade")).toBe("hand");
    expect(game.p2.hand()).toContain("blade");
    expect(game.state("blade").attachedTo).toBeUndefined();
    expect(game.state("wielder").attachments).toEqual([]);
    expect(game.state("wielder").might).toBe(3);
  });

  test("token gear: a Gold token 'returned to hand' ceases to exist (186.1) — it is in nobody's hand and off the board", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).gear(P2, GOLD, "token-gold").hand(P1, CARD, "recall").build();
    // Engine convention: token instances carry a "token-" id prefix.
    expect(game.state("token-gold").isToken).toBe(true);
    expect(game.p1.can("cast", "recall")).toBe(true);
    await game.p1.cast("recall", { targets: "token-gold" });
    await game.settle();
    expect(game.p2.hand()).not.toContain("token-gold");
    expect(game.p1.hand()).not.toContain("token-gold");
    expect(game.cardsAt("base")).not.toContain("token-gold");
    if (game.has("token-gold")) {
      expect(["hand", "base"]).not.toContain(game.zoneOf("token-gold"));
    }
    expect(game.zoneOf("recall")).toBe("trash");
  });

  test("[Action] on my turn during a showdown: after attacking into bf1 I hold Focus and may cast it at the defender's Blade before combat", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Wielder" }, "wielder", { equippedWith: ["blade"] })
      .gear(P2, DORANS_BLADE, "blade", { attachedTo: "wielder" })
      .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P1, CARD, "recall")
      .build();
    await game.p1.move("raider", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "recall")).toBe(true);
    await game.p1.cast("recall", { targets: "blade" });
    await game.settle(); // spell resolves (wielder 4 → 2), then combat: 3 vs 2
    expect(game.zoneOf("blade")).toBe("hand");
    expect(game.zoneOf("wielder")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("[Action] on the OPPONENT's turn: as the defender in a showdown, once Focus passes to me I may cast it", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 2, name: "Attacker" }, "attacker", { equippedWith: ["blade"] })
      .gear(P2, DORANS_BLADE, "blade", { attachedTo: "attacker" })
      .hand(P1, CARD, "recall")
      .build();
    expect(game.p1.can("cast", "recall")).toBe(false); // opponent's turn, no showdown yet
    await game.p2.move("attacker", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "recall")).toBe(true);
    await game.p1.cast("recall", { targets: "blade" });
    await game.settle(); // attacker drops 4 → 2 and dies to the 3-might holder
    expect(game.p2.hand()).toContain("blade");
    expect(game.zoneOf("attacker")).toBe("trash");
    expect(game.zoneOf("holder")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("NOT a Reaction: cannot be cast in response on a non-showdown chain, nor in the opponent's open main phase", async () => {
    const game = await board(2).resources(P1, { energy: 2, power: { calm: 1 } }).build();
    await game.p1.activate("mySnax", 1); // my Snax cash-in goes on the chain (Closed state)
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.can("cast", "recall")).toBe(false);
    const opp = await board().active(P2).build();
    expect(opp.p1.can("cast", "recall")).toBe(false);
  });

  test("the opponent gets priority before it resolves, but Poro Snax's cash-in is no Reaction — P2 cannot save the card draw and loses the gear to hand", async () => {
    const game = await board().resources(P2, { energy: 1, power: { calm: 1 } }).build();
    await game.p1.cast("recall", { targets: "theirSnax" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect((game.decision() as ActionDecision).context).toBe("chain");
    expect(game.p2.can("activate", "theirSnax")).toBe(false);
    await game.settle();
    expect(game.zoneOf("theirSnax")).toBe("hand");
    expect(game.zoneOf("recall")).toBe("trash");
  });

  test("mistarget (359.3.e.5): P2 cashes the targeted Gold token in response ([Reaction] Kill this: Add) → the spell resolves doing nothing and is still trashed", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .gear(P2, GOLD, "token-gold")
      .gear(P2, PORO_SNAX, "theirSnax")
      .hand(P1, CARD, "recall")
      .build();
    await game.p1.cast("recall", { targets: "token-gold" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("activate", "token-gold")).toBe(true);
    await game.p2.activate("token-gold");
    expect(game.p2.power("rainbow")).toBe(1); // [Add] resolves immediately, Gold is gone
    await game.settle();
    expect(game.zoneOf("recall")).toBe("trash");
    expect(game.zoneOf("theirSnax")).toBe("base"); // no retarget onto the other gear
    expect(game.p2.hand()).not.toContain("token-gold");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("parsed abilities match the printed text: one Action-timed spell ability returning a gear to hand; 1 energy, no power, chaos", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "chaos", energyCost: 1, name: "Factory Recall", timing: "action" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      { effect: { target: { type: "gear" }, type: "return-to-hand" }, timing: "action", type: "spell" },
    ]);
  });
});
