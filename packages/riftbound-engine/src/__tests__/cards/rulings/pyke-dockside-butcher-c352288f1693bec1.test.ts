/**
 * Ruling c352288f1693bec1 — Pyke, Dockside Butcher (UNL-028 → unl-028-219) · Unit · Fury · 3 · 2 Might
 *   "[Hidden] [Ganking] You may pay [fury] as an additional cost to play me. When you play me, if you paid the
 *    additional cost, ready me and give me +2 [Might] this turn."
 *
 * Q: Can I play Pyke hidden at Battlefield A from facedown to Battlefield B?
 * A: No. A hidden PERMANENT played from facedown must be played to the exact battlefield where it was hidden — even
 *    though the play is at Reaction speed, the location is fixed to Battlefield A.
 * Rules: 811.1.d.1 (a hidden permanent is played "here"), 811 (Hidden play for [0] on a later turn), 813.3.a.
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const PYKE = "unl-028-219";

/** P1's turn 3. P1 controls bfA (Guard A) and bfB (Guard B); Pyke was hidden at bfA on an earlier turn. 3 energy + [fury] spare. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P1 })
    .unit(P1, "bfA", { might: 3, name: "Guard A" }, "guardA")
    .unit(P1, "bfB", { might: 3, name: "Guard B" }, "guardB")
    .facedown(P1, "bfA", PYKE, "pyke");
}

describe("Ruling c352288f1693bec1 — a hidden Pyke at Battlefield A can only be played to Battlefield A", () => {
  test("the facedown play offers NO choice of location at all (only the optional [fury] additional cost) — bfB / base are simply not askable", async () => {
    const game = await board().build();
    expect(game.p1.can("reveal", "pyke")).toBe(true);
    const fields = game.p1.option("reveal", "pyke")?.fields ?? [];
    expect(fields.some((f) => f.arg === "to" || f.name === "location" || f.kind === "zone")).toBe(false);
    expect(fields.map((f) => f.arg)).toEqual(["payOptional"]);
    // Asking for bfB anyway is refused before anything happens.
    const r = await game.p1.try((p) => p.reveal("pyke", { to: "bfB" } as never));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("pyke")).toBe("facedown-bfA");
  });

  test("revealing it plays Pyke for [0] to bfA — where it was hidden — never to bfB; no destination prompt appears on the way", async () => {
    const game = await board().build();
    await game.p1.reveal("pyke");
    expect(game.decision()?.kind).toBe("action"); // nothing asked
    await game.settle();
    expect(game.zoneOf("pyke")).toBe("battlefield-bfA");
    expect(game.p1.units("bfA").toSorted()).toEqual(["guardA", "pyke"]);
    expect(game.p1.units("bfB")).toEqual(["guardB"]);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } }); // hidden play ignores the cost
    expect(game.state("pyke")).toMatchObject({ isHidden: false, might: 2 });
  });

  test("paying the optional [fury] on the flip still lands him at bfA (ready, +2 this turn) — the extra cost never unlocks another location", async () => {
    const game = await board().build();
    await game.p1.reveal("pyke", { payOptional: true });
    await game.settle();
    expect(game.zoneOf("pyke")).toBe("battlefield-bfA");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 0 } });
    expect(game.state("pyke")).toMatchObject({ isReady: true, might: 4 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — played normally from HAND, Pyke may go to base, bfA or bfB (any battlefield P1 controls)", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .battlefield("bfA", { controller: P1 })
      .battlefield("bfB", { controller: P1 })
      .unit(P1, "bfA", { might: 3, name: "Guard A" }, "guardA")
      .unit(P1, "bfB", { might: 3, name: "Guard B" }, "guardB")
      .hand(P1, PYKE, "pyke")
      .build();
    const to = game.p1.option("play", "pyke")?.fields.find((f) => f.arg === "to")?.options ?? [];
    expect(to.map(String)).toEqual(expect.arrayContaining(["base", "battlefield-bfA", "battlefield-bfB"]));
    await game.p1.play("pyke", { to: "bfB" });
    await game.settle();
    expect(game.zoneOf("pyke")).toBe("battlefield-bfB");
  });
});
