/**
 * Ruling 858a00b745b4bb0e — Reaver's Row (OGN-285 → ogn-285-298) · Battlefield
 *   "When you defend here, you may move a friendly unit here to base."
 *   × Yasuo, Remorseful (ogn-076-298, 6 Might, "When I attack, deal damage equal to my Might to an enemy unit here.")
 *   × Gust (ogn-169-298, Reaction) as the reaction that can only come afterwards.
 *
 * Q: When Reaver's Row triggers, is its target chosen as it goes on the chain or as it resolves?
 * A: As it goes on the chain, before any reactions: "When I attack" triggers go on the chain, then "When I defend"
 *    triggers (Reaver's Row, target declared now), and only then may reactions be played.
 * Rules: 383.4.e/f (attack / defend triggers on the initial combat chain), 383.3.a–b + 402.2 (choices made at
 *        finalization), 336/343 (priority for reactions only after pending items are finalized).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
const YASUO = "ogn-076-298";
const GUST = "ogn-169-298";

/** P2's turn with [1] and Gust in hand. P1 holds the live Row with Big (3) and Small (2). P2's Yasuo (6) attacks from base. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 1 })
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .unit(P1, "row", { might: 3, name: "Big" }, "big")
    .unit(P1, "row", { might: 2, name: "Small" }, "small")
    .unit(P2, "base", YASUO, "yasuo")
    .hand(P2, GUST, "gust");
}

describe("Ruling 858a00b745b4bb0e — Reaver's Row's target is declared when the trigger goes on the chain, before reactions", () => {
  test("order of the initial chain: Yasuo's attack trigger is added (and targeted) first, then Reaver's Row's defend trigger — opt-in and target both asked at FINALIZATION (timing FIN) — and nobody has had priority yet", async () => {
    const game = await board().build();
    await game.p2.move("yasuo", "row");
    // 1) "When I attack" — Yasuo's target, at finalization.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, semantics: "target", source: { cardId: "yasuo" }, timing: "FIN" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo", "row"]);
    await game.p2.pick("small");
    // 2) "When I defend" — Reaver's Row: opt-in, then its target, still at finalization.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row", pendingChoiceType: "opt-in" }, timing: "FIN" });
    expect(game.p2.can("cast", "gust")).toBe(false); // no reactions yet
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "row" }, timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["big", "small"]);
    await game.p1.pick("small");
    // Both items now sit on the chain WITH their declared targets …
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "yasuo", controller: P2, targets: ["small"], triggered: true }),
      expect.objectContaining({ cardId: "row", controller: P1, targets: ["small"], triggered: true }),
    ]);
    // 3) … and only NOW does a priority window for reactions open.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", timing: "ACT" });
    expect(game.locationOf("small")).toBe("row"); // nothing has resolved
  });

  test("reactions come after: once priority reaches P2, Gust (Reaction) is playable on top of the two finalized triggers", async () => {
    const game = await board().build();
    await game.p2.move("yasuo", "row");
    await game.p2.pick("small");
    await game.p1.yes();
    await game.p1.pick("small");
    // Pass priority around until P2 holds it.
    for (let i = 0; i < 3 && game.decision()?.seat !== P2; i++) {
      await game.acting().passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "big" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo", "row", "gust"]);
  });

  test("resolution uses the pre-declared target with no re-pick: Row (LIFO) moves Small home; Yasuo's damage, locked onto Small who is no longer 'here', does nothing to Big", async () => {
    const game = await board().script(P1, [], { strict: false }).build();
    await game.p2.move("yasuo", "row");
    await game.p2.pick("small");
    await game.p1.yes();
    await game.p1.pick("small");
    // Drain the chain by passing; assert no further target prompt appears for either item.
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      const d = game.decision();
      expect(d?.kind).toBe("action");
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("small")).toBe("base");
    expect(game.state("small").damage).toBe(0);
    expect(game.state("big")).toMatchObject({ damage: 0, location: "row" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 }); // attacker's Focus
    expect(game.violations()).toEqual([]);
  });
});
