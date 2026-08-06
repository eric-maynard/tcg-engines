/**
 * Volibear, Furious — ogn-041-298 · Champion Unit · Fury · 10 energy + [fury][fury] · 9 might
 *
 *   [Deflect 2] (Opponents must pay [rainbow][rainbow] to choose me with a spell or ability.)
 *   When I attack, deal 5 damage split among any number of enemy units here.
 *
 * Rules: 721 Deflect (mandatory additional cost, power of any domain); 355.14 Splitting
 * (each chosen unit is a target; the division is decided on resolution).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const VOLIBEAR = "ogn-041-298";
const CLEAVE = "ogn-004-298"; // 1-energy Fury action: "Give a unit [Assault 3] this turn."

describe("Volibear, Furious (ogn-041-298)", () => {
  test("costs 10 energy + 2 fury power to play", async () => {
    const game = await scenario().resources(P1, { energy: 10, power: { fury: 2 } }).hand(P1, VOLIBEAR, "voli").build();
    await game.p1.play("voli", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("voli")).toBe("base");
    expect(game.state("voli").might).toBe(9);
    const short = await scenario().resources(P1, { energy: 10, power: { fury: 1 } }).hand(P1, VOLIBEAR, "voli").build();
    expect(short.p1.can("play", "voli")).toBe(false);
  });

  test("Deflect 2: an opponent cannot choose it with a spell unless they can pay 2 extra power", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", VOLIBEAR, "voli")
      .unit(P2, "base", { might: 3 }, "theirs")
      .hand(P2, CLEAVE, "cleave")
      .build();
    const targets = () => game.p2.option("cast", "cleave")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets()).toEqual([["theirs"]]);
    await game.p2.do("addResources", { power: { rainbow: 2 } });
    expect(targets()).toEqual(expect.arrayContaining([["voli"], ["theirs"]]));
    await game.p2.cast("cleave", { targets: "voli" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle();
    expect(game.state("voli").keywords).toContain("Assault");
  });

  test("Deflect power may be of any domain (rule 721)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { calm: 2 } })
      .unit(P1, "base", VOLIBEAR, "voli")
      .hand(P2, CLEAVE, "cleave")
      .build();
    await game.p2.cast("cleave", { targets: "voli" });
    expect(game.p2.energy()).toBe(0);
    expect(game.p2.power()).toBe(0);
  });

  test("Deflect does not tax its controller's own spells", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", VOLIBEAR, "voli").hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "voli" });
    expect(game.p1.resources().energy).toBe(0);
    await game.settle();
    expect(game.state("voli").keywords).toContain("Assault");
  });

  test("When I attack: moving into an enemy-held battlefield puts the trigger on the chain; only enemy units HERE are offered", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", VOLIBEAR, "voli")
      .unit(P2, "bf1", { might: 7 }, "b")
      .unit(P2, "bf1", { might: 2 }, "a")
      .unit(P2, "base", { might: 2 }, "home")
      .unit(P1, "base", { might: 2 }, "friend")
      .build();
    await game.p1.move("voli", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "voli", triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card) : d?.kind === "distribute" ? d.buckets.map((b) => b.card) : [];
    expect(new Set(offered)).toEqual(new Set(["a", "b"]));
  });

  test("does not trigger when defending", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", VOLIBEAR, "voli")
      .unit(P2, "base", { might: 2 }, "attacker")
      .build();
    await game.p2.move("attacker", "bf1");
    expect(game.chain()).toEqual([]);
  });

  test.failing("BUG: 5 damage may be split among several enemy units here (2 to a 2-Might unit, 3 to a 7-Might unit) — rule 355.14", async () => {
    // Expected: a distribute prompt totalling 5 over the enemy units here; a dies, b has 3 damage
    // before combat. Actual: the engine asks for a single target, then "Assign 1 damage".
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", VOLIBEAR, "voli")
      .unit(P2, "bf1", { might: 7 }, "b")
      .unit(P2, "bf1", { might: 2 }, "a")
      .build();
    await game.p1.move("voli", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("a", "b");
    }
    expect(game.decision()).toMatchObject({ kind: "distribute", total: 5 });
    await game.p1.distribute({ a: 2, b: 3 });
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.state("b").damage).toBe(3);
    expect(game.zoneOf("b")).toBe("battlefield-bf1");
  });

  test.failing("BUG: with a single enemy unit here it is dealt exactly 5 (a 7-Might unit survives the trigger)", async () => {
    // Expected: b takes 5 and is still at bf1 when the showdown continues. Actual: b is killed
    // outright by the trigger (7 damage recorded).
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", VOLIBEAR, "voli")
      .unit(P2, "bf1", { might: 7 }, "b")
      .build();
    await game.p1.move("voli", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    if (game.decision()?.kind === "distribute") {
      await game.p1.distribute({ b: 5 });
    }
    expect(game.decision()?.kind).toBe("action");
    expect(game.zoneOf("b")).toBe("battlefield-bf1");
    expect(game.state("b").damage).toBe(5);
  });
});
