/**
 * Interaction: Udyr, Wildman (ogn-157-298) · Champion Unit · Body · 6 · 6 Might
 *     "Spend my buff: Choose one you've not chosen this turn — Deal 2 to a unit at a battlefield. · Stun a unit at
 *      a battlefield. · Ready me. · Give me [Ganking] this turn."
 *   × Blind Monk (ogn-257-298) · Legend · "[1], [Exhaust]: Buff a friendly unit."
 *   × Stand United (ogn-053-298) ×3 · [Action] spell · Calm · 3 — "Buff a friendly unit. Buffs give an additional
 *     +1 [Might] to friendly units this turn."
 *
 * Question: P1's turn, 10 energy. Udyr BUFFED + EXHAUSTED at bf1; P2's 4-Might E at bf2. Walk through:
 *   #1 activate Udyr → Stun → E;             Blind Monk re-buffs Udyr.
 *   #2 activate → Ready me;                  Stand United #1 re-buffs.
 *   #3 activate → Deal 2 → E;                Stand United #2 re-buffs.
 *   #4 activate (only Ganking left);         Stand United #3 re-buffs.
 *   #5 attempt with a buff but every mode already chosen this turn. Then: what is offered on P1's NEXT turn?
 *
 * Rules: 377.1 (activated ability = cost : effect); 402.2 / 355.3 (mode chosen at finalization), 355.5 (that mode's
 * target chosen at finalization), 404.1 + 702.2.b / 702.3 (the cost — spending Udyr's single buff — is paid at
 * finalization), 406.4 (only then does P2 get priority); 355.8 / 402.3 (no legal choice → not legal to activate).
 *
 * Expected: #1 all four modes offered; buff gone at once; E stunned on resolution. Blind Monk pays [1] + exhausts,
 * Udyr re-buffed. #2 offered {Deal 2, Ready me, Ganking}; Udyr readied. #3 offered {Deal 2, Ganking}; E takes 2.
 * #4 a single unchosen mode (Ganking) → the forced choice, no crash; Udyr gains Ganking this turn. #5 Udyr HAS a
 * buff but no unchosen mode remains → the ability is not legal (absent from legal actions), and the buff is NOT
 * eaten. On P1's next turn (buff still on him) all four modes are offered again.
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UDYR = "ogn-157-298";
const BLIND_MONK = "ogn-257-298";
const STAND_UNITED = "ogn-053-298";

/** P1's turn, 10 energy. Udyr buffed+exhausted at bf1 (P1's), E (4) at bf2 (P2's). Blind Monk legend, 3× Stand United. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", UDYR, "udyr", { buffed: true, exhausted: true })
    .unit(P2, "bf2", { might: 4, name: "E" }, "ee")
    .legend(P1, BLIND_MONK, "monk")
    .resources(P1, { energy: 10 })
    .hand(P1, STAND_UNITED, "su1")
    .hand(P1, STAND_UNITED, "su2")
    .hand(P1, STAND_UNITED, "su3");
}

/** The mode labels currently offered to P1 (expects a mode pick to be pending). */
function modesOffered(game: Game): string[] {
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "mode", timing: "FIN" });
  return (d as PickDecision).options.map((o) => o.label);
}

function modeKey(game: Game, label: string): string {
  const d = game.decision() as PickDecision;
  const opt = d.options.find((o) => o.label === label);
  expect(opt).toBeDefined();
  return opt!.key;
}

/** Activate Udyr, pick `label` (and `target` if that mode has one), then let it resolve. */
async function udyr(game: Game, label: string, target?: string): Promise<void> {
  await game.p1.activate("udyr");
  await game.p1.pick(modeKey(game, label));
  if (target !== undefined) {
    await game.p1.pick(target);
  }
  const r = await game.settle();
  expect(r.reason).toBe("open");
}

async function rebuffWithMonk(game: Game): Promise<void> {
  await game.p1.activate("monk");
  const r = await game.settle();
  expect(r.reason).toBe("open");
  expect(game.state("udyr").isBuffed).toBe(true);
}

