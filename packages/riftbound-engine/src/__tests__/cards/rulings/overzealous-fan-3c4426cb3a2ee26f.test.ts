/**
 * Ruling 3c4426cb3a2ee26f — Overzealous Fan (SFD-128 → sfd-128-221) · 2 Might
 *   "When I defend, you may kill me to move an attacking unit to its base."
 *   × Draven, Audacious (sfd-148-221) — an attacking unit with [Deflect].
 *
 * Q: If I kill Overzealous Fan, do I have to pay [Deflect] for the enemy unit I move?
 * A: Yes. The attacking unit is chosen when the ability is put on the Chain, and choosing a unit with
 *    [Deflect] charges its surcharge right then; a surcharge you cannot pay makes that unit an illegal
 *    choice. The move itself happens later, at resolution.
 *   (The ruling also puts the "kill me" at resolution — see the RULING-CONFLICT note below.)
 * Rules: 809.1.c ([Deflect] taxes the choice), 402.2 (targets chosen at finalization), 204.3.a / 383.3.b
 *        (a "you may [cost] to …" trigger pays its cost at finalization).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const OVERZEALOUS_FAN = "sfd-128-221";
const DRAVEN_AUDACIOUS = "sfd-148-221"; // [Deflect]

/** P2 (turn player) attacks P1's battlefield, where the Fan defends. */
function board(power: Record<string, number>) {
  return scenario()
    .active(P2)
    .resources(P1, { power })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", OVERZEALOUS_FAN, "fan")
    .unit(P2, "base", DRAVEN_AUDACIOUS, "draven")
    .unit(P2, "base", { might: 3, name: "Plain" }, "plain");
}

describe("Ruling 3c4426cb3a2ee26f — Overzealous Fan pays [Deflect] to CHOOSE its target, at chain-placement time", () => {
  test("the target is chosen at FINALIZATION and the [Deflect] surcharge is shown on that option only", async () => {
    const game = await board({ rainbow: 2 }).build();
    await game.p2.move(["draven", "plain"], "bf1");

    // Step 1 — the "when I defend" trigger is on the Chain and asks P1 whether to use it.
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "fan", controller: P1, triggered: true, type: "ability" }),
    ]);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, timing: "FIN" });
    await game.p1.yes();

    // Step 2 — the attacking unit is named NOW (not at resolution), with Deflect priced per option.
    const d = game.decision() as Extract<Decision, { kind: "pick" }>;
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1, semantics: "target", timing: "FIN" });
    expect(d.options.map((o) => ({ card: o.card, deflect: o.deflect ?? 0, surcharge: o.surcharge ?? 0 }))).toEqual([
      { card: "draven", deflect: 1, surcharge: 1 },
      { card: "plain", deflect: 0, surcharge: 0 },
    ]);

    // Step 3 — answering charges the surcharge immediately, while the item is still on the Chain.
    await game.p1.pick("draven");
    expect(game.p1.power("rainbow")).toBe(1); // 2 - 1
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fan", targets: ["draven"] })]);
    expect(game.zoneOf("draven")).toBe("battlefield-bf1"); // not moved yet

    // Step 4 — only on resolution does the attacker go home.
    await game.settle();
    expect(game.locationOf("draven")).toBe("base");
    expect(game.locationOf("plain")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });

  test("choosing the un-Deflected attacker costs nothing", async () => {
    const game = await board({ rainbow: 2 }).build();
    await game.p2.move(["draven", "plain"], "bf1");
    await game.p1.yes();
    await game.p1.pick("plain");
    expect(game.p1.power("rainbow")).toBe(2);
    await game.settle();
    expect(game.locationOf("plain")).toBe("base");
    expect(game.locationOf("draven")).toBe("bf1");
  });

  test("an unpayable [Deflect] makes that unit an illegal choice: with only the Deflect attacker the ability cannot be used at all", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", OVERZEALOUS_FAN, "fan")
      .unit(P2, "base", DRAVEN_AUDACIOUS, "draven")
      .build(); // P1 has no Power at all
    await game.p2.move("draven", "bf1");

    // DESIGN (DESIGN.md §Paying costs = manual pay): the offer is still shown, but it cannot be accepted.
    expect(game.decision()).toMatchObject({ canAccept: false, kind: "yes-no", seat: P1 });
    const refused = await game.p1.try((p) => p.yes());
    expect(refused.ok).toBe(false);
    await game.p1.no();
    expect(game.zoneOf("fan")).toBe("battlefield-bf1"); // never killed
    expect(game.locationOf("draven")).toBe("bf1");
  });

  test("with a second, un-Deflected attacker present the unaffordable Deflect unit is simply not offered", async () => {
    const game = await board({}).build(); // no Power
    await game.p2.move(["draven", "plain"], "bf1");
    await game.p1.yes();
    // Only "plain" is affordable, so it is bound without a prompt and Draven is never a candidate.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fan", targets: ["plain"] })]);
    await game.settle();
    expect(game.locationOf("plain")).toBe("base");
    expect(game.locationOf("draven")).toBe("bf1");
  });

  // RULING-CONFLICT: riftjudge 3c4426cb3a2ee26f says the "kill me" is a cost-within-instruction paid only
  // at RESOLUTION; CR 204.3.a (which names Overzealous Fan) + 383.3.b say a "you may [kill me] to …"
  // trigger pays its BASE COST at finalization — engine follows CR.
  test("the 'kill me' cost is paid at FINALIZATION: the Fan is already in the trash before its target is chosen", async () => {
    const game = await board({ rainbow: 2 }).build();
    await game.p2.move(["draven", "plain"], "bf1");
    expect(game.zoneOf("fan")).toBe("battlefield-bf1");

    await game.p1.yes();
    expect(game.zoneOf("fan")).toBe("trash"); // paid on opt-in, before the target pick
    expect(game.decision()).toMatchObject({ kind: "pick", semantics: "target", timing: "FIN" });

    await game.p1.pick("draven");
    await game.settle();
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.locationOf("draven")).toBe("base");
  });

  test("declining the trigger leaves the Fan alive and every attacker in place", async () => {
    const game = await board({ rainbow: 2 }).build();
    await game.p2.move(["draven", "plain"], "bf1");
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fan")).toBe("battlefield-bf1");
    expect(game.locationOf("draven")).toBe("bf1");
    expect(game.p1.power("rainbow")).toBe(2);
  });
});
