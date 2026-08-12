/**
 * Ruling 7ed22a14b9fac559 — Charm (OGN-043 → ogn-043-298) · Spell (base speed) · Calm · [1][calm]
 *   "Move an enemy unit."
 *   × Yi, Honed (ogs-009-024) "[Ganking] I enter ready."
 *
 * Q: Can the opponent answer Master Yi walking onto a battlefield by Charming a unit in there before the
 *    showdown begins?
 * A: No. The showdown starts immediately, and Charm has base speed — it is neither an [Action] nor a
 *    [Reaction], so it cannot be played inside a showdown at all. Only once the showdown has closed (and the
 *    battlefield has an owner) can Charm be played, and moving a unit in then starts a NEW showdown.
 * Rules: 347 (only Action/Reaction speed inside a showdown), 323.9/344 (the showdown opens with the arrival),
 *        190.3.a/450 (a unit arriving applies Contested for its controller).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const YI_HONED = "ogs-009-024";

const activeShowdowns = (game: Game) =>
  (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).map((s) => s.battlefieldId);

/** P1's turn. bf1 is uncontrolled and empty; P1 has Yi in base and Charm in hand; P2 has a Foe at home. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { body: 1, calm: 2 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", YI_HONED, "yi")
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
    .hand(P1, CHARM, "charm");
}

describe("Ruling 7ed22a14b9fac559 — Charm is base speed: nothing can be Charmed into the showdown Yi just opened", () => {
  test("in an open main phase Charm is perfectly castable — speed is the only thing standing in the way later", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "charm")).toBe(true);
  });

  test("the moment Yi moves in, a showdown is running and Charm cannot be played (no Action/Reaction speed)", async () => {
    const game = await board().build();
    await game.p1.move("yi", "bf1");
    expect(activeShowdowns(game)).toEqual(["bf1"]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "charm")).toBe(false);
    expect(game.p1.legal().map((o) => o.verb)).not.toContain("cast");
  });

  test("after the showdown closes Yi's controller holds bf1 — and only NOW may Charm pull an enemy unit in, opening a new showdown", async () => {
    const game = await board().build();
    await game.p1.move("yi", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "charm")).toBe(true);

    await game.p1.cast("charm", { answers: ["battlefield-bf1"], targets: "foe" });
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind === "action" && game.chain().length > 0) await game.acting().passPriority();
      else if (d?.kind === "pick") await game.seat(d.seat).pick(d.options.find((o) => (o.zone ?? o.key).includes("bf1"))?.key ?? d.options[0]!.key);
      else break;
    }
    expect(game.locationOf("foe")).toBe("bf1");
    expect(activeShowdowns(game)).toEqual(["bf1"]); // a brand-new showdown, with P2's unit contesting
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: P1 });
    expect(game.violations()).toEqual([]);
  });
});
