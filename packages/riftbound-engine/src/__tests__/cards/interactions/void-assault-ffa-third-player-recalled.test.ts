/**
 * Interaction (3-player free-for-all): Void Assault (unl-202-219) · Body/Chaos spell · 2 + [C]
 *     "Move a friendly unit, then move an enemy unit. (If they both move to a battlefield you don't
 *     control, you're the attacker.)"
 *   × Lillia, Fae Fawn (unl-082-219) · P3's 3-Might unit · "When I move from a location, play a 3 [Might]
 *     Sprite unit token with [Temporary] there."
 *
 * Board (P1's turn): bfA — P1's, held by P1's vanilla Sentinel (2). bfB — P2's, held by P2's vanilla
 * Guard (3). bfC — P3's, only unit there is P3's Lillia (3). P1's Runner (3) is in P1's base.
 * P1 resolves Void Assault: Runner → bfB, then enemy Lillia → (ILLEGAL-ON-ARRIVAL) bfB / (LEGAL) bfA.
 *
 * Question — ILLEGAL-ON-ARRIVAL: bfB was a legal destination to name for Lillia at finalization (only
 * P2's units there), but when her instruction executes Runner has already arrived, so bfB holds units of
 * two players other than P3. Does she move anyway, stay put, or get Recalled — where to, does "When I
 * move from a location" make a Sprite at bfC, what happens to control of bfC, and what combat results?
 * LEGAL contrast (Lillia → bfA): does she move, does bfC get a Sprite (and stay P3's), who attacks at
 * bfA, and with combats staged at bfA AND bfB who decides which is fought first?
 *
 * Rules: 355.4 (move destinations are chosen at finalization), 449.2 / 447.2.a / 462.1 / 144.4.a.1 (no
 * unit may become present, by any means, at a battlefield that already has units of two OTHER players),
 * 447.2.c (a REQUIRED move to such a location becomes a Recall instead), 455 / 456 / 456.1 (a Recall
 * relocates to base and is not a Move — move triggers do not fire), 190.3.a / 450 (arriving where you
 * don't control applies Contested), 461 / 323.9 (opposing units at a battlefield = Combat Staged),
 * 323.6 (control of an empty battlefield is lost only in an OPEN state with nothing ongoing there),
 * 309.1 / 323.13 (a pending trigger keeps the state Closed; staged combats begin only from a Neutral
 * Open state and the TURN PLAYER picks which), 460 (one combat at a time), 462 / 464.2.c.1 (exactly two
 * participants; the contesting player attacks and takes Focus).
 *
 * Expected — ILLEGAL: Runner arrives at bfB (P1 contests; combat staged P1 vs P2). Lillia cannot enter
 * bfB → she is Recalled to P3's base; no move trigger, no Sprite; at the next (open) cleanup P3 loses
 * bfC (uncontrolled); combat at bfB is P1 (attacker) vs P2 (defender), P3 uninvolved.
 * LEGAL: Lillia moves bfC→bfA, P3 contests bfA, her trigger is pending (Closed) so nothing begins and
 * bfC is not lost; the trigger plays a Sprite at bfC (P3 keeps it). Then, Neutral Open with two combats
 * staged, TURN PLAYER P1 chooses which begins; bfB: P1 attacks P2; bfA: P3 attacks P1 (P3 has Focus).
 * PARITY: a Standard Move can never target such a battlefield either (144.4.a.1).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, P3, scenario } from "../../../harness";
import type { Decision } from "../../../harness";

const VOID_ASSAULT = "unl-202-219";
const LILLIA = "unl-082-219";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

function board() {
  return scenario({ players: 3 })
    .resources(P1, { energy: 2, power: { body: 1 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .battlefield("bfC", { controller: P3 })
    .unit(P1, "bfA", { might: 2, name: "Sentinel" }, "sentinel")
    .unit(P2, "bfB", { might: 3, name: "Guard" }, "guard")
    .unit(P3, "bfC", LILLIA, "lillia")
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
    .hand(P1, VOID_ASSAULT, "va");
}

const isDestinationPick = (d: Decision | null): d is Extract<Decision, { kind: "pick" }> =>
  d?.kind === "pick" && d.semantics === "destination";

/**
 * Drive Void Assault: whenever a move-destination prompt appears (at finalization or, as the engine
 * does today, at resolution) answer it from `dest` by the unit it is for; pass priority on the chain
 * otherwise. Stops at an open main phase, at a showdown Focus prompt, or at any other kind of prompt.
 */
