/**
 * Ruling c7cd0f18454c9d64 — Tideturner (OGN-199 → ogn-199-298) · Unit · Chaos · 2 · 2 Might
 *     "[Hidden] When you play me, you may choose a unit you control at another location. Move me to its location and
 *      it to my original location."
 *   × Vilemaw's Lair (OGN-295 → ogn-295-298, Battlefield) "Units can't move from here to base."  (Vilemaw unl-060-219 is
 *     only the Lair's namesake — not involved.)
 *
 * Q: Can Tideturner switch places with a unit at Vilemaw's Lair?
 * A: Not if Tideturner was played to BASE: "can't" beats "can", so the Lair unit cannot move to base. The swap resolves
 *    partially — Tideturner still moves to the Lair; the chosen unit stays there. Exception: if Tideturner's original
 *    location is another BATTLEFIELD (e.g. played from Hidden there), the swap completes fully — the Lair only forbids
 *    moves to base.
 * Rules: 054.1 (forbidding effects supersede permitting ones), 359.3.e.11 (partially follow instructions), 447 (moves),
 *        811.1.d.2 (Tideturner from Hidden may choose freely).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIDETURNER = "ogn-199-298";
const VILEMAWS_LAIR = "ogn-295-298";

/** Opt into Tideturner's swap and (if asked) name the Lair unit; then let the trigger resolve. */
async function swapWithLaired(game: Game): Promise<void> {
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "tt" } });
  await game.p1.yes();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    expect(d.options.map((o) => o.card ?? o.key)).toContain("laired");
    await game.p1.pick("laired");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tt", triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.chain()).toEqual([]);
}

describe("Ruling c7cd0f18454c9d64 — Tideturner cannot pull a unit out of Vilemaw's Lair to base; from another battlefield it can", () => {
  test("premise: a unit at the (live) Lair carries the 'can't move to base' restriction", async () => {
    const game = await scenario()
      .battlefield("lair", { controller: P1, def: VILEMAWS_LAIR, inert: false })
      .unit(P1, "lair", { might: 3, name: "Laired" }, "laired")
      .build();
    expect(game.state("laired").keywords).toContain("NoMoveToBase");
  });

  test("played to BASE targeting the Lair unit: Tideturner moves to the Lair, the Lair unit can't move to base and STAYS — both end up at Vilemaw's Lair", async () => {
    const game = await scenario()
      .battlefield("lair", { controller: P1, def: VILEMAWS_LAIR, inert: false })
      .battlefield("bfB", { controller: P2 })
      .unit(P1, "lair", { might: 3, name: "Laired" }, "laired")
      .unit(P2, "bfB", { might: 3, name: "Watcher" }, "watcher")
      .resources(P1, { energy: 2 })
      .hand(P1, TIDETURNER, "tt")
      .build();
    await game.p1.play("tt", { to: "base" });
    expect(game.p1.energy()).toBe(0);
    expect(game.locationOf("tt")).toBe("base");
    await swapWithLaired(game);
    expect(game.locationOf("tt")).toBe("lair"); // Tideturner's half happens
    expect(game.locationOf("laired")).toBe("lair"); // the Lair unit's half is forbidden
    expect(game.p1.units("lair").sort()).toEqual(["laired", "tt"]);
    expect(game.p1.units("base")).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("exception — Tideturner's original location is ANOTHER BATTLEFIELD (played from Hidden at bfB): the swap completes fully — Tideturner → Lair, Lair unit → bfB", async () => {
    const game = await scenario()
      .turn(3)
      .battlefield("lair", { controller: P1, def: VILEMAWS_LAIR, inert: false })
      .battlefield("bfB", { controller: P1 })
      .unit(P1, "lair", { might: 3, name: "Laired" }, "laired")
      .unit(P1, "bfB", { might: 3, name: "Bee" }, "bee")
      .unit(P2, "base", { might: 3, name: "Watcher" }, "watcher")
      .facedown(P1, "bfB", TIDETURNER, "tt")
      .build();
    expect(game.p1.can("reveal", "tt")).toBe(true);
    await game.p1.reveal("tt");
    expect(game.locationOf("tt")).toBe("bfB"); // played "here"
    await swapWithLaired(game);
    expect(game.locationOf("tt")).toBe("lair");
    expect(game.locationOf("laired")).toBe("bfB"); // battlefield → battlefield is not blocked by the Lair
    expect(game.locationOf("bee")).toBe("bfB");
    expect(game.violations()).toEqual([]);
  });
});
