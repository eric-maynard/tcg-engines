/**
 * Interaction: "name matters" × copy tokens.
 *   Spiderling (ven-097-166) · Unit · Chaos · 3 · 1 Might
 *     "[Hidden] I have +1 [Might] for each other unit you control here with my name.
 *      Your deck can have any number of cards named Spiderling."
 *   × Deceiver (unl-199-219) · Legend (LeBlanc)
 *     "When you conquer or hold, you may discard 1 and exhaust me to play a ready Reflection unit
 *      token there. It becomes a copy of another unit there. Give it [Temporary]."
 *   × Mirror Image (unl-200-219) · Spell · Mind/Order · 3 + 2 power · Action
 *     "Choose a unit. Play a ready Reflection unit token to your base. It becomes a copy of that
 *      unit. Give it [Temporary]."
 *
 * Question. P1 (legend Deceiver) holds bf1 with two Spiderlings (printed 1 → each currently 2).
 *   (a) P1 uses Deceiver on the hold, copying a Spiderling — Might of each of the three units?
 *   (b) Instead P1 casts Mirror Image on a Spiderling (token lands in BASE) — Might of the token and
 *       of the two at bf1? And after the token moves to bf1?
 *   (c) P2 casts Mirror Image on P1's Spiderling — does P2's 'Spiderling' pump / get pumped by P1's
 *       Spiderlings once it reaches bf1?
 *   (d) Does the Reflection-Spiderling have Hidden, and does it matter? (+ Temporary timing.)
 *
 * Rules: 477.1.b.1 / 477.1.b.1.a / 477.1.b.1.b (a copy takes NAME, type, tags, cost, domain, RULES
 * TEXT — so the token is named "Spiderling" and has its passive); 477.2.a (Temporary is granted on
 * top of the copy); 182 (a token's controller = controller of the effect that made it); 187.6 /
 * 185.3.a.2 (Reflection = 0-Might domainless token that gets traits appended); "you control HERE"
 * (same location, same controller); 811.5 (Hidden is a copiable characteristic) / 811.1.b (but it
 * only functions from hand / Champion Zone); 816.1.b (Temporary: killed at the start of its
 * controller's Beginning Phase, before scoring).
 *
 * Expected: (a) three P1 "Spiderling"s at bf1 → 3 / 3 / 3. (b) token in base is a lone 1-Might
 * Spiderling, the two at bf1 stay 2 / 2; after it moves to bf1 all three are 3. (c) No to both —
 * P2's token counts only units P2 controls: it is 1 at bf1, P1's stay 2 / 2. (d) Yes it has Hidden
 * (inert on the board); Temporary kills it at the start of P1's next Beginning Phase before the hold
 * scores, and the real Spiderlings drop back to 2.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPIDERLING = "ven-097-166";
const DECEIVER = "unl-199-219";
const MIRROR_IMAGE = "unl-200-219";
const SKULKER = "ogn-175-298"; // discard fodder for Deceiver's cost

/** Every unit currently named "Spiderling", as [id, controller, location, might]. */
function spiderlings(game: Game): { id: string; controller: string; location: string | undefined; might: number; isToken: boolean }[] {
  return game.findAll({ name: "Spiderling" }).map((id) => {
    const s = game.state(id);
    return { controller: s.controller, id, isToken: s.isToken, location: s.location, might: s.might };
  });
}

function tokenOf(game: Game, controller: string): string {
  const t = spiderlings(game).find((s) => s.isToken && s.controller === controller);
  if (!t) {
    throw new Error(`no Spiderling token controlled by ${controller}`);
  }
  return t.id;
}

// ---- (a) Deceiver on the hold ------------------------------------------------------------------

/** End of P2's turn 2: P1 (Deceiver) controls bf1 with two Spiderlings and holds a Skulker to discard. */
function holdBoard() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .legend(P1, DECEIVER, "leblanc")
    .unit(P1, "bf1", SPIDERLING, "s1")
    .unit(P1, "bf1", SPIDERLING, "s2")
    .hand(P1, SKULKER, "fodder");
}

/** P2 ends turn → P1's Beginning Phase: the hold scores and Deceiver asks; P1 pays (discard fodder, exhaust) and copies s1; the trigger resolves. */
async function deceiverCopiesS1(): Promise<Game> {
  const game = await holdBoard().build();
  await game.p2.endTurn();
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "leblanc" } });
  await game.p1.yes();
  if (game.decision()?.kind === "pick" && (game.decision() as { semantics?: string }).semantics === "from-revealed") {
    await game.p1.pick("fodder"); // the "discard 1" half of the cost
  }
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "target" });
  await game.p1.pick("s1"); // "another unit there" to copy
  const r = await game.settle();
  expect(r.reason).toBe("open");
  return game;
}