async function drive(game: Game, dest: Record<string, string>): Promise<void> {
  for (let i = 0; i < 30; i++) {
    const d = game.decision();
    if (!d) {
      return;
    }
    if (isDestinationPick(d)) {
      const unit = d.source?.cardId ?? "";
      const want = dest[unit];
      const key = d.options.find((o) => o.key === want || o.key === `battlefield-${want}`)?.key;
      if (!key) {
        throw new Error(`destination ${want} for ${unit} not offered: ${d.options.map((o) => o.key).join("|")}`);
      }
      await game.seat(d.seat).pick(key);
      continue;
    }
    if (d.kind === "action" && d.context === "chain" && d.passKey) {
      await game.seat(d.seat).passPriority();
      continue;
    }
    return;
  }
}

/** Pass Focus / take forced combat steps while the active showdown is at `bf`, until it is over. */
async function fightOut(game: Game, bf: string): Promise<void> {
  for (let i = 0; i < 30; i++) {
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    const d = game.decision();
    if (!d || !sd?.active || sd.battlefieldId !== bf) {
      return;
    }
    if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "distribute" && d.defaultAllocation) {
      await game.seat(d.seat).distribute({ ...d.defaultAllocation });
    } else {
      return;
    }
  }
}

const sprites = (game: Game, at: string) =>
  game.cardsAt(`battlefield-${at}`).filter((id) => game.state(id).isToken && game.state(id).name === "Sprite");

