/**
 * Interaction: Blind Monk (ogn-257-298) · Legend (Lee Sin) · Calm/Body
 *                "[1], [Exhaust]: Buff a friendly unit." — NO [Action]/[Reaction] tag
 *            × Seal of Rage (ogn-040-298) · Gear · Fury · 0 · "[Exhaust]: [Reaction] — [Add] [fury]."
 *            × Cleave (ogn-004-298) · Spell · Fury · 1 · "[Action] Give a unit [Assault 3] this turn."
 *
 * Question (the common table one): "It's MY turn, I attacked, I have Focus AND Priority and 1 energy open —
 * can I Blind Monk my attacker for +1 before damage?" P1's vanilla 4-Might attacker A moves into P2's bfA
 * held by a vanilla 4-Might defender D; no triggers → P1 (attacker) has Focus + Priority in the Showdown
 * Open state on P1's own turn.
 *   (a) Is Blind Monk activatable in the Showdown Open state?
 *   (b) Is Seal of Rage? Does using it move Focus/Priority?
 *   (c) Is Cleave? After Cleave's chain closes, who has Focus?
 *   (d) After combat, back in Neutral Open: is Blind Monk activatable now — and could P2's identical Blind
 *       Monk ever be used during P1's turn?
 *
 * Rules: 308.1.a / 343.1.b / 313.1.a (in a Showdown only Action/Reaction-tagged cards AND abilities;
 * Focus + Priority + own turn do not lift that), 358.4 (timing permission check), 813.1.c.2 / 813.2
 * (Reaction-tagged ability is legal in showdowns), 337.2 / 429.2 / 429.2.a (an [Add] ability resolves on
 * finalization; Priority and Focus do not pass), 346.1 (chain opened by an Add ability → Focus stays),
 * 347.1 / 806.1.b (Action spell with Focus), 313.3 (passing Priority keeps Focus), 346 / 347.1.b (played-
 * card chain closes → Focus passes to the next player, with Priority), 313.4 (no Focus+Priority → nothing to
 * do), 466.1.a.1 (Combat Cleanup heals), 313.5 (Neutral → nobody has Focus), 335 / 312.2.a (turn player's
 * priority in Neutral Open Main Phase), 410.1.a (untagged activation = Discretionary Action: own turn,
 * Neutral Open only).
 *
 * Expected: (a) No — not even offered; an attempt is rejected, nothing paid. (b) Yes; +1 fury; P1 keeps
 * Focus and Priority, chain stays empty. (c) Yes; (P1 closed) → P1 pass → P2 pass → resolves, A is 7; Focus
 * (and Priority) pass to P2 on P1's turn, P1's menu is empty; P2 pass, P1 pass → combat: 7 kills D, A takes
 * 4 < 7 and is healed in the Combat Cleanup → A conquers bfA, P1 +1. (d) Neutral Open: focus none, P1 acts;
 * Blind Monk is now legal for P1 (1 energy left). P2's Blind Monk: never on P1's turn — not in Neutral Open,
 * not in the showdown even while P2 held Focus.
 */
