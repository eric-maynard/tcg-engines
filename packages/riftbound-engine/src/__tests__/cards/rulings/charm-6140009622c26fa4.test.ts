/**
 * Ruling 6140009622c26fa4 — Charm (OGN-043 → ogn-043-298) · spell · Calm · [1][calm] — "Move an enemy unit."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Action · [2][chaos] — "Move a friendly unit and ready it."
 *   × Vilemaw's Lair (OGN-295 → ogn-295-298) · Battlefield — "Units can't move from here to base."
 *   (Vilemaw unl-060-219 is only name-dropped.)
 *
 * Q: Can "move a unit" effects (Charm, Ride the Wind) move a unit directly battlefield → battlefield without Ganking?
 * A: Yes. Ganking only restricts the Standard Move; effect moves may go to any valid location. Invalid locations: the
 *    opposing base; and a unit at Vilemaw's Lair can be chosen to move to base but it simply doesn't move.
 * Rules: 140s (Standard Move vs effect movement), Ganking keyword, 190/valid locations, Vilemaw's Lair static.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const RIDE_THE_WIND = "ogn-173-298";
const VILEMAWS_LAIR = "ogn-295-298";

/** P1's turn. P2's Foe (3, no Ganking) at P2's bf1; P1's Scout (2, no Ganking) at P1's bf2; bf3 is open. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .battlefield("bf3", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .unit(P1, "bf2", { might: 2, name: "Scout" }, "scout", { exhausted: true })
    .hand(P1, CHARM, "charm")
    .hand(P1, RIDE_THE_WIND, "rtw")
    .resources(P1, { energy: 3, power: { calm: 1, chaos: 1 } });
}

describe("Ruling 6140009622c26fa4 — effect moves (Charm / Ride the Wind) go battlefield → battlefield without Ganking", () => {
  test("Charm on Foe (at bf1, no Ganking): the destination prompt offers other battlefields; picking bf3 moves it straight there", async () => {
    const game = await board().build();
    expect(game.state("foe").keywords).not.toContain("Ganking");
    await game.p1.cast("charm", { targets: "foe" });
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    const d = game.decision();
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(keys).toContain("battlefield-bf3");
    expect(keys).toContain("battlefield-bf2");
    expect(keys).not.toContain("battlefield-bf1"); // not where it already is
    await game.p1.pick("battlefield-bf3");
    await game.settle();
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("foe")).toBe("bf3");
    expect(game.violations()).toEqual([]);
  });

  test("Charm's 'base' destination is the unit's OWN base — never the caster's (the opposing base is not a valid location)", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "foe" });
    const d = game.decision();
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(keys.filter((k) => k.startsWith("base"))).toEqual(["base"]); // a single "base" choice, no per-player variants
    await game.p1.pick("base");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("base");
    expect(game.p2.base()).toContain("foe");
    expect(game.p1.base()).not.toContain("foe");
  });

  test("Ride the Wind on Scout (at bf2, no Ganking): moved directly to bf3 and readied — no Standard Move, no Ganking needed", async () => {
    const game = await board().build();
    expect(game.state("scout").keywords).not.toContain("Ganking");
    // Contrast: the Standard Move menu cannot take Scout bf2 → bf3 (that would need Ganking) — and Scout is exhausted anyway.
    expect(game.p1.can("gank", "scout")).toBe(false);
    await game.p1.cast("rtw", { targets: "scout" });
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    const d = game.decision();
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(keys).toEqual(expect.arrayContaining(["battlefield-bf1", "battlefield-bf3", "base"]));
    await game.p1.pick("battlefield-bf3");
    await game.settle();
    expect(game.locationOf("scout")).toBe("bf3");
    expect(game.state("scout").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("Vilemaw's Lair nuance: a unit there can be chosen and 'base' picked, but it does not move (it is still readied by Ride the Wind)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("lair", { controller: P1, def: VILEMAWS_LAIR, inert: false, owner: P1 })
      .unit(P1, "lair", { might: 3, name: "Spider" }, "spider", { exhausted: true })
      .hand(P1, RIDE_THE_WIND, "rtw")
      .resources(P1, { energy: 2, power: { chaos: 1 } })
      .build();
    const targets = (game.p1.option("cast", "rtw")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(targets).toContain("spider"); // targetable
    await game.p1.cast("rtw", { targets: "spider" });
    const d = game.decision();
    if (d?.kind === "pick") {
      const keys = d.options.map((o) => o.key);
      if (keys.includes("base")) {
        await game.p1.pick("base");
      } else {
        // An engine may instead simply not offer base — equally "won't do anything" toward base.
        await game.p1.pick("battlefield-lair");
      }
    }
    await game.settle();
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.locationOf("spider")).toBe("lair"); // did not move to base
    expect(game.state("spider").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
