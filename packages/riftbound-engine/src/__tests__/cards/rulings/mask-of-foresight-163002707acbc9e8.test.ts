/**
 * Ruling 163002707acbc9e8 — Mask of Foresight (OGN-060 → ogn-060-298) · Gear · Calm · 2
 *   "When a friendly unit attacks or defends alone, give it +1 [Might] this turn."
 *   × Lillia, Fae Fawn (UNL-082 → unl-082-219) "When I move from a location, play a 3 [Might] Sprite unit
 *     token with [Temporary] there."
 *   × Sprite token (OGN-274) · × Smoke and Mirrors (UNL-083 → unl-083-219) [Action] "Choose a unit you control
 *     and another unit you control at a different location. If at least one has [Temporary], move each to the
 *     other's location. Draw 1."
 *
 * Q: Mask on board, Lillia defends a battlefield alone (gets Mask's +1), a [Temporary] Sprite sits in base.
 *    In the showdown I Smoke-and-Mirrors Lillia ⇄ Sprite. Does the Sprite, now the lone defender, get Mask's +1?
 * A: Yes. The Sprite newly arrives alone during the combat and gains the defender designation → Mask
 *    triggers anew for it. Lillia's move trigger and the new Mask trigger are both P1's; P1 may order them.
 *    Once the Mask trigger resolves the Sprite has +1 [Might].
 * Rules: 383.4.f (defend triggers fire when a unit first gains the designation in a combat), 464.2.c.3.a
 *        (a unit arriving mid-combat gains the designation at the next Cleanup), 740.2.a (alone).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MASK_OF_FORESIGHT = "ogn-060-298";
const LILLIA = "unl-082-219";
const SMOKE_AND_MIRRORS = "unl-083-219";
const SPRITE = { cardType: "unit", keywords: ["Temporary"], might: 3, name: "Sprite" } as const;

/** P2's turn. P1 holds bf1 with Lillia alone; Mask + a Temporary Sprite in base; Smoke and Mirrors in hand (2). */
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

/** Raider attacks bf1; Mask triggers for Lillia (alone) and resolves; P2 passes focus to P1. */
async function attackAndMaskLillia(game: Game): Promise<void> {
  await game.p2.move("raider", "bf1");
  expect(game.state("lillia").combatRole).toBe("defender");
  // Mask's trigger for the lone defender resolves (both pass priority) — stop before combat damage.
  while (game.chain().length > 0 && game.decision()?.kind === "action") {
    await game.acting().passPriority();
  }
  expect(game.state("lillia").might).toBe(4); // 3 + Mask's +1
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
}

describe("Ruling 163002707acbc9e8 — a Sprite swapped in as the new lone defender re-triggers Mask of Foresight", () => {
  test("premise: Lillia defending alone gets Mask's +1 (3 → 4) when the Raider attacks", async () => {
    const game = await board().build();
    await attackAndMaskLillia(game);
    expect(game.state("lillia").mightModifier).toBe(1);
    expect(game.state("sprite").might).toBe(3);
  });

  test("Smoke and Mirrors in the showdown swaps Lillia ⇄ Sprite (Sprite is Temporary): Sprite is now at bf1, Lillia in base, P1 drew 1", async () => {
    const game = await board().build();
    await attackAndMaskLillia(game);
    const handBefore = game.p1.hand().length;
    expect(game.p1.can("cast", "sm")).toBe(true);
    await game.p1.cast("sm", { targets: ["lillia", "sprite"] });
    // Resolve Smoke and Mirrors only.
    while (game.chain().some((c) => c.cardId === "sm") && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("sm")).toBe("trash");
    expect(game.locationOf("sprite")).toBe("bf1");
    expect(game.locationOf("lillia")).toBe("base");
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 1); // cast one, drew one
  });

  test("after the swap the Sprite gains the defender designation ALONE → Mask triggers again (alongside Lillia's move trigger, both P1's to order); once resolved the Sprite is 4 Might", async () => {
    const game = await board().build();
    await attackAndMaskLillia(game);
    await game.p1.cast("sm", { targets: ["lillia", "sprite"] });
    while (game.chain().some((c) => c.cardId === "sm") && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.locationOf("sprite")).toBe("bf1");
    expect(game.state("sprite").combatRole).toBe("defender");
    // Two P1 triggers were created by the swap: Lillia's "when I move" and Mask's "defends alone" for the Sprite.
    const d = game.decision();
    if (d?.kind === "order") {
      expect(d.seat).toBe(P1);
      await game.acceptTriggerOrder();
    }
    const pending = game.chain().map((c) => c.cardId).sort();
    expect(pending).toContain("mask");
    expect(pending).toContain("lillia");
    // Resolve the triggers (stop before combat damage).
    while (game.chain().length > 0 && game.decision()?.kind !== undefined) {
      const dd = game.decision();
      if (dd?.kind === "action") {
        await game.acting().passPriority();
      } else if (dd?.kind === "pick" && dd.seat === P1) {
        // Lillia's token destination / Mask target, if asked — take the only sensible option.
        await game.p1.pick(dd.options[0]?.key as string);
      } else {
        break;
      }
    }
    expect(game.state("sprite").might).toBe(4); // 3 + Mask's +1 — the ruling
    expect(game.state("sprite").mightModifier).toBe(1);
    expect(game.state("lillia").might).toBe(4); // her earlier +1 lasts the turn
    expect(game.violations()).toEqual([]);
  });
});
