/**
 * Ruling 22044dbf21e978e2 — Vilemaw's Lair (OGN-295 → ogn-295-298, battlefield) "Units can't move from here to base."
 *   × Vilemaw (UNL-060 → unl-060-219) 8 Might "Enemy units here with less Might than me don't deal combat damage. …"
 *   × Charm (OGN-043 → ogn-043-298) "Move an enemy unit."  × Ride the Wind (OGN-173 → ogn-173-298) "Move a friendly
 *     unit and ready it."  × Tideturner (OGN-199 → ogn-199-298) "When you play me, you may choose a unit you control at
 *     another location. Move me to its location and it to my original location."
 *
 * Q: A unit fails to conquer Vilemaw's Lair and is recalled to base — does the Lair's restriction stop the recall?
 * A: No — a recall is not a move. Nuances: move effects (Charm, Ride the Wind, Tideturner) cannot take a unit from
 *    the Lair to base; they CAN take it to another battlefield (as can Ganking). Tideturner says "move", so it can't
 *    pull a Lair unit to base.
 * Rules: 446/447 (moves, invalid destinations) vs 453/454 (recalls are not moves), 105 ("can't" wins), 467 (failed
 *        attackers are recalled).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VILEMAWS_LAIR = "ogn-295-298";
const VILEMAW = "unl-060-219";
const CHARM = "ogn-043-298";
const RIDE_THE_WIND = "ogn-173-298";
const TIDETURNER = "ogn-199-298";
const GANKER = { abilities: [{ keyword: "Ganking", type: "keyword" }], keywords: ["Ganking"], might: 3, name: "Ganker" };

type PickD = Extract<Decision, { kind: "pick" }>;

/** Settle to the destination prompt of a move spell and return it. */
async function destinationPrompt(game: Game): Promise<PickD> {
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  const d = game.decision();
  expect(d?.kind).toBe("pick");
  expect((d as PickD).prompt).toMatch(/destination/i);
  return d as PickD;
}

describe("Ruling 22044dbf21e978e2 — recalls leave Vilemaw's Lair; move effects to base don't; moves to another battlefield do", () => {
  test("the ruling: P1's 3-Might Poker attacks P2's (stunned) Vilemaw at the Lair, deals no combat damage (less Might than Vilemaw), fails to conquer and is RECALLED to base — the Lair does not stop it", async () => {
    const game = await scenario()
      .battlefield("lair", { controller: P2, def: VILEMAWS_LAIR, inert: false })
      .battlefield("bf2", { controller: null })
      .unit(P2, "lair", VILEMAW, "vilemaw", { stunned: true }) // stunned: Vilemaw deals no damage back, so Poker survives
      .unit(P1, "base", { might: 3, name: "Poker" }, "poker")
      .build();
    await game.p1.move("poker", "lair");
    expect(game.state("poker").keywords).toContain("NoMoveToBase"); // the Lair's text applies to it while there
    await game.settle();
    await game.settle();
    expect(game.state("vilemaw").damage).toBe(0); // "less Might than me don't deal combat damage"
    expect(game.zoneOf("vilemaw")).toBe("battlefield-lair");
    expect(game.gameState.battlefields.lair?.controller).toBe(P2); // not conquered
    expect(game.zoneOf("poker")).toBe("base"); // recalled ≠ moved
    expect(game.state("poker").damage).toBe(0);
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(1); // only the attack counted as a move
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("Charm cannot move a unit from the Lair to base: choosing base leaves the Spider at the Lair; choosing another battlefield moves it", async () => {
    const mk = () =>
      scenario()
        .active(P2)
        .resources(P2, { energy: 1, power: { calm: 1 } })
        .battlefield("lair", { controller: P1, def: VILEMAWS_LAIR, inert: false })
        .battlefield("bf2", { controller: null })
        .unit(P1, "lair", { might: 3, name: "Spider" }, "spider")
        .hand(P2, CHARM, "charm")
        .build();
    // → base: no movement happens.
    const toBase = await mk();
    await toBase.p2.cast("charm", { targets: "spider" });
    const d = await destinationPrompt(toBase);
    expect(d.seat).toBe(P2);
    if (d.options.some((o) => o.key === "base")) {
      await toBase.p2.pick("base");
    } else {
      await toBase.p2.pick(d.options.find((o) => o.key !== "battlefield-bf2")?.key ?? "battlefield-bf2");
    }
    await toBase.settle();
    expect(toBase.zoneOf("charm")).toBe("trash");
    expect(toBase.zoneOf("spider")).toBe("battlefield-lair");
    expect(toBase.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(0);
    // → bf2: legal and successful.
    const toBf = await mk();
    await toBf.p2.cast("charm", { targets: "spider" });
    const d2 = await destinationPrompt(toBf);
    expect(d2.options.map((o) => o.key)).toContain("battlefield-bf2");
    await toBf.p2.pick("battlefield-bf2");
    await toBf.settle();
    expect(toBf.zoneOf("spider")).toBe("battlefield-bf2");
  });

  test("Ride the Wind on a Lair unit: to base → stays (but is still readied); to bf2 → moves", async () => {
    const mk = () =>
      scenario()
        .resources(P1, { energy: 2, power: { chaos: 1 } })
        .battlefield("lair", { controller: P1, def: VILEMAWS_LAIR, inert: false })
        .battlefield("bf2", { controller: P2 })
        .unit(P1, "lair", { might: 3, name: "Spider" }, "spider", { exhausted: true })
        .hand(P1, RIDE_THE_WIND, "ride")
        .build();
    const toBase = await mk();
    await toBase.p1.cast("ride", { answers: ["base"], targets: "spider" });
    await toBase.settle();
    expect(toBase.zoneOf("ride")).toBe("trash");
    expect(toBase.zoneOf("spider")).toBe("battlefield-lair");
    expect(toBase.state("spider").isReady).toBe(true);
    const toBf = await mk();
    await toBf.p1.cast("ride", { answers: ["bf2"], targets: "spider" });
    await toBf.settle();
    await toBf.settle();
    expect(toBf.locationOf("spider")).toBe("bf2");
  });

  test("Tideturner uses the word 'move': played to base choosing the Lair Spider, Tideturner goes to the Lair but the Spider does NOT come to base", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .battlefield("lair", { controller: P1, def: VILEMAWS_LAIR, inert: false })
      .battlefield("bf2", { controller: null })
      .unit(P1, "lair", { might: 3, name: "Spider" }, "spider")
      .hand(P1, TIDETURNER, "tide")
      .build();
    await game.p1.play("tide", { to: "base" });
    for (let i = 0; i < 6; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || !d) {
        break;
      }
      if (d.kind === "yes-no") {
        await game.p1.yes();
      } else if (d.kind === "pick") {
        await game.p1.pick("spider");
      } else {
        break;
      }
    }
    expect(game.zoneOf("spider")).toBe("battlefield-lair"); // can't be moved from the Lair to base
    expect(game.zoneOf("tide")).toBe("battlefield-lair"); // Tideturner's own half of the swap still happens
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("Ganking from the Lair to another battlefield is a legal move", async () => {
    const game = await scenario()
      .battlefield("lair", { controller: P1, def: VILEMAWS_LAIR, inert: false })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "lair", GANKER, "ganker")
      .build();
    expect(game.p1.can("gank", "ganker")).toBe(true);
    expect((await game.p1.try((p) => p.move("ganker", "base"))).ok).toBe(false);
    await game.p1.gank("ganker", "bf2");
    expect(game.locationOf("ganker")).toBe("bf2");
  });
});
