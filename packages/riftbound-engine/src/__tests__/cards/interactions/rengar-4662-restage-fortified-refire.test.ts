/**
 * Interaction: Rengar, Pouncing (sfd-025-221) "[Reaction] [Assault 2] I can be played to a
 *   battlefield you're attacking."
 *   × Fortified Position (ogn-279-298) "When you defend here, choose a unit. It gains [Shield 2]
 *     this combat."
 *   × Stormclaw Ursine (ogn-137-298) 6 [Might] [Tank]
 *   (+ Watchful Sentry ogn-096-298 [Deathknell] — Draw 1, and Mega-Mech ogn-088-298 8 [Might])
 *
 * Question — P2 defends its Fortified Position with the Ursine and the Sentry; P1 attacks with the
 * Mega-Mech. (a) what do the damage numbers say and who survives; (b) in the rule-466.2 window —
 * after combat damage and the Combat Cleanup, before the result is determined — may P1 play Rengar
 * to bf1, i.e. is bf1 still "a battlefield you're attacking"; (c) what is the combat result and does
 * anything restage; (d) in the restaged combat does Fortified Position fire again, is the [Shield 2]
 * still there, is Rengar an Attacker with [Assault 2], and was it recalled at step 3d of combat 1?
 *
 * Rules: 466.2 (resolve the chain from combat damage + the Combat Cleanup before reading the
 * result), 466.3.d / 466.3.d.1 (No Result when both players have units present → stage a Showdown
 * and a Combat), 466.5 (Establish Control only when nothing is staged here), 466.7.a (designations
 * removed), 466.7.c ("this combat" effects expire simultaneously), 464.1 / 464.2.c.1 (the attacker
 * is whoever applied Contested), 464.2.c.3.a (a unit that arrives later gains its designation in
 * the Cleanup after the action that put it there), 465.2.c.3 (lethal damage assigned in full before
 * moving on), 807.1.c ([Assault X] = +X while an attacker), 814.1.c ([Shield X] = +X while a
 * defender), 815.1.c / 815.1.b ([Tank] must be assigned lethal first).
 *
 * BOARD B (the second `describe`) keeps Fortified Position, the Sentry, the Mega-Mech and Rengar
 * but swaps the Ursine for a vanilla 9-[Might] defender: the prescribed board CANNOT reach the
 * 466.2 window, because with the Ursine shielded to 8 the Mega-Mech's whole 8 is spent on the
 * [Tank] and nothing that dies has a triggered ability — an empty chain has no FEPR pass round to
 * open (rules 334.2 / 336). Board B lets the Sentry's [Deathknell] die into the chain while a
 * defender survives, which is the position the question describes.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RENGAR = "sfd-025-221";
const FORTIFIED = "ogn-279-298";
const URSINE = "ogn-137-298";
const SENTRY = "ogn-096-298";
const MEGA = "ogn-088-298";

/** Exactly the position in the question: Fortified Position, Ursine + Sentry, Mega-Mech, Rengar. */
function boardA() {
  return scenario()
    .resources(P1, { energy: 6, power: { fury: 3, rainbow: 3 } })
    .resources(P2, { energy: 6, power: { rainbow: 3 } })
    .battlefield("bf1", { controller: P2, def: FORTIFIED, inert: false })
    .unit(P2, "bf1", URSINE, "ursine")
    .unit(P2, "bf1", SENTRY, "sentry")
    .unit(P1, "base", MEGA, "mech")
    .hand(P1, RENGAR, "rengar")
    .autoProcedures(false);
}

