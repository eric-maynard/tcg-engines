/**
 * Interaction: Kayn, Unleashed (ogn-189-298) · Champion Unit · Chaos · 6 Might
 *     "[Ganking] / If I have moved twice this turn, I don't take damage."
 *   × Lotus Trap (unl-013-219) · Spell · Fury · [Hidden] [Reaction]
 *     "Choose a unit. Double all damage that would be dealt to it this turn."
 *   × Gem Jammer (sfd-007-221) · Unit · Fury · 2 · 2 Might
 *     "When you play me, give a unit [Ganking] this turn."
 *   with Vanguard Sergeant (ogn-219-298, 4), Playful Phantom (ogn-049-298, 5), Mystic Poro
 *   (ogn-171-298, 2) and Hextech Ray (ogn-009-298, "Deal 3 to a unit at a battlefield").
 *
 * Rules: 465.2.c.10 (a unit that cannot be dealt damage has no lethal amount and is exempt from
 * mandatory-assignment ordering — Kayn is the rulebook's example), 465.2.c.3 (lethal in full before
 * the next unit), 465.2.c.4.a + 465.2.c.5 (replacements such as Double apply AT ASSIGNMENT: the
 * minimum assigned value that becomes lethal), 417.1.e.1 (only valid damage is dealt), 432.1
 * (doubling), 437.5.b (no lethal amount when nothing can be dealt), 466.5.b (nobody left → uncontrolled).
 *
 * Q: P1 plays Gem Jammer giving Sergeant Ganking, moves Kayn + Sergeant base → empty bfA (move 1), then
 *    both bfA → bfB (move 2) into P2's Phantom (5) + Poro (2). In the showdown P2 flips Lotus Trap onto
 *    Kayn and Hextech Rays him.
 *   (a) Does doubled spell damage hurt a twice-moved Kayn?          → No: nothing can be dealt, 2×0 = 0.
 *   (b) How must P2 assign the defenders' 7?                        → Lethal 4 on Sergeant first (the only
 *       unit "in consideration"); the rest is free; never "all 7 on Kayn". Sergeant dies, Kayn 0,
 *       Phantom + Poro die to 10, Kayn conquers bfB.
 *   (c) Contrast — Kayn moved only once:                             → no immunity; Lotus Trap doubles at
 *       assignment, so 3 assigned is already lethal (→6): with Sergeant along the 7 kills BOTH (3+4);
 *       and Ray alone (3→6) kills him.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, DistributeDecision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KAYN = "ogn-189-298";
const LOTUS_TRAP = "unl-013-219";
const GEM_JAMMER = "sfd-007-221";
const VANGUARD_SERGEANT = "ogn-219-298";
const PLAYFUL_PHANTOM = "ogn-049-298";
const MYSTIC_PORO = "ogn-171-298";
const HEXTECH_RAY = "ogn-009-298";

/**
 * P1's turn. P1: Kayn + Sergeant in base, Gem Jammer in hand with exactly its 2 energy; bfA is P1's
 * and empty, bfB is P2's with Phantom + Poro and a face-down Lotus Trap. P2: Hextech Ray in hand with
 * exactly 1 + [fury].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 1, power: { fury: 1 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "base", KAYN, "kayn")
    .unit(P1, "base", VANGUARD_SERGEANT, "sarge")
    .unit(P2, "bfB", PLAYFUL_PHANTOM, "phantom")
    .unit(P2, "bfB", MYSTIC_PORO, "poro")
    .facedown(P2, "bfB", LOTUS_TRAP, "trap")
    .hand(P2, HEXTECH_RAY, "ray")
    .hand(P1, GEM_JAMMER, "jammer");
}

/** Same forces, but Kayn + Sergeant already stand (ready) at bfA — one move takes them to bfB. */
function boardMovedOnce(withTrap = true) {
  const b = scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 1, power: { fury: 1 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", KAYN, "kayn")
    .unit(P1, "bfA", VANGUARD_SERGEANT, "sarge")
    .unit(P2, "bfB", PLAYFUL_PHANTOM, "phantom")
    .unit(P2, "bfB", MYSTIC_PORO, "poro")
    .hand(P2, HEXTECH_RAY, "ray")
    .hand(P1, GEM_JAMMER, "jammer");
  return withTrap ? b.facedown(P2, "bfB", LOTUS_TRAP, "trap") : b;
}

/** Gem Jammer → base; its play trigger gives Sergeant [Ganking] this turn. */
async function jamSergeant(game: Game): Promise<void> {
  await game.p1.play("jammer", { to: "base" });
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("sarge");
  await game.settle();
  expect(game.state("sarge").keywords).toContain("Ganking");
}

/**
 * Move 1: both base → bfA (P1's own, empty — no showdown). They arrive exhausted; the question has them
 * move again, so they are readied here (stand-in for any ready effect — HOW they get ready is not what
 * is under test). Move 2: both bfA → bfB (battlefield → battlefield needs Ganking) opens the combat showdown.
 */
async function doubleMoveIntoB(game: Game, units: string[] = ["kayn", "sarge"]): Promise<void> {
  await game.p1.move(units, "bfA");
  for (const u of units) {
    expect(game.locationOf(u)).toBe("bfA");
    await game.p1.do("readyCard", { cardId: u });
  }
  await game.p1.move(units, "bfB");
  for (const u of units) {
    expect(game.locationOf(u)).toBe("bfB");
  }
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
}

/** P1 passes Focus; P2 flips the face-down Lotus Trap choosing Kayn; it resolves (P2, then P1 pass). */
async function flipTrapOnKayn(game: Game): Promise<void> {
  await game.p1.passFocus();
  expect(game.p2.can("reveal", "trap")).toBe(true);
  await game.p2.reveal("trap");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 });
  await game.p2.pick("kayn");
  expect(game.chain().map((c) => c.cardId)).toEqual(["trap"]);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("trap")).toBe("trash");
  expect(game.state("kayn").grantedKeywords).toContainEqual(expect.objectContaining({ duration: "turn", keyword: "DoubleIncomingDamage" }));
}