describe("baseline: two Spiderlings together", () => {
  test("each real Spiderling at bf1 is 2 Might (printed 1 + 1 for the one OTHER friendly Spiderling here)", async () => {
    const game = await holdBoard().build();
    expect(game.state("s1")).toMatchObject({ baseMight: 1, might: 2 });
    expect(game.state("s2")).toMatchObject({ baseMight: 1, might: 2 });
  });
});

describe("(a) Deceiver's hold trigger plays a Reflection at bf1 that becomes a copy of a Spiderling", () => {
  test.failing("BUG: the trigger fires in P1's Beginning Phase off the hold (+1 point) as an opt-in whose cost is 'discard 1 + exhaust me'; both Spiderlings there are offered as the copy source", async () => {
    const game = await holdBoard().build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1); // the hold scored
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "leblanc", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    if (game.decision()?.kind === "pick" && (game.decision() as { semantics?: string }).semantics === "from-revealed") {
      await game.p1.pick("fodder");
    }
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["s1", "s2"]);
  });

  test.failing("BUG: after it resolves: fodder discarded, legend exhausted, and a READY P1-controlled unit TOKEN named 'Spiderling' stands at bf1 (477.1.b.1.a, 182)", async () => {
    const game = await deceiverCopiesS1();
    expect(game.zoneOf("fodder")).toBe("trash");
    expect(game.state("leblanc").isExhausted).toBe(true);
    const tok = tokenOf(game, P1);
    expect(game.state(tok)).toMatchObject({ baseMight: 1, controller: P1, isReady: true, isToken: true, location: "bf1", name: "Spiderling" });
    expect(game.p1.units("bf1")).toHaveLength(3);
  });

  test.failing("BUG: all THREE are 3 Might: each real Spiderling sees two other friendly Spiderlings here (1+2), and the copy has the same passive (1+2)", async () => {
    const game = await deceiverCopiesS1();
    const tok = tokenOf(game, P1);
    expect(game.state("s1").might).toBe(3);
    expect(game.state("s2").might).toBe(3);
    expect(game.state(tok).might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test.failing("BUG: (d) the copy carries Spiderling's printed Hidden (a copiable characteristic, 811.5) plus the granted Temporary (477.2.a) — Hidden does nothing for a unit already on the board", async () => {
    const game = await deceiverCopiesS1();
    const tok = tokenOf(game, P1);
    expect(game.state(tok).keywords).toEqual(expect.arrayContaining(["Hidden", "Temporary"]));
    expect(game.state("s1").keywords).toContain("Hidden");
    expect(game.state("s1").keywords).not.toContain("Temporary");
    expect(game.state(tok).isHidden).toBe(false); // on the board, face up
    expect(game.p1.can("hide", tok)).toBe(false); // 811.1.b: Hide works from hand / Champion Zone only
  });

  test.failing("BUG: (d) Temporary: at the start of P1's NEXT Beginning Phase the token is killed BEFORE the hold scores — then it is gone, the real Spiderlings are back to 2 / 2, and only afterwards the hold scores and Deceiver asks again (816.1.b)", async () => {
    const game = await deceiverCopiesS1();
    const tok = tokenOf(game, P1);
    await game.advanceTurn(); // → P2's turn 4: token still there
    expect(game.has(tok)).toBe(true);
    expect(game.state("s1").might).toBe(3);
    await game.p2.endTurn(); // → P1's turn 5 Beginning Phase
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    // "At the start of … Beginning Phase, BEFORE scoring, kill this": the Temporary trigger is the
    // first thing pending — the hold has not scored yet (still 1 point) and Deceiver has not asked.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: tok, controller: P1, triggered: true })]);
    expect(game.p1.points()).toBe(1);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Temporary resolves → the token is killed
    expect(game.zoneOf(tok)).toBe("gone"); // a token that died ceased to exist
    expect(game.state("s1").might).toBe(2);
    expect(game.state("s2").might).toBe(2);
    expect(game.p1.units("bf1").sort()).toEqual(["s1", "s2"]);
    // only now does the hold score (+1 → 2) and Deceiver's hold trigger ask again
    expect(game.p1.points()).toBe(2);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "leblanc" } });
  });
});

// ---- (b) P1's Mirror Image ---------------------------------------------------------------------

