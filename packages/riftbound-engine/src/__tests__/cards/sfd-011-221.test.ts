/**
 * Angle Shot — sfd-011-221 · Spell · Fury · 2 energy · Reaction
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Choose a unit and an Equipment with the same controller. Attach that Equipment to that
 *   unit or detach that Equipment from that unit. Draw 1.
 *
 * Rules: 813 (Reaction timing), 434 (Attach), 435 (Detach — the detached Equipment stays at the
 * unit's location, 435.4). The parser only produced the "Draw 1" clause today.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-011-221";
const DIRK = "sfd-009-221"; // Serrated Dirk — Equipment, +0
const SKYFALL = "sfd-030-221"; // Skyfall of Areion — Equipment, +2 might

function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .gear(P1, SKYFALL, "sky")
    .hand(P1, CARD, "shot");
}

describe("Angle Shot (sfd-011-221)", () => {
  test("costs 2 energy, draws 1 and goes to trash; unaffordable with 1 energy", async () => {
    const game = await board().build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("shot");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("shot")).toBe("trash");
    expect(game.p1.hand().length).toBe(handBefore - 1 + 1);
    const poor = await board().resources(P1, { energy: 1 }).build();
    expect(poor.p1.can("cast", "shot")).toBe(false);
  });

  test("[Reaction]: playable on the opponent's turn while a spell is on the chain", async () => {
    const bolt = { cardType: "spell", energyCost: 0, name: "Bolt", timing: "action", abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }] };
    const game = await board().active(P2).hand(P2, bolt, "bolt").build();
    await game.p2.cast("bolt", { targets: "squire" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "shot")).toBe(true);
    await game.p1.cast("shot");
    expect(game.chain().map((c) => c.cardId)).toEqual(["bolt", "shot"]);
  });

  test("attach mode — choosing a unit and an unattached Equipment you control attaches it (+2 might from Skyfall)", async () => {
    // Expected: the spell asks for a unit + an Equipment with the same controller and attaches
    // Skyfall to Squire (might 2 → 4). Actual: the parsed ability is only "draw 1"; no targets exist.
    const game = await board().build();
    await game.p1.cast("shot", { targets: ["squire", "sky"] });
    await game.settle({ policy: "first" });
    expect(game.state("sky").attachedTo).toBe("squire");
    expect(game.state("squire").might).toBe(4);
    expect(game.zoneOf("shot")).toBe("trash");
  });

  test("detach mode — choosing a unit and the Equipment attached to it detaches it (rule 435)", async () => {
    // Expected: Dirk detaches from Squire and stays on the board in base. Actual: no attach/detach
    // clause is implemented, the Dirk stays attached.
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire", { equippedWith: ["dirk"] })
      .gear(P1, DIRK, "dirk", { attachedTo: "squire" })
      .hand(P1, CARD, "shot")
      .build();
    expect(game.state("dirk").attachedTo).toBe("squire");
    expect(game.state("squire").attachments).toEqual(["dirk"]);
    await game.p1.cast("shot", { targets: ["squire", "dirk"] });
    await game.settle({ policy: "first" });
    expect(game.state("dirk").attachedTo).toBeUndefined();
    expect(game.state("squire").attachments).toEqual([]);
    expect(game.zoneOf("dirk")).toBe("base");
  });

  test("works on an ENEMY unit + enemy Equipment pair ('same controller', not 'friendly')", async () => {
    // Expected: P1 may detach P2's Skyfall from P2's unit (might 5 → 3). Actual: not implemented.
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P2, "base", { might: 3, name: "Brute" }, "brute", { equippedWith: ["theirSky"] })
      .gear(P2, SKYFALL, "theirSky", { attachedTo: "brute" })
      .hand(P1, CARD, "shot")
      .build();
    expect(game.state("brute").might).toBe(5);
    await game.p1.cast("shot", { targets: ["brute", "theirSky"] });
    await game.settle({ policy: "first" });
    expect(game.state("theirSky").attachedTo).toBeUndefined();
    expect(game.state("brute").might).toBe(3);
  });
});
