/**
 * Interaction: Pyke, Returned (unl-145-219) · Champion Unit · Chaos · 3 · 3 Might
 *     "[Hidden] [Backline] Once each turn, when an enemy unit dies while I'm at a battlefield, play a
 *      Gold gear token exhausted."
 *   × Zhonya's Hourglass (ogn-077-298) · Gear · Calm · 2
 *     "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Question: P1's turn. P2's face-up Pyke (3) holds bf1 alone.
 *   Case A: P1 attacks bf1 with a vanilla 3-Might unit; combat damage is mutually lethal and both units
 *           are killed in the same Combat Cleanup — does P2 get a Gold token?
 *   Case B: same, but P2 has a face-up Zhonya's Hourglass in base: Pyke's death is replaced by a recall
 *           to base in the very same kill step in which P1's attacker dies — is Pyke "at a battlefield"
 *           for his condition (Gold token)? Who ends up controlling bf1?
 *   Case C: P1 attacks with a 2-Might unit instead; the attacker dies, Pyke survives at bf1 — Gold
 *           token? Which player finalizes that item during P1's turn and who gets priority first?
 *
 * Rules: 383.2.c (a trigger condition is evaluated AFTER the inciting event has been processed),
 * 383.2.c.2 (a permanent that leaves the relevant zone in the same event cannot see it — Viktor
 * example), 383.2.a.1 ("while I'm at a battlefield" directly follows the condition → part of the
 * condition, not look-back information; 323.4 / 808.1.d.3 only snapshot units dying to their OWN death
 * triggers), 323.5 (Cleanup 3b: all lethally-damaged units are killed simultaneously), 466.1.a.1 (3c:
 * heal all units), 455 / 456.1 (a recall is not a move), 466.3.d (recalled / nobody remains → no combat
 * result), 466.5.b / 323.6 (no unit left → battlefield uncontrolled), 466.2 (the chain from the Combat
 * Cleanup resolves before the Resolution Step continues), 337.4 (controller of the newest item gets
 * priority first), 383.3.e.1 (once each turn).
 *
 * Expected:
 *   A — both die simultaneously in 3b; right afterwards Pyke is in the trash, not at a battlefield → no
 *       trigger, no Gold. Nobody remains → no result; bf1 becomes uncontrolled.
 *   B — the one kill event is modified by Zhonya's: Hourglass → P2's trash, Pyke healed, exhausted and
 *       recalled to P2's base, P1's attacker → trash, all as one event. Evaluated right after it Pyke is
 *       in base → condition false → NO Gold (the Hourglass dying is a gear, not an enemy unit). No P2
 *       unit at bf1 → P2 loses control of bf1; P1 conquers nothing.
 *   C — attacker (2) takes 3 → dies; Pyke takes 2 < 3 → survives at bf1. Pyke is on the board at a
 *       battlefield after the kill → triggers once: it is P2's item on P1's turn — P2 (controller of the
 *       newest item) receives priority first, then P1; on resolution P2 plays one exhausted Gold gear
 *       token. Then P2 (only side remaining) keeps bf1 as defender; Pyke is healed by the Combat Cleanup.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PYKE = "unl-145-219";
const ZHONYAS = "ogn-077-298";

const golds = (game: Game, seat: "p1" | "p2") =>
  [...game[seat].base(), ...game[seat].gear()].filter((id, i, a) => a.indexOf(id) === i && game.state(id).name === "Gold");

function board(opts: { attackerMight: number; zhonyas?: boolean }) {
  const s = scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", PYKE, "pyke")
    .unit(P1, "base", { might: opts.attackerMight, name: "Vanilla Attacker" }, "atk");
  return opts.zhonyas ? s.gear(P2, ZHONYAS, "zh") : s;
}

/**
 * Pass focus/priority (taking default damage splits / forced procedure steps) until either `stop`
 * says so or the game is back in an open main-phase state. Returns the decisions seen.
 */
async function drive(game: Game, stop: (d: Decision) => boolean = () => false): Promise<Decision[]> {
  const seen: Decision[] = [];
  for (let i = 0; i < 40; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    seen.push(d);
    if (stop(d)) {
      break;
    }
    if (d.kind === "action") {
      if (d.passKey) {
        await game.seat(d.seat).pass();
      } else if (d.context === "procedure" && d.options[0]) {
        await game.seat(d.seat).choose(d.options[0].key);
      } else {
        break;
      }
      continue;
    }
    if (d.kind === "distribute" && d.defaultAllocation) {
      await game.seat(d.seat).distribute({ ...d.defaultAllocation });
      continue;
    }
    if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
      continue;
    }
    break;
  }
  return seen;
}

async function attackAndSettle(opts: { attackerMight: number; zhonyas?: boolean }): Promise<Game> {
  const game = await board(opts).build();
  expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  await game.p1.move("atk", "bf1");
  const r = await game.settle();
  expect(r.reason).toBe("open");
  expect(game.chain()).toEqual([]);
  return game;
}

