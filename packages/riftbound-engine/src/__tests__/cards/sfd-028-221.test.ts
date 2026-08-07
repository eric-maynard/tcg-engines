/**
 * Lucian, Gunslinger — sfd-028-221 · Champion Unit (Lucian) · Fury · 3 energy · 2 might
 *
 *   [Assault] (+1 [Might] while I'm an attacker.)
 *   When I attack, deal damage equal to my [Assault] to an enemy unit here.
 *
 * Head-judge notes (the tricky spots this file covers):
 *  1. The damage equals the ASSAULT VALUE (807.1.b.2), not Lucian's Might: 1 by default.
 *  2. Assault stacks (807.2): Cleave's [Assault 3] on Lucian → Assault 4 → the trigger deals 4,
 *     and he swings for 6 in that combat; the grant is "this turn" and expires on advanceTurn().
 *  3. Attack triggers fire when the unit gains the Attacker designation (383.4.e) — never on
 *     defense, never on a move to an open battlefield (no combat, 170.11.c).
 *  4. "here" = the battlefield Lucian attacked; enemy units in a base / elsewhere are not offered;
 *     friendly units here are not offered.
 *  5. Ordering: the trigger resolves on the combat chain BEFORE combat damage, so it can make an
 *     otherwise-surviving defender exactly lethal, or clear the lone defender so Lucian conquers
 *     untouched.
 *  6. Assault only applies while attacking: 2 Might in base, 3 during his attack, 2 again after.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-028-221";
const CLEAVE = "ogn-004-298"; // [Action] Give a unit [Assault 3] this turn — 1 energy, Fury

function attacking(defMight: number, extra?: (b: ReturnType<typeof scenario>) => void) {
  const b = scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: defMight, name: "Defender" }, "def")
    .unit(P1, "base", CARD, "lucian");
  extra?.(b);
  return b;
}

describe("Lucian, Gunslinger (sfd-028-221)", () => {
  test("parsed abilities: Assault 1 keyword + an attack trigger dealing damage = own Assault to an enemy unit here", async () => {
    const game = await scenario().unit(P1, "base", CARD, "lucian").build();
    const s = game.state("lucian");
    expect(s.keywords).toContain("Assault");
    expect(s.baseMight).toBe(2);
    const abilities = (await import("../../../../riftbound-cards/src/data/all-cards")).getAllCards().find((c) => c.id === CARD)?.abilities as unknown as Record<string, unknown>[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toMatchObject({ keyword: "Assault", type: "keyword", value: 1 });
    expect(abilities[1]).toMatchObject({
      effect: { amount: { keywordValue: "Assault", of: "self" }, target: { controller: "enemy", location: "here", type: "unit" }, type: "damage" },
      trigger: { event: "attack", on: "self" },
      type: "triggered",
    });
  });

  test("cost: 3 energy, no power; enters the base exhausted at 2 Might; 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "lucian").build();
    await game.p1.play("lucian", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("lucian")).toBe("base");
    expect(game.state("lucian")).toMatchObject({ isExhausted: true, might: 2 });
    const poor = await scenario().resources(P1, { energy: 2, power: { fury: 1 } }).hand(P1, CARD, "lucian").build();
    expect(poor.p1.can("play", "lucian")).toBe(false);
  });

  test("When I attack: the trigger goes on the combat chain and deals 1 (his Assault value, not his Might) to the enemy unit here", async () => {
    const game = await attacking(7).build();
    await game.p1.move("lucian", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lucian", controller: P1, triggered: true })]);
    expect(game.state("lucian").might).toBe(3); // Assault live while attacking
    await game.p1.passPriority();
    await game.p2.passPriority();
    if (game.decision()?.kind === "pick") await game.p1.pick("def");
    expect(game.state("def").damage).toBe(1);
    expect(game.locationOf("def")).toBe("bf1");
  });

  test("ordering: trigger 1 + combat 3 is exactly lethal on a 4-Might defender (who would otherwise survive)", async () => {
    const game = await attacking(4).build();
    await game.p1.move("lucian", "bf1");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("def");
      await game.settle();
    }
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("lucian")).toBe("trash"); // took 4 ≥ 3
    expect(game.gameState.battlefields.bf1?.controller).toBeNull(); // 466.5.b: nobody left → uncontrolled
    expect(game.p1.points()).toBe(0);
  });

  test("clearing the lone 1-Might defender with the trigger: Lucian conquers without taking damage", async () => {
    const game = await attacking(1).build();
    await game.p1.move("lucian", "bf1");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("def");
      await game.settle();
    }
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.locationOf("lucian")).toBe("bf1");
    expect(game.state("lucian").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("lucian").might).toBe(2); // Assault gone once he is no longer an attacker
  });

  test("'an enemy unit here': only enemy units at the attacked battlefield are offered (not base, not bf2, not friends)", async () => {
    const game = await attacking(6, (b) =>
      b.unit(P2, "bf1", { might: 5, name: "Other" }, "other")
        .unit(P2, "base", { might: 1, name: "Home" }, "home")
        .unit(P2, "bf2", { might: 1, name: "Away" }, "away")
        .unit(P1, "base", { might: 1, name: "Buddy" }, "buddy"),
    ).build();
    await game.p1.move(["lucian", "buddy"], "bf1");
    const d = game.decision(); // rule 402 (finalization): the target is chosen before priority
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card) : [];
    expect(new Set(offered)).toEqual(new Set(["def", "other"]));
    await game.p1.pick("other");
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.state("other").damage).toBe(1);
    expect(game.state("def").damage).toBe(0);
    expect(game.state("home").damage).toBe(0);
    expect(game.state("away").damage).toBe(0);
  });

  test("after the combat chain (opened by his attack trigger) resolves, the attacker keeps Focus (346.1) and may cast an [Action]", async () => {
    // P1 still has Focus + Priority once Lucian's trigger resolves: the chain was opened by a
    // triggered ability, so Focus does not pass (346.1).
    const game = await attacking(7, (b) => b.resources(P1, { energy: 1 }).hand(P1, CLEAVE, "cleave")).build();
    await game.p1.move("lucian", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    if (game.decision()?.kind === "pick") await game.p1.pick("def");
    expect(game.state("def").damage).toBe(1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "cleave")).toBe(true);
  });

  test("timing: Cleave is an [Action] — not castable while the trigger sits on the chain; cast after it resolves it raises combat Might (6) but the trigger already dealt only 1", async () => {
    const game = await attacking(7, (b) => b.resources(P1, { energy: 1 }).hand(P1, CLEAVE, "cleave")).build();
    await game.p1.move("lucian", "bf1");
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.can("cast", "cleave")).toBe(false); // Closed state: only Reactions
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves with Assault 1
    if (game.decision()?.kind === "pick") await game.p1.pick("def");
    expect(game.state("def").damage).toBe(1);
    // Showdown is open again and P1 kept Focus (346.1) → the Action spell is legal now.
    expect(game.p1.can("cast", "cleave")).toBe(true);
    await game.p1.cast("cleave", { targets: "lucian" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("lucian").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.state("lucian").might).toBe(6); // 2 + Assault(1+3), 807.2
    expect(game.state("def").damage).toBe(1); // no retroactive top-up
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash"); // 1 + 6 ≥ 7
    expect(game.zoneOf("lucian")).toBe("trash"); // took 7 ≥ 6
  });

  test("Cleave cast BEFORE the attack (main phase) also counts: Assault 4 at the moment he attacks → 4 damage; grant expires next turn", async () => {
    // Stunned 11-Might defender: deals no combat damage, survives 4 + 6 = 10 → no result, Lucian recalled.
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 11, name: "Wall" }, "def", { stunned: true })
      .unit(P1, "base", CARD, "lucian")
      .hand(P1, CLEAVE, "cleave")
      .build();
    await game.p1.cast("cleave", { targets: "lucian" });
    await game.settle();
    expect(game.state("lucian").might).toBe(2); // not attacking yet: Assault contributes nothing
    await game.p1.move("lucian", "bf1");
    expect(game.state("lucian").might).toBe(6);
    await game.p1.passPriority();
    await game.p2.passPriority();
    if (game.decision()?.kind === "pick") await game.p1.pick("def");
    expect(game.state("def").damage).toBe(4);
    await game.settle();
    expect(game.locationOf("def")).toBe("bf1");
    expect(game.locationOf("lucian")).toBe("base");
    expect(game.state("lucian").grantedKeywords).toHaveLength(1);
    await game.advanceTurn();
    expect(game.state("lucian").grantedKeywords).toEqual([]);
    expect(game.state("lucian").keywords).toContain("Assault"); // printed Assault remains
  });

  test("does NOT trigger when defending, and has no Assault bonus on defense (2 Might trades with a 2)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "lucian")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.chain()).toEqual([]);
    expect(game.state("lucian").might).toBe(2);
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("lucian")).toBe("trash");
  });

  test("moving to an OPEN battlefield is not an attack: no trigger, no prompt, he simply conquers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", CARD, "lucian")
      .unit(P2, "base", { might: 1 }, "home")
      .build();
    await game.p1.move("lucian", "bf1");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.state("home").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("another friendly unit attacking alone does not fire Lucian's trigger (on: self)", async () => {
    const game = await attacking(5, (b) => b.unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")).build();
    await game.p1.move("buddy", "bf1");
    expect(game.chain()).toEqual([]);
    expect(game.state("def").damage).toBe(0); // no trigger damage landed before combat
    await game.settle();
    expect(game.decision()?.kind).toBe("action"); // nobody was asked to pick a target
    expect(game.zoneOf("buddy")).toBe("trash");
    expect(game.locationOf("lucian")).toBe("base");
  });
});
