/**
 * Interaction: Void Assault (unl-202-219) × Sunlit Guardian (ogn-054-298) × Chemtech Enforcer (ogn-003-298)
 *
 *   Void Assault — Spell · Body/Chaos · 2 + [C]
 *     "Move a friendly unit, then move an enemy unit. (If they both move to a battlefield you don't
 *      control, you're the attacker.)"
 *   Sunlit Guardian — Unit · Calm · 3 Might · [Shield] (+1 Might while defending) [Tank] (assigned lethal first)
 *   Chemtech Enforcer — Unit · Fury · 2 Might · [Assault 2] (+2 Might while attacking)
 *
 * Rules: 446.3 (each move is instantaneous; "then" = sequential inside one resolution); 190.3.a.1 / 450
 * (the ARRIVING unit's controller applies Contested iff the battlefield is not already Contested and not
 * theirs); 323.6 (Open-state cleanup: a battlefield with none of its controller's units is lost);
 * 323.8/323.9 (stage Showdown / Combat per Contested battlefield), 323.12 before 323.13 (Neutral Open:
 * showdown-only battlefields begin BEFORE any staged Combat; turn player picks among each kind), 323.9.a
 * (the other Combat stays Staged); 344.2 / 345 (non-combat showdown; the contesting player gets Focus);
 * 348.2.a (lone side conquers when it ends); 460 (a Combat begins only when no other Showdown/Combat is
 * ongoing) / 461.1 (turn player chooses which staged Combat first); 464.2.c.1 (Attacker = whoever applied
 * Contested — the reminder text) / 464.2.d (Attacker gets Focus); 807.1.c / 814.1.c (Assault only while
 * attacking, Shield only while defending); 815.1.b + 465.2.c.3 (Tank takes lethal first); 466.3.d /
 * 466.5.b (nobody left → No Result, battlefield uncontrolled); 466.5.d (winner conquers); 144.3 (a
 * Standard Move has ONE destination — only an effect can split two units across two battlefields).
 *
 * Board (P1's turn): bfA P1 + Guardian · bfB P2 + Enforcer · bfC empty/uncontrolled · P1 base Runner (3) ·
 * P2 base Brute (4).
 * (a) Runner→bfC then Enforcer→bfC  (b) Runner→bfA then Enforcer→bfA  (c) Runner→bfC, Enforcer→bfA
 * (d) Runner→bfB, Brute→bfA.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_ASSAULT = "unl-202-219";
const ENFORCER = "ogn-003-298";
const GUARDIAN = "ogn-054-298";

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { body: 1 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .battlefield("bfC", { controller: null })
    .unit(P1, "bfA", GUARDIAN, "guardian")
    .unit(P2, "bfB", ENFORCER, "enforcer")
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
    .unit(P2, "base", { might: 4, name: "Brute" }, "brute")
    .hand(P1, VOID_ASSAULT, "va");
}

type ShowdownView = { battlefieldId: string; active: boolean; isCombatShowdown?: boolean; focusPlayer?: string; attackingPlayer?: string; defendingPlayer?: string };

/** The showdown currently open (top of the engine's showdown stack), if any. */
function openShowdown(game: Game): ShowdownView | undefined {
  const stack = (game.gameState.interaction as { showdownStack?: ShowdownView[] } | undefined)?.showdownStack ?? [];
  const top = stack.at(-1);
  return top?.active ? top : undefined;
}

const bf = (game: Game, id: string) => game.gameState.battlefields[id]!;

/**
 * Cast Void Assault on (Runner, `enemy`) and answer the two destination prompts in card order as the
 * spell is PLAYED (355.4): Runner → `friendlyTo`, THEN enemy → `enemyTo`; then let it resolve (both
 * pass). Returns with whatever the Cleanup began (showdown / combat) now open — nothing has been
 * passed in it yet.
 */
