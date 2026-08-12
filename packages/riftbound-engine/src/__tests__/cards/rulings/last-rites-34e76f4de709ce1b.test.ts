/**
 * Ruling 34e76f4de709ce1b — Last Rites (SFD-150 → sfd-150-221) · Equipment · [3] · +2 Might
 *   "When I conquer or hold, you may play a unit from your trash. (You still pay its costs.)"
 *   × Charm (OGN-043 → ogn-043-298) · [1][calm] "Move an enemy unit." (used to conquer on the opponent's turn)
 *
 * Q: When exactly can I play the unit — does the timing matter once the condition has been met?
 * A: The play happens as part of the trigger, not as a separate main-phase action. When you conquer, the
 *    ability triggers, you decide whether to use it, and on resolution you choose a unit in your trash and
 *    play it (paying its full cost). Because the ability grants the permission, normal play timing is
 *    ignored — it works on the opponent's turn too. The wearer must still be on the board when the conquer
 *    happens for the ability to trigger at all.
 * Rules: 366.1 / 419.1.a (an ability that says "play" grants its own timing permission), 383.3.a
 *        (a leading "you may" is decided when the trigger is finalized), 130 (costs still paid in full).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LAST_RITES = "sfd-150-221";
const CHARM = "ogn-043-298";
const TRASH_UNIT = { cardType: "unit", energyCost: 2, might: 2, name: "Revenant" } as const;

/** P2's turn. bfX is empty; P1's Bearer wears Last Rites; P1 has [2] spare and a 2-cost unit in the trash. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .resources(P1, { energy: 2 })
    .battlefield("bfX", { controller: null })
    .unit(P1, "base", { might: 3, name: "Bearer" }, "bearer", { equippedWith: ["rites"] })
    .card("rites", { def: LAST_RITES, meta: { attachedTo: "bearer" }, owner: P1, zone: "base" })
    .trash(P1, TRASH_UNIT, "revenant")
    .hand(P2, CHARM, "charm");
}

/** P2 Charms the Bearer onto the empty bfX; it conquers there when the (non-combat) showdown closes. */
async function conquerOnTheirTurn(): Promise<Game> {
  const game = await board().build();
  expect(game.state("bearer").might).toBe(5); // 3 + the Equipment's +2
  await game.p2.cast("charm", { targets: "bearer", answers: ["bfX"] });
  // the arrival opens a non-combat showdown at bfX; both seats pass Focus to close it
  for (let i = 0; i < 8; i++) {
    await game.settle();
    const d = game.decision();
    if (!d || d.context !== "showdown") {
      break;
    }
    await game.acting().pass();
  }
  return game;
}

describe("Ruling 34e76f4de709ce1b — Last Rites' conquer trigger plays the unit itself, ignoring normal timing", () => {
  test("the conquer happens on P2's turn and the ability offers itself to P1", async () => {
    const game = await conquerOnTheirTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.locationOf("bearer")).toBe("bfX");
    expect(game.gameState.battlefields.bfX?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    const d = game.decision();
    expect(d).toMatchObject({ seat: P1 });
    expect(["yes-no", "pick"]).toContain(d?.kind);
  });

  test("ruling: accepting walks P1 through choose-unit then choose-destination, and plays the Revenant on the OPPONENT'S turn for its full [2]", async () => {
    const game = await conquerOnTheirTurn();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();

    await game.settle();
    const pickUnit = game.decision();
    expect(pickUnit).toMatchObject({ kind: "pick", seat: P1 });
    expect(pickUnit?.kind === "pick" ? pickUnit.options.map((o) => String(o.card ?? o.key)) : []).toEqual(["revenant"]);
    await game.p1.pick("revenant");

    await game.settle();
    const pickDest = game.decision();
    expect(pickDest).toMatchObject({ kind: "pick", seat: P1 });
    expect(pickDest?.kind === "pick" ? pickDest.options.map((o) => String(o.card ?? o.key)) : []).toContain("base");
    await game.p1.pick("base");

    await game.settle();
    expect(game.zoneOf("revenant")).toBe("base");
    expect(game.p1.energy()).toBe(0); // "You still pay its costs."
    expect(game.turnPlayer()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("declining leaves the unit in the trash and costs nothing", async () => {
    const game = await conquerOnTheirTurn();
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      await game.p1.no();
    }
    await game.settle();
    expect(game.zoneOf("revenant")).toBe("trash");
    expect(game.p1.energy()).toBe(2);
  });

  test("presence requirement: if the wearer is not on the board when a battlefield is conquered, nothing triggers", async () => {
    const game = await scenario()
      .turn(3)
      .battlefield("bfX", { controller: null })
      .resources(P1, { energy: 2 })
      .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
      .card("rites", { def: LAST_RITES, owner: P1, zone: "trash" })
      .trash(P1, TRASH_UNIT, "revenant")
      .build();
    await game.p1.move("runner", "bfX");
    await game.settle();
    expect(game.gameState.battlefields.bfX?.controller).toBe(P1);
    expect(game.zoneOf("revenant")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action" });
  });
});
