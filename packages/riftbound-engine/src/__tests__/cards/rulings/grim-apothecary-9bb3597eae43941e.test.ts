/**
 * Ruling 9bb3597eae43941e — Grim Apothecary (UNL-021 → unl-021-219) · Unit · Fury · 3 · 3 Might
 *   "[Ambush] When you play me, you may return a friendly unit at a battlefield to its owner's hand."
 *
 * Q: Can Grim Apothecary bounce itself?
 * A: Yes. Once played it is on the board and is a friendly unit; if it is at a battlefield it is a legal target of its
 *    own play trigger, so you may return the Apothecary itself to your hand.
 * Rules: 383.4.b (play triggers happen after the permanent has entered), 355 (any object matching the description is a
 *        legal target — no "another" here), 402.2 (target chosen at finalization).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, scenario } from "../../../harness";

const GRIM_APOTHECARY = "unl-021-219";

type PickD = Extract<Decision, { kind: "pick" }>;

/** P1's turn with the Apothecary's [3]; P1 holds bf1 with a Holder (2); Idler (1) in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 1, name: "Idler" }, "idler")
    .hand(P1, GRIM_APOTHECARY, "apoth");
}

describe("Ruling 9bb3597eae43941e — Grim Apothecary may return itself", () => {
  test("played TO bf1: after opting in, the target menu of 'a friendly unit at a battlefield' includes the Apothecary ITSELF (and the Holder; not the Idler in base)", async () => {
    const game = await board().build();
    await game.p1.play("apoth", { to: "bf1" });
    expect(game.zoneOf("apoth")).toBe("battlefield-bf1"); // on the board before its trigger is finalized
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "apoth" }, timing: "FIN" });
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", timing: "FIN" });
    expect((d as PickD).options.map((o) => o.card ?? o.key).sort()).toEqual(["apoth", "holder"]);
  });

  test("choosing itself: the trigger resolves and Grim Apothecary goes back to its owner's (P1's) hand; the [3] stays spent, the Holder stays put", async () => {
    const game = await board().build();
    await game.p1.play("apoth", { to: "bf1" });
    await game.p1.yes();
    await game.p1.pick("apoth");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "apoth", targets: ["apoth"], triggered: true })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("apoth")).toBe("hand");
    expect(game.p1.hand()).toContain("apoth");
    expect(game.p1.energy()).toBe(0);
    expect(game.locationOf("holder")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });

  test("it must be AT A BATTLEFIELD to qualify: played to base, the only legal target is the Holder (auto-chosen) — the Apothecary in base cannot pick itself", async () => {
    const game = await board().build();
    await game.p1.play("apoth", { to: "base" });
    await game.p1.yes();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect((d as PickD).options.map((o) => o.card ?? o.key)).toEqual(["holder"]);
      await game.p1.pick("holder");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "apoth", targets: ["holder"] })]);
    await game.settle();
    expect(game.zoneOf("holder")).toBe("hand");
    expect(game.zoneOf("apoth")).toBe("base");
  });
});