/** P1's turn: two Spiderlings hold bf1; P1 has exactly Mirror Image's cost (3 + 2 power) and the spell in hand. */
function mirrorBoard() {
  return scenario()
    .resources(P1, { energy: 3, power: { mind: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", SPIDERLING, "s1")
    .unit(P1, "bf1", SPIDERLING, "s2")
    .hand(P1, MIRROR_IMAGE, "mirror");
}

describe("(b) P1's Mirror Image: the copy lands in BASE — 'here' is evaluated per location", () => {
  test("Mirror Image chooses a unit at cast time (either Spiderling offered), costs 3 energy + 2 power, and resolves into a ready P1 'Spiderling' token in P1's BASE", async () => {
    const game = await mirrorBoard().build();
    const offered = game.p1.option("cast", "mirror")?.fields.find((f) => f.name === "targets")?.options;
    expect(offered).toEqual(expect.arrayContaining([["s1"], ["s2"]]));
    await game.p1.cast("mirror", { targets: "s1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("mirror")).toBe("trash");
    const tok = tokenOf(game, P1);
    expect(game.state(tok)).toMatchObject({ controller: P1, isReady: true, isToken: true, location: "base", name: "Spiderling" });
    expect(game.state(tok).keywords).toEqual(expect.arrayContaining(["Hidden", "Temporary"]));
  });

  test("in base the token is a lone Spiderling → 1 Might; the two at bf1 still see only each other → 2 / 2", async () => {
    const game = await mirrorBoard().build();
    await game.p1.cast("mirror", { targets: "s1" });
    await game.settle();
    const tok = tokenOf(game, P1);
    expect(game.state(tok).might).toBe(1);
    expect(game.state("s1").might).toBe(2);
    expect(game.state("s2").might).toBe(2);
  });

  test("the ready token Standard-Moves to bf1 (P1's own battlefield, no combat): now all three are 3 Might", async () => {
    const game = await mirrorBoard().build();
    await game.p1.cast("mirror", { targets: "s1" });
    await game.settle();
    const tok = tokenOf(game, P1);
    await game.p1.move(tok, "bf1");
    await game.settle();
    expect(game.locationOf(tok)).toBe("bf1");
    expect(game.state(tok).might).toBe(3);
    expect(game.state("s1").might).toBe(3);
    expect(game.state("s2").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });
});

// ---- (c) P2's Mirror Image on P1's Spiderling ---------------------------------------------------

/** P2's turn: P1's two Spiderlings hold bf1; P2 has Mirror Image and its cost. */
function enemyMirrorBoard() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { mind: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", SPIDERLING, "s1")
    .unit(P1, "bf1", SPIDERLING, "s2")
    .hand(P2, MIRROR_IMAGE, "mirror");
}

describe("(c) P2 copies P1's Spiderling: 'each other unit YOU control here' — control, not name alone", () => {
  test("P2 may choose an ENEMY unit ('Choose a unit'); the token is P2's (182), named Spiderling, in P2's base at 1 Might; P1's pair unchanged at 2 / 2", async () => {
    const game = await enemyMirrorBoard().build();
    await game.p2.cast("mirror", { targets: "s1" });
    await game.settle();
    const tok = tokenOf(game, P2);
    expect(game.state(tok)).toMatchObject({ controller: P2, location: "base", might: 1, name: "Spiderling", owner: P2 });
    expect(game.state("s1").might).toBe(2);
    expect(game.state("s2").might).toBe(2);
  });

  test("P2's token attacks bf1: in the combat showdown it is still 1 Might (P1's Spiderlings are not units P2 controls) and P1's are still 2 / 2 (P2's token is not theirs)", async () => {
    const game = await enemyMirrorBoard().build();
    await game.p2.cast("mirror", { targets: "s1" });
    await game.settle();
    const tok = tokenOf(game, P2);
    await game.p2.move(tok, "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.state(tok)).toMatchObject({ combatRole: "attacker", location: "bf1", might: 1 });
    expect(game.state("s1")).toMatchObject({ combatRole: "defender", might: 2 });
    expect(game.state("s2")).toMatchObject({ combatRole: "defender", might: 2 });
  });

  test("combat 1 vs 4: the token dies (ceases to exist), P1 keeps bf1 with both Spiderlings at 2 / 2", async () => {
    const game = await enemyMirrorBoard().build();
    await game.p2.cast("mirror", { targets: "s1" });
    await game.settle();
    const tok = tokenOf(game, P2);
    await game.p2.move(tok, "bf1");
    await game.settle();
    expect(game.zoneOf(tok)).toBe("gone");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.units("bf1").sort()).toEqual(["s1", "s2"]);
    expect(game.state("s1").might).toBe(2);
    expect(game.state("s2").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
