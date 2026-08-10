/**
 * Interaction: Mirror Image (unl-200-219) · Spell · Mind/Order · 3 + [mind][order] · Action · "Choose a unit. Play a ready
 *     Reflection unit token to your base. It becomes a copy of that unit. Give it [Temporary]. (Kill it at the start of
 *     its controller's Beginning Phase, before scoring.)"
 *   × Zed, Without a Sound (ven-112a-166) · Unit · Chaos · 5 · 5 Might · "When I conquer, play a 0 [Might] Shadow Clone unit
 *     token to your base. …" — and the Shadow Clone token itself (187.11): "When I attack, you may banish a unit from your
 *     trash. If you do, give me [Assault 4] this turn."
 *   with Vicious Snapjaws (unl-129-219, "When another friendly unit dies, gain 1 XP.") in P1's base as a death witness, P2's
 *   inline 5-Might "Big X" (cost 4) as the copied unit, and inline P2 blockers Speedbump (1) / Guard (3) / Sentinel (3).
 *
 * Rules: 182 / 183 (a token's controller AND owner = the player whose effect created it — P1, although it copies P2's
 * unit), 184.1 ("play a READY Reflection"), 184.3 (granted Temporary), 185.1.a (a copy never stops being a token), 477.1.b
 * (layer-1 copy: X's name / cost / Might / text), 816.1.b (Temporary = "at the start of its controller's Beginning Phase,
 * kill this"), 428.1 (that is a genuine kill → 'dies' triggers fire), 186.1 (a token put into a non-board zone ceases to
 * exist immediately — the trash never holds it), 187.11 (Shadow Clone's attack trigger banishes a UNIT from YOUR trash;
 * "if you do" gates the Assault).
 *
 * Question — timeline: turn N P1 reflects P2's Big X; N+2 Temporary kills the Reflection, then Zed conquers → Shadow Clone;
 * N+4 the Clone attacks a defended battlefield.
 *   (a) The Reflection's owner/controller/zone/existence/identity at creation, at the Temporary kill, and afterwards — is
 *       that kill a real death (Snapjaws gains XP)? Does being a copy of card X let it sit in the trash as 'X'?
 *   (b) When the Clone attacks, is there any unit in P1's trash to banish (the Reflection? Mirror Image?) — Assault 4?
 *   (c) Contrast: a real P1 unit card died instead → Assault 4? And a Clone that itself died — can a second Clone banish IT?
 *
 * Expected: (a) P1/P1/base/ready/exists, 'Big X' 5 Might cost 4 + Temporary, still a token; the Temporary kill is a real
 * death (Snapjaws +1 XP) after which it exists nowhere — P1's trash holds only Mirror Image. (b) nothing to banish → no
 * Assault, the Clone attacks at 0 and dies; it too ceases to exist. (c) a real dead unit card CAN be banished → Assault 4
 * (the 4-Might Clone even beats the 3-Might Guard); a dead Clone is never in the trash, so Clone #2 finds nothing either.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MIRROR_IMAGE = "unl-200-219";
const ZED_WITHOUT_A_SOUND = "ven-112a-166";
const VICIOUS_SNAPJAWS = "unl-129-219";

/**
 * Turn 2 (= N), P1 active. P2: Speedbump (1) holding bf1, Guard (3) holding bf2, Sentinel (3) holding bf3, Big X (5 Might,
 * cost 4) in base. P1: Zed + a second Zed + Vicious Snapjaws in base, Mirror Image in hand with exactly 3 + [mind][order].
 * P1's trash starts EMPTY.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Speedbump" }, "bump")
    .unit(P2, "bf2", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "bf3", { might: 3, name: "Sentinel" }, "sentinel")
    .unit(P2, "base", { energyCost: 4, might: 5, name: "Big X" }, "x")
    .unit(P1, "base", ZED_WITHOUT_A_SOUND, "zed")
    .unit(P1, "base", ZED_WITHOUT_A_SOUND, "zed2")
    .unit(P1, "base", VICIOUS_SNAPJAWS, "jaws")
    .resources(P1, { energy: 3, power: { mind: 1, order: 1 } })
    .hand(P1, MIRROR_IMAGE, "mirror");
}

const tokensIn = (game: Game, ids: readonly string[]) => ids.filter((id) => game.state(id).isToken);

/** Turn N: Mirror Image on Big X resolves → the Reflection's id. */
async function reflected(): Promise<{ game: Game; refl: string }> {
  const game = await board().build();
  await game.p1.cast("mirror", { targets: "x" });
  await game.settle();
  const fresh = tokensIn(game, game.p1.units("base"));
  expect(fresh).toHaveLength(1);
  return { game, refl: fresh[0] as string };
}

