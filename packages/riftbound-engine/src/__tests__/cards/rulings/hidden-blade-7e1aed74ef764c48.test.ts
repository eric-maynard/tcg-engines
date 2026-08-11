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
 * Rules: 811.1.d.2 (Tideturner exception to hidden targeting; the Blade's own choice is locked to the battlefield it was
 *        hidden at), 355.11 / 359.3.e.4-5 (target legality re-checked on resolution; no retargeting), 340.1 (LIFO).
 *
 * The ruling's Blade is ON THE BATTLEFIELD (played from Hidden) — that is where the fizzle comes from, and it is the CR's own
 * worked example (359.3.e.5). A Blade cast from HAND has no such scope: 359.3.e.4 spells out that "a unit at a battlefield"
 * stops being legal only when it is no longer AT A battlefield, so a swap between two battlefields leaves it killable. Both
 * boards are covered below.
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

/**
 * The ruling's own board: the Blade is on the battlefield — hidden at bf1, where Jinx stands — instead of held in hand.
 * Playing it from Hidden costs [0] and locks its choice to bf1 (rule 811.1.d.2), which is what makes the swapped-away Jinx
 * illegal on resolution.
 */
function hiddenBoard() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Jinx", tags: ["Jinx"] }, "jinx")
    .unit(P1, "bf2", { might: 3, name: "Anchor" }, "anchor")
    .facedown(P1, "bf2", TIDETURNER, "tide")
    .unit(P1, "base", { might: 1, name: "Reserve" }, "reserve")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .facedown(P2, "bf1", HIDDEN_BLADE, "blade")
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

  // The ruling ("Hidden Blade ON THE BATTLEFIELD targets Jinx") is about a Blade played from the facedown zone, and so is
  // the CR's own worked example of it (359.3.e.5). The fizzle comes from rule 811.1.d.2: a hidden play may only choose
  // among objects at the battlefield it was hidden at, and that scope is re-read on resolution — a Jinx swapped to bf2 is
  // no longer at bf1. Cast from HAND (the tests above) there is no such scope, and 359.3.e.4 keeps "a unit at a
  // battlefield" legal after a battlefield-to-battlefield swap, so that Blade does kill her.
  test("ruling 7e1aed74ef764c48 — a Blade played from Hidden at bf1 resolves to no effect once Jinx is swapped to bf2: she lives, nobody draws, Tideturner survives", async () => {
    const game = await hiddenBoard().build();
    await game.p2.reveal("blade"); // rule 811.1.d.2: Jinx, alone at bf1, is the only choice — auto-bound
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P2, targets: ["jinx"] })]);
    await game.p2.passPriority();
    await game.p1.reveal("tide");
    await game.p1.yes();
    await game.p1.pick("jinx");
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "tide"); i++) {
      await game.acting().passPriority();
    }
    expect(game.locationOf("jinx")).toBe("bf2");
    expect(game.locationOf("tide")).toBe("bf1");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("jinx")).toBe("battlefield-bf2");
    expect(game.zoneOf("tide")).toBe("battlefield-bf1");
    expect(game.state("tide").damage).toBe(0);
    expect(game.p1.hand()).toEqual([]); // no "its controller draws 2"
    expect(game.p1.deck()[0]).toBe("d1");
  });
});