/** Board B — a 9-[Might] vanilla defender in the Ursine's place so a defender survives the damage. */
function boardB() {
  return scenario()
    .resources(P1, { energy: 6, power: { fury: 3, rainbow: 3 } })
    .resources(P2, { energy: 6, power: { rainbow: 3 } })
    .battlefield("bf1", { controller: P2, def: FORTIFIED, inert: false })
    .unit(P2, "bf1", { might: 9, name: "Bulwark" }, "bulwark")
    .unit(P2, "bf1", SENTRY, "sentry")
    .unit(P1, "base", MEGA, "mech")
    .hand(P1, RENGAR, "rengar")
    .autoProcedures(false);
}

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Attack bf1 and answer Fortified Position's defend trigger with `shielded`. */
async function attackAndShield(game: Game, shielded: string) {
  await game.p1.move("mech", "bf1");
  expect(game.decision()?.prompt).toContain("Fortified Position");
  await game.p2.pick(shielded);
  await game.settle();
}

describe("Rengar × Fortified Position — the 466.2 window and the No-Result restage", () => {
  test("(a) [Shield 2] makes the [Tank] Ursine 8: the Mega-Mech's whole 8 is lethal for it and the Sentry is assigned nothing", async () => {
    const game = await boardA().build();
    await attackAndShield(game, "ursine");
    // 814.1.c — [Shield 2] is "+2 [Might] while I'm a defender".
    expect(game.state("ursine").might).toBe(8);
    expect(game.state("ursine").grantedKeywords).toContainEqual({ duration: "combat", keyword: "Shield", value: 2 });

    await game.p1.choose("resolveFullCombat:bf1");
    // 815.1.b + 465.2.c.3 — the [Tank] takes lethal in full first, and 8 is exactly lethal, so
    // there is nothing left over for the Sentry (no assignment choice is even raised).
    expect(game.zoneOf("ursine")).toBe("trash");
    expect(game.zoneOf("sentry")).toBe("battlefield-bf1");
    expect(game.state("sentry").damage).toBe(0);
    // Defenders deal 8 + 1 = 9 to the 8-[Might] Mega-Mech.
    expect(game.zoneOf("mech")).toBe("trash");
  });

  test("(a) nothing that died has a triggered ability, so no chain item and no 466.2 stop: the defender keeps bf1 and nobody scores", async () => {
    const game = await boardA().build();
    await attackAndShield(game, "ursine");
    const p2HandBefore = game.p2.hand().length;
    await game.p1.choose("resolveFullCombat:bf1");
    // The Sentry survived, so its [Deathknell] never fired — no draw, and the chain stayed empty,
    // which is why the combat runs straight through 466.2 (334.2 / 336: a FEPR pass round exists
    // only for pending chain items).
    expect(game.p2.hand()).toHaveLength(p2HandBefore);
    expect(game.chain()).toEqual([]);
    // 466.3.b defender win → 466.5: control is unchanged and Contested is cleared. No conquer.
    expect(game.gameState.battlefields.bf1.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("(b) bf1 is a battlefield P1 is attacking, so Rengar's permission offers battlefield-bf1 as a destination", async () => {
    const game = await boardA().build();
    await attackAndShield(game, "ursine");
    const field = game.p1.option("playUnit", "rengar")?.fields.find((f) => f.name === "location");
    expect(field?.options).toContain("battlefield-bf1");
  });
});

describe("Rengar × Fortified Position — board B: a [Deathknell] opens the 466.2 window", () => {
  /** Run combat to the 466.2 window: damage assigned, the Sentry dead, its Deathknell on the chain. */
  async function toWindow(game: Game) {
    await attackAndShield(game, "bulwark");
    expect(game.state("bulwark").might).toBe(11);
    await game.p1.choose("resolveFullCombat:bf1");
    // 465.2.c.3 — 1 is lethal for the Sentry in full, the other 7 land on the Bulwark.
    expect(game.decision()?.kind).toBe("distribute");
    await game.p1.distribute({ bulwark: 7, sentry: 1 });
    await game.p1.choose("resolveFullCombat:bf1");
  }

  test("(b) the 466.2 task is a real priority window: the Sentry's [Deathknell] is on the chain and both seats get priority", async () => {
    const game = await boardB().build();
    await toWindow(game);
    expect(game.chain().map((i) => i.name)).toEqual(["Watchful Sentry"]);
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("mech")).toBe("trash");
    expect(game.zoneOf("bulwark")).toBe("battlefield-bf1");
    // 466.7.a has not run yet — Contested and the designations still stand.
    expect(game.gameState.battlefields.bf1.contested).toBe(true);
    expect(game.gameState.battlefields.bf1.contestedBy).toBe(P1);
    expect(game.state("bulwark").combatRole).toBe("defender");
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
  });

  test("(b) P1 may play Rengar to bf1 in that window — bf1 is still 'a battlefield you're attacking'", async () => {
    const game = await boardB().build();
    await toWindow(game);
    await game.p2.passPriority();
    const field = game.p1.option("playUnit", "rengar")?.fields.find((f) => f.name === "location");
    expect(field?.options).toContain("battlefield-bf1");
    await game.p1.play("rengar", { to: "bf1" });
    expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
    // 143.4 — units enter the board exhausted (Rengar has no Accelerate).
    expect(game.state("rengar").isExhausted).toBe(true);
  });

  test("(b/d) 464.2.c.3.a — Rengar gains the Attacker designation in the Cleanup after the play, and 807.1.c gives it +2: 5 [Might]", async () => {
    const game = await boardB().build();
    await toWindow(game);
    await game.p2.passPriority();
    await game.p1.play("rengar", { to: "bf1" });
    expect(game.state("rengar").combatRole).toBe("attacker");
    expect(game.state("rengar").might).toBe(3 + 2);
  });

  test("(d) 466.7.c — every 'this combat' effect expires when combat 1 ends: the Bulwark loses its [Shield 2]", async () => {
    const game = await boardB().build();
    await toWindow(game);
    await game.p2.passPriority();
    await game.p1.play("rengar", { to: "bf1" });
    await game.settle();
    await game.p1.choose("resolveFullCombat:bf1");
    expect(game.state("bulwark").grantedKeywords).toEqual([]);
    expect(game.state("bulwark").might).toBe(9);
  });

  test("(c) control does not change and nobody conquers: bf1 is still P2's and no points were scored", async () => {
    const game = await boardB().build();
    await toWindow(game);
    await game.p2.passPriority();
    await game.p1.play("rengar", { to: "bf1" });
    await game.settle();
    await game.p1.choose("resolveFullCombat:bf1");
    expect(game.gameState.battlefields.bf1.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("No Result with units of both players present must stage a Showdown and a Combat at bf1 (466.3.d / 466.3.d.1) — the engine ends the combat and clears Contested instead", async () => {
    const game = await boardB().build();
    await toWindow(game);
    await game.p2.passPriority();
    await game.p1.play("rengar", { to: "bf1" });
    await game.settle();
    await game.p1.choose("resolveFullCombat:bf1");
    // Expected (466.3.d): both players have units present during the result task → No Result, and
    // 466.3.d.1 stages a fresh Showdown + Combat here, so 466.5 is skipped and Contested stays.
    // Actual: `resolve-full-combat.ts` only restages when NO defender was present at the Combat
    // Cleanup (`noDefendersAtCleanup`); here a defender survived, so it scores the combat as a tie,
    // clears Contested and ends combat — combat 2 never happens.
    expect(game.gameState.battlefields.bf1.contested).toBe(true);
  });

  test("Rengar arrived after step 3d of the Combat Cleanup, so nothing recalls it (466.1.a.2, the recall is a Cleanup step) — the engine recalls it to base at the Resolution Step", async () => {
    const game = await boardB().build();
    await toWindow(game);
    await game.p2.passPriority();
    await game.p1.play("rengar", { to: "bf1" });
    await game.settle();
    await game.p1.choose("resolveFullCombat:bf1");
    // Expected: Rengar is still at bf1 (it was not present at 3d, where the recall happens).
    // Actual: the engine recalls every attacker present at the Resolution Step whenever defenders
    // remain, so Rengar ends in P1's base.
    expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
  });
});
