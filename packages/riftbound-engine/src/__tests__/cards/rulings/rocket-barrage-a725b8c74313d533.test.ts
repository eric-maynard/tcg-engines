/**
 * Ruling a725b8c74313d533 — Rocket Barrage (SFD-077 → sfd-077-221) · Spell · Mind · [4][mind] · [Repeat][4][mind]
 *     "Choose one — Deal 4 to a unit in a base. Kill a gear."
 *   × Viktor, Leader (ogn-246-298) · 4 Might
 *     "When another non-Recruit unit you control dies, play a 1 [Might] Recruit unit token into your base."
 *
 * Q: A Repeat-paid Rocket Barrage hits a non-Recruit unit first and Viktor second. Since the executions resolve in
 *    order, does Viktor see the first unit die and make a Recruit?
 * A: No. Damage is dealt to both during resolution, but units only DIE in the Cleanup after the spell — both die
 *    simultaneously, so Viktor is gone when the death would be seen. If instead a (hypothetical) Repeat spell said
 *    "kill a unit", kills happen immediately and sequentially: the first unit dies while Viktor is alive → token.
 * Rules: 820 (Repeat = one spell, effect performed twice), 322/323 (deaths from damage happen in Cleanup,
 *        simultaneously), kill as an instruction is immediate (415), 383 (trigger condition must be met while
 *        the source is on the board).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ROCKET_BARRAGE = "sfd-077-221";
const VIKTOR_LEADER = "ogn-246-298";

/** The ruling's hypothetical: same shell as Rocket Barrage but mode 1 KILLS a unit in a base instead of dealing 4. */
const CULL_BARRAGE = {
  abilities: [
    {
      effect: {
        options: [
          { effect: { target: { location: "base", type: "unit" }, type: "kill" }, label: "Kill a unit in a base" },
          { effect: { target: { type: "gear" }, type: "kill" }, label: "Kill a gear" },
        ],
        type: "choice",
      },
      repeat: { energy: 4, power: ["mind"] },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "mind",
  energyCost: 4,
  name: "Cull Barrage (hypothetical)",
  powerCost: ["mind"],
  rulesText: "[Repeat] [4][mind]\nChoose one —Kill a unit in a base.Kill a gear.",
  timing: "action",
} as const;

/** P1's turn with [8] + 2 mind. P2's base: a 3-Might Grunt (non-Recruit) and Viktor, Leader (4). */
function board(spell: string | typeof CULL_BARRAGE) {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 8, power: { mind: 2 } })
    .unit(P2, "base", { might: 3, name: "Grunt" }, "grunt")
    .unit(P2, "base", VIKTOR_LEADER, "viktor")
    .hand(P1, spell, "spell");
}

function recruits(game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>): string[] {
  return game.p2.base().filter((id) => game.state(id).isToken && game.state(id).name === "Recruit");
}

describe("Ruling a725b8c74313d533 — damage-Repeat kills land together in Cleanup (no Viktor token); a kill-Repeat is sequential (token)", () => {
  test("Rocket Barrage, Repeat paid once, mode 'Deal 4' at Grunt THEN Viktor: one chain item carrying both targets in order; [8] + 2 mind spent", async () => {
    const game = await board(ROCKET_BARRAGE).build();
    await game.p1.cast("spell", { modes: [0, 0], repeat: 1, targets: ["grunt", "viktor"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "spell", targets: ["grunt", "viktor"], triggered: false });
  });

  test("it resolves: both take 4 during resolution and die SIMULTANEOUSLY in the following Cleanup — Viktor's ability never triggers, no Recruit token, nothing left on the chain", async () => {
    const game = await board(ROCKET_BARRAGE).build();
    await game.p1.cast("spell", { modes: [0, 0], repeat: 1, targets: ["grunt", "viktor"] });
    await game.settle();
    expect(game.zoneOf("spell")).toBe("trash");
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.zoneOf("viktor")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(recruits(game)).toEqual([]);
    expect(game.p2.base()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — the hypothetical 'Kill a unit in a base' Repeat spell at Grunt THEN Viktor: the first kill happens immediately while Viktor is alive → Viktor triggers; then Viktor is killed; P2 ends with a Recruit token", async () => {
    const game = await board(CULL_BARRAGE).build();
    await game.p1.cast("spell", { modes: [0, 0], repeat: 1, targets: ["grunt", "viktor"] });
    expect(game.chain()).toHaveLength(1); // still ONE spell instance
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("spell")).toBe("trash");
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.zoneOf("viktor")).toBe("trash");
    const tokens = recruits(game);
    expect(tokens).toHaveLength(1);
    expect(game.state(tokens[0]!)).toMatchObject({ controller: P2, might: 1, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("(order matters for the kill version: Viktor FIRST, then Grunt — Viktor is already dead when Grunt dies, so no token)", async () => {
    const game = await board(CULL_BARRAGE).build();
    await game.p1.cast("spell", { modes: [0, 0], repeat: 1, targets: ["viktor", "grunt"] });
    await game.settle();
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.zoneOf("viktor")).toBe("trash");
    expect(recruits(game)).toEqual([]);
  });
});
