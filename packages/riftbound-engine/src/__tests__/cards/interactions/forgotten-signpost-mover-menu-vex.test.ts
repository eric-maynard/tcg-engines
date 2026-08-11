/**
 * Interaction: Forgotten Signpost (unl-045-219) · Gear · Calm · 2
 *     "[Action][>] Exhaust a unit you control, [Exhaust]: Move a different unit you control to the
 *      location of the unit you exhausted to pay for this ability."
 *   × Vex, Apathetic (unl-150-219) · Unit · 4 · 4 Might · [Deflect]
 *     "When an opponent plays a unit while I'm at a battlefield, [Stun] it. They can't move it this turn."
 *   × Shipyard Skulker (ogn-175-298) — the vanilla 3-Might unit played into Vex's lock.
 *
 * Board: P1 controls bfA holding W (READY — the only unit that can pay) and X (exhausted); Y sits
 * exhausted in P1's base; Z is played to P1's bfB while P2's Vex stands at bfC, so Z lands stunned and
 * "can't be moved this turn". P1 activates the Signpost, so the cost unit is W and the destination is bfA.
 *
 * Q (a) Is the COST unit W surfaced as a menu choice, and would a Deflect on W matter?
 *   (b) The exact mover option set — X? W? Y? Z? any enemy unit?
 *   (c) Is a destination prompt surfaced?
 *   (d) Is Z offered despite Vex's lock, and what happens if P1 picks it?
 *   (e) If every other unit P1 controls were already at bfA, can the ability be activated at all?
 *   (f) Can this be activated during a showdown?
 *
 * Rules
 *   355.10.c / .c.1  objects named only in a COST are chosen, not targeted — no target menu, no Deflect.
 *   355.5 / 355.7    the "different unit you control" IS a target, chosen as the ability is played.
 *   355.4 / 355.4.a  a Move needs a valid destination = a Location other than the mover's current one.
 *                    Here it is dictated by the cost unit's location, so nothing is chosen.
 *   355.8            an ability with no legal value for a target can't be played at all.
 *   358.3.a          a restriction on performing a game action never stops an ability being played.
 *   054.1            "can't" beats "can".
 *   359.3.e.6 / .10 / .12   impossible instructions are ignored; the ability is still considered played
 *                    and costs stay paid.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SIGNPOST = "unl-045-219";
const VEX = "unl-150-219";
const SKULKER = "ogn-175-298";
const GUST = "ogn-169-298"; // [Reaction] — return a unit at a battlefield with 3 Might or less to hand

/** Card ids offered for the `targets` (mover) field of P1's Signpost activation. */
function moversOffered(game: Game): string[] {
  const field = game.p1.option("activate", "post")?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

/**
 * P1's turn. W (ready) + X (exhausted) at P1's bfA, Y exhausted in base, the Signpost ready.
 * P2's Vex stands at their own bfC. `wKeywords` lets one facet print [Deflect] on the cost unit.
 */
function base(wKeywords: string[] = []) {
  return scenario()
    .resources(P1, { energy: 4 })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P1 })
    .battlefield("bfC", { controller: P2 })
    .unit(P1, "bfA", { keywords: wKeywords, might: 2, name: "W" }, "W")
    .unit(P1, "bfA", { might: 2, name: "X" }, "X", { exhausted: true })
    .unit(P1, "base", { might: 2, name: "Y" }, "Y", { exhausted: true })
    .unit(P2, "bfC", VEX, "vex")
    .hand(P1, SKULKER, "Z")
    .gear(P1, SIGNPOST, "post");
}

/** Play Z into Vex's lock: it lands at bfB stunned and unable to move this turn. */
async function withLockedZ(game: Game): Promise<void> {
  await game.p1.play("Z", { to: "bfB" });
  await game.settle();
  expect(game.locationOf("Z")).toBe("bfB");
  expect(game.state("Z").isStunned).toBe(true);
  expect(game.state("Z").grantedKeywords).toContainEqual(expect.objectContaining({ duration: "turn", keyword: "NoMove" }));
}

