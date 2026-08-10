/**
 * Ruling 6f3154309adcd625 — Ferrous Forerunner (SFD-021 → sfd-021-221) · Unit · Fury · [6][fury] · 6 Might
 *   "[Deathknell] — Play two 3 [Might] Mech unit tokens to your base."
 *   × Conscription (UNL-140 → unl-140-219) · spell · Chaos · [5][chaos][chaos] — "You may spend 5 XP as an additional
 *     cost… choose any enemy unit at a battlefield instead. Take control of it, exhaust it, and recall it."
 *   (Rumble, Hotheaded sfd-026-221 is only cited as another Mech source. Malzahar, Fanatic ogn-113-298 — "Kill a friendly
 *    unit or gear, [Exhaust]: [Add] [rainbow][rainbow]" — is used here merely as a way for the thief to have it die.)
 *
 * Q: I stole a Ferrous Forerunner with Conscription and it dies under my control — who makes the two Mech tokens?
 * A: You do. A Deathknell trigger is controlled by whoever controlled the unit when it died, so the thief gets the Mechs.
 * Rules: Deathknell (looks back at the unit as it died, incl. controller), 383 (triggered ability controller), control-changing effects.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FERROUS_FORERUNNER = "sfd-021-221";
const CONSCRIPTION = "unl-140-219";
const MALZAHAR = "ogn-113-298";

/** P1's turn with 5 XP. P2 holds bf1 with Ferrous Forerunner (6) + Guard (2). P1: Malzahar in base, Conscription + [5][chaos][chaos]. */
function board() {
  return scenario()
    .xp(P1, 5)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", FERROUS_FORERUNNER, "forerunner")
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P1, "base", MALZAHAR, "malz")
    .hand(P1, CONSCRIPTION, "cons")
    .resources(P1, { energy: 5, power: { chaos: 2 } });
}

function liveMechs(game: Game): string[] {
  return game.findAll({ name: "Mech" }).filter((id) => game.zoneOf(id) !== "gone");
}

/** Conscription with the 5-XP option on the (6-Might) Forerunner; resolves. */
async function stealForerunner(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("cons", { payOptional: true, targets: "forerunner" });
  expect(game.p1.xp()).toBe(0); // 5 XP spent as the additional cost
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  await game.settle();
  expect(game.zoneOf("cons")).toBe("trash");
  return game;
}

describe("Ruling 6f3154309adcd625 — a stolen Ferrous Forerunner dying under the thief's control gives the THIEF the Mech tokens", () => {
  test("Conscription (XP paid → any enemy unit at a battlefield): P1 takes control of the Forerunner, exhausted and recalled to P1's base; P2 still owns it", async () => {
    const game = await stealForerunner();
    expect(game.zoneOf("forerunner")).toBe("base");
    expect(game.p1.base()).toContain("forerunner");
    expect(game.state("forerunner")).toMatchObject({ controller: P1, isExhausted: true, owner: P2 });
    expect(liveMechs(game)).toEqual([]);
  });

  test("it then dies under P1's control (Malzahar's 'kill a friendly unit' cost): the Deathknell trigger is P1's, and the two 3-Might Mech tokens are played to P1's base — P2 gets none", async () => {
    const game = await stealForerunner();
    await game.p1.activate("malz", undefined, { sacrifice: "forerunner" });
    expect(game.zoneOf("forerunner")).toBe("trash");
    expect(game.p2.trash()).toContain("forerunner"); // goes to its OWNER's trash …
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "forerunner", controller: P1, triggered: true })]); // … but the Deathknell is controlled by P1
    await game.settle();
    expect(game.chain()).toEqual([]);
    const mechs = liveMechs(game);
    expect(mechs).toHaveLength(2);
    for (const m of mechs) {
      expect(game.state(m)).toMatchObject({ controller: P1, isToken: true, location: "base", might: 3, owner: P1 });
      expect(game.p1.base()).toContain(m);
    }
    expect(game.p2.base().filter((id) => game.state(id).name === "Mech")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — if it dies while still P2's (P2 sacrifices it to their own Malzahar), P2 gets the Mechs", async () => {
    const game = await scenario()
      .active(P2)
      .unit(P2, "base", FERROUS_FORERUNNER, "forerunner")
      .unit(P2, "base", MALZAHAR, "malz2")
      .build();
    await game.p2.activate("malz2", undefined, { sacrifice: "forerunner" });
    await game.settle();
    const mechs = liveMechs(game);
    expect(mechs).toHaveLength(2);
    for (const m of mechs) {
      expect(game.state(m)).toMatchObject({ controller: P2, location: "base" });
    }
    expect(game.p1.base()).toEqual([]);
  });
});
