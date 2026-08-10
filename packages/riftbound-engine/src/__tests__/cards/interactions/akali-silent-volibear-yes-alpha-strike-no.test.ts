/**
 * Interaction: Akali, Silent (ven-038-166) · Champion Unit · Calm · 4 + [calm] · 4 Might
 *     "I can't be chosen by enemy spells and abilities unless I'm in combat. When I move to a
 *      battlefield, give me +2 [Might] this turn."                             — P2's, at bf1
 *   × Volibear, Furious (ogn-041-298) · Champion Unit · Fury · 10 + [fury][fury] · 9 Might
 *     "[Deflect 2] … When I attack, deal 5 damage split among any number of enemy units here."
 *                                                                              — P1's, in base
 *   × Alpha Strike (unl-192-219) · Spell · Calm/Body · 3 + [rainbow] · [Action]
 *     "Choose a friendly unit. It deals damage equal to its Might split among enemy units at
 *      battlefields. Then for each unit this kills, do this: Gain 1 XP."       — in P1's hand
 *   (+ Shipyard Skulker ogn-175-298, a vanilla 3-Might unit of P2's next to Akali; P1's vanilla 4-Might
 *    "Striker" in base as Alpha Strike's friendly unit; Flash ogs-011-024 "[Reaction] Move up to 2
 *    friendly units to base." in P2's hand for Case C.)
 *
 * Question.
 *   Case A: P1's turn, no attack yet. P1 plays Alpha Strike choosing the 4-Might Striker — is Akali offered
 *           as one of the split targets? Is Skulker? What is the maximum number of split targets?
 *   Case B: Volibear moves into bf1; combat opens with Akali defending. When Volibear's attack trigger
 *           finalizes, is Akali now a legal split target?
 *   Case C: in B, P1 targets Akali + Skulker; P2 reacts with Flash moving Akali to base. Outcome?
 *
 * Rules: 757/758 + 355.6 (an object that can't be chosen is never offered), 355.14.a/.b (each split
 * recipient is a TARGET, chosen when the spell/ability is FINALIZED), 355.14.c (at most as many targets
 * as the initial damage — the source's Might, 4), 355.14.d (each prospective target is checked
 * individually), 355.14.e/.f (the division is decided at resolution; every remaining target gets ≥ 1),
 * 359.3.e.5 (a target that became illegal — Akali Flashed out of combat, the CR's own Bellows Breath /
 * Akali example — is simply unaffected), 355.15 (no new targets may be added at resolution).
 *
 * Expected: A — Akali (not in combat) is excluded while Skulker at the same battlefield is offered; the
 * cap is Striker's Might (4) but only legal candidates count, so effectively {Skulker}. B — a combat
 * showdown is in progress with Akali as a Defender, so her restriction is lifted: the trigger may choose
 * her and Skulker. C — Flash resolves first; Akali in base is neither 'here' nor in combat → illegal,
 * unaffected; the full 5 is divided among the remaining legal targets → all 5 to Skulker (dies); nothing
 * is redirected to any other unit.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AKALI_SILENT = "ven-038-166";
const VOLIBEAR_FURIOUS = "ogn-041-298";
const ALPHA_STRIKE = "unl-192-219";
const SHIPYARD_SKULKER = "ogn-175-298";
const FLASH = "ogs-011-024";

/**
 * P1's turn (turn 2, main). P2 controls bf1 with Akali, Silent and Shipyard Skulker and holds Flash with
 * exactly its 2 energy. P1 has the 4-Might Striker and Volibear in base, Alpha Strike in hand and exactly
 * its cost (3 + 1 rainbow for the [rainbow] pip).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", AKALI_SILENT, "akali")
    .unit(P2, "bf1", SHIPYARD_SKULKER, "skulker")
    .unit(P1, "base", { might: 4, name: "Striker" }, "ally")
    .unit(P1, "base", VOLIBEAR_FURIOUS, "voli")
    .hand(P1, ALPHA_STRIKE, "alpha")
    .hand(P2, FLASH, "flash");
}

function showdown(game: Game) {
  return (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).at(-1);
}

/** Alpha Strike's offered `targets` tuples: [friendly, ...splitTargets]. */
function alphaTuples(game: Game): string[][] {
  const field = game.p1.option("cast", "alpha")?.fields.find((f) => f.name === "targets");
  return (field?.options ?? []).map((o) => (Array.isArray(o) ? (o as string[]) : [o as string]));
}

