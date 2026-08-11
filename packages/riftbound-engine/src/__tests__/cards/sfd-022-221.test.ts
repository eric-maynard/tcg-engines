/**
 * Long Sword — sfd-022-221 · Gear — Equipment · Fury · 2 energy + [fury] · +2 Might
 *
 *   [Quick-Draw] (This has [Reaction]. When you play it, attach it to a unit you control.)
 *   [Equip] [fury] ([fury]: Attach this to a unit you control.)
 *
 * Rules: 819 (Quick-Draw = [Reaction] on the CARD + "When you play this, attach it to a unit you
 * control" — no Equip cost is paid for that attach), 813 + 316.5.b (Reaction = may be played in Closed
 * states / showdowns on any turn, but never in the opponent's Neutral Open state where only the turn
 * player acts), 359.2.d (a gear enters ready in base the moment it is finalized — it never waits on the
 * chain), 818 + 151.2 (Equip is a standard-speed ACTIVATED ability: pay [fury], ability on the chain,
 * attach on resolution; own Main Phase, Open state, no showdown), 716 (holder leaves the board → the
 * Equipment detaches and is recalled to base at the next cleanup), mightBonus applies only while attached.
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. Reaction-speed COMBAT TRICK: in response to Hextech Ray (3 dmg) on my 2-Might unit, or with Focus
 *     as the defender in a showdown, the sword lands and attaches BEFORE the damage → the unit lives/wins.
 *  2. Reaction is permission, not omnipresence: on the opponent's quiet main phase P1 may NOT play it.
 *  3. The Quick-Draw attach only offers units I control; with two it is a real choice; with none the
 *     sword simply sits in base unattached (a gear may always be played).
 *  4. Costs: the play is 2 + [fury]; the later [Equip] is a separate [fury]; neither is the other.
 *  5. After the holder dies the sword survives in base and can be re-Equipped for [fury] — on MY turn
 *     only, through a chain item the opponent may respond to; without a fury power it is not offered.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-022-221";
const HEXTECH_RAY = "ogn-009-298"; // [Action] 1 + [fury]: Deal 3 to a unit at a battlefield.

function hand(energy = 2, fury = 1) {
  return scenario()
    .resources(P1, { energy, power: { fury } })
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .unit(P1, "base", { might: 3, name: "Knight" }, "knight")
    .unit(P2, "base", { might: 3, name: "Foe" }, "foe")
    .hand(P1, CARD, "ls");
}

describe("Long Sword (sfd-022-221)", () => {
  test("registry payload: 2-energy + [fury] Fury Equipment, +2 bonus, abilities = [Quick-Draw keyword, Equip keyword costed [fury]]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "equipment", domain: "fury", energyCost: 2, mightBonus: 2, name: "Long Sword", powerCost: ["fury"] });
    expect(def?.abilities).toEqual([
      { keyword: "Quick-Draw", type: "keyword" },
      { cost: { power: ["fury"] }, keyword: "Equip", type: "keyword" },
    ]);
    const game = await hand().build();
    expect(game.state("ls").keywords).toEqual(expect.arrayContaining(["Quick-Draw", "Equip"]));
  });

  test("cost: playing it spends 2 energy + 1 fury; 1 energy or no fury power ⇒ not playable", async () => {
    const game = await hand(3, 2).build();
    await game.p1.play("ls", { answers: ["squire"] });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect((await hand(1, 2).build()).p1.can("play", "ls")).toBe(false);
    expect((await hand(2, 0).build()).p1.can("play", "ls")).toBe(false);
    expect((await scenario().resources(P1, { energy: 2, power: { calm: 1 } }).hand(P1, CARD, "ls").build()).p1.can("play", "ls")).toBe(false);
  });

  test("Quick-Draw rider: on play I must pick a unit I CONTROL (Squire | Knight — never Foe); it attaches at once for no extra [fury] and gives +2", async () => {
    const game = await hand().build();
    await game.p1.play("ls");
    expect(game.decision()).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1 });
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["knight", "squire"]);
    expect((await game.p1.try((p) => p.pick("foe"))).ok).toBe(false);
    await game.p1.pick("knight");
    await game.settle();
    expect(game.state("ls").attachedTo).toBe("knight");
    expect(game.state("knight")).toMatchObject({ attachments: ["ls"], might: 5 });
    expect(game.state("squire").might).toBe(2);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // only the play cost — no Equip [fury]
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("no unit to attach to: still playable (a gear may always be played) — it enters the base READY and unattached (359.2.d)", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { fury: 1 } }).unit(P2, "base", { might: 3 }, "foe").hand(P1, CARD, "ls").build();
    expect(game.p1.can("play", "ls")).toBe(true);
    await game.p1.play("ls");
    await game.settle();
    expect(game.zoneOf("ls")).toBe("base");
    expect(game.state("ls")).toMatchObject({ attachedTo: undefined, isReady: true });
    expect(game.state("foe").attachments).toEqual([]);
  });

  test("[Reaction] combat trick on the OPPONENT's turn: in response to Hextech Ray (3) on my 2-Might Squire the sword attaches first → Squire is a 4, takes 3, survives", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Squire" }, "squire")
      .hand(P1, CARD, "ls")
      .hand(P2, HEXTECH_RAY, "ray")
      .build();
    await game.p2.cast("ray", { targets: "squire" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("play", "ls")).toBe(true);
    await game.p1.play("ls", { answers: ["squire"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("squire");
    }
    // The gear itself never sits on the chain (359.2) — Hextech Ray is still the item waiting to resolve.
    expect(game.chain().map((i) => i.cardId)).toContain("ray");
    await game.settle();
    expect(game.state("ls").attachedTo).toBe("squire");
    expect(game.zoneOf("squire")).toBe("battlefield-bf1");
    expect(game.state("squire")).toMatchObject({ damage: 3, might: 4 });
    expect(game.zoneOf("ray")).toBe("trash");
  });

  test("[Reaction] with Focus in a showdown: defending 2-Might Squire + sword (4) beats the 3-Might attacker and keeps the battlefield", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Squire" }, "squire")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P1, CARD, "ls")
      .build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.play("ls", { answers: ["squire"] });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("squire");
    }
    // rule 819.1.d / 383.4.a.2 — the attach is a triggered ability on the Chain:
    // Squire is still 2 until it resolves, and only then wins the showdown.
    expect(game.state("squire").might).toBe(2);
    await game.settle();
    expect(game.state("squire").might).toBe(4);
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("squire")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("ls").attachedTo).toBe("squire");
  });

  test("316.5.b — Reaction is not 'any time': in the opponent's Neutral Open main phase (nothing on the chain) P1 may NOT play the sword", async () => {
    // Expected: only the turn player acts in a Neutral Open state → playGear:ls is not offered / rejected.
    // Actual: the engine offers and accepts the play on P2's quiet turn (and even attaches it).
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .hand(P1, CARD, "ls")
      .build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.can("play", "ls")).toBe(false);
    const r = await game.p1.try((p) => p.play("ls", { answers: ["squire"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("ls")).toBe("hand");
  });

  test("716 — when the holder dies the sword detaches, is recalled to base ready and gives nobody +2", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder", { equippedWith: ["ls"] })
      .card("ls", { def: CARD, meta: { attachedTo: "holder" }, owner: P1, zone: "bf1" })
      .unit(P1, "base", { might: 2, name: "Other" }, "other")
      .hand(P2, HEXTECH_RAY, "ray")
      .build();
    expect(game.state("holder").might).toBe(3); // 1 + 2: exactly lethal for a 3-damage Ray
    await game.p2.cast("ray", { targets: "holder" });
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.zoneOf("ls")).toBe("base");
    expect(game.state("ls")).toMatchObject({ attachedTo: undefined, isReady: true });
    expect(game.state("other")).toMatchObject({ attachments: [], might: 2 });
    // 151.2 — and P1 cannot re-Equip it during P2's turn.
    expect(game.p1.legal().filter((o) => o.moveId === "equipCard")).toEqual([]);
  });

  test("[Equip] [fury] on my turn: pays exactly 1 fury (no energy), puts an ability on the chain the opponent may answer, attaches on resolution (+2)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .gear(P1, CARD, "ls")
      .build();
    const variants = game.p1.legal().filter((o) => o.moveId === "equipCard").flatMap((o) => o.variants.map((v) => v.params));
    expect(variants).toEqual([expect.objectContaining({ equipmentId: "ls", unitId: "squire" })]);
    await game.p1.do("equipCard", { equipmentId: "ls", unitId: "squire" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ls", controller: P1, triggered: false })]);
    expect(game.state("ls").attachedTo).toBeUndefined();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.state("squire").might).toBe(2);
    await game.p2.passPriority();
    expect(game.state("ls").attachedTo).toBe("squire");
    expect(game.state("squire").might).toBe(4);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("[Equip] negative space: without a fury power (energy alone, or calm power) the Equip is not offered; enemy units are never Equip targets", async () => {
    const noFury = await scenario().resources(P1, { energy: 5, power: { calm: 2 } }).unit(P1, "base", { might: 2 }, "squire").gear(P1, CARD, "ls").build();
    expect(noFury.p1.legal().filter((o) => o.moveId === "equipCard")).toEqual([]);
    expect((await noFury.p1.try((p) => p.do("equipCard", { equipmentId: "ls", unitId: "squire" }))).ok).toBe(false);
    const onlyFoe = await scenario().resources(P1, { power: { fury: 1 } }).unit(P2, "base", { might: 2 }, "foe").gear(P1, CARD, "ls").build();
    expect(onlyFoe.p1.legal().filter((o) => o.moveId === "equipCard")).toEqual([]);
    expect((await onlyFoe.p1.try((p) => p.do("equipCard", { equipmentId: "ls", unitId: "foe" }))).ok).toBe(false);
    expect(onlyFoe.state("foe").might).toBe(2);
  });

  test("151.2 — [Equip] is standard speed even though the CARD has Reaction: with a loose sword in base, P1 gets no equip option inside a chain on P2's turn", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2, power: { fury: 2 } })
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Squire" }, "squire")
      .gear(P1, CARD, "ls")
      .hand(P2, HEXTECH_RAY, "ray")
      .build();
    await game.p2.cast("ray", { targets: "squire" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.legal().filter((o) => o.moveId === "equipCard")).toEqual([]);
    expect((await game.p1.try((p) => p.do("equipCard", { equipmentId: "ls", unitId: "squire" }))).ok).toBe(false);
    await game.settle();
    expect(game.zoneOf("squire")).toBe("trash"); // 2 Might, 3 damage, no sword
    expect(game.state("ls").attachedTo).toBeUndefined();
  });
});
