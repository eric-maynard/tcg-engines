/**
 * Interaction: Bard, Mercurial (sfd-079-221) moving a GROUP of units × per-unit "When I move".
 *
 *   Bard: "…move any number of your units to an open battlefield."
 *   Mister Root (unl-127-219): "When I move to a battlefield, gain 2 XP."
 *   Treasure Hunter (sfd-130-221): "When I move, play a Gold gear token exhausted."
 *
 * Rules: 449 (one effect moves the whole group to a single destination), 446.1 (every unit that
 * changes location has moved, so EACH one's own move trigger fires).
 *
 * With two or more open battlefields the destination is a prompt, and the rest of the group rides
 * on the prompt as `alsoMoveCardIds` — those members must still get their `move` event.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BARD = "sfd-079-221";
const LEGEND = "sfd-189-221"; // Fire Below the Mountain (Ornn, calm/mind)
const ROOT = "unl-127-219";
const HUNTER = "sfd-130-221";

/** Answer the trigger: which units → `units`, which battlefield → `dest`. */
async function answerTrigger(game: Game, units: string[], dest: string): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await game.settle();
    const d = game.decision();
    if (d?.kind !== "pick" || d.seat !== P1) return;
    const cards = d.options.map((o) => o.card).filter(Boolean) as string[];
    if (cards.some((c) => units.includes(c))) {
      await game.p1.pick(...units);
    } else {
      const key = d.options.find(
        (o) => o.key === dest || o.key === `battlefield-${dest}` || o.zone === `battlefield-${dest}`,
      )?.key;
      if (key === undefined) return;
      await game.p1.pick(key);
    }
  }
}

describe("Bard group move — every moved unit's own move trigger fires (446.1)", () => {
  test("two open battlefields (destination prompted): both Mister Root and Treasure Hunter trigger", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { mind: 1 } })
      .card("legend", { def: LEGEND, owner: P1, zone: "legendZone" })
      .battlefield("open1", { controller: null })
      .battlefield("open2", { controller: null })
      .unit(P1, "base", ROOT, "root")
      .unit(P1, "base", HUNTER, "hunter")
      .unit(P2, "base", { might: 3, name: "Foe" }, "foe")
      .hand(P1, BARD, "bard")
      .build();

    await game.p1.play("bard", { payOptional: true, to: "base" });
    await answerTrigger(game, ["root", "hunter"], "open1");
    await game.settle();

    expect(game.locationOf("root")).toBe("open1");
    expect(game.locationOf("hunter")).toBe("open1");
    expect(game.p1.xp()).toBe(2);
    expect(game.p1.gear().filter((id) => game.state(id).name === "Gold")).toHaveLength(1);
    expect(game.violations()).toEqual([]);
  });
});
