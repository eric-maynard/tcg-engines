/**
 * Interaction: Tideturner (ogn-199-298) · Unit · Chaos · 2 · 2 Might
 *     "[Hidden] When you play me, you may choose a unit you control at another location. Move me
 *      to its location and it to my original location."
 *   × Shipyard Skulker (ogn-175-298) · vanilla 3-Might unit (the would-be swap partner)
 *   × Gust (ogn-169-298) · Reaction spell "Return a unit at a battlefield with 3 [Might] or less to
 *     its owner's hand." (P2's response in case c)
 *
 * Q: (a) P1 flips a hidden Tideturner at bf1 while its only other unit (a Skulker) is ALSO at bf1.
 *    (b) Same flip, but the only other unit is a Skulker in P1's base. (c) Tideturner played from
 *    hand to base while the only other unit is a Skulker at bf1, and P2 bounces that Skulker in
 *    response. When is P1 asked Yes/No, what is offered, does the from-hidden "targets must be
 *    here" restriction apply, and what resolves?
 *
 * Rules: 383.3.a / 383.3.a.2 (leading "you may" = decide at finalization; Tideturner is the CR's
 * example); 402.1 / 402.1.a (declining removes the trigger); 402.4 / 402.4.a / 402.4.b (no legal
 * choice → removed, not countered; if choices exist they must be made now); 811.1.d.2 (from
 * Hidden, play-effect targets must be "here" — EXCEPT Tideturner, whose restriction can never be
 * met here, so it chooses freely); 355.15 (choices are locked once made); 359.3.e.2 / 359.3.e.12 /
 * 359.3.e.14.a (a bounced target is illegal, "its location" reads null, and the linked second
 * move is ignored too).
 */
import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIDETURNER = "ogn-199-298";
const SKULKER = "ogn-175-298";
const GUST = "ogn-169-298";

/** (a) hidden Tideturner at P1's bf1; P1's only unit is a Skulker AT bf1. */
function boardA() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", SKULKER, "sk")
    .unit(P2, "bf2", { might: 2 }, "foe")
    .facedown(P1, "bf1", TIDETURNER, "tt");
}

/** (b) hidden Tideturner at P1's bf1; P1's only unit is a Skulker in BASE. */
function boardB() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", SKULKER, "sk")
    .unit(P2, "bf2", { might: 2 }, "foe")
    .facedown(P1, "bf1", TIDETURNER, "tt");
}

/** (c) Tideturner in hand (2 energy); P1's only unit is a Skulker at bf1; P2 holds Gust + 1 energy. */
function boardC() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", SKULKER, "sk")
    .unit(P2, "bf2", { might: 2 }, "foe")
    .hand(P1, TIDETURNER, "tt")
    .hand(P2, GUST, "gust");
}

