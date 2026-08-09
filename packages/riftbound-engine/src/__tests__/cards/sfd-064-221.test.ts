/**
 * Cloth Armor — sfd-064-221 · Gear — Equipment · Mind · 1 energy · Might bonus +0
 *
 *   [Quick-Draw] (This has [Reaction]. When you play it, attach it to a unit you control.)
 *   [Equip] [mind] ([mind]: Attach this to a unit you control.)
 *   Effect Text: [Shield 2] (+2 [Might] while I'm a defender.)
 *
 * Head-judge checklist (the tricky spots for THIS card):
 *  1. Quick-Draw = [Reaction] on the CARD + a play trigger that attaches it (819.1.d): playing it for
 *     1 energy attaches it right away to a unit you control WITHOUT paying the [mind] Equip cost. The
 *     [Equip] [mind] line only matters when the armor is lying loose in base (e.g. after its bearer
 *     died) — and THAT ability is default speed (151.2), not Reaction.
 *  2. Reaction timing (813): playable while holding priority on the opponent's chain and while holding
 *     Focus in a showdown, on either player's turn — the attach lands before the pending spell/combat.
 *     NOT playable in the opponent's Neutral Open state: only the turn player may act there (316.5.b).
 *  3. +0 Might bonus (137.2): the bearer's Might does not change — the card's value is making the unit
 *     "equipped" (818.3) at instant speed for equipped-matters effects (Ornn's +1 per gear, Jax
 *     Unrelenting's attach trigger, Weaponmaster's free re-Equip since [mind] − [rainbow] = 0).
 *  4. No unit you control: the play is still legal (a permanent needs no target); the trigger finds
 *     nothing and the armor simply sits in base — no dangling prompt.
 *  5. Bearer dies ⇒ the armor detaches and is recalled to base (719.5 / 149.3), not trashed; from
 *     there [Equip] [mind] re-attaches it (one mind, chain, resolves).
 *  6. Cost edges: 0 energy ⇒ unplayable even with mind power; the Quick-Draw attach never touches power.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision, Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-064-221";
const ORNN = "sfd-085-221"; // Ornn, Forge God · Mind · 6 · 4 Might · Deflect 2, Weaponmaster, +1 Might per friendly gear
const JAX_UNRELENTING = "sfd-119-221"; // When you attach an Equipment to me, you may pay [1] to draw 1.
const BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  rulesText: "[Action] Deal 2 to a unit.",
  timing: "action",
};

const equipPairs = (game: Game) =>
  game.p1
    .legal()
    .filter((o) => o.moveId === "equipCard")
    .flatMap((o) => o.variants.map((v) => `${String(v.params.equipmentId)}→${String(v.params.unitId)}`))
    .sort();

/** Answer the Quick-Draw attach prompt (if the engine asks) with `unit`, passing any priority windows. */
async function attachTo(game: Game, unit: string): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && (d.context === "main" || d.context === "showdown"))) {
      return;
    }
    if (d.kind === "pick" && d.seat === P1) {
      await game.p1.pick(unit);
    } else if (d.kind === "action" && d.context === "chain" && game.chain().every((c) => c.cardId === "cloth")) {
      await game.seat(d.seat).pass();
    } else {
      return;
    }
  }
}

