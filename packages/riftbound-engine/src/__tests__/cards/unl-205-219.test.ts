/**
 * Abandoned Hall — unl-205-219 · Battlefield
 *
 *   When a player plays a spell, they may give a unit they control here +1 [Might] this turn.
 *
 * Rules: 419.4.a / 350.1 (a spell is "played" when its play completes WITH ITS RESOLUTION — the trigger
 * fires after the spell resolves, not when it is put on the chain), 419.4.a.1 (countered → never played
 * → no trigger; but the counterspell itself IS a played spell of ITS caster), 383 ("a player … they":
 * the trigger belongs to whoever played the spell — either player, on either turn, regardless of who
 * controls the Hall), 355.9.b ("a unit they control HERE": no such unit → nothing to give), 740.1.a
 * (control, not ownership), 317.2.c ("this turn" expires in the Expiration Step).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. Timing: while the spell sits on the chain nothing has happened; the +1 arrives only after the
 *     spell resolves (so it cannot save a unit from THAT spell, but it is in time for a combat whose
 *     showdown the spell was cast in).
 *  2. "A player" really is anyone: the ATTACKER casting an Action spell in the showdown at the Hall
 *     pumps its own attacker; the Hall's controller gets nothing off the opponent's spell.
 *  3. Countered by Defy: the countered spell yields no trigger; Defy resolving is P2's played spell, and
 *     with no P2 unit at the Hall it does nothing — the guard stays 3.
 *  4. "May" + choice: declining changes nothing; with two units here exactly one (the chosen) gets +1;
 *     units in base / at another battlefield are never eligible; two spells → two separate +1s.
 *  5. Combat swing: defender 4 vs attacker 4 trades — unless the defender's player casts any spell in
 *     the showdown and takes the Hall's +1 (5): then the attacker dies alone and the Hall is kept.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-205-219";
const DEFY = "ogn-045-298"; // [Reaction] 1 + [calm]: counter a spell costing ≤ 4 and ≤ 1 power
/** Inline 1-cost [Action] spell: draw 1 — a spell with no Might text of its own, castable in showdowns. */
const STUDY = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Quick Study",
  timing: "action",
} as const;

/** P1's turn; P1 controls the live Hall with a 3-Might Guard; a 2-Might Homebody in base; bf2 with a P1 Scout; Study in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("hall", { controller: P1, def: CARD, inert: false, owner: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "hall", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 2, name: "Homebody" }, "home")
    .unit(P1, "bf2", { might: 2, name: "Scout" }, "scout")
    .hand(P1, STUDY, "study");
}

/** After a spell resolved: expect the Hall's "you may" for `seat`, accept, pick `unit` if asked, let it resolve. */
async function takeHallBonus(game: Game, seat: typeof P1 | typeof P2, unit: string) {
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat });
  await game.seat(seat).yes();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === seat) {
    await game.seat(seat).pick(unit);
  }
  await game.settle();
}