/** …turn N+2 (P1's main phase, after Temporary killed the Reflection): Zed conquers bf1 → Shadow Clone #1's id. */
async function cloned(): Promise<{ game: Game; refl: string; clone: string }> {
  const { game, refl } = await reflected();
  await game.advanceTurn(); // → P2 (turn 3)
  await game.advanceTurn(); // → P1 (turn 4 = N+2): Beginning Phase kills the Reflection, then main phase
  expect(game.turnPlayer()).toBe(P1);
  await game.p1.move("zed", "bf1"); // 5 into Speedbump (1) → wins → conquers → "When I conquer"
  await game.settle();
  const clones = tokensIn(game, game.p1.units("base"));
  expect(clones).toHaveLength(1);
  return { clone: clones[0] as string, game, refl };
}

/** …turn N+4: the (now ready) Clone attacks Guard at bf2. Stops right after the move, before anything is answered. */
async function cloneAttacks(): Promise<{ game: Game; refl: string; clone: string }> {
  const r = await cloned();
  await r.game.advanceTurn(); // → P2 (turn 5)
  await r.game.advanceTurn(); // → P1 (turn 6 = N+4)
  expect(r.game.state(r.clone)).toMatchObject({ isReady: true, location: "base" });
  await r.game.p1.move(r.clone, "bf2");
  return r;
}

/** True when the seat is being offered an accept-able "you may" right now. */
function offeredOptIn(game: Game): boolean {
  const d = game.decision();
  return d?.kind === "yes-no" && d.seat === P1 && d.canAccept !== false;
}