async function rebuffWithStandUnited(game: Game, copy: string): Promise<void> {
  await game.p1.cast(copy, { targets: "udyr" });
  const r = await game.settle();
  expect(r.reason).toBe("open");
  expect(game.state("udyr").isBuffed).toBe(true);
}

/** State after #1 (Stun→E) + Blind Monk. */
async function after1(): Promise<Game> {
  const game = await board().build();
  await udyr(game, "Stun", "ee");
  await rebuffWithMonk(game);
  return game;
}
/** …after #2 (Ready me) + Stand United #1. */
async function after2(): Promise<Game> {
  const game = await after1();
  await udyr(game, "Ready me");
  await rebuffWithStandUnited(game, "su1");
  return game;
}
/** …after #3 (Deal 2→E) + Stand United #2. */
async function after3(): Promise<Game> {
  const game = await after2();
  await udyr(game, "Deal 2", "ee");
  await rebuffWithStandUnited(game, "su2");
  return game;
}
/** …after #4 (Ganking, forced) + Stand United #3 — Udyr buffed, all four modes chosen this turn. */
async function after4(): Promise<Game> {
  const game = await after3();
  await game.p1.activate("udyr");
  if (game.decision()?.kind === "pick") {
    // A single-option prompt is an acceptable way to surface the forced mode.
    expect(modesOffered(game)).toEqual(["Ganking"]);
    await game.p1.pick(modeKey(game, "Ganking"));
  }
  const r = await game.settle();
  expect(r.reason).toBe("open");
  await rebuffWithStandUnited(game, "su3");
  return game;
}

