/**
 * Ruling 00b4af1757dba5c9 — Ride the Wind (OGN-173 → ogn-173-298) · Spell · Chaos · 2+[chaos] · Action
 *   "Move a friendly unit and ready it."
 *   × Vilemaw's Lair (OGN-295 → ogn-295-298) · Battlefield · "Units can't move from here to base."
 *   (unl-060-219 Vilemaw is only the namesake; it plays no part in the question.)
 *
 * Q: May I Ride the Wind a unit sitting at Vilemaw's Lair, naming base as the destination (a move the
 *    Lair forbids), just to ready it?
 * A: Yes. Base is still a legal destination to NAME — the Lair does not make destinations invalid, it
 *    prevents the movement. On resolution do as much as you can: the unit is readied but stays at the
 *    Lair; the spell resolves legally.
 * Rules: 055 / 055.1 (do as much as you can), 355.4 (move destination chosen as the spell is played),
 *        449 (moves caused by effects obey "can't move" restrictions), 415 (Ready).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const VILEMAWS_LAIR = "ogn-295-298";

/** P1's turn; P1 holds the (live) Lair with an EXHAUSTED 3-Might Camper; bf2 is a plain open battlefield. */
function board(inertLair = false) {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("lair", { controller: P1, def: VILEMAWS_LAIR, inert: inertLair })
    .battlefield("bf2", { controller: null })
    .unit(P1, "lair", { might: 3, name: "Camper" }, "camper", { exhausted: true })
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** Cast Ride the Wind on the Camper and answer the play-time destination prompt with `dest`. */
async function castNaming(game: Game, dest: "base" | "battlefield-bf2"): Promise<void> {
  expect(game.p1.can("cast", "rtw")).toBe(true);
  await game.p1.cast("rtw", { targets: "camper" });
  // rule 355.4 — the destination is named as the spell is played (before anyone gets priority).
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
  const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
  expect(keys).toContain("base"); // base is a legal destination to name even from the Lair
  expect(keys).toContain("battlefield-bf2");
  await game.p1.pick(dest);
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  expect(game.zoneOf("rtw")).toBe("chain");
}

describe("Ruling 00b4af1757dba5c9 — Ride the Wind naming base for a unit at Vilemaw's Lair: readied, not moved", () => {
  test("the Camper at the Lair is a legal target and base is offered (and accepted) as the destination", async () => {
    const game = await board().build();
    expect(game.state("camper").keywords).toContain("NoMoveToBase"); // the Lair's restriction is live
    const targets = game.p1.option("cast", "rtw")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual([["camper"]]);
    await castNaming(game, "base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rtw", controller: P1 })]);
  });

  test("on resolution the move is prevented (Camper stays at the Lair) but the ready still happens; the spell resolves to the trash", async () => {
    const game = await board().build();
    expect(game.state("camper").isExhausted).toBe(true);
    await castNaming(game, "base");
    await game.settle();
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.locationOf("camper")).toBe("lair"); // movement prevented by the Lair
    expect(game.p1.base()).not.toContain("camper");
    expect(game.state("camper").isExhausted).toBe(false); // "...and ready it" still applied (055)
    expect(game.state("camper").isReady).toBe(true);
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: with the Lair's text stripped the very same cast moves the Camper home AND readies it", async () => {
    const game = await board(true).build();
    expect(game.state("camper").keywords).not.toContain("NoMoveToBase");
    await castNaming(game, "base");
    await game.settle();
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.locationOf("camper")).toBe("base");
    expect(game.state("camper").isReady).toBe(true);
  });

  test("control: from the live Lair a battlefield destination is honoured — Camper moves to bf2 ready", async () => {
    const game = await board().build();
    await castNaming(game, "battlefield-bf2");
    await game.settle();
    await game.settle(); // arriving alone at open bf2 → showdown → both pass → P1 takes control
    expect(game.locationOf("camper")).toBe("bf2");
    expect(game.state("camper").isReady).toBe(true);
    expect(game.zoneOf("rtw")).toBe("trash");
  });
});