describe("Mirror Image Reflection (Temporary) × Zed's Shadow Clone — a dead token is not 'a unit in your trash'", () => {
  // ── (a) the Reflection's life cycle ───────────────────────────────────────────────────────────────

  test("(a) creation: a READY unit TOKEN in P1's base, owner P1 + controller P1 (182/183) although it copies P2's unit; layer-1 copy → 'Big X', 5 Might, cost 4, plus granted [Temporary]; Big X itself untouched; P1's trash = [Mirror Image]", async () => {
    const { game, refl } = await reflected();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0, order: 0 } });
    expect(game.state(refl)).toMatchObject({
      baseMight: 5,
      controller: P1,
      energyCost: 4,
      isReady: true,
      isToken: true,
      location: "base",
      might: 5,
      name: "Big X",
      owner: P1,
      zone: "base",
    });
    expect(game.state(refl).keywords).toContain("Temporary");
    expect(game.state(refl).grantedKeywords).toContainEqual(expect.objectContaining({ keyword: "Temporary" }));
    expect(game.state("x")).toMatchObject({ controller: P2, might: 5, owner: P2, zone: "base" });
    expect(game.p1.trash()).toEqual(["mirror"]);
    expect(game.p1.xp()).toBe(0);
  });

  test("(a) it survives P2's turn ('its CONTROLLER's Beginning Phase' = P1's); at the start of P1's turn N+2 Temporary's 'kill this' is a triggered chain item from the token during the Beginning Phase (816.1.b)", async () => {
    const { game, refl } = await reflected();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state(refl)).toMatchObject({ controller: P1, name: "Big X", zone: "base" });
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: refl, controller: P1, triggered: true })]);
    expect(game.has(refl)).toBe(true); // not dead until it resolves
  });

  test("(a) the Temporary kill is a REAL death (428.1): Vicious Snapjaws' 'when another friendly unit dies' fires (+1 XP) — and the token then ceases to exist (186.1): not on the board, not in EITHER trash, no 'Big X' card anywhere in P1's zones", async () => {
    const { game, refl } = await reflected();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.xp()).toBe(1);
    expect(game.has(refl)).toBe(false);
    expect(game.zoneOf(refl)).toBe("gone");
    expect(game.p1.units()).not.toContain(refl);
    expect(game.p1.trash()).toEqual(["mirror"]); // a spell — no unit
    expect(game.p2.trash()).toEqual([]);
    expect([...game.p1.trash(), ...game.p1.hand(), ...game.p1.base()].some((id) => game.state(id).name === "Big X")).toBe(false);
    expect(game.state("x")).toMatchObject({ controller: P2, zone: "base" }); // the original is fine
  });

  // ── (b) the Shadow Clone's attack trigger finds nothing ───────────────────────────────────────────

  test("(b) same turn N+2: Zed conquers bf1 → a 0-Might Shadow Clone TOKEN in P1's base (exhausted, owner + controller P1); P1's trash is still just [Mirror Image]", async () => {
    const { game, clone } = await cloned();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("bump")).toBe("trash");
    expect(game.state(clone)).toMatchObject({ controller: P1, isExhausted: true, isToken: true, might: 0, name: "Shadow Clone", owner: P1, zone: "base" });
    expect(game.p1.trash()).toEqual(["mirror"]);
    expect(game.p2.trash()).toEqual(["bump"]); // P2's dead unit is in P2's trash — not "your trash" for P1
  });

  test("(b) turn N+4: the Clone attacks Guard at bf2 — with NO unit in P1's trash the 'you may banish' cannot be performed: no accept-able opt-in, nothing banished, no [Assault 4]; it fights at 0 Might", async () => {
    const { game, clone } = await cloneAttacks();
    expect(game.p1.trash()).toEqual(["mirror"]);
    expect(offeredOptIn(game)).toBe(false);
    expect(game.state(clone)).toMatchObject({ location: "bf2", might: 0 });
    expect(game.state(clone).keywords).not.toContain("Assault");
    expect(game.state(clone).grantedKeywords).toEqual([]);
    expect(game.p1.banishment()).toEqual([]);
  });

  test("(b) …so it dies in combat (0 into 3): Guard keeps bf2, and the dead Clone — a token — is likewise GONE, not in P1's trash (186.1); Snapjaws notices that death too (+1 XP)", async () => {
    const { game, clone } = await cloneAttacks();
    const xp = game.p1.xp();
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.has(clone)).toBe(false);
    expect(game.zoneOf(clone)).toBe("gone");
    expect(game.zoneOf("guard")).toBe("battlefield-bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p1.trash()).toEqual(["mirror"]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.xp()).toBe(xp + 1);
    expect(game.violations()).toEqual([]);
  });

  test("(c) a dead Clone can never fuel a later one: after Clone #1 died, Zed #2 conquers bf2 → Clone #2; on turn N+6 Clone #2 attacks Sentinel at bf3 and STILL finds no unit in P1's trash — no opt-in, no Assault, dies at 0", async () => {
    const { game, clone } = await cloneAttacks();
    await game.settle(); // Clone #1 dies
    expect(game.has(clone)).toBe(false);
    await game.p1.move("zed2", "bf2"); // 5 into Guard (3) → conquers → Clone #2
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    const second = tokensIn(game, game.p1.units("base"));
    expect(second).toHaveLength(1);
    const clone2 = second[0] as string;
    expect(clone2).not.toBe(clone);
    await game.advanceTurn(); // → P2 (turn 7)
    await game.advanceTurn(); // → P1 (turn 8 = N+6)
    expect(game.p1.trash()).toEqual(["mirror"]); // Clone #1 never arrived here
    await game.p1.move(clone2, "bf3");
    expect(offeredOptIn(game)).toBe(false);
    expect(game.state(clone2)).toMatchObject({ location: "bf3", might: 0 });
    expect(game.state(clone2).grantedKeywords).toEqual([]);
    await game.settle();
    expect(game.has(clone2)).toBe(false);
    expect(game.zoneOf("sentinel")).toBe("battlefield-bf3");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.trash()).toEqual(["mirror"]);
  });

  // ── (c) contrast: a real unit card in the trash ───────────────────────────────────────────────────

  /**
   * Contrast board (no Mirror Image): P1's real 1-Might "Martyr" dies attacking Guard on turn N, the same turn Zed conquers
   * bf1 for a Clone; on N+2 the Clone attacks Guard at bf2 with Martyr in P1's trash.
   */
  async function realCorpseThenAttack(): Promise<{ game: Game; clone: string }> {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Speedbump" }, "bump")
      .unit(P2, "bf2", { might: 3, name: "Guard" }, "guard")
      .unit(P1, "base", ZED_WITHOUT_A_SOUND, "zed")
      .unit(P1, "base", { might: 1, name: "Martyr" }, "martyr")
      .build();
    await game.p1.move("zed", "bf1");
    await game.settle();
    const clone = tokensIn(game, game.p1.units("base"))[0] as string;
    expect(clone).toBeDefined();
    await game.p1.move("martyr", "bf2"); // 1 into 3 → Martyr dies: a real card in P1's trash
    await game.settle();
    expect(game.zoneOf("martyr")).toBe("trash");
    expect(game.p1.trash()).toEqual(["martyr"]);
    await game.advanceTurn();
    await game.advanceTurn();
    await game.p1.move(clone, "bf2");
    return { clone, game };
  }

  test("(c) contrast — a REAL unit card died: the Clone's attack trigger goes on the chain and P1 IS offered the 'you may'; accepting banishes Martyr (the only unit in P1's trash) and grants [Assault 4] this turn → 4 Might as attacker", async () => {
    const { game, clone } = await realCorpseThenAttack();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: clone, controller: P1, triggered: true })]);
    expect(offeredOptIn(game)).toBe(true);
    await game.p1.yes();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: clone, targets: ["martyr"] })]); // sole legal object bound
    await game.p1.passPriority();
    await game.p2.passPriority(); // the trigger resolves inside the showdown
    expect(game.zoneOf("martyr")).toBe("banishment");
    expect(game.p1.trash()).toEqual([]);
    expect(game.state(clone).grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 4 }]);
    expect(game.state(clone).keywords).toContain("Assault");
    // (the harness CardState does not fold Assault into `might` for a 0-Might token; the combat result below proves the 4)
    expect(game.state(clone)).toMatchObject({ baseMight: 0, combatRole: "attacker", location: "bf2" });
  });

  test("(c) …and at 4 Might (0 + Assault 4 while attacking, 807.1.c) the Clone kills the 3-Might Guard and conquers bf2 (a second 'When I conquer' is Zed's, not the Clone's — no new token)", async () => {
    const { game, clone } = await realCorpseThenAttack();
    await game.p1.yes();
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.state(clone)).toMatchObject({ location: "bf2", zone: "battlefield-bf2" });
    expect(tokensIn(game, game.p1.units())).toEqual([clone]);
    expect(game.zoneOf("martyr")).toBe("banishment");
    expect(game.violations()).toEqual([]);
  });

  test("(c) declining the 'you may' instead: nothing is banished (Martyr stays in the trash), no Assault, and the 0-Might Clone dies into Guard — gone, not in the trash", async () => {
    const { game, clone } = await realCorpseThenAttack();
    await game.p1.no();
    expect(game.chain()).toEqual([]); // 383.3.a.2 — removed, considered not to have triggered
    expect(game.state(clone).grantedKeywords).toEqual([]);
    await game.settle();
    expect(game.has(clone)).toBe(false);
    expect(game.zoneOf("guard")).toBe("battlefield-bf2");
    expect(game.p1.trash()).toEqual(["martyr"]);
    expect(game.p1.banishment()).toEqual([]);
  });
});
