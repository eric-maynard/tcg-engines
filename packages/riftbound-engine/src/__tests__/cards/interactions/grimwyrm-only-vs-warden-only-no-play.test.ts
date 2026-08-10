/**
 * Interaction: Perched Grimwyrm (sfd-015-221) × Mageseeker Warden (ogn-070-298) — two "only" restrictions
 *              with an empty intersection; plus an effect-play "to your base" (Rift Herald, unl-179-219).
 *
 *   Perched Grimwyrm — Unit · Fury · 4 · 5 Might
 *     "Play me only to a battlefield you conquered this turn. (You can't play me anywhere else.)"
 *   Mageseeker Warden — Unit · Calm · 6 · 5 Might
 *     "While I'm at a battlefield, opponents can only play units to their base. …"
 *   Rift Herald — Unit · Order · 8 · 7 Might
 *     "[Deathknell] — Play a unit from your hand to your base, ignoring its Energy cost."
 *
 * Rules: 054.1 (forbid beats permit), 054.2 ("only" = under no other circumstances), 355.2 / 355.2.a (a
 * unit play must choose a VALID location), 358.5 (a failed legality check unwinds the whole play), 469.1 vs
 * 469.2 (Conquer = gaining control; Hold = keeping it through your Beginning Phase — not a conquer), 055 /
 * 358.3.a (impossible instructions are skipped), 128.6 (a typed play from a private zone may be declined).
 *
 * Question. P1 holds Grimwyrm. bfA: P1's since last turn (scored by HOLDING this turn). bfB: P1 conquered it
 * THIS turn. P2's Warden sits at bfC. P1 has 4+ energy, Main Phase, Open state.
 *  (a) Warden at C: is Grimwyrm offered anywhere (base? B?) — and if forced, what is the post-state?
 *  (b) Warden in base / killed mid-turn: offered where — base? A (held)? B? C?
 *  (c) Before anything was conquered this turn (no Warden)?
 *  (d) Does "play a unit from your hand to your base" (Rift Herald's Deathknell) get Grimwyrm into base?
 *
 * Expected. (a) {B} ∩ {base} = ∅ → not offered at all; a forced attempt unwinds: still in hand, pool intact,
 * no chain, no "card played" bookkeeping. (b) exactly {B}: not base, not A (held ≠ conquered), not C; playing
 * to B works — enters exhausted, pays 4. (c) not offered until the conquer of B completes. (d) No: the
 * instruction names base, Grimwyrm forbids base → impossible for Grimwyrm, it stays in hand.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GRIMWYRM = "sfd-015-221";
const WARDEN = "ogn-070-298";
const RIFT_HERALD = "unl-179-219";
const VENGEANCE = "ogn-229-298"; // Action spell, 4 + [order][order]: "Kill a unit."
const VANGUARD_SERGEANT = "ogn-219-298"; // vanilla 4-cost unit (control for "a unit with no restriction of its own")

/** Normalised play locations offered for `alias` from P1's hand ("base" | battlefield id). */
function playLocations(game: Game, alias: string): string[] {
  const raw = game.p1.option("play", alias)?.fields.find((f) => f.arg === "to")?.options ?? [];
  return raw.map((v) => String(v).replace(/^battlefield-/, "")).toSorted();
}

/**
 * End of P2's turn 2. bfA: P1's Holder (2) — P1 will HOLD it at the start of turn 3. bfB: P2's Speedbump (1),
 * which P1's Runner (5) will run over on turn 3 → conquered THIS turn. bfC: P2's — the Warden stands there
 * (or in P2's base for the no-Warden side). P1's hand: Grimwyrm, a vanilla Sergeant, Vengeance.
 */
function board(wardenAt: "bfC" | "base" = "bfC") {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .battlefield("bfC", { controller: P2 })
    .unit(P1, "bfA", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 5, name: "Runner" }, "runner")
    .unit(P2, "bfB", { might: 1, name: "Speedbump" }, "bump")
    .unit(P2, "bfC", { might: 1, name: "Sentry" }, "sentry")
    .unit(P2, wardenAt, WARDEN, "warden")
    .hand(P1, GRIMWYRM, "grim")
    .hand(P1, VANGUARD_SERGEANT, "sarge")
    .hand(P1, VENGEANCE, "venge");
}

