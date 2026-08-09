/**
 * Interaction: Zilean, Time Mage (unl-086-219) · Champion Unit · Mind · 5 · 5 Might
 *     "Once each turn, if you would play a token unit while I'm at a battlefield, you may play that
 *      token and an additional copy of it instead."
 *   × Mirror Image (unl-200-219) · Spell · Mind/Order · 3 + 2 power · Action
 *     "Choose a unit. Play a ready Reflection unit token to your base. It becomes a copy of that unit.
 *      Give it [Temporary]."
 *   (copied unit: P2's Peak Guardian ogn-223-298 · Unit · Order · 6 · 5 Might · "When you play me, buff
 *    me. …" — buffed and damaged; probe for (d): Lillia, Protector of Dreams unl-058-219 · "When you play
 *    a token unit, give me +1 [Might] this turn. Your token units have [Tank].")
 *
 * Rules: 371.1 / 371.2 / 371.2.b (optional once-per-turn replacement: applied only if chosen; a declined
 * offer has "not been applied this turn"), 375 (the replacing event inherits the modifications of the
 * generating effect and linked follow-ups — cf. the extra Recruit that is also given Temporary),
 * 477.1.b.1 / .a / .b (a copy takes PRINTED copyable traits: name, type, tags, cost, domain, rules text,
 * Might — no buff, no damage), 182 / 183 (tokens are owned/controlled by the player who played them),
 * 185.2.a / 439.2.c (a token put onto the board by an effect is PLAYED), 383.2.c (the copied unit's own
 * "When you play me" does not fire — the token was played as a vanilla Reflection before it became a
 * copy), 816.1.b (Temporary).
 *
 * Question / expected:
 *   (a) Zilean at bf1, P1 applies it: TWO ready tokens in P1's base, EACH a printed copy of Peak Guardian
 *       (5 Might, unbuffed, undamaged) with Temporary — not one copy + one naked 0-Might Reflection.
 *   (b) a second Mirror Image the same turn → exactly one token; had P1 DECLINED on the first cast the
 *       offer is still live for the second (1 token, then 2).
 *   (c) Zilean in base → no offer, one token.
 *   (d) both tokens were "played": Lillia triggers twice (+2); neither token is buffed by the copied
 *       "When you play me, buff me".
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZILEAN = "unl-086-219";
const MIRROR_IMAGE = "unl-200-219";
const PEAK_GUARDIAN = "ogn-223-298";
const LILLIA = "unl-058-219";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1 (turn player): Zilean at bf1 (or in base), two Mirror Images and 6 energy + mind×2 + order×2 (two casts).
 * P2: Peak Guardian at bf2 — buffed (+1) with 2 damage → reads 6 Might.
 */
function board(zileanAt: "bf1" | "base" = "bf1") {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, zileanAt, ZILEAN, "zilean")
    .unit(P2, "bf2", PEAK_GUARDIAN, "peak", { buffed: true, damage: 2 })
    .resources(P1, { energy: 6, power: { mind: 2, order: 2 } })
    .hand(P1, MIRROR_IMAGE, "mirror1")
    .hand(P1, MIRROR_IMAGE, "mirror2");
}

/** Cards now in P1's base that were not in `before` (the freshly played tokens). */
function newInBase(game: Game, before: readonly string[]): string[] {
  return game.p1.base().filter((id) => !before.includes(id));
}

/** Cast `mirror` at Peak Guardian, settle to Zilean's offer (if any) and answer it; returns the new tokens. */
async function castMirror(game: Game, mirror: "mirror1" | "mirror2", zilean: "yes" | "no" | "not-offered"): Promise<string[]> {
  const before = game.p1.base();
  await game.p1.cast(mirror, { targets: "peak" });
  await game.settle();
  const d = game.decision();
  if (zilean === "not-offered") {
    expect(d?.kind).toBe("action");
  } else {
    expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
    await (zilean === "yes" ? game.p1.yes() : game.p1.no());
    await game.settle();
  }
  expect(game.zoneOf(mirror)).toBe("trash");
  return newInBase(game, before);
}

