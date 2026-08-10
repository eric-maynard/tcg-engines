/**
 * Ruling 40bf42601c505c43 — Pit Crew (OGN-091 → ogn-091-298) · Unit · Mind · [3] · 3 Might · "When you play a gear, ready me."
 *   × Cull (SFD-134 → sfd-134-221) · Equipment · "[Equip] [chaos] … When I conquer, play a Gold gear token exhausted."
 *   × Gold token (unl-t05) · gear token.   (+ Blood Money sfd-162-221 as another Gold-token maker; Zhonya's Hourglass
 *     ogn-077-298 as an ordinary gear for the control.)
 *
 * Q: Does Pit Crew ready when you play a Gold gear token?
 * A: Yes. A gear token is a gear; Pit Crew doesn't say "non-token". E.g. Pit Crew wearing Cull attacks and conquers →
 *    Cull plays a Gold token → Pit Crew readies again.
 * Rules: 187 (tokens have their card type and are treated as such), 383.4 ("when you play a gear").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PIT_CREW = "ogn-091-298";
const CULL = "sfd-134-221";
const BLOOD_MONEY = "sfd-162-221";
const ZHONYAS = "ogn-077-298";

function goldTokens(game: Game): string[] {
  return game.p1.gear().filter((g) => game.state(g).isToken && game.state(g).name === "Gold");
}

describe("Ruling 40bf42601c505c43 — a Gold gear TOKEN being played is 'playing a gear' for Pit Crew", () => {
  test("control: playing an ordinary gear from hand (Zhonya's Hourglass) fires Pit Crew's trigger and readies it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", PIT_CREW, "pit", { exhausted: true })
      .hand(P1, ZHONYAS, "zh")
      .build();
    expect(game.state("pit").isReady).toBe(false);
    await game.p1.play("zh");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pit", triggered: true })]);
    await game.settle();
    expect(game.zoneOf("zh")).toBe("base");
    expect(game.state("pit").isReady).toBe(true);
  });

  test("ruling 40bf42601c505c43 — the combo: Pit Crew wearing Cull moves to an open battlefield, conquers, Cull plays a Gold gear token (exhausted), and Pit Crew readies again", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", PIT_CREW, "pit", { equippedWith: ["cull"] })
      .card("cull", { def: CULL, meta: { attachedTo: "pit" }, owner: P1, zone: "base" })
      .build();
    expect(game.state("pit")).toMatchObject({ attachments: ["cull"], isReady: true, might: 4 });
    await game.p1.move("pit", "bf1");
    expect(game.state("pit").isExhausted).toBe(true); // moving exhausts
    await game.settle();
    // Conquered the open battlefield; Cull's conquer trigger played a Gold gear token, exhausted, to base.
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    const gold = goldTokens(game);
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0] as string)).toMatchObject({ cardType: "gear", isExhausted: true, zone: "base" });
    // …and that token play readied Pit Crew.
    expect(game.state("pit").isReady).toBe(true);
  });

  test("ruling 40bf42601c505c43 — a Gold token played by a spell (Blood Money) likewise readies an exhausted Pit Crew", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Weakling" }, "weak")
      .unit(P1, "base", PIT_CREW, "pit", { exhausted: true })
      .hand(P1, BLOOD_MONEY, "bm")
      .build();
    await game.p1.cast("bm", { targets: "weak" });
    await game.settle();
    expect(game.zoneOf("weak")).toBe("trash");
    expect(goldTokens(game)).toHaveLength(1);
    expect(game.state("pit").isReady).toBe(true);
  });
});
