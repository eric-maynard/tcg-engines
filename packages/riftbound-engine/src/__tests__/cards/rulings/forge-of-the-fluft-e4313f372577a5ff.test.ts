/**
 * Ruling e4313f372577a5ff — Forge of the Fluft (SFD-208 → sfd-208-221) · battlefield
 *   "While you control this battlefield, friendly legends have '[Exhaust]: Attach an Equipment you control to a unit
 *    you control.'"
 *   × a legend with its own [Exhaust] ability — here Blind Monk (OGN-257 → ogn-257-298) "[1], [Exhaust]: Buff a
 *     friendly unit." (the ruling's example is Azir's Sand Soldier ability; any [Exhaust] legend ability behaves alike)
 *
 * Q: Does using the Forge's granted ability stop me from using my legend's own ability that turn?
 * A: Yes. Exhausting the legend is the COST of both abilities. One exhaust cannot pay two costs, and you cannot
 *    activate both at once — pick one; the other waits until the legend readies.
 * Rules: 204.1/204.2 (a cost is paid once, per activation), 402 (activating an ability), 340 (granted abilities).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FORGE = "sfd-208-221";
const BLIND_MONK = "ogn-257-298"; // legend · "[1], [Exhaust]: Buff a friendly unit."
const DORANS_BLADE = "sfd-095-221"; // Equipment · [Equip] [body]

const OWN_ABILITY = 0; // the legend's printed ability
const GRANTED_ABILITY = 1; // the one the Forge grants

/** P1's turn, P1 controls the live Forge (with a unit there to hold it) and owns an unattached Equipment. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1, def: FORGE, inert: false })
    .battlefield("bf2", { controller: null })
    .legend(P1, BLIND_MONK, "monk")
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .gear(P1, DORANS_BLADE, "dorans")
    .resources(P1, { energy: 1 });
}

const legendAbilities = (game: Game) => game.p1.legal().filter((o) => o.card === "monk").map((o) => o.key);

describe("Ruling e4313f372577a5ff — the Forge's ability and the legend's own ability both cost the legend's exhaust, so only one fires", () => {
  test("while the legend is ready both abilities are on the menu", async () => {
    const game = await board().build();
    expect(game.state("monk").isExhausted).toBe(false);
    expect(legendAbilities(game)).toEqual(["activateAbility:monk#0", "activateAbility:monk#1"]);
  });

  test("using the Forge's granted ability exhausts the legend — the legend's own ability is then gone from the menu", async () => {
    const game = await board().build();
    await game.p1.activate("monk", GRANTED_ABILITY, { targets: "holder" });
    await game.settle();
    expect(game.state("monk").isExhausted).toBe(true);
    expect(game.state("dorans").attachedTo).toBe("holder");
    expect(legendAbilities(game)).toEqual([]);
    expect(game.p1.energy()).toBe(1); // the granted ability costs no Energy
  });

  test("and the other way round: using the legend's own ability locks out the Forge's", async () => {
    const game = await board().build();
    await game.p1.activate("monk", OWN_ABILITY, { targets: "holder" });
    await game.settle();
    expect(game.state("monk").isExhausted).toBe(true);
    expect(game.state("holder").isBuffed).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(legendAbilities(game)).toEqual([]);
    expect(game.state("dorans").attachedTo).toBeUndefined(); // the Equipment never got attached
  });

  test("one exhaust cannot buy both: after the first activation the second is refused outright", async () => {
    const game = await board().build();
    await game.p1.activate("monk", GRANTED_ABILITY, { targets: "holder" });
    await game.settle();
    const second = await game.p1.try((p) => p.activate("monk", OWN_ABILITY, { targets: "holder" }));
    expect(second.ok).toBe(false);
    expect(game.state("holder").isBuffed).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("the legend readies on a later turn and the choice opens up again", async () => {
    const game = await board().build();
    await game.p1.activate("monk", GRANTED_ABILITY, { targets: "holder" });
    await game.settle();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("monk").isExhausted).toBe(false);
    expect(legendAbilities(game)).toContain("activateAbility:monk#1");
  });
});
