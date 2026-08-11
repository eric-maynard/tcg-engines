/**
 * Ruling e2a35c364b15734f — Power Nexus (SFD-214 → sfd-214-221, Battlefield)
 *     "When you hold here, you may pay [rainbow][rainbow][rainbow][rainbow] to score 1 point."
 *   × Consult the Past (OGN-083 → ogn-083-298) · [4] · [Reaction] "Draw 2."   (Loose Cannon OGN-251 only as context.)
 *
 * Q: Can you float energy (tap runes for energy before recycling them for the Power) when paying for Power Nexus?
 * A: Yes — either in response to the trigger or while paying its cost. The floated energy stays in your pool only until
 *    the end of the Draw Phase, so it matters only if you spend it at Reaction speed before then, e.g. Consult the Past
 *    in response to the Nexus hold trigger. The hold trigger starts a chain every time you hold there.
 * Rules: 429.3 / 164.2 (Add abilities usable while a payment is asked), 383.3.b (CR: trigger cost paid at FINALIZATION),
 *        315.4 + 316.3 (pool empties end of Draw Phase / as Main opens), 336 (Reactions on a chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game, YesNoDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const POWER_NEXUS = "sfd-214-221";
const CONSULT_THE_PAST = "ogn-083-298";

/** P2 about to end turn 2. P1 holds the Nexus with a unit, has 5 runes (3 fury, 2 calm) and Consult the Past in hand. */
function aboutToHold() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("nexus", { controller: P1, def: POWER_NEXUS, inert: false })
    .unit(P1, "nexus", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
    .runes(P1, "fury", 3)
    .runes(P1, "calm", 2)
    .hand(P1, CONSULT_THE_PAST, "consult")
    .fillDecks({ main: 10, runes: 0 });
}

async function holdPrompt(game: Game): Promise<YesNoDecision> {
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  expect(game.p1.points()).toBe(1); // the ordinary hold point
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "nexus", controller: P1, triggered: true })]); // a chain starts on every hold
  const d = game.decision();
  // RULING-CONFLICT: riftjudge e2a35c364b15734f also allows floating "in response to the trigger" BEFORE paying; CR 383.3.b
  // says the trigger's cost is paid as it is FINALIZED (before anyone gets priority) — engine follows CR: the pay prompt
  // (timing FIN) comes first, the response window opens only once it is answered.
  // rule 429.3 — the pool is empty but the ready runes could fund it, so "yes"
  // is offered with the outstanding [rainbow]×4 named (DESIGN manual-pay: the
  // player recycles while the prompt is open, nothing is auto-paid).
  expect(d).toMatchObject({
    canAccept: true,
    kind: "yes-no",
    needsAdd: { power: { rainbow: 4 } },
    seat: P1,
    timing: "FIN",
  });
  return d as YesNoDecision;
}

/** While the pay prompt is open: tap four runes for energy (the float) and recycle four runes for the Power, then accept. */
async function floatAndPay(game: Game): Promise<void> {
  expect(game.p1.legal().some((o) => o.verb === "tapRune")).toBe(true);
  expect(game.p1.legal().some((o) => o.verb === "recycleRune")).toBe(true);
  await game.p1.tapRunes(4); // float 4 energy first …
  expect(game.p1.energy()).toBe(4);
  for (let i = 0; i < 4; i++) {
    await game.p1.recycleRune(); // … then recycle runes for the [rainbow] pips
  }
  expect(game.p1.power()).toBe(4);
  expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
  await game.p1.yes();
  expect(game.p1.power()).toBe(0); // the four Power paid the Nexus …
  expect(game.p1.energy()).toBe(4); // … the floated energy is still there
}

describe("Ruling e2a35c364b15734f — floating energy around Power Nexus's hold payment", () => {
  test("while the Nexus payment is being asked, P1 may tap runes for energy AND recycle runes for Power; accepting spends only the Power and leaves the energy floating", async () => {
    const game = await aboutToHold().build();
    await holdPrompt(game);
    await floatAndPay(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "nexus", triggered: true })]);
  });

  test("the floated energy is spendable at Reaction speed in response to the Nexus trigger: P1 casts Consult the Past ([4]) on top of it, draws 2, then the trigger resolves for the second point", async () => {
    const game = await aboutToHold().build();
    await holdPrompt(game);
    await floatAndPay(game);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "consult")).toBe(true);
    const handBefore = game.p1.hand().length; // consult itself
    await game.p1.cast("consult");
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["nexus", "consult"]);
    await game.settle();
    expect(game.zoneOf("consult")).toBe("trash");
    expect(game.p1.points()).toBe(2);
    expect(game.phase()).toBe("main");
    // hand: −1 Consult, +2 from Consult, +1 Draw Phase
    expect(game.p1.hand()).toHaveLength(handBefore - 1 + 2 + 1);
    expect(game.violations()).toEqual([]);
  });

  test("unspent, the floated energy does not survive into the Main Phase — the pool is emptied at the end of the Draw Phase", async () => {
    const game = await aboutToHold().build();
    await holdPrompt(game);
    await floatAndPay(game);
    await game.settle(); // pass on the trigger → resolves → channel/draw → main
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(2);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.hand()).toContain("consult"); // never cast
  });
});
