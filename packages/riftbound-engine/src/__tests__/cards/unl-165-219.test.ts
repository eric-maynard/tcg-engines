/**
 * Shadow's Call — unl-165-219 · Spell · Order · 2 energy (no power) · no [Action]/[Reaction] → standard timing
 *
 *   Choose a friendly unit without [Temporary]. Give it [Temporary]. Draw 2.
 *   (Kill it at the start of its controller's Beginning Phase, before scoring.)
 *
 * Rules: 816 (Temporary = triggered "At the start of this permanent's CONTROLLER's Beginning Phase,
 * before scoring, kill this"; the grant has no duration of its own), 315.2.a/b (Beginning Step happens
 * before the Scoring Step's Hold), 190.4.c (no units left → control lapses → nothing to hold), 108.2
 * ("friendly" = controlled by you; a killed card goes to its OWNER's trash), 359.3 (Draw 2 needs no
 * target: it still happens if the chosen unit is gone by resolution), 155 (standard-speed spell),
 * 355.10 (targeting restriction "friendly … without [Temporary]" limits the legal choices; no legal
 * choice → the spell cannot be played).
 *
 * Head-judge notes — the tricky spots this file covers:
 *  1. "before scoring": a LONE holder given Temporary dies before the Hold → no point and bf control
 *     lapses; with a second unit there the battlefield is still held for 1.
 *  2. Lifetime: the keyword is permanent (not "this turn") — the unit lives through the opponent's whole
 *     turn and dies only when ITS CONTROLLER's next Beginning Phase starts.
 *  3. controller ≠ owner: a P2-owned unit under P1's control is "friendly" to P1, dies at P1's (not
 *     P2's) Beginning Phase, and lands in P2's trash.
 *  4. Targeting legality: enemy units and units that already have Temporary (a Sprite token) must not
 *     be choosable; with only those around the spell is unplayable. (Engine today: any unit is offered.)
 *  5. Draw 2 is unconditional: the target killed in response still nets two cards.
 *  6. Partner: Carrion Dredger (unl-153, Deathknell → Bird token) — cards now, a token when it expires.
 *  7. 816.1 says the kill is a TRIGGERED ability → it should be a Beginning-Phase chain item one can
 *     respond to; the engine kills silently with no window.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-165-219";
const SPRITE_TOKEN = "unl-t07"; // 3-Might Sprite unit token with [Temporary]
const CARRION_DREDGER = "unl-153-219"; // Order 2-drop, 1 Might: [Deathknell] play a 1-Might Bird token to your base
const SNUFF = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  name: "Snuff",
  timing: "reaction",
} as const;

/** P1's turn, 2 energy; P1 holds bf1 with Holder(3); Ally(2) + a Temporary Sprite token in base; P2 has Foe(3) in base. */
function board(energy = 2) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P1, "base", SPRITE_TOKEN, "token-sprite")
    .unit(P2, "base", { might: 3, name: "Foe" }, "foe")
    .unit(P2, "bf2", { might: 1, name: "Guard" }, "guard")
    .hand(P1, CARD, "sc");
}

const targetsOffered = (game: { p1: { option: (v: string, c: string) => { fields: readonly { arg: string; options?: readonly unknown[] }[] } | undefined } }) =>
  ((game.p1.option("cast", "sc")?.fields.find((f) => f.arg === "targets")?.options as string[][] | undefined) ?? []).map((o) => o[0]).sort();

