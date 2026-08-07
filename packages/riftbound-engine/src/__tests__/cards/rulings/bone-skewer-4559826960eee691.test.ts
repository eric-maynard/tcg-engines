/**
 * Ruling 4559826960eee691 — Bone Skewer (UNL-139 → unl-139-219, Action spell, [2][chaos], Hidden)
 *   "Choose a battlefield. An opponent reveals their hand. You may choose a unit from it. They play that unit
 *    to that battlefield, ignoring any and all costs. When they do, [Stun] it."
 *   × Nami, Headstrong (unl-052-219) "You may pay [calm] as an additional cost to play me. When you play me,
 *     if you paid the additional cost, [Stun] an enemy unit. …"
 *
 * Q: Can a unit played for free by Bone Skewer still get an effect for paying an optional additional cost?
 * A: Yes. "Ignoring any and all costs" sets the TOTAL cost (incl. additional costs) to 0, but the opponent may
 *    still DECLARE the optional additional cost while playing; an optional cost counts as paid by the decision
 *    to pay, not the amount spent — so Nami's "if you paid" stun triggers although no [calm] is spent.
 * Rules: 356.5.a, 356.1.b.1, 356.4.f.1, 356.2 (decision to pay made before costs are determined).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BONE_SKEWER = "unl-139-219";
const NAMI = "unl-052-219";

/**
 * P1's turn; P1 controls bf1 and has a 3-Might unit there (Nami's only enemy target). P2 holds Nami and one
 * decoy card, with exactly 1 calm in pool (to prove nothing is spent) and no energy at all.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } }) // exactly Bone Skewer
    .resources(P2, { energy: 0, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "P1 Soldier" }, "soldier")
    .hand(P2, NAMI, "nami")
    .hand(P2, { cardType: "spell", energyCost: 1, name: "Decoy Spell", timing: "action" }, "decoy")
    .hand(P1, BONE_SKEWER, "skewer");
}

/** Cast Bone Skewer choosing bf1 (however the engine exposes the battlefield choice) and let it resolve. */
async function castSkewerAtBf1(game: Game): Promise<void> {
  const opt = game.p1.option("cast", "skewer");
  expect(opt).toBeDefined();
  if (opt?.fields.some((f) => f.name === "targets")) {
    await game.p1.cast("skewer", { targets: "bf1" });
  } else {
    await game.p1.cast("skewer");
  }
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  // If the battlefield is chosen on resolution instead, answer it.
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "bf1")) {
    await game.p1.pick("bf1");
  }
}

/** P1 is offered the units in P2's revealed hand and picks Nami. */
async function pickNamiFromRevealedHand(game: Game): Promise<void> {
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
  expect(offered).toContain("nami");
  expect(offered).not.toContain("decoy"); // "a unit from it"
  expect(d?.kind === "pick" ? d.allowDecline : undefined).toBe(true); // "you may"
  await game.p1.pick("nami");
}

/** The optional-additional-cost declaration is P2's decision (yes/no or an opt-in pick). */
function isOptionalCostPrompt(d: Decision | null): boolean {
  return !!d && d.seat === P2 && (d.kind === "yes-no" || (d.kind === "pick" && d.allowDecline));
}