describe("Cloth Armor (sfd-064-221)", () => {
  test("registry payload: 1-cost Mind equipment, +0 bonus, keywords [Quick-Draw] and [Equip] costing exactly [mind]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "equipment", domain: "mind", energyCost: 1, mightBonus: 0, name: "Cloth Armor" });
    expect(def?.powerCost).toBeUndefined();
    // Effect Text (gallery `effect`, rule 136 / 150.2 / 718.3): "[Shield 2] (+2 [Might] while I'm a
    // defender.)" — a keyword bar granted to the equipped unit while attached.
    expect(def?.abilities).toEqual([
      { keyword: "Quick-Draw", type: "keyword" },
      { cost: { power: ["mind"] }, keyword: "Equip", type: "keyword" },
      { effect: { keyword: "Shield", target: "self", type: "grant-keyword", value: 2 }, effectText: true, type: "static" },
    ] as never);
    const game = await scenario().hand(P1, CARD, "cloth").build();
    expect(game.state("cloth").keywords).toEqual(["Quick-Draw", "Equip"]);
  });

  test("own turn: play for 1 energy → choose a unit you control → attached at once; the [mind] Equip cost is NOT paid and the bearer's Might is unchanged (+0)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { mind: 1 } })
      .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
      .unit(P1, "base", { might: 1, name: "Other" }, "other")
      .unit(P2, "base", { might: 1, name: "Foe" }, "foe")
      .hand(P1, CARD, "cloth")
      .build();
    await game.p1.play("cloth");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 1 } });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" && d.options.map((o) => o.card ?? o.key).sort()).toEqual(["ally", "other"]); // never the foe
    await attachTo(game, "ally");
    expect(game.state("cloth").attachedTo).toBe("ally");
    expect(game.state("ally").attachments).toEqual(["cloth"]);
    expect(game.state("ally")).toMatchObject({ baseMight: 3, might: 3 });
    expect(game.p1.power("mind")).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("cost edge: 0 energy ⇒ unplayable no matter the power; exactly 1 energy and no power ⇒ playable", async () => {
    expect((await scenario().resources(P1, { energy: 0, power: { mind: 3 } }).unit(P1, "base", { might: 1 }, "u").hand(P1, CARD, "cloth").build()).p1.can("play", "cloth")).toBe(false);
    expect((await scenario().resources(P1, { energy: 1 }).unit(P1, "base", { might: 1 }, "u").hand(P1, CARD, "cloth").build()).p1.can("play", "cloth")).toBe(true);
  });

  test("no unit you control: the play is still legal, the armor lands loose in base and nothing is left dangling", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P2, "base", { might: 1 }, "foe").hand(P1, CARD, "cloth").build();
    await game.p1.play("cloth");
    await game.settle();
    expect(game.zoneOf("cloth")).toBe("base");
    expect(game.state("cloth").attachedTo).toBeUndefined();
    expect(game.state("foe").attachments).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("[Reaction] on the opponent's turn: with priority on P2's Bolt, P1 plays the armor and it is attached to the ally BEFORE the Bolt resolves", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1 })
      .resources(P2, { energy: 1 })
      .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
      .unit(P1, "base", { might: 1, name: "Other" }, "other")
      .hand(P2, BOLT, "bolt")
      .hand(P1, CARD, "cloth")
      .build();
    await game.p2.cast("bolt", { targets: "ally" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("play", "cloth")).toBe(true);
    await game.p1.play("cloth");
    expect(game.p1.energy()).toBe(0);
    await attachTo(game, "ally");
    expect(game.state("cloth").attachedTo).toBe("ally");
    expect(game.state("ally").damage).toBe(0); // bolt still pending
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bolt" })]);
    await game.settle();
    expect(game.state("ally").damage).toBe(2);
    expect(game.state("ally").attachments).toEqual(["cloth"]);
    expect(game.turnPlayer()).toBe(P2);
  });

  test("[Reaction] with Focus in a showdown while DEFENDING: after the attacker passes Focus, P1 plays it onto the defender; combat then resolves normally (+0 changes no math)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .hand(P1, CARD, "cloth")
      .build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.decision() as ActionDecision).toMatchObject({ context: "showdown", seat: P1 });
    await game.p1.play("cloth");
    await attachTo(game, "guard");
    expect(game.state("cloth").attachedTo).toBe("guard");
    expect(game.locationOf("cloth")).toBe("bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.state("guard").attachments).toEqual(["cloth"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("Reaction is not 'any time' — the armor must not be playable by P1 in P2's Neutral Open state (316.5.b), while P2 still holds priority (338), or while the attacker still holds Focus (347)", async () => {
    // Expected: in all three spots P1 is not the player entitled to act, so no play is offered and an attempt is
    // rejected. Actual: playGear:cloth is offered to P1 in each of them (and the Neutral Open play goes through).
    const open = await scenario().active(P2).resources(P1, { energy: 1 }).unit(P1, "base", { might: 3 }, "ally").hand(P1, CARD, "cloth").build();
    const prio = await scenario().active(P2).resources(P1, { energy: 1 }).resources(P2, { energy: 1 }).unit(P1, "base", { might: 3 }, "ally").hand(P2, BOLT, "bolt").hand(P1, CARD, "cloth").build();
    await prio.p2.cast("bolt", { targets: "ally" }); // P2 has not passed yet
    const focus = await scenario().active(P2).resources(P1, { energy: 1 }).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 3 }, "guard").unit(P2, "base", { might: 2 }, "raider").hand(P1, CARD, "cloth").build();
    await focus.p2.move("raider", "bf1"); // attacker holds Focus
    expect([open.p1.can("play", "cloth"), prio.p1.can("play", "cloth"), focus.p1.can("play", "cloth")]).toEqual([false, false, false]);
    expect((await open.p1.try((p) => p.play("cloth"))).ok).toBe(false);
    expect(open.zoneOf("cloth")).toBe("hand");
  });

  test("+0 still makes the unit EQUIPPED: Ornn ('+1 Might per friendly gear') grows the moment the armor is Quick-Drawn onto him at reaction speed", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1 })
      .resources(P2, { energy: 1, power: { fury: 2 } })
      .unit(P1, "base", ORNN, "ornn")
      .hand(P2, BOLT, "bolt")
      .hand(P1, CARD, "cloth")
      .build();
    expect(game.state("ornn").might).toBe(4);
    await game.p2.cast("bolt", { targets: "ornn" }); // Deflect 2 paid with the two fury
    await game.p2.passPriority();
    await game.p1.play("cloth");
    await attachTo(game, "ornn");
    expect(game.state("cloth").attachedTo).toBe("ornn");
    expect(game.state("ornn").might).toBe(5); // +0 bonus, +1 from his own static counting the gear
  });

  test("loose in base ⇒ the printed [Equip] [mind] works at default speed: one mind, an ability on the chain, attached on resolution — and it is NOT offered on the opponent's turn even with priority", async () => {
    const game = await scenario().resources(P1, { energy: 0, power: { mind: 1 } }).unit(P1, "base", { might: 2, name: "Ally" }, "ally").gear(P1, CARD, "cloth").build();
    expect(equipPairs(game)).toEqual(["cloth→ally"]);
    await game.p1.choose("equipCard", { params: { equipmentId: "cloth", unitId: "ally" } });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cloth", controller: P1 })]);
    await game.settle();
    expect(game.state("cloth").attachedTo).toBe("ally");
    expect(game.state("ally").might).toBe(2);

    const noMind = await scenario().resources(P1, { energy: 5, power: { fury: 1 } }).unit(P1, "base", { might: 2 }, "ally").gear(P1, CARD, "cloth").build();
    expect(equipPairs(noMind)).toEqual([]);

    const opp = await scenario()
      .active(P2)
      .resources(P1, { power: { mind: 1 } })
      .resources(P2, { energy: 1 })
      .unit(P1, "base", { might: 3 }, "ally")
      .gear(P1, CARD, "cloth")
      .hand(P2, BOLT, "bolt")
      .build();
    await opp.p2.cast("bolt", { targets: "ally" });
    await opp.p2.passPriority();
    expect(opp.actingSeat()).toBe(P1);
    expect(equipPairs(opp)).toEqual([]); // only the CARD has Reaction (819.1.b), not its [Equip] ability
  });

  test("Weaponmaster partner: playing Ornn with the armor loose in base offers to Equip it for [rainbow] less — [mind] − 1 = free", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { mind: 1 } }).gear(P1, CARD, "cloth").hand(P1, ORNN, "ornn").build();
    await game.p1.play("ornn");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 1 } });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "equip" });
    await game.p1.pick("cloth");
    await game.settle();
    expect(game.state("cloth").attachedTo).toBe("ornn");
    expect(game.p1.power("mind")).toBe(1); // nothing charged
  });

  test("bearer dies ⇒ the armor detaches and is recalled to base unattached (719.5 / 149.3), not trashed", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P1, CARD, "cloth")
      .build();
    await game.p1.play("cloth");
    await attachTo(game, "ally");
    expect(game.state("cloth").attachedTo).toBe("ally");
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("cloth")).toBe("base");
    expect(game.state("cloth").attachedTo).toBeUndefined();
    expect(game.p1.trash()).not.toContain("cloth");
  });

  test("the Quick-Draw attach IS 'attaching an Equipment' (819.1.d / 818.2) — Jax, Unrelenting's 'you may pay [1] to draw 1' must trigger off it", async () => {
    // Expected: after the armor is Quick-Drawn onto Jax, P1 (1 energy left) is asked yes/no; yes pays 1 and draws 1.
    // Actual: the attach happens but no attach-equipment trigger fires (the [Equip]/Weaponmaster paths do fire it).
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", JAX_UNRELENTING, "jax").hand(P1, CARD, "cloth").build();
    const handBefore = game.p1.hand().length;
    await game.p1.play("cloth");
    await attachTo(game, "jax");
    expect(game.state("cloth").attachedTo).toBe("jax");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 1);
  });

  // rule 136 / 150.2 / 718.3 — Effect Text (gallery `effect`): "[Shield 2] (+2 :rb_might: while I'm a
  // defender.)" is a keyword bar conferred on the equipped unit while attached (814: defender-only Might).
  test("Effect Text [Shield 2]: the BEARER defends at +2 — a 2-Might defender wearing it kills a 3-Might attacker and lives; the Armor itself and other units get nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Sentry" }, "sentry")
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P1, CARD, "cloth")
      .build();
    await game.p1.play("cloth");
    await attachTo(game, "sentry");
    await game.settle();
    expect(game.state("cloth").attachedTo).toBe("sentry");
    await game.advanceTurn(); // → P2 (a Cleanup has run: the static grant is in place)
    expect(game.state("sentry").grantedKeywords).toEqual([{ duration: "static", keyword: "Shield", value: 2 }]);
    expect(game.state("sentry").might).toBe(2); // +0 bonus; Shield counts only while defending
    expect(game.state("squire").grantedKeywords).toEqual([]);
    expect(game.state("cloth").keywords).toEqual(["Quick-Draw", "Equip"]); // 718.2: not the gear's own keyword
    await game.p2.move("raider", "bf1");
    expect(game.state("sentry")).toMatchObject({ combatRole: "defender", might: 4 });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // takes 4 ≥ 3
    expect(game.zoneOf("sentry")).toBe("battlefield-bf1"); // takes 3 < 4
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    // The same fight without the Armor: the bare 2-Might Sentry dies to the Raider.
    const bare = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Sentry" }, "sentry")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .gear(P1, CARD, "cloth") // unattached: confers nothing (136.2.b)
      .build();
    await bare.advanceTurn();
    await bare.p2.move("raider", "bf1");
    expect(bare.state("sentry")).toMatchObject({ combatRole: "defender", might: 2 });
    await bare.settle();
    expect(bare.zoneOf("sentry")).toBe("trash");
  });
});