describe("Tideturner — 'a unit you control at another location' (383.3.a / 402.4 / 811.1.d.2)", () => {
  test("(a) flipped at bf1 with the only friendly unit ALSO at bf1: zero legal candidates → the trigger is simply removed (402.4) — no Yes/No, no target prompt, no chain item; Tideturner enters bf1 exhausted for 0", async () => {
    const game = await boardA().build();
    expect(game.p1.can("reveal", "tt")).toBe(true);
    await game.p1.reveal("tt");
    // Nothing was asked and nothing is pending: straight back to P1's open main phase.
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("tt")).toBe("battlefield-bf1");
    expect(game.state("tt").isExhausted).toBe(true);
    expect(game.state("tt").isHidden).toBe(false);
    expect(game.p1.energy()).toBe(0); // played from facedown for [0]
    expect(game.locationOf("sk")).toBe("bf1"); // the co-located Skulker never moved
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("(b) flipped at bf1 with the only other unit in BASE: P1 is first asked the leading 'you may' at finalization (383.3.a, 402.1) — a FIN-timing yes/no while Tideturner's trigger sits on the chain", async () => {
    const game = await boardB().build();
    await game.p1.reveal("tt");
    expect(game.zoneOf("tt")).toBe("battlefield-bf1"); // the permanent already entered (811.1.d.1)
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN", source: { cardId: "tt" } });
    expect(game.chain()).toMatchObject([{ cardId: "tt", controller: P1, triggered: true, type: "ability" }]);
  });

  test("(b) declining removes the trigger from the chain (402.1.a): nobody gets priority, nothing moves", async () => {
    const game = await boardB().build();
    await game.p1.reveal("tt");
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
    expect(game.locationOf("tt")).toBe("bf1");
    expect(game.locationOf("sk")).toBe("base");
  });

  test("(b) on YES the from-hidden 'targets must be here' restriction does NOT apply (811.1.d.2 — Tideturner is the named exception): the BASE Skulker is the one legal choice; P2 gets priority; on resolution Tideturner bf1 → base and Skulker base → bf1, no combat", async () => {
    const game = await boardB().build();
    await game.p1.reveal("tt");
    await game.p1.yes();
    // If the engine asks for the (single) target now, it must be exactly the base Skulker.
    const early = game.decision();
    if (early?.kind === "pick" && early.semantics === "target") {
      expect(early.options.map((o) => o.card)).toEqual(["sk"]);
      await game.p1.pick("sk");
    }
    await game.p1.pass();
    expect(game.actingSeat()).toBe(P2); // opponents get a priority window on the trigger
    expect(game.chain()).toMatchObject([{ cardId: "tt", triggered: true }]);
    await game.p2.pass();
    const late = game.decision();
    if (late?.kind === "pick" && late.semantics === "target") {
      expect((late as PickDecision).options.map((o) => o.card)).toEqual(["sk"]); // not 'foe', nothing "here"
      await game.p1.pick("sk");
    }
    await game.settle();
    expect(game.locationOf("tt")).toBe("base");
    expect(game.locationOf("sk")).toBe("bf1");
    expect(game.state("sk").isReady).toBe(true); // moved by an effect, not a standard move — no exhaust
    // Skulker arrived at a battlefield P1 already controls: no showdown, no contest.
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
    expect(game.locationOf("foe")).toBe("bf2");
  });

  // Expected (402.2 / 402.4.b): with a legal option available the target is chosen — here forced —
  // DURING FINALIZATION, right after the yes; the finalized chain item then carries that target so the
  // opponent passes or responds knowing it. Actual: the engine binds nothing at finalization and only
  // asks for the swap partner when the trigger RESOLVES (after both players have passed).
  test("(b) the Skulker is bound as the trigger's target at finalization and is visible on the chain item while P2 holds priority (402.4.b)", async () => {
    const game = await boardB().build();
    await game.p1.reveal("tt");
    await game.p1.yes();
    const d = game.decision();
    if (d?.kind === "pick" && d.semantics === "target") {
      await game.p1.pick("sk");
    }
    await game.p1.pass();
    expect(game.actingSeat()).toBe(P2);
    expect(game.chain()).toMatchObject([{ cardId: "tt", triggered: true, targets: ["sk"] }]);
  });

  test("(c) from hand to base with the only other unit at bf1: same Yes/No first; P2 answers by Gusting that Skulker; when Tideturner's trigger resolves its target is gone → 'its location' is null and BOTH linked moves are ignored (359.3.e.12, 359.3.e.14.a): Tideturner stays in base, no prompt, no re-pick", async () => {
    const game = await boardC().build();
    await game.p1.play("tt", { to: "base" });
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("tt")).toBe("base");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN", source: { cardId: "tt" } });
    await game.p1.yes();
    const d = game.decision();
    if (d?.kind === "pick" && d.semantics === "target") {
      expect(d.options.map((o) => o.card)).toEqual(["sk"]);
      await game.p1.pick("sk");
    }
    await game.p1.pass();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "sk" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["tt", "gust"]); // Gust on top of the trigger
    await game.settle(); // Gust resolves first (LIFO), then Tideturner's trigger
    expect(game.zoneOf("sk")).toBe("hand");
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.locationOf("tt")).toBe("base"); // did not move anywhere
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 }); // P1 was not asked anything
  });

  // Expected (355.15 + 359.3.e): the partner is CHOSEN when the trigger is finalized; if that unit is
  // bounced in response the trigger does nothing — P1 may not switch to some other friendly unit that
  // happens to be elsewhere at resolution. Variant board: a second Skulker at P1's bf2 exists, P1 names
  // the bf1 Skulker, P2 Gusts it. Actual: the engine only looks for a partner at resolution, finds the
  // bf2 Skulker as the sole remaining candidate and swaps with it (Tideturner ends at bf2).
  test("(c′) no re-pick — with a second friendly unit at bf2, bouncing the CHOSEN bf1 Skulker still leaves Tideturner in base and the bf2 unit untouched (355.15)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", SKULKER, "sk")
      .unit(P1, "bf2", SKULKER, "sk2")
      .hand(P1, TIDETURNER, "tt")
      .hand(P2, GUST, "gust")
      .script(P1, [(d) => (d.kind === "pick" && d.semantics === "target" ? "sk" : undefined)])
      .build();
    await game.p1.play("tt", { to: "base" });
    await game.p1.yes(); // a finalization-time target ask (correct engine) is answered "sk" by the script
    await game.p1.pass();
    await game.p2.cast("gust", { targets: "sk" });
    await game.settle();
    expect(game.zoneOf("sk")).toBe("hand");
    expect(game.locationOf("tt")).toBe("base");
    expect(game.locationOf("sk2")).toBe("bf2");
  });
});
