/**
 * Ruling fdb0fceec74e6ef1 — Sunken Temple (SFD-218 → sfd-218-221), Battlefield
 *   "When you conquer here with one or more [Mighty] units, you may pay [1] to draw 1.
 *    (A unit is Mighty while it has 5+ [Might].)"
 *
 * Q: Does a 3-Might unit with [Assault 2] count as Mighty for Sunken Temple?
 * A: No. [Assault] only adds Might while the unit is an ATTACKER; the attacker/defender designation
 *    is removed before the battlefield is conquered, so when the conquer trigger checks for [Mighty]
 *    the unit is back to its 3 printed Might and does not qualify.
 * A (engine, CR): Yes it does. 466.5/466.5.d Establish Control + Conquer run first and 466.7.a removes the
 *    designations only when the combat ENDS afterwards, so 807.1.d.1 keeps [Assault] live at the conquer.
 *    SETTLED — see DESIGN.md § "Combat Resolution Step (466) — two settled adjudications" and the sibling
 *    tests 7412ece9e8248139 / 42b466db3f308240, which assert the same CR reading.
 * Rules: 719 / 807.1.d.1 ([Assault] applies while the unit is an attacker), 466.5.d (Conquer), 466.7.a
 *        (designations removed when combat ends), 140 ([Mighty] = 5+ Might).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SUNKEN_TEMPLE = "sfd-218-221";
const FILLER = "ogn-175-298";

/** A 3-Might raider whose only route to 5 is [Assault 2]. */
const ASSAULT_RAIDER = {
  abilities: [{ keyword: "Assault", type: "keyword", value: 2 }],
  cardType: "unit",
  might: 3,
  name: "Assault Raider",
} as const;

/** P2 holds the Sunken Temple with a 1-Might Watcher; P1 attacks from base. */
function board(attacker: unknown) {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("temple", { controller: P2, def: SUNKEN_TEMPLE, inert: false })
    .unit(P2, "temple", { might: 1, name: "Watcher" }, "watcher")
    .unit(P1, "base", attacker as never, "raider")
    .deck(P1, [FILLER, FILLER], ["d1", "d2"]);
}

async function conquer(game: Game): Promise<void> {
  await game.p1.move("raider", "temple");
  await game.p1.passFocus();
  await game.p2.passFocus();
  await game.settle();
}

describe("Ruling fdb0fceec74e6ef1 — [Assault] does not make a unit Mighty for Sunken Temple's conquer trigger", () => {
  test("setup: the raider is a 3-Might unit outside combat, and [Assault 2] is what lets it kill the Watcher and conquer", async () => {
    const game = await board(ASSAULT_RAIDER).build();
    expect(game.state("raider").might).toBe(3);
    expect(game.state("raider").keywords).toContain("Assault");
    await conquer(game);
    expect(game.zoneOf("watcher")).toBe("trash");
    expect(game.gameState.battlefields.temple).toMatchObject({ controller: P1 });
    expect(game.p1.points()).toBe(1);
  });

  // RULING-CONFLICT: riftjudge fdb0fceec74e6ef1 says the designation (and with it [Assault]) is gone
  // before the conquer is checked; rule 466.5/466.5.d run Establish Control + Conquer FIRST and 466.7.a
  // removes the designations only when the combat ends afterwards, so 807.1.d.1 still has [Assault] live
  // at the conquer — engine follows the CR. SETTLED, do not re-litigate: DESIGN.md § "Combat Resolution
  // Step (466) — two settled adjudications"; siblings 7412ece9e8248139 / 42b466db3f308240 assert the same.
  test("ruling fdb0fceec74e6ef1 (CR reading) — the attacker designation survives to the conquer, so an [Assault 2] 3-Might raider IS [Mighty] and Sunken Temple offers the draw", async () => {
    const game = await board(ASSAULT_RAIDER).build();
    await conquer(game);
    expect(game.state("raider").might).toBe(5); // 3 printed + [Assault 2], still an attacker
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("control: a genuinely 5-Might raider IS Mighty — the 'you may pay [1] to draw 1' is offered and pays off", async () => {
    const game = await board({ might: 5, name: "Colossal Raider" }).build();
    await conquer(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("control: declining the optional payment draws nothing and keeps the Energy", async () => {
    const game = await board({ might: 5, name: "Colossal Raider" }).build();
    await conquer(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.energy()).toBe(1);
  });

  test("control: a 4-Might raider that wins without [Assault] is not Mighty either — Sunken Temple stays silent", async () => {
    const game = await board({ might: 4, name: "Plain Raider" }).build();
    await conquer(game);
    expect(game.zoneOf("watcher")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.hand()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