describe("Udyr, Wildman × Blind Monk × Stand United ×3 — four modes in one turn, then locked out", () => {
  // ────────────────────────────────────────────────────────────── #1
  test("#1: a buffed Udyr's ability is legal; activating asks the MODE at finalization (timing FIN) with all four modes offered", async () => {
    const game = await board().build();
    expect(game.state("udyr")).toMatchObject({ isBuffed: true, isExhausted: true, location: "bf1", might: 7 });
    expect(game.p1.can("activate", "udyr")).toBe(true);
    await game.p1.activate("udyr");
    expect(modesOffered(game)).toEqual(["Deal 2", "Stun", "Ready me", "Ganking"]);
  });

  test("#1: Stun's target is also chosen at finalization — 'a unit at a battlefield' offers both E (bf2) and Udyr himself (bf1)", async () => {
    const game = await board().build();
    await game.p1.activate("udyr");
    await game.p1.pick(modeKey(game, "Stun"));
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", timing: "FIN" });
    expect((d as PickDecision).options.map((o) => o.card).sort()).toEqual(["ee", "udyr"]);
  });

  test("#1: the cost (spend the buff) is paid at finalization — buff gone (7→6) and {mode: Stun, target: E} are on the chain item BEFORE P2 gets priority (404.1, 702.2.b, 406.4)", async () => {
    const game = await board().build();
    await game.p1.activate("udyr");
    await game.p1.pick(modeKey(game, "Stun"));
    await game.p1.pick("ee");
    expect(game.state("udyr")).toMatchObject({ isBuffed: false, might: 6 });
    expect(game.state("ee").isStunned).toBe(false); // effect only on resolution
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "udyr", controller: P1, mode: 1, targets: ["ee"], triggered: false })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.state("udyr").isBuffed).toBe(false);
  });

  test("#1: on resolution E is stunned; Udyr is unbuffed and still exhausted", async () => {
    const game = await board().build();
    await udyr(game, "Stun", "ee");
    expect(game.state("ee")).toMatchObject({ damage: 0, isStunned: true });
    expect(game.state("udyr")).toMatchObject({ isBuffed: false, isExhausted: true, isStunned: false, might: 6 });
    expect(game.chain()).toEqual([]);
  });

  test("Blind Monk: legal now that Udyr has no buff; P1 pays [1] and the legend exhausts at activation, Udyr is re-buffed on resolution (6→7)", async () => {
    const game = await board().build();
    await udyr(game, "Stun", "ee");
    expect(game.p1.can("activate", "monk")).toBe(true);
    await game.p1.activate("monk");
    expect(game.p1.energy()).toBe(9);
    expect(game.state("monk").isExhausted).toBe(true);
    expect(game.state("udyr").isBuffed).toBe(false); // not yet — it's on the chain
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "monk", controller: P1 })]);
    await game.settle();
    expect(game.state("udyr")).toMatchObject({ isBuffed: true, might: 7 });
    expect(game.p1.can("activate", "monk")).toBe(false); // exhausted legend
  });

  // ────────────────────────────────────────────────────────────── #2
  test("#2: Stun WAS CHOSEN this turn → offered exactly {Deal 2, Ready me, Ganking}", async () => {
    const game = await after1();
    expect(game.p1.can("activate", "udyr")).toBe(true);
    await game.p1.activate("udyr");
    const offered = modesOffered(game);
    expect(offered).toEqual(["Deal 2", "Ready me", "Ganking"]);
    expect(offered).not.toContain("Stun");
  });

  test("#2: 'Ready me' has no target prompt; buff spent at once; on resolution Udyr is READY", async () => {
    const game = await after1();
    await game.p1.activate("udyr");
    await game.p1.pick(modeKey(game, "Ready me"));
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // straight to priority
    expect(game.state("udyr")).toMatchObject({ isBuffed: false, isExhausted: true });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "udyr", mode: 2 })]);
    await game.settle();
    expect(game.state("udyr")).toMatchObject({ isBuffed: false, isReady: true, might: 6 });
  });

  test("Stand United #1: costs 3, buffs Udyr (legal — he has no buff), and its rider makes the buff worth +2 this turn (6→8)", async () => {
    const game = await after1();
    await udyr(game, "Ready me");
    expect(game.p1.can("cast", "su1")).toBe(true);
    await game.p1.cast("su1", { targets: "udyr" });
    expect(game.p1.energy()).toBe(6); // 10 − 1 (Monk) − 3
    await game.settle();
    expect(game.zoneOf("su1")).toBe("trash");
    expect(game.state("udyr")).toMatchObject({ isBuffed: true, isReady: true, might: 8 });
  });

  // ────────────────────────────────────────────────────────────── #3
  test("#3: Stun and Ready me were chosen → offered exactly {Deal 2, Ganking}", async () => {
    const game = await after2();
    await game.p1.activate("udyr");
    expect(modesOffered(game)).toEqual(["Deal 2", "Ganking"]);
  });

  test("#3: Deal 2 → E: target locked at finalization, buff spent, E takes 2 on resolution (survives at 4 Might); the earlier stun is still on E", async () => {
    const game = await after2();
    await game.p1.activate("udyr");
    await game.p1.pick(modeKey(game, "Deal 2"));
    expect((game.decision() as PickDecision).options.map((o) => o.card).sort()).toEqual(["ee", "udyr"]);
    await game.p1.pick("ee");
    expect(game.state("udyr").isBuffed).toBe(false);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "udyr", mode: 0, targets: ["ee"] })]);
    expect(game.state("ee").damage).toBe(0);
    await game.settle();
    expect(game.state("ee")).toMatchObject({ damage: 2, isStunned: true, zone: "battlefield-bf2" });
    expect(game.state("udyr")).toMatchObject({ isBuffed: false, isReady: true });
  });

  test("Stand United #2 re-buffs Udyr again (two riders active: 6 + 1 + 2 = 9)", async () => {
    const game = await after3();
    expect(game.state("udyr")).toMatchObject({ isBuffed: true, might: 9 });
    expect(game.p1.energy()).toBe(3);
    expect(game.zoneOf("su2")).toBe("trash");
  });

  // ────────────────────────────────────────────────────────────── #4
  test("#4: exactly one unchosen mode (Ganking) remains → the activation is legal and Ganking is the only choice (forced / single-option), no crash; buff spent", async () => {
    const game = await after3();
    expect(game.p1.can("activate", "udyr")).toBe(true);
    await game.p1.activate("udyr");
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(modesOffered(game)).toEqual(["Ganking"]);
      await game.p1.pick(modeKey(game, "Ganking"));
    }
    // Either way the finalized item names mode 3 and the buff is gone before anyone responds.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "udyr", mode: 3 })]);
    expect(game.state("udyr").isBuffed).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("#4: on resolution Udyr has [Ganking] this turn (and, being ready at bf1, may now gank to bf2)", async () => {
    const game = await after3();
    await game.p1.activate("udyr");
    if (game.decision()?.kind === "pick") {
      await game.p1.pick(modeKey(game, "Ganking"));
    }
    await game.settle();
    expect(game.state("udyr").grantedKeywords).toEqual([{ duration: "turn", keyword: "Ganking" }]);
    expect(game.state("udyr").keywords).toContain("Ganking");
    expect(game.state("udyr")).toMatchObject({ isBuffed: false, isReady: true, location: "bf1" });
    expect(game.p1.can("gank", "udyr")).toBe(true);
  });

  test("Stand United #3 re-buffs Udyr a fourth time (6 + 1 + 3 = 10); P1 is now at 0 energy with all three copies in the trash", async () => {
    const game = await after4();
    expect(game.state("udyr")).toMatchObject({ isBuffed: true, might: 10 });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.trash().filter((c) => ["su1", "su2", "su3"].includes(c)).sort()).toEqual(["su1", "su2", "su3"]);
    // Net board so far: E stunned with 2 damage, Udyr ready with Ganking.
    expect(game.state("ee")).toMatchObject({ damage: 2, isStunned: true });
    expect(game.state("udyr")).toMatchObject({ isReady: true, keywords: ["Ganking"] });
  });

  // ────────────────────────────────────────────────────────────── #5
  test("#5 — Udyr is buffed but every mode was chosen this turn → no legal choice, so the ability must NOT be a legal action (402.3 / 355.8)", async () => {
    // `activate udyr` is absent from P1's legal actions and activate() throws.
    const game = await after4();
    expect(game.state("udyr").isBuffed).toBe(true);
    expect(game.p1.can("activate", "udyr")).toBe(false);
    expect(game.p1.legal().map((o) => o.key)).not.toContain("activateAbility:udyr#0");
    await expect(game.p1.activate("udyr")).rejects.toThrow();
  });

  test("#5 — attempting it anyway must leave the buff on Udyr (a cost is only paid for an activation that actually happens) and put nothing on the chain", async () => {
    // After the (rejected) attempt Udyr is still buffed at 10 Might and the chain is empty.
    const game = await after4();
    await game.p1.try((p) => p.activate("udyr"));
    expect(game.chain()).toEqual([]);
    expect(game.state("udyr")).toMatchObject({ isBuffed: true, might: 10 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("#5 (whatever the engine allows): no fifth effect happens — E is not damaged again / not touched, Udyr gains nothing new", async () => {
    const game = await after4();
    await game.p1.try((p) => p.activate("udyr"));
    await game.settle({ policy: "first" });
    expect(game.state("ee")).toMatchObject({ damage: 2, isStunned: true, zone: "battlefield-bf2" });
    expect(game.state("udyr").grantedKeywords).toEqual([{ duration: "turn", keyword: "Ganking" }]);
    expect(game.state("udyr")).toMatchObject({ isReady: true, location: "bf1" });
  });

  // ────────────────────────────────────────────────────────────── next turn
  test("next turn: 'this turn' bookkeeping resets — through P2's turn the buff persists (Ganking and the Stand United riders expire), and on P1's next turn all FOUR modes are offered again", async () => {
    const game = await after4();
    await game.advanceTurn(); // → P2's turn 3
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("udyr")).toMatchObject({ grantedKeywords: [], isBuffed: true, might: 7 });
    expect(game.state("ee")).toMatchObject({ damage: 0, isStunned: false }); // healed / stun wore off at end of P1's turn
    await game.advanceTurn(); // → P1's turn 4
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("udyr")).toMatchObject({ isBuffed: true, might: 7 });
    expect(game.p1.can("activate", "udyr")).toBe(true);
    await game.p1.activate("udyr");
    expect(modesOffered(game)).toEqual(["Deal 2", "Stun", "Ready me", "Ganking"]);
    await game.p1.pick(modeKey(game, "Stun")); // Stun is choosable again
    await game.p1.pick("ee");
    expect(game.state("udyr").isBuffed).toBe(false); // and it costs the buff as usual
    await game.settle();
    expect(game.state("ee").isStunned).toBe(true);
  });
});
