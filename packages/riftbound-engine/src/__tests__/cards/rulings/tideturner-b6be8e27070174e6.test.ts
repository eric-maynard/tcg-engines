/**
 * Ruling b6be8e27070174e6 — Tideturner (OGN-199 → ogn-199-298) · Unit · [2] · 2 Might
 *   "[Hidden] (Hide now for [rainbow] to react with later for [0].) · When you play me, you may choose a
 *    unit you control at another location. Move me to its location and it to my original location."
 *
 * Q: Can a hidden unit be played to a location other than the battlefield where it was hidden?
 * A: No. Every choice made while playing a card out of a Facedown Zone — the play location included — is
 *    restricted to that battlefield. Played normally from hand the same card may go anywhere legal.
 * Rules: 811.1.d.2 (choices made from the Facedown Zone are locked to its battlefield),
 *        355.2.a (a play offers each legal destination).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const TIDETURNER = "ogn-199-298";

/** P1 controls bf1 and bf2, holds one Tideturner in hand and has another hidden at bf1. */
function twoBattlefields() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Bulwark" }, "a")
    .unit(P1, "bf2", { might: 2, name: "Outrider" }, "b")
    .hand(P1, TIDETURNER, "fromHand")
    .facedown(P1, "bf1", TIDETURNER, "hidden")
    .resources(P1, { energy: 2 });
}

const destinations = (variants: readonly { params: Readonly<Record<string, unknown>> }[]) =>
  variants.map((v) => v.params.location).toSorted();

describe("Ruling b6be8e27070174e6 — a hidden unit is played at the battlefield it was hidden at, nowhere else", () => {
  test("from HAND the same card offers base and both battlefields", async () => {
    const game = await twoBattlefields().build();
    const opt = game.p1.option("play", "fromHand");
    expect(destinations(opt?.variants ?? [])).toEqual(["base", "battlefield-bf1", "battlefield-bf2"]);
  });

  test("from the Facedown Zone at bf1 there is exactly one play, and it is bf1", async () => {
    const game = await twoBattlefields().build();
    expect(game.zoneOf("hidden")).toBe("facedown-bf1");
    const opt = game.p1.option("reveal", "hidden");
    expect(opt?.variantCount).toBe(1);
    expect(opt?.fields.find((f) => f.arg === "to")).toBeUndefined(); // no destination is on offer
    await game.p1.reveal("hidden");
    expect(game.locationOf("hidden")).toBe("bf1");
    expect(game.zoneOf("hidden")).toBe("battlefield-bf1");
    expect(game.p1.units("bf2")).toEqual(["b"]); // it did not go to the other battlefield P1 controls
  });

  test("its own optional 'when you play me' follows the play — declining leaves it where it was hidden", async () => {
    const game = await twoBattlefields().build();
    await game.p1.reveal("hidden");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    expect(game.decision()?.source?.cardId).toBe("hidden");
    await game.p1.no();
    await game.settle();
    expect(game.locationOf("hidden")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });
});