/** The cards P1 may put Volibear's split damage on, whatever shape the engine asks in (pick or distribute). */
function splitCandidates(game: Game): string[] {
  const d = game.decision();
  if (d?.seat !== P1) {
    return [];
  }
  if (d.kind === "pick") {
    return d.options.map((o) => o.card ?? o.key);
  }
  if (d.kind === "distribute") {
    return d.buckets.map((b) => b.card ?? b.key);
  }
  return [];
}

/** Volibear moves into bf1: combat showdown opens; P1 names {Akali, Skulker} for the split (355.14.b); his attack trigger is the only Combat Chain item. */
async function volibearAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("voli", "bf1");
  await game.p1.pick("akali", "skulker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "voli", controller: P1, triggered: true })]);
  return game;
}

/** …P1 pass, P2 pass → the trigger resolves up to P1's split prompt (engine: recipients are asked for here). */
async function atSplitPrompt(): Promise<Game> {
  const game = await volibearAttacks();
  await game.p1.passPriority();
  await game.p2.passPriority();
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    // A pick-then-divide shape: name both, then the amounts are asked.
    await game.p1.pick("akali", "skulker");
  }
  return game;
}

/** …instead: P1 passes, P2 answers the trigger with Flash on Akali; P2 pass, P1 pass → Flash resolves (Akali home). */
async function akaliFlashedOut(): Promise<Game> {
  const game = await volibearAttacks();
  await game.p1.passPriority();
  expect(game.p2.can("cast", "flash")).toBe(true);
  await game.p2.cast("flash", { targets: ["akali"] });
  expect(game.chain().map((c) => c.cardId)).toEqual(["voli", "flash"]);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.chain().map((c) => c.cardId)).toEqual(["voli"]);
  return game;
}

describe("Case A — Alpha Strike outside combat: Akali is NOT a legal split target, Skulker is", () => {
  test("no combat anywhere: Akali (combatRole null) carries her 'can't be chosen by enemy spells and abilities' protection; Skulker beside her does not", async () => {
    const game = await board().build();
    expect(showdown(game)).toBeUndefined();
    expect(game.state("akali").combatRole ?? null).toBeNull();
    expect(game.state("akali").keywords).toContain("Untargetable");
    expect(game.state("skulker").keywords).not.toContain("Untargetable");
  });

  test("Alpha Strike's offered target sets never contain Akali but do offer Skulker (same battlefield) as a split target for the Striker (355.14.d, 758/355.6); naming Akali anyway is rejected and nothing is spent", async () => {
    const game = await board().build();
    const tuples = alphaTuples(game);
    expect(tuples.length).toBeGreaterThan(0);
    expect(tuples.flat()).not.toContain("akali");
    expect(tuples).toContainEqual(["ally", "skulker"]);
    expect((await game.p1.try((p) => p.cast("alpha", { targets: ["ally", "akali"] }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("alpha", { targets: ["ally", "akali", "skulker"] }))).ok).toBe(false);
    expect(game.zoneOf("alpha")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { rainbow: 1 } });
    expect(game.state("akali").damage).toBe(0);
  });

  test("maximum split targets: capped by the Striker's Might at play time (4, 355.14.c) but only LEGAL candidates count — with Akali excluded the Striker's sets are exactly {} or {Skulker}; no set for any friendly unit exceeds its Might", async () => {
    const game = await board().build();
    const tuples = alphaTuples(game);
    const forStriker = tuples.filter((t) => t[0] === "ally").map((t) => t.slice(1).sort());
    expect(forStriker).toContainEqual(["skulker"]);
    expect(forStriker.every((s) => s.length <= 1 && s.every((c) => c === "skulker"))).toBe(true);
    for (const t of tuples) {
      expect(t.length - 1).toBeLessThanOrEqual(game.state(t[0] as string).might);
      expect(t.slice(1)).not.toContain("akali");
    }
  });

  test("resolving it on {Skulker}: the Striker deals its 4 to Skulker (3 Might) → Skulker dies, P1 gains 1 XP; Akali is untouched at bf1; Alpha Strike to the trash, 3 + [rainbow] spent", async () => {
    const game = await board().build();
    await game.p1.cast("alpha", { targets: ["ally", "skulker"] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "alpha", controller: P1, targets: ["ally", "skulker"] })]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.state("akali")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("alpha")).toBe("trash");
    expect(game.p1.xp()).toBe(1);
    const log = (game.gameState.damageLog ?? []).filter((r) => !r.combat);
    expect(log).toEqual([expect.objectContaining({ amount: 4, target: "skulker" })]);
    expect(game.violations()).toEqual([]);
  });
});

