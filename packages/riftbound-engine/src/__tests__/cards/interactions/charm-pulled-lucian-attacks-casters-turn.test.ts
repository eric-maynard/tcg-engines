/**
 * Interaction: Charm (ogn-043-298) · Spell · Calm · 1 + [calm] · Action — "Move an enemy unit."
 *   × Lucian, Gunslinger (sfd-028-221) · Champion Unit · Fury · 3 · 2 Might
 *     "[Assault] (+1 [Might] while I'm an attacker.) When I attack, deal damage equal to my
 *      [Assault] to an enemy unit here."
 *   × Kha'Zix, Mutating Horror (unl-143-219) · Champion Unit · Chaos · 4 · 4 Might
 *     "[Ambush] … When I attack or defend, if an enemy unit is alone here, give me +2 [Might] this
 *      turn and gain 2 XP."
 *
 * Rules: 190.3.a / 190.3.a.1 / 450 (Contested is applied by the ARRIVING unit's controller),
 * 446.3 / 449.1 (an effect move is instantaneous; bf→bf is fine), 323.6 (a battlefield emptied of
 * its controller's units in an Open state becomes uncontrolled), 323.8/323.9/323.12/323.13 (the
 * Cleanup stages and — in a Neutral Open state — begins the Showdown/Combat), 344.2 / 345 / 348.2.a
 * (non-combat showdown: contesting player has Focus; if only their units remain they conquer),
 * 464.2.c.1 / .c.3 / .d / .e.1 (Attacker = whoever applied Contested; attacker's triggers go on the
 * Combat Chain first, defender's on top; Attacker holds Focus), 383.4.e/.f (attack / defend
 * triggers), 807.1.c (Assault live while attacker), 420.3.a (only the Standard Move exhausts).
 *
 * Question: P1's turn, Neutral Open. P1 holds bfA with Kha'Zix alone; P2 holds bfB with Lucian
 * alone; bfC empty/uncontrolled. P1 resolves Charm on Lucian.
 *   YES  → bfA: P2 is the Attacker on P1's turn; Lucian's attack trigger and Kha'Zix's defend
 *          trigger both fire (Kha'Zix's on top → resolves first: 6 Might, +2 XP; then Lucian pings
 *          Kha'Zix for 1); P2 holds Focus; combat: Lucian 3 into Kha'Zix 6 (survives), Kha'Zix
 *          kills Lucian; P1 keeps bfA, no points; Lucian never exhausted; bfB goes uncontrolled.
 *   NO   → bfC: non-combat Showdown begins at once with P2 holding Focus on P1's turn; all pass →
 *          P2 conquers bfC and scores 1.
 *   NEUTRAL → P2's base: nothing staged.
 *   PARITY: identical to P2 Standard-Moving Lucian base→bfA on P2's turn, except Lucian is
 *          exhausted and it is P2's turn.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const LUCIAN = "sfd-028-221";
const KHAZIX = "unl-143-219";

function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .battlefield("bfC", { controller: null })
    .unit(P1, "bfA", KHAZIX, "khazix")
    .unit(P2, "bfB", LUCIAN, "lucian")
    .hand(P1, CHARM, "charm");
}

/** Cast Charm on Lucian, let it resolve, and answer the destination prompt. */
async function charmLucianTo(game: Game, destination: "battlefield-bfA" | "battlefield-bfC" | "base"): Promise<void> {
  await game.p1.cast("charm", { targets: "lucian" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { pendingChoiceType: "choose-destination" } });
  await game.p1.pick(destination);
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);
const bf = (game: Game, id: string) => game.gameState.battlefields[id];

