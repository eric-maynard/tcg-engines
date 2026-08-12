/**
 * Ruling 2c0a77d6b47b559e — Zaun Warrens (OGN-298 → ogn-298-298, Battlefield)
 *     "When you conquer here, discard 1, then draw 1."
 *   × Super Mega Death Rocket! (OGN-252 → ogn-252-298) · "When you conquer, you may discard 1 to return this
 *     from your trash to your hand."
 *
 * Q: Can I re-add a Death Rocket that Zaun Warrens made me discard, using that same conquer?
 * A: No. The Rocket's ability only functions from the trash, and it was still in hand when the conquer
 *    happened, so it never triggered. Discarding it later, as Zaun Warrens resolves, does not create a new
 *    conquer for it to see.
 * Rules: 385.2 (an ability that functions from the trash needs the card to be there when the event occurs),
 *        383.2 (trigger conditions are checked at the moment of the event), 383.3.d (simultaneous triggers
 *        are ordered by their controller, but the set is fixed when the event happens).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZAUN_WARRENS = "ogn-298-298";
const SMDR = "ogn-252-298";

/** P1's turn. P2 holds the live Zaun Warrens with a 1-Might guard; P1 attacks with a 5-Might Raider. */
function board(rocketIn: "hand" | "trash") {
  const b = scenario()
    .resources(P1, { energy: 4, power: { rainbow: 1 } })
    .battlefield("warrens", { controller: P2, def: ZAUN_WARRENS, inert: false, owner: P1 })
    .unit(P1, "base", { might: 5, name: "Raider" }, "raider")
    .unit(P2, "warrens", { might: 1, name: "Guard" }, "guard")
    .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Spare One" }, "spare1")
    .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Spare Two" }, "spare2");
  return rocketIn === "hand" ? b.hand(P1, SMDR, "rocket") : b.trash(P1, SMDR, "rocket");
}

/** Attack the Warrens and drive every conquer prompt, discarding `discard` first and spares afterwards. */
async function conquer(game: Game, discard: string): Promise<void> {
  await game.p1.move("raider", "warrens");
  let first = true;
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      return;
    }
    if (d.kind === "pick" && d.seat === P1) {
      const wanted = first && d.options.some((o) => (o.card ?? o.key) === discard) ? discard : (d.options[0]?.key as string);
      first = false;
      await game.p1.pick(wanted);
    } else if (d.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
    } else if (d.kind === "order") {
      await game.seat(d.seat).order([]);
    } else if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else {
      return;
    }
  }
}

describe("Ruling 2c0a77d6b47b559e — the Rocket was in hand when the conquer happened, so that conquer can never return it", () => {
  test("Zaun Warrens' discard sends the Rocket to the trash — and nothing offers to bring it back: it stays there", async () => {
    const game = await board("hand").build();
    const hand = game.p1.hand().length;
    await conquer(game, "rocket");
    expect(game.gameState.battlefields.warrens?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("rocket")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1); // discarded 1, drew 1
    expect(game.p1.hand()).not.toContain("rocket");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.energy()).toBe(4); // the Rocket's "discard 1" cost was never paid
    expect(game.violations()).toEqual([]);
  });

  test("contrast: a Rocket ALREADY in the trash when the conquer happens does trigger — P1 is offered the discard and it returns to hand", async () => {
    const game = await board("trash").build();
    expect(game.zoneOf("rocket")).toBe("trash");
    await conquer(game, "spare1");
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("rocket")).toBe("hand");
    expect(game.zoneOf("spare1")).toBe("trash"); // a Spare paid the Rocket's discard cost
  });
});