import { describe, expect, test } from "bun:test";
import type { ActionDecision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLIND_MONK = "ogn-257-298";
const SEAL_OF_RAGE = "ogn-040-298";
const CLEAVE = "ogn-004-298";

/**
 * P1's turn 2, main phase. P1: Blind Monk legend (ready), ready Seal of Rage in base, Cleave in hand,
 * 2 energy (1 for Cleave + "1 open" for the Monk), attacker A (4) in base. P2: its own Blind Monk (ready),
 * 1 energy and a friendly unit in base (so only TIMING can stop P2's Monk), defender D (4) holding bfA.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 1 })
    .legend(P1, BLIND_MONK, "monk")
    .legend(P2, BLIND_MONK, "theirMonk")
    .gear(P1, SEAL_OF_RAGE, "seal")
    .battlefield("bfA", { controller: P2 })
    .unit(P1, "base", { might: 4, name: "Attacker A" }, "A")
    .unit(P2, "bfA", { might: 4, name: "Defender D" }, "D")
    .unit(P2, "base", { might: 1, name: "Squire" }, "squire")
    .hand(P1, CLEAVE, "cleave");
}

/** A attacks bfA: the combat showdown opens with P1 holding Focus + Priority (no triggers). */
async function attacking(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("A", "bfA");
  const d = game.decision() as ActionDecision;
  expect(d).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.chain()).toEqual([]);
  return game;
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

describe("Blind Monk (untagged legend ability) mid-showdown on its controller's own turn — vs Seal of Rage [Reaction] and Cleave [Action]", () => {
  test("baseline — Neutral Open on P1's turn before attacking: Blind Monk, Seal of Rage and Cleave are all legal for P1; P2's Blind Monk is not (312.2.a)", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "monk")).toBe(true);
    expect(game.p1.can("activate", "seal")).toBe(true);
    expect(game.p1.can("cast", "cleave")).toBe(true);
    expect(game.p2.can("activate", "theirMonk")).toBe(false);
  });

  test("setup — after the move it is a combat showdown at bfA, P1 is the attacker with Focus AND Priority on P1's own turn, 2 energy in pool", async () => {
    const game = await attacking();
    expect(game.turnPlayer()).toBe(P1);
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bfA", focusPlayer: P1, isCombatShowdown: true });
    expect(game.actingSeat()).toBe(P1);
    expect(game.state("A")).toMatchObject({ combatRole: "attacker", location: "bfA", might: 4 });
    expect(game.p1.energy()).toBe(2);
  });

  // ---------------------------------------------------------------- (a) Blind Monk in the showdown

  test("(a) NO: Blind Monk has no [Action]/[Reaction] → not offered in the Showdown Open state despite Focus + Priority + own turn (308.1.a / 343.1.b / 313.1.a); Seal and Cleave ARE offered", async () => {
    const game = await attacking();
    expect(game.p1.can("activate", "monk")).toBe(false);
    const keys = game.p1.legal().map((o) => o.key);
    expect(keys).not.toContain("activateAbility:monk#0");
    expect(keys).toContain("activateAbility:seal#0");
    expect(keys).toContain("playSpell:cleave");
  });

  test("(a) forcing it is rejected and nothing is paid: legend still ready, energy untouched, A unbuffed, still P1's Focus (358.4)", async () => {
    const game = await attacking();
    const r = await game.p1.try((p) => p.activate("monk", 0, { targets: "A" }));
    expect(r.ok).toBe(false);
    expect(game.state("monk").isExhausted).toBe(false);
    expect(game.p1.energy()).toBe(2);
    expect(game.state("A")).toMatchObject({ isBuffed: false, might: 4 });
    expect(game.chain()).toEqual([]);
    expect(showdown(game)?.focusPlayer).toBe(P1);
    expect(game.actingSeat()).toBe(P1);
  });

  // ---------------------------------------------------------------- (b) Seal of Rage in the showdown

  test("(b) YES: Seal of Rage is [Reaction] → legal; as an [Add] ability it resolves on finalization: +1 fury, Seal exhausted, chain empty, and P1 STILL has Focus and Priority (429.2.a / 346.1)", async () => {
    const game = await attacking();
    expect(game.p1.can("activate", "seal")).toBe(true);
    await game.p1.activate("seal");
    expect(game.p1.power("fury")).toBe(1);
    expect(game.state("seal").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(showdown(game)?.focusPlayer).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    // …and the Monk is still not on the menu afterwards.
    expect(game.p1.can("activate", "monk")).toBe(false);
  });

  // ---------------------------------------------------------------- (c) Cleave in the showdown

  test("(c) YES: Cleave is [Action] with Focus → goes on the chain (1 energy paid, 1 left open); P1 holds priority first (closed), P1 pass → P2 priority, Focus stays with P1 meanwhile (313.3)", async () => {
    const game = await attacking();
    await game.p1.cast("cleave", { targets: "A" });
    expect(game.p1.energy()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cleave", controller: P1, targets: ["A"] })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    // Even in the closed state with 1 energy open, the Monk is not an option.
    expect(game.p1.can("activate", "monk")).toBe(false);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(showdown(game)?.focusPlayer).toBe(P1);
  });

  test("(c) P2 pass → Cleave resolves: A is a 7-Might attacker (Assault 3); the played-card chain closed → Focus AND Priority pass to P2 on P1's turn; P1's menu is empty (346 / 347.1.b / 313.4)", async () => {
    const game = await attacking();
    await game.p1.cast("cleave", { targets: "A" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("A").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.state("A").might).toBe(7);
    expect(game.turnPlayer()).toBe(P1);
    expect(showdown(game)?.focusPlayer).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.legal()).toEqual([]);
    // P2 now has Focus + Priority in a showdown — and STILL cannot use its own untagged Blind Monk (343.1.b).
    expect(game.p2.can("activate", "theirMonk")).toBe(false);
  });

  test("(c) P2 passes Focus → back to P1; P1 passes → showdown closes, combat: 7 into D (4) kills it; A takes 4 < 7, is healed in the Combat Cleanup and conquers bfA → P1 +1 (466.1.a.1 / 466.5)", async () => {
    const game = await attacking();
    await game.p1.cast("cleave", { targets: "A" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.pass();
    await game.settle();
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.state("A")).toMatchObject({ damage: 0, location: "bfA", zone: "battlefield-bfA" });
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // ---------------------------------------------------------------- (d) after combat: Neutral Open

  /** Full line: attack, Cleave, everyone passes, combat resolves → P1's Neutral Open main phase. */
  async function afterCombat(): Promise<Game> {
    const game = await attacking();
    await game.p1.cast("cleave", { targets: "A" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    return game;
  }

  test("(d) combat over → Neutral Open: no showdown / nobody has Focus (313.5), turn player P1 holds the main-phase decision (335 / 312.2.a), A is a plain 4 again off-attack", async () => {
    const game = await afterCombat();
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("A")).toMatchObject({ combatRole: null, might: 4 });
    expect(game.p1.energy()).toBe(1);
  });

  test("(d) NOW Blind Monk is a legal Discretionary Action for P1 (410.1.a): [1] + exhaust, P2 gets priority, resolves → A buffed to 5", async () => {
    const game = await afterCombat();
    expect(game.p1.can("activate", "monk")).toBe(true);
    await game.p1.activate("monk", 0, { targets: "A" });
    expect(game.p1.energy()).toBe(0);
    expect(game.state("monk").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "monk", controller: P1 })]);
    await game.settle();
    expect(game.state("A")).toMatchObject({ isBuffed: true, might: 5 });
  });

  test("(d) P2's identical Blind Monk can NEVER be used during P1's turn: not in Neutral Open (no priority — P2 has no menu at all), and it was not usable in the showdown either, even while P2 held Focus + Priority", async () => {
    const game = await afterCombat();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p2.can("activate", "theirMonk")).toBe(false);
    expect(game.p2.legal()).toEqual([]);
    expect((await game.p2.try((p) => p.activate("theirMonk", 0, { targets: "squire" }))).ok).toBe(false);
    expect(game.state("theirMonk").isExhausted).toBe(false);
    expect(game.p2.energy()).toBe(1);
    // Control: on P2's own turn, in Neutral Open, the same legend ability is fine.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 1 });
    await game.p1.do("addResources", { energy: 1 });
    expect(game.p2.can("activate", "theirMonk")).toBe(true);
    expect(game.p1.energy()).toBe(1);
    expect(game.state("monk").isExhausted).toBe(false);
    expect(game.p1.can("activate", "monk")).toBe(false); // and now P1's (ready, funded) is the off-turn one
  });
});
