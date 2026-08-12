/**
 * Interaction: Zenith Blade (ogn-262-298) · Spell · Calm/Order · 3 · [Action]
 *     "Stun an enemy unit at a battlefield. You may move a friendly unit to that enemy unit's battlefield."
 *   × Ride the Wind (ogn-173-298) · Spell · Chaos · 2 · [Action] · "Move a friendly unit and ready it."
 *   × Flash (ogs-011-024) · Spell · Chaos · 2 · [Reaction] · "Move up to 2 friendly units to base."
 *
 * Board: a showdown at bf1 (so [Action] speed is live for both players — P1 pokes into P2's bf1).
 * P2's enemy unit E is at bf1; P1's friendly F waits in base; bf2 is a second, P2-held battlefield.
 * P1 casts Zenith Blade naming E and F.
 *
 * FINALIZATION (rules 355.4, 355.5, 355.12, 355.15): E is chosen; F is chosen independently of the
 * optional "you may" (355.12 — a "may perform a Game Action on some number of objects" makes every
 * choice targeted and chosen apart from the decision to perform it); and because a Move is involved the
 * destination is chosen NOW — "that enemy unit's battlefield" resolves to bf1 at that instant and is
 * frozen there (355.4 / 355.15).
 *
 * Questions and expected answers:
 *  (a) P2 responds by moving E from bf1 to bf2 and readying it. E at bf2 still satisfies "an enemy unit
 *      at a battlefield", so it is still a legal target and IS stunned (359.3.e.2). But the destination
 *      is not re-derived from E's current location: F moves to bf1, NOT bf2. P1 does not get to
 *      redirect. This is the pure lock direction.
 *      NB: Ride the Wind is an [Action] and 449.1 / 320.1 make Actions legal only in an OPEN state, so
 *      it can never be played "in response" to a chain item — that fact is asserted below, and the
 *      response itself is made with an inline Reaction-speed stand-in carrying Ride the Wind's effect.
 *  (b) P2 instead responds with Flash, moving E to P2's base. E in base fails "at a battlefield" → the
 *      target is illegal → the stun is ignored and E is unaffected (359.3.e.2, 359.3.e.5). The move
 *      instruction references "that enemy unit", so the two instructions are LINKED (359.3.e.14);
 *      because the earlier linked instruction was ignored, the later one is ignored too (359.3.e.14.a).
 *      F does NOT move, even though bf1 is still a valid, already-chosen destination. This is the case
 *      judges get wrong — a locked destination does not rescue a linked instruction.
 *  (c) If someone stuns E in reaction first, the redundant stun does nothing (423.1.a.1) but the
 *      instruction still executed on a legal target, so the linked move still happens and F reaches bf1.
 *
 * Asserting (a) and (b) together pins both directions: in (a) the anchor must NOT follow E, in (b) the
 * move must NOT happen despite the anchor surviving.
 *
 * Rules: 355.4, 355.5, 355.12, 355.15, 449.1, 359.3.e.2, 359.3.e.5, 359.3.e.6, 359.3.e.14,
 * 359.3.e.14.a, 423.1.a.1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZENITH_BLADE = "ogn-262-298";
const RIDE_THE_WIND = "ogn-173-298";
const FLASH = "ogs-011-024";

/** Ride the Wind's move at REACTION speed — the only way a unit can change battlefields mid-chain (320.1). */
const GALE = {
  abilities: [{ effect: { target: { controller: "friendly", type: "unit" }, to: "choose", type: "move" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  name: "Test Gale",
  rulesText: "[Reaction] Move a friendly unit.",
  timing: "reaction",
};

/** A second stun, at Reaction speed, so (c) can pre-stun Zenith Blade's target. */
const JOLT = {
  abilities: [{ effect: { target: { type: "unit" }, type: "stun" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  name: "Test Jolt",
  rulesText: "[Reaction] Stun a unit.",
  timing: "reaction",
};

function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { calm: 2, order: 1 } })
    .resources(P2, { energy: 6, power: { chaos: 3 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Enemy E" }, "E")
    .unit(P2, "bf2", { might: 1, name: "Sentry" }, "sentry")
    .unit(P1, "base", { might: 2, name: "Friend F" }, "F")
    .unit(P1, "base", { might: 5, name: "Poker" }, "poker")
    .hand(P1, ZENITH_BLADE, "zb")
    .hand(P1, JOLT, "jolt")
    .hand(P2, RIDE_THE_WIND, "rtw")
    .hand(P2, GALE, "gale")
    .hand(P2, FLASH, "flash");
}

/** Open the showdown at bf1 (P1 pokes in and keeps Focus) and cast Zenith Blade naming E and F. */
async function castZenithBlade(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("poker", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("zb", { targets: ["E", "F"] });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "zb", controller: P1, targets: ["E", "F"] })]);
  return game;
}

/** Both players pass on the chain until it is empty, answering any destination pick with its sole option. */
async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d) {
      return;
    }
    if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "pick") {
      await game.seat(d.seat).pick(d.options[0]!.card ?? d.options[0]!.key);
    } else {
      return;
    }
  }
}

