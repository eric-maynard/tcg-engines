/**
 * Ruling f5b870b3f86d5a37 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · 2 · [Hidden]
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Tasty Faefolk (ogn-075-298) · 6 Might "[Deathknell] — Channel 2 runes exhausted and draw 1."
 *
 * Q: Can a hidden Zhonya's be flipped after combat damage has been ASSIGNED but before it is DEALT?
 * A: No. The last chance is during the showdown (Focus/priority) before damage assignment; once assignment begins there
 *    is no action or reaction window until damage has been dealt. Nuance: if a Deathknell unit dies in that combat, its
 *    trigger opens a chain afterwards in which you may flip Zhonya's — but that saves nothing, the unit is already dead.
 * Rules: 465.2 (damage assignment and dealing are one uninterrupted step — no priority), 345–347 (Focus windows in the
 *        showdown), 811 (Hidden → Reaction), 808 (Deathknell).
 */
import { describe, expect, test } from "bun:test";
import type { DistributeDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const TASTY_FAEFOLK = "ogn-075-298";

/** P2's turn 3. P1 holds bf1 with two defenders (3, 3) and a facedown Zhonya's; P2's Raider (5) attacks from base — 5 kills only ONE of them, so P2 must choose. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Lefty" }, "lefty")
    .unit(P1, "bf1", { might: 3, name: "Righty" }, "righty")
    .facedown(P1, "bf1", ZHONYAS, "zhonya")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider");
}

describe("Ruling f5b870b3f86d5a37 — no flipping Zhonya's between damage assignment and damage being dealt", () => {
  test("during the showdown P1 DOES get a window (Focus) in which the hidden Zhonya's could be flipped — that is the last chance", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "zhonya")).toBe(true);
  });

  test("once both pass and damage ASSIGNMENT begins (P2 splitting 5 across the two defenders), P1 has no action at all — no reveal, nothing — until damage is dealt", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.passFocus();
    const d = game.decision() as DistributeDecision;
    expect(d).toMatchObject({ kind: "distribute", seat: P2 });
    expect(d.buckets.map((b) => b.card).toSorted()).toEqual(["lefty", "righty"]);
    // P1's side of the table while the assignment is pending: nothing legal, in particular no flip.
    expect(game.p1.can("reveal", "zhonya")).toBe(false);
    expect(game.p1.legal().filter((o) => o.verb !== "concede")).toEqual([]);
    const r = await game.p1.try((p) => p.reveal("zhonya"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("zhonya")).toBe("facedown-bf1");
  });

  test("the assignment is followed directly by damage being dealt: Lefty (assigned lethal) dies UNREPLACED with Zhonya's still face down beside it; Righty survives, Raider dies to their 6, P1 keeps bf1", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.passFocus();
    await game.p2.distribute({ lefty: 3, righty: 2 });
    await game.settle();
    expect(game.zoneOf("lefty")).toBe("trash"); // no window to flip → not saved
    expect(game.zoneOf("zhonya")).toBe("facedown-bf1"); // never played, still hidden
    expect(game.zoneOf("righty")).toBe("battlefield-bf1");
    expect(game.state("righty").damage).toBe(0); // healed after combat
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("nuance — a Deathknell defender (Tasty Faefolk) dying in that combat opens a chain AFTERWARDS: P1 may flip Zhonya's in response, but it saves nothing (Faefolk stays dead; the Deathknell still pays out)", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", TASTY_FAEFOLK, "fae")
      .facedown(P1, "bf1", ZHONYAS, "zhonya")
      .unit(P2, "base", { might: 7, name: "Brute" }, "brute")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p2.move("brute", "bf1");
    await game.p2.passFocus();
    await game.p1.passFocus();
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    expect(game.zoneOf("fae")).toBe("trash"); // already dead — damage was dealt with no window
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fae", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "zhonya")).toBe(true);
    await game.p1.reveal("zhonya");
    await game.settle();
    expect(game.zoneOf("fae")).toBe("trash"); // NOT saved
    expect(game.p1.hand()).toHaveLength(hand0 + 1); // Deathknell draw
    expect(["base", "bf1"]).toContain(game.locationOf("zhonya") as string); // in play, replaced nothing
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
