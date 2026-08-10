/**
 * Interaction: Dominus (ven-142-166) · Spell · Fury/Body · 4 · [Action]
 *     "This turn, double a unit's Might and give it '[rainbow][rainbow]: Ready me.'"
 *   × Death Mark (ven-144-166) · Spell · Fury/Chaos · 2 + 1 pip
 *     "[Burn 3]. Play a 0 [Might] Shadow Clone unit token. (It has 'When I attack, you may banish a unit from your
 *      trash. If you do, give me [Assault 4] this turn.') [Flow] [1][rainbow][rainbow]"
 *
 * Rules: 432.1 / 432.1.a (Doubling = +current value, fixed for the stated duration — the Shield/Last Stand example),
 * 439.1 / 439.2.c / 439.4 (Create-and-play a token; no zone named → base or a battlefield you control; the creator
 * owns/controls it), 187.11 (Shadow Clone: domainless 0-Might unit token with the attack trigger), 185.3.a.1 / 185.3.b
 * (token characteristics), 143.4 (units enter exhausted), 807 / 807.2 (Assault: +X only WHILE an attacker), 143.2.a
 * (NONZERO damage ≥ Might kills — a 0-Might unit survives at 0 damage), 340.1 / 355.2.a ([Action] spells are legal
 * in a showdown while you hold Focus).
 *
 * Question: last turn P1 resolved Death Mark (three units burned into the trash, a Shadow Clone made). Now the Clone
 * is ready in P1's base, P2 defends bf2 with 3-Might D, P1 holds Dominus.
 *   (a) What exactly did Death Mark create?   (b) Line 1: Dominus in the main phase (Clone at 0) THEN attack with
 *   Assault 4 — doubling 0? Ready-me still granted? Might in combat / result / after?   (c) Line 2: attack first,
 *   take Assault 4, THEN Dominus in the showdown — in combat / result / after combat?   (d) Does the order matter, and
 *   what persists to end of turn?
 *
 * Expected: (a) a Shadow Clone unit TOKEN: 0 Might, no domain, cost 0, the 187.11 trigger, owned+controlled by P1,
 * entered base exhausted, ready now after Awaken. (b) 0 doubled = +0 (still 0) but the Ready-me grant sticks; attack
 * → banish a trash unit → Assault 4 → fights as 4: D (3) dies, Clone survives, P1 conquers; after combat 0 again;
 * P1 may still pay [rainbow][rainbow] to ready it. (c) Assault first → 4; Dominus sees 4 → fixed +4 → 8 in combat;
 * D dies, conquer; after combat Assault drops but +4 stays: 4 until end of turn. (d) Same winner here, but the
 * post-combat body is 0 (line 1) vs 4 (line 2) — a 3-damage ping kills the line-1 Clone and not the line-2 one; at
 * end of turn both are a plain 0-Might Clone without Ready-me.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DOMINUS = "ven-142-166";
const DEATH_MARK = "ven-144-166";
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit — deck stock that Burn 3 puts in the trash

/** [Action] "Deal 3 to a unit." — the (d) probe for the post-combat body. */
const PING3 = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Ping 3",
  rulesText: "[Action] Deal 3 to a unit.",
  timing: "action",
} as const;

/**
 * "Last turn": P1's turn 2 with exactly Death Mark's 2 + pip; deck top d1, d2, d3 (units); P2 holds bf2 with D (3).
 * `defenderMight` swaps D for a bigger wall in the (c) probe. Dominus and the ping wait in hand for P1's NEXT turn.
 */
function lastTurn(defenderMight = 3) {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: defenderMight, name: "Defender D" }, "d")
    .deckTop(P1, SKULKER, "d1")
    .deckTop(P1, SKULKER, "d2")
    .deckTop(P1, SKULKER, "d3")
    .hand(P1, DEATH_MARK, "dm")
    .hand(P1, DOMINUS, "dom")
    .hand(P1, PING3, "ping");
}

