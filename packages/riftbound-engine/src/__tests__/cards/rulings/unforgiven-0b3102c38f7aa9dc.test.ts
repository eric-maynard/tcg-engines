/**
 * Ruling 0b3102c38f7aa9dc — Unforgiven (OGN-259 → ogn-259-298) · Legend (Yasuo) · Calm/Chaos
 *   "[2], [Exhaust]: Move a friendly unit to or from its base."
 *
 * Q: Does moving a READY unit with Yasuo's legend ability exhaust that unit?
 * A: No. Moves performed by spells/abilities don't change a unit's ready/exhausted state unless they say so (only
 *    the Standard Move exhausts as its cost). A ready unit moved to a battlefield this way can still use e.g.
 *    [Ganking] to Standard-Move again the same turn.
 * Rules: 141.2 / 618 (Standard Move: exhaust as the cost), 421 (Move as an effect — no exhaustion), 726 (Ganking).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UNFORGIVEN = "ogn-259-298";

/** P1's turn with [2]. Yasuo legend (ready). P1 holds bf1 (Holder); bf2 is open. A ready [Ganking] Nomad waits in base. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 2 })
    .legend(P1, UNFORGIVEN, "yasuo")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", { keywords: ["Ganking"], might: 3, name: "Nomad" }, "nomad")
    .unit(P2, "base", { might: 2, name: "Theirs" }, "theirs");
}

/** Activate Yasuo on the Nomad and send it to bf1 (answering the destination prompt if one is asked). */
async function yasuoMovesNomadToBf1(): Promise<Game> {
  const game = await board().build();
  expect(game.state("nomad")).toMatchObject({ isReady: true, zone: "base" });
  game.script(P1, [(d) => (d.kind === "pick" && d.semantics === "destination" ? "battlefield-bf1" : undefined)]);
  await game.p1.activate("yasuo", 0, { targets: "nomad" });
  expect(game.p1.energy()).toBe(0);
  expect(game.state("yasuo").isExhausted).toBe(true); // the LEGEND exhausts — that is the ability's cost
  await game.settle();
  expect(game.chain()).toEqual([]);
  expect(game.locationOf("nomad")).toBe("bf1");
  return game;
}

describe("Ruling 0b3102c38f7aa9dc — Yasuo's legend move leaves a ready unit ready", () => {
  test("the ready Nomad moved base → bf1 by the ability is STILL READY afterwards (only Yasuo himself exhausted, as his cost)", async () => {
    const game = await yasuoMovesNomadToBf1();
    expect(game.state("nomad")).toMatchObject({ isExhausted: false, isReady: true, zone: "battlefield-bf1" });
    expect(game.violations()).toEqual([]);
  });

  test("so it can still take a Standard Move this turn: with [Ganking] it moves on from bf1 to the open bf2 — THAT move exhausts it (its cost) — and conquers", async () => {
    const game = await yasuoMovesNomadToBf1();
    expect(game.p1.can("gank", "nomad")).toBe(true);
    await game.p1.gank("nomad", "bf2");
    expect(game.state("nomad").isExhausted).toBe(true);
    await game.settle();
    expect(game.locationOf("nomad")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: an already-EXHAUSTED unit moved by the ability stays exhausted — the ability neither readies nor exhausts", async () => {
    const game = await board().unit(P1, "base", { might: 2, name: "Tired" }, "tired", { exhausted: true }).build();
    game.script(P1, [(d) => (d.kind === "pick" && d.semantics === "destination" ? "battlefield-bf1" : undefined)]);
    await game.p1.activate("yasuo", 0, { targets: "tired" });
    await game.settle();
    expect(game.state("tired")).toMatchObject({ isExhausted: true, zone: "battlefield-bf1" });
  });
});
