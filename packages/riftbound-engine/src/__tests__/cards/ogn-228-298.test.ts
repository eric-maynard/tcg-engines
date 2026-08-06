/**
 * Vanguard Helm — ogn-228-298 · Gear · Order · 2 energy
 *
 *   When a buffed friendly unit dies, buff another friendly unit.
 *   (If it doesn't have a buff, it gets a +1 [Might] buff.)
 *
 * Rules: 702 (a buff is a single +1 Might marker; a unit is buffed or it isn't),
 * 411 (triggered abilities — this one is mandatory, no "may"), 418/520 (a unit dies when
 * killed by an effect OR by lethal combat damage — both are "dies").
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-228-298";
/** Inline 0-cost spell: "Kill a unit." — a neutral way to make something die. */
const KILL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "order",
  energyCost: 0,
  name: "Test Kill",
  timing: "action",
};

function board(victimBuffed: boolean) {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .gear(P1, CARD, "helm")
    .unit(P1, "bf1", { might: 2 }, "victim", { buffed: victimBuffed })
    .unit(P1, "base", { might: 2 }, "plain")
    .unit(P1, "base", { might: 2 }, "already", { buffed: true })
    .unit(P2, "base", { might: 2 }, "foe")
    .hand(P1, KILL, "kill");
}

describe("Vanguard Helm (ogn-228-298)", () => {
  test("costs 2 energy (no power) and sits in base as gear; unaffordable at 1", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "helm").build();
    await game.p1.play("helm");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("helm")).toBe("base");
    expect(game.p1.gear()).toContain("helm");
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "helm").build();
    expect(poor.p1.can("play", "helm")).toBe(false);
  });

  test("a buffed friendly unit dies → you must choose another friendly unit (enemy not offered) and it gets a +1 Might buff", async () => {
    const game = await board(true).build();
    await game.p1.cast("kill", { targets: "victim" });
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "helm" } });
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(keys).toEqual(expect.arrayContaining(["plain", "already"]));
    expect(keys).not.toContain("foe");
    expect(keys).not.toContain("victim");
    expect(d?.kind === "pick" && d.allowDecline).toBe(false); // no "may": mandatory
    await game.p1.pick("plain");
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.state("plain").isBuffed).toBe(true);
    expect(game.state("plain").might).toBe(3);
  });

  test("choosing a unit that is already buffed changes nothing (buffed is binary — still 3 Might)", async () => {
    const game = await board(true).build();
    await game.p1.cast("kill", { targets: "victim" });
    await game.settle();
    await game.p1.pick("already");
    await game.settle();
    expect(game.state("already").isBuffed).toBe(true);
    expect(game.state("already").might).toBe(3);
  });

  test.failing("BUG: only BUFFED friendly deaths count — an unbuffed friendly unit dying triggers nothing", async () => {
    // Expected: victim has no buff → the Helm stays silent, P1 is back in an open main phase.
    // Actual: the trigger ignores the "buffed" condition and prompts for a target anyway.
    const game = await board(false).build();
    await game.p1.cast("kill", { targets: "victim" });
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("plain").isBuffed).toBe(false);
  });

  test("only FRIENDLY deaths count — killing a buffed enemy unit does not trigger your Helm", async () => {
    const game = await scenario()
      .gear(P1, CARD, "helm")
      .unit(P2, "base", { might: 2 }, "buffedFoe", { buffed: true })
      .unit(P1, "base", { might: 2 }, "plain")
      .hand(P1, KILL, "kill")
      .build();
    await game.p1.cast("kill", { targets: "buffedFoe" });
    const stop = await game.settle();
    expect(game.zoneOf("buffedFoe")).toBe("trash");
    expect(stop.reason).toBe("open");
    expect(game.state("plain").isBuffed).toBe(false);
  });

  test("dying in combat is dying too — a buffed attacker killed by a 6-Might defender triggers the Helm", async () => {
    // Expected: buffed 2(+1)-Might "victim" attacks a 6-Might wall and dies → P1 is prompted to
    // buff another friendly unit. Actual: combat deaths never fire the Helm's trigger.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6 }, "wall")
      .gear(P1, CARD, "helm")
      .unit(P1, "base", { might: 2 }, "victim", { buffed: true })
      .unit(P1, "base", { might: 2 }, "plain")
      .unit(P1, "base", { might: 2 }, "other")
      .build();
    await game.p1.move("victim", "bf1");
    const stop = await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "helm" } });
    await game.p1.pick("plain");
    await game.settle();
    expect(game.state("plain").isBuffed).toBe(true);
  });
});
