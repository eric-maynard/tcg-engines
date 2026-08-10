/**
 * Ruling 29c2ff4af8370e9b — Back-Alley Bar (OGN-277 → ogn-277-298, Battlefield) "When a unit moves from here, give it +1
 *   [Might] this turn."
 *   × Blade Dancer (SFD-195 → sfd-195-221, Legend) "When you choose a friendly unit, you may exhaust me and pay [rainbow]
 *     to ready it. …"
 *
 * Q: A unit moves from Back-Alley Bar and gets the +1 — does that trigger Blade Dancer?
 * A: No. Blade Dancer needs YOU to choose a friendly unit; here the Bar's effect picks out the unit automatically — no
 *    player choice is made — so Blade Dancer does not trigger. (A spell you aim at the unit does trigger it.)
 * Rules: 383 (trigger conditions are literal), 355 (choosing/targeting is a player decision made for a spell or
 *        ability; an effect applied to "it" by a trigger involves no choice).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BACK_ALLEY_BAR = "ogn-277-298";
const BLADE_DANCER = "sfd-195-221";
const CLEAVE = "ogn-004-298"; // Action 1: "Give a unit [Assault 3] this turn." — a spell with which P1 CHOOSES a unit

/**
 * P1's turn. P1 controls Back-Alley Bar (live) with a ready 3-Might Patron on it; Blade Dancer (ready) is P1's legend;
 * P1 has 1 energy + 1 rainbow (enough for Cleave and for Blade Dancer's [rainbow]).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { rainbow: 1 } })
    .battlefield("bar", { controller: P1, def: BACK_ALLEY_BAR, inert: false, owner: P1 })
    .legend(P1, BLADE_DANCER, "bd")
    .unit(P1, "bar", { might: 3, name: "Patron" }, "patron")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker");
}

const isBladeDancerOffer = (d: Decision | null) =>
  !!d && d.seat === P1 && (d.kind === "yes-no" || (d.kind === "pick" && d.allowDecline)) && (d.source?.cardId === "bd" || /Blade Dancer/i.test(d.prompt));

/** Resolve whatever is pending, recording whether Blade Dancer's offer ever appears (declining it if so). */
async function drainWatchingForBladeDancer(game: Game): Promise<boolean> {
  let offered = false;
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (isBladeDancerOffer(d)) {
      offered = true;
      await (d.kind === "yes-no" ? game.p1.no() : game.p1.decline());
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  return offered;
}

describe("Ruling 29c2ff4af8370e9b — Back-Alley Bar's automatic +1 is not 'you choose a friendly unit': Blade Dancer stays quiet", () => {
  test("Patron moves from the Bar to base: the Bar's trigger gives it +1 this turn, and at NO point is Blade Dancer's ready offer surfaced — Patron stays exhausted from its move, Blade Dancer stays ready, the rainbow is unspent", async () => {
    const game = await board().build();
    await game.p1.move("patron", "base");
    expect(game.locationOf("patron")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bar", triggered: true })]);
    expect(game.chain().some((c) => c.cardId === "bd")).toBe(false);
    expect(isBladeDancerOffer(game.decision())).toBe(false);
    const offered = await drainWatchingForBladeDancer(game);
    expect(offered).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.state("patron")).toMatchObject({ isExhausted: true, location: "base", might: 4, mightModifier: 1 });
    expect(game.state("bd").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 1 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — P1 CHOOSES the Patron with a spell (Cleave): Blade Dancer's optional offer IS surfaced to P1", async () => {
    const game = await board().hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "patron" });
    let offered = isBladeDancerOffer(game.decision());
    for (let i = 0; i < 8 && !offered; i++) {
      const d = game.decision();
      if (d?.kind === "order" && d.defaultable) {
        await game.acceptTriggerOrder();
      } else if (d?.kind === "action" && d.context === "chain" && d.passKey) {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
      offered = isBladeDancerOffer(game.decision());
    }
    expect(offered).toBe(true);
    expect(game.decision()?.seat).toBe(P1);
  });
});
