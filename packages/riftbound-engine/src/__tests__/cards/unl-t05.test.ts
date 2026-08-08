/**
 * Gold — unl-t05 · Gear Token · no domain · no cost
 *
 *   [Reaction][>] Kill this, [Exhaust]: [Add] [rainbow].
 *   (Abilities that add resources can't be reacted to.)
 *
 * Head-judge checklist for this card:
 *  1. It is an [Add] ability (429): it finalizes and resolves IMMEDIATELY — never a chain item, no
 *     priority passes, usable "at any time that spells or abilities require resources be paid"
 *     (429.3), including mid-payment of an X cost (429.3.a) and inside someone else's chain/showdown.
 *  2. BOTH costs must be payable: an exhausted Gold cannot be cracked (the [Exhaust] half), and the
 *     "Kill this" half means the token leaves the board — as a token it is simply gone from the base.
 *  3. [rainbow] here is one power "of any domain" (135.2.e.5.b): it pays a [calm] pip, an [order] pip
 *     or an Equip cost; it does NOT survive the turn — rune pools empty at end of turn (160/317).
 *  4. Only its CONTROLLER may activate it; the opponent never gets the option, even with priority.
 *  5. Typical arrival: minted EXHAUSTED by another card ("play a Gold gear token exhausted"), so it is
 *     dead weight until its controller's next Awaken — covered via Plundering Poro's conquer.
 *  6. Registry: one activated ability {timing reaction, cost {exhaust, kill self}, add-resource
 *     [rainbow]}; gear; energy 0; no power cost; no domain.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision, Game } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const GOLD = "unl-t05";
const BULLET_TIME = "ogn-268-298"; // 1 energy [Action]: pay any amount of [rainbow] → that much damage to enemies at a bf
const BF_SWORD = "sfd-161-221"; // Equipment, [Equip] [order], +3
const PLUNDERING_PORO = "sfd-069-221"; // 2-cost Mind unit: When I conquer, play a Gold gear token exhausted.
const CALM_CANTRIP = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  name: "Calm Cantrip",
  powerCost: ["calm"],
  timing: "action",
} as const;
const SLOW_BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Slow Bolt",
  timing: "action",
} as const;

const golds = (game: Game, seat: "p1" | "p2" = "p1") => game[seat].base().filter((id) => game.state(id).name === "Gold");

describe("Gold (unl-t05)", () => {
  test("registry payload: a costless, domainless GEAR with one [Reaction] activated ability — cost {exhaust + kill self} → add-resource [rainbow]", async () => {
    const game = await scenario().gear(P1, GOLD, "gold").build();
    const def = peekDefaultCardPool()?.get(GOLD);
    expect(def).toMatchObject({ cardType: "gear", name: "Gold" });
    expect(def?.energyCost ?? 0).toBe(0);
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.domain).toBeUndefined();
    expect(def?.abilities).toEqual([
      { cost: { exhaust: true, kill: "self" }, effect: { power: ["rainbow"], type: "add-resource" }, timing: "reaction", type: "activated" },
    ]);
    expect(game.state("gold")).toMatchObject({ cardType: "gear", energyCost: 0, isReady: true, name: "Gold", zone: "base" });
    expect(game.state("gold").domains).toEqual([]);
  });

  test("crack it on your turn: Gold leaves the base, +1 [rainbow] immediately, nothing on the chain, no priority window (429.2)", async () => {
    const game = await scenario().gear(P1, GOLD, "gold").build();
    expect(game.p1.can("activate", "gold")).toBe(true);
    await game.p1.activate("gold");
    expect(game.chain()).toEqual([]);
    expect(golds(game)).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("[Exhaust] is half the cost: an exhausted Gold is not activatable and stays put", async () => {
    const game = await scenario().gear(P1, GOLD, "gold", { exhausted: true }).build();
    expect(game.p1.can("activate", "gold")).toBe(false);
    expect((await game.p1.try((p) => p.activate("gold"))).ok).toBe(false);
    expect(golds(game)).toEqual(["gold"]);
    expect(game.p1.power()).toBe(0);
    // …and it readies at its controller's next Awaken.
    await game.advanceToTurnOf(P2);
    expect(game.state("gold").isExhausted).toBe(true);
    await game.advanceToTurnOf(P1);
    expect(game.state("gold").isReady).toBe(true);
    expect(game.p1.can("activate", "gold")).toBe(true);
  });

  test("the [rainbow] is power of ANY domain: it pays the [calm] pip of a 1+[calm] spell (unaffordable before cracking)", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).gear(P1, GOLD, "gold").hand(P1, CALM_CANTRIP, "cantrip").build();
    expect(game.p1.can("cast", "cantrip")).toBe(false);
    await game.p1.activate("gold");
    expect(game.p1.can("cast", "cantrip")).toBe(true);
    await game.p1.cast("cantrip");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0); // the rainbow paid the [calm] pip
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("it also pays an [Equip] [order] cost: crack Gold, then equip B.F. Sword onto a unit (+3)", async () => {
    const game = await scenario().gear(P1, GOLD, "gold").gear(P1, BF_SWORD, "sword").unit(P1, "base", { might: 2, name: "Squire" }, "squire").build();
    const equipOffered = () => game.p1.legal().some((o) => o.moveId === "equipCard");
    expect(equipOffered()).toBe(false); // no [order] to pay the Equip cost yet
    await game.p1.activate("gold");
    expect(equipOffered()).toBe(true);
    await game.p1.do("equipCard", { equipmentId: "sword", unitId: "squire" });
    await game.settle();
    expect(game.state("sword").attachedTo).toBe("squire");
    expect(game.state("squire").might).toBe(5);
    expect(game.p1.power()).toBe(0);
  });

  test("unspent [rainbow] does not carry over: crack at end of turn → the pool is empty on your next turn (rune pools empty, 317)", async () => {
    const game = await scenario().gear(P1, GOLD, "gold").build();
    await game.p1.activate("gold");
    expect(game.p1.power("rainbow")).toBe(1);
    await game.advanceTurn();
    expect(game.p1.power()).toBe(0);
    await game.advanceToTurnOf(P1);
    expect(game.p1.power()).toBe(0);
    expect(golds(game)).toEqual([]); // and the Gold is gone for good
  });

  test("[Reaction]: on the OPPONENT's turn, with priority on their spell, P1 may crack Gold; the spell stays the only chain item and still resolves", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", { might: 3, name: "Mine" }, "mine")
      .hand(P2, SLOW_BOLT, "bolt")
      .gear(P1, GOLD, "gold")
      .build();
    expect(game.p1.can("activate", "gold")).toBe(false); // P2's open state: P1 has no window yet
    await game.p2.cast("bolt", { targets: "mine" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("activate", "gold")).toBe(true);
    await game.p1.activate("gold");
    expect(game.chain().map((i) => i.cardId)).toEqual(["bolt"]);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.actingSeat()).toBe(P1); // 429.2.a: priority did not pass by cracking Gold
    await game.settle();
    expect(game.state("mine").damage).toBe(2);
  });

  test("only the CONTROLLER can crack it: P2 never has an activate option for P1's Gold, not even while holding priority", async () => {
    const game = await scenario().active(P2).resources(P2, { energy: 1 }).unit(P1, "base", { might: 3 }, "mine").hand(P2, SLOW_BOLT, "bolt").gear(P1, GOLD, "gold").build();
    expect(game.p2.can("activate", "gold")).toBe(false);
    await game.p2.cast("bolt", { targets: "mine" });
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("activate", "gold")).toBe(false);
    expect((await game.p2.try((p) => p.activate("gold"))).ok).toBe(false);
    expect(golds(game)).toEqual(["gold"]);
  });

  test("with Focus in a showdown on the opponent's turn: crack Gold to fund Bullet Time's [rainbow] X and shoot the attacker", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 1, name: "Poker" }, "poker")
      .gear(P1, GOLD, "gold")
      .hand(P1, BULLET_TIME, "bt")
      .build();
    await game.p2.move("poker", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("activate", "gold")).toBe(true);
    await game.p1.activate("gold");
    expect(game.p1.power("rainbow")).toBe(1);
    await game.p1.cast("bt", { targets: "bf1", x: 1 });
    expect(game.p1.energy()).toBe(0);
    await game.settle(); // X = 1 [rainbow] is paid as Bullet Time resolves (204.3.b)
    expect(game.p1.power()).toBe(0);
    expect(game.zoneOf("poker")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("429.3.a — mid-payment: while Bullet Time asks 'pay any amount of [rainbow]', Gold is still offered; cracking it raises the payable maximum from 0 to 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Foe" }, "foe")
      .gear(P1, GOLD, "gold")
      .hand(P1, BULLET_TIME, "bt")
      .build();
    await game.p1.cast("bt", { targets: "bf1" }); // X is named as the spell resolves (204.3.b)
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    const ask = game.decision();
    expect(ask).toMatchObject({ kind: "integer", max: 0, seat: P1, source: { cardId: "bt", pendingChoiceType: "pay-x" } });
    expect(ask?.kind === "integer" ? (ask.actions ?? []).map((a) => a.key) : []).toContain("activateAbility:gold#0");
    expect(game.p1.can("activate", "gold")).toBe(true);
    await game.p1.activate("gold"); // finalizes + resolves at once, even mid-resolution (429.3.a)
    expect(golds(game)).toEqual([]);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.decision()).toMatchObject({ kind: "integer", max: 1, seat: P1 });
    await game.p1.chooseX(1);
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.zoneOf("foe")).toBe("trash");
  });

  test("as minted in real games — Plundering Poro conquers → one Gold token in P1's base, EXHAUSTED, a token, not crackable until P1's next Awaken", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", PLUNDERING_PORO, "poro")
      .unit(P2, "bf1", { might: 1, name: "Speedbump" }, "bump")
      .build();
    await game.p1.move("poro", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    const [g] = golds(game);
    expect(g).toBeDefined();
    expect(game.state(g as string)).toMatchObject({ cardType: "gear", controller: P1, isExhausted: true, isToken: true, name: "Gold", owner: P1 });
    expect(game.p1.can("activate", g as string)).toBe(false);
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    expect(game.p1.can("activate", g as string)).toBe(true);
    await game.p1.activate(g as string);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(golds(game)).toEqual([]);
  });

  test("two Gold crack independently: 2 [rainbow] total, each activation removes exactly one token", async () => {
    const game = await scenario().gear(P1, GOLD, "g1").gear(P1, GOLD, "g2").build();
    await game.p1.activate("g1");
    expect(golds(game)).toEqual(["g2"]);
    expect(game.p1.power("rainbow")).toBe(1);
    await game.p1.activate("g2");
    expect(golds(game)).toEqual([]);
    expect(game.p1.power("rainbow")).toBe(2);
    expect(game.chain()).toEqual([]);
  });
});