async function voidAssault(enemy: "enforcer" | "brute", friendlyTo: string, enemyTo: string, opts: { manual?: boolean } = {}): Promise<Game> {
  const game = await (opts.manual ? board().autoProcedures(false) : board()).build();
  await game.p1.cast("va", { targets: ["runner", enemy] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", source: { cardId: "runner" }, timing: "FIN" });
  await game.p1.pick(`battlefield-${friendlyTo}`);
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", source: { cardId: enemy }, timing: "FIN" });
  await game.p1.pick(`battlefield-${enemyTo}`);
  expect(game.locationOf("runner")).toBe("base"); // choices, not effects — nothing has moved yet
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("Void Assault — sequential arrivals, Contested per arrival, staging order (unl-202-219 × ogn-054-298 × ogn-003-298)", () => {
  test("choice order (355.4): the friendly unit's destination is asked BEFORE the enemy unit's, both as the spell is played; on resolution Runner arrives at bfC (Contested by P1) and Enforcer follows — nothing begins mid-resolution", async () => {
    const game = await board().build();
    await game.p1.cast("va", { targets: ["runner", "enforcer"] });
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "runner" }, timing: "FIN" });
    await game.p1.pick("battlefield-bfC");
    expect(game.locationOf("runner")).toBe("base"); // a choice, not yet a move
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "enforcer" }, timing: "FIN" });
    await game.p1.pick("battlefield-bfC");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // only now the priority window
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("runner")).toBe("bfC"); // 446.3: instantaneous
    expect(game.locationOf("enforcer")).toBe("bfC");
    expect(bf(game, "bfC")).toMatchObject({ contested: true, contestedBy: P1, controller: null }); // 190.3.a.1 — Runner arrived first
  });

  // ── (a) both to the open bfC ─────────────────────────────────────────────────────────────

  test("(a) Runner→bfC then Enforcer→bfC: P1 applied Contested (Enforcer's arrival changes nothing) → Combat at bfC with P1 the Attacker holding Focus — the reminder text", async () => {
    const game = await voidAssault("enforcer", "bfC", "bfC");
    expect(bf(game, "bfC")).toMatchObject({ contested: true, contestedBy: P1 });
    expect(openShowdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bfC", defendingPlayer: P2, focusPlayer: P1, isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("runner").combatRole).toBe("attacker");
    expect(game.state("enforcer").combatRole).toBe("defender");
  });

  test("(a) Enforcer is a DEFENDER, so Assault 2 is off — it fights at 2 (807.1.c); the emptied bfB was already lost by P2 at the Cleanup (323.6)", async () => {
    const game = await voidAssault("enforcer", "bfC", "bfC");
    expect(game.state("enforcer").might).toBe(2);
    expect(game.state("runner").might).toBe(3);
    expect(bf(game, "bfB").controller).toBeNull();
    expect(game.p2.units("bfB")).toEqual([]);
  });

  test("(a) outcome: Runner (3) kills Enforcer (2) and survives → P1 conquers bfC (+1); bfA untouched", async () => {
    const game = await voidAssault("enforcer", "bfC", "bfC");
    await game.settle();
    expect(game.zoneOf("enforcer")).toBe("trash");
    expect(game.locationOf("runner")).toBe("bfC");
    expect(bf(game, "bfC")).toMatchObject({ contested: false, controller: P1 });
    expect(bf(game, "bfA").controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.zoneOf("va")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) both to P1's own bfA ─────────────────────────────────────────────────────────────

  test("(b) Runner→bfA applies nothing (P1 controls it); Enforcer's arrival Contests bfA for P2 → P2 is the Attacker with Focus on P1's turn — the reminder's condition fails", async () => {
    const game = await voidAssault("enforcer", "bfA", "bfA");
    expect(bf(game, "bfA")).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(openShowdown(game)).toMatchObject({ attackingPlayer: P2, battlefieldId: "bfA", defendingPlayer: P1, focusPlayer: P2, isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.turnPlayer()).toBe(P1);
  });

  test("(b) roles & keyword Might: Enforcer attacks at 4 (Assault 2), Guardian defends at 4 (Shield), Runner defends at 3", async () => {
    const game = await voidAssault("enforcer", "bfA", "bfA");
    expect(game.state("enforcer")).toMatchObject({ combatRole: "attacker", might: 4 });
    expect(game.state("guardian")).toMatchObject({ combatRole: "defender", might: 4 });
    expect(game.state("runner")).toMatchObject({ combatRole: "defender", might: 3 });
  });

  test("(b) outcome: Enforcer's 4 must go to Tank Guardian first (815.1.b) → Guardian dies; defenders' 3+4 kill Enforcer; Runner holds bfA for P1 — no point for a defence", async () => {
    const game = await voidAssault("enforcer", "bfA", "bfA");
    await game.settle();
    expect(game.zoneOf("guardian")).toBe("trash");
    expect(game.zoneOf("enforcer")).toBe("trash");
    expect(game.locationOf("runner")).toBe("bfA");
    expect(game.state("runner").damage).toBe(0);
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(bf(game, "bfB").controller).toBeNull(); // Enforcer left it → lost at Cleanup (323.6)
  });

  // ── (c) split: Runner→bfC (P1 contests), Enforcer→bfA (P2 contests) ─────────────────────

  test("(c) one resolution, two battlefields Contested by two different players: bfC by P1 (showdown only), bfA by P2 (showdown+combat); bfB uncontrolled", async () => {
    const game = await voidAssault("enforcer", "bfC", "bfA");
    expect(bf(game, "bfC")).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(bf(game, "bfA")).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(bf(game, "bfB").controller).toBeNull();
    expect(game.locationOf("runner")).toBe("bfC");
    expect(game.locationOf("enforcer")).toBe("bfA");
  });

  test("(c) 323.12 runs before 323.13: the NON-combat Showdown at bfC begins first with P1's Focus (345); the bfA Combat does not begin — no roles assigned there yet (460: never two at once)", async () => {
    const game = await voidAssault("enforcer", "bfC", "bfA");
    expect(openShowdown(game)).toMatchObject({ battlefieldId: "bfC", focusPlayer: P1, isCombatShowdown: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("guardian").combatRole).toBeNull();
    expect(game.state("enforcer").combatRole).toBeNull();
    expect(game.state("enforcer").might).toBe(2); // not an attacker yet
    expect(bf(game, "bfA")).toMatchObject({ contested: true, contestedBy: P2 }); // still merely staged
  });

  test("(c) when everyone passes at bfC, P1 Conquers it (+1, 348.2.a); the NEXT Cleanup begins the staged Combat at bfA with P2 attacking and holding Focus", async () => {
    const game = await voidAssault("enforcer", "bfC", "bfA");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(bf(game, "bfC")).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(openShowdown(game)).toMatchObject({ attackingPlayer: P2, battlefieldId: "bfA", defendingPlayer: P1, focusPlayer: P2, isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.state("enforcer")).toMatchObject({ combatRole: "attacker", might: 4 }); // Assault live now
    expect(game.state("guardian")).toMatchObject({ combatRole: "defender", might: 4 }); // Shield live now
  });

  test("(c) settle() hands the auto-begun bfC showdown back once, then finishes: Enforcer 4 v Guardian 4 → both die → No Result, bfA becomes UNCONTROLLED (466.3.d/466.5.b); P1 ends on exactly 1 point", async () => {
    const game = await voidAssault("enforcer", "bfC", "bfA");
    const first = await game.settle();
    expect(first.reason).toBe("open");
    expect(openShowdown(game)?.battlefieldId).toBe("bfC"); // rule 344.2 hand-back
    await game.settle();
    expect(game.zoneOf("guardian")).toBe("trash");
    expect(game.zoneOf("enforcer")).toBe("trash");
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: null });
    expect(bf(game, "bfC").controller).toBe(P1);
    expect(bf(game, "bfB").controller).toBeNull();
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (d) two COMBATS staged at once with opposite attackers ─────────────────────────────

  test("(d) Runner→bfB Contested by P1, Brute→bfA Contested by P2: two Combats staged, but only ONE showdown is ever open at a time (460)", async () => {
    const game = await voidAssault("brute", "bfB", "bfA");
    expect(bf(game, "bfB")).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(bf(game, "bfA")).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    const stack = ((game.gameState.interaction as { showdownStack?: ShowdownView[] } | undefined)?.showdownStack ?? []).filter((s) => s.active);
    expect(stack).toHaveLength(1);
    expect(openShowdown(game)?.isCombatShowdown).toBe(true);
  });

  // Expected (323.13 / 461.1): with Combats staged at bfA AND bfB in the same Cleanup, the TURN PLAYER
  // (P1) chooses which one begins; e.g. P1 may fight its own attack at bfB first. Actual: the engine
  // auto-begins one (bfA — P2's attack) without ever asking P1.
  test("(d) the turn player P1 is asked which staged Combat begins first (bfA or bfB) before any showdown opens (323.13, 461.1)", async () => {
    const game = await voidAssault("brute", "bfB", "bfA", { manual: true });
    expect(openShowdown(game)).toBeUndefined(); // nothing has begun on its own
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    const offered = JSON.stringify(d);
    expect(offered).toContain("bfA");
    expect(offered).toContain("bfB");
  });

  // Expected: choosing bfB first → the bfB Combat opens with P1 attacking / Focus while bfA stays merely
  // Staged (Contested by P2, no roles). Actual: no choice; bfA opens first.
  test("(d) P1 picks bfB first → bfB combat opens (P1 Attacker, Focus), bfA still only Staged with no roles (323.9.a, 460)", async () => {
    const game = await voidAssault("brute", "bfB", "bfA", { manual: true });
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    if (d?.kind === "pick") {
      const key = d.options.find((o) => o.key.includes("bfB"))?.key;
      expect(key).toBeDefined();
      await game.p1.pick(key!);
    } else if (d?.kind === "action") {
      const opt = d.options.find((o) => o.key.includes("bfB") && o.verb !== "move" && o.verb !== "gank");
      expect(opt).toBeDefined();
      await game.p1.choose(opt!.key);
    }
    expect(openShowdown(game)).toMatchObject({ attackingPlayer: P1, battlefieldId: "bfB", focusPlayer: P1, isCombatShowdown: true });
    expect(game.state("runner").combatRole).toBe("attacker");
    expect(game.state("brute").combatRole).toBeNull();
    expect(game.state("guardian").combatRole).toBeNull();
    expect(bf(game, "bfA")).toMatchObject({ contested: true, contestedBy: P2 });
  });

  test("(d) roles are per battlefield regardless of order: at bfA P2 attacks (Brute 4 v Guardian 4 w/ Shield+Tank), at bfB P1 attacks (Runner 3 v Enforcer defending at 2, no Assault)", async () => {
    const game = await voidAssault("brute", "bfB", "bfA");
    const seen: Record<string, { attacker?: string; focus?: string; mights: Record<string, number>; roles: Record<string, unknown> }> = {};
    for (let i = 0; i < 12 && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "showdown"; i++) {
      const sd = openShowdown(game)!;
      seen[sd.battlefieldId] ??= {
        attacker: sd.attackingPlayer,
        focus: sd.focusPlayer,
        mights: { brute: game.state("brute").might, enforcer: game.state("enforcer").might, guardian: game.state("guardian").might, runner: game.state("runner").might },
        roles: { brute: game.state("brute").combatRole, enforcer: game.state("enforcer").combatRole, guardian: game.state("guardian").combatRole, runner: game.state("runner").combatRole },
      };
      await game.acting().passFocus();
    }
    expect(Object.keys(seen).sort()).toEqual(["bfA", "bfB"]);
    expect(seen.bfA).toMatchObject({ attacker: P2, focus: P2 });
    expect(seen.bfA!.roles).toMatchObject({ brute: "attacker", guardian: "defender" });
    expect(seen.bfA!.mights).toMatchObject({ brute: 4, guardian: 4 });
    expect(seen.bfB).toMatchObject({ attacker: P1, focus: P1 });
    expect(seen.bfB!.roles).toMatchObject({ enforcer: "defender", runner: "attacker" });
    expect(seen.bfB!.mights).toMatchObject({ enforcer: 2, runner: 3 });
  });

  // Expected (460 / 466): the Combat that began first runs to completion — damage dealt, dead units
  // trashed, Contested cleared, control settled — BEFORE the other staged Combat opens. Actual: once
  // both players pass Focus at the first battlefield the engine immediately opens the second combat
  // showdown while the first battlefield is still Contested with its combat damage step pending (the
  // damage is only dealt later), i.e. two combats are in flight at once.
  test("(d) the second Combat begins only after the first has COMPLETELY finished — damage dealt, units dead, Contested cleared (460, 466.5.a)", async () => {
    const game = await voidAssault("brute", "bfB", "bfA");
    const firstBf = openShowdown(game)!.battlefieldId;
    const other = firstBf === "bfA" ? "bfB" : "bfA";
    const casualty = firstBf === "bfA" ? "guardian" : "enforcer"; // dies in either first combat
    await game.acting().passFocus();
    await game.acting().passFocus(); // both passed → combat damage step → resolution → cleanup
    expect(game.zoneOf(casualty)).toBe("trash"); // first combat completely done…
    expect(bf(game, firstBf).contested).toBe(false);
    expect(openShowdown(game)).toMatchObject({ battlefieldId: other, isCombatShowdown: true }); // …and only then the other opens
  });

  test("(d) outcome once both combats have run: bfA 4 v 4 → both die, uncontrolled (466.5.b); bfB Runner kills the 2-Might defending Enforcer → P1 conquers (+1)", async () => {
    const game = await voidAssault("brute", "bfB", "bfA");
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.zoneOf("guardian")).toBe("trash");
    expect(game.zoneOf("enforcer")).toBe("trash");
    expect(game.locationOf("runner")).toBe("bfB");
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: null });
    expect(bf(game, "bfB")).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // ── parity with a Standard Move ─────────────────────────────────────────────────────────

  test("parity: Runner STANDARD-moving alone to bfC behaves exactly like its Void Assault arrival — Contested by P1, non-combat showdown with P1's Focus, conquer on all-pass", async () => {
    const game = await board().build();
    await game.p1.move("runner", "bfC");
    expect(bf(game, "bfC")).toMatchObject({ contested: true, contestedBy: P1 });
    expect(openShowdown(game)).toMatchObject({ battlefieldId: "bfC", focusPlayer: P1, isCombatShowdown: false });
    await game.settle();
    expect(bf(game, "bfC")).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
  });

  test("parity (144.3): a Standard Move names ONE shared destination — the move menu offers per-destination options, never a two-battlefield split like (c)/(d)", async () => {
    const game = await board().unit(P1, "base", { might: 1, name: "Buddy" }, "buddy").build();
    const moves = game.p1.legal().filter((o) => o.moveId === "standardMove");
    expect(moves.length).toBeGreaterThan(0);
    for (const o of moves) {
      const dests = new Set(o.variants.map((v) => String(v.params.destination)));
      expect(dests.size).toBe(1); // every variant under one option goes to the same place
    }
    await game.p1.move(["runner", "buddy"], "bfC");
    expect(game.locationOf("runner")).toBe("bfC");
    expect(game.locationOf("buddy")).toBe("bfC");
  });
});
