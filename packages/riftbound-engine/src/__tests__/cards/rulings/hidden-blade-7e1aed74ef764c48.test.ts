/**
 * Ruling 7e1aed74ef764c48 — Hidden Blade (OGN-213 → ogn-213-298) · [Hidden][Action] · "Kill a unit at a battlefield. Its controller
 *   draws 2."   × Tideturner (OGN-199 → ogn-199-298) · [Hidden] · "When you play me, you may choose a unit you control at another
 *   location. Move me to its location and it to my original location."
 *
 * Q: Hidden Blade targets Jinx at a battlefield; in response her controller reveals a hidden Tideturner and swaps it with Jinx.
 *    Does the Blade fizzle, or does Tideturner die in her place?
 * A: Neither. The Blade still resolves, but Jinx — now at a different location — is an illegal target, so it resolves with no
 *    effect; it does not jump to Tideturner, who survives. (Tideturner's choice ignores the hidden "here" restriction because it
 *    can only ever pick a unit at ANOTHER location.)
 * Rules: 811.1.d.2 (Tideturner exception to hidden targeting), 355.11 / 359.3.f (target legality re-checked on resolution; no
 *        retargeting), 340.1 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const TIDETURNER = "ogn-199-298";

/**
 * P2's turn 3. P1 controls bf1 (Jinx, 4 Might, alone) and bf2 (Anchor 3 + Tideturner facedown, hidden earlier).
 * P2 holds Hidden Blade with 2 + [order]. P1's deck top is known.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Jinx", tags: ["Jinx"] }, "jinx")
    .unit(P1, "bf2", { might: 3, name: "Anchor" }, "anchor")
    .facedown(P1, "bf2", TIDETURNER, "tide")
    .unit(P1, "base", { might: 1, name: "Reserve" }, "reserve") // a second swap candidate so the choice is a real prompt
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P2, HIDDEN_BLADE, "blade")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** P2 Blades Jinx and passes; P1 reveals Tideturner at bf2, opts in and picks Jinx; the swap resolves (Blade still pending). */
async function bladeThenSwap(game: Game): Promise<void> {
  await game.p2.cast("blade", { targets: "jinx" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P2, targets: ["jinx"] })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "tide")).toBe(true);
  await game.p1.reveal("tide");
  expect(game.locationOf("tide")).toBe("bf2"); // enters where it was hidden
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : [];
  expect(offered).toEqual(["jinx", "reserve"]); // units at OTHER locations (even from hidden) — never Anchor, who is here
  await game.p1.pick("jinx");
  expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "tide"]);
  for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "tide"); i++) {
    await game.acting().passPriority();
  }
  expect(game.locationOf("tide")).toBe("bf1");
  expect(game.locationOf("jinx")).toBe("bf2");
  expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
}

describe("Ruling 7e1aed74ef764c48 — Tideturner swaps the Hidden Blade target away: no kill, no retarget", () => {
  test("the response works: Tideturner (revealed at bf2) may pick Jinx at bf1; LIFO swaps them — Tideturner to bf1, Jinx to bf2 — with the Blade still on the chain", async () => {
    const game = await board().build();
    await bladeThenSwap(game);
    expect(game.zoneOf("jinx")).toBe("battlefield-bf2");
    expect(game.zoneOf("tide")).toBe("battlefield-bf1");
  });

  test("Hidden Blade then resolves and does NOT 'fizzle' onto Tideturner: Tideturner (now where Jinx was) survives, the Blade goes to trash with P2's cost spent", async () => {
    const game = await board().build();
    await bladeThenSwap(game);
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("tide")).toBe("battlefield-bf1");
    expect(game.state("tide").damage).toBe(0);
  });

  // BUG: expected — Jinx, having changed location since she was chosen, is an illegal target when the Blade resolves, so it
  // resolves with no effect: Jinx lives and nobody draws. Actual — the engine still treats Jinx (at bf2, "a unit at a
  // battlefield") as legal: she is killed and P1 draws 2.
  test.failing("BUG: ruling 7e1aed74ef764c48 — engine still kills the relocated Jinx (and P1 draws 2) instead of resolving Hidden Blade to no effect", async () => {
    const game = await board().build();
    await bladeThenSwap(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("jinx")).toBe("battlefield-bf2");
    expect(game.p1.hand()).toEqual([]); // no "its controller draws 2"
    expect(game.p1.deck()[0]).toBe("d1");
  });
});
