/**
 * Ruling 5e5e1f52954da5a7 — Sprite token (OGN-274 → ogn-274-298, 3 Might [Temporary])
 *   × Mask of Foresight (OGN-060 → ogn-060-298) Gear "When a friendly unit attacks or defends alone, give it +1 [Might] this turn."
 *   × Smoke and Mirrors (UNL-083 → unl-083-219) [Action] "Choose a unit you control and another … at a different location.
 *     If at least one of them has [Temporary], move each to the other's location. Draw 1."
 *   × Lillia, Fae Fawn (UNL-082 → unl-082-219) "When I move from a location, play a 3 [Might] Sprite token with [Temporary] there."
 *
 * Q: Lillia defends bf1 alone (Mask +1). I Smoke-and-Mirrors Lillia ⇄ the Sprite in base. Two triggers result: Lillia's
 *    move (a new Sprite at bf1) and Mask for the Sprite now alone at bf1. Can I order them so the Sprite gets Mask's +1
 *    before Lillia's new Sprite arrives and "un-alones" it?
 * A: You may order your triggers as you like, but it does not matter: Mask's "alone" is checked when the defender
 *    designation is gained and the trigger is then locked in. Whichever resolves first, the swapped-in Sprite gets +1
 *    for the combat; the later token arriving does not undo it.
 * Rules: 383.3.d (controller orders simultaneous triggers), 383.4.f / 464.2.c.3.a (defend designation mid-combat), 740.2.a.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MASK_OF_FORESIGHT = "ogn-060-298";
const LILLIA = "unl-082-219";
const SMOKE_AND_MIRRORS = "unl-083-219";
const SPRITE = "ogn-274-298";

/** P2's turn. P1 holds bf1 with Lillia alone; Mask + a Sprite token in P1's base; Smoke and Mirrors in hand + [2]. P2: 6-Might Raider. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .gear(P1, MASK_OF_FORESIGHT, "mask")
    .unit(P1, "bf1", LILLIA, "lillia")
    .unit(P1, "base", SPRITE, "sprite")
    .unit(P2, "base", { might: 6, name: "Raider" }, "raider")
    .hand(P1, SMOKE_AND_MIRRORS, "sm");
}

/** Raider attacks bf1 → Mask for lone Lillia resolves (4); P2 passes Focus; P1 casts Smoke and Mirrors (Lillia ⇄ Sprite) and it resolves. */
async function swapDuringShowdown(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.state("lillia").combatRole).toBe("defender");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mask", triggered: true })]);
  while (game.chain().length > 0 && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
  expect(game.state("lillia").might).toBe(4);
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("sm", { targets: ["lillia", "sprite"] });
  while (game.chain().some((c) => c.cardId === "sm") && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
  expect(game.zoneOf("sm")).toBe("trash");
  expect(game.locationOf("lillia")).toBe("base");
  expect(game.locationOf("sprite")).toBe("bf1");
  expect(game.state("sprite").combatRole).toBe("defender");
  return game;
}

const spritesAt = (game: Game, loc: string) => game.p1.units(loc).filter((u) => game.state(u).name === "Sprite");

describe("Ruling 5e5e1f52954da5a7 — trigger order after the Lillia ⇄ Sprite swap does not change Mask's +1 on the Sprite", () => {
  test("the swap creates TWO P1 triggers pending together: Lillia's move (token) and Mask of Foresight (Sprite defends alone)", async () => {
    const game = await swapDuringShowdown();
    if (game.decision()?.kind === "order") {
      await game.acceptTriggerOrder();
    }
    const pending = game.chain().map((c) => c.cardId).sort();
    expect(pending).toEqual(["lillia", "mask"]);
    expect(game.chain().every((c) => c.controller === P1 && c.triggered)).toBe(true);
    expect(game.state("sprite").might).toBe(3); // nothing resolved yet
  });

  // Expected (ruling): both triggers are P1's and P1 is asked to ORDER them on the chain (383.3.d) — an `order`
  // decision for P1. Actual: the engine finalizes them in a fixed sequence (Lillia's move trigger, then Mask at the
  // cleanup that hands the Sprite its defender designation) and never surfaces an order choice.
  test("ruling 5e5e1f52954da5a7 — engine offers P1 no choice of order for the two triggers (fixed order, no `order` decision)", async () => {
    const game = await swapDuringShowdown();
    expect(game.decision()).toMatchObject({ kind: "order", seat: P1 });
  });

  test("Mask resolves BEFORE Lillia's token: the Sprite is 4; then the second Sprite token lands at bf1 (no longer alone) — the +1 STAYS", async () => {
    const game = await swapDuringShowdown();
    if (game.decision()?.kind === "order") {
      const d = game.decision();
      const items = d?.kind === "order" ? d.items : [];
      // chain is LIFO: place Lillia first, Mask last (on top) so Mask resolves first
      const lilliaKey = items.find((i) => i.card === "lillia")?.key as string;
      const maskKey = items.find((i) => i.card === "mask")?.key as string;
      await game.p1.order([lilliaKey, maskKey]);
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["lillia", "mask"]); // Mask on top
    // Resolve Mask only.
    while (game.chain().some((c) => c.cardId === "mask") && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.state("sprite")).toMatchObject({ might: 4, mightModifier: 1 });
    expect(spritesAt(game, "bf1")).toEqual(["sprite"]); // still alone right now
    // Now Lillia's trigger: a new Sprite token at bf1 (her origin).
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(spritesAt(game, "bf1")).toHaveLength(2);
    expect(game.state("sprite")).toMatchObject({ might: 4, mightModifier: 1 }); // not retroactively removed
    expect(game.state("lillia").might).toBe(4); // her own +1 lasts the turn too
    expect(game.violations()).toEqual([]);
  });

  test("through to combat: the defenders are the boosted Sprite (4) + the new Sprite (3) = 7 vs Raider 6 — P1 holds bf1", async () => {
    const game = await swapDuringShowdown();
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("lillia")).toBe("base");
  });
});
