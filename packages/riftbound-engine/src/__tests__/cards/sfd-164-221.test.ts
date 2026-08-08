/**
 * Drag Under — sfd-164-221 · Spell · Order · 5 energy + [order]
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   I cost [2] less to play from anywhere other than your hand.
 *   Kill a unit at a battlefield.
 *
 * Head-judge notes — the tricky spots for this card:
 *  1. The discount is a self static gated on the ORIGIN zone of the play (356.4): from hand it is a
 *     full 5 + [order]; from banishment (Rek'Sai, Swarm Queen / Void Rush "banish one, then play it")
 *     or the trash (an Endless Riches "play cards from your trash" grant) it is 3 + [order]. The
 *     power pip is never discounted.
 *  2. Stacking (356.4.d): Void Rush's own "reducing its cost by [2]" plus the self discount →
 *     5 − 2 − 2 = 1 + [order]; never below 0.
 *  3. [Action] timing: own turn in the open state, or in a showdown on EITHER player's turn while
 *     holding Focus — the classic use is the defender wiping the lone attacker mid-combat so the
 *     fight ends with the battlefield held. Never while a chain is open, never on the opponent's
 *     turn outside a showdown, never before Focus is passed to you.
 *  4. "at a battlefield": any unit at any battlefield (yours included), never a unit in a base;
 *     with no unit at any battlefield the spell is unplayable (355.8). It KILLS — Might is irrelevant.
 *  5. Deflect on the victim adds a [rainbow] pip an opposing caster must find (809 / 356.2.a.2).
 *  6. Revealed by Rek'Sai with too little energy for even the discounted cost: nothing is paid and
 *     nothing dies.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision, Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-164-221";
const REKSAI = "sfd-170-221"; // Order champion, 5 Might: When I attack, reveal top 2; you may banish one, then play it.
const VOID_RUSH = "sfd-188-221"; // 2 + [rainbow]: reveal top 2; may banish one, then play it reducing its cost by [2]; draw the rest
const ENDLESS_RICHES = "ven-022-166"; // gear: "... You may play cards from your trash. ..."
const POUTY_PORO = "ogn-013-298"; // 2-Might [Deflect] unit
const FILLER = "ogn-175-298";

function board(energy = 5, order = 1) {
  return scenario()
    .resources(P1, { energy, power: { order } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 10, name: "Giant" }, "giant")
    .unit(P1, "bf2", { might: 1, name: "Own Holder" }, "own")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .hand(P1, CARD, "du");
}

/** Answer prompts (yes / preferred pick) and pass priority until the chain is empty and nobody is mid-prompt. */
async function drive(game: Game, prefer: string[]) {
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && (d.context === "main" || (d.context === "showdown" && game.chain().length === 0)))) {
      return;
    }
    if (d.kind === "yes-no") {
      await game.seat(d.seat).yes();
    } else if (d.kind === "pick") {
      const key = prefer.map((p) => d.options.find((o) => o.key === p || o.card === p)?.key).find((k) => k !== undefined) ?? d.options[0]?.key;
      // "you may … play it" (355.8): an unaffordable reveal leaves the pick with no legal option, so decline it.
      if (key === undefined) {
        await game.seat(d.seat).decline();
      } else {
        await game.seat(d.seat).pick(key);
      }
    } else {
      await game.seat(d.seat).pass();
    }
  }
}