const cloneOf = (game: Game): string => {
  const c = game.findAll({ name: "Shadow Clone", owner: P1 }).find((id) => game.locationOf(id) !== undefined);
  expect(c).toBeDefined();
  return c as string;
};

/** Resolve Death Mark on turn 2, pass the turn around to P1's turn 4 and load 4 energy (Dominus) + 1 (ping) + 2 rainbow (Ready me). */
async function thisTurn(defenderMight = 3): Promise<{ game: Game; clone: string }> {
  const game = await lastTurn(defenderMight).build();
  await game.p1.cast("dm");
  const r = await game.settle();
  expect(r.reason).toBe("open");
  const clone = cloneOf(game);
  await game.advanceTurn();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  await game.p1.do("addResources", { energy: 5, power: { rainbow: 2 } });
  return { clone, game };
}

/** Move the Clone into bf2 and take the attack trigger: opt in, banish d1 from the trash. Stops at P1's first chain/showdown action. */
async function attackAndTakeAssault(game: Game, clone: string): Promise<void> {
  await game.p1.move(clone, "bf2");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["d1", "d2", "d3"]); // units in MY trash only — not the Death Mark
    await game.p1.pick("d1");
  }
}

/** Pass priority until the showdown Focus is back with P1 (the Clone's trigger has resolved). */
async function toP1Focus(game: Game): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "showdown" && d.seat === P1) {
      return;
    }
    expect(d).toMatchObject({ kind: "action", context: "chain" });
    await game.acting().pass();
  }
  throw new Error("never reached P1's showdown focus");
}

const readyMeOffered = (game: Game, clone: string): boolean =>
  game.p1
    .legal()
    .filter((o) => o.verb === "activate" && o.card === clone)
    .flatMap((o) => o.variants)
    .some((v) => (v.params as { sourceCardId?: string }).sourceCardId === "dom");

