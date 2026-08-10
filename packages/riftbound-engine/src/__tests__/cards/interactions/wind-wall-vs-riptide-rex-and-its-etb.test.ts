/**
 * Interaction: Wind Wall (ogn-064-298) · Spell · Calm · 3+[calm][calm] · Reaction
 *     "Counter a spell."
 *   × Not So Fast (sfd-045-221) · Spell · Calm · 2+[calm] · Reaction
 *     "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *   × Riptide Rex (ogn-092-298) · Unit · Mind · 6+[mind][mind] · 6 Might
 *     "When you play me, deal 6 to an enemy unit at a battlefield."
 *   (+ Noxus Hopeful ogn-012-298 "[Legion] — I cost [2] less" as a 'have you played a card' probe)
 *
 * Question: P1 plays Riptide Rex to base; its play trigger chooses P2's 5-Might unit U at bf1. P2
 * holds Wind Wall and Not So Fast with mana for either.
 *   (a) Is there any point at which P2 can Wind Wall "the Rex" so it never enters the board?
 *   (b) Can P2 Wind Wall the "deal 6" trigger?
 *   (c) Can P2 Not So Fast the trigger — and then: is Rex still on the board, still "played"
 *       (Legion-style checks), costs refunded?
 *   (d) If nobody responds?
 *
 * Rules: 337.2 / 359.2 (a finalized unit resolves immediately and becomes a game object — no
 * priority while it is pending, never a "spell"), 359.2.c (enters exhausted), 383.4.a.2 (the play
 * effect is put on the chain AFTER the unit entered), 337.4 (then priority), 355.9.a.2 ("spell" /
 * "ability" = chain objects; Wind Wall needs a SPELL), 355.8 (no legal target → cannot be played),
 * 425.1 / 425.1.a / 425.1.c (countered ability does nothing, is cleared, no refunds), 419.4.a (Rex's
 * play completed when it resolved — countering its trigger does not un-play it), 340.1 (LIFO).
 *
 * Expected: (a) No — never a window, never a spell. (b) No — it is an ability. (c) Yes: NSF resolves
 * first, trigger countered, U undamaged; Rex stays (exhausted, in base), 6+[mind][mind] stays spent,
 * Rex still counts as played (Hopeful's Legion is live). (d) 6 damage to U → U dies.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RIPTIDE_REX = "ogn-092-298";
const WIND_WALL = "ogn-064-298";
const NOT_SO_FAST = "sfd-045-221";
const NOXUS_HOPEFUL = "ogn-012-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

function targetsOffered(game: Game, seat: "p1" | "p2", alias: string): string[] {
  const opt = game[seat].option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/**
 * P1's turn with Rex's exact cost + 2 spare energy (8 + mind×2 → 2 left, which is exactly a
 * Legion-discounted Noxus Hopeful). P2: U (5 Might) at P2's bf1 — the only enemy unit at a battlefield —
 * plus a unit at home; Wind Wall + Not So Fast in hand with 5 energy + 3 calm (enough for both).
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .resources(P1, { energy: 8, power: { mind: 2 } })
    .resources(P2, { energy: 5, power: { calm: 3 } })
    .unit(P2, "bf1", { might: 5, name: "U" }, "u")
    .unit(P2, "base", { might: 2, name: "P2 Homebody" }, "p2home")
    .hand(P1, RIPTIDE_REX, "rex")
    .hand(P1, NOXUS_HOPEFUL, "hopeful")
    .hand(P2, WIND_WALL, "ww")
    .hand(P2, NOT_SO_FAST, "nsf");
}

/** Rex played to base; its play trigger (→ U) is on the chain and P1 passed → P2 holds priority. */
async function p2Responding(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("rex", { to: "base" });
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("u");
  }
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P2 });
  return game;
}

