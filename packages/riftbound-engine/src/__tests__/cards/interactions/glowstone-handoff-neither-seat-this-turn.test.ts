/**
 * Interaction: Glowstone (ven-133-166) · Gear · Order · 2
 *     "[Empower] [rainbow][rainbow] ([rainbow][rainbow]: Empower me. Use only if not Empowered.)
 *      Disempower this, [Exhaust]: Choose a player. They gain control of this and recall it.
 *      At the end of your turn, kill this and deal 5 to all units you control."
 *   × Hextech Formula (ven-062-166) · Gear · Mind · 2
 *     "This enters exhausted. [Exhaust]: Empower another gear."
 *
 * Position: P1's turn, Neutral Open. P1 controls a ready, un-Empowered Glowstone; P2 controls a ready
 * Hextech Formula.
 *
 * Question: (a) before Empowering, is the give-away ability (cost "Disempower this, [Exhaust]") even in
 * P1's legal list? (b) [Empower]: chain item, P2 window? then the give-away: order of "choose a player"
 * vs paying Disempower+Exhaust, and does P2 get a window before the costs are paid? (c) after it
 * resolves naming P2, for the REST OF P1's TURN does either seat's legal list contain any Glowstone
 * ability, and does P2's contain Hextech Formula's? (d) does the end-of-turn trigger fire at the end of
 * P1's turn? (e) P2's turn: readied in Awaken? what is listed before/after Hextech Formula empowers it?
 * and if P2 keeps it, what happens at the end of P2's turn / whose trash?
 *
 * Rules: 381 + 151.2 (activated abilities: controller's turn, Open State only), 402.2 (choices made at
 * activation), 402.3 / 404.1 / 414.4 / 442.1.a (a cost that cannot be performed — Disempower a
 * non-Empowered gear — makes the ability illegal to activate), 827.1.c.1 ("Use only if not
 * Empowered"), 191.4.a ("you"/"your turn" = controller), 455 (Recall), 315.1.b (Awaken readies what
 * the turn player CONTROLS), 166.1, kill → OWNER's trash.
 *
 * Expected: (a) absent — only [Empower] is listed. (b) [Empower] pays [rainbow][rainbow] at activation,
 * is a chain item, P2 gets a priority window, resolves → Empowered. Give-away: player chosen at
 * activation (402.2) then Disempower+Exhaust paid (404.1), all before P2's first window. (c) Glowstone
 * → P2's base, controller P2, owner P1, exhausted, not Empowered; until P1's turn ends NEITHER seat
 * lists any Glowstone ability and P2 never lists Hextech Formula (not P2's turn), including P2's
 * Closed-state priority windows. (d) no trigger at the end of P1's turn. (e) P2's Awaken readies it;
 * P2 lists Glowstone [Empower] + Hextech Formula, give-away absent; after Formula empowers it the
 * give-away is listed and [Empower] absent; P1 lists nothing. Kept → at the end of P2's turn it is
 * killed into P1's trash and deals 5 to every unit P2 controls.
 */
import { describe, expect, test } from "bun:test";
import type { Game, Seat } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GLOWSTONE = "ven-133-166";
const HEXTECH_FORMULA = "ven-062-166";
const DISCIPLINE = "ogn-058-298"; // "Give a unit +2 Might this turn. Draw 1." — P1's throw-away spell to open a Closed state

const EMPOWER = "activateAbility:gs#0";
const GIVE_AWAY = "activateAbility:gs#1";
const FORMULA = "activateAbility:hf#1"; // #0 is "This enters exhausted"

/**
 * P1's turn 2, main phase. P1: Glowstone (ready, not Empowered), a 3-Might grunt, Discipline in hand,
 * 2 energy + [rainbow][rainbow]. P2: Hextech Formula (ready), a 3-Might grunt and a 6-Might bruiser,
 * [rainbow][rainbow] floating (it will NOT survive into P2's turn — 317.2.d).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 2 } })
    .resources(P2, { energy: 0, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 3, name: "P1 Grunt" }, "g1")
    .unit(P2, "base", { might: 3, name: "P2 Grunt" }, "g2")
    .unit(P2, "base", { might: 6, name: "P2 Bruiser" }, "big2")
    .gear(P1, GLOWSTONE, "gs")
    .gear(P2, HEXTECH_FORMULA, "hf")
    .hand(P1, DISCIPLINE, "disc");
}

function keys(game: Game, seat: Seat): string[] {
  return game.seat(seat).legal().map((o) => o.key);
}

function glowstoneKeys(game: Game, seat: Seat): string[] {
  return keys(game, seat).filter((k) => k.startsWith("activateAbility:gs#"));
}

/** P1 Empowers Glowstone and lets it resolve. */
async function empowered(): Promise<Game> {
  const game = await board().build();
  await game.p1.activate("gs", 0);
  await game.settle();
  expect(game.state("gs").isEmpowered).toBe(true);
  return game;
}

