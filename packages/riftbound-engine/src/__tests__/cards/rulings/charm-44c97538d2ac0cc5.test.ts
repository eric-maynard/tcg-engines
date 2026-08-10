/**
 * Ruling 44c97538d2ac0cc5 — Charm (OGN-043 → ogn-043-298) · Spell · Calm · 1+[calm] "Move an enemy unit."
 *   × Tasty Faefolk (OGN-075 → ogn-075-298) 6 Might · × Thousand-Tailed Watcher (OGN-116 → ogn-116-298) 7 Might
 *   × Wuju Bladesman - Starter (ogs-019-024, Master Yi legend) "While a friendly unit defends alone, it gets +2 [Might]."
 *
 * Q1: Charm an opponent's unit from a battlefield they control to an EMPTY battlefield — do they score?
 * A1: Yes, they conquer it (if they have not already scored that battlefield this turn).
 * Q2: After winning a combat with Faefolk, I Charm the enemy Watcher into that battlefield — is damage healed between
 *     the combats? A2: Yes; units heal after each combat. Faefolk defends alone at 8 Might (6 + Yi's 2), undamaged.
 *     Damage never reduces Might anyway.
 * Rules: 469.1 (conquer = gain control of a bf not yet scored this turn), 190.4 (control), 466 (post-combat heal).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const TASTY_FAEFOLK = "ogn-075-298";
const WATCHER = "ogn-116-298";
const WUJU = "ogs-019-024";

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** settle() hands an auto-begun non-combat showdown back once (so it can be observed); settle through it. */
async function settleThroughShowdown(game: Game): Promise<void> {
  const s = await game.settle();
  if (s.reason === "open" && game.decision()?.kind === "action" && (game.decision() as { context?: string }).context === "showdown") {
    await game.settle();
  }
}

/** Cast Charm on `unit`, pick `dest`, let it resolve. */
async function charm(game: Game, alias: string, unit: string, dest: string): Promise<void> {
  await game.p1.cast(alias, { targets: unit });
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toContain(dest);
  await game.p1.pick(dest);
  await game.p1.passPriority();
  if (game.decision()?.seat === P2 && game.chain().length > 0) {
    await game.p2.passPriority();
  }
  expect(game.zoneOf(alias)).toBe("trash");
}

describe("Ruling 44c97538d2ac0cc5 (part 1) — Charming an enemy unit onto an empty battlefield lets its controller conquer it", () => {
  function board() {
    return scenario()
      .resources(P1, { energy: 3, power: { calm: 3 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P2, "bf1", { might: 3, name: "Unit X" }, "X")
      .unit(P2, "bf1", { might: 2, name: "Unit Y" }, "Y")
      .hand(P1, CHARM, "charm1")
      .hand(P1, CHARM, "charm2")
      .hand(P1, CHARM, "charm3");
  }

  test("X Charmed from P2's bf1 to the empty bf2: after the (non-combat) showdown closes P2 controls bf2 and scores 1 — on P1's turn", async () => {
    const game = await board().build();
    expect(game.p2.points()).toBe(0);
    await charm(game, "charm1", "X", "battlefield-bf2");
    expect(game.locationOf("X")).toBe("bf2");
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf2", isCombatShowdown: false });
    await settleThroughShowdown(game); // both pass focus → control established
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("…but only once per battlefield per turn: X leaves bf2 (Charmed to base), then Y is Charmed onto the again-empty bf2 — P2 regains control without a second point", async () => {
    const game = await board().build();
    await charm(game, "charm1", "X", "battlefield-bf2");
    await settleThroughShowdown(game);
    expect(game.p2.points()).toBe(1);
    await charm(game, "charm2", "X", "base");
    await settleThroughShowdown(game);
    expect(game.locationOf("X")).toBe("base");
    expect(game.gameState.battlefields.bf2?.controller ?? null).toBe(null); // 190.4.c — empty bf: control lost
    await charm(game, "charm3", "Y", "battlefield-bf2");
    await settleThroughShowdown(game);
    expect(game.locationOf("Y")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1); // already scored bf2 this turn
    expect(game.violations()).toEqual([]);
  });
});

describe("Ruling 44c97538d2ac0cc5 (part 2) — damage heals after each combat; a Charmed-in attacker meets an undamaged 8-Might Faefolk", () => {
  /** P1 (Master Yi legend) with a ready Faefolk in base; P2 holds bf1 with a 4-Might Guard and has Watcher (7) at bf2. */
  function board() {
    return scenario()
      .legend(P1, WUJU, "yi")
      .resources(P1, { energy: 1, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", TASTY_FAEFOLK, "faefolk")
      .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
      .unit(P2, "bf2", WATCHER, "watcher")
      .hand(P1, CHARM, "charm");
  }

  test("Faefolk attacks bf1, takes 4 and kills the Guard, conquers — and is fully healed once combat resolves", async () => {
    const game = await board().build();
    await game.p1.move("faefolk", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, isCombatShowdown: true });
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.locationOf("faefolk")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("faefolk").damage).toBe(0); // healed after combat
    expect(game.state("faefolk").might).toBe(6);
  });

  test("then Charm pulls the enemy Watcher into bf1: a new combat where Faefolk DEFENDS alone at 8 Might (6 + Yi's 2) with no damage on it; Watcher (7) dies, Faefolk survives and is healed again", async () => {
    const game = await board().build();
    await game.p1.move("faefolk", "bf1");
    await game.settle();
    expect(game.state("faefolk").damage).toBe(0);
    await charm(game, "charm", "watcher", "battlefield-bf1");
    expect(game.locationOf("watcher")).toBe("bf1");
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("faefolk").combatRole).toBe("defender");
    expect(game.state("watcher").combatRole).toBe("attacker");
    expect(game.state("faefolk").damage).toBe(0);
    expect(game.state("faefolk").might).toBe(8);
    await game.settle();
    expect(game.zoneOf("watcher")).toBe("trash"); // 8 ≥ 7
    expect(game.locationOf("faefolk")).toBe("bf1"); // 7 < 8
    expect(game.state("faefolk").damage).toBe(0); // healed after this combat too
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("nuance: marked damage never lowers Might — a damaged Faefolk still reads its full Might", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", TASTY_FAEFOLK, "faefolk", { damage: 3 })
      .build();
    expect(game.state("faefolk").damage).toBe(3);
    expect(game.state("faefolk").might).toBe(6);
  });
});