describe("Ruling 4559826960eee691 — Bone Skewer × Nami, Headstrong: optional additional cost under 'ignoring any and all costs'", () => {
  // Expected: Skewer resolves → P2's hand is revealed → P1 picks Nami → P2 plays Nami to bf1 and is asked
  // whether to pay the optional [calm]; P2 says yes; the total cost (incl. that [calm]) is set to 0 so P2's
  // calm stays at 1; Nami lands at bf1 stunned (Skewer) and her "if you paid" trigger stuns P1's soldier.
  // Actual: Bone Skewer is a stub (Hidden only) — it resolves doing nothing; no reveal, no pick, Nami stays in hand.
  test("ruling 4559826960eee691 — P2 declares the optional cost, pays nothing (cost zeroed), and Nami's stun still triggers", async () => {
    const game = await board().build();
    await castSkewerAtBf1(game);
    await pickNamiFromRevealedHand(game);
    // P2 plays Nami (instructed play): first the decision to pay the optional additional cost — P2's call.
    let d = game.decision();
    if (d?.kind === "pick" && d.source?.pendingChoiceType === "choose-destination") {
      // "to that battlefield" — no real choice, but tolerate a forced single-option prompt.
      expect(d.options.map((o) => o.key)).toEqual([expect.stringContaining("bf1")]);
      await game.p2.pick(d.options[0]?.key as string);
      d = game.decision();
    }
    expect(isOptionalCostPrompt(d)).toBe(true);
    if (d?.kind === "yes-no") {
      await game.p2.yes();
    } else {
      await game.p2.answer(d?.kind === "pick" ? (d.options[0]?.key as string) : "yes");
    }
    // Nothing was actually spent: "any and all costs" zeroed the folded-in additional cost (356.5.a).
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 1 } });
    // Nami is on the chosen battlefield.
    game.script(P2, ["soldier"]); // Nami's stun target if asked
    await game.settle();
    expect(game.locationOf("nami")).toBe("bf1");
    expect(game.state("nami").controller).toBe(P2);
    // "When they do, Stun it."
    expect(game.state("nami").isStunned).toBe(true);
    // The condition "if you paid the additional cost" is satisfied by the decision to pay (356.4.f.1).
    expect(game.state("soldier").isStunned).toBe(true);
    expect(game.zoneOf("skewer")).toBe("trash");
  });

  // Contrast. Expected: if P2 declines the optional cost, Nami is still played free and stunned by Skewer,
  // but her own stun trigger does not fire — P1's soldier is untouched. Actual: Skewer does nothing.
  test("ruling 4559826960eee691 — contrast: P2 declines the optional cost → Nami enters stunned, no enemy stun", async () => {
    const game = await board().build();
    await castSkewerAtBf1(game);
    await pickNamiFromRevealedHand(game);
    let d = game.decision();
    if (d?.kind === "pick" && d.source?.pendingChoiceType === "choose-destination") {
      await game.p2.pick(d.options[0]?.key as string);
      d = game.decision();
    }
    expect(isOptionalCostPrompt(d)).toBe(true);
    if (d?.kind === "yes-no") {
      await game.p2.no();
    } else {
      await game.p2.decline();
    }
    await game.settle();
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 1 } });
    expect(game.locationOf("nami")).toBe("bf1");
    expect(game.state("nami").isStunned).toBe(true);
    expect(game.state("soldier").isStunned).toBe(false);
  });

  // The premise both cases rely on. Expected: after Skewer resolves P1 is looking at P2's hand and may pick a
  // UNIT from it (Nami offered, the decoy spell not). Actual: no prompt — straight back to P1's main phase.
  test("ruling 4559826960eee691 — Skewer reveals P2's hand and lets P1 choose a unit from it", async () => {
    const game = await board().build();
    await castSkewerAtBf1(game);
    await pickNamiFromRevealedHand(game);
    expect(game.zoneOf("nami")).not.toBe("hand");
  });

  test("control: played normally, Nami's optional [calm] IS spent and the stun fires — the ruling's point is only the amount, not the decision, changes under Skewer", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3, power: { calm: 1 } })
      .unit(P1, "base", { might: 3, name: "P1 Soldier" }, "soldier")
      .hand(P2, NAMI, "nami")
      .build();
    const opt = game.p2.option("play", "nami");
    expect(opt?.fields.some((f) => f.arg === "payOptional")).toBe(true); // the decision to pay is offered at play time
    await game.p2.play("nami", { payOptional: true });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    game.script(P2, ["soldier"]);
    await game.settle();
    expect(game.zoneOf("nami")).toBe("base");
    expect(game.state("soldier").isStunned).toBe(true);
  });

  test("control: played normally WITHOUT paying, Nami's stun does not trigger", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3, power: { calm: 1 } })
      .unit(P1, "base", { might: 3, name: "P1 Soldier" }, "soldier")
      .hand(P2, NAMI, "nami")
      .build();
    await game.p2.play("nami", { payOptional: false });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 1 } });
    await game.settle();
    expect(game.zoneOf("nami")).toBe("base");
    expect(game.state("soldier").isStunned).toBe(false);
  });
});