describe("Charm pulls Lucian onto Kha'Zix's battlefield on the CASTER's turn", () => {
  test("setup: Charm offers only the enemy unit; the destination menu is base / bfA / bfC (not its current bfB)", async () => {
    const game = await board().build();
    expect(game.p1.option("cast", "charm")?.fields.find((f) => f.arg === "targets")?.options).toEqual([["lucian"]]);
    await game.p1.cast("charm", { targets: "lucian" });
    await game.settle();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["base", "battlefield-bfA", "battlefield-bfC"]);
  });

  // ── YES: destination bfA (P1's battlefield, Kha'Zix alone there) ────────────────────────────

  test("YES: the move is instantaneous bf→bf; Contested at bfA is applied BY P2 (the arriving unit's controller), not by the caster (190.3.a, 450, 446.3)", async () => {
    const game = await board().build();
    await charmLucianTo(game, "battlefield-bfA");
    expect(game.locationOf("lucian")).toBe("bfA");
    expect(game.zoneOf("charm")).toBe("trash");
    expect(bf(game, "bfA")).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
  });

  test("YES: bfB, now empty of P2's units in an Open state, becomes uncontrolled (323.6)", async () => {
    const game = await board().build();
    await charmLucianTo(game, "battlefield-bfA");
    expect(game.p2.units("bfB")).toEqual([]);
    expect(bf(game, "bfB")?.controller).toBeNull();
  });

  test("YES: Combat begins at bfA in that same Cleanup (Neutral Open, 323.13) — on P1's turn P2 is the ATTACKER and holds Focus, P1 the Defender (464.2.c.1, 464.2.d)", async () => {
    const game = await board().build();
    await charmLucianTo(game, "battlefield-bfA");
    expect(game.turnPlayer()).toBe(P1);
    expect(showdown(game)).toMatchObject({
      active: true,
      attackingPlayer: P2,
      battlefieldId: "bfA",
      defendingPlayer: P1,
      focusPlayer: P2,
      isCombatShowdown: true,
    });
    expect(game.state("lucian").combatRole).toBe("attacker");
    expect(game.state("khazix").combatRole).toBe("defender");
  });

  test("YES: Lucian's Assault is live (3 Might) and he was NOT exhausted by the effect move (807.1.c, 420.3.a)", async () => {
    const game = await board().build();
    await charmLucianTo(game, "battlefield-bfA");
    expect(game.state("lucian").might).toBe(3);
    expect(game.state("lucian").isExhausted).toBe(false);
  });

  test("YES: both triggers fire although P2 chose nothing — Lucian's 'When I attack' (P2, bottom) and Kha'Zix's 'When I defend, if an enemy unit is alone here' (P1, on top) (383.4.e/f, 464.2.e.1)", async () => {
    const game = await board().build();
    await charmLucianTo(game, "battlefield-bfA");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "lucian", controller: P2, triggered: true }),
      expect.objectContaining({ cardId: "khazix", controller: P1, triggered: true }),
    ]);
    // Nothing has resolved yet.
    expect(game.state("khazix")).toMatchObject({ damage: 0, might: 4 });
    expect(game.p1.xp()).toBe(0);
  });

  test("YES: LIFO — Kha'Zix's trigger resolves first (+2 Might → 6, P1 +2 XP), then Lucian's deals 1 (his Assault) to Kha'Zix", async () => {
    const game = await board().build();
    await charmLucianTo(game, "battlefield-bfA");
    await game.p1.passPriority();
    await game.p2.passPriority(); // top item (Kha'Zix) resolves
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "lucian", controller: P2, triggered: true })]);
    expect(game.state("khazix")).toMatchObject({ damage: 0, might: 6 });
    expect(game.p1.xp()).toBe(2);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Lucian's trigger resolves — Kha'Zix is the only enemy unit there
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("khazix");
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("khazix")).toMatchObject({ damage: 1, might: 6 });
    expect(game.state("lucian").damage).toBe(0);
  });

  test("YES: after the trigger-only Combat Chain empties, Focus stays with the Attacker P2 — P2 acts first in the showdown on P1's turn (464.2.d, 346.1)", async () => {
    const game = await board().build();
    await charmLucianTo(game, "battlefield-bfA");
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind === "pick") {
        await game.seat(d.seat).pick("khazix");
      } else {
        await game.acting().passPriority();
      }
    }
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P2, isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.turnPlayer()).toBe(P1);
  });

  test("YES: combat damage — Lucian 3 into Kha'Zix (6 Might, 1+3 = 4 < 6 survives, healed after), Kha'Zix 6 kills Lucian; P1 keeps bfA as defender, nobody scores, P1 has 2 XP, still P1's turn", async () => {
    const game = await board().build();
    await charmLucianTo(game, "battlefield-bfA");
    await game.settle();
    expect(game.zoneOf("lucian")).toBe("trash");
    expect(game.state("khazix")).toMatchObject({ damage: 0, might: 6, zone: "battlefield-bfA" });
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: P1 });
    expect(bf(game, "bfB")?.controller).toBeNull();
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.p1.xp()).toBe(2);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── NO: destination bfC (empty, uncontrolled) ───────────────────────────────────────────────

  test("NO (→ bfC): P2 contests bfC; only a non-combat Showdown is staged and, being Neutral Open, begins immediately with P2 holding Focus on P1's turn; no triggers, no roles (323.12, 344.2, 345)", async () => {
    const game = await board().build();
    await charmLucianTo(game, "battlefield-bfC");
    expect(game.locationOf("lucian")).toBe("bfC");
    expect(bf(game, "bfC")).toMatchObject({ contested: true, contestedBy: P2, controller: null });
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bfC", focusPlayer: P2, isCombatShowdown: false });
    expect(game.chain()).toEqual([]);
    expect(game.state("lucian")).toMatchObject({ combatRole: null, isExhausted: false, might: 2 });
    expect(game.state("khazix").might).toBe(4);
    expect(game.p1.xp()).toBe(0);
    // rule 344.2 — settle() hands the Cleanup-begun showdown back once: P2 to act, on P1's turn.
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.turnPlayer()).toBe(P1);
  });

  test("NO (→ bfC): everyone passes → only P2's unit remains → P2 establishes control = Conquer, +1 point for P2 DURING P1's turn; bfB uncontrolled (348.2.a/.a.1, 323.6)", async () => {
    const game = await board().build();
    await charmLucianTo(game, "battlefield-bfC");
    await game.settle(); // handed back once (see above)
    await game.settle(); // both pass focus → showdown ends
    expect(bf(game, "bfC")).toMatchObject({ contested: false, controller: P2 });
    expect(bf(game, "bfB")?.controller).toBeNull();
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── NEUTRAL: destination P2's base ──────────────────────────────────────────────────────────

  test("NEUTRAL (→ P2's base): bases are never Contested — nothing staged, no chain, no showdown; bfB uncontrolled; straight back to P1's open main phase", async () => {
    const game = await board().build();
    await charmLucianTo(game, "base");
    expect(game.locationOf("lucian")).toBe("base");
    expect(game.state("lucian")).toMatchObject({ controller: P2, isExhausted: false, owner: P2 });
    expect(game.chain()).toEqual([]);
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(Object.values(game.gameState.battlefields).some((b) => b.contested)).toBe(false);
    expect(bf(game, "bfB")?.controller).toBeNull();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.points() + game.p2.points()).toBe(0);
  });

  // ── PARITY: P2 Standard-Moves Lucian base → bfA on P2's own turn ────────────────────────────

  test("PARITY: P2 Standard-Moving Lucian base→bfA on P2's turn yields the same roles, Focus, trigger order and combat result — only differences: Lucian is exhausted by the move and it is P2's turn", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bfA", { controller: P1 })
      .battlefield("bfB", { controller: P2 })
      .battlefield("bfC", { controller: null })
      .unit(P1, "bfA", KHAZIX, "khazix")
      .unit(P2, "base", LUCIAN, "lucian")
      .build();
    await game.p2.move("lucian", "bfA");
    expect(game.state("lucian").isExhausted).toBe(true); // the Standard Move's cost (420.3.a)
    expect(bf(game, "bfA")).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(showdown(game)).toMatchObject({ attackingPlayer: P2, defendingPlayer: P1, focusPlayer: P2, isCombatShowdown: true });
    expect(game.state("lucian")).toMatchObject({ combatRole: "attacker", might: 3 });
    expect(game.state("khazix").combatRole).toBe("defender");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "lucian", controller: P2, triggered: true }),
      expect.objectContaining({ cardId: "khazix", controller: P1, triggered: true }),
    ]);
    await game.settle();
    expect(game.zoneOf("lucian")).toBe("trash");
    expect(game.state("khazix")).toMatchObject({ damage: 0, might: 6, zone: "battlefield-bfA" });
    expect(bf(game, "bfA")).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.xp()).toBe(2);
    expect(game.p1.points() + game.p2.points()).toBe(0);
    expect(game.turnPlayer()).toBe(P2);
  });
});