describe("Forgotten Signpost — the cost unit is not a choice, the mover is, and Vex's lock does not prune the menu", () => {
  // ── (a) the cost object is not a target ────────────────────────────────────────────────────────

  test("(a) W is the COST object, never a menu choice: it is absent from the mover options, the chain item's targets name only the mover, and W is already exhausted when the item goes up (355.10.c / .c.1)", async () => {
    const game = await base().build();
    await withLockedZ(game);
    expect(moversOffered(game)).not.toContain("W");

    await game.p1.activate("post", 0, { targets: "Y" });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "post", controller: P1, targets: ["Y"], triggered: false }),
    ]);
    expect(game.state("W").isExhausted).toBe(true); // paid as a cost, not chosen as a target
    expect(game.state("post").isExhausted).toBe(true);
  });

  test("(a) a [Deflect] on W is irrelevant — nothing chooses it, so the activation is free of any surcharge even with an empty power pool (355.10.c.1)", async () => {
    const game = await scenario()
      .battlefield("bfA", { controller: P1 })
      .unit(P1, "bfA", { keywords: ["Deflect"], might: 2, name: "W" }, "W")
      .unit(P1, "base", { might: 2, name: "Y" }, "Y", { exhausted: true })
      .gear(P1, SIGNPOST, "post")
      .build();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("W").keywords).toContain("Deflect");
    expect(game.p1.can("activate", "post")).toBe(true);
    await game.p1.activate("post", 0, { targets: "Y" });
    await game.settle();
    expect(game.locationOf("Y")).toBe("bfA");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // nothing extra was ever charged
    expect(game.state("W").isExhausted).toBe(true);
  });

  // ── (b) the mover option set ───────────────────────────────────────────────────────────────────

  test("(b) the mover menu is exactly { Y, Z }: X is absent (bfA is already its location — 355.4.a), W is absent ('a different unit'), and no enemy unit is offered", async () => {
    const game = await base().build();
    await withLockedZ(game);
    expect(moversOffered(game)).toEqual(["Y", "Z"]);
    expect(moversOffered(game)).not.toContain("X");
    expect(moversOffered(game)).not.toContain("W");
    expect(moversOffered(game)).not.toContain("vex");

    expect((await game.p1.try((p) => p.activate("post", 0, { targets: "X" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.activate("post", 0, { targets: "W" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.activate("post", 0, { targets: "vex" }))).ok).toBe(false);
    // Nothing was paid by the rejected attempts.
    expect(game.state("post").isReady).toBe(true);
    expect(game.state("W").isReady).toBe(true);
  });

  // ── (c) no destination prompt ──────────────────────────────────────────────────────────────────

  test("(c) no destination is ever asked — the cost unit's location dictates it: activating on Y goes straight to the priority window and Y arrives at bfA (355.4)", async () => {
    const game = await base().build();
    await withLockedZ(game);
    await game.p1.activate("post", 0, { targets: "Y" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.locationOf("Y")).toBe("bfA");
    expect(game.p1.units("bfA").sort()).toEqual(["W", "X", "Y"]);
    await game.settle();
    expect(game.violations()).toEqual([]);
  });

  // Expected (359.3.e.12 → 359.3.e.6): a unit that is no longer on the board HAS NO LOCATION, so "the
  // location of the unit you exhausted" returns null and every calculation based on it is ignored — the
  // move instruction is simply skipped, Y stays where it is, and the ability is still considered played
  // with its exhausts paid (359.3.e.10). Actual: the engine treats the missing destination as an invalid
  // arrival and applies the 447.2.c Recall fallback (`effects/move.ts moveCardWithEvent`), so Y is pulled
  // off the board into its owner's HAND — a whole extra effect the ability never had.
  test("(c) the cost unit leaving the board makes the destination null, so the move is ignored — Y must NOT be recalled to hand (359.3.e.12 / .6 / .10)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bfA", { controller: P1 })
      .unit(P1, "bfA", { might: 2, name: "W" }, "W")
      .unit(P1, "base", { might: 2, name: "Y" }, "Y", { exhausted: true })
      .hand(P1, GUST, "gust")
      .gear(P1, SIGNPOST, "post")
      .build();
    await game.p1.activate("post", 0, { targets: "Y" });
    await game.p1.cast("gust", { targets: "W" }); // W (2 Might) back to hand
    await game.settle();
    expect(game.zoneOf("W")).toBe("hand");
    expect(game.zoneOf("Y")).toBe("base"); // nowhere to go — the instruction is ignored, not re-aimed
    expect(game.locationOf("Y")).toBe("base");
    expect(game.state("post").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(c) the ability still resolved and its costs stay paid when the cost unit is bounced mid-chain (359.3.e.10)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bfA", { controller: P1 })
      .unit(P1, "bfA", { might: 2, name: "W" }, "W")
      .unit(P1, "base", { might: 2, name: "Y" }, "Y", { exhausted: true })
      .hand(P1, GUST, "gust")
      .gear(P1, SIGNPOST, "post")
      .build();
    await game.p1.activate("post", 0, { targets: "Y" });
    expect(game.state("W").isExhausted).toBe(true); // the cost was already paid
    await game.p1.cast("gust", { targets: "W" });
    await game.settle();
    expect(game.zoneOf("W")).toBe("hand");
    expect(game.state("post").isExhausted).toBe(true); // nothing readied, nothing refunded
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (d) Vex's "they can't move it this turn" does not prune the menu ───────────────────────────

  test("(d) Z IS offered although Vex forbids moving it: a restriction on a game action never stops the ability being played or finalized (358.3.a) — Z simply cannot Standard-Move either", async () => {
    const game = await base().build();
    await withLockedZ(game);
    expect(moversOffered(game)).toContain("Z");
    expect((await game.p1.try((p) => p.move("Z", "bfA"))).ok).toBe(false); // the lock itself is real
    expect(game.p1.can("activate", "post")).toBe(true);
  });

  test("(d) picking Z is legal and then resolves as a pure no-op — 'can't' beats 'can' (054.1), the impossible instruction is ignored (359.3.e.6), and nothing is readied or refunded (359.3.e.10)", async () => {
    const game = await base().build();
    await withLockedZ(game);
    await game.p1.activate("post", 0, { targets: "Z" });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "post", controller: P1, targets: ["Z"], triggered: false }),
    ]);
    await game.settle();

    expect(game.locationOf("Z")).toBe("bfB"); // never moved
    expect(game.state("Z").isStunned).toBe(true);
    expect(game.state("W").isExhausted).toBe(true);
    expect(game.state("post").isExhausted).toBe(true);
    expect(game.p1.units("bfA").sort()).toEqual(["W", "X"]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (e) an empty option set makes the ability unplayable ───────────────────────────────────────

  test("(e) with every other unit P1 controls already at bfA the mover menu is empty, so the ability cannot be activated even though the cost is fully payable (355.8)", async () => {
    const game = await scenario()
      .battlefield("bfA", { controller: P1 })
      .unit(P1, "bfA", { might: 2, name: "W" }, "W")
      .unit(P1, "bfA", { might: 2, name: "X" }, "X", { exhausted: true })
      .gear(P1, SIGNPOST, "post")
      .build();
    expect(moversOffered(game)).toEqual([]);
    expect(game.p1.can("activate", "post")).toBe(false);
    expect(game.state("W").isReady).toBe(true); // nothing may be exhausted on spec
    expect(game.state("post").isReady).toBe(true);
  });

  test("(e) a different cost unit whose location yields a legal mover is the way through: give W a second ready friend in BASE and the same board is activatable again", async () => {
    const game = await scenario()
      .battlefield("bfA", { controller: P1 })
      .unit(P1, "bfA", { might: 2, name: "W" }, "W")
      .unit(P1, "bfA", { might: 2, name: "X" }, "X", { exhausted: true })
      .unit(P1, "base", { might: 2, name: "V" }, "V") // ready, in base → destination base, movers W / X
      .gear(P1, SIGNPOST, "post")
      .build();
    expect(game.p1.can("activate", "post")).toBe(true);
    // The cost unit is a free choice too, so the menu is the union over the payable lines: paying with V
    // (in base) opens W and X as movers, paying with W (at bfA) opens V.
    expect(moversOffered(game)).toEqual(["V", "W", "X"]);
    await game.p1.activate("post", 0, { targets: "X" });
    await game.settle();
    expect(game.locationOf("X")).toBe("base"); // only V's location makes X a legal mover
    expect(game.state("V").isExhausted).toBe(true);
    expect(game.state("W").isReady).toBe(true);
  });

  // ── (f) timing ────────────────────────────────────────────────────────────────────────────────

  test("(f) [Action] is printed on the ABILITY: on P2's turn with no showdown P1 may not activate it", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bfA", { controller: P1 })
      .unit(P1, "bfA", { might: 2, name: "W" }, "W")
      .unit(P1, "base", { might: 2, name: "Y" }, "Y", { exhausted: true })
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .gear(P1, SIGNPOST, "post")
      .build();
    expect(game.p1.can("activate", "post")).toBe(false);
    expect(game.p1.legal().some((o) => o.verb === "activate")).toBe(false);
  });

  test("(f) inside a showdown it IS available once Focus reaches P1: the Signpost is listed, offers Y, and moving Y in adds a defender at bfA", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bfA", { controller: P1 })
      .unit(P1, "bfA", { might: 2, name: "W" }, "W")
      .unit(P1, "base", { might: 2, name: "Y" }, "Y", { exhausted: true })
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .gear(P1, SIGNPOST, "post")
      .build();
    await game.p2.move("raider", "bfA");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.can("activate", "post")).toBe(false); // P2 holds Focus
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "post")).toBe(true);
    expect(moversOffered(game)).toEqual(["Y"]);
    await game.p1.activate("post", 0, { targets: "Y" });
    // Activating opens a chain priority window inside the showdown; draining it resolves the move.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("Y")).toBe("bfA");
    expect(game.state("Y").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });
});
