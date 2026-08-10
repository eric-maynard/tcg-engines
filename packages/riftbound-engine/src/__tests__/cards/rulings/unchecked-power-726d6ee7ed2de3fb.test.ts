/**
 * Ruling 726d6ee7ed2de3fb — Unchecked Power (OGN-123 → ogn-123-298) · Spell · 7 · "Exhaust all friendly units, then deal 12
 *   to ALL units at battlefields."   × Glasc Mixologist (SFD-165 → sfd-165-221) · "[Deathknell] — You may play a unit with cost
 *   no more than [3] and no more than [rainbow] from your trash, ignoring its cost."
 *
 * Q: Unchecked Power kills my own Glasc Mixologist. May the Deathknell unit be played to the battlefield Glasc was on?
 * A: Yes. The Deathknell trigger is put on the chain as Glasc dies; while an item is on the chain you do not lose control of
 *    the now-empty battlefield (187.4.c), so it is still "a battlefield you control" when the trigger resolves. Play the unit
 *    there; when the chain finally clears a unit is present and you keep control.
 * Rules: 187.4.c (control not lost while the chain is non-empty), 808 (Deathknell), 340.2 (play to base / controlled bf).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UNCHECKED_POWER = "ogn-123-298";
const GLASC = "sfd-165-221";
const SKULKER = "ogn-175-298"; // 3-cost vanilla unit in P1's trash — a legal Deathknell play

/** P1's turn. P1 controls bf1 with a lone Glasc Mixologist; Skulker in trash; Unchecked Power in hand, amply funded. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 7, power: { mind: 3 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", GLASC, "glasc")
    .unit(P2, "bf2", { might: 2, name: "Bystander" }, "bystander") // at a battlefield too: takes the 12 as well
    .trash(P1, SKULKER, "skulker")
    .hand(P1, UNCHECKED_POWER, "up");
}

const bf1 = (game: Game) => game.gameState.battlefields.bf1;
const pickKeys = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

/** Cast Unchecked Power and pass it through: Glasc dies, its Deathknell is put on the chain (P1 asked "you may"). */
async function powerKillsGlasc(game: Game): Promise<void> {
  await game.p1.cast("up");
  expect(game.chain().map((c) => c.cardId)).toEqual(["up"]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("up")).toBe("trash");
  expect(game.zoneOf("glasc")).toBe("trash");
  expect(game.zoneOf("bystander")).toBe("trash");
}

describe("Ruling 726d6ee7ed2de3fb — Glasc's Deathknell may play the unit onto the battlefield Glasc just died on", () => {
  test("Glasc dies to Unchecked Power → its Deathknell is on the chain and P1 STILL controls the now-empty bf1 (no loss of control while the chain is non-empty)", async () => {
    const game = await board().build();
    await powerKillsGlasc(game);
    if (game.decision()?.kind === "yes-no") {
      expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
      await game.p1.yes();
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "glasc", controller: P1, triggered: true })]);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(bf1(game)?.controller).toBe(P1);
  });

  test("resolving the Deathknell: P1 picks the Skulker from trash and bf1 IS offered as its destination; it lands there for free and P1 keeps bf1 once the chain clears", async () => {
    const game = await board().build();
    await powerKillsGlasc(game);
    const afterCast = game.p1.resources();
    expect(afterCast.energy).toBe(0);
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
    }
    for (let i = 0; i < 4 && game.decision()?.kind === "action"; i++) {
      await game.acting().passPriority();
    }
    // Which unit (only the Skulker qualifies — may be locked without asking).
    if (game.decision()?.kind === "pick" && pickKeys(game.decision()).includes("skulker")) {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
      await game.p1.pick("skulker");
    }
    // Where: bf1 must be on the menu.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(pickKeys(game.decision())).toContain("battlefield-bf1");
    expect(pickKeys(game.decision())).toContain("base");
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("skulker")).toBe("battlefield-bf1");
    expect(game.p1.resources()).toEqual(afterCast); // the Deathknell play cost nothing
    expect(bf1(game)).toMatchObject({ contested: false, controller: P1 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: if P1 declines the Deathknell, the chain clears with bf1 empty and P1 loses control of it", async () => {
    const game = await board().build();
    await powerKillsGlasc(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(bf1(game)?.controller).not.toBe(P1);
  });
});
