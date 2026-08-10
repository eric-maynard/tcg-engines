/**
 * Ruling dbb876ea22ebab9a — Yordle Explorer (SFD-100 → sfd-100-221) · 4 Might
 *     "When you play a card with Power cost [rainbow][rainbow] or more, draw 1."
 *   × Miss Fortune, Captain (OGN-162 → ogn-162-298) · [5]+[body] · [Accelerate] ([1][body] additional cost)
 *   × Called Shot (SFD-122 → sfd-122-221) · [0]+[chaos] · [Repeat] [chaos] · "Look at the top 2 … Draw one and recycle the other."
 *
 * Q: Does Yordle Explorer count additional costs (Accelerate / Repeat) when checking "Power cost 2 or more"?
 * A: No. Only the PRINTED Power cost counts. Miss Fortune (printed [body]) played with Accelerate, or Called Shot (printed
 *    [chaos]) played with Repeat, each cost 2 Power in total but do NOT trigger the Explorer.
 * Rules: 206.1 (a card's cost is its printed cost), 356.4 (additional costs change only the total paid), 811/820 keywords.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const YORDLE_EXPLORER = "sfd-100-221";
const MF_CAPTAIN = "ogn-162-298";
const CALLED_SHOT = "sfd-122-221";
const FALLING_STAR = "ogn-029-298"; // [2]+[fury][fury] — printed two-Power control
const FILL = "ogn-175-298";

describe("Ruling dbb876ea22ebab9a — Yordle Explorer reads printed Power cost; Accelerate/Repeat surcharges don't count", () => {
  test("control: Falling Star (printed [fury][fury]) makes the Explorer draw 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 2 } })
      .unit(P1, "base", YORDLE_EXPLORER, "explorer")
      .unit(P2, "base", { might: 7, name: "Dummy" }, "dummy")
      .hand(P1, FALLING_STAR, "star")
      .deck(P1, [FILL, FILL], ["d1", "d2"])
      .build();
    expect(game.state("star").powerCost).toHaveLength(2);
    await game.p1.cast("star", { targets: ["dummy", "dummy"] });
    await game.settle();
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("Miss Fortune, Captain's printed Power cost is ONE [body]; played with Accelerate she costs [6]+[body][body] in total and enters ready — yet the Explorer does NOT draw", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { body: 2 } })
      .unit(P1, "base", YORDLE_EXPLORER, "explorer")
      .hand(P1, MF_CAPTAIN, "mf")
      .deck(P1, [FILL, FILL], ["d1", "d2"])
      .build();
    expect(game.state("mf").powerCost).toEqual(["body"]);
    await game.p1.play("mf", { accelerate: true, to: "base" });
    await game.settle();
    expect(game.zoneOf("mf")).toBe("base");
    expect(game.state("mf").isReady).toBe(true); // Accelerate was really paid …
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } }); // … 2 Power left the pool …
    expect(game.p1.hand()).toEqual([]); // … but no Explorer draw
    expect(game.p1.deck().slice(0, 2)).toEqual(["d1", "d2"]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: Miss Fortune WITHOUT Accelerate (1 Power paid) — no draw either, confirming the printed cost is what is read", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { body: 2 } })
      .unit(P1, "base", YORDLE_EXPLORER, "explorer")
      .hand(P1, MF_CAPTAIN, "mf")
      .deck(P1, [FILL, FILL], ["d1", "d2"])
      .build();
    await game.p1.play("mf", { accelerate: false, to: "base" });
    await game.settle();
    expect(game.zoneOf("mf")).toBe("base");
    expect(game.state("mf").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 1 } });
    expect(game.p1.hand()).toEqual([]);
  });

  test("Called Shot's printed Power cost is ONE [chaos]; cast with Repeat it costs [chaos][chaos] and its effect runs twice (2 draws of its own) — the Explorer adds NO third draw", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0, power: { chaos: 2 } })
      .unit(P1, "base", YORDLE_EXPLORER, "explorer")
      .hand(P1, CALLED_SHOT, "shot")
      .deck(P1, [FILL, FILL, FILL, FILL, FILL, FILL], ["d1", "d2", "d3", "d4", "d5", "d6"])
      .build();
    expect(game.state("shot").powerCost).toEqual(["chaos"]);
    await game.p1.cast("shot", { repeat: 1 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } }); // base [chaos] + Repeat [chaos]
    // Resolve: each execution looks at 2 and asks which to draw; take the first offered each time.
    for (let i = 0; i < 12; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || !d || d.seat !== P1) {
        break;
      }
      if (d.kind === "pick") {
        await game.p1.pick(d.options[0]!.card ?? d.options[0]!.key);
      } else if (d.kind === "deck-arrange") {
        await game.p1.answer({ kind: "deck-arrange", recycle: d.cards.slice(1).map((c) => c.key), top: [d.cards[0]!.key] });
      } else {
        break;
      }
    }
    expect(game.zoneOf("shot")).toBe("trash");
    expect(game.chain()).toEqual([]);
    // Two executions of "draw one" = exactly 2 cards in hand; an Explorer trigger would have made it 3.
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.violations()).toEqual([]);
  });
});