describe("Abandoned Hall (unl-205-219)", () => {
  test("registry payload: an OPTIONAL trigger on ANY player's spell, controlled by the spell's player, giving +1 Might this turn to a friendly unit here", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Abandoned Hall" });
    expect(def?.abilities).toEqual([
      {
        effect: { amount: 1, duration: "turn", target: { controller: "friendly", location: "here", type: "unit" }, type: "modify-might" },
        optional: true,
        trigger: { controllerFromEvent: true, event: "play-spell", on: { cardType: "spell", controller: "any" } },
        type: "triggered",
      },
    ]);
  });

  test("419.4.a timing: with Study merely on the chain nothing has triggered and the Guard is still 3; once Study resolves the Hall asks P1 'you may', and accepting makes the Guard 4", async () => {
    const game = await board().build();
    await game.p1.cast("study");
    expect(game.chain().map((c) => c.cardId)).toEqual(["study"]);
    expect(game.chain().some((c) => c.triggered)).toBe(false);
    expect(game.state("guard").might).toBe(3);
    await game.settle(); // both pass → Study resolves (draw 1) → Hall trigger
    expect(game.zoneOf("study")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.state("guard").might).toBe(3); // asked, not yet applied
    await takeHallBonus(game, P1, "guard");
    expect(game.state("guard")).toMatchObject({ baseMight: 3, might: 4, mightModifier: 1 });
    expect(game.state("guard").isBuffed).toBe(false); // a this-turn modifier, not a buff counter
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("'this turn': the +1 is gone after the turn rolls over (Guard back to 3 on P2's turn)", async () => {
    const game = await board().build();
    await game.p1.cast("study");
    await game.settle();
    await takeHallBonus(game, P1, "guard");
    expect(game.state("guard").might).toBe(4);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("guard")).toMatchObject({ might: 3, mightModifier: 0 });
  });

  test("'may': declining leaves every unit untouched and returns to the open main phase", async () => {
    const game = await board().build();
    await game.p1.cast("study");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.state("guard").might).toBe(3);
    expect(game.state("home").might).toBe(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("'a unit they control HERE': with two units at the Hall P1 chooses one — only it gets +1; the Homebody (base) and the Scout (bf2) are not on the menu", async () => {
    const game = await board().unit(P1, "hall", { might: 1, name: "Squire" }, "squire").build();
    await game.p1.cast("study");
    await game.settle();
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["guard", "squire"]);
    await game.p1.pick("squire");
    await game.settle();
    expect(game.state("squire").might).toBe(2);
    expect(game.state("guard").might).toBe(3);
    expect(game.state("home").might).toBe(2);
    expect(game.state("scout").might).toBe(2);
  });

  test("each spell is its own trigger: two Studies in one turn can stack +2 on the Guard (3 → 5)", async () => {
    const game = await board().hand(P1, STUDY, "study2").build();
    await game.p1.cast("study");
    await game.settle();
    await takeHallBonus(game, P1, "guard");
    await game.p1.cast("study2");
    await game.settle();
    await takeHallBonus(game, P1, "guard");
    expect(game.state("guard")).toMatchObject({ might: 5, mightModifier: 2 });
  });

  test("'they' = the spell's player: P2 casting a spell on P2's turn while controlling NO unit at P1's Hall gives P2 nothing to pump — and P1 (Hall controller) is offered nothing either", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .battlefield("hall", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "hall", { might: 3, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 2, name: "Their Homebody" }, "theirs")
      .hand(P2, STUDY, "study")
      .build();
    await game.p2.cast("study");
    game.script(P2, ["yes"]); // if the engine asks P2 anyway, accepting must still find no legal unit
    await game.settle();
    const d = game.decision();
    expect(d?.kind === "yes-no" && d.seat === P1).toBe(false); // never P1's trigger
    if (d?.kind === "pick" && d.seat === P2) {
      expect(d.options.map((o) => o.card ?? o.key)).not.toContain("guard");
      expect(d.options.map((o) => o.card ?? o.key)).not.toContain("theirs");
      await game.p2.decline();
      await game.settle();
    }
    expect(game.state("guard").might).toBe(3);
    expect(game.state("theirs").might).toBe(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("'a player' includes the ATTACKER: P2 attacks the Hall, casts an Action spell with Focus, and gives ITS attacker here +1 (3 → 4) — enough to trade with the 4-Might Guard instead of bouncing off", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .battlefield("hall", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "hall", { might: 4, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P2, STUDY, "study")
      .build();
    await game.p2.move("raider", "hall");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.cast("study");
    await game.p2.passPriority();
    await game.p1.passPriority(); // Study resolves inside the showdown
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "hall" } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hall", controller: P2, triggered: true })]);
    await game.p2.yes();
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("raider");
    }
    expect(game.chain()[0]?.targets).toEqual(["raider"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // the Hall trigger resolves — still inside the showdown
    expect(game.state("raider").might).toBe(4);
    expect(game.state("guard").might).toBe(4); // P1 got nothing off P2's spell
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    await game.settle(); // finish the showdown → combat: 4 vs 4 trade
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
  });

  test("combat swing for the defender: Guard 4 vs a 4-Might attacker would trade, but P1 casts Study in the showdown, takes the Hall's +1 (→ 5) and the attacker dies alone; P1 keeps the Hall", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1 })
      .battlefield("hall", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "hall", { might: 4, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .hand(P1, STUDY, "study")
      .build();
    await game.p2.move("raider", "hall");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("study");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await takeHallBonus(game, P1, "guard");
    expect(game.state("guard").might).toBe(5);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-hall");
    expect(game.gameState.battlefields.hall?.controller).toBe(P1);
    // control: the same fight without the spell is a clean trade
    const plain = await scenario().active(P2).battlefield("hall", { controller: P1, def: CARD, inert: false, owner: P1 }).unit(P1, "hall", { might: 4 }, "guard").unit(P2, "base", { might: 4 }, "raider").build();
    await plain.p2.move("raider", "hall");
    await plain.settle();
    expect(plain.zoneOf("guard")).toBe("trash");
    expect(plain.zoneOf("raider")).toBe("trash");
  });

  test("419.4.a.1 — countered by Defy: P1's Study never resolves → no Hall trigger for P1; Defy itself is P2's played spell but P2 controls no unit here → the Guard stays 3 and P1 drew nothing", async () => {
    const game = await board().resources(P2, { energy: 1, power: { calm: 1 } }).hand(P2, DEFY, "defy").build();
    await game.p1.cast("study");
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "study" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["study", "defy"]);
    game.script(P2, ["yes", "decline"]); // should P2 be asked for Defy's own Hall trigger, it finds no unit
    await game.settle();
    const d = game.decision();
    expect(d?.kind === "yes-no" && d.seat === P1).toBe(false);
    expect(game.zoneOf("study")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.state("guard").might).toBe(3);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("not a spell: playing a UNIT or activating nothing spell-like never wakes the Hall", async () => {
    const game = await board().resources(P1, { energy: 5 }).hand(P1, { cardType: "unit", energyCost: 2, might: 2, name: "Fresh Recruit" }, "fresh").build();
    await game.p1.play("fresh", { to: "base" });
    await game.settle();
    expect(game.zoneOf("fresh")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("guard").might).toBe(3);
  });

  test("inert control: with the Hall's text stripped, Study just draws and nobody is asked anything", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).battlefield("hall", { controller: P1, def: CARD, inert: true }).unit(P1, "hall", { might: 3 }, "guard").hand(P1, STUDY, "study").build();
    await game.p1.cast("study");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("guard").might).toBe(3);
  });
});
