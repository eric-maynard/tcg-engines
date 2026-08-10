/**
 * Ruling d885c93c797f7f13 — Void Gate (OGN-296 → ogn-296-298) · Battlefield
 *   "Spells and abilities deal 1 Bonus Damage to units here."
 *   × Challenge (OGN-128 → ogn-128-298) · Action · [2][body]
 *   "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *
 * Q: Does Void Gate amplify the damage Challenge causes to a unit there?
 * A: No. With Challenge the UNITS deal the damage to each other; Void Gate only adds to damage dealt by spells/abilities
 *    themselves.
 * Rules: damage source attribution (the spell instructs units to deal damage), Void Gate's bonus-damage static.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VOID_GATE = "ogn-296-298";
const CHALLENGE = "ogn-128-298";
const HEXTECH_RAY = "ogn-009-298"; // a spell that deals damage ITSELF, for the contrast

/** P1's turn. bf1 IS Void Gate (live), held by P2 with a Colossus (9). P1: Brawler (4) in base; Challenge + Ray; [3][body][fury]. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { body: 1, fury: 1 } })
    .battlefield("bf1", { controller: P2, def: VOID_GATE, inert: false })
    .unit(P2, "bf1", { might: 9, name: "Colossus" }, "colossus")
    .unit(P1, "base", { might: 4, name: "Brawler" }, "brawler")
    .hand(P1, CHALLENGE, "challenge")
    .hand(P1, HEXTECH_RAY, "ray");
}

describe("Ruling d885c93c797f7f13 — Void Gate does not boost Challenge damage (units deal it, not the spell)", () => {
  test("Challenge [Brawler 4 ↔ Colossus 9 at Void Gate]: the Colossus takes exactly 4 — no +1 — and the Brawler takes 9 and dies", async () => {
    const game = await board().build();
    await game.p1.cast("challenge", { targets: ["brawler", "colossus"] });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 0, fury: 1 } });
    await game.settle();
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.state("colossus")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
    expect(game.state("colossus").damage).not.toBe(5);
    expect(game.zoneOf("brawler")).toBe("trash");
  });

  test("contrast: a spell that deals the damage itself IS amplified there — Hextech Ray's 3 becomes 4 on the Colossus at Void Gate", async () => {
    const game = await board().build();
    await game.p1.cast("ray", { targets: "colossus" });
    await game.settle();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.state("colossus")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
  });
});
