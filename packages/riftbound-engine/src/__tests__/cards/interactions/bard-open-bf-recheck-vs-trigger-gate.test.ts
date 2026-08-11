/**
 * Interaction: Bard, Mercurial (sfd-079-221)
 *     "You may exhaust your legend as an additional cost to play me.
 *      When you play me, if you paid the additional cost, move any number of your units to an
 *      open battlefield."
 *   × Gust (ogn-169-298) [Reaction] "Return a unit at a battlefield with 3 [Might] or less to
 *     its owner's hand."  — takes one chosen mover off the board mid-chain
 *   × Janna, Savior (sfd-053-221) [Reaction] unit — the textbook "occupy the destination in
 *     response" answer, which turns out to be illegal (see the note below)
 *
 * Question: one card carries three different re-evaluation regimes at once.
 *   (c) Is the "if you paid the additional cost" gate re-checked after the trigger fires?
 *   (a) The named destination stops being "open" before the trigger resolves — does anything
 *       move, and may the controller name a different still-open battlefield instead?
 *   (b) One of the chosen movers is Gusted away — do the others still go?
 *
 * Answers:
 *   (c) 383.2.a.1 — the conditional sits immediately after the trigger condition, so it is part
 *       of the Trigger Condition, evaluated ONCE when the trigger fires. Removing Bard in
 *       reaction does not stop the trigger from resolving.
 *   (a) 170.11.c "open" = unoccupied AND uncontrolled; 337.2 a Reaction unit resolves at once;
 *       449.1 the destination's stated restriction is re-tested at execution; 359.3.e.6 an
 *       instruction that cannot be followed is ignored; 355.4/355.15 the location was picked at
 *       finalization and is never re-offered; 359.3.e.10 the trigger still resolved.
 *   (b) 359.3.e.2/.4 a target in a non-board zone is illegal; 359.3.e.8 with more than one
 *       target and not all invalid, the instruction still executes for the rest; 446.3 the
 *       remaining movers arrive together.
 *   Set shape: 355.12/355.13 "any number of your units" is a set of independent targets chosen
 *       at finalization, separately from the decision to act, and zero picks keep the item.
 *
 * PREMISE NOTE — why Janna cannot be the one who closes the destination: 355.2.a lets a unit be
 * played only to its controller's base or to a battlefield THAT CONTROLLER CONTROLS, and Janna's
 * reminder text ("including to a battlefield you control") grants nothing beyond that. An OPEN
 * battlefield is by definition uncontrolled (170.11.c), so no player may ever play a unit onto
 * it without a separate permission. The first test below pins that down with Janna; the
 * destination is then closed the only way a Reaction can close it — Thrill of the Hunt
 * (unl-184-219) "Banish a friendly unit, then its owner plays it to ANY battlefield", whose
 * explicit permission (355.2.b) reaches an open battlefield.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BARD = "sfd-079-221";
const JANNA = "sfd-053-221";
const GUST = "ogn-169-298";
const THRILL = "unl-184-219"; // [Reaction] banish a friendly unit, replay it to ANY battlefield
const SHAKEDOWN = "ogn-033-298"; // [Reaction] deal 6 to an enemy unit unless its controller has you draw 2

/**
 * bfC is the open battlefield (unoccupied + uncontrolled). P1's three units are the movers —
 * `u3` is the 3-Might one and stands at a battlefield so Gust can reach it. P2 holds bf2 with
 * `squat`, the unit Thrill of the Hunt replays onto bfC.
 * `extraOpen` adds a SECOND open battlefield, bfD.
 */
function board(extraOpen = false) {
  let s = scenario()
    .resources(P1, { energy: 6, power: { mind: 2 } })
    .resources(P2, { energy: 6, power: { calm: 2, chaos: 2, fury: 2, body: 2 } })
    .legend(P1, { name: "Wandering Caretaker" }, "legend")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bfC", { controller: null });
  if (extraOpen) {
    s = s.battlefield("bfD", { controller: null });
  }
  return s
    .unit(P1, "bf1", { might: 3, name: "Trio" }, "u3")
    .unit(P1, "base", { might: 1, name: "One" }, "u1")
    .unit(P1, "base", { might: 2, name: "Two" }, "u2")
    .unit(P2, "bf2", { might: 2, name: "Squatter" }, "squat")
    .hand(P1, BARD, "bard")
    .hand(P2, JANNA, "janna")
    .hand(P2, GUST, "gust")
    .hand(P2, THRILL, "thrill")
    .hand(P2, SHAKEDOWN, "shakedown");
}

