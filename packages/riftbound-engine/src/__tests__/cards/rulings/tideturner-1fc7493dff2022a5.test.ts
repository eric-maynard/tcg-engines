/**
 * Ruling 1fc7493dff2022a5 — Tideturner (OGN-199 → ogn-199-298) · [Hidden] · 2 Might
 *     "When you play me, you may choose a unit you control at another location.
 *      Move me to its location and it to my original location."
 *
 * Q: Why does a Tideturner played from Hidden ignore the usual "choose only at that battlefield" restriction?
 * A: Because rule 811.1.d.2 carves out exactly this case: choices for cards played from Hidden are normally
 *    confined to the battlefield the card was hidden at, UNLESS the ability's own restriction makes that
 *    impossible. Tideturner must choose a unit at ANOTHER location, which no unit at its own battlefield can
 *    ever satisfy — so its target is chosen freely.
 * Rules: 811.1.d.2 (the Hidden targeting exception, which names Tideturner as its example), 355.10.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

type PickD = Extract<Decision, { kind: "pick" }>;

const TIDETURNER = "ogn-199-298";

/**
 * P1 controls bf1 (Anchor there, Tideturner hidden there) and bf2 (Ranger there), plus a Homebody in base.
 * Only the Ranger and the Homebody are "at another location"; the Anchor shares Tideturner's battlefield.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Anchor" }, "anchor")
    .unit(P1, "bf2", { might: 3, name: "Ranger" }, "ranger")
    .unit(P1, "base", { might: 1, name: "Homebody" }, "homebody")
    .facedown(P1, "bf1", TIDETURNER, "tide");
}

/** Reveal the hidden Tideturner (it enters at bf1) and opt in to its play ability at finalization. */
async function revealed(): Promise<Game> {
  const game = await board().build();
  await game.p1.reveal("tide");
  expect(game.locationOf("tide")).toBe("bf1");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
  await game.p1.yes();
  return game;
}

describe("Ruling 1fc7493dff2022a5 — Tideturner's 'another location' target escapes the Hidden lock", () => {
  test("premise: it is hidden at bf1, with friendly units at bf1 (Anchor), bf2 (Ranger) and base (Homebody)", async () => {
    const game = await board().build();
    expect(game.zoneOf("tide")).toBe("facedown-bf1");
    expect(game.p1.units("bf2")).toEqual(["ranger"]);
    expect(game.p1.units("bf1")).toEqual(["anchor"]);
  });

  test("ruling: the choices offered are the units elsewhere — NOT restricted to the battlefield it hid at", async () => {
    const game = await revealed();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const options = (d as PickD).options.map((o) => o.card ?? o.key).sort();
    expect(options).toEqual(["homebody", "ranger"]);
    expect(options).not.toContain("anchor"); // same location as Tideturner — can never satisfy the ability
  });

  test("…and taking it swaps them: Tideturner ends at bf2, the Ranger at bf1", async () => {
    const game = await revealed();
    await game.p1.pick("ranger");
    await game.settle();
    expect(game.locationOf("tide")).toBe("bf2");
    expect(game.locationOf("ranger")).toBe("bf1");
    expect(game.locationOf("anchor")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });
});
