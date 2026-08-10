/**
 * Ruling aa622a0d2ad5751b — Ride the Wind (OGN-173 → ogn-173-298) · [2][chaos] Action "Move a friendly unit and ready it."
 *   × Abandoned Hall (UNL-205 → unl-205-219, battlefield) "When a player plays a spell, they may give a unit they control here
 *     +1 Might this turn."
 *
 * Q: If I Ride the Wind a unit INTO Abandoned Hall, do I get the +1 from the Hall?
 * A: Yes. Ride the Wind resolves first (the unit moves there and readies); only after the spell has fully resolved does the Hall's
 *    "plays a spell" trigger go on the chain — the unit is already there and is a valid recipient of the +1.
 * Rules: 419.4.a (play-a-spell triggers fire after resolution), 383, 340.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const ABANDONED_HALL = "unl-205-219";

/** P1's turn. Abandoned Hall (live text) is empty and uncontrolled. P1: exhausted Rider (3) in base, Ride the Wind + [2][chaos]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("hall", { controller: null, def: ABANDONED_HALL, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 4, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 3, name: "Rider" }, "rider", { exhausted: true })
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** Cast Ride the Wind on the Rider → the Hall; answer the destination whenever asked; stop once the spell is in the trash. */
async function rideIntoHall(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("rtw", { targets: "rider" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  for (let i = 0; i < 8 && game.zoneOf("rtw") !== "trash"; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.key)).toContain("battlefield-hall");
      await game.p1.pick("battlefield-hall");
    } else if (d?.kind === "action" && d.context === "chain") {
      // While the spell is on the chain the Hall has NOT triggered.
      expect(game.chain().some((c) => c.cardId === "hall")).toBe(false);
      await game.acting().passPriority();
    } else {
      break;
    }
  }
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => o.key === "battlefield-hall")) {
    await game.p1.pick("battlefield-hall");
  }
  expect(game.zoneOf("rtw")).toBe("trash");
  return game;
}

describe("Ruling aa622a0d2ad5751b — Riding the Wind into Abandoned Hall still earns the Hall's +1", () => {
  test("1. Ride the Wind resolves: the Rider is at the Hall and READY — and only now is the Hall's trigger (P1's, 'they may') on the chain", async () => {
    const game = await rideIntoHall();
    expect(game.locationOf("rider")).toBe("hall");
    expect(game.state("rider")).toMatchObject({ isReady: true, might: 3 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hall", controller: P1, triggered: true })]);
  });

  test("2–3. P1 accepts the Hall's 'may' and the freshly-arrived Rider is offered as 'a unit they control here' → +1 Might this turn (3 → 4)", async () => {
    const game = await rideIntoHall();
    // The optional trigger: P1 decides (asked either as it is put on the chain or as it resolves).
    let accepted = false;
    let picked = false;
    for (let i = 0; i < 10 && game.state("rider").mightModifier === 0; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        expect(d.source?.cardId).toBe("hall");
        accepted = true;
        await game.p1.yes();
      } else if (d?.kind === "pick" && d.seat === P1) {
        expect(d.options.map((o) => o.card ?? o.key)).toEqual(["rider"]); // the unit that arrived in step 1
        picked = true;
        await game.p1.pick("rider");
      } else if (d?.kind === "action" && d.context !== "main") {
        await game.acting().pass();
      } else {
        break;
      }
    }
    expect(accepted || picked).toBe(true);
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("rider")).toMatchObject({ location: "hall", might: 4, mightModifier: 1 });
    expect(game.violations()).toEqual([]);
  });
});
