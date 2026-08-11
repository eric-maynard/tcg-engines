/**
 * Ruling d99d3d262c465680 — Overzealous Fan (SFD-128 → sfd-128-221) · 2 Might "When I defend, you may kill me to move an attacking unit
 *   to its base."   × Qiyana, Victorious (OGN-155 → ogn-155-298) · 4 Might "[Deflect] … When I conquer, draw 1 or channel 1 rune exhausted."
 *
 * Q: Do "when I attack/defend" triggered abilities always go on the chain, or does the owner choose whether to put them there?
 * A: They always go on the chain when the condition is met — the owner does not choose that. Targets are declared as the ability is
 *    finalized onto the chain; the decision to pay an OPTIONAL cost (and paying it) happens at resolution, but the ability is on the
 *    chain regardless.
 * Rules: 383.3 (a met condition puts the trigger on the chain), 355.5/383.3 finalization (targets), 383.3.a–b (optional/costed triggers).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const OVERZEALOUS_FAN = "sfd-128-221";
const QIYANA = "ogn-155-298";

/** P1's turn. P2 holds bf1 with the Fan (2) + Guard (3). P1: Charger (5) and Runner (2) ready in base. */
function fanBoard() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", OVERZEALOUS_FAN, "fan")
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 5, name: "Charger" }, "charger")
    .unit(P1, "base", { might: 2, name: "Runner" }, "runner");
}

describe("Ruling d99d3d262c465680 — attack/defend triggers go on the chain by themselves; targets at finalization", () => {
  test("the instant Charger attacks, the Fan's 'When I defend' item is ALREADY on the chain (P2 made no choice to put it there); P2's first question is the trigger's own opt-in, sourced from the Fan", async () => {
    const game = await fanBoard().build();
    await game.p1.move("charger", "bf1");
    expect(game.state("fan").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fan", controller: P2, triggered: true })]);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "fan" }, timing: "FIN" });
    // Nobody has had priority yet — this is still the item's finalization.
    expect(game.p1.legal().some((o) => o.verb === "passPriority")).toBe(false);
  });

  test("targets are declared at finalization: with TWO attackers, right after 'yes' P2 must choose which attacking unit (a FIN-time pick, before any priority) and the item then carries that target", async () => {
    const game = await fanBoard().build();
    await game.p1.move(["charger", "runner"], "bf1");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "fan" } });
    await game.p2.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["charger", "runner"]);
    await game.p2.pick("charger");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fan", targets: ["charger"], triggered: true })]);
    // Only now does a priority window open (P2, the item's controller, first).
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.locationOf("charger")).toBe("base"); // the declared target went home
    expect(game.locationOf("runner")).toBe("bf1"); // the other attacker fights on
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("declining does not mean 'it never went on the chain': the item was there when P2 was asked; after 'no' it leaves, the Fan lives and Charger stays", async () => {
    const game = await fanBoard().build();
    await game.p1.move("charger", "bf1");
    expect(game.chain().map((c) => c.cardId)).toEqual(["fan"]); // on the chain BEFORE the answer
    await game.p2.no();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fan")).toBe("battlefield-bf1");
    expect(game.locationOf("charger")).toBe("bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  // RULING-CONFLICT: riftjudge d99d3d262c465680 says the optional cost ("kill me") is decided and PAID AT RESOLUTION, with the item
  // on the chain regardless. CR 383.3.a/.b(.1) — and 204.3.a, which names Overzealous Fan — makes a leading "you may [cost] to …"
  // the trigger's BASE COST, decided and paid while the item is FINALIZED. The engine follows the CR: the Fan is already in the
  // trash while its item still awaits resolution, and only the MOVE waits for the item to resolve.
  test("the 'kill me' cost is the trigger's BASE COST, paid at finalization (CR 383.3.b / 204.3.a): the Fan is in the trash while its item still sits on the chain, and Charger only goes home when it resolves", async () => {
    const game = await fanBoard().build();
    await game.p1.move("charger", "bf1");
    await game.p2.yes();
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("charger");
    }
    // Item finalized and awaiting resolution (priority window open) — the base cost has already been paid.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["fan"]);
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.locationOf("charger")).toBe("bf1"); // the move itself is the EFFECT — it waits for resolution
    await game.p2.passPriority();
    await game.p1.passPriority(); // resolves: NOW move Charger
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.locationOf("charger")).toBe("base");
  });

  test("Qiyana, Victorious: her 'When I conquer' likewise lands on the chain automatically; P1 is asked to choose the mode (draw / channel) as it is finalized, then it resolves (draw 1)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Speedbump" }, "bump")
      .unit(P1, "base", QIYANA, "qiyana")
      .build();
    await game.p1.move("qiyana", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.zoneOf("bump")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "qiyana", controller: P1, triggered: true })]);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.label) : []).toEqual(["Draw 1", "Channel 1 rune exhausted"]);
    const hand = game.p1.hand().length;
    await game.p1.chooseMode(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "qiyana", mode: 0 })]);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
