/**
 * Ruling 4e936096d2ae140c — Shen, Kinkou (OGN-241 → ogn-241-298) · 3 energy + [order] · 3 Might ·
 *   "[Reaction] (Play any time, even before spells and abilities resolve, including to a battlefield you
 *   control.)"
 *
 * Q: When the opponent moves a unit to a contested battlefield, may Shen be played there with his
 *    [Reaction] even though the player is not the one controlling that battlefield?
 * A: No. A unit can only ever be played to a battlefield YOU control (that restriction lives in the
 *    [Reaction] rules, and Shen's reminder text repeats it — reminder text changes nothing). The rest of
 *    the question (what would score) is moot because the play is illegal.
 * Rules: 355.2 / 421 (units are played to your base or to a battlefield you control), 810 ([Reaction]
 *        timing only widens WHEN, not WHERE), 010.2 (reminder text has no game effect).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SHEN = "ogn-241-298";

/** P1's turn. bf1 is P2's (a Guard there), bf2 is P1's (a Holder there), bf3 is uncontrolled and empty. */
const board = () =>
  scenario()
    .resources(P1, { energy: 3, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .battlefield("bf3")
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "bf2", { might: 3, name: "Holder" }, "holder")
    .hand(P1, SHEN, "shen");

describe("Ruling 4e936096d2ae140c — [Reaction] does not let a unit be played to a battlefield you do not control", () => {
  test("the play menu offers base and the battlefield P1 controls — never the enemy's, never an uncontrolled one", async () => {
    const game = await board().build();
    const destinations = (game.p1.option("play", "shen")?.fields.find((f) => f.arg === "to")?.options ?? []) as string[];
    expect(destinations).toEqual(["base", "battlefield-bf2"]);
    expect(destinations).not.toContain("battlefield-bf1");
    expect(destinations).not.toContain("battlefield-bf3");
  });

  test("naming the enemy-held battlefield explicitly is refused and nothing happens", async () => {
    const game = await board().build();
    const refused = await game.p1.try((p) => p.play("shen", { to: "bf1" }));
    expect(refused.ok).toBe(false);
    expect(game.zoneOf("shen")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { order: 1 } });
  });

  test("an uncontrolled battlefield is no better — the rule is CONTROL, not emptiness", async () => {
    const game = await board().build();
    const refused = await game.p1.try((p) => p.play("shen", { to: "bf3" }));
    expect(refused.ok).toBe(false);
  });

  test("where P1 DOES control the battlefield the [Reaction] play works — even mid-showdown, on the opponent's turn, while it is contested", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P1, { energy: 3, power: { order: 1 } })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .hand(P1, SHEN, "shen")
      .build();
    await game.p2.move("raider", "bf2");
    expect(game.gameState.battlefields.bf2?.contested).toBeTruthy();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1); // still P1's while contested
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.play("shen", { to: "bf2" });
    await game.settle();
    expect(game.locationOf("shen")).toBe("bf2");
    expect(game.violations()).toEqual([]);
  });
});
