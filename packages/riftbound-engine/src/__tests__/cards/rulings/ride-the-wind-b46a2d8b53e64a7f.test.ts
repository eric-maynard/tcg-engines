/**
 * Ruling b46a2d8b53e64a7f — Ride the Wind (OGN-173 → ogn-173-298) Action [2][chaos] "Move a friendly unit and ready it."
 *   × Mask of Foresight (OGN-060 → ogn-060-298) Gear "When a friendly unit attacks or defends alone, give it +1 [Might] this turn."
 *
 * Q: Kai'Sa moves onto my empty battlefield (non-combat showdown). I Ride the Wind Yasuo there mid-showdown. Does Yasuo
 *    get the Mask of Foresight trigger?
 * A: Yes. A COMBAT showdown is staged with Kai'Sa attacking and Yasuo defending (alone), and Yasuo gets the Mask bonus
 *    during that combat showdown. Nuance: players still pass to end the non-combat showdown before the combat one begins.
 * Rules: 344.1 / 348 (showdown at a battlefield that gains opposing units → combat), 464.2 (attacker = who applied
 *        contested; other side defends), Mask trigger on "defends alone".
 *
 * Kai'Sa / Yasuo are vanilla stand-ins (their own text is irrelevant to the ruling).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const MASK_OF_FORESIGHT = "ogn-060-298";

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);
const bf = (game: Game) => game.gameState.battlefields.bf1;

/** P2's turn. P1 controls bf1 (empty), has Mask of Foresight, Yasuo (4) in base, Ride the Wind + [2][chaos]. P2: Kai'Sa (3) in base. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .gear(P1, MASK_OF_FORESIGHT, "mask")
    .unit(P1, "base", { might: 4, name: "Yasuo" }, "yasuo")
    .unit(P2, "base", { might: 3, name: "Kai'Sa" }, "kaisa")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** Kai'Sa moves onto empty bf1 → non-combat showdown, P2 (attacker) has focus and passes it to P1. */
async function kaisaContests(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("kaisa", "bf1");
  expect(bf(game)).toMatchObject({ contested: true, contestedBy: P2 });
  expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1", isCombatShowdown: false });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

/** P1 casts Ride the Wind on Yasuo → bf1; both pass; it resolves (Yasuo at bf1, ready). */
async function rideYasuoIn(game: Game): Promise<void> {
  expect(game.p1.can("cast", "rtw")).toBe(true);
  await game.p1.cast("rtw", { targets: "yasuo" });
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toContain("battlefield-bf1");
  await game.p1.pick("battlefield-bf1");
  expect(game.chain().map((c) => c.cardId)).toEqual(["rtw"]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // resolves
  expect(game.zoneOf("rtw")).toBe("trash");
  expect(game.locationOf("yasuo")).toBe("bf1");
  expect(game.state("yasuo").isReady).toBe(true);
}

describe("Ruling b46a2d8b53e64a7f — Yasuo Rides the Wind into Kai'Sa's showdown and gets Mask of Foresight in the combat showdown", () => {
  test("Kai'Sa moving onto P1's empty bf1 opens a NON-combat showdown in which P1 (with focus) may cast Ride the Wind", async () => {
    const game = await kaisaContests();
    expect(game.p1.can("cast", "rtw")).toBe(true);
    expect(game.state("yasuo").might).toBe(4); // no Mask bonus outside combat
  });

  test("after Ride the Wind resolves, a COMBAT showdown is at bf1: Kai'Sa is the Attacker, Yasuo the lone Defender — and Mask of Foresight TRIGGERS for Yasuo (P1's chain item)", async () => {
    const game = await kaisaContests();
    await rideYasuoIn(game);
    // Drive forward (passing) until the combat showdown is live.
    for (let i = 0; i < 6 && showdown(game)?.isCombatShowdown !== true; i++) {
      await game.acting().pass();
    }
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.state("kaisa").combatRole).toBe("attacker");
    expect(game.state("yasuo").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mask", controller: P1, triggered: true })]);
  });

  test("the Mask trigger resolves: Yasuo is +1 [Might] (4 → 5) DURING the combat showdown; Kai'Sa stays 3", async () => {
    const game = await kaisaContests();
    await rideYasuoIn(game);
    for (let i = 0; i < 6 && showdown(game)?.isCombatShowdown !== true; i++) {
      await game.acting().pass();
    }
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(showdown(game)).toMatchObject({ active: true, isCombatShowdown: true });
    expect(game.state("yasuo")).toMatchObject({ might: 5, mightModifier: 1 });
    expect(game.state("kaisa").might).toBe(3);
  });

  test("end to end: Yasuo (5) defends against Kai'Sa (3) — Kai'Sa dies, Yasuo survives, bf1 stays P1's and P2 scores nothing", async () => {
    const game = await kaisaContests();
    await rideYasuoIn(game);
    for (let i = 0; i < 3; i++) {
      const r = await game.settle();
      if (r.reason !== "open" || !showdown(game)?.active) {
        break;
      }
    }
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.zoneOf("kaisa")).toBe("trash");
    expect(game.zoneOf("yasuo")).toBe("battlefield-bf1");
    expect(game.state("yasuo").mightModifier).toBe(1); // the bonus was applied this turn
    expect(bf(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: the ruling's nuance ("players still pass to end the non-combat showdown before the combat one
  // begins") contradicts CR 344.1 — "If a Showdown is already ongoing at that Battlefield, it will become a Combat
  // Showdown and a Combat will initiate there" — i.e. the SAME showdown upgrades the moment Yasuo arrives, with no
  // intervening pass-out. The engine follows CR (same stance as ride-the-wind-02c7fc7281f5b1b4,
  // vilemaw-10a5e8f8befd1db0 and flash-0763); asserted here as engine behaviour.
  test("RULING-CONFLICT: the ongoing showdown UPGRADES to a combat showdown as Yasuo arrives (CR 344.1) — no separate pass-out first", async () => {
    const game = await kaisaContests();
    await rideYasuoIn(game);
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mask", controller: P1, triggered: true })]);
    expect(game.state("yasuo").might).toBe(4); // the Mask trigger has not resolved yet
  });
});