describe("Wind Wall / Not So Fast vs Riptide Rex and its play trigger", () => {
  // ── (a) no window to counter the unit itself ─────────────────────────────────────────────────

  test("(a) before the play P2 has nothing to act on (P1's Open main phase); the instant Rex is finalized it is ALREADY a game object in P1's base, exhausted — it never sits on the chain as a spell (337.2, 359.2, 359.2.c)", async () => {
    const game = await board().build();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p2.can("cast", "ww")).toBe(false);
    await game.p1.play("rex", { to: "base" });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("u");
    }
    expect(game.zoneOf("rex")).toBe("base");
    expect(game.state("rex")).toMatchObject({ controller: P1, isExhausted: true, might: 6 });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 0 } });
    // The only chain object is the triggered ABILITY (source Rex), added after Rex entered (383.4.a.2).
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "rex", controller: P1, triggered: true, type: "ability", targets: ["u"] }),
    ]);
    expect(game.chain().some((c) => c.type === "spell")).toBe(false);
  });

  test("(a)(b) when P2 does get priority (337.4) Wind Wall is NOT playable: the chain holds an ability, not a spell — no legal target, so it cannot even be put on the chain (355.9.a.2, 355.8)", async () => {
    const game = await p2Responding();
    expect(game.p2.can("cast", "ww")).toBe(false);
    expect(targetsOffered(game, "p2", "ww")).toEqual([]);
    await expect(game.p2.cast("ww")).rejects.toThrow();
    await expect(game.p2.cast("ww", { targets: "rex" })).rejects.toThrow();
    expect(game.p2.hand()).toContain("ww");
    expect(game.p2.resources()).toEqual({ energy: 5, power: { calm: 3 } });
  });

  // ── (c) Not So Fast on the trigger ───────────────────────────────────────────────────────────

  test("(c) Not So Fast IS legal for P2: an ENEMY ability that chooses P2's FRIENDLY unit U; its only offered target is Rex's trigger; P2 pays 2+[calm] and it goes on top of the chain", async () => {
    const game = await p2Responding();
    expect(game.p2.can("cast", "nsf")).toBe(true);
    expect(targetsOffered(game, "p2", "nsf")).toEqual(["rex"]);
    await game.p2.cast("nsf");
    expect(game.p2.resources()).toEqual({ energy: 3, power: { calm: 2 } });
    expect(game.chain().map((c) => [c.cardId, c.controller, c.type])).toEqual([
      ["rex", P1, "ability"],
      ["nsf", P2, "spell"],
    ]);
    // Aside: NOW Wind Wall has a legal target — but it is P2's own Not So Fast, still never "the Rex".
    expect(targetsOffered(game, "p2", "ww")).toEqual(["nsf"]);
  });

  test("(c) NSF resolves first (LIFO): the trigger is countered and cleared — U takes NO damage and survives at bf1 (340.1, 425.1.a)", async () => {
    const game = await p2Responding();
    await game.p2.cast("nsf");
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.chain()).toEqual([]);
    expect(game.state("u")).toMatchObject({ damage: 0, zone: "battlefield-bf1", might: 5 });
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("(c) Rex itself is untouched by the counter: still on the board in P1's base (exhausted, 6 Might), and P1's 6+[mind][mind] is NOT refunded (425.1.c)", async () => {
    const game = await p2Responding();
    await game.p2.cast("nsf");
    await game.settle();
    expect(game.zoneOf("rex")).toBe("base");
    expect(game.p1.units("base")).toContain("rex");
    expect(game.state("rex")).toMatchObject({ controller: P1, isExhausted: true, might: 6, damage: 0 });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 0 } });
    expect(game.p1.trash()).toEqual([]);
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
  });

  test("(c) Rex still counts as PLAYED this turn (only its ability was countered, 419.4.a vs 425.1.b): it is in P1's played-cards record and Noxus Hopeful's [Legion] discount is live — playable with the 2 energy left", async () => {
    const game = await p2Responding();
    await game.p2.cast("nsf");
    await game.settle();
    expect(game.gameState.cardsPlayedIdsThisTurn?.[P1] ?? []).toContain("rex");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("play", "hopeful")).toBe(true); // 4 − 2 (Legion) = 2
    await game.p1.play("hopeful", { to: "base" });
    await game.settle();
    expect(game.zoneOf("hopeful")).toBe("base");
    expect(game.p1.energy()).toBe(0);

    // control: with the same 2 energy but NO card played this turn, Hopeful (4) is not playable.
    const fresh = await scenario().resources(P1, { energy: 2 }).hand(P1, NOXUS_HOPEFUL, "hopeful").build();
    expect(fresh.p1.can("play", "hopeful")).toBe(false);
  });

  // ── (d) nobody responds ──────────────────────────────────────────────────────────────────────

  test("(d) if nobody responds the trigger resolves: 6 damage to the 5-Might U → U is killed to P2's trash; Rex stays in base; P2 keeps both counterspells", async () => {
    const game = await p2Responding();
    await game.p2.passPriority();
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("u")).toBe("trash");
    expect(game.p2.trash()).toContain("u");
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.zoneOf("rex")).toBe("base");
    expect(game.state("rex").isExhausted).toBe(true);
    expect(game.p2.hand().sort()).toEqual(["nsf", "ww"]);
    expect(game.p2.resources()).toEqual({ energy: 5, power: { calm: 3 } });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
