/**
 * Ruling 2105d9a4ab183282 — Sprite (OGN-274 → ogn-274-298) · Unit token · 3 Might · [Temporary]
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · 2
 *     "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: With a Sprite and a Zhonya's out, does the Sprite die anyway, does Zhonya's "trigger", or do I choose?
 * A: Zhonya's is a MANDATORY REPLACEMENT effect, not a trigger: it uses no chain and offers no choice. The moment the
 *    Sprite would die, the death is replaced — Zhonya's is killed (to trash), the Sprite is healed, exhausted and
 *    recalled. You cannot opt to keep the Hourglass and let the Sprite die.
 * Rules: 370–373 (replacement effects apply as the event would happen; mandatory), 186.1 (tokens), 728 Temporary.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SPRITE = "ogn-274-298";
const ZHONYAS = "ogn-077-298";
const HEXTECH_RAY = "ogn-009-298"; // [Action] 1 + [fury]: Deal 3 to a unit at a battlefield.

describe("Ruling 2105d9a4ab183282 — Zhonya's Hourglass automatically replaces the Sprite's death; no choice, no chain", () => {
  test("lethal spell damage: the Sprite 'would die' → Zhonya's is killed instead, the Sprite is healed, exhausted and recalled to base — and P1 was never asked anything", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SPRITE, "sprite")
      .gear(P1, ZHONYAS, "zhonya")
      .hand(P2, HEXTECH_RAY, "ray")
      .build();
    const p1Prompts: string[] = [];
    const note = () => {
      const d = game.decision();
      if (d?.seat === P1 && d.kind !== "action") {
        p1Prompts.push(`${d.kind}: ${d.prompt}`);
      }
    };
    await game.p2.cast("ray", { targets: "sprite" });
    note();
    // Resolve the Ray by passing priority only — record any non-priority prompt P1 would get.
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
      note();
    }
    note();
    expect(p1Prompts).toEqual([]); // mandatory: no yes/no, no "which one" — it just happens
    expect(game.chain()).toEqual([]); // and it used no chain item of its own
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("zhonya")).toBe("trash"); // the Hourglass does NOT survive
    expect(game.has("sprite")).toBe(true); // the Sprite does NOT die
    expect(game.zoneOf("sprite")).toBe("base"); // recalled
    expect(game.state("sprite")).toMatchObject({ damage: 0, isExhausted: true }); // healed + exhausted
    expect(game.violations()).toEqual([]);
  });

  test("the same applies to the Sprite's own [Temporary] death at the start of P1's Beginning Phase: Zhonya's is consumed and the Sprite is still around in P1's main phase", async () => {
    const game = await scenario().active(P2).unit(P1, "base", SPRITE, "sprite").gear(P1, ZHONYAS, "zhonya").build();
    await game.advanceTurn(); // P2 ends → P1's turn begins → Temporary tries to kill the Sprite
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("zhonya")).toBe("trash");
    expect(game.has("sprite")).toBe(true);
    expect(game.zoneOf("sprite")).toBe("base");
    expect(game.state("sprite").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("control: without the Hourglass the same 3 damage kills the 3-Might Sprite token outright (it ceases to exist)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SPRITE, "sprite")
      .hand(P2, HEXTECH_RAY, "ray")
      .build();
    await game.p2.cast("ray", { targets: "sprite" });
    await game.settle();
    expect(game.zoneOf("sprite")).toBe("gone");
  });
});
