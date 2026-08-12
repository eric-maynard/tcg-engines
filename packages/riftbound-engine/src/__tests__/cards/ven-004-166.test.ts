/**
 * Dune Surfer — ven-004-166 · Unit · Fury · 3 energy · 3 Might
 *
 *   You ignore [Tank] while assigning combat damage here.
 *
 * Head-judge notes — the tricky spots for this card:
 *   1. 766 — "ignore [Tank]" makes enemy Tank INACTIVE for the one procedure named (P1's combat-damage
 *      assignment, 465.2.c). Splits that 815.1.c.2 would refuse (lethal to the non-Tank first, Tank left
 *      short) become legal — so a formerly FORCED assignment turns into a real choice (a prompt).
 *   2. 767 — only "you" (Surfer's controller) ignores it, and only "here": the OPPONENT assigning into
 *      P1's own Tank at the same battlefield still feeds the Tank first; P1 assigning at ANOTHER
 *      battlefield (Surfer parked elsewhere) still obeys Tank.
 *   3. Role-agnostic — "assigning combat damage" covers P1 as attacker AND as defender.
 *   4. Only the Tank tier is dropped: 465.2.c.3 (lethal before moving on) and 465.2.c.4 (no
 *      over-assignment while others remain) still bind.
 *   5. Harness note: a side with exactly ONE legal allocation is auto-assigned (no distribute prompt), so
 *      "Tank honoured" shows up as "no prompt", and "Tank ignored" as "a prompt with the extra split".
 *   6. Parser: `abilities: []` today — the static is silently missing from the registry payload.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-004-166";
const WALL = { keywords: ["Tank"], might: 5, name: "Wall" } as const; // vanilla Tank body
const SMALL = { might: 2, name: "Small" } as const;

/** P1 (turn player) has Surfer-or-stand-in + a 3-Might Pal in base; P2 holds bf1 with Wall (5, Tank) + Small (2). */
function assault(withSurfer: boolean) {
  return scenario()
    .autoProcedures(false)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", WALL, "wall")
    .unit(P2, "bf1", SMALL, "small")
    .unit(P1, "base", withSurfer ? CARD : { might: 3, name: "Stand-in" }, "surfer")
    .unit(P1, "base", { might: 3, name: "Pal" }, "pal");
}