describe("Pyke, Returned × Zhonya's Hourglass — 'while I'm at a battlefield' evaluated after the kill event (383.2.c)", () => {
  // ---- Case A: mutual lethal, no Hourglass --------------------------------------------------------

  test("A: 3 vs 3 — both units are killed in the same Combat Cleanup (323.5): attacker and Pyke both in trash", async () => {
    const game = await attackAndSettle({ attackerMight: 3 });
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("pyke")).toBe("trash");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p2.units("bf1")).toEqual([]);
  });

  test("A: Pyke left the board in the same event as the enemy death → condition cannot be evaluated (383.2.c.2): NO Gold token", async () => {
    const game = await attackAndSettle({ attackerMight: 3 });
    expect(golds(game, "p2")).toEqual([]);
    expect(golds(game, "p1")).toEqual([]);
  });

  test("A: Pyke's trigger is never put on the chain on the way (no P2 item appears at any point)", async () => {
    const game = await board({ attackerMight: 3 }).build();
    await game.p1.move("atk", "bf1");
    const seen = await drive(game, () => game.chain().some((c) => c.cardId === "pyke"));
    expect(game.chain().some((c) => c.cardId === "pyke")).toBe(false);
    expect(seen.some((d) => d.kind !== "action" && d.seat === P2)).toBe(false);
    await game.settle();
    expect(golds(game, "p2")).toEqual([]);
  });

  test("A: nobody remains → no combat result; bf1 becomes uncontrolled, P1 scores nothing (466.3.d, 466.5.b / 323.6)", async () => {
    const game = await attackAndSettle({ attackerMight: 3 });
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  // ---- Case B: mutual lethal, Zhonya's replaces Pyke's death with a recall ---------------------------

  test("B: Zhonya's replaces Pyke's death — Hourglass to P2's trash, Pyke healed + exhausted in P2's BASE; P1's attacker in trash", async () => {
    const game = await attackAndSettle({ attackerMight: 3, zhonyas: true });
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("pyke")).toBe("base");
    expect(game.locationOf("pyke")).toBe("base");
    expect(game.state("pyke").damage).toBe(0);
    expect(game.state("pyke").isExhausted).toBe(true);
    expect(game.state("pyke").controller).toBe(P2);
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.p2.trash()).not.toContain("pyke");
  });

  test("B: right after the single kill event Pyke is in base, not at a battlefield (383.2.c, 455) → NO Gold token", async () => {
    const game = await attackAndSettle({ attackerMight: 3, zhonyas: true });
    expect(golds(game, "p2")).toEqual([]);
    expect(golds(game, "p1")).toEqual([]);
  });

  test("B: Pyke's trigger never appears on the chain during the Cleanup (the Hourglass dying is a gear, not an enemy unit)", async () => {
    const game = await board({ attackerMight: 3, zhonyas: true }).build();
    await game.p1.move("atk", "bf1");
    await drive(game, () => game.chain().some((c) => c.cardId === "pyke"));
    expect(game.chain().some((c) => c.cardId === "pyke")).toBe(false);
    await game.settle();
    expect(golds(game, "p2")).toEqual([]);
  });

  test("B: units were recalled / none remain → no result (466.3.d): P2 LOSES control of bf1 (no P2 unit there), P1 does not conquer", async () => {
    const game = await attackAndSettle({ attackerMight: 3, zhonyas: true });
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // ---- Case C: 2-Might attacker dies alone; Pyke survives at bf1 → trigger ------------------------

  test("C: 2 vs 3 — the attacker dies, Pyke survives at bf1; Pyke's trigger goes on the chain as P2's item and P2 gets priority FIRST on P1's turn (337.4)", async () => {
    const game = await board({ attackerMight: 2 }).build();
    await game.p1.move("atk", "bf1");
    await drive(game, () => game.chain().some((c) => c.cardId === "pyke"));
    const items = game.chain();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ cardId: "pyke", controller: P2, triggered: true });
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("pyke")).toBe("battlefield-bf1");
    expect(game.turnPlayer()).toBe(P1);
    // No choices to make while finalizing → straight to priority, newest item's controller first.
    const d = game.decision();
    expect(d?.kind).toBe("action");
    expect(d?.seat).toBe(P2);
    expect(game.actingSeat()).toBe(P2);
    expect(golds(game, "p2")).toEqual([]); // not resolved yet
    // P2 passes → P1 gets priority next, item still pending.
    await game.p2.passPriority();
    expect(game.chain()).toHaveLength(1);
    expect(game.actingSeat()).toBe(P1);
    await game.p1.passPriority();
    expect(game.chain()).toEqual([]);
    expect(golds(game, "p2")).toHaveLength(1);
  });

  test("C: after everything resolves P2 has exactly ONE Gold gear token, exhausted, in P2's base (383.3.e.1); P1 has none", async () => {
    const game = await attackAndSettle({ attackerMight: 2 });
    const g = golds(game, "p2");
    expect(g).toHaveLength(1);
    expect(game.state(g[0]!)).toMatchObject({ cardType: "gear", controller: P2, isExhausted: true, isToken: true });
    expect(golds(game, "p1")).toEqual([]);
  });

  test("C: P2 (only side remaining) keeps bf1 as defender, no points change hands; Pyke stays at bf1 healed by the Combat Cleanup (466.1.a.1, 466.3.a)", async () => {
    const game = await attackAndSettle({ attackerMight: 2 });
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("pyke")).toBe("battlefield-bf1");
    expect(game.state("pyke").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.violations()).toEqual([]);
  });

  test("C (with Hourglass present but unused): Pyke does not die, Zhonya's stays on the board, and the Gold token is still created", async () => {
    const game = await attackAndSettle({ attackerMight: 2, zhonyas: true });
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.zoneOf("pyke")).toBe("battlefield-bf1");
    expect(golds(game, "p2")).toHaveLength(1);
  });
});
