/**
 * Ruling 85346d318b41ab01 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2]
 *   "[Hidden] (Hide now for [rainbow] to react with later for [0].)
 *    If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: Can I reveal Zhonya's on my own turn, in response to nothing, just to put it in my base?
 * A: Yes. A hidden card is playable at any moment you could play a Reaction — including your own open Main
 *    Phase with an empty chain — and it does not need something to respond to. Revealed, it is played for
 *    [0] and, being Gear, it lands in your base. The only restriction is the standard one: not on the turn
 *    you hid it.
 * Rules: 811.1 (Hidden: not the turn it was hidden, played with Reaction timing for [0]), 813 (Reaction is
 *        a permission, not a requirement to be responding), 310.1.a (priority in your own Neutral Open
 *        State), 309.2 (no chain = Open State).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";

const ACTION_SPELL = {
  abilities: [{ effect: { amount: 1, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Rally",
  rulesText: "[Action] Give a unit +1 [Might] this turn.",
  timing: "action",
} as const;

/** P1's turn 2. P1 holds bf1 with a Warden and has [rainbow] to hide Zhonya's there. */
function board() {
  return scenario()
    .turn(2)
    .active(P1)
    .resources(P1, { power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Warden" }, "warden")
    .hand(P1, ZHONYAS, "zh")
    .hand(P1, ACTION_SPELL, "rally");
}

async function hidden(): Promise<Game> {
  const game = await board().build();
  await game.p1.hide("zh", "bf1");
  expect(game.zoneOf("zh")).toBe("facedown-bf1");
  return game;
}

describe("Ruling 85346d318b41ab01 — Zhonya's may be flipped on your own turn with nothing to react to", () => {
  test("the standard hidden restriction still applies: on the turn it was hidden there is no way to reveal it", async () => {
    const game = await hidden();
    expect(game.p1.can("reveal", "zh")).toBe(false);
    expect((await game.p1.try((p) => p.reveal("zh"))).ok).toBe(false);
    expect(game.zoneOf("zh")).toBe("facedown-bf1");
  });

  test("on my NEXT turn, in an open Main Phase with an empty chain and nothing happening, revealing is legal — and it costs [0]", async () => {
    const game = await hidden();
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 again
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.chain()).toEqual([]); // reacting to nothing at all
    expect(game.p1.can("reveal", "zh")).toBe(true);
    const energyBefore = game.p1.energy();
    await game.p1.reveal("zh");
    await game.settle();
    expect(game.p1.energy()).toBe(energyBefore); // [0]
    expect(game.zoneOf("zh")).toBe("base"); // Gear goes to the base, as the ruling says
    expect(game.p1.gear()).toContain("zh");
    expect(game.violations()).toEqual([]);
  });

  test("any Reaction window works too — with my own Action spell on the chain the flip is still offered, and the Hourglass still ends up in my base", async () => {
    const game = await hidden();
    await game.advanceTurn();
    await game.advanceTurn();
    await game.p1.cast("rally", { targets: "warden" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rally" })]);
    expect(game.p1.can("reveal", "zh")).toBe(true);
    await game.p1.reveal("zh");
    await game.settle();
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.state("warden").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });
});