function expectPrintedPeakCopy(game: Game, token: string): void {
  const t = game.state(token);
  expect(t.isToken).toBe(true);
  expect(t.cardType).toBe("unit");
  expect(t.name).toBe("Peak Guardian");
  expect(t.energyCost).toBe(6);
  expect(t.domains).toEqual(["order"]);
  expect(t.baseMight).toBe(5);
  expect(t.might).toBe(5);
  expect(t.isBuffed).toBe(false);
  expect(t.damage).toBe(0);
  expect(t.isReady).toBe(true);
  expect(t.location).toBe("base");
  expect(t.owner).toBe(P1);
  expect(t.controller).toBe(P1);
  expect(t.keywords).toContain("Temporary");
}

describe("Zilean, Time Mage × Mirror Image — the additional copy is a full second Reflection-copy", () => {
  test("premise: Peak Guardian reads 6 Might (5 printed +1 buff) with 2 damage; Mirror Image offers it as a choice and costs 3 energy + 2 power", async () => {
    const game = await board().build();
    expect(game.state("peak")).toMatchObject({ baseMight: 5, damage: 2, isBuffed: true, might: 6 });
    const field = game.p1.option("cast", "mirror1")?.fields.find((f) => f.name === "targets");
    expect((field?.options ?? []).flat()).toContain("peak");
    await game.p1.cast("mirror1", { targets: "peak" });
    expect(game.p1.energy()).toBe(3);
    expect(game.p1.power()).toBe(2);
  });

  // ── (a) Zilean applied ────────────────────────────────────────────────────────────────────────

  test("(a) with Zilean at a battlefield the replacement is OFFERED ('you may', 371.2) when Mirror Image resolves; accepting yields TWO tokens in P1's base, both READY, both P1-owned/controlled, both with Temporary (375, 182/183)", async () => {
    const game = await board().build();
    const tokens = await castMirror(game, "mirror1", "yes");
    expect(tokens).toHaveLength(2);
    for (const tok of tokens) {
      const t = game.state(tok);
      expect(t.isToken).toBe(true);
      expect(t.isReady).toBe(true);
      expect(t.location).toBe("base");
      expect(t.owner).toBe(P1);
      expect(t.controller).toBe(P1);
      expect(t.keywords).toContain("Temporary");
    }
    expect(game.chain()).toEqual([]);
    // the original is untouched
    expect(game.state("peak")).toMatchObject({ controller: P2, damage: 2, isBuffed: true, location: "bf2", might: 6 });
  });

  test("(a) the FIRST token is a printed copy of Peak Guardian: name/type/cost/domain, 5 Might, no buff, no damage (477.1.b.1.a/.b)", async () => {
    const game = await board().build();
    const tokens = await castMirror(game, "mirror1", "yes");
    expect(tokens.length).toBeGreaterThanOrEqual(1);
    const copies = tokens.filter((t) => game.state(t).name === "Peak Guardian");
    expect(copies.length).toBeGreaterThanOrEqual(1);
    expectPrintedPeakCopy(game, copies[0] as string);
  });

  // Expected: the additional token is "an additional copy of it" — the replacement inherits the linked
  // "It becomes a copy of that unit" (375), so BOTH tokens are 5-Might Peak Guardian copies.
  // Actual: the second token is a naked 0-Might domainless "Reflection" (ready, Temporary) that never
  // becomes a copy of the chosen unit.
  test("(a) the ADDITIONAL token must also become a printed copy of Peak Guardian (5 Might, Order, cost 6) — not a naked 0-Might Reflection (375, 477.1.b.1)", async () => {
    const game = await board().build();
    const tokens = await castMirror(game, "mirror1", "yes");
    expect(tokens).toHaveLength(2);
    for (const tok of tokens) {
      expectPrintedPeakCopy(game, tok);
    }
    expect(game.findAll({ name: "Peak Guardian" })).toHaveLength(3); // original + two copies
  });

  // ── (b) once each turn ────────────────────────────────────────────────────────────────────────

  test("(b) having APPLIED Zilean to the first Mirror Image, the second Mirror Image this turn gets no offer and makes exactly one token (371.1)", async () => {
    const game = await board().build();
    const first = await castMirror(game, "mirror1", "yes");
    expect(first).toHaveLength(2);
    const second = await castMirror(game, "mirror2", "not-offered");
    expect(second).toHaveLength(1);
    expectPrintedPeakCopy(game, second[0] as string);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0, order: 0 } });
  });

  test("(b) having DECLINED on the first cast (1 token), the replacement 'has not been applied this turn' (371.2.b): the second Mirror Image offers it again → 2 tokens", async () => {
    const game = await board().build();
    const first = await castMirror(game, "mirror1", "no");
    expect(first).toHaveLength(1);
    expectPrintedPeakCopy(game, first[0] as string);
    const second = await castMirror(game, "mirror2", "yes");
    expect(second).toHaveLength(2);
  });

  test("(b) the once-per-turn use refreshes next turn: after applying it this turn, on P1's NEXT turn a Mirror Image is offered the extra copy again", async () => {
    const game = await board().build();
    await castMirror(game, "mirror1", "yes");
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 (Temporary kills last turn's tokens; pool refilled below)
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 3, power: { mind: 1, order: 1 } });
    const before = game.p1.base();
    await game.p1.cast("mirror2", { targets: "peak" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(newInBase(game, before)).toHaveLength(2);
  });

  // ── (c) Zilean not at a battlefield ───────────────────────────────────────────────────────────

  test("(c) Zilean in BASE: 'while I'm at a battlefield' is false → no offer at all, exactly one (proper) token", async () => {
    const game = await board("base").build();
    const tokens = await castMirror(game, "mirror1", "not-offered");
    expect(tokens).toHaveLength(1);
    expectPrintedPeakCopy(game, tokens[0] as string);
  });

  // ── (d) both tokens were 'played' ─────────────────────────────────────────────────────────────

  test("(d) both tokens count as PLAYED (185.2.a / 439.2.c): Lillia's 'When you play a token unit, +1 Might this turn' fires twice (4 → 6); with a single token (Zilean declined) only once (4 → 5)", async () => {
    const two = await board().unit(P1, "base", LILLIA, "lillia").build();
    expect(two.state("lillia").might).toBe(4);
    expect(await castMirror(two, "mirror1", "yes")).toHaveLength(2);
    expect(two.chain()).toEqual([]);
    expect(two.state("lillia").might).toBe(6);

    const one = await board().unit(P1, "base", LILLIA, "lillia").build();
    expect(await castMirror(one, "mirror1", "no")).toHaveLength(1);
    expect(one.state("lillia").might).toBe(5);
  });

  test("(d) …yet the copied 'When you play me, buff me' fires for NEITHER token — each was played as a vanilla Reflection before becoming a copy (383.2.c): no token is buffed, nothing waits on the chain", async () => {
    const game = await board().build();
    const tokens = await castMirror(game, "mirror1", "yes");
    expect(tokens).toHaveLength(2);
    expect(game.chain()).toEqual([]);
    for (const tok of tokens) {
      expect(game.state(tok).isBuffed).toBe(false);
    }
    expect(game.state("zilean").isBuffed).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("Temporary on BOTH tokens: at the start of P1's next Beginning Phase both are killed and, being tokens, cease to exist (816.1.b, 186.1)", async () => {
    const game = await board().build();
    const tokens = await castMirror(game, "mirror1", "yes");
    expect(tokens).toHaveLength(2);
    await game.advanceTurn(); // → P2
    for (const tok of tokens) {
      expect(game.p1.base()).toContain(tok);
    }
    await game.advanceTurn(); // → P1
    expect(game.turnPlayer()).toBe(P1);
    for (const tok of tokens) {
      expect(game.p1.base()).not.toContain(tok);
      expect(game.has(tok) ? game.zoneOf(tok) : "gone").toBe("gone");
    }
  });
});