describe("Drag Under (sfd-164-221)", () => {
  test("from hand: costs the full 5 energy + 1 order, one chain item, kills the 10-Might battlefield unit, spell to trash", async () => {
    const game = await board().build();
    await game.p1.cast("du", { targets: "giant" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "du", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.zoneOf("giant")).toBe("trash");
    expect(game.zoneOf("du")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("negative space: the discount never touches a hand play — 4 energy + order, or 5 energy without order, cannot cast", async () => {
    expect((await board(4, 1).build()).p1.can("cast", "du")).toBe(false);
    expect((await board(3, 1).build()).p1.can("cast", "du")).toBe(false);
    expect((await board(5, 0).build()).p1.can("cast", "du")).toBe(false);
    expect(( await board(5, 1).build()).state("du").energyCost).toBe(5); // printed cost is what filters read (206)
  });

  test("targets: any unit AT A BATTLEFIELD (enemy or your own), never a base unit; no battlefield unit → unplayable (355.8)", async () => {
    const game = await board().build();
    const offered = game.p1.option("cast", "du")?.fields.find((f) => f.arg === "targets")?.options;
    expect(offered).toEqual(expect.arrayContaining([["giant"], ["own"]]));
    expect(offered).toHaveLength(2);
    const atHome = await game.p1.try((p) => p.cast("du", { targets: "home" }));
    expect(atHome.ok).toBe(false);
    await game.p1.cast("du", { targets: "own" }); // painful but legal
    await game.settle();
    expect(game.zoneOf("own")).toBe("trash");
    const none = await scenario().resources(P1, { energy: 5, power: { order: 1 } }).battlefield("bf1").unit(P2, "base", { might: 1 }, "home").hand(P1, CARD, "du").build();
    expect(none.p1.can("cast", "du")).toBe(false);
  });

  test("[Action] on the opponent's turn: not from the open state, not while THEY hold Focus — but once Focus passes, kill the lone attacker and keep the battlefield", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 5, power: { order: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 9, name: "Raider" }, "raider")
      .hand(P1, CARD, "du")
      .build();
    expect(game.p1.can("cast", "du")).toBe(false); // opponent's open main phase
    await game.p2.move("raider", "bf1");
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.can("cast", "du")).toBe(false); // showdown, but P2 has Focus
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("du", { targets: "raider" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("holder")).toBe("battlefield-bf1"); // no combat damage was ever dealt
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.turnPlayer()).toBe(P2);
    expect((game.decision() as ActionDecision).context).toBe("main");
  });

  test("[Action] on your own turn inside a combat showdown you opened; but never in response while a chain is open", async () => {
    const game = await board(10, 2).unit(P1, "base", { might: 2, name: "Scout" }, "scout").hand(P1, CARD, "du2").build();
    await game.p1.move("scout", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.p1.cast("du", { targets: "giant" });
    expect(game.chain()).toHaveLength(1);
    // Closed state: the second copy is an Action, not a Reaction.
    expect(game.p1.can("cast", "du2")).toBe(false);
    await game.p1.passPriority();
    expect(game.p2.legal().map((o) => o.verb)).not.toContain("cast");
    await game.p2.passPriority();
    expect(game.zoneOf("giant")).toBe("trash");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // scout takes the emptied battlefield
  });

  test("played from BANISHMENT via Rek'Sai, Swarm Queen's attack trigger it costs 3 + [order] and can kill the very defender", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", REKSAI, "rek")
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .deck(P1, [CARD, FILLER], ["du", "second"])
      .build();
    await game.p1.move("rek", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rek", triggered: true })]);
    await drive(game, ["du", "wall"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // 3 + order, not 5
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("du")).toBe("trash");
    await game.settle();
    expect(game.zoneOf("rek")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("negative space: revealed by Rek'Sai with only 2 energy — even the discounted 3 + [order] is out of reach: nothing paid, nobody dies", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", REKSAI, "rek")
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .deck(P1, [CARD, FILLER], ["du", "second"])
      .build();
    await game.p1.move("rek", "bf1");
    await drive(game, ["du", "wall"]);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 1 } });
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(["chain", "trash"]).not.toContain(game.zoneOf("du"));
  });

  test("stacked discounts via Void Rush (356.4.d): 5 − 2 (self, from banishment) − 2 (Void Rush) = 1 + [order]; the other revealed card is drawn", async () => {
    const game = await board(3, 1)
      .resources(P1, { power: { order: 1, rainbow: 1 } })
      .deck(P1, [CARD, FILLER], ["duTop", "second"])
      .hand(P1, VOID_RUSH, "rush")
      .build();
    await game.p1.cast("rush");
    // Void Rush: 2 + one pip (fury|order hybrid — it may come out of either pool entry).
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.power()).toBe(1);
    await game.settle();
    await drive(game, ["duTop", "giant"]);
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0, rainbow: 0 } }); // Drag Under: exactly 1 + order
    expect(game.zoneOf("giant")).toBe("trash");
    expect(game.zoneOf("duTop")).toBe("trash");
    expect(game.zoneOf("second")).toBe("hand");
    expect(game.zoneOf("du")).toBe("hand"); // the hand copy was never involved
  });

  test("from the TRASH under Endless Riches' 'you may play cards from your trash' it is offered and costs 3 + [order]", async () => {
    // Expected: with the grant on board the trash copy is a legal cast at 3 energy + order (the
    // hand needs 5). Actual: the trash-play grant only enumerates units, so the spell is never offered.
    const game = await scenario()
      .resources(P1, { energy: 3, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 10, name: "Giant" }, "giant")
      .gear(P1, ENDLESS_RICHES, "riches")
      .trash(P1, CARD, "binned")
      .hand(P1, CARD, "held")
      .build();
    expect(game.p1.can("cast", "held")).toBe(false);
    expect(game.p1.can("cast", "binned")).toBe(true);
    await game.p1.cast("binned", { targets: "giant" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("giant")).toBe("trash");
  });

  test("Deflect victim (809): an enemy Pouty Poro at a battlefield needs an extra power of any domain on top of 5 + [order]", async () => {
    const broke = await scenario().resources(P1, { energy: 5, power: { order: 1 } }).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", POUTY_PORO, "poro").hand(P1, CARD, "du").build();
    expect(broke.p1.can("cast", "du")).toBe(false);
    const rich = await scenario().resources(P1, { energy: 5, power: { calm: 1, order: 1 } }).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", POUTY_PORO, "poro").hand(P1, CARD, "du").build();
    await rich.p1.cast("du", { targets: "poro" });
    expect(rich.p1.resources()).toEqual({ energy: 0, power: { calm: 0, order: 0 } });
    await rich.settle();
    expect(rich.zoneOf("poro")).toBe("trash");
  });

  test("the opponent gets priority before it resolves; after both pass the kill happens and play returns to P1's open main phase", async () => {
    const game = await board().build();
    await game.p1.cast("du", { targets: "giant" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect((game.decision() as ActionDecision).context).toBe("chain");
    expect(game.zoneOf("giant")).toBe("battlefield-bf1"); // nothing has happened yet
    await game.p2.passPriority();
    expect(game.zoneOf("giant")).toBe("trash");
    // 190.4.c: P2 has no unit left there → bf1 goes uncontrolled at the cleanup; it is NOT conquered by P1.
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect((game.decision() as ActionDecision)).toMatchObject({ context: "main", seat: P1 });
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
  });

  test("parsed abilities match the printed text: Action timing, self cost-reduction 2 gated on not-hand, kill a unit at a battlefield", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "order", energyCost: 5, powerCost: ["order"], timing: "action" });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toMatchObject({ effect: { by: 2, target: "self", type: "cost-reduction", whenPlayedFrom: "not-hand" }, type: "static" });
    expect(abilities[1]).toMatchObject({ effect: { target: { location: "battlefield", type: "unit" }, type: "kill" }, timing: "action", type: "spell" });
  });
});
