/**
 * Ruling 245faa683c8df01d — Tideturner (OGN-199 → ogn-199-298) · Unit · Chaos · 2 Might
 *     "[Hidden] When you play me, you may choose a unit you control at another location. Move me to its location and it
 *      to my original location."
 *   × Mask of Foresight (OGN-060 → ogn-060-298) · Gear · "When a friendly unit attacks or defends alone, give it +1 [Might]
 *     this turn."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Action · "Move a friendly unit and ready it."
 *
 * Q: U (with Tideturner hidden at its battlefield A) defends alone → +1 from the Mask. Mid-showdown U Rides the Wind to
 *    battlefield B, then Tideturner is played from face-down and swaps U back to A. Another +1 for U? When is B scored?
 * A: No second +1 for U — attack/defend triggers fire only the first time a unit gains the designation in a combat.
 *    Tideturner itself DOES get +1 (it becomes a lone defender when played at A): its play trigger goes on the chain
 *    first, the Mask trigger on top; Mask resolves (+1 Tideturner), then the swap. The combat at A resolves fully before
 *    any showdown at B; if you still have a unit at B after that showdown, you score B. Hidden cards stay at A when its
 *    units move away mid-combat (control isn't lost until combat ends).
 * Rules: 383.4.e (designation triggers once per combat), 464.2.c.3.a (late defender), 811 (Hidden stays while you
 *        control the battlefield), 344 / 464 (one showdown at a time), 441–444 (conquer scoring).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TIDETURNER = "ogn-199-298";
const MASK_OF_FORESIGHT = "ogn-060-298";
const RIDE_THE_WIND = "ogn-173-298";

/**
 * P2's turn 3; P1 on 1 point. P1 holds bfA with U (3) and hid Tideturner there earlier; bfB is uncontrolled and empty.
 * P1: Mask of Foresight in base, Ride the Wind in hand with exactly [2]+[chaos]. P2: Raider (3) in base.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .points(P1, 1)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: null })
    .unit(P1, "bfA", { might: 3, name: "Unit U" }, "U")
    .facedown(P1, "bfA", TIDETURNER, "tide")
    .gear(P1, MASK_OF_FORESIGHT, "mask")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

/** Pass priority until Tideturner's play trigger has left the chain (the swap happened). */
async function passUntilTideResolved(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().some((c) => c.cardId === "tide"); i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

/** Raider attacks bfA → U defends alone → Mask +1 resolves (U = 4). Focus then sits with P2. */
async function attackAndFirstMask(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bfA");
  expect(game.state("U").combatRole).toBe("defender");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mask", controller: P1, triggered: true })]);
  await resolveChain(game);
  expect(game.state("U").might).toBe(4);
  return game;
}

/** …P2 passes focus; P1 Rides U to bfB (readied); the chain resolves and focus returns via P2 to P1. */
async function rideUToB(game: Game): Promise<void> {
  await game.p2.passFocus();
  await game.p1.cast("rtw", { targets: "U" });
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("battlefield-bfB");
  await resolveChain(game);
  expect(game.state("U")).toMatchObject({ isReady: true, zone: "battlefield-bfB" });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
}

/** …P1 plays Tideturner from face-down at bfA and opts into the swap with U. Stops with [tide, mask] on the chain. */
async function revealTideturner(game: Game): Promise<void> {
  await game.p1.reveal("tide");
  for (let i = 0; i < 3; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes(); // "you may choose a unit you control at another location"
    } else if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("U");
    } else {
      break;
    }
  }
}

describe("Ruling 245faa683c8df01d — Tideturner swap mid-combat: no second Mask bonus for U, Tideturner gets its own, B scores after A's combat", () => {
  test("U defends bfA alone → Mask of Foresight gives it +1 (3 → 4)", async () => {
    const game = await attackAndFirstMask();
    expect(game.state("U")).toMatchObject({ combatRole: "defender", might: 4, zone: "battlefield-bfA" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("Ride the Wind moves U to the empty bfB mid-showdown: bfB is now pending-contested by P1, yet P1 keeps control of bfA for the rest of the combat and the face-down Tideturner STAYS hidden there", async () => {
    const game = await attackAndFirstMask();
    await rideUToB(game);
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, controller: P1 });
    expect(game.zoneOf("tide")).toBe("facedown-bfA");
    expect(game.state("tide").isHidden).toBe(true);
    expect(game.p1.can("reveal", "tide")).toBe(true);
    expect(game.p1.points()).toBe(1); // nothing at bfB is scored while A's combat is running
  });

  test("playing Tideturner from face-down at bfA makes it a lone defender: its play trigger goes on the chain FIRST and the Mask trigger on TOP; Mask resolves first → Tideturner 2 → 3", async () => {
    const game = await attackAndFirstMask();
    await rideUToB(game);
    await revealTideturner(game);
    expect(game.zoneOf("tide")).toBe("battlefield-bfA");
    expect(game.state("tide").combatRole).toBe("defender");
    expect(game.chain().map((c) => c.cardId)).toEqual(["tide", "mask"]);
    expect(game.chain()[0]).toMatchObject({ cardId: "tide", targets: ["U"], triggered: true });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Mask resolves
    expect(game.state("tide").might).toBe(3);
    expect(game.chain().map((c) => c.cardId)).toEqual(["tide"]);
  });

  test("then the swap resolves: Tideturner → bfB, U → back to bfA on the defending side", async () => {
    const game = await attackAndFirstMask();
    await rideUToB(game);
    await revealTideturner(game);
    await passUntilTideResolved(game);
    expect(game.zoneOf("tide")).toBe("battlefield-bfB");
    expect(game.state("U")).toMatchObject({ combatRole: "defender", zone: "battlefield-bfA" });
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, controller: P1 });
  });

  // U already gained the defender designation in THIS combat (and got its +1 then); coming back to A
  // via the swap does not make it "defend" again — no new Mask of Foresight trigger, U stays at 4 (one +1 this turn).
  test("ruling 245faa683c8df01d — no second Mask of Foresight trigger when U swaps back into bfA; defend triggers only fire the first time the designation is gained (U stays 4)", async () => {
    const game = await attackAndFirstMask();
    await rideUToB(game);
    await revealTideturner(game);
    await passUntilTideResolved(game);
    expect(game.state("U").zone).toBe("battlefield-bfA");
    expect(game.chain()).toEqual([]); // no new Mask trigger
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    await resolveChain(game);
    expect(game.state("U").might).toBe(4);
    expect(game.state("U").mightModifier).toBe(1); // exactly one Mask bonus this turn
  });

  test("scoring B: the combat at A resolves first (U kills the 3-Might Raider, P1 holds A — no point on P2's turn); only then does the showdown at bfB run, and with Tideturner still there P1 conquers B: 1 → 2 points", async () => {
    const game = await attackAndFirstMask();
    await rideUToB(game);
    await revealTideturner(game);
    await resolveChain(game);
    await game.settle(); // A's combat
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P1 });
    if (game.gameState.battlefields.bfB?.contested) {
      expect(game.p1.points()).toBe(1); // B not scored before its own showdown
      expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
      await game.settle(); // B's showdown: both pass
    }
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.zoneOf("tide")).toBe("battlefield-bfB");
    expect(game.gameState.conqueredThisTurn?.[P1]).toEqual(["bfB"]);
    expect(game.p1.points()).toBe(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
