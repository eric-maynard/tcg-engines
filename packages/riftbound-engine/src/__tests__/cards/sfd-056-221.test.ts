/**
 * Sterak's Gage — sfd-056-221 · Gear — Equipment · Calm · 3 energy + [calm][calm] · Might Bonus +3
 *
 *   [Quick-Draw] (This has [Reaction]. When you play it, attach it to a unit you control.)
 *   [Equip] [calm] ([calm]: Attach this to a unit you control.)
 *
 * Rules: 819 (Quick-Draw = [Reaction] + "When you play this, attach it to a unit you control";
 * no Equip cost is paid for that attach), 813 (Reaction: playable in Closed States on any player's
 * turn and, via Action's permissions, in showdowns — but still only with Priority/Focus, 312 /
 * 313.1 / 316.5.b), 337.2 (a Gear resolves the moment it is finalized — no chain item, nobody
 * responds to the gear itself), 818 (Equip = "[calm]: Attach this to a unit you control", an
 * activated ability → 381/151.2 standard timing, uses the chain), 718.2 (an ATTACHED card's printed
 * text is inactive → no re-Equip while worn), 718.4 / 137.3 (the +3 applies only while attached),
 * 719.5 + 149.3 (wearer leaves the board → the Equipment detaches where it is and the next cleanup
 * recalls the loose gear to its controller's base), 108.2 ("a unit you CONTROL", not own).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. Two different attach routes with two different prices: the Reaction PLAY costs 3+[calm][calm]
 *     and attaches for free; the [Equip] re-attach of a loose Gage costs exactly one [calm].
 *  2. Reaction in anger: in response to a 3-damage spell on a 3-Might unit the Gage lands first
 *     (immediate resolution) → 6 Might survives; with Focus in the OPPONENT's showdown a 3-Might
 *     defender becomes 6 and kills a 5-Might attacker.
 *  3. Permission is not priority: on the opponent's turn with no chain (Neutral Open) or in their
 *     showdown before Focus is passed, P1 must NOT be able to slam the Gage.
 *  4. After the wearer dies the Gage is not lost: it ends loose and READY in base and can be
 *     re-Equipped to another unit on a later turn.
 *  5. Attach candidates follow control: a unit P1 controls but P2 owns is legal; P2's units never.
 *  6. Edge: no unit you control → the play is still legal (the trigger simply has nothing to
 *     attach to) and the Gage waits loose in base, granting nobody +3.
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-056-221";
const bolt = (amount: number, timing: "action" | "reaction" = "action") =>
  ({
    abilities: [{ effect: { amount, target: { type: "unit" }, type: "damage" }, timing, type: "spell" }],
    cardType: "spell",
    domain: "fury",
    energyCost: 1,
    name: `Bolt ${amount}`,
    rulesText: `Deal ${amount} to a unit.`,
    timing,
  }) as const;

const equipOffered = (game: { p1: { legal(): readonly { moveId: string }[] } }) => game.p1.legal().some((o) => o.moveId === "equipCard");

/** P2's turn: P2 holds Bolt 3 + 1 energy; P1 holds the Gage + its full cost and one 3-Might unit. */
function reactionBoard() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 3, power: { calm: 2 } })
    .resources(P2, { energy: 1 })
    .unit(P1, "base", { might: 3, name: "Target" }, "a")
    .hand(P1, CARD, "gage")
    .hand(P2, bolt(3), "bolt");
}

