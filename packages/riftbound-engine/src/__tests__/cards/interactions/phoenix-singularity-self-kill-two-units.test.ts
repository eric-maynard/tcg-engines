/**
 * Interaction: Immortal Phoenix (ogn-037-298) × Singularity (ogn-105-298)
 *
 *   Immortal Phoenix — Unit · Fury · 3 + [fury] · 3 Might
 *     "[Assault 2] … When you kill a unit with a spell, you may pay [1][fury] to play me from
 *      your trash."
 *   Singularity — Spell · Mind · 6 + [mind][mind]
 *     "Deal 6 to each of up to two units."
 *
 * Question: P1 has Immortal Phoenix ON THE BOARD and casts Singularity choosing its own Phoenix
 * and an enemy 4-Might unit; both die in the Cleanup. (a) Does the trash-zone trigger fire even
 * though Phoenix was on the board when the spell was cast and was itself one of the kills?
 * (b) Two units were killed — how many triggers, and when is [1][fury] paid? No side: a combat
 * kill, or an OPPONENT's spell killing Phoenix.
 *
 * Expected (rules):
 *  - Kills from a spell's damage Cleanup are attributed to that spell and its controller
 *    (428.5.c, 428.5.c.1). A zone-specific trigger that enters its zone simultaneously with its
 *    condition being met DOES trigger — 383.2.c.1 uses exactly this Phoenix example. → (a) yes.
 *  - "When you kill a unit" met twice → two separate triggers (it is not an "Nth time" trigger,
 *    383.1.b does not merge them). "you may pay [1][fury]" is the ability's cost, paid when the
 *    trigger is finalized onto the chain; either may be declined. One payment suffices; a second
 *    paid trigger resolves with Phoenix no longer in the trash and does nothing.
 *  - The ability is only active in the trash (385.2): a Phoenix that stays on the board does not
 *    trigger. Combat kills are attributed to combat-damage sources, not a spell (428.5.c.2) → no
 *    trigger. An opponent's spell kill is "they kill", not "you kill" → no trigger for P1.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const PHOENIX = "ogn-037-298";
const SINGULARITY = "ogn-105-298";

/** Flatten the `targets` field of the cast option into the set of card ids offered. */
function targetsOffered(game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>, alias: string): string[] {
  const opt = game.p1.option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** P1's turn: Phoenix (3) in P1's base, enemy 4-Might at bf1, Singularity in hand, 6+[mind][mind] for it plus 2+[fury][fury] spare. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { mind: 2, fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", PHOENIX, "phoenix")
    .unit(P2, "bf1", { might: 4, name: "Foe" }, "foe")
    .hand(P1, SINGULARITY, "sing");
}

describe("Immortal Phoenix × Singularity — killing your own Phoenix with your spell", () => {
  test("Singularity may choose your own Phoenix together with the enemy unit; 6 damage kills both (3 and 4 Might)", async () => {
    const game = await board().build();
    const offered = targetsOffered(game, "sing");
    expect(offered).toContain(game.card("phoenix"));
    expect(offered).toContain(game.card("foe"));
    await game.p1.cast("sing", { targets: ["phoenix", "foe"] });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 0, fury: 2 } });
    await game.settle(); // stops at the Phoenix opt-in prompt (if any) — both units are already dead by then
    expect(game.zoneOf("foe")).toBe("trash");
    expect(["trash", "base"]).toContain(game.zoneOf("phoenix")); // dead (trash) unless already replayed
    expect(game.zoneOf("sing")).toBe("trash");
  });

  test("(a) Phoenix killed by YOUR spell triggers from the trash it just entered (383.2.c.1): P1 is asked to pay [1][fury]; paying at finalization puts the ability on the chain and it resolves playing Phoenix to base", async () => {
    const game = await board().build();
    await game.p1.cast("sing", { targets: ["phoenix", "foe"] });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.zoneOf("phoenix")).toBe("trash"); // it is in the trash when the trigger is evaluated
    await game.p1.yes();
    // Cost is paid as the triggered ability is finalized — before it resolves.
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 0, fury: 1 } });
    expect(game.chain().some((i) => i.cardId === "phoenix" && i.triggered)).toBe(true);
    expect(game.zoneOf("phoenix")).toBe("trash");
    // Let it resolve; decline any further (second-kill) prompt — one payment is sufficient.
    let next = await game.settle();
    if (next.reason === "unanswered" && game.decision()?.kind === "yes-no") {
      await game.p1.no();
      next = await game.settle();
    }
    expect(next.reason).toBe("open");
    expect(game.zoneOf("phoenix")).toBe("base");
    expect(game.p1.units("base")).toContain("phoenix");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 0, fury: 1 } });
  });

  // Expected: two units killed by the spell → two independent "When you kill a unit with a spell"
  // triggers; declining the first still leaves the second to accept. Actual: the engine raises a
  // single opt-in prompt; after declining it the turn is simply open and Phoenix stays in the trash.
  test.failing("BUG: (b) two kills → TWO Phoenix triggers; declining the first and paying for the second still replays Phoenix (383.1.b a contrario)", async () => {
    const game = await board().build();
    await game.p1.cast("sing", { targets: ["phoenix", "foe"] });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no(); // decline trigger #1 → removed, nothing paid
    expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 0, fury: 2 } });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 }); // trigger #2
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 0, fury: 1 } });
    await game.settle();
    expect(game.zoneOf("phoenix")).toBe("base");
  });

  test("(b) declining every prompt leaves Phoenix in the trash and spends nothing beyond Singularity", async () => {
    const game = await board().build();
    await game.p1.cast("sing", { targets: ["phoenix", "foe"] });
    let r = await game.settle();
    while (r.reason === "unanswered" && game.decision()?.kind === "yes-no" && game.decision()?.seat === P1) {
      await game.p1.no();
      r = await game.settle();
    }
    expect(r.reason).toBe("open");
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 0, fury: 2 } });
  });

  // Expected: the ability self-describes its zone ("play me from your trash") and is only active
  // there (385.2). A Phoenix that survives on the board while your spell kills something else does
  // not trigger. Actual: the engine raises the pay-[1][fury] prompt for the on-board Phoenix.
  test.failing("BUG: control — Phoenix left ALIVE on the board does not trigger when Singularity kills only the enemy (385.2: trash-only ability)", async () => {
    const game = await board().build();
    await game.p1.cast("sing", { targets: ["foe"] });
    const r = await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("phoenix")).toBe("base");
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1, context: "main" });
  });

  test("no side: Phoenix dying in COMBAT alongside its kill is not 'killed with a spell' — no prompt, Phoenix stays in the trash (428.5.c.2)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", PHOENIX, "phoenix")
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall") // 3+Assault 2 = 5 kills Wall; Wall's 5 kills Phoenix
      .build();
    await game.p1.move("phoenix", "bf1");
    const r = await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(r.reason).toBe("open");
    expect(game.decision()?.kind).toBe("action");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 2 } });
  });

  // Expected: "When YOU kill a unit with a spell" — an opponent's Singularity killing P1's Phoenix is
  // the opponent's kill (428.5.c.1), so P1's Phoenix does not trigger. Actual: P1 is prompted to pay
  // [1][fury] and may replay Phoenix off the opponent's kill.
  test.failing("BUG: no side — an OPPONENT's Singularity killing Phoenix does not trigger it for P1 ('you kill', 428.5.c.1)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2, power: { fury: 2 } })
      .resources(P2, { energy: 6, power: { mind: 2 } })
      .unit(P1, "base", PHOENIX, "phoenix")
      .hand(P2, SINGULARITY, "sing")
      .build();
    await game.p2.cast("sing", { targets: ["phoenix"] });
    const r = await game.settle();
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ kind: "action", seat: P2, context: "main" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 2 } });
  });
});
