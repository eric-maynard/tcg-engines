/**
 * Interaction: WHEN a prevention shield is spent decides whether the attacker lives.
 *
 *   Counter Strike     (sfd-194-221) Spell · Calm/Body · [2]+[rainbow] · [Reaction]
 *     "Choose a unit. The next time that unit would be dealt damage this turn, prevent it. Draw 1."
 *   Kog'Maw, Caustic   (ogn-190-298) Unit · Chaos · [3]+[chaos] · 1 Might
 *     "[Deathknell] — Deal 4 to all units at my battlefield."
 *   Watchful Sentry    (ogn-096-298) Unit · Mind · [2] · 1 Might — "[Deathknell] — Draw 1." (the
 *     Deathknell-carrying foil for the vanilla 1-Might defender used in the last section).
 *
 * Q: P1 attacks P2's bf1 with a lone 4-Might attacker; P2's lone defender is Kog'Maw.
 *   (a) Spent during the showdown on P1's own attacker, what does the shield actually absorb?
 *   (b) Once both players pass and the showdown closes, is there ANY priority window between damage
 *       assignment and damage being dealt?
 *   (c) What opens the 466.2 window here, and can P1 play Counter Strike in it — with what result at
 *       466.3 / 466.5?
 *   (d) Contrast: a vanilla 1-Might defender with no Deathknell — how many windows exist between the
 *       showdown closing and P1 conquering?
 *
 * A: (a) The shield is consumed by the FIRST damage the attacker is dealt — Kog'Maw's single point of
 *    combat damage — so it is gone before the Deathknell fires and the Deathknell's 4 kills the
 *    attacker (465.2.c.5: prevention applies at assignment, and 1 Might can never reach lethal on a
 *    4-Might unit anyway). (b) No. The Combat Damage Step runs as Outstanding Tasks (465.1) once the
 *    showdown has CLOSED (348.1), assignment and dealing are one uninterrupted sequence
 *    (465.2.c.1 / 465.2.c.1.a), and with no chain items nobody receives priority (335). (c) The 466.2
 *    window exists only because the Deathknell was queued during the Combat Cleanup (323.4) and is now
 *    a chain item; the chain makes the state Closed (309.1) so the Reaction is legal. Prevented there,
 *    the attacker survives (its combat damage was healed by 466.1.a.1's step 3c, and 3d recalled
 *    nothing because no Defenders remained, 466.1.a.2) ⇒ P1 WON (466.3.a) ⇒ Establish Control +
 *    Conquer for a point (466.5 / 466.5.d). Without it the attacker dies, neither player has units at
 *    466.3 ⇒ No Result (466.3.d), bf1 goes Uncontrolled (466.5.b), no point. (d) With a vanilla
 *    defender there are ZERO windows: nothing enters the chain, so 466.2/466.4/466.6 pass with no
 *    priority given and P1 conquers uninterrupted.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const COUNTER_STRIKE = "sfd-194-221";
const KOGMAW = "ogn-190-298";
const WATCHFUL_SENTRY = "ogn-096-298";

interface DamageRow {
  readonly amount: number;
  readonly combat?: boolean;
  readonly target: string;
  readonly source?: { readonly cardId?: string; readonly player?: string };
}
const damageLog = (game: Game): readonly DamageRow[] =>
  (game.gameState as unknown as { damageLog?: readonly DamageRow[] }).damageLog ?? [];
const bf1 = (game: Game) => game.gameState.battlefields.bf1;
/** The current decision's action context ("main" | "chain" | "showdown" | …), when it has one. */
const context = (game: Game): string | undefined =>
  (game.decision() as unknown as { context?: string } | null)?.context;
/** The engine's own step-by-step record of the Combat Cleanup / Resolution Step. */
const cleanupLog = (game: Game): readonly string[] =>
  (bf1(game) as unknown as { combatCleanupLog?: readonly string[] }).combatCleanupLog ?? [];

/** P1's turn: a lone 4-Might attacker in base, Counter Strike in hand, P2 holding bf1. */
function board(defender: "kog" | "sentry" | "vanilla") {
  const s = scenario()
    .active(P1)
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 4, name: "Vanguard" }, "attacker")
    .hand(P1, COUNTER_STRIKE, "cs");
  if (defender === "kog") {
    return s.unit(P2, "bf1", KOGMAW, "def");
  }
  if (defender === "sentry") {
    return s.unit(P2, "bf1", WATCHFUL_SENTRY, "def");
  }
  return s.unit(P2, "bf1", { might: 1, name: "Picket" }, "def");
}