/** Whoever holds Focus passes until P2 may cast Hextech Ray; P2 Rays Kayn and it resolves. */
async function rayKayn(game: Game): Promise<void> {
  for (let i = 0; i < 4 && !game.p2.can("cast", "ray"); i++) {
    await game.acting().pass();
  }
  await game.p2.cast("ray", { targets: "kayn" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("ray")).toBe("trash");
}

/** Pass Focus around until the showdown closes; stop at the first combat-damage prompt (if any) or the open main phase. */
async function closeShowdown(game: Game): Promise<Decision | null> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main" || !d.passKey) {
      return d;
    }
    await game.seat(d.seat).pass();
  }
  return game.decision();
}

describe("Kayn (moved twice: can't be dealt damage) × Lotus Trap × combat-damage assignment", () => {
  test("setup: Gem Jammer grants Sergeant Ganking; Kayn + Sergeant move base→bfA→bfB (two moves each) and attack Phantom + Poro; P2 can flip Lotus Trap onto Kayn for free", async () => {
    const game = await board().build();
    await jamSergeant(game);
    expect(game.p1.energy()).toBe(0);
    expect(game.state("sarge").grantedKeywords).toEqual([{ duration: "turn", keyword: "Ganking", value: undefined }]);
    await doubleMoveIntoB(game);
    expect(game.state("kayn").combatRole).toBe("attacker");
    expect(game.state("sarge").combatRole).toBe("attacker");
    expect(game.gameState.battlefields.bfB?.contested).toBe(true);
    const p2Before = game.p2.resources();
    await flipTrapOnKayn(game);
    expect(game.p2.resources()).toEqual(p2Before); // played from face-down for [0]
  });

  // Expected: with Gem Jammer's play trigger on the chain and P1 holding priority, P2 has NO action —
  // a face-down card is played as a [Reaction] (811.6), i.e. only by the player with Priority (312.1.a, 338.1). Actual: the
  // engine offers P2 `revealHidden:trap` alongside P1's priority (harness invariant singleDecisionCursor).
  test("P2's face-down Lotus Trap is offered for reveal while P1 holds priority over Gem Jammer's trigger — only the player with Priority may act (811.6, 312.1.a, 338.1)", async () => {
    const game = await board().build();
    await game.p1.play("jammer", { to: "base" });
    await game.p1.pick("sarge");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p2.can("reveal", "trap")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("(a) Hextech Ray at a twice-moved Kayn under Lotus Trap: 3 doubled is still nothing DEALT — 0 damage marked, Kayn stays at bfB (465.2.c.10, 417.1.e.1)", async () => {
    const game = await board().build();
    await jamSergeant(game);
    await doubleMoveIntoB(game);
    await flipTrapOnKayn(game);
    await rayKayn(game);
    expect(game.zoneOf("kayn")).toBe("battlefield-bfB");
    expect(game.state("kayn").damage).toBe(0);
    expect(game.state("kayn").might).toBe(6);
  });

  test("(a) contrast: Kayn moved only ONCE is not immune — the same Lotus Trap + Hextech Ray is 3→6 and kills him outright", async () => {
    const game = await boardMovedOnce().build();
    await game.p1.gank("kayn", "bfB"); // his first and only move this turn
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await flipTrapOnKayn(game);
    await rayKayn(game);
    expect(game.zoneOf("kayn")).toBe("trash");
  });

  test("(b) full line: after Trap + Ray, combat resolves — Sergeant takes the lethal 4 (+ the rest) and dies, Kayn is dealt nothing; the attackers' 10 kills Phantom and Poro; Kayn alone holds bfB and conquers", async () => {
    const game = await board().build();
    const p1Points = game.p1.points();
    await jamSergeant(game);
    await doubleMoveIntoB(game);
    await flipTrapOnKayn(game);
    await rayKayn(game);
    const stop = await closeShowdown(game);
    // P1's 10 ≥ 5 + 2 and P2's 7 has a single unit in consideration → no real choice on either side;
    // if the engine still asks, take its (rules-legal) default line.
    if (stop?.kind === "distribute") {
      await game.settle();
    }
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.zoneOf("phantom")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("kayn")).toBe("battlefield-bfB");
    expect(game.state("kayn").damage).toBe(0);
    expect(game.p1.units("bfB")).toEqual(["kayn"]);
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.gameState.battlefields.bfB?.contested).toBe(false);
    expect(game.p1.points()).toBe(p1Points + 1);
  });

  test("(b) P2's 7 cannot be 'satisfied' on Kayn: with only Sergeant in consideration the assignment is forced (no way to give Sergeant less than lethal); an all-on-Kayn answer is never accepted", async () => {
    const game = await board().build();
    await jamSergeant(game);
    await doubleMoveIntoB(game);
    await flipTrapOnKayn(game);
    let p2Asked: DistributeDecision | undefined;
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "distribute") {
        if (d.seat === P2) {
          p2Asked = d;
          break;
        }
        await game.seat(d.seat).distribute({ ...(d.defaultAllocation ?? {}) });
        continue;
      }
      if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
        continue;
      }
      break;
    }
    if (p2Asked) {
      // Kayn has no lethal amount (465.2.c.10 / 437.5.b) and Sergeant's is 4.
      expect(p2Asked.buckets.find((b) => b.card === "kayn")?.lethal).toBeUndefined();
      expect(p2Asked.buckets.find((b) => b.card === "sarge")?.lethal).toBe(4);
      expect(p2Asked.defaultAllocation?.sarge ?? 0).toBeGreaterThanOrEqual(4);
      expect((await game.p2.try((p) => p.distribute({ kayn: 7 }))).ok).toBe(false);
      expect((await game.p2.try((p) => p.distribute({ kayn: 4, sarge: 3 }))).ok).toBe(false);
      await game.p2.distribute({ ...(p2Asked.defaultAllocation ?? {}) });
    }
    await game.settle();
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.state("kayn").damage).toBe(0);
    expect(game.zoneOf("kayn")).toBe("battlefield-bfB");
  });

  test("(b) made observable with a second damageable attacker (Buddy, 4, Ganking): P2 IS asked, the units 'in consideration' are exactly Sergeant + Buddy (lethal 4 each) — Kayn carries no lethal amount — and 'all 7 on Kayn' / 'Kayn before a lethal' are rejected while 'lethal on one, rest on the other' is accepted", async () => {
    const game = await board().unit(P1, "base", { keywords: ["Ganking"], might: 4, name: "Buddy" }, "buddy").build();
    await jamSergeant(game);
    await doubleMoveIntoB(game, ["kayn", "sarge", "buddy"]);
    await flipTrapOnKayn(game);
    const stop = await closeShowdown(game);
    // P1's 14 covers 5 + 2 → forced; P2's 7 < 4 + 4 with two candidates → a real decision for P2.
    let d = stop;
    if (d?.kind === "distribute" && d.seat === P1) {
      await game.p1.distribute({ ...(d.defaultAllocation ?? {}) });
      d = game.decision();
    }
    expect(d).toMatchObject({ kind: "distribute", seat: P2, total: 7 });
    const asked = d as DistributeDecision;
    const withLethal = asked.buckets.filter((b) => b.lethal !== undefined).map((b) => [b.card, b.lethal]);
    expect(withLethal.sort()).toEqual([["buddy", 4], ["sarge", 4]]);
    expect(asked.buckets.find((b) => b.card === "kayn")?.lethal).toBeUndefined();
    expect((await game.p2.try((p) => p.distribute({ kayn: 7 }))).ok).toBe(false);
    expect((await game.p2.try((p) => p.distribute({ kayn: 3, sarge: 2, buddy: 2 }))).ok).toBe(false); // nobody lethal
    await game.p2.distribute({ buddy: 3, sarge: 4 });
    await game.settle();
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.zoneOf("buddy")).toBe("battlefield-bfB"); // 3 < 4, healed at cleanup
    expect(game.state("buddy").damage).toBe(0);
    expect(game.state("kayn").damage).toBe(0);
    expect(game.zoneOf("phantom")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
  });

  // ── (c) moved once: no immunity, and Lotus Trap now matters at ASSIGNMENT ─────────────────────
  test("(c) Kayn moved once WITH Sergeant, Lotus Trap on Kayn: doubling applies at assignment, so 3 is Kayn's minimum lethal (→6) and the remaining 4 is exactly Sergeant's — P2's 7 kills BOTH attackers; the 10 kills both defenders; nobody remains → bfB uncontrolled, no points (465.2.c.4.a/.c.5, 466.5.b)", async () => {
    const game = await boardMovedOnce().build();
    await jamSergeant(game);
    await game.p1.move(["kayn", "sarge"], "bfB"); // ONE move (bfA → bfB) for each
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await flipTrapOnKayn(game);
    const stop = await closeShowdown(game);
    let d = stop;
    if (d?.kind === "distribute" && d.seat === P1) {
      await game.p1.distribute({ ...(d.defaultAllocation ?? {}) });
      d = game.decision();
    }
    if (d?.kind === "distribute" && d.seat === P2) {
      // If asked at all, Kayn's lethal is the ASSIGNED 3, not 6.
      expect((d as DistributeDecision).buckets.find((b) => b.card === "kayn")?.lethal).toBe(3);
      await game.p2.distribute({ kayn: 3, sarge: 4 });
    }
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("kayn")).toBe("trash");
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.zoneOf("phantom")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.gameState.battlefields.bfB?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("(c) control without Lotus Trap: the same 7 can only make ONE of Kayn (6) / Sergeant (4) lethal — P2 is asked (lethal 6 and 4); the very split that killed both above (3 / 4) now kills only Sergeant, Kayn survives and conquers bfB", async () => {
    const game = await boardMovedOnce(false).build();
    await jamSergeant(game);
    await game.p1.move(["kayn", "sarge"], "bfB");
    const stop = await closeShowdown(game);
    let d = stop;
    if (d?.kind === "distribute" && d.seat === P1) {
      await game.p1.distribute({ ...(d.defaultAllocation ?? {}) });
      d = game.decision();
    }
    expect(d).toMatchObject({ kind: "distribute", seat: P2, total: 7 });
    const asked = d as DistributeDecision;
    expect(asked.buckets.map((b) => [b.card, b.lethal]).sort()).toEqual([["kayn", 6], ["sarge", 4]]);
    await game.p2.distribute({ kayn: 3, sarge: 4 }); // legal: Sergeant lethal in full, 3 spill on Kayn (undoubled → not lethal)
    await game.settle();
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.zoneOf("kayn")).toBe("battlefield-bfB");
    expect(game.zoneOf("phantom")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
  });

  test("(c) control without Lotus Trap, the other legal line: 6 on Kayn (+1 on Sergeant) kills Kayn only — so it is Lotus Trap that turned 7 into two kills above", async () => {
    const game = await boardMovedOnce(false).build();
    await jamSergeant(game);
    await game.p1.move(["kayn", "sarge"], "bfB");
    let d = await closeShowdown(game);
    if (d?.kind === "distribute" && d.seat === P1) {
      await game.p1.distribute({ ...(d.defaultAllocation ?? {}) });
      d = game.decision();
    }
    expect(d).toMatchObject({ kind: "distribute", seat: P2, total: 7 });
    expect((await game.p2.try((p) => p.distribute({ kayn: 7 }))).ok).toBe(false); // 465.2.c.4: no more than lethal while Sergeant remains
    await game.p2.distribute({ kayn: 6, sarge: 1 });
    await game.settle();
    expect(game.zoneOf("kayn")).toBe("trash");
    expect(game.zoneOf("sarge")).toBe("battlefield-bfB");
    expect(game.state("sarge").damage).toBe(0);
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
  });
});