describe("Dominus × Shadow Clone — doubling 0 vs doubling Assault 4", () => {
  // ── (a) what Death Mark made ─────────────────────────────────────────────────────────────────────

  test("(a) Death Mark: Burn 3 puts d1-d3 in P1's trash, then Creates ONE Shadow Clone — a unit TOKEN, 0 Might, no domain, cost 0, owned and controlled by P1 — that entered P1's base EXHAUSTED (439 / 187.11 / 143.4)", async () => {
    const game = await lastTurn().build();
    await game.p1.cast("dm");
    await game.settle();
    expect(game.p1.trash().sort()).toEqual(["d1", "d2", "d3", "dm"]);
    const clone = cloneOf(game);
    expect(game.findAll({ name: "Shadow Clone" })).toHaveLength(1);
    expect(game.state(clone)).toMatchObject({
      baseMight: 0,
      cardType: "unit",
      controller: P1,
      damage: 0,
      domains: [],
      energyCost: 0,
      isExhausted: true,
      isToken: true,
      might: 0,
      name: "Shadow Clone",
      owner: P1,
      powerCost: [],
      zone: "base", // P1 controls no battlefield, so base is the only legal place (439.2.c)
    });
    expect(game.violations()).toEqual([]);
  });

  test("(a) …and after P1's next Awaken it is READY in base, still 0 Might, alive at 0 damage (143.2.a needs NONZERO damage); no Ready-me on it yet", async () => {
    const { game, clone } = await thisTurn();
    expect(game.state(clone)).toMatchObject({ damage: 0, isReady: true, might: 0, zone: "base" });
    expect(readyMeOffered(game, clone)).toBe(false);
    expect(game.state(clone).grantedKeywords).toEqual([]);
  });

  // ── (b) Line 1: Dominus first (on 0), then attack ────────────────────────────────────────────────

  test("(b) Dominus on the 0-Might Clone in the main phase: doubling adds +0 (still 0 Might, modifier 0) — yet the '[rainbow][rainbow]: Ready me' grant IS on the Clone and offered to P1 (432.1)", async () => {
    const { game, clone } = await thisTurn();
    await game.p1.cast("dom", { targets: clone });
    await game.settle();
    expect(game.zoneOf("dom")).toBe("trash");
    expect(game.p1.energy()).toBe(1);
    expect(game.state(clone)).toMatchObject({ might: 0, mightModifier: 0 });
    expect(readyMeOffered(game, clone)).toBe(true);
  });

  test("(b) then attacking bf2: the trigger banishes d1 from the trash and grants [Assault 4] this turn; the Clone holds the Attacker designation in the showdown → fights as 0 + 4 = 4 (807)", async () => {
    const { game, clone } = await thisTurn();
    await game.p1.cast("dom", { targets: clone });
    await game.settle();
    await attackAndTakeAssault(game, clone);
    await toP1Focus(game);
    expect(game.zoneOf("d1")).toBe("banishment");
    expect(game.p1.trash().sort()).toEqual(["d2", "d3", "dm", "dom"]);
    expect(game.state(clone)).toMatchObject({ combatRole: "attacker", isExhausted: true, mightModifier: 0, zone: "battlefield-bf2" });
    expect(game.state(clone).grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 4 }]);
  });

  test("(b) combat: 4 ≥ 3 kills D, D's 3 < 4 so the Clone survives (healed), P1 conquers bf2 (+1); after combat the Attacker designation is gone → the Clone is back to 0 Might (Dominus's +0 is worth nothing)", async () => {
    const { game, clone } = await thisTurn();
    await game.p1.cast("dom", { targets: clone });
    await game.settle();
    await attackAndTakeAssault(game, clone);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("d")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state(clone)).toMatchObject({ combatRole: null, damage: 0, isExhausted: true, might: 0, mightModifier: 0, zone: "battlefield-bf2" });
    expect(game.state(clone).keywords).toContain("Assault"); // still granted this turn — just not applying off-combat
    expect(game.violations()).toEqual([]);
  });

  test("(b) …and P1 may still pay [rainbow][rainbow] for the granted 'Ready me': both power spent, the exhausted Clone readies", async () => {
    const { game, clone } = await thisTurn();
    await game.p1.cast("dom", { targets: clone });
    await game.settle();
    await attackAndTakeAssault(game, clone);
    await game.settle();
    expect(readyMeOffered(game, clone)).toBe(true);
    const opt = game.p1.legal().find((o) => o.verb === "activate" && o.card === clone);
    await game.p1.choose(opt!.key, { source: "dom" });
    expect(game.p1.power("rainbow")).toBe(0);
    await game.settle();
    expect(game.state(clone).isReady).toBe(true);
  });

  // ── (c) Line 2: attack first, Dominus in the showdown ────────────────────────────────────────────

  test("(c) attack first: once the trigger resolved (Assault 4, current Might 4) Dominus is legal in the showdown while P1 has Focus and offers the attacking Clone; it resolves reading 4 → a fixed +4 modifier (432.1.a) → 0 + 4 + Assault 4 = 8 in combat", async () => {
    const { game, clone } = await thisTurn();
    await attackAndTakeAssault(game, clone);
    await toP1Focus(game);
    expect(game.p1.can("cast", "dom")).toBe(true);
    const offered = (game.p1.option("cast", "dom")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain(clone);
    await game.p1.cast("dom", { targets: clone });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dom", controller: P1, targets: [clone] })]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Dominus resolves inside the showdown
    expect(game.zoneOf("dom")).toBe("trash");
    expect(game.state(clone)).toMatchObject({ combatRole: "attacker", mightModifier: 4 });
    expect(game.state(clone).grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 4 }]);
    // Focus comes back round to P1 inside the still-open showdown: the granted activated ability is NOT usable there.
    if (game.decision()?.seat === P2) {
      await game.p2.passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(readyMeOffered(game, clone)).toBe(false);
  });

  test("(c) combat: D dies (8 ≥ 3), the Clone takes 3 < 8 and survives, P1 conquers; after combat Assault stops applying but Dominus's +4 remains → the Clone is a 4-Might unit for the rest of the turn", async () => {
    const { game, clone } = await thisTurn();
    await attackAndTakeAssault(game, clone);
    await toP1Focus(game);
    await game.p1.cast("dom", { targets: clone });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("d")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state(clone)).toMatchObject({ combatRole: null, damage: 0, might: 4, mightModifier: 4, zone: "battlefield-bf2" });
    expect(readyMeOffered(game, clone)).toBe(true); // back in Open state on P1's turn
    expect(game.violations()).toEqual([]);
  });

  test("(c) probe with a 7-Might defender instead of D: line 2's Clone really fights as 8 — the wall dies and the Clone survives — whereas line 1's 4-Might Clone dies to it and conquers nothing", async () => {
    // line 2 vs 7
    const two = await thisTurn(7);
    await attackAndTakeAssault(two.game, two.clone);
    await toP1Focus(two.game);
    await two.game.p1.cast("dom", { targets: two.clone });
    await two.game.settle();
    expect(two.game.zoneOf("d")).toBe("trash");
    expect(two.game.zoneOf(two.clone)).toBe("battlefield-bf2");
    expect(two.game.p1.points()).toBe(1);
    // line 1 vs 7
    const one = await thisTurn(7);
    await one.game.p1.cast("dom", { targets: one.clone });
    await one.game.settle();
    await attackAndTakeAssault(one.game, one.clone);
    await one.game.settle();
    expect(one.game.zoneOf("d")).toBe("battlefield-bf2");
    expect(one.game.zoneOf(one.clone)).toBe("gone"); // a dead token ceases to exist
    expect(one.game.p1.points()).toBe(0);
  });

  // ── (d) order matters for the rest of the turn; nothing survives the turn ────────────────────────

  test("(d) post-combat bodies differ: a 3-damage ping KILLS the line-1 Clone (0 Might: any nonzero damage is lethal, 143.2.a) but the line-2 Clone (4 Might) survives it with 3 damage marked", async () => {
    // line 1
    const one = await thisTurn();
    await one.game.p1.cast("dom", { targets: one.clone });
    await one.game.settle();
    await attackAndTakeAssault(one.game, one.clone);
    await one.game.settle();
    await one.game.p1.cast("ping", { targets: one.clone });
    await one.game.settle();
    expect(one.game.zoneOf(one.clone)).toBe("gone");
    // line 2
    const two = await thisTurn();
    await attackAndTakeAssault(two.game, two.clone);
    await toP1Focus(two.game);
    await two.game.p1.cast("dom", { targets: two.clone });
    await two.game.settle();
    await two.game.p1.cast("ping", { targets: two.clone });
    await two.game.settle();
    expect(two.game.zoneOf(two.clone)).toBe("battlefield-bf2");
    expect(two.game.state(two.clone)).toMatchObject({ damage: 3, might: 4 });
    expect(two.game.gameState.battlefields.bf2?.controller).toBe(P1);
  });

  test("(d) at end of turn both lines revert: on P2's turn the surviving Clone is a plain 0-Might token — no Assault, no +4, no 'Ready me' (all 'this turn')", async () => {
    for (const line of [1, 2] as const) {
      const { game, clone } = await thisTurn();
      if (line === 1) {
        await game.p1.cast("dom", { targets: clone });
        await game.settle();
        await attackAndTakeAssault(game, clone);
        await game.settle();
      } else {
        await attackAndTakeAssault(game, clone);
        await toP1Focus(game);
        await game.p1.cast("dom", { targets: clone });
        await game.settle();
      }
      await game.advanceTurn();
      expect(game.turnPlayer()).toBe(P2);
      expect(game.state(clone)).toMatchObject({ damage: 0, might: 0, mightModifier: 0, zone: "battlefield-bf2" });
      expect(game.state(clone).grantedKeywords).toEqual([]);
      expect(game.state(clone).meta.grantedAbilities ?? []).toEqual([]);
      expect(game.trace().expiration.length).toBeGreaterThanOrEqual(1);
    }
  });
});