describe("Void Assault in a 3-player FFA — dragging the third player's Lillia into (or beside) a two-player battlefield", () => {
  // ── common ──────────────────────────────────────────────────────────────────────────────

  test("cast: in FFA P3's Lillia is an ENEMY unit for P1 — (Runner, Lillia) is an offered pair; the spell costs 2 + the body pip and every player gets priority in turn order", async () => {
    const game = await board().build();
    const pairs = (game.p1.option("cast", "va")?.fields.find((f) => f.name === "targets")?.options ?? []) as string[][];
    expect(pairs).toContainEqual(["runner", "lillia"]);
    expect(pairs).toContainEqual(["runner", "guard"]);
    await game.p1.cast("va", { targets: ["runner", "lillia"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "va", controller: P1 })]);
    expect(game.actingSeat()).toBe(P1);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P3);
  });

  test.failing("BUG: both move destinations are chosen at FINALIZATION (355.4) — right after the cast, before anyone else acts, P1 is asked Runner's then Lillia's destination, and bfB (only P2's units then) is a legal choice for Lillia", async () => {
    // Expected: cast → destination prompt(s) for P1 at play time; bfB offered for Lillia. Actual: the
    // spell goes on the chain with no destinations and they are asked only as it resolves.
    const game = await board().build();
    await game.p1.cast("va", { targets: ["runner", "lillia"] });
    const first = game.decision();
    expect(isDestinationPick(first) && first.source?.cardId).toBe("runner");
    if (isDestinationPick(first)) {
      await game.p1.pick(first.options.find((o) => o.key.endsWith("bfB"))!.key);
    }
    const second = game.decision();
    expect(isDestinationPick(second) && second.source?.cardId).toBe("lillia");
    expect(isDestinationPick(second) && second.options.some((o) => o.key.endsWith("bfB"))).toBe(true);
    expect(game.zoneOf("runner")).toBe("base"); // nothing has moved yet — these are choices, not effects
  });

  // ── ILLEGAL-ON-ARRIVAL: Runner → bfB, then Lillia → bfB ─────────────────────────────────

  test("ILLEGAL: the friendly half executes first — Runner arrives at bfB and P1 applies Contested there (P1 + P2 units ⇒ combat staged, 450/461)", async () => {
    const game = await board().build();
    await game.p1.cast("va", { targets: ["runner", "lillia"] });
    await drive(game, { lillia: "bfB", runner: "bfB" });
    expect(game.zoneOf("runner")).toBe("battlefield-bfB");
    expect(game.zoneOf("guard")).toBe("battlefield-bfB");
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.zoneOf("va")).toBe("trash");
  });

  test("ILLEGAL: Lillia cannot become present at bfB (units of two OTHER players, 449.2) — the required move turns into a Recall to P3's base (447.2.c, 455); bfB holds only P1's and P2's units", async () => {
    // Expected: Lillia in P3's base; bfB = {Runner, Guard}. Actual: the engine offers and performs the
    // move — three players' units end up at bfB.
    const game = await board().build();
    await game.p1.cast("va", { targets: ["runner", "lillia"] });
    await drive(game, { lillia: "bfB", runner: "bfB" });
    expect(game.zoneOf("lillia")).toBe("base");
    expect(game.state("lillia")).toMatchObject({ controller: P3, owner: P3 });
    expect(game.seat(P3).base()).toContain("lillia");
    const owners = new Set(game.cardsAt("battlefield-bfB").map((id) => game.state(id).controller));
    expect([...owners].sort()).toEqual([P1, P2]);
  });

  test("ILLEGAL: a Recall is not a Move (456.1) — Lillia's 'When I move from a location' does NOT trigger: no Lillia item on the chain, no Sprite at bfC; at the next open cleanup P3 loses the now-empty bfC (323.6)", async () => {
    // Expected: no trigger, no token, bfC uncontrolled. Actual: the engine moved her, fired the trigger
    // and a Sprite now holds bfC for P3.
    const game = await board().build();
    await game.p1.cast("va", { targets: ["runner", "lillia"] });
    await drive(game, { lillia: "bfB", runner: "bfB" });
    expect(game.chain().some((c) => c.cardId === "lillia")).toBe(false);
    await drive(game, {}); // let anything pending resolve into the cleanup
    expect(sprites(game, "bfC")).toEqual([]);
    expect(game.seat(P3).units("bfC")).toEqual([]);
    expect(game.gameState.battlefields.bfC?.controller).toBeNull();
  });

  test("ILLEGAL: the resulting combat at bfB is strictly P1 (attacker, Focus) vs P2 (defender) — P3 is not a participant and Lillia has no combat designation (462, 464.2.c.1)", async () => {
    // Expected: showdown at bfB with relevant players [P1, P2]; Runner attacker, Guard defender, Lillia
    // uninvolved (she is in P3's base). Actual: Lillia sits at bfB as a second "defender".
    const game = await board().build();
    await game.p1.cast("va", { targets: ["runner", "lillia"] });
    await drive(game, { lillia: "bfB", runner: "bfB" });
    await drive(game, {});
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bfB", defendingPlayer: P2, isCombatShowdown: true });
    expect([...(sd?.relevantPlayers ?? [])].sort()).toEqual([P1, P2]);
    expect(game.actingSeat()).toBe(P1); // attacker has Focus
    expect(game.state("runner").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.state("lillia").combatRole).toBeNull();
    expect(game.locationOf("lillia")).toBe("base");
  });

  // ── LEGAL contrast: Runner → bfB, Lillia → bfA ──────────────────────────────────────────

  test("LEGAL: Lillia → bfA (only P1's units there) is valid — she Moves bfC→bfA, P3 applies Contested at bfA, and her move trigger is pending on the chain (Closed state): no showdown has begun and the empty bfC is still P3's (323.6/323.13 need an Open state)", async () => {
    // Stop right after Lillia's destination is given (drive() would go on passing priority).
    const game = await board().build();
    await game.p1.cast("va", { targets: ["runner", "lillia"] });
    for (let i = 0; i < 30; i++) {
      const d = game.decision();
      if (isDestinationPick(d)) {
        const unit = d.source?.cardId;
        await game.p1.pick(d.options.find((o) => o.key.endsWith(unit === "lillia" ? "bfA" : "bfB"))!.key);
        if (unit === "lillia") {
          break;
        }
      } else if (d?.kind === "action" && d.context === "chain" && d.passKey) {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    expect(game.zoneOf("lillia")).toBe("battlefield-bfA");
    expect(game.zoneOf("runner")).toBe("battlefield-bfB");
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, contestedBy: P3, controller: P1 });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["lillia"]); // her "When I move" trigger, pending
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" }); // Closed state
    expect((game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active)).toHaveLength(0); // no combat begun yet
    expect(game.gameState.battlefields.bfC?.controller).toBe(P3); // not lost during the Closed state
    expect(sprites(game, "bfC")).toEqual([]); // the token comes only when the trigger resolves
  });

  test("LEGAL: the trigger resolves 'there' = bfC (her origin): a 3-Might [Temporary] Sprite token for P3 at bfC, so P3 KEEPS bfC through the following cleanup", async () => {
    const game = await board().build();
    await game.p1.cast("va", { targets: ["runner", "lillia"] });
    await drive(game, { lillia: "bfA", runner: "bfB" });
    const tok = sprites(game, "bfC");
    expect(tok).toHaveLength(1);
    expect(game.state(tok[0]!)).toMatchObject({ baseMight: 3, controller: P3, might: 3, zone: "battlefield-bfC" });
    expect(game.state(tok[0]!).keywords).toContain("Temporary");
    expect(game.gameState.battlefields.bfC).toMatchObject({ contested: false, controller: P3 });
  });

  test.failing("BUG: LEGAL: after the trigger, Neutral Open with TWO combats staged (bfA and bfB) — the TURN PLAYER P1 chooses which one begins first (323.13, 461.1); nothing auto-starts", async () => {
    // Expected: a decision for P1 naming both bfA and bfB, no showdown active yet. Actual: the engine
    // auto-begins the combat at bfA (P3 gets Focus) without asking P1.
    const game = await board().autoProcedures(false).build();
    await game.p1.cast("va", { targets: ["runner", "lillia"] });
    await drive(game, { lillia: "bfA", runner: "bfB" });
    expect(game.gameState.interaction?.showdownStack?.some((s) => s.active) ?? false).toBe(false);
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    const keys =
      d?.kind === "pick" ? d.options.map((o) => o.zone ?? o.key) : d?.kind === "action" ? d.options.map((o) => o.key) : [];
    expect(keys.some((k) => k.endsWith("bfA"))).toBe(true);
    expect(keys.some((k) => k.endsWith("bfB"))).toBe(true);
  });

  test("LEGAL: roles are fixed per battlefield with exactly two participants — at bfA P3 attacks (and holds Focus on P1's turn) and P1's Sentinel defends; meanwhile bfB's combat has NOT begun (460): Runner/Guard carry no designation yet and bfB stays contested/staged", async () => {
    const game = await board().build();
    await game.p1.cast("va", { targets: ["runner", "lillia"] });
    await drive(game, { lillia: "bfA", runner: "bfB" });
    const stack = game.gameState.interaction?.showdownStack ?? [];
    expect(stack.filter((s) => s.active)).toHaveLength(1); // one combat at a time
    const bfA = stack.find((s) => s.battlefieldId === "bfA");
    expect(bfA).toMatchObject({ active: true, attackingPlayer: P3, defendingPlayer: P1, focusPlayer: P3, isCombatShowdown: true });
    expect([...(bfA?.relevantPlayers ?? [])].sort()).toEqual([P1, P3]);
    expect(game.actingSeat()).toBe(P3);
    expect(game.state("lillia").combatRole).toBe("attacker");
    expect(game.state("sentinel").combatRole).toBe("defender");
    expect(game.state("runner").combatRole).toBeNull();
    expect(game.state("guard").combatRole).toBeNull();
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
  });

  test("LEGAL: bfA's combat FULLY ends — damage dealt, Sentinel (2) killed by Lillia (3), P3 conquers bfA — before bfB's showdown may open (460: no combat begins while another is ongoing elsewhere)", async () => {
    // Expected: once both participants pass Focus at bfA its damage/resolution steps run to completion,
    // and only then does the staged combat at bfB open. Actual: the engine opens bfB's showdown first
    // and defers BOTH combats' damage until bfB's showdown has also closed.
    const game = await board().build();
    await game.p1.cast("va", { targets: ["runner", "lillia"] });
    await drive(game, { lillia: "bfA", runner: "bfB" });
    await fightOut(game, "bfA");
    expect(game.gameState.interaction?.showdownStack?.at(-1)?.battlefieldId).toBe("bfB"); // bfB is up now…
    expect(game.zoneOf("sentinel")).toBe("trash"); // …so bfA must already be decided
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P3 });
    expect(game.seat(P3).points()).toBe(1);
  });

  test("LEGAL: when bfB's combat showdown opens, P1 (who contested) is the attacker with Focus and P2's Guard defends; P3 is not a participant there (462, 464.2.c.1)", async () => {
    const game = await board().build();
    await game.p1.cast("va", { targets: ["runner", "lillia"] });
    await drive(game, { lillia: "bfA", runner: "bfB" });
    await fightOut(game, "bfA");
    const sd = game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bfB", defendingPlayer: P2, focusPlayer: P1, isCombatShowdown: true });
    expect([...(sd?.relevantPlayers ?? [])].sort()).toEqual([P1, P2]);
    expect(game.actingSeat()).toBe(P1);
    expect(game.state("runner").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.state("lillia").combatRole).not.toBe("defender"); // she fights at bfA, never at bfB
    expect(game.locationOf("lillia")).toBe("bfA");
    expect(game.seat(P3).legal().some((o) => o.verb === "passFocus")).toBe(false); // P3 holds no Focus at bfB
  });

  test("LEGAL: end state once both combats are fought — bfA: Sentinel dead, P3 conquers (+1); bfB: Runner and Guard (3 vs 3) trade, nobody holds it; bfC still P3's via the Sprite; back to P1's open main phase", async () => {
    const game = await board().build();
    await game.p1.cast("va", { targets: ["runner", "lillia"] });
    await drive(game, { lillia: "bfA", runner: "bfB" });
    await fightOut(game, "bfA");
    await fightOut(game, "bfB");
    await game.settle();
    expect(game.zoneOf("sentinel")).toBe("trash");
    expect(game.locationOf("lillia")).toBe("bfA");
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P3 });
    expect(game.seat(P3).points()).toBe(1);
    expect(game.zoneOf("runner")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bfB?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.battlefields.bfC?.controller).toBe(P3);
    expect(sprites(game, "bfC")).toHaveLength(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── PARITY: the Standard Move obeys the same destination rule ───────────────────────────

  test("PARITY (144.4.a.1): on P3's turn, with P1's Runner and P2's Guard both at bfB, Lillia's Standard Move is offered bfA (one other player) but never bfB (two other players)", async () => {
    const game = await scenario({ players: 3 })
      .active(P3)
      .battlefield("bfA", { controller: P1 })
      .battlefield("bfB", { contested: true, contestedBy: P1, controller: P2 })
      .unit(P1, "bfA", { might: 2, name: "Sentinel" }, "sentinel")
      .unit(P2, "bfB", { might: 3, name: "Guard" }, "guard")
      .unit(P1, "bfB", { might: 3, name: "Runner" }, "runner")
      .unit(P3, "base", LILLIA, "lillia")
      .build();
    const p3 = game.seat(P3);
    expect(p3.option("standardMove:to:bfA")).toBeDefined();
    expect(p3.option("standardMove:to:bfB")).toBeUndefined();
    await expect(p3.move("lillia", "bfB")).rejects.toThrow();
    expect(game.zoneOf("lillia")).toBe("base");
  });
});