describe("Dune Surfer (ven-004-166)", () => {
  test("costs 3 energy; a 3-Might Fury unit that enters the base exhausted; 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "surfer").build();
    await game.p1.play("surfer");
    await game.settle();
    expect(game.zoneOf("surfer")).toBe("base");
    expect(game.state("surfer")).toMatchObject({ baseMight: 3, domains: ["fury"], isExhausted: true, might: 3 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    const poor = await scenario().resources(P1, { energy: 2, power: { fury: 2 } }).hand(P1, CARD, "surfer").build();
    expect(poor.p1.can("play", "surfer")).toBe(false);
  });

  test("baseline (no Surfer, 815.1.c.2): P1's 6 attacking Might into Wall (5, Tank) + Small (2) is FORCED to {wall:5, small:1} — P1 is not asked; Wall dies, Small holds bf1", async () => {
    const game = await assault(false).build();
    await game.p1.move(["surfer", "pal"], "bf1");
    await game.settle();
    await game.p1.choose("resolveFullCombat:bf1");
    // 6 cannot make both lethal (5 + 2), and [Tank] pins the order, so P1's line is the only one.
    // P2's return is a different question: its 7 covers both 3-Might attackers with 1 to spare, and
    // that spare point may sit on either (465.2.c.4 / 355.10.d.2), so P2 IS asked.
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P2 });
    await game.p2.distribute({ pal: 3, surfer: 4 });
    if (game.p1.can("resolveFullCombat:bf1")) {
      await game.p1.choose("resolveFullCombat:bf1");
    }
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("small")).toBe("battlefield-bf1");
    expect(game.state("small").damage).toBe(0); // 1 < 2, healed (466.1.a.1)
    expect(game.zoneOf("surfer")).toBe("trash"); // 7 back: 3 + 3 lethal to both
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("attacking WITH Dune Surfer here P1 gets a real choice and may take {small:2, wall:4} — Small dies, Wall survives; c.3/c.4 splits stay refused (766 / 465.2.c)", async () => {
    // Expected: Tank inactive for P1's assignment → two legal lines ({wall:5,small:1} | {small:2,wall:4})
    // → a distribute prompt; {small:3,wall:3} / {wall:6} still illegal (465.2.c.3-4). Actual: the static
    // is not parsed (abilities: []), Tank is enforced, the assignment is forced and never asked.
    const game = await assault(true).build();
    await game.p1.move(["surfer", "pal"], "bf1");
    await game.settle();
    await game.p1.choose("resolveFullCombat:bf1");
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1, total: 6 });
    const legal = async (a: Record<string, number>) => (await game.p1.try((p) => p.distribute(a))).ok;
    expect(await legal({ small: 3, wall: 3 })).toBe(false);
    expect(await legal({ wall: 6 })).toBe(false);
    await game.p1.distribute({ small: 2, wall: 4 });
    if (game.decision()?.kind === "distribute") {
      await game.p2.distribute({ pal: 3, surfer: 4 });
    }
    for (let i = 0; i < 3 && game.p1.can("resolveFullCombat:bf1"); i++) {
      await game.p1.choose("resolveFullCombat:bf1");
      await game.settle();
    }
    await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.state("wall").damage).toBe(0); // 4 < 5, healed
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("defending WITH Dune Surfer here — P2 attacks with Bruiser (4, Tank) + Small (2); P1 may assign {small:2, bruiser:1} and kill Small instead of bouncing all 3 off the Tank", async () => {
    // Expected: "assigning combat damage here" is role-agnostic; as defender P1 ignores the attacking
    // Tank, is prompted, and kills Small. Actual: forced {bruiser:3}; nothing of P2's dies.
    const game = await scenario()
      .active(P2)
      .autoProcedures(false)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "surfer")
      .unit(P2, "base", { keywords: ["Tank"], might: 4, name: "Bruiser" }, "bruiser")
      .unit(P2, "base", SMALL, "small")
      .build();
    await game.p2.move(["bruiser", "small"], "bf1");
    await game.settle();
    await game.p2.choose("resolveFullCombat:bf1");
    if (game.decision()?.kind === "distribute" && game.decision()?.seat === P2) {
      await game.p2.distribute({ surfer: 6 });
    }
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1, total: 3 });
    expect((await game.p1.try((p) => p.distribute({ small: 3 }))).ok).toBe(false); // 465.2.c.4 over-assign
    await game.p1.distribute({ bruiser: 1, small: 2 });
    if (game.p2.can("resolveFullCombat:bf1")) {
      await game.p2.choose("resolveFullCombat:bf1");
    }
    await game.settle();
    expect(game.zoneOf("surfer")).toBe("trash"); // took 6
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.locationOf("bruiser")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("767 — only YOU ignore it: P2's 3-Might raider into P1's Surfer + Guard (4, Tank) is forced onto the Guard (no choice offered to P2); nobody on P1's side dies, the raider does", async () => {
    const game = await scenario()
      .active(P2)
      .autoProcedures(false)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "surfer")
      .unit(P1, "bf1", { keywords: ["Tank"], might: 4, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("surfer").combatRole).toBe("defender");
    await game.settle();
    await game.p2.choose("resolveFullCombat:bf1");
    // If P2 were (wrongly) allowed to ignore Tank, {surfer:3} would be a second legal line → a prompt.
    expect(game.decision()?.kind).not.toBe("distribute");
    await game.settle();
    expect(game.zoneOf("surfer")).toBe("battlefield-bf1");
    expect(game.state("surfer").damage).toBe(0);
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.state("guard").damage).toBe(0); // 3 < 4, healed
    expect(game.zoneOf("raider")).toBe("trash"); // took 3 + 4
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("'here' only: Surfer parked at bf1 does nothing for P1's assault on bf2 — a 5-Might Pal into Wall (5, Tank) + Tiny (1) is forced onto the Wall; Tiny survives and P2 keeps bf2", async () => {
    const game = await scenario()
      .autoProcedures(false)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", CARD, "surfer")
      .unit(P1, "base", { might: 5, name: "Pal" }, "pal")
      .unit(P2, "bf2", WALL, "wall")
      .unit(P2, "bf2", { might: 1, name: "Tiny" }, "tiny")
      .build();
    await game.p1.move("pal", "bf2");
    await game.settle();
    await game.p1.choose("resolveFullCombat:bf2");
    // With Tank honoured only {wall:5} is legal → auto-assigned; ignoring it would offer {tiny:1, wall:4} too.
    expect(game.decision()?.kind).not.toBe("distribute");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("tiny")).toBe("battlefield-bf2");
    expect(game.zoneOf("pal")).toBe("trash"); // took 5 + 1
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.state("surfer")).toMatchObject({ combatRole: null, damage: 0, zone: "battlefield-bf1" });
  });

  test("no Tank around: Surfer is a plain 3-Might body — alone into a 3-Might defender both die and bf1 is left uncontrolled; into a 2 it conquers for a point", async () => {
    const trade = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "surfer").unit(P2, "bf1", { might: 3 }, "def").build();
    await trade.p1.move("surfer", "bf1");
    expect(trade.state("surfer")).toMatchObject({ combatRole: "attacker", might: 3 });
    await trade.settle();
    expect(trade.zoneOf("surfer")).toBe("trash");
    expect(trade.zoneOf("def")).toBe("trash");
    expect(trade.gameState.battlefields.bf1?.controller).toBeNull();

    const win = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "surfer").unit(P2, "bf1", { might: 2 }, "def").build();
    await win.p1.move("surfer", "bf1");
    await win.settle();
    expect(win.zoneOf("def")).toBe("trash");
    expect(win.locationOf("surfer")).toBe("bf1");
    expect(win.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(win.p1.points()).toBe(1);
    expect(win.violations()).toEqual([]);
  });

  test("Tank with enough damage to go round is moot: Surfer (3) + two 3-Might Pals (9 total) into Wall (5, Tank) + Small (2) kill both and conquer", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", WALL, "wall")
      .unit(P2, "bf1", SMALL, "small")
      .unit(P1, "base", CARD, "surfer")
      .unit(P1, "base", { might: 3, name: "Pal" }, "pal")
      .unit(P1, "base", { might: 3, name: "Pal2" }, "pal2")
      .build();
    await game.p1.move(["surfer", "pal", "pal2"], "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.units("bf1").length).toBeGreaterThanOrEqual(1); // 7 back kills at most two 3-Might attackers
    expect(game.p1.points()).toBe(1);
  });

  test("registry payload should carry ONE static 'ignore Tank while assigning combat damage here' ability on a 3-cost / 3-Might Fury unit (today abilities is empty)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "fury", energyCost: 3, might: 3, name: "Dune Surfer" });
    expect(def?.powerCost ?? []).toEqual([]);
    const abilities = (def?.abilities ?? []) as { type?: string }[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]?.type).toBe("static");
    expect(JSON.stringify(abilities[0])).toContain("Tank");
  });
});