/** Attack, then close the showdown — combat damage is dealt and the Combat Cleanup runs. */
async function intoWindow466_2(defender: "kog" | "sentry" | "vanilla"): Promise<Game> {
  const game = await board(defender).build();
  await game.p1.move("attacker", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  return game;
}

describe("Counter Strike — showdown shield vs the 466.2 window (Kog'Maw's Deathknell)", () => {
  // ── (a) spent inside the showdown ────────────────────────────────────────────────────────────

  test("(a) played in the showdown the shield is eaten by the FIRST damage — Kog'Maw's 1 point of combat damage — so the Deathknell's 4 still kills the 4-Might attacker", async () => {
    const game = await board("kog").build();
    const handBefore = game.p1.hand().length;
    await game.p1.move("attacker", "bf1");
    await game.p1.cast("cs", { targets: "attacker" });
    await game.settle();
    // Draw 1 resolved; the spell itself left the hand.
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 1);
    expect(game.zoneOf("cs")).toBe("trash");
    // The prevented instance is the 1 combat damage; the Deathknell's 4 lands unprevented.
    expect(damageLog(game).filter((r) => r.target === "attacker" && r.combat !== true).map((r) => r.amount)).toEqual([4]);
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("attacker")).toBe("trash");
    // Neither player has units at 466.3 ⇒ No Result ⇒ Uncontrolled, nobody scores.
    expect(bf1(game)).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("(a) the shield really was spent on combat damage: the attacker carries NO combat damage marker into the Combat Cleanup, and one 4-damage Deathknell row is all that ever hits it", async () => {
    const game = await board("kog").build();
    await game.p1.move("attacker", "bf1");
    await game.p1.cast("cs", { targets: "attacker" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Counter Strike resolves inside the showdown
    await game.p2.passFocus(); // focus is P2's after P1 acted
    await game.p1.passFocus();
    // 466.2 window: Kog'Maw is dead, the Deathknell is on the chain, the attacker is unharmed…
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "def", triggered: true })]);
    expect(game.state("attacker").damage).toBe(0);
    // …but the shield is gone, so the Deathknell kills it.
    await game.settle();
    expect(game.zoneOf("attacker")).toBe("trash");
  });

  // ── (b) no window between assignment and dealing ─────────────────────────────────────────────

  test("(b) closing the showdown against a vanilla defender runs assignment AND dealing as one uninterrupted sequence — the next Decision is already P1's ordinary main-phase priority (465.1, 465.2.c.1.a, 335)", async () => {
    const game = await board("vanilla").build();
    await game.p1.move("attacker", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    // Nobody receives priority between the assignment and the dealing: damage is already done,
    // the defender is already in the trash, and there is nothing to answer.
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.chain()).toEqual([]);
    // The engine's own step log: dealing is one entry, and the 466.2 window found the chain EMPTY.
    expect(cleanupLog(game)).toEqual([
      "465.2:damage-dealt",
      "466.1.3a:queue-deaths",
      "466.1.3b:trash-dead",
      "466.1.3c:heal-all",
      "466.1.3d:no-recall",
      "466.2:chain-empty",
      "466.3:attacker-only",
      "466.1.3e:end-designations",
      "466.5.d:conquer",
    ]);
    // The next Decision is P1's ordinary main-phase priority, AFTER the whole combat.
    expect(context(game)).toBe("main");
    expect(game.phase()).toBe("main");
  });

  test("(b) even on the Kog'Maw board the first Decision after the showdown closes is CHAIN priority on the queued Deathknell — combat damage has already been dealt and the Combat Cleanup has already healed the attacker", async () => {
    const game = await intoWindow466_2("kog");
    expect(game.zoneOf("def")).toBe("trash"); // damage dealt, 323.5 step 3b
    expect(game.state("attacker").damage).toBe(0); // 466.1.a.1 step 3c healed the 1 it took
    expect(game.state("attacker").combatRole).toBe("attacker"); // designations survive to 466.7.a
    expect(context(game)).toBe("chain");
    // Damage assignment + dealing is a single logged step; the first window is 466.2's.
    expect(cleanupLog(game)).toEqual([
      "465.2:damage-dealt",
      "466.1.3a:queue-deaths",
      "466.1.3b:trash-dead",
      "466.1.3c:heal-all",
      "466.1.3d:no-recall",
      "466.2:chain-window",
    ]);
  });

  // ── (c) the 466.2 window ─────────────────────────────────────────────────────────────────────

  test("(c) the 466.2 window exists only because the Deathknell is on the chain — a Reaction is legal there (309.1.a) and prevention there saves the attacker, which then WINS the combat and conquers for a point", async () => {
    const game = await intoWindow466_2("kog");
    expect(game.actingSeat()).toBe(P2); // the Deathknell's controller answers its own window first
    await game.p2.passPriority();
    expect(game.p1.can("cast", "cs")).toBe(true);
    await game.p1.cast("cs", { targets: "attacker" });
    await game.settle();
    expect(game.zoneOf("attacker")).toBe("battlefield-bf1");
    expect(game.state("attacker").damage).toBe(0); // the Deathknell's 4 was prevented outright
    expect(bf1(game)).toMatchObject({ contested: false, controller: P1 }); // 466.3.a → 466.5
    expect(game.p1.points()).toBe(1); // 466.5.d conquer
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("(c) control branch — pass the 466.2 window instead and the attacker dies to the Deathknell: No Result (466.3.d), no restage, bf1 Uncontrolled (466.5.b), no point", async () => {
    const game = await intoWindow466_2("kog");
    await game.settle(); // both pass on the Deathknell
    expect(game.zoneOf("attacker")).toBe("trash");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(bf1(game)).toMatchObject({ contested: false, controller: null });
    expect(game.p1.points()).toBe(0);
  });

  // ── (d) how many windows there are ───────────────────────────────────────────────────────────

  test("(d) vanilla defender: ZERO windows between the showdown closing and the conquer — nothing enters the chain and P1 takes bf1 in one uninterrupted step", async () => {
    const game = await intoWindow466_2("vanilla");
    expect(game.chain()).toEqual([]);
    expect(cleanupLog(game)).toContain("466.2:chain-empty");
    expect(cleanupLog(game)).not.toContain("466.2:chain-window");
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("attacker")).toBe("battlefield-bf1");
    expect(bf1(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("(d) a Deathknell that is not a damage effect still opens the window: the Watchful Sentry board stops on a chain item, and P1 could Counter Strike there for no benefit — the shield never gets spent and the conquer happens anyway", async () => {
    const game = await intoWindow466_2("sentry");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "def", triggered: true })]);
    await game.p2.passPriority();
    expect(game.p1.can("cast", "cs")).toBe(true);
    await game.p1.cast("cs", { targets: "attacker" });
    await game.settle();
    expect(game.state("attacker").damage).toBe(0);
    expect(bf1(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
  });
});