describe("Shadow's Call (unl-165-219)", () => {
  test("cost & main line: 2 energy; Ally gains [Temporary] with NO expiry of its own (not a this-turn grant), P1 draws exactly 2, spell to trash; 1 energy is short", async () => {
    const game = await board().build();
    const hand0 = game.p1.hand().length; // includes sc
    const deck0 = game.p1.deck().length;
    await game.p1.cast("sc", { targets: "ally" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sc", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.state("ally").keywords).toContain("Temporary");
    expect(game.state("ally").grantedKeywords).toEqual([expect.objectContaining({ keyword: "Temporary" })]);
    expect(game.state("ally").grantedKeywords[0]?.duration).not.toBe("turn");
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 2);
    expect(game.p1.deck()).toHaveLength(deck0 - 2);
    expect(game.p2.hand()).toHaveLength(0);
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("base"); // nothing dies now
    expect((await board(1).build()).p1.can("cast", "sc")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("lifetime: the unit keeps Temporary through the opponent's entire turn and is killed (owner's trash) only when P1's next Beginning Phase starts", async () => {
    const game = await board().build();
    await game.p1.cast("sc", { targets: "ally" });
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally").keywords).toContain("Temporary");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["ally", "sc"]));
    expect(game.zoneOf("holder")).toBe("battlefield-bf1"); // untouched units are not affected
  });

  test("'before scoring' — the LONE holder of bf1 given Temporary dies in the Beginning Step, so the Scoring Step finds nothing to hold: 0 points and bf1 is no longer P1's", async () => {
    const game = await board().build();
    await game.p1.cast("sc", { targets: "holder" });
    await game.settle();
    await game.advanceTurn(); // P2
    expect(game.p1.points()).toBe(0);
    await game.advanceTurn(); // P1: kill, then (no) hold
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
  });

  test("…whereas with a second friendly unit at bf1 the battlefield is still held after the Temporary one dies: exactly 1 point, control kept", async () => {
    const game = await board().unit(P1, "bf1", { might: 1, name: "Buddy" }, "buddy").build();
    await game.p1.cast("sc", { targets: "holder" });
    await game.settle();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.locationOf("buddy")).toBe("bf1");
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("controller ≠ owner: a P2-owned unit under P1's control is a legal 'friendly' choice, survives P2's Beginning Phase, dies at P1's, and goes to P2's trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .card("stolen", { controller: P1, def: { cardType: "unit", might: 2, name: "Stolen" }, owner: P2, zone: "base" })
      .hand(P1, CARD, "sc")
      .build();
    expect(game.state("stolen")).toMatchObject({ controller: P1, owner: P2 });
    await game.p1.cast("sc", { targets: "stolen" });
    await game.settle();
    expect(game.state("stolen").keywords).toContain("Temporary");
    await game.advanceTurn(); // P2's Beginning Phase: not the controller's
    expect(game.zoneOf("stolen")).toBe("base");
    await game.advanceTurn(); // P1's
    expect(game.zoneOf("stolen")).toBe("trash");
    expect(game.p2.trash()).toContain("stolen");
    expect(game.p1.trash()).not.toContain("stolen");
  });

  test("Draw 2 does not depend on the target: Ally is Snuffed in response → no unit to mark, but P1 still draws 2 and the spell resolves to trash", async () => {
    const game = await board().hand(P2, SNUFF, "snuff").build();
    const hand0 = game.p1.hand().length;
    await game.p1.cast("sc", { targets: "ally" });
    await game.p1.passPriority();
    await game.p2.cast("snuff", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 2);
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.state("holder").keywords).not.toContain("Temporary"); // it did not hop to another unit
  });

  test("'a FRIENDLY unit' — the enemy Foe/Guard must not be offered and choosing Foe must be refused (engine offers every unit)", async () => {
    // Expected: choices = ally, holder only. Actual: foe, guard and the Temporary sprite are offered too.
    const game = await board().build();
    expect(targetsOffered(game)).not.toContain("foe");
    expect(targetsOffered(game)).not.toContain("guard");
    expect((await game.p1.try((p) => p.cast("sc", { targets: "foe" }))).ok).toBe(false);
  });

  test("'without [Temporary]' — a unit that already has Temporary (Sprite token) is not a legal choice; exactly {ally, holder} are", async () => {
    // Expected per the printed restriction. Actual: the parsed target is a bare `{type:"unit"}` with no filter.
    const game = await board().build();
    expect(game.state("token-sprite").keywords).toContain("Temporary");
    expect(targetsOffered(game)).toEqual(["ally", "holder"]);
    expect((await game.p1.try((p) => p.cast("sc", { targets: "token-sprite" }))).ok).toBe(false);
  });

  test("no legal choice → unplayable: with only a Temporary Sprite of yours and enemy units on the board, Shadow's Call cannot be cast (engine allows it)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", SPRITE_TOKEN, "token-sprite")
      .unit(P2, "base", { might: 3, name: "Foe" }, "foe")
      .hand(P1, CARD, "sc")
      .build();
    expect(game.p1.can("cast", "sc")).toBe(false);
  });

  test("with no units on the board at all it is not castable (a choice is required), even with 2 energy", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "sc").build();
    expect(game.p1.can("cast", "sc")).toBe(false);
    expect((await game.p1.try((p) => p.cast("sc"))).ok).toBe(false);
    expect(game.p1.energy()).toBe(2);
  });

  test("partner — Carrion Dredger: draw 2 now; when it expires at P1's next Beginning Phase its Deathknell leaves a 1-Might Bird token in P1's base", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", CARRION_DREDGER, "dredger").hand(P1, CARD, "sc").build();
    await game.p1.cast("sc", { targets: "dredger" });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.units("base")).toEqual(["dredger"]);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("dredger")).toBe("trash");
    const birds = game.p1.units("base").filter((id) => game.state(id).name === "Bird");
    expect(birds).toHaveLength(1);
    expect(game.state(birds[0] as string)).toMatchObject({ isToken: true, might: 1 });
    expect(game.p1.hand()).toHaveLength(3); // 2 + the draw phase card
  });

  test("Temporary is a TRIGGERED ability (816.1) — at the start of P1's turn the kill sits on the chain in the Beginning Phase (respondable) before it resolves", async () => {
    // rule 816.1.b: every Temporary permanent carries its own "kill this" trigger, so P1's board
    // (Ally just granted it + the printed-[Temporary] Sprite token) puts TWO items on the chain;
    // 816.2 only makes duplicate instances on ONE permanent redundant.
    const game = await board().build();
    await game.p1.cast("sc", { targets: "ally" });
    await game.settle();
    await game.advanceTurn();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "ally", triggered: true }),
      expect.objectContaining({ cardId: "token-sprite", triggered: true }),
    ]);
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.p1.units("base")).toEqual([]); // rule 186.1: the Sprite token ceases to exist rather than resting in the trash
    expect(game.phase()).toBe("main");
  });

  test("standard timing (155): not castable with Focus in a showdown you opened, nor during the opponent's turn", async () => {
    const game = await board().build();
    await game.p1.move("ally", "bf2");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "sc")).toBe(false);
    const opp = await board().active(P2).build();
    expect(opp.p1.can("cast", "sc")).toBe(false);
  });

  test("registry payload — the spell's choice must be a FRIENDLY unit WITHOUT Temporary; the parser produced a bare `{type:'unit'}` target (rest of the shape is right: grant Temporary, then draw 2; 2-cost Order, standard)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "order", energyCost: 2, name: "Shadow's Call", timing: "standard" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    type Step = { type: string; keyword?: string; amount?: number; target?: Record<string, unknown> };
    const ability = def?.abilities?.[0] as { type: string; effect: { type: string; effects: Step[] } };
    expect(ability.type).toBe("spell");
    expect(ability.effect.type).toBe("sequence");
    const [grant, draw] = ability.effect.effects;
    expect(grant).toMatchObject({ keyword: "Temporary", type: "grant-keyword" });
    expect(draw).toEqual({ amount: 2, type: "draw" });
    expect(ability.effect.effects).toHaveLength(2);
    // The two printed restrictions on the choice:
    expect(grant?.target).toMatchObject({ controller: "friendly", type: "unit" });
    expect(JSON.stringify(grant?.target)).toMatch(/Temporary/); // "without [Temporary]" encoded as an exclusion filter
  });
});
