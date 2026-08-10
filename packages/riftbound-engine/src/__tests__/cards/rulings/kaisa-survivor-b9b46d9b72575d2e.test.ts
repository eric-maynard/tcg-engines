/**
 * Ruling b9b46d9b72575d2e — Kai'Sa, Survivor (OGN-039 → ogn-039-298) · 4 Might
 *   × Pridestalker (UNL-183 → unl-183-219, Rengar legend) "When you play a unit, give a unit +1 [Might] this turn."
 *   × Kinkou Initiate (UNL-097 → unl-097-219) · 3 Might "When you play me, draw 1 if your other units have total Might 5 or more."
 *
 * Q: Kai'Sa (4) is my only other unit and Pridestalker is my legend. If I play Kinkou Initiate, can I let Pridestalker give Kai'Sa
 *    +1 first and then have Kinkou Initiate see 5 Might and draw?
 * A: Yes. Both "when you play a unit" abilities trigger together; as controller of both you choose their order on the chain
 *    (Kinkou first, Pridestalker on top). Pridestalker resolves first (+1 → Kai'Sa 5), then Kinkou's ability resolves, checks
 *    the total Might of your other units ON RESOLUTION (5), and you draw 1.
 * Rules: 333.1 / 383.3.d (simultaneous triggers of one controller: that player orders them), 340 (LIFO), 359 (conditions inside
 *        an effect are evaluated on resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KAISA_SURVIVOR = "ogn-039-298";
const PRIDESTALKER = "unl-183-219";
const KINKOU_INITIATE = "unl-097-219";

/** P1 (legend Pridestalker) with 3 energy; Kai'Sa (4) alone in base; Kinkou Initiate in hand; known deck top d1. */
function board() {
  return scenario()
    .legend(P1, PRIDESTALKER, "pride")
    .resources(P1, { energy: 3 })
    .unit(P1, "base", KAISA_SURVIVOR, "kaisa")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "by")
    .hand(P1, KINKOU_INITIATE, "kinkou")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

/**
 * Play Kinkou and drive P1's choices the way the ruling prescribes: order Kinkou's item BELOW Pridestalker's, aim Pridestalker
 * at Kai'Sa, pass priority. Records whether an order decision (or both items stacked) was ever seen.
 */
async function playAndSequence(): Promise<{ game: Game; sawOrder: boolean; sawBothOnChain: boolean; prompts: Decision["kind"][] }> {
  const game = await board().build();
  await game.p1.play("kinkou");
  expect(game.zoneOf("kinkou")).toBe("base");
  let sawOrder = false;
  let sawBothOnChain = false;
  const prompts: Decision["kind"][] = [];
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    const ids = game.chain().map((c) => c.cardId);
    if (ids.includes("kinkou") && ids.includes("pride")) {
      sawBothOnChain = true;
    }
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    prompts.push(d.kind);
    if (d.kind === "order") {
      expect(d.seat).toBe(P1); // the controller of both orders them
      sawOrder = true;
      // Put Pridestalker's item LAST (top of the chain → resolves first).
      const keys = d.items.map((it) => it.key);
      const prideKey = keys.find((k) => k.includes("pride")) ?? keys[keys.length - 1]!;
      await game.p1.order([...keys.filter((k) => k !== prideKey), prideKey]);
    } else if (d.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key)).toContain("kaisa");
      await game.p1.pick("kaisa");
    } else if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  return { game, prompts, sawBothOnChain, sawOrder };
}

describe("Ruling b9b46d9b72575d2e — order Pridestalker above Kinkou Initiate so Kai'Sa reaches 5 before Kinkou's check", () => {
  test("premise: Kinkou Initiate reads the TOTAL Might of your other units on the board — with 3 + 2 already out it draws 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .unit(P1, "base", { might: 3, name: "A" }, "a")
      .unit(P1, "base", { might: 2, name: "B" }, "b")
      .hand(P1, KINKOU_INITIATE, "kinkou")
      .deck(P1, ["ogn-175-298"], ["d1"])
      .build();
    await game.p1.play("kinkou");
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("Pridestalker's half works: playing Kinkou triggers the legend, P1 picks Kai'Sa, and she is 5 Might this turn", async () => {
    const { game } = await playAndSequence();
    expect(game.state("kaisa")).toMatchObject({ might: 5, mightModifier: 1 });
    expect(game.chain()).toEqual([]);
  });

  // Expected: Kinkou's "When you play me" ability triggers unconditionally (the "if … total Might 5 or more" is checked when it
  // RESOLVES), so it pends together with Pridestalker's and P1 — controller of both — orders them / both sit on the chain.
  // Actual: the engine evaluates Kinkou's Might check at trigger time (Kai'Sa is 4) and never puts Kinkou's item on the chain;
  // only Pridestalker's item appears and no ordering is offered.
  test("ruling b9b46d9b72575d2e — Kinkou Initiate's item joins Pridestalker's on the chain for P1 to order", async () => {
    const { sawBothOnChain, sawOrder } = await playAndSequence();
    expect(sawOrder || sawBothOnChain).toBe(true);
  });

  // Expected: with Pridestalker resolving first (Kai'Sa → 5), Kinkou's ability then resolves, sees total Might 5 and P1 draws d1.
  // Actual: no Kinkou item ever resolves — P1's hand stays empty.
  test("ruling b9b46d9b72575d2e — after Pridestalker makes Kai'Sa 5, Kinkou Initiate's resolution-time check passes and draws 1", async () => {
    const { game } = await playAndSequence();
    expect(game.state("kaisa").might).toBe(5);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()[0]).toBe("d2");
  });
});
