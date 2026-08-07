/**
 * Resonating Strike — ven-034-166 · Spell · Calm · 2 energy + [calm] · Reaction
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   [Reaction] (Play on your turn or in showdowns.)
 *   Choose a battlefield you control and a unit you control at a different location. Move that
 *   unit to that battlefield and give it +2 [Might] this turn.
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. TWO linked choices made at play time (355.8): a battlefield YOU CONTROL, and a friendly unit
 *     NOT already there. A unit sitting on your only controlled battlefield is not a legal pick, and
 *     with no controlled battlefield at all the spell cannot be put on the chain.
 *  2. The unit may come from ANY other location — your base or another battlefield (even one where
 *     it is facing enemies) — and it lands with +2 Might that lasts only this turn.
 *  3. Reaction timing (813): the marquee use is DEFENSIVE — the opponent walks into your battlefield,
 *     you get Focus in the combat showdown, and you pull a reinforcement in from base; it becomes a
 *     defender (464.2.c.3.a) and fights at +2. Also playable as a chain response on their turn; NOT
 *     playable in an open state on the opponent's turn.
 *  4. Hidden (811): hide at a controlled battlefield for [rainbow]; from the next turn play it for 0.
 *     From facedown at bf1 the battlefield choice is pinned to bf1 (811.1.d.2) while the unit — which
 *     by the card's own text can never be at that battlefield — is chosen freely (811.1.d.2.a, the
 *     Smoke and Mirrors ruling): the ambush pulls a unit INTO the trap's battlefield.
 *  5. With two controlled battlefields the caster picks the destination; with one it is forced.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-034-166";
const DISCIPLINE = "ogn-058-298"; // Reaction · 2 · Give a unit +2 Might this turn. Draw 1.

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "bf2", { might: 3, name: "Stray" }, "stray")
    .unit(P2, "bf2", { might: 4, name: "Foe" }, "foe")
    .hand(P1, CARD, "rs");
}

function castTargets(game: { p1: { option: (v: string, c: string) => { fields: readonly { arg: string; options?: readonly unknown[] }[] } | undefined } }) {
  return game.p1.option("cast", "rs")?.fields.find((f) => f.arg === "targets")?.options;
}

describe("Resonating Strike (ven-034-166)", () => {
  test("registry: Hidden keyword + a reaction-timed spell that moves a friendly unit to a controlled battlefield and gives it +2 this turn", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "calm", energyCost: 2, powerCost: ["calm"], timing: "reaction" });
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({ keyword: "Hidden", type: "keyword" });
    expect(def?.abilities?.[1]).toMatchObject({
      effect: {
        effects: [
          { target: { controller: "friendly", type: "unit" }, to: { battlefield: "controlled" }, type: "move" },
          { amount: 2, duration: "turn", target: { controller: "friendly", type: "unit" }, type: "modify-might" },
        ],
        type: "sequence",
      },
      timing: "reaction",
      type: "spell",
    });
  });

  test("cost 2 energy + 1 calm: a unit in base moves to your controlled battlefield with +2 Might; spell → trash", async () => {
    const game = await board().build();
    await game.p1.cast("rs", { targets: "home" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rs", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.locationOf("home")).toBe("bf1");
    expect(game.state("home").might).toBe(4);
    expect(game.zoneOf("rs")).toBe("trash");
    expect(game.state("holder").might).toBe(3); // bystanders untouched
  });

  test("unaffordable: no calm power (even with rainbow-less fury) or only 1 energy → not castable", async () => {
    const noCalm = await scenario().resources(P1, { energy: 5, power: { fury: 2 } }).battlefield("bf1", { controller: P1 }).unit(P1, "base", { might: 2 }, "home").hand(P1, CARD, "rs").build();
    expect(noCalm.p1.can("cast", "rs")).toBe(false);
    const oneEnergy = await scenario().resources(P1, { energy: 1, power: { calm: 1 } }).battlefield("bf1", { controller: P1 }).unit(P1, "base", { might: 2 }, "home").hand(P1, CARD, "rs").build();
    expect(oneEnergy.p1.can("cast", "rs")).toBe(false);
  });

  test("the unit may come from ANOTHER battlefield (leaving enemies behind): Stray bf2 → bf1 at 5 Might", async () => {
    const game = await board().build();
    await game.p1.cast("rs", { targets: "stray" });
    await game.settle();
    expect(game.locationOf("stray")).toBe("bf1");
    expect(game.state("stray").might).toBe(5);
    expect(game.locationOf("foe")).toBe("bf2");
    expect(game.state("foe").damage).toBe(0); // no combat happened anywhere
  });

  test("'this turn': the +2 is gone after the turn passes but the unit stays where it was moved", async () => {
    const game = await board().build();
    await game.p1.cast("rs", { targets: "home" });
    await game.settle();
    expect(game.state("home").might).toBe(4);
    await game.advanceTurn();
    expect(game.locationOf("home")).toBe("bf1");
    expect(game.state("home").might).toBe(2);
  });

  test("two controlled battlefields: the caster chooses the destination; a unit already on one is sent to the OTHER", async () => {
    const game = await board().battlefield("bf3", { controller: P1 }).build();
    await game.p1.cast("rs", { targets: "home" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("bf3");
    await game.settle();
    expect(game.locationOf("home")).toBe("bf3");
    expect(game.state("home").might).toBe(4);

    const forced = await board().battlefield("bf3", { controller: P1 }).build();
    await forced.p1.cast("rs", { targets: "holder" }); // Holder is at bf1 → only bf3 is "a different location"
    await forced.settle();
    expect(forced.locationOf("holder")).toBe("bf3");
    expect(forced.state("holder").might).toBe(5);
  });

  test("a friendly unit already at your only controlled battlefield is offered as a target although it has no 'different location' battlefield to move to (355.8)", async () => {
    // Expected: only Homebody (base) and Stray (bf2) pair with bf1; Holder is AT bf1 so it has no
    // "battlefield you control at a different location". Actual: Holder is offered too.
    const game = await board().build();
    const offered = castTargets(game);
    expect(offered).toEqual(expect.arrayContaining([["home"], ["stray"]]));
    expect(offered).not.toContainEqual(["holder"]);
    const r = await game.p1.try((p) => p.cast("rs", { targets: "holder" }));
    expect(r.ok).toBe(false);
  });

  test("castable with no controlled battlefield — 'choose a battlefield you control' has no valid choice so it must not reach the chain (355.8)", async () => {
    // Expected: "Choose a battlefield you control" has no valid choice → not castable, nothing paid.
    // Actual: castable; it resolves as a bare +2 Might on the unit in base.
    const game = await scenario()
      .resources(P1, { energy: 2, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
      .hand(P1, CARD, "rs")
      .build();
    expect(game.p1.can("cast", "rs")).toBe(false);
  });

  test("Reaction, defensively: the opponent attacks bf1, you take Focus and pull Homebody in from base — it defends at 4 and the attacker dies", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2, power: { calm: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 4, name: "Foe" }, "foe")
      .hand(P1, CARD, "rs")
      .build();
    await game.p2.move("foe", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.can("cast", "rs")).toBe(false); // attacker holds Focus first (464.2.d)
    await game.p2.passFocus();
    expect(game.p1.can("cast", "rs")).toBe(true);
    await game.p1.cast("rs", { targets: "home" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle(); // resolves the spell, then the combat: 4 attacking into 3 + 4 defending
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("home")).toBe("bf1");
    expect(game.state("home").might).toBe(4); // still this turn
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.turnPlayer()).toBe(P2);
  });

  test("Reaction on the opponent's turn: legal as a chain response (resolves first, LIFO), NOT legal in their open main phase", async () => {
    const open = await board().active(P2).build();
    expect(open.p1.can("cast", "rs")).toBe(false);

    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2, power: { calm: 1 } })
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
      .unit(P2, "base", { might: 4, name: "Foe" }, "foe")
      .hand(P2, DISCIPLINE, "disc")
      .hand(P1, CARD, "rs")
      .build();
    await game.p2.cast("disc", { targets: "foe" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "rs")).toBe(true);
    await game.p1.cast("rs", { targets: "home" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["disc", "rs"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // rs resolves first
    expect(game.locationOf("home")).toBe("bf1");
    expect(game.state("home").might).toBe(4);
    expect(game.zoneOf("disc")).toBe("chain");
    await game.settle();
    expect(game.state("foe").might).toBe(6);
  });

  test("Hidden: hide at a controlled battlefield for [rainbow] (no chain, not revealable this turn); not at an enemy battlefield", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", { might: 2 }, "home")
      .hand(P1, CARD, "rs")
      .build();
    await game.p1.hide("rs", "bf1");
    expect(game.zoneOf("rs")).toBe("facedown-bf1");
    expect(game.state("rs").isHidden).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("reveal", "rs")).toBe(false);
    const enemyBf = await scenario().resources(P1, { power: { rainbow: 1 } }).battlefield("bf1", { controller: P2 }).hand(P1, CARD, "rs").build();
    expect(enemyBf.p1.can("hide", "rs")).toBe(false);
  });

  test("cannot be played from facedown at bf1 unless a friendly unit is already AT bf1 — the unit 'at a different location' should be chosen freely and pulled into bf1 (811.1.d.2.a)", async () => {
    // Expected: the battlefield choice is pinned to bf1 (where it was hidden); the unit "at a
    // different location" is chosen freely (Homebody in base) and moves to bf1 with +2 Might; no
    // energy/calm is paid. Actual: with no friendly unit AT bf1 the reveal is not offered at all.
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
      .hand(P1, CARD, "rs")
      .build();
    await game.p1.hide("rs", "bf1");
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.can("reveal", "rs")).toBe(true);
    await game.p1.reveal("rs", { answers: ["home"] });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("home");
    }
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("home");
      await game.settle();
    }
    expect(game.locationOf("home")).toBe("bf1");
    expect(game.state("home").might).toBe(4);
    expect(game.zoneOf("rs")).toBe("trash");
  });
});