describe("Zenith Blade — the move destination is anchored at play time; the move itself is linked to the stun", () => {
  // ── finalization: what is chosen, and when ──────────────────────────────────────────────────

  test("355.5 / 355.12 — the cast asks for BOTH objects up front: slot 1 only enemy units at a battlefield, slot 2 any friendly unit; the optional 'you may' does not make F's choice optional", async () => {
    const game = await board().build();
    await game.p1.move("poker", "bf1");
    const field = game.p1.option("cast", "zb")?.fields.find((f) => f.name === "targets");
    expect(field).toMatchObject({ max: 2, min: 2, required: true });
    const tuples = (field?.options ?? []) as string[][];
    expect([...new Set(tuples.map((t) => t[0]))].sort()).toEqual(["E", "sentry"]); // enemy units AT battlefields
    expect([...new Set(tuples.map((t) => t[1]))].sort()).toEqual(["F", "poker"]); // any friendly unit
  });

  test("449.1 / 320.1 — Ride the Wind is an [Action]: P2 may play it with Focus while the chain is EMPTY, but never in response to Zenith Blade; only Reactions are legal then", async () => {
    const game = await board().build();
    await game.p1.move("poker", "bf1");
    await game.p1.passFocus();
    expect(game.p2.can("cast", "rtw")).toBe(true); // Open state inside the showdown
    expect(game.p2.can("cast", "flash")).toBe(true);
    const responding = await castZenithBlade();
    await responding.p1.passPriority();
    expect(responding.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(responding.p2.can("cast", "rtw")).toBe(false); // [Action] — the state is Closed
    expect(responding.p2.can("cast", "flash")).toBe(true); // [Reaction] — legal
    expect((await responding.p2.try((p) => p.cast("rtw", { targets: "E" }))).ok).toBe(false);
  });

  // ── (a) the target survives at another battlefield ──────────────────────────────────────────

  test("(a) 359.3.e.2 — E moved to bf2 still meets 'an enemy unit at a battlefield', so it is still a legal target and IS stunned", async () => {
    const game = await castZenithBlade();
    await game.p1.passPriority();
    await game.p2.cast("gale", { targets: "E" });
    await game.p2.pick("battlefield-bf2"); // 355.4 — Gale's own destination, chosen as it is played
    await resolveChain(game);
    expect(game.locationOf("E")).toBe("bf2");
    expect(game.state("E").isStunned).toBe(true);
    expect(game.zoneOf("zb")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(a) the anchor does NOT chase the target: E is Galed to bf2, but 'that enemy unit's battlefield' was frozen as bf1 when Zenith Blade was played (355.4 / 355.15), so bf1 is the only destination offered and F lands there", async () => {
    const game = await castZenithBlade();
    await game.p1.passPriority();
    await game.p2.cast("gale", { targets: "E" });
    await game.p2.pick("battlefield-bf2");
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gale resolves: E is at bf2
    expect(game.locationOf("E")).toBe("bf2");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Zenith Blade resolves
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toEqual(["battlefield-bf1"]);
    await game.p1.pick("battlefield-bf1");
    expect(game.locationOf("F")).toBe("bf1");
    expect(game.locationOf("E")).toBe("bf2");
  });

  // ── (b) the target leaves every battlefield ─────────────────────────────────────────────────

  test("(b) 359.3.e.2 / 359.3.e.5 — Flash puts E in P2's base: 'at a battlefield' fails, the target is illegal and E is NOT stunned", async () => {
    const game = await castZenithBlade();
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: "E" });
    await resolveChain(game);
    expect(game.locationOf("E")).toBe("base");
    expect(game.state("E").isStunned).toBe(false);
    expect(game.zoneOf("zb")).toBe("trash"); // the spell still resolved and was put in the trash
    expect(game.violations()).toEqual([]);
  });

  test("(b) 359.3.e.14 / 359.3.e.14.a — the move is LINKED to the stun via 'that enemy unit', so with the stun ignored F does NOT move: it is still in base even though bf1, the destination chosen at play time, is untouched and perfectly legal", async () => {
    const game = await castZenithBlade();
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: "E" });
    await resolveChain(game);
    expect(game.locationOf("F")).toBe("base");
    expect(game.zoneOf("F")).toBe("base");
    expect(game.p1.units("bf1")).toEqual(["poker"]); // only the original poker is there
    expect(game.gameState.battlefields.bf1?.contested).toBe(true); // bf1 is alive and contestable — it was not the problem
  });

  test("(b) nothing else about the play is undone: P1 still paid Zenith Blade's cost and F is unexhausted and unmoved", async () => {
    const game = await castZenithBlade();
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 0, order: 1 } });
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: "E" });
    await resolveChain(game);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 0, order: 1 } });
    expect(game.state("F")).toMatchObject({ damage: 0, isExhausted: false, isStunned: false });
  });

  // ── (c) a redundant stun still counts as executed ───────────────────────────────────────────

  test("(c) 423.1.a.1 — a Reaction stuns E first; Zenith Blade's own stun does nothing extra, but it executed on a legal target, so the linked move still happens and F arrives at bf1", async () => {
    const game = await castZenithBlade();
    await game.p1.cast("jolt", { targets: "E" }); // P1 keeps priority after its own cast
    expect(game.chain().map((c) => c.cardId)).toEqual(["zb", "jolt"]); // LIFO: Jolt resolves first
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("E").isStunned).toBe(true);
    expect(game.chain().map((c) => c.cardId)).toEqual(["zb"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Zenith Blade resolves
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toEqual(["battlefield-bf1"]);
    await game.p1.pick("battlefield-bf1");
    expect(game.locationOf("F")).toBe("bf1");
    expect(game.locationOf("E")).toBe("bf1");
    expect(game.state("E").isStunned).toBe(true); // still exactly stunned — a binary state
    expect(game.zoneOf("zb")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(c) control: with no reaction at all Zenith Blade does both halves itself — E stunned at bf1, F moved to bf1", async () => {
    const game = await castZenithBlade();
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toEqual(["battlefield-bf1"]);
    await game.p1.pick("battlefield-bf1");
    expect(game.state("E").isStunned).toBe(true);
    expect(game.locationOf("F")).toBe("bf1");
    expect(game.state("F").isExhausted).toBe(false); // moved by an effect, not a Standard Move
    expect(game.violations()).toEqual([]);
  });
});