describe("Sterak's Gage (sfd-056-221)", () => {
  test("registry payload: Calm Equipment, 3 energy + [calm][calm], +3 Might Bonus, abilities = [Quick-Draw keyword, Equip keyword costing one [calm]]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "equipment", domain: "calm", energyCost: 3, mightBonus: 3, name: "Sterak's Gage" });
    expect(def?.powerCost).toEqual(["calm", "calm"]);
    expect(def?.abilities).toEqual([
      { keyword: "Quick-Draw", type: "keyword" },
      { cost: { power: ["calm"] }, keyword: "Equip", type: "keyword" },
    ]);
  });

  test("own turn: playing it costs exactly 3 energy + 2 calm (no Equip [calm] on top), asks which unit YOU CONTROL wears it (enemy units not offered) and gives that unit +3", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 3 } })
      .unit(P1, "base", { might: 2, name: "Squire" }, "a")
      .unit(P1, "base", { might: 3, name: "Knight" }, "b")
      .unit(P2, "base", { might: 4, name: "Foe" }, "foe")
      .hand(P1, CARD, "gage")
      .build();
    await game.p1.play("gage");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 1 } });
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1, source: { cardId: "gage" } });
    expect(d.options.map((o) => o.key).sort()).toEqual(["a", "b"]);
    await game.p1.pick("b");
    await game.settle();
    expect(game.state("gage").attachedTo).toBe("b");
    expect(game.state("b")).toMatchObject({ baseMight: 3, might: 6 });
    expect(game.state("a").might).toBe(2);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 1 } }); // the attach was free
    expect(game.violations()).toEqual([]);
  });

  test("cost gate: 3 energy + one calm, or 2 energy + two calm, or two off-domain power → not playable", async () => {
    const mk = (energy: number, power: Record<string, number>) => scenario().resources(P1, { energy, power }).unit(P1, "base", { might: 2 }, "a").hand(P1, CARD, "gage").build();
    expect((await mk(3, { calm: 1 })).p1.can("play", "gage")).toBe(false);
    expect((await mk(2, { calm: 2 })).p1.can("play", "gage")).toBe(false);
    expect((await mk(3, { fury: 2 })).p1.can("play", "gage")).toBe(false);
    expect((await mk(3, { calm: 2 })).p1.can("play", "gage")).toBe(true);
  });

  test("a Gear resolves as soon as it is finalized (337.2): no chain item, the opponent gets no window, and once worn its printed [Equip] is inactive (718.2) — no equip option remains", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { calm: 3 } }).unit(P1, "base", { might: 2 }, "solo").hand(P1, CARD, "gage").build();
    await game.p1.play("gage");
    expect(game.chain()).toEqual([]);
    await game.settle(); // lone unit: locked in
    expect(game.state("gage").attachedTo).toBe("solo");
    expect(game.state("solo").might).toBe(5);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(equipOffered(game)).toBe(false); // 1 calm left, but the worn Gage cannot re-Equip
  });

  test("[Reaction] on the opponent's chain: Bolt 3 at my 3-Might unit → I respond with the Gage, it attaches at once (+3 → 6) under the bolt, and the bolt then leaves a live unit with 3 damage", async () => {
    const game = await reactionBoard().build();
    await game.p2.cast("bolt", { targets: "a" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("play", "gage")).toBe(true);
    await game.p1.play("gage");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("a");
    }
    expect(game.state("gage").attachedTo).toBe("a"); // already worn while the bolt is still pending
    expect(game.state("a").might).toBe(6);
    expect(game.chain().map((i) => i.cardId)).toEqual(["bolt"]); // the gear never sat on the chain
    expect(game.actingSeat()).toBe(P1); // finalizing/resolving my gear did not pass my priority (337.1.a)
    await game.settle();
    expect(game.zoneOf("a")).toBe("base");
    expect(game.state("a")).toMatchObject({ damage: 3, might: 6 });
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.turnPlayer()).toBe(P2);
  });

  test.failing("BUG: after I add the Gage to their chain, 'all passed in sequence WITHOUT adding an item' (339.1) is broken — my pass must hand priority back to P2 before the bolt resolves", async () => {
    // Expected: P2 pass → P1 plays Gage (an added, immediately-resolved item) → P1 pass → P2 holds
    // priority again with the bolt still on the chain (they may want a second bolt now). Actual: P2's
    // earlier pass still counts, so P1's pass resolves the bolt straight away.
    const game = await reactionBoard().build();
    await game.p2.cast("bolt", { targets: "a" });
    await game.p2.passPriority();
    await game.p1.play("gage");
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("a");
    }
    expect(game.state("a").might).toBe(6);
    await game.p1.passPriority();
    expect(game.chain().map((i) => i.cardId)).toEqual(["bolt"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.state("a").damage).toBe(0);
  });

  test("[Reaction] ⊇ [Action]: with Focus in the OPPONENT's showdown the 3-Might defender puts on the Gage (6) and kills the 5-Might attacker; the field stays mine", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { calm: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P1, "base", { might: 1, name: "Homebody" }, "home")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .hand(P1, CARD, "gage")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.play("gage");
    const d = game.decision() as PickDecision;
    expect(d.options.map((o) => o.key).sort()).toEqual(["holder", "home"]); // any unit I control, not just "here"
    await game.p1.pick("holder");
    expect(game.state("holder").might).toBe(6);
    expect(game.zoneOf("gage")).toBe("battlefield-bf1"); // worn gear is where its wearer is (719.3)
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("holder")).toBe("battlefield-bf1");
    expect(game.state("holder").damage).toBe(0); // healed at end of combat
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("Reaction is permission, not priority (316.5.b / 312.1.b) — on the opponent's turn in a Neutral OPEN state (no chain) the Gage cannot be played", async () => {
    // Expected: P2's empty main phase gives P1 no priority, so `play(gage)` is illegal and nothing is
    // spent. Actual: playGear is offered to P1 and executes (3 energy + 2 calm gone, Gage attached).
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { calm: 2 } })
      .unit(P1, "base", { might: 3 }, "a")
      .hand(P1, CARD, "gage")
      .build();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.can("play", "gage")).toBe(false);
    const r = await game.p1.try((p) => p.play("gage"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("gage")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { calm: 2 } });
  });

  test("in the opponent's showdown BEFORE they pass Focus (313.1), P1 has no Focus and cannot play the Gage yet", async () => {
    // Expected: while P2 (attacker) still holds Focus, P1's Reaction gear is not playable; it becomes
    // playable only after `passFocus()`. Actual: P1 may play it immediately and it attaches.
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { calm: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3 }, "holder")
      .unit(P2, "base", { might: 5 }, "raider")
      .hand(P1, CARD, "gage")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.can("play", "gage")).toBe(false);
    const r = await game.p1.try((p) => p.play("gage"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("gage")).toBe("hand");
    await game.p2.passFocus();
    expect(game.p1.can("play", "gage")).toBe(true);
  });

  test("[Equip] [calm] on a loose Gage: costs exactly one calm (energy untouched), goes on the chain as an ability, attaches on resolution for +3; without a calm power it is not offered at all", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { calm: 1 } })
      .unit(P1, "base", { might: 2, name: "Squire" }, "a")
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .gear(P1, CARD, "gage")
      .build();
    expect(game.state("a").might).toBe(2); // a loose Gage buffs nobody (718.4)
    const opt = game.p1.option("equipCard");
    expect(opt?.fields.find((f) => f.name === "unitId")?.options).toEqual(["a"]); // only units I control
    await game.p1.do("equipCard", { equipmentId: "gage", unitId: "a" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gage", controller: P1, triggered: false, type: "ability" })]);
    expect(game.state("gage").attachedTo).toBeUndefined();
    await game.settle();
    expect(game.state("gage").attachedTo).toBe("a");
    expect(game.state("a").might).toBe(5);

    const noCalm = await scenario().resources(P1, { energy: 5, power: { fury: 2 } }).unit(P1, "base", { might: 2 }, "a").gear(P1, CARD, "gage").build();
    expect(equipOffered(noCalm)).toBe(false);
  });

  test("[Equip] is a standard-speed activated ability (381 / 151.2): not on the opponent's turn, not during a showdown, not while a chain is open", async () => {
    const base = () =>
      scenario()
        .resources(P1, { energy: 1, power: { calm: 1 } })
        .battlefield("bf1", { controller: P2 })
        .unit(P1, "base", { might: 2 }, "a")
        .unit(P2, "bf1", { might: 2 }, "foe")
        .gear(P1, CARD, "gage")
        .hand(P1, bolt(1), "ping");
    expect(equipOffered(await base().build())).toBe(true);
    expect(equipOffered(await base().active(P2).build())).toBe(false);
    const showdown = await base().build();
    await showdown.p1.move("a", "bf1");
    expect(showdown.decision()).toMatchObject({ context: "showdown", seat: P1 });
    expect(equipOffered(showdown)).toBe(false);
    const closed = await base().build();
    await closed.p1.cast("ping", { targets: "foe" });
    expect(closed.chain()).toHaveLength(1);
    expect(equipOffered(closed)).toBe(false);
  });

  test("wearer dies (Bolt 4 on a 1+3 unit at a battlefield): the Gage detaches, is recalled loose and ready to my base (719.5 / 149.3), and next turn re-Equips onto another unit for one calm", async () => {
    const game = await scenario()
      .resources(P1, { power: { calm: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Doomed" }, "a")
      .unit(P1, "base", { might: 2, name: "Heir" }, "b")
      .gear(P1, CARD, "gage")
      .hand(P2, bolt(4, "reaction"), "bolt")
      .build();
    await game.p1.do("equipCard", { equipmentId: "gage", unitId: "a" });
    await game.settle();
    expect(game.state("a").might).toBe(4);
    expect(game.zoneOf("gage")).toBe("battlefield-bf1");
    await game.advanceTurn();
    await game.p2.do("addResources", { energy: 1 });
    await game.p2.cast("bolt", { targets: "a" });
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash"); // 4 damage ≥ 1 + 3
    expect(game.zoneOf("gage")).toBe("base");
    expect(game.state("gage")).toMatchObject({ isReady: true, owner: P1 });
    expect(game.state("gage").attachedTo).toBeUndefined();
    expect(game.state("b").might).toBe(2);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { power: { calm: 1 } });
    expect(equipOffered(game)).toBe(true);
    await game.p1.do("equipCard", { equipmentId: "gage", unitId: "b" });
    await game.settle();
    expect(game.state("gage").attachedTo).toBe("b");
    expect(game.state("b").might).toBe(5);
    expect(game.p1.power("calm")).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test.failing("BUG: 'a unit you CONTROL' (108.2 / 718.5.e): a unit P1 controls but P2 owns is a legal wearer alongside P1's own; P2's units never are", async () => {
    // Expected: the Quick-Draw attach offers ["mine", "stolen"] and the Gage can sit on the stolen
    // unit (5 Might). Actual: candidates are filtered by OWNER, so only "mine" qualifies, it is locked
    // in without a prompt, and the controlled-but-not-owned unit can never be equipped.
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 2 } })
      .card("stolen", { controller: P1, def: { cardType: "unit", might: 2, name: "Turncoat" }, owner: P2, zone: "base" })
      .unit(P1, "base", { might: 1, name: "Mine" }, "mine")
      .unit(P2, "base", { might: 2, name: "Theirs" }, "theirs")
      .hand(P1, CARD, "gage")
      .build();
    await game.p1.play("gage");
    const d = game.decision() as PickDecision;
    expect(d.kind).toBe("pick");
    expect(d.options.map((o) => o.key).sort()).toEqual(["mine", "stolen"]);
    await game.p1.pick("stolen");
    await game.settle();
    expect(game.state("gage").attachedTo).toBe("stolen");
    expect(game.state("stolen")).toMatchObject({ controller: P1, might: 5, owner: P2 });
  });

  test("edge — no unit you control: the play is still legal and fully paid; the Quick-Draw attach has no object, so the Gage waits loose in base and buffs nobody", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 2 } })
      .unit(P2, "base", { might: 2, name: "Theirs" }, "theirs")
      .hand(P1, CARD, "gage")
      .build();
    expect(game.p1.can("play", "gage")).toBe(true);
    await game.p1.play("gage");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("gage")).toBe("base");
    expect(game.state("gage").attachedTo).toBeUndefined();
    expect(game.state("theirs").might).toBe(2);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.violations()).toEqual([]);
  });
});
