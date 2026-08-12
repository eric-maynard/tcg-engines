/**
 * Ruling 8a0334bba3687e70 — Angle Shot (SFD-011 → sfd-011-221) · Spell · Fury · [2] · [Reaction]
 *     "Choose a unit and an Equipment with the same controller. Attach that Equipment to that unit or detach that
 *      Equipment from that unit. Draw 1."
 *   × B.F. Sword (SFD-161 → sfd-161-221) · Equipment · +3 Might.
 *
 * Q: If I use Angle Shot on an Equipment that is already attached, do I have to detach it?
 * A: You must choose one of the two options the card gives — attach that Equipment to that unit, or detach it
 *    from that unit. Both are on the menu, and if you choose detach the Equipment comes off.
 * Rules: 355.3 (a mode is chosen as the spell is played), 355.10.d.2 (a choice is asked, never assumed),
 *        434/435 (attachment), 718 (the wearer's Might includes the Equipment bonus).
 */
import { describe, expect, test } from "bun:test";
import type { ActionField, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ANGLE_SHOT = "sfd-011-221";
const BF_SWORD = "sfd-161-221";
const SKULKER = "ogn-175-298";

const ATTACH = 0;
const DETACH = 1;

/** P1's turn. P1's Knight (3) wears the Sword, or the Sword lies loose in base. */
function board(attached: boolean) {
  const s = scenario()
    .resources(P1, { energy: 2 })
    .unit(P1, "base", { might: 3, name: "Knight" }, "knight", (attached ? { equippedWith: ["sword"] } : {}) as Record<string, unknown>)
    .unit(P2, "base", { might: 2, name: "Their Body" }, "theirs")
    .hand(P1, ANGLE_SHOT, "shot")
    .deck(P1, [SKULKER, SKULKER], ["d1", "d2"]);
  s.card("sword", {
    def: BF_SWORD,
    meta: (attached ? { attachedTo: "knight" } : {}) as Record<string, unknown>,
    owner: P1,
    zone: "base",
  });
  return s;
}

const modeField = (game: Game): ActionField | undefined => game.p1.option("cast", "shot")?.fields.find((f) => f.arg === "mode");

/** Cast Angle Shot naming [Knight, Sword] in the given mode and resolve it. */
async function shoot(attached: boolean, mode: number): Promise<Game> {
  const game = await board(attached).build();
  await game.p1.cast("shot", { mode, targets: ["knight", "sword"] });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("shot")).toBe("trash");
  return game;
}

describe("Ruling 8a0334bba3687e70 — Angle Shot makes you pick attach or detach; detach really detaches", () => {
  test("setup: the Sword is on the Knight, who reads 3 + 3 = 6 Might", async () => {
    const game = await board(true).build();
    expect(game.state("sword").attachedTo).toBe("knight");
    expect(game.state("knight")).toMatchObject({ attachments: ["sword"], might: 6 });
  });

  test("even with the Sword already attached BOTH branches are on offer — the play exposes the two options as modes", async () => {
    const game = await board(true).build();
    expect(game.p1.can("cast", "shot")).toBe(true);
    expect(modeField(game)?.options).toEqual([ATTACH, DETACH]);
    const targets = game.p1.option("cast", "shot")?.fields.find((f) => f.arg === "targets");
    expect(targets).toMatchObject({ options: [["knight", "sword"]] }); // unit + Equipment, same controller
  });

  test("choosing DETACH on the already-worn Sword takes it off: the Knight is back to 3, the Sword is loose in P1's base, and the spell still draws 1", async () => {
    const game = await shoot(true, DETACH);
    expect(game.state("sword").attachedTo).toBeUndefined();
    expect(game.state("knight")).toMatchObject({ attachments: [], might: 3 });
    expect(game.zoneOf("sword")).toBe("base");
    expect(game.p1.hand()).toContain("d1");
    expect(game.violations()).toEqual([]);
  });

  test("choosing ATTACH on the already-worn Sword leaves it worn — nothing is forced off", async () => {
    const game = await shoot(true, ATTACH);
    expect(game.state("sword").attachedTo).toBe("knight");
    expect(game.state("knight").might).toBe(6);
    expect(game.p1.hand()).toContain("d1");
  });

  test("the other direction — a loose Sword: ATTACH puts it on the Knight (3 → 6), DETACH leaves it lying there", async () => {
    const attachedGame = await shoot(false, ATTACH);
    expect(attachedGame.state("sword").attachedTo).toBe("knight");
    expect(attachedGame.state("knight").might).toBe(6);
    const looseGame = await shoot(false, DETACH);
    expect(looseGame.state("sword").attachedTo).toBeUndefined();
    expect(looseGame.state("knight").might).toBe(3);
  });

  test.failing("BUG: ruling 8a0334bba3687e70 — the choice must be MADE: a cast that names no mode should surface the attach/detach decision, but the engine silently resolves it as a detach", async () => {
    const game = await board(true).build();
    expect(modeField(game)).toMatchObject({ required: true }); // 355.3 — not an optional field
    await game.p1.cast("shot", { targets: ["knight", "sword"] });
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "mode" });
  });
});
