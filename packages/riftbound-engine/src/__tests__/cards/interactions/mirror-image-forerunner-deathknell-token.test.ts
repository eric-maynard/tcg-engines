/**
 * Interaction: Mirror Image (unl-200-219) · Spell (Action) · Mind/Order · 3 + 2 power
 *     "Choose a unit. Play a ready Reflection unit token to your base. It becomes a copy of that unit.
 *      Give it [Temporary]. (Kill it at the start of its controller's Beginning Phase, before scoring.)"
 *   × Ferrous Forerunner (sfd-021-221) · Unit · Fury · 6+[fury] · 6 Might
 *     "[Deathknell] — Play two 3 [Might] Mech unit tokens to your base."
 *   × Rebuke (ogn-172-298) · Spell (Action) · Chaos · 2 + 2 chaos
 *     "Return a unit at a battlefield to its owner's hand."
 *
 * Rules: 187.6 (Reflection = domainless 0-Might unit token), 477.1.b.1.a/.b (a copy takes the PRINTED
 * copyable traits: name, type, tags, domain, cost, Might, rules text), 185.3.a.2 (copied cost is
 * appended), 702/704 (a buff is a counter on the original — not copyable), 477.3 (a temporary +N is an
 * arithmetic modifier on the original — not copyable), 477.2.a + 801.3.a.3 (Temporary is granted
 * separately, indefinitely while on the board), 182/183 (token owner + controller = the player who
 * played it), 808.1.d / .d.2 / .d.3 (Deathknell = "when I'm killed and sent to the trash"; the trigger
 * is queued and its details noted BEFORE the permanent moves), 186.1 (a token in a non-board zone
 * ceases to exist — which does not undo an already-created trigger), 191.4.a (the trigger's controller
 * = the token's controller → "your base" = P1's), 143.4 (tokens played by an effect enter exhausted
 * unless told otherwise), 187.4 / 184.3 (Mech tokens have only what their creating effect gives them —
 * no Temporary), 428.1 (board → hand is not a kill → no Deathknell), 816.1.b (Temporary's upkeep is a
 * real kill → Deathknell fires).
 *
 * Question: P2's Ferrous Forerunner is buffed and +2 Might this turn (reads 9). P1 resolves Mirror
 * Image on it.
 *   (a) Reflection: named Ferrous Forerunner, unit, Fury, cost 6+[fury], 6 Might (not 9), has
 *       Deathknell, unbuffed, no +2, READY, has Temporary, token owned+controlled by P1, in P1's base.
 *   (b) It dies in combat → P1 still gets two 3-Might Mechs in P1's base (exhausted, no Temporary);
 *       the Reflection itself ceases to exist (not in any trash).
 *   (c) Rebuked instead → goes to P1's hand and ceases to exist; NO Deathknell, no Mechs, nothing to
 *       replay.
 *   (d) Left alone → Temporary kills it at the start of P1's next Beginning Phase and that death
 *       ALSO yields the two Mechs.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const MIRROR_IMAGE = "unl-200-219";
const FERROUS_FORERUNNER = "sfd-021-221";
const REBUKE = "ogn-172-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

function targetsOffered(game: Game, alias: string): string[] {
  const opt = game.p1.option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/**
 * P1's turn. P2: Ferrous Forerunner in base, buffed (+1) and +2 Might this turn → 9; an 8-Might Wall
 * holding bf1 (kills a 6-Might attacker outright); 2 energy + 2 chaos and Rebuke in hand (an Action —
 * castable by P2 during a showdown on P1's turn). P1: exactly Mirror Image's cost (3 + mind + order).
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "base", FERROUS_FORERUNNER, "ff", { buffed: true, mightModifier: 2 })
    .unit(P2, "bf1", { might: 8, name: "Wall" }, "wall")
    .resources(P1, { energy: 3, power: { mind: 1, order: 1 } })
    .resources(P2, { energy: 2, power: { chaos: 2 } })
    .hand(P1, MIRROR_IMAGE, "mirror")
    .hand(P2, REBUKE, "rebuke");
}

/** Cast Mirror Image on the Forerunner, let it resolve, return the new Reflection's id. */
async function reflect(game: Game): Promise<string> {
  const before = game.p1.base();
  await game.p1.cast("mirror", { targets: "ff" });
  await game.settle();
  expect(game.zoneOf("mirror")).toBe("trash");
  const fresh = game.p1.base().filter((id) => !before.includes(id));
  expect(fresh).toHaveLength(1);
  return fresh[0] as string;
}

