/**
 * Ruling 890fe2ff73533ea4 — Rogue Assassin (VEN-139 → ven-139-166) · Legend · Akali
 *     "[Empower] [3][rainbow]. [Action][>] [Exhaust]: If it's your turn, move a friendly unit in a showdown to base and
 *     if I'm [Empowered], ready it."
 *   × Mournful Witness (VEN-028 → ven-028-166) · 2 Might · "When a combat that I was in ends, empower me.
 *     [Empowered][>] I have +2 [Might]."
 *
 * Q: Can I use the Akali legend to trigger Mournful Witness?
 * A: Yes. On your turn, pull the Witness out of an ongoing COMBAT to base; when that combat ends its "combat that I was
 *    in ends" trigger fires (historical check — it had an attacker/defender designation) and it becomes Empowered.
 *    Not in a NON-combat showdown over an empty battlefield (no combat to end). If other friendly units remain, the
 *    combat doesn't end yet — the trigger fires when it finally does.
 * Rules: 466.7 (combat ends), 441 (Empower), 383.2 (trigger evaluation), 341/316.8 (in a showdown), 454 (non-combat showdown).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ROGUE_ASSASSIN = "ven-139-166";
const MOURNFUL_WITNESS = "ven-028-166";

function base() {
  return scenario().legend(P1, ROGUE_ASSASSIN, "ra").battlefield("bf1", { controller: P2 }).unit(P1, "base", MOURNFUL_WITNESS, "mw");
}

/** P1 activates the legend's [Action] line naming `unit`, both pass on the chain item, answers the target pick; stops at Focus/main. */
async function rescue(game: Game, unit: string): Promise<void> {
  await game.p1.activate("ra", 1, { answers: [unit] });
  expect(game.state("ra").isExhausted).toBe(true);
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d) {
      return;
    }
    if (d.kind === "pick" && d.seat === P1) {
      await game.p1.pick(unit);
    } else if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      return;
    }
  }
}

describe("Ruling 890fe2ff73533ea4 — Rogue Assassin pulling Mournful Witness out of a combat empowers it when that combat ends", () => {
  test("Witness attacks alone into a Wall; on P1's turn the legend moves it (an attacker) to base; once both pass and the combat ends, its trigger fires → Empowered, 4 Might, safe in base; the Wall is untouched", async () => {
    const game = await base().unit(P2, "bf1", { might: 6, name: "Wall" }, "wall").build();
    await game.p1.move("mw", "bf1");
    expect(game.state("mw").combatRole).toBe("attacker"); // it IS in this combat
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activateAbility:ra#1")).toBe(true);
    await rescue(game, "mw");
    expect(game.zoneOf("mw")).toBe("base");
    expect(game.state("mw")).toMatchObject({ damage: 0, isEmpowered: false, might: 2 }); // combat not over yet
    await game.settle(); // remaining focus passes → combat ends with no attacker
    expect(game.state("wall")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.zoneOf("mw")).toBe("base");
    expect(game.state("mw")).toMatchObject({ isEmpowered: true, might: 4 });
    expect(game.violations()).toEqual([]);
  });

  test("other friendly units remain: pulling the Witness does not end the combat; Pal (7) finishes the Wall (6) and conquers — and THEN the Witness (in base) is empowered, because it was in that combat", async () => {
    const game = await base().unit(P1, "base", { might: 7, name: "Pal" }, "pal").unit(P2, "bf1", { might: 6, name: "Wall" }, "wall").build();
    await game.p1.move(["mw", "pal"], "bf1");
    await rescue(game, "mw");
    expect(game.zoneOf("mw")).toBe("base");
    expect(game.state("mw").isEmpowered).toBe(false); // Pal is still fighting — combat has not ended
    expect(game.locationOf("pal")).toBe("bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("mw")).toMatchObject({ isEmpowered: true, might: 4, zone: "base" });
  });

  test("contrast — a NON-combat showdown over an empty enemy battlefield: the legend can still pull the Witness home, but no combat ended, so it is NOT empowered", async () => {
    const game = await base().build();
    await game.p1.move("mw", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("mw").combatRole).toBeFalsy(); // no opposing units → not a combat
    expect(game.p1.can("activateAbility:ra#1")).toBe(true);
    await rescue(game, "mw");
    await game.settle();
    expect(game.zoneOf("mw")).toBe("base");
    expect(game.state("mw")).toMatchObject({ isEmpowered: false, might: 2 });
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1); // nobody left to take it
  });
});