describe("Bard's open-battlefield re-check vs its paid-cost trigger gate", () => {
  test("the gate is part of the TRIGGER CONDITION: not paying the additional cost means no trigger at all (383.2.a.1)", async () => {
    const game = await board().build();
    await game.p1.play("bard", { payOptional: false, to: "base" });
    expect(game.state("legend").isExhausted).toBe(false);
    expect(game.chain()).toEqual([]); // nothing fired — no prompt, no chain item
    await game.settle();
    expect(game.locationOf("u1")).toBe("base");
    expect(game.locationOf("u2")).toBe("base");
    expect(game.locationOf("u3")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });

  test("paying it exhausts the legend and puts the trigger on the Chain, whose movers are a min-0 target SET chosen at finalization (355.12, 355.13)", async () => {
    const game = await board().build();
    await game.p1.play("bard", { payOptional: true, to: "base" });
    expect(game.state("legend").isExhausted).toBe(true);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect(d?.kind === "pick" ? d.min : -1).toBe(0); // "any number" — zero is a legal answer
    expect(d?.kind === "pick" ? d.targeting : undefined).toBe("up-to");
    await game.p1.pick("u3", "u1", "u2");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "bard", controller: P1, triggered: true }),
    ]);
  });

  test("choosing NO movers is legal and the trigger still resolves (355.13)", async () => {
    const game = await board().build();
    await game.p1.play("bard", { payOptional: true, to: "base" });
    await game.p1.pick(); // the empty set
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.locationOf("u1")).toBe("base");
    expect(game.locationOf("u3")).toBe("bf1");
    expect(game.chain()).toEqual([]);
  });

  test("(c) the gate is LOCKED at trigger time: killing Bard in reaction does not switch the trigger off — it still resolves and moves the units (383.2.a.1)", async () => {
    const game = await board().build();
    await game.p1.play("bard", { payOptional: true, to: "base" });
    await game.p1.pick("u3", "u1", "u2");
    await game.p1.passPriority();
    // Shakedown: 6 damage to Bard (4 Might) unless P1 lets P2 draw 2. P1 takes the damage.
    await game.p2.cast("shakedown", { targets: "bard" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("1"); // "Deal 6 to it"
    await game.settle();
    expect(game.zoneOf("bard")).toBe("trash");
    // The trigger resolved anyway (Sona example, 383.2.a.1) — the movers arrived at bfC.
    expect(game.locationOf("u1")).toBe("bfC");
    expect(game.locationOf("u2")).toBe("bfC");
    expect(game.locationOf("u3")).toBe("bfC");
    expect(game.state("legend").isExhausted).toBe(true); // nothing refunds the additional cost
    expect(game.violations()).toEqual([]);
  });

  test("(a) Janna cannot answer by occupying the destination: an OPEN battlefield is uncontrolled, so it is not a valid play location (170.11.c, 355.2.a)", async () => {
    const game = await board().build();
    await game.p1.play("bard", { payOptional: true, to: "base" });
    await game.p1.pick("u1", "u2");
    await game.p1.passPriority();
    const locations = game.p2.option("play", "janna")?.fields.find((f) => f.name === "location")?.options ?? [];
    expect(locations).toContain("base");
    expect(locations).toContain("battlefield-bf2"); // P2 controls bf2
    expect(locations).not.toContain("battlefield-bfC"); // open ⇒ uncontrolled ⇒ never valid
  });

  test("(a) once the destination stops being open, NOTHING moves — the move instruction is simply ignored (449.1, 359.3.e.6) and the trigger still resolved (359.3.e.10)", async () => {
    const game = await board().build();
    await game.p1.play("bard", { payOptional: true, to: "base" });
    await game.p1.pick("u3", "u1", "u2");
    await game.p1.passPriority();
    // Thrill of the Hunt banishes P2's own Squatter and replays it onto bfC (355.2.b).
    await game.p2.cast("thrill", { targets: "squat" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p2.pick("battlefield-bfC");
    expect(game.locationOf("squat")).toBe("bfC"); // bfC is now occupied ⇒ no longer open
    await game.settle();
    // Every mover was perfectly able to move; the DESTINATION is what failed its restriction.
    expect(game.locationOf("u1")).toBe("base");
    expect(game.locationOf("u2")).toBe("base");
    expect(game.locationOf("u3")).toBe("bf1");
    expect(game.chain()).toEqual([]);
  });

  test.failing("BUG: the move destination must be chosen at FINALIZATION (355.4) — with two open battlefields the engine asks nobody then, and asks per-mover at resolution instead (446.3)", async () => {
    // Expected: right after the movers are locked, P1 is asked which open battlefield they go to.
    // Actual: no destination prompt at FIN; at resolution the engine raises one RES-timing
    // "Choose a destination for One [u1]" prompt PER mover, so the group can even split up.
    const game = await board(true).build();
    await game.p1.play("bard", { payOptional: true, to: "base" });
    await game.p1.pick("u1", "u2");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual([
      "battlefield-bfC",
      "battlefield-bfD",
    ]);
  });

  test.failing("BUG: the destination is never re-offered (355.15) — with bfC closed the movers must stay put, but the engine re-picks the other still-open battlefield", async () => {
    // Expected: P1 named bfC at finalization; bfC is occupied at resolution, so the instruction
    // is ignored (359.3.e.6) and u1/u2/u3 stay where they are — bfD is NOT a substitute.
    // Actual: the destination is resolved late, so all three movers land on bfD.
    const game = await board(true).build();
    await game.p1.play("bard", { payOptional: true, to: "base" });
    await game.p1.pick("u3", "u1", "u2");
    await game.p1.passPriority();
    await game.p2.cast("thrill", { targets: "squat" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p2.pick("battlefield-bfC");
    await game.settle();
    expect(game.locationOf("u1")).toBe("base");
    expect(game.locationOf("u2")).toBe("base");
    expect(game.locationOf("u3")).toBe("bf1");
  });

  test("(b) Gusting one chosen mover away does not stop the others: the illegal target is dropped and the rest arrive together (359.3.e.2/.4/.8, 446.3)", async () => {
    const game = await board().build();
    await game.p1.play("bard", { payOptional: true, to: "base" });
    await game.p1.pick("u3", "u1", "u2");
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "u3" }); // 3 Might, at bf1 — a legal Gust target
    await game.settle();
    expect(game.zoneOf("u3")).toBe("hand"); // non-board zone ⇒ illegal target for the move
    expect(game.p1.hand()).toContain("u3");
    expect(game.locationOf("u1")).toBe("bfC");
    expect(game.locationOf("u2")).toBe("bfC");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