/** P1's Mech tokens currently in P1's base. */
function p1Mechs(game: Game): string[] {
  return game.cardsAt("base", P1).filter((id) => {
    const s = game.state(id);
    return s.cardType === "unit" && s.name === "Mech" && s.isToken;
  });
}

function p2Mechs(game: Game): string[] {
  return game.cardsAt("base", P2).filter((id) => game.state(id).name === "Mech");
}

describe("Mirror Image × Ferrous Forerunner — what the Reflection copies, and whether its Deathknell survives the token ceasing to exist", () => {
  // ── premise ────────────────────────────────────────────────────────────────────────────────

  test("premise: P2's Forerunner reads 9 Might (6 printed +1 buff +2 this turn) and has Deathknell; Mirror Image may choose it (an ENEMY unit) and costs 3 energy + 2 power", async () => {
    const game = await board().build();
    expect(game.state("ff")).toMatchObject({ baseMight: 6, might: 9, isBuffed: true, mightModifier: 2, controller: P2 });
    expect(game.state("ff").keywords).toContain("Deathknell");
    expect(targetsOffered(game, "mirror")).toContain("ff");
    await game.p1.cast("mirror", { targets: "ff" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0, order: 0 } });
  });

  // ── (a) what the Reflection is ─────────────────────────────────────────────────────────────

  test("(a) the Reflection is a unit TOKEN in P1's base, owned and controlled by P1; the original Forerunner is untouched (182, 183)", async () => {
    const game = await board().build();
    const tok = await reflect(game);
    const t = game.state(tok);
    expect(t.isToken).toBe(true);
    expect(t.cardType).toBe("unit");
    expect(t.owner).toBe(P1);
    expect(t.controller).toBe(P1);
    expect(t.zone).toBe("base");
    expect(game.p1.units("base")).toContain(tok);
    expect(game.state("ff")).toMatchObject({ might: 9, isBuffed: true, controller: P2, zone: "base", damage: 0 });
  });

  test("(a) it copies the PRINTED traits: name 'Ferrous Forerunner', Fury domain, cost 6 + [fury], rules text incl. [Deathknell] (477.1.b.1.a/b, 185.3.a.2)", async () => {
    const game = await board().build();
    const tok = await reflect(game);
    const t = game.state(tok);
    expect(t.name).toBe("Ferrous Forerunner");
    expect(t.domains).toEqual(["fury"]);
    expect(t.energyCost).toBe(6);
    expect(t.powerCost).toEqual(["fury"]);
    expect(t.keywords).toContain("Deathknell");
  });

  test("(a) its Might is the printed 6 — NOT 9: neither the buff counter (702/704) nor the +2-this-turn modifier (477.3) is copyable; it is undamaged", async () => {
    const game = await board().build();
    const tok = await reflect(game);
    const t = game.state(tok);
    expect(t.baseMight).toBe(6);
    expect(t.might).toBe(6);
    expect(t.isBuffed).toBe(false);
    expect(t.mightModifier).toBe(0);
    expect(t.damage).toBe(0);
  });

  test("(a) it is READY ('Play a ready Reflection') and separately has [Temporary] with no expiry (477.2.a, 801.3.a.3) — so it can move this very turn", async () => {
    const game = await board().build();
    const tok = await reflect(game);
    const t = game.state(tok);
    expect(t.isReady).toBe(true);
    expect(t.keywords).toContain("Temporary");
    expect(t.grantedKeywords).toContainEqual(expect.objectContaining({ keyword: "Temporary" }));
    expect(t.grantedKeywords.find((k) => k.keyword === "Temporary")?.duration).not.toBe("turn");
    expect(game.p1.can("move")).toBe(true);
    expect(game.state("ff").keywords).not.toContain("Temporary"); // the grant went to the token only
  });

  // ── (b) dies in combat ─────────────────────────────────────────────────────────────────────

  test("(b) sent into the 8-Might Wall it takes lethal combat damage and is killed; its copied Deathknell goes on the chain controlled by P1 even though the token itself has already ceased to exist (808.1.d.2/.3, 186.1)", async () => {
    const game = await board().build();
    const tok = await reflect(game);
    await game.p1.move(tok, "bf1");
    expect(game.state(tok).combatRole).toBe("attacker");
    await game.p1.passFocus();
    await game.p2.passFocus(); // combat damage: 6 into Wall (survives), 8 into the Reflection (dies)
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: tok, controller: P1, triggered: true })]);
    // The token is gone — not on the board, not in anyone's trash.
    expect(game.cardsAt("bf1")).not.toContain(tok);
    expect(game.p1.trash()).toEqual(["mirror"]);
    expect(game.p2.trash()).toEqual([]);
    expect(p1Mechs(game)).toEqual([]); // not yet: the trigger has not resolved
  });

  test("(b) the Deathknell resolves: P1 (the token's controller, 191.4.a) gets exactly two 3-Might Mech tokens in P1's base — not P2", async () => {
    const game = await board().build();
    const tok = await reflect(game);
    await game.p1.move(tok, "bf1");
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    const mechs = p1Mechs(game);
    expect(mechs).toHaveLength(2);
    for (const m of mechs) {
      expect(game.state(m)).toMatchObject({ might: 3, baseMight: 3, damage: 0, isToken: true, owner: P1, controller: P1, zone: "base" });
    }
    expect(p2Mechs(game)).toEqual([]);
    expect(game.p1.units()).toHaveLength(2); // just the two Mechs; the Reflection is gone
    expect(game.has(tok) && game.state(tok).zone === "base").toBe(false);
  });

  test("(b) the Mechs enter EXHAUSTED (143.4) and have NO Temporary — only what their creating effect gave them (187.4, 184.3); Wall survives with bf1 still P2's", async () => {
    const game = await board().build();
    const tok = await reflect(game);
    await game.p1.move(tok, "bf1");
    await game.settle();
    const mechs = p1Mechs(game);
    expect(mechs).toHaveLength(2);
    for (const m of mechs) {
      expect(game.state(m).isExhausted).toBe(true);
      expect(game.state(m).keywords).not.toContain("Temporary");
      expect(game.state(m).grantedKeywords).toEqual([]);
      expect(game.state(m).name).toBe("Mech");
    }
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.state("wall").damage).toBe(0); // healed at combat cleanup
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.trash()).toEqual(["mirror"]); // no token ever lands in a trash
  });

  test("(b) those Mechs, lacking Temporary, are still alive on P1's NEXT turn", async () => {
    const game = await board().build();
    const tok = await reflect(game);
    await game.p1.move(tok, "bf1");
    await game.settle();
    const mechs = p1Mechs(game);
    expect(mechs).toHaveLength(2);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 (a Temporary unit would die here)
    expect(game.turnPlayer()).toBe(P1);
    for (const m of mechs) {
      expect(game.zoneOf(m)).toBe("base");
    }
    expect(p1Mechs(game).sort()).toEqual([...mechs].sort());
  });

  // ── (c) Rebuked ────────────────────────────────────────────────────────────────────────────

  test("(c) at a battlefield the Reflection is a legal Rebuke target for P2 during the showdown (Action timing); Rebuke costs P2 2 energy + 2 chaos", async () => {
    const game = await board().build();
    const tok = await reflect(game);
    await game.p1.move(tok, "bf1");
    await game.p1.passFocus();
    expect(game.p2.can("cast", "rebuke")).toBe(true);
    const offered = game.p2.option("cast", "rebuke")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(offered.flatMap((v) => (Array.isArray(v) ? v : [v]) as string[])).toContain(tok);
    await game.p2.cast("rebuke", { targets: tok });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["rebuke"]);
  });

  test("(c) Rebuke returns it to its OWNER's hand = P1's (183); being a token it ceases to exist there (186.1) — P1's hand stays empty, nothing to replay", async () => {
    const game = await board().build();
    const tok = await reflect(game);
    const p1Hand0 = game.p1.hand().length; // Mirror Image already spent
    const p2Hand0 = game.p2.hand().length;
    await game.p1.move(tok, "bf1");
    await game.p1.passFocus();
    await game.p2.cast("rebuke", { targets: tok });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Rebuke resolves
    expect(game.zoneOf("rebuke")).toBe("trash");
    expect(game.cardsAt("bf1")).not.toContain(tok);
    expect(game.p1.hand()).toHaveLength(p1Hand0);
    expect(game.p1.hand()).not.toContain(tok);
    expect(game.p2.hand()).toHaveLength(p2Hand0 - 1);
    expect(game.p2.hand()).not.toContain(tok);
    expect(game.has(tok) && ["hand", "base", "trash", "battlefield-bf1"].includes(game.state(tok).zone)).toBe(false);
    expect(game.p1.legal().some((o) => o.card === tok)).toBe(false); // cannot be replayed
  });

  test("(c) board → hand is NOT a kill (428.1): no Deathknell goes on the chain and no Mech is ever created for anyone; combat fizzles and P2 keeps bf1 (808.1.d)", async () => {
    const game = await board().build();
    const tok = await reflect(game);
    await game.p1.move(tok, "bf1");
    await game.p1.passFocus();
    await game.p2.cast("rebuke", { targets: tok });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]); // no Deathknell pending
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(p1Mechs(game)).toEqual([]);
    expect(p2Mechs(game)).toEqual([]);
    expect(game.p1.units()).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.state("wall").damage).toBe(0);
    expect(game.p1.trash()).toEqual(["mirror"]);
    expect(game.p2.trash()).toEqual(["rebuke"]);
  });

  // ── (d) Temporary upkeep kill ──────────────────────────────────────────────────────────────

  test("(d) left alone, the Reflection survives P2's turn and is killed by Temporary at the start of P1's next Beginning Phase (816.1.b) — gone from the board, not in any trash", async () => {
    const game = await board().build();
    const tok = await reflect(game);
    await game.advanceTurn(); // → P2's turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf(tok)).toBe("base"); // 'its controller's' Beginning Phase = P1's, not P2's
    await game.p2.endTurn();
    await game.settle({ policy: "first" }); // P1's Beginning Phase runs; pass through the Deathknell window
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.base()).not.toContain(tok);
    expect(game.p1.units()).not.toContain(tok);
    expect(game.p1.trash()).toEqual(["mirror"]);
  });

  test("(d) that Temporary kill is a real death → the copied Deathknell fires and P1 gets two exhausted 3-Might Mechs in P1's base by P1's main phase", async () => {
    const game = await board().build();
    const tok = await reflect(game);
    await game.advanceTurn(); // → P2
    expect(p1Mechs(game)).toEqual([]);
    await game.p2.endTurn();
    // The Deathknell is a chain item during P1's Beginning Phase — it should appear, controlled by P1.
    let sawDeathknell = false;
    for (let i = 0; i < 20; i++) {
      const d = game.decision();
      if (game.chain().some((c) => c.cardId === tok && c.controller === P1 && c.triggered)) {
        sawDeathknell = true;
      }
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        await game.settle({ maxSteps: 1, policy: "first" });
      }
    }
    await game.settle();
    expect(sawDeathknell).toBe(true);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    const mechs = p1Mechs(game);
    expect(mechs).toHaveLength(2);
    for (const m of mechs) {
      expect(game.state(m)).toMatchObject({ might: 3, isToken: true, controller: P1, isExhausted: true });
      expect(game.state(m).keywords).not.toContain("Temporary");
    }
    expect(p2Mechs(game)).toEqual([]);
    expect(game.state("ff").zone).toBe("base"); // the original never died
    expect(game.state("ff").might).toBe(7); // its +2 'this turn' expired; the buff (+1) remains
  });
});