describe("Case B — Volibear attacks into bf1: in combat Akali IS a legal split target", () => {
  test("the move opens a combat showdown at bf1 with Akali and Skulker as Defenders — Akali's restriction is lifted for as long as she is in combat (her Untargetable grant is gone); Volibear's attack trigger is on the Combat Chain and P1 holds priority", async () => {
    const game = await volibearAttacks();
    expect(showdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("voli").combatRole).toBe("attacker");
    expect(game.state("akali").combatRole).toBe("defender");
    expect(game.state("skulker").combatRole).toBe("defender");
    expect(game.state("akali").keywords).not.toContain("Untargetable");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  // Expected (355.14.a/.b): each recipient of split damage is a TARGET and targets are chosen when the
  // ability is FINALIZED on the chain — so right after the move, before P1 is handed priority, P1 should
  // be asked to name Volibear's split targets (Akali and Skulker both offered) and the chain item should
  // then carry them. Actual: the trigger goes on the chain with no targets and nobody is asked anything
  // until it RESOLVES, where a single "Split 5 damage" distribute prompt both chooses and divides.
  test("Volibear's split targets should be chosen at finalization (355.14.b) — P1 asked before priority, Akali + Skulker offered, targets recorded on the chain item", async () => {
    const game = await board().build();
    await game.p1.move("voli", "bf1");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(splitCandidates(game).sort()).toEqual(["akali", "skulker"]);
    await game.p1.pick("akali", "skulker");
    expect(game.chain()[0]).toMatchObject({ cardId: "voli", targets: expect.arrayContaining(["akali", "skulker"]) });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("whenever P1 IS asked (engine: as the trigger resolves after P1 pass / P2 pass), Akali is offered right alongside Skulker with the full 5 to split — in combat she is fair game for the enemy ability", async () => {
    const game = await volibearAttacks();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()?.seat).toBe(P1);
    expect(["pick", "distribute"]).toContain(game.decision()?.kind as string);
    expect(splitCandidates(game).sort()).toEqual(["akali", "skulker"]);
    const d = game.decision();
    if (d?.kind === "distribute") {
      expect(d.total).toBe(5);
    }
  });

  test("P1 splits 4 onto Akali and 1 onto Skulker: Akali (4 Might) is killed by the ability → P2's trash before any combat damage; Skulker carries 1; the showdown is still open with P1 holding Focus", async () => {
    const game = await atSplitPrompt();
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1, total: 5 });
    await game.p1.distribute({ akali: 4, skulker: 1 });
    expect(game.zoneOf("akali")).toBe("trash");
    expect(game.p2.trash()).toContain("akali");
    expect(game.state("skulker")).toMatchObject({ combatRole: "defender", damage: 1, zone: "battlefield-bf1" });
    expect((game.gameState.damageLog ?? []).filter((r) => r.combat)).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toMatchObject({ focusPlayer: P1, isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("Case C — Akali chosen in combat, then Flashed to base before the trigger resolves: she is unaffected, all 5 land on Skulker", () => {
  // Expected line per 355.14.b: P1 locks {Akali, Skulker} as the trigger finalizes; P2, seeing that,
  // reacts with Flash on Akali. Actual: there is no finalization-time choice (see Case B BUG), so P1 can
  // never have "targeted Akali + Skulker" before P2's reaction window — the first assertion fails.
  test("P1 should be able to name {Akali, Skulker} as targets BEFORE P2's reaction window, so that P2 Flashes in response to a trigger already targeting Akali (355.14.b)", async () => {
    const game = await board().build();
    await game.p1.move("voli", "bf1");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("akali", "skulker");
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain()[0]?.targets ?? []).toEqual(expect.arrayContaining(["akali", "skulker"]));
    await game.p2.cast("flash", { targets: ["akali"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["voli", "flash"]);
  });

  test("P1 passes priority → P2 may answer Volibear's trigger with Flash ([Reaction], its own unit — Akali's clause never restricts FRIENDLY spells): Flash on Akali goes on top and costs P2's 2 energy", async () => {
    const game = await volibearAttacks();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    const field = game.p2.option("cast", "flash")?.fields.find((f) => f.name === "targets");
    expect(field?.options).toContainEqual(["akali"]);
    await game.p2.cast("flash", { targets: ["akali"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["voli", "flash"]);
    expect(game.p2.energy()).toBe(0);
  });

  test("LIFO: Flash resolves first — Akali is in P2's base, no longer a Defender, no longer in combat, and her 'can't be chosen' protection is back on; Volibear's trigger still waits on the chain", async () => {
    const game = await akaliFlashedOut();
    expect(game.state("akali")).toMatchObject({ combatRole: null, damage: 0, zone: "base" });
    expect(game.state("akali").keywords).toContain("Untargetable");
    expect(game.state("skulker")).toMatchObject({ combatRole: "defender", zone: "battlefield-bf1" });
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "voli", triggered: true })]);
  });

  test("the trigger resolves: Akali — not 'here' and not in combat — is an illegal recipient and is not even offered (359.3.e.5); the ONLY recipient is Skulker and the pool is still the full 5 (355.14.e); no other unit can be added (355.15)", async () => {
    const game = await akaliFlashedOut();
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    if (d?.seat === P1 && (d.kind === "pick" || d.kind === "distribute")) {
      expect(splitCandidates(game)).toEqual(["skulker"]);
      if (d.kind === "distribute") {
        expect(d.total).toBe(5);
        // Trying to sneak damage onto Akali is refused.
        expect((await game.p1.try((p) => p.distribute({ akali: 1, skulker: 4 }))).ok).toBe(false);
        await game.p1.distribute({ skulker: 5 });
      } else {
        await game.p1.pick("skulker");
        if (game.decision()?.kind === "distribute") {
          await game.p1.distribute({ skulker: 5 });
        }
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("akali")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.zoneOf("skulker")).toBe("trash");
    const hits = (game.gameState.damageLog ?? []).filter((r) => !r.combat);
    expect(hits).toEqual([expect.objectContaining({ amount: 5, target: "skulker" })]);
    expect(hits.some((r) => r.target === "akali")).toBe(false);
  });

  test("aftermath: with Skulker dead and Akali home no Defender remains — the showdown closes without combat damage and Volibear conquers bf1 (P1 +1); Akali sits undamaged in P2's base", async () => {
    const game = await akaliFlashedOut();
    await game.settle({ policy: "first" }); // takes the forced all-to-Skulker split, then passes Focus around
    expect((game.gameState.damageLog ?? []).filter((r) => r.combat)).toEqual([]);
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.state("akali")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("voli")).toMatchObject({ combatRole: null, damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