/** …then activates the give-away, everyone passes, P1 names P2, and it resolves. Still P1's turn, Neutral Open. */
async function handedToP2(): Promise<Game> {
  const game = await empowered();
  await game.p1.activate("gs", 1);
  await game.settle();
  if (game.decision()?.kind === "pick") {
    await game.p1.answer(P2);
  }
  await game.settle();
  expect(game.state("gs").controller).toBe(P2);
  expect(game.turnPlayer()).toBe(P1);
  return game;
}

/** …then P1 ends the turn and P2's turn settles into its Main Phase; P2 refills [rainbow][rainbow]. */
async function p2Turn(): Promise<Game> {
  const game = await handedToP2();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  expect(game.phase()).toBe("main");
  await game.p2.do("addResources", { power: { rainbow: 2 } });
  return game;
}

describe("Glowstone hand-off × Hextech Formula — who may activate what, and when", () => {
  // ── (a) an unpayable 'Disempower this' cost keeps the give-away off the menu ─────────────────

  test("(a) un-Empowered Glowstone: only [Empower] is listed for P1; the give-away (cost 'Disempower this') is ABSENT and rejected (402.3, 442.1.a, 414.4)", async () => {
    const game = await board().build();
    expect(game.state("gs")).toMatchObject({ controller: P1, isEmpowered: false, isReady: true });
    expect(glowstoneKeys(game, P1)).toEqual([EMPOWER]);
    expect(game.p1.can(GIVE_AWAY)).toBe(false);
    await expect(game.p1.activate("gs", 1)).rejects.toThrow();
    expect(game.state("gs")).toMatchObject({ controller: P1, isExhausted: false, zone: "base" });
  });

  test("(a) P2 has no actions at all in P1's Neutral Open state — no Hextech Formula, nothing (381, 151.2)", async () => {
    const game = await board().build();
    expect(keys(game, P2)).toEqual([]);
    expect(game.p2.can(FORMULA)).toBe(false);
  });

  // ── (b) [Empower], then the give-away's activation sequence ──────────────────────────────────

  test("(b) [Empower] pays [rainbow][rainbow] at activation and becomes P1's (non-triggered) chain item; Glowstone is not yet Empowered", async () => {
    const game = await board().build();
    await game.p1.activate("gs", 0);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gs", controller: P1, triggered: false, type: "ability" })]);
    expect(game.state("gs").isEmpowered).toBe(false);
  });

  test("(b) P2 gets a Closed-state priority window on the [Empower] item (pass only — its own gear ability is not offered there); it resolves → Empowered", async () => {
    const game = await board().build();
    await game.p1.activate("gs", 0);
    expect(game.actingSeat()).toBe(P1);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(keys(game, P2)).toContain("passChainPriority:-");
    expect(keys(game, P2)).not.toContain(FORMULA);
    expect(glowstoneKeys(game, P2)).toEqual([]);
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("gs")).toMatchObject({ controller: P1, isEmpowered: true, isReady: true });
  });

  test("(b) once Empowered: the give-away is LISTED and [Empower] is ABSENT ('Use only if not Empowered', 827.1.c.1)", async () => {
    const game = await empowered();
    expect(glowstoneKeys(game, P1)).toEqual([GIVE_AWAY]);
    expect(game.p1.can(EMPOWER)).toBe(false);
    await expect(game.p1.activate("gs", 0)).rejects.toThrow();
  });

  test("(b) give-away: Disempower + [Exhaust] are paid during activation — Glowstone is already exhausted and un-Empowered when the item hits the chain, before anyone has priority (404.1)", async () => {
    const game = await empowered();
    await game.p1.activate("gs", 1);
    expect(game.state("gs")).toMatchObject({ controller: P1, isEmpowered: false, isExhausted: true, zone: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gs", controller: P1, triggered: false })]);
  });

  test("(b) P2's first window on the give-away sees the costs already paid; P2 may only pass (no Formula, no Glowstone ability)", async () => {
    const game = await empowered();
    await game.p1.activate("gs", 1);
    // rule 402.2 — the player is named as part of activating, before any window.
    if (game.decision()?.kind === "pick") {
      await game.p1.answer(P2);
    }
    if (game.actingSeat() === P1 && game.decision()?.kind === "action") {
      await game.p1.passPriority();
    }
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.state("gs")).toMatchObject({ isEmpowered: false, isExhausted: true });
    expect(keys(game, P2)).not.toContain(FORMULA);
    expect(glowstoneKeys(game, P2)).toEqual([]);
  });

  // 402.2 → 404.1: "Choose a player" is one of the choices made as the ability is ACTIVATED (step 2),
  // before costs (step 4) and before the item is finalized — so P1 is asked to name the player
  // immediately, ahead of any priority window.
  test("(b) the player is chosen at activation (402.2), before P2's priority window", async () => {
    const game = await empowered();
    await game.p1.activate("gs", 1);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.seatRef ?? o.key) : []).toContain(P2);
    expect(d?.timing).not.toBe("RES");
  });

  test("(b) naming P2: on resolution P2 gains control and Glowstone is recalled into P2's base — owner still P1, still exhausted, not Empowered (455)", async () => {
    const game = await empowered();
    await game.p1.activate("gs", 1);
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect((game.decision() as { options: { key: string }[] }).options.map((o) => o.key).sort()).toEqual([P1, P2]);
    await game.p1.answer(P2);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("gs")).toMatchObject({ controller: P2, isEmpowered: false, isExhausted: true, owner: P1, zone: "base" });
    expect(game.p2.gear()).toContain("gs");
    expect(game.p2.base()).toContain("gs");
    expect(game.p1.gear()).not.toContain("gs");
  });

  // ── (c) rest of P1's turn: nobody may touch Glowstone, P2 may not touch Formula ──────────────

  test("(c) Neutral Open, still P1's turn: P1 lists NO Glowstone ability (no longer controls it, 191.4.a); P2 lists nothing at all — no Glowstone, no Hextech Formula (381, 151.2)", async () => {
    const game = await handedToP2();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(glowstoneKeys(game, P1)).toEqual([]);
    expect(keys(game, P2)).toEqual([]);
    expect(glowstoneKeys(game, P2)).toEqual([]);
    expect(game.p2.can(FORMULA)).toBe(false);
    expect(game.p2.can(EMPOWER)).toBe(false);
    expect(game.p2.can(GIVE_AWAY)).toBe(false);
  });

  test("(c) P1 plays a spell → P2's Closed-state priority window: P2 may pass, but neither Glowstone ability nor Hextech Formula is in P2's list (not P2's turn, not an Open State)", async () => {
    const game = await handedToP2();
    await game.p1.cast("disc", { targets: "g1" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc"]);
    // P1 (turn player) holds priority first; its own list has nothing Glowstone either.
    expect(game.actingSeat()).toBe(P1);
    expect(glowstoneKeys(game, P1)).toEqual([]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    const p2 = keys(game, P2);
    expect(p2).toContain("passChainPriority:-");
    expect(p2).not.toContain(FORMULA);
    expect(p2).not.toContain(EMPOWER);
    expect(p2).not.toContain(GIVE_AWAY);
    expect(glowstoneKeys(game, P2)).toEqual([]);
    // rejection as well as absence
    await expect(game.p2.activate("hf")).rejects.toThrow();
    await expect(game.p2.activate("gs", 0)).rejects.toThrow();
    await game.settle();
    expect(game.zoneOf("disc")).toBe("trash");
    // back to Neutral Open: still nothing for either seat
    expect(glowstoneKeys(game, P1)).toEqual([]);
    expect(keys(game, P2)).toEqual([]);
  });

  // ── (d) 'At the end of YOUR turn' = the controller's (P2's) turn ─────────────────────────────

  test("(d) ending P1's turn puts NO Glowstone trigger on the chain; P2's units are undamaged and Glowstone is still in P2's base when P2's turn begins", async () => {
    const game = await handedToP2();
    await game.p1.endTurn();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("gs")).toBe("base");
    expect(game.state("gs").controller).toBe(P2);
    expect(game.state("g2")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("big2")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("g1")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.p1.trash()).toEqual([]); // nothing of P1's died or was killed
  });

  // ── (e) P2's turn ────────────────────────────────────────────────────────────────────────────

  test("(e) P2's Awaken readies everything P2 CONTROLS — including P1's Glowstone (315.1.b)", async () => {
    const game = await handedToP2();
    expect(game.state("gs").isExhausted).toBe(true);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("gs")).toMatchObject({ controller: P2, isExhausted: false, isReady: true, owner: P1 });
  });

  test("(e) P2's Main Phase (with [rainbow][rainbow] in pool): listed for P2 = Glowstone [Empower] + Hextech Formula; give-away ABSENT (not Empowered); P1 lists nothing", async () => {
    const game = await p2Turn();
    expect(game.p2.resources().power.rainbow).toBe(2);
    expect(glowstoneKeys(game, P2)).toEqual([EMPOWER]);
    expect(keys(game, P2)).toContain(FORMULA);
    expect(game.p2.can(GIVE_AWAY)).toBe(false);
    expect(keys(game, P1)).toEqual([]);
  });

  test("(e) the P2 pool that floated during P1's turn is gone (317.2.d): without a refill [Empower] is NOT listed for P2, only Hextech Formula", async () => {
    const game = await handedToP2();
    await game.advanceTurn();
    expect(game.p2.resources().power.rainbow ?? 0).toBe(0);
    expect(glowstoneKeys(game, P2)).toEqual([]);
    expect(keys(game, P2)).toContain(FORMULA);
  });

  test("(e) P2 exhausts Hextech Formula on Glowstone: chain item (target = Glowstone, its only 'another gear'), resolves → Glowstone Empowered WITHOUT spending P2's [rainbow][rainbow]", async () => {
    const game = await p2Turn();
    await game.p2.activate("hf");
    expect(game.state("hf").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hf", controller: P2, targets: ["gs"], triggered: false })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("gs")).toMatchObject({ controller: P2, isEmpowered: true, isReady: true });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 2 } });
  });

  test("(e) …after which the give-away is LISTED for P2 and [Empower] is ABSENT (827.1.c.1); still nothing Glowstone-related for P1", async () => {
    const game = await p2Turn();
    await game.p2.activate("hf");
    await game.settle();
    expect(glowstoneKeys(game, P2)).toEqual([GIVE_AWAY]);
    expect(game.p2.can(EMPOWER)).toBe(false);
    expect(keys(game, P1)).toEqual([]);
    expect(glowstoneKeys(game, P1)).toEqual([]);
  });

  test("(e) P2 keeps it: at the end of P2's turn the trigger (controller P2) goes on the chain, kills Glowstone into its OWNER P1's trash and deals 5 to every unit P2 controls (3-Might grunt dies; 6-Might bruiser survives, healed at 317.2); P1's unit untouched", async () => {
    const game = await p2Turn();
    await game.p2.activate("hf");
    await game.settle();
    await game.p2.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gs", controller: P2, triggered: true })]);
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("gs")).toBe("trash");
    expect(game.p1.trash()).toContain("gs"); // owner's trash
    expect(game.p2.trash()).not.toContain("gs");
    expect(game.zoneOf("g2")).toBe("trash");
    expect(game.p2.trash()).toContain("g2");
    expect(game.state("big2")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.trace().expiration[0]?.healed).toContain("big2"); // it DID take the 5, then healed in the Expiration Step
    expect(game.state("g1")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("(e) same outcome if P2 never empowers it — the end-of-turn trigger does not care about Empowered", async () => {
    const game = await handedToP2();
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // P2 ends → trigger → P1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.trash()).toContain("gs");
    expect(game.zoneOf("g2")).toBe("trash");
    expect(game.zoneOf("big2")).toBe("base");
    expect(game.zoneOf("g1")).toBe("base");
  });
});