/** Advance into P1's turn 3 (A is held & scored), fill P1's pool, and — unless told not to — conquer bfB with the Runner. */
async function p1Turn(wardenAt: "bfC" | "base" = "bfC", conquerB = true): Promise<Game> {
  const game = await board(wardenAt).build();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  await game.p1.do("addResources", { energy: 8, power: { order: 2 } });
  if (conquerB) {
    await game.p1.move("runner", "bfB");
    await game.settle();
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  }
  return game;
}

describe("Perched Grimwyrm 'only to a conquered battlefield' × Mageseeker Warden 'only to base'", () => {
  test("premise: on turn 3 P1 scored bfA by HOLDING (469.2) and bfB by CONQUERING (469.1) — only bfB is in the conquered-this-turn set", async () => {
    const game = await p1Turn();
    expect(game.gameState.scoredThisTurn?.[P1]).toContain("bfA");
    expect(game.gameState.conqueredThisTurn?.[P1]).toEqual(["bfB"]);
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.locationOf("warden")).toBe("bfC");
  });

  // ── (a) Warden at a battlefield: {bfB} ∩ {base} = ∅ ───────────────────────────────────────

  test("(a) Warden at bfC: Grimwyrm is NOT offered anywhere — not to base (its own 'only'), not to bfB (Warden's 'only') (054.1, 054.2)", async () => {
    const game = await p1Turn();
    expect(game.p1.energy()).toBeGreaterThanOrEqual(4);
    expect(game.p1.can("play", "grim")).toBe(false);
    expect(playLocations(game, "grim")).toEqual([]);
    // Control: Warden's restriction alone still leaves a vanilla unit playable — to base only.
    expect(game.p1.can("play", "sarge")).toBe(true);
    expect(playLocations(game, "sarge")).toEqual(["base"]);
  });

  test("(a) a forced attempt (to base or to bfB) is rejected and fully unwound: Grimwyrm in hand, pool untouched, no chain, no 'card played' count (355.2, 358.5)", async () => {
    const game = await p1Turn();
    const pool = game.p1.resources();
    const played = game.gameState.cardsPlayedThisTurn?.[P1] ?? 0;
    await expect(game.p1.play("grim", { to: "base" })).rejects.toThrow();
    await expect(game.p1.play("grim", { to: "bfB" })).rejects.toThrow();
    await expect(game.p1.do("playUnit", { cardId: "grim", location: "base", playerId: P1 })).rejects.toThrow();
    await expect(game.p1.do("playUnit", { cardId: "grim", location: "battlefield-bfB", playerId: P1 })).rejects.toThrow();
    expect(game.zoneOf("grim")).toBe("hand");
    expect(game.p1.resources()).toEqual(pool);
    expect(game.chain()).toEqual([]);
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(played);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── (b) no Warden at a battlefield: only Grimwyrm's own restriction ───────────────────────

  test("(b) Warden in P2's BASE: Grimwyrm is offered exactly {bfB} — not base, not held bfA (Hold ≠ Conquer), not bfC", async () => {
    const game = await p1Turn("base");
    expect(game.locationOf("warden")).toBe("base");
    expect(game.p1.can("play", "grim")).toBe(true);
    expect(playLocations(game, "grim")).toEqual(["bfB"]);
    await expect(game.p1.play("grim", { to: "base" })).rejects.toThrow();
    await expect(game.p1.play("grim", { to: "bfA" })).rejects.toThrow();
    expect(game.zoneOf("grim")).toBe("hand");
    // Control: with no Warden text live, the vanilla unit may go to base, bfA or bfB.
    expect(playLocations(game, "sarge")).toEqual(["base", "bfA", "bfB"]);
  });

  test("(b) playing Grimwyrm to bfB succeeds: it enters bfB exhausted as a 5-Might unit and P1 pays 4 energy", async () => {
    const game = await p1Turn("base");
    const before = game.p1.energy();
    await game.p1.play("grim", { to: "bfB" });
    await game.settle();
    expect(game.zoneOf("grim")).toBe("battlefield-bfB");
    expect(game.state("grim")).toMatchObject({ isExhausted: true, might: 5 });
    expect(game.p1.energy()).toBe(before - 4);
    expect(game.violations()).toEqual([]);
  });

  test("(b) Warden KILLED mid-turn (Vengeance): 'while I'm at a battlefield' switches off → Grimwyrm goes from not-offered to offered at {bfB} only", async () => {
    const game = await p1Turn();
    expect(playLocations(game, "grim")).toEqual([]);
    await game.p1.cast("venge", { targets: "warden" });
    await game.settle();
    expect(game.zoneOf("warden")).toBe("trash");
    expect(game.p1.energy()).toBe(4); // 8 − Vengeance's 4
    expect(game.p1.can("play", "grim")).toBe(true);
    expect(playLocations(game, "grim")).toEqual(["bfB"]);
    await game.p1.play("grim", { to: "bfB" });
    await game.settle();
    expect(game.locationOf("grim")).toBe("bfB");
    expect(game.p1.energy()).toBe(0);
  });

  // ── (c) nothing conquered yet ─────────────────────────────────────────────────────────────

  test("(c) before P1 has conquered anything this turn (no Warden) Grimwyrm is not offered at all; it becomes offered — to bfB only — once the conquer completes (054.2)", async () => {
    const game = await p1Turn("base", false);
    expect(game.gameState.conqueredThisTurn?.[P1]).toEqual([]);
    expect(game.gameState.scoredThisTurn?.[P1]).toContain("bfA"); // holding A does not count
    expect(game.p1.can("play", "grim")).toBe(false);
    expect(playLocations(game, "grim")).toEqual([]);
    await game.p1.move("runner", "bfB");
    await game.settle();
    expect(game.gameState.conqueredThisTurn?.[P1]).toEqual(["bfB"]);
    expect(playLocations(game, "grim")).toEqual(["bfB"]);
  });

  // ── (d) effect-play "from your hand to your base" ─────────────────────────────────────────

  /** P1's turn: Rift Herald in base, Grimwyrm + Sergeant in hand; P1 kills its own Herald with Vengeance → Deathknell resolves. */
  async function deathknell(conqueredFirst = false): Promise<Game> {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { order: 2 } })
      .battlefield("bfB", { controller: null })
      .unit(P1, "base", RIFT_HERALD, "herald")
      .unit(P1, "base", { might: 2, name: "Runner" }, "runner")
      .hand(P1, GRIMWYRM, "grim")
      .hand(P1, VANGUARD_SERGEANT, "sarge")
      .hand(P1, VENGEANCE, "venge")
      .build();
    if (conqueredFirst) {
      await game.p1.move("runner", "bfB");
      await game.settle();
      await game.settle();
      expect(game.gameState.conqueredThisTurn?.[P1]).toEqual(["bfB"]);
    }
    await game.p1.cast("venge", { targets: "herald" });
    await game.settle();
    expect(game.zoneOf("herald")).toBe("trash");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, allowDecline: true }); // 128.6 — declinable
    return game;
  }

  test("(d) control: the Deathknell play works for an unrestricted unit — Sergeant lands in base with its Energy cost ignored", async () => {
    const game = await deathknell();
    await game.p1.pick("sarge");
    await game.settle();
    expect(game.zoneOf("sarge")).toBe("base");
    expect(game.p1.energy()).toBe(0); // 4 − Vengeance 4; the Sergeant's 4 was ignored
    expect(game.zoneOf("grim")).toBe("hand");
  });

  // Expected (054.1 / 055 / 358.3.a): the instruction names BASE and Grimwyrm can never be played to base, so
  // Grimwyrm is not an eligible card for this play — only the Sergeant is offered. Actual: both are offered.
  test("(d) 'play a unit from your hand to your base' does not offer Grimwyrm — base is never a legal location for it (054.1, 054.2)", async () => {
    const game = await deathknell();
    const d = game.decision();
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : [];
    expect(offered).toEqual(["sarge"]);
  });

  // Expected: even after conquering bfB this turn the Deathknell still says "to your base" — impossible for
  // Grimwyrm; naming it does nothing and it stays in hand (never base, never bfB). Actual: it enters base.
  test("(d) naming Grimwyrm for the Deathknell play leaves it in HAND — it is not dropped into base (nor re-routed to conquered bfB) (055, 358.3.a)", async () => {
    const game = await deathknell(true);
    const r = await game.p1.try((p) => p.pick("grim"));
    await game.settle();
    expect(game.zoneOf("grim")).not.toBe("base");
    expect(game.zoneOf("grim")).not.toBe("battlefield-bfB");
    expect(game.zoneOf("grim")).toBe("hand");
    expect(r.ok === false || game.zoneOf("grim") === "hand").toBe(true);
  });
});
