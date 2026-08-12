/**
 * Core rules — THE MAKE RELEVANT CHOICES STEP (349 step 2 / 355.1–355.16 / 402.2).
 *
 * One question kept being re-argued per card: "is this choice made at
 * finalization (locked, 355.15 / 402.2) or at resolution (359.3.d)?" It has a
 * single answer, written up in `.claude/skills/riftbound-rules/DESIGN.md`
 * § "Choices and when they are made" and encoded once in
 * `game-definition/moves/play/make-choices.ts`:
 *
 *   A specific Game Object the item's own text tells its CONTROLLER to choose is
 *   chosen in this step and locked here. A choice reaches resolution ONLY via
 *   one of 355.10's closed carve-outs (a/b/c/d/e/f), 355.5.b, or 355.16.
 *
 * Rules covered (riftbound-rules ids):
 *   355.3        modes are chosen in this step
 *   355.4        one Move Destination per Move that will be performed
 *   355.5        specific Game Objects are chosen now …
 *   355.5.b      … except for triggers this item GENERATES (delayed / reflexive)
 *   355.8        no legal option for a required choice ⇒ not a legal play at all
 *   355.10.a/.a.1  a non-Public zone defers; TRASHES / bases / battlefields are Public
 *   355.10.d/.d.1  "all …" is programmatic; a fixed referent is no choice at all
 *   355.10.d.2   a SOLE legal option is still a choice — it is never auto-bound
 *   355.10.e     "each player chooses" defers, to that player
 *   355.10.f     an instruction a player "must" complete defers
 *   355.12       "you may <verb> a <descriptor>" defers the DECISION, not the object
 *   355.13       "up to N" / "any number" may be answered with zero, so it never gates
 *   355.14.b/.e  a split's recipients are chosen now; only the DIVISION waits
 *   355.16       a branch an earlier instruction of this resolution decides cannot pre-lock
 *   402.2/402.3  abilities finalize the same way; no legal option ⇒ not activatable
 *
 * CARD-INDEPENDENT except where a printed card is named — those cases quote the
 * real definition out of `@tcg/riftbound-cards`, because the whole point is that
 * printed cards stop needing bespoke handling.
 */

import { describe, expect, test } from "bun:test";
import {
  type ChoiceEntry,
  collectChoicePlan,
  collectNestedDescriptorSlots,
  gatingChoices,
  madeAtFinalization,
} from "../../game-definition/moves/play/make-choices";
import { P1, P2, scenario } from "../../harness";

/** A compact `kind@path=timing` rendering, so an assertion reads like the plan. */
const render = (plan: readonly ChoiceEntry[]): string[] =>
  plan.map((e) => `${e.kind}@${e.path === "" ? "." : e.path}=${e.timing}`);

const timingOf = (plan: readonly ChoiceEntry[], path: string, role = "target"): string | undefined =>
  plan.find((e) => e.path === path && e.role === role)?.timing;

describe("Make Choices — what is chosen now (355.5 / 402.2)", () => {
  test("a plain caster-chosen object is a FIN choice that gates the play (355.5, 355.8)", () => {
    const effect = { target: { controller: "enemy", location: "battlefield", type: "unit" }, type: "kill" };
    const plan = collectChoicePlan(effect);
    expect(render(plan)).toEqual(["target@.=FIN"]);
    expect(plan[0]?.rule).toBe("355.5");
    // rule 355.8 — a required choice with no legal option makes the play illegal.
    expect(gatingChoices(effect)).toHaveLength(1);
  });

  test('"all …" is programmatic, so it is no choice at all (355.10.d)', () => {
    const effect = {
      amount: -2,
      target: { controller: "enemy", location: "here", quantity: "all", type: "unit" },
      type: "modify-might",
    };
    const plan = collectChoicePlan(effect);
    expect(plan[0]?.timing).toBe("RES");
    expect(plan[0]?.rule).toBe("355.10.d");
    // …and it never gates the play: an empty board is no obstacle.
    expect(gatingChoices(effect)).toEqual([]);
  });

  test("a fixed referent (me / the triggering unit / a pending value) is no choice (355.10.d.1)", () => {
    for (const type of ["self", "trigger-source", "pending-value"]) {
      const plan = collectChoicePlan({ target: { type }, to: "base", type: "move" });
      expect(plan.find((e) => e.role === "target")?.rule).toBe("355.10.d.1");
    }
  });

  test('"up to N" / "any number" is chosen now but never gates (355.13)', () => {
    const effect = { target: { controller: "enemy", quantity: { upTo: 1 }, type: "unit" }, to: "here", type: "move" };
    const [entry] = collectChoicePlan(effect).filter((e) => e.role === "target");
    expect(entry?.kind).toBe("target-set");
    expect(entry?.timing).toBe("FIN");
    expect(entry?.optional).toBe(true);
    expect(entry?.cap).toBe(1);
    // rule 355.13 — zero is a legal answer, so it cannot make the play illegal.
    expect(entry?.gating).toBe(false);
  });

  test("a sole legal option is still a choice — nothing in the plan depends on how many candidates exist (355.10.d.2)", () => {
    // The plan is derived from the TEXT, never from the board, so it cannot
    // collapse "there happens to be only one" into a silent auto-bind. The
    // candidate count is applied by the raisers, which keep `soleOption: true`.
    const effect = { target: { controller: "friendly", type: "unit" }, type: "buff" };
    expect(collectChoicePlan(effect)).toEqual(collectChoicePlan(structuredClone(effect)));
    expect(madeAtFinalization(effect)).toHaveLength(1);
  });
});

describe("Make Choices — the closed list of deferrals (355.10)", () => {
  test("a non-Public zone defers to resolution, but a TRASH does not (355.10.a / 355.10.a.1)", () => {
    const fromHand = collectChoicePlan({ target: { location: "hand", type: "unit" }, type: "play" });
    expect(fromHand[0]?.timing).toBe("RES");
    expect(fromHand[0]?.rule).toBe("355.10.a");
    // rule 355.10.a.1 — trashes ARE Public, so "a spell in a trash" is a target
    // chosen at finalization like any board object (Drag Under, Forge of the Future).
    const fromTrash = collectChoicePlan({ target: { location: "trash", type: "spell" }, type: "recycle" });
    expect(fromTrash[0]?.timing).toBe("FIN");
    expect(fromTrash[0]?.rule).toBe("355.5");
  });

  test('"each player chooses" defers to that player (355.10.e)', () => {
    const plan = collectChoicePlan({ player: "each", target: { controller: "friendly", type: "unit" }, type: "kill" });
    expect(plan[0]?.timing).toBe("RES");
    expect(plan[0]?.rule).toBe("355.10.e");
  });

  test('an instruction a player "must" complete defers (355.10.f)', () => {
    const plan = collectChoicePlan({
      chooseAtResolution: true,
      target: { controller: "friendly", type: "rune" },
      type: "recycle",
    });
    expect(plan[0]?.timing).toBe("RES");
    expect(plan[0]?.rule).toBe("355.10.f");
  });

  test("a delayed / reflexive trigger this item generates makes its OWN choices later (355.5.b)", () => {
    const effect = {
      effects: [
        { target: { controller: "friendly", type: "unit" }, type: "buff" },
        {
          effect: { target: { controller: "enemy", type: "unit" }, type: "kill" },
          trigger: { event: "conquer", on: "self" },
          type: "delayed-trigger",
        },
      ],
      type: "sequence",
    };
    // Only the buff's own unit is named now; the delayed trigger's victim is not
    // in this item's plan at all.
    expect(render(collectChoicePlan(effect))).toEqual(["target@effects.0=FIN"]);
  });

  test("a branch this same resolution decides cannot pre-lock anything inside it (355.16)", () => {
    const effect = {
      condition: { type: "discarded-card-type" },
      then: { target: { controller: "enemy", type: "unit" }, type: "kill" },
      type: "conditional",
    };
    expect(collectChoicePlan(effect)).toEqual([]);
  });
});

describe("Make Choices — a split (355.14)", () => {
  const split = {
    amount: 3,
    split: true,
    target: { controller: "enemy", location: "here", type: "unit" },
    type: "damage",
  };

  test("the recipients are chosen at finalization; only the DIVISION waits (355.14.b vs 355.14.e)", () => {
    const plan = collectChoicePlan(split);
    // The recipients …
    expect(timingOf(plan, "")).toBe("FIN");
    // … and, strictly after every FIN entry, the amounts.
    expect(plan.at(-1)?.kind).toBe("split-amounts");
    expect(plan.at(-1)?.timing).toBe("RES");
    expect(plan.at(-1)?.rule).toBe("355.14.e");
  });
});

describe("Make Choices — plan ORDER (355.3 → 355.5 → 355.4)", () => {
  test("modes come first, then the objects, then the Move Destinations, then what resolution owns", () => {
    // "Choose one — - Kill an enemy unit. - Move a friendly unit."
    // plus a trailing split, so every kind is present at once.
    const effect = {
      effects: [
        {
          options: [
            { effect: { target: { controller: "enemy", type: "unit" }, type: "kill" } },
            { effect: { target: { controller: "friendly", type: "unit" }, to: "choose", type: "move" } },
          ],
          type: "choice",
        },
        { target: { controller: "friendly", type: "unit" }, to: "choose", type: "move" },
        { amount: 2, split: true, target: { controller: "enemy", type: "unit" }, type: "damage" },
      ],
      type: "sequence",
    };
    const kinds = collectChoicePlan(effect).map((e) => e.kind);
    expect(kinds[0]).toBe("mode");
    // Every object choice precedes every destination choice: rule 355.4 asks for
    // a destination "for each Move that WILL BE PERFORMED", which presupposes
    // the mover, so the object has to be named first.
    const lastTarget = kinds.lastIndexOf("target");
    const firstDestination = kinds.indexOf("destination");
    expect(firstDestination).toBeGreaterThan(lastTarget);
    // Everything resolution owns sorts last, whatever its kind.
    const timings = collectChoicePlan(effect).map((e) => e.timing);
    expect(timings.indexOf("RES")).toBe(timings.lastIndexOf("FIN") + 1);
  });

  test('a sequence\'s OWN anchor choice is in the plan ("Choose a battlefield … there …", 355.10.b)', () => {
    // unl-198-219 Moonfall's shape: the anchor every step reads is a choice of
    // the sequence itself, not of any one step.
    const effect = {
      effects: [
        { target: { controller: "enemy", quantity: { upTo: 1 }, type: "unit" }, to: "here", type: "move" },
        {
          amount: -2,
          target: { controller: "enemy", location: "here", quantity: "all", type: "unit" },
          type: "modify-might",
        },
      ],
      target: { filter: { hasFriendlyUnits: true }, type: "battlefield" },
      type: "sequence",
    };
    const plan = collectChoicePlan(effect);
    const anchor = plan.find((e) => e.descriptor?.type === "battlefield");
    expect(anchor).toBeDefined();
    expect(anchor?.timing).toBe("FIN");
    // rule 355.8 — with no battlefield where the caster has units there is no
    // legal choice, so the anchor gates the play.
    expect(anchor?.gating).toBe(true);
    // The "up to one" mover is chosen now too (355.12/355.13) but never gates.
    const mover = plan.find((e) => e.path === "effects.0");
    expect(mover?.timing).toBe("FIN");
    expect(mover?.gating).toBe(false);
    // The -2 is programmatic and asks nothing (355.10.d).
    expect(plan.find((e) => e.path === "effects.1")?.timing).toBe("RES");
  });
});

describe("Make Choices — a descriptor nested under `then` gets its own slot (355.5 / 355.12)", () => {
  // sfd-184-221 Relentless Pursuit: "Move a friendly unit. You may attach an
  // Equipment with the same controller to it. This turn, that unit has …"
  // Only ONE caster-chosen object could be named at play, so the Equipment had
  // no play-time slot and was picked at resolution.
  const relentlessPursuit = {
    target: { controller: "friendly", type: "unit" },
    then: {
      effects: [
        { equipment: { controller: "friendly", type: "equipment" }, holder: "bound", optional: true, type: "attach" },
        {
          duration: "turn",
          effect: { target: "self", to: "base", type: "move" },
          optional: true,
          trigger: { event: "conquer", on: "self" },
          type: "delayed-trigger",
        },
      ],
      type: "sequence",
    },
    to: "choose",
    type: "move",
  };

  test("the follow-up's Equipment is a second FIN choice, not a resolution-time pick", () => {
    const plan = collectChoicePlan(relentlessPursuit);
    const mover = plan.find((e) => e.path === "" && e.role === "target");
    const equipment = plan.find((e) => e.role === "equipment");
    expect(mover?.timing).toBe("FIN");
    expect(equipment).toBeDefined();
    expect(equipment?.timing).toBe("FIN");
    expect(equipment?.path).toBe("then.effects.0");
    // rule 355.5.b — the turn-scoped delayed trigger is NOT in this item's plan.
    expect(plan.some((e) => e.path.includes("effects.1"))).toBe(false);
  });

  test("the nested descriptor is surfaced as its own slot", () => {
    const slots = collectNestedDescriptorSlots(relentlessPursuit);
    expect(slots.map((s) => `${s.role}@${s.path}`)).toEqual(["equipment@then.effects.0"]);
  });

  test('rule 355.12 — "you may attach" defers the DECISION; the object is still a required choice', () => {
    // `optional: true` on an attach is the yes/no at resolution (383.3.a.3), not
    // an "up to N" set — so the Equipment still has to be NAMEABLE for the spell
    // to be playable at all (ruling 4283ca02526c0650).
    const equipment = collectChoicePlan(relentlessPursuit).find((e) => e.role === "equipment");
    expect(equipment?.multi).toBe(false);
    expect(gatingChoices(relentlessPursuit).map((e) => e.role)).toContain("equipment");
  });

  test("a follow-up that reads the move's DESTINATION stays at resolution (ruling 25b00b80ac336276)", () => {
    // ogn-258-298 Dragon's Rage — "Move an enemy unit. Then do this: choose
    // ANOTHER enemy unit at its destination." The follow-up's candidates are
    // whoever stands there when the spell resolves, so a response that
    // rearranges the board must still be able to change the pick.
    const dragonsRage = {
      target: { controller: "enemy", type: "unit" },
      then: { target: { controller: "enemy", location: "same", type: "unit" }, type: "damage" },
      to: "choose",
      type: "move",
    };
    expect(collectNestedDescriptorSlots(dragonsRage)).toEqual([]);
    expect(collectChoicePlan(dragonsRage).some((e) => e.path.startsWith("then"))).toBe(false);
  });
});

describe("Make Choices — the play-legality gate (355.8 / 402.3)", () => {
  test("exactly the required, made-now choices gate; optional and deferred ones never do", () => {
    const effect = {
      effects: [
        // required, made now → gates
        { target: { controller: "enemy", location: "battlefield", type: "unit" }, type: "stun" },
        // "up to 2" → 355.13, zero is legal → never gates
        { target: { controller: "friendly", quantity: { upTo: 2 }, type: "unit" }, type: "buff" },
        // programmatic → 355.10.d → never gates
        { target: { controller: "enemy", quantity: "all", type: "unit" }, type: "kill" },
        // another player's choice → 355.10.e → never gates
        { player: "each", target: { controller: "friendly", type: "unit" }, type: "kill" },
      ],
      type: "sequence",
    };
    expect(gatingChoices(effect).map((e) => e.path)).toEqual(["effects.0"]);
  });
});

// ===========================================================================
// The step in play: what the engine actually does with the plan
// ===========================================================================

/** Unit · 2 Might · "When you play me, deal 2 to an enemy unit at a battlefield." */
const PINGER = {
  abilities: [
    {
      effect: {
        amount: 2,
        target: { controller: "enemy", location: "battlefield", type: "unit" },
        type: "damage",
      },
      trigger: { event: "play-self", on: "self" },
      type: "triggered",
    },
  ],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 2,
  name: "Filler Pinger",
};

/** [Reaction] Move a friendly unit at a battlefield to base. */
const RETREAT = {
  abilities: [
    {
      effect: { target: { controller: "friendly", location: "battlefield", type: "unit" }, to: "base", type: "move" },
      timing: "reaction",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  keywords: ["Reaction"],
  name: "Filler Retreat",
  timing: "reaction",
};

/** Spell · "Kill an enemy unit at a battlefield." — one REQUIRED choice, nothing else. */
const EXECUTE = {
  abilities: [
    {
      effect: { target: { controller: "enemy", location: "battlefield", type: "unit" }, type: "kill" },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Filler Execute",
  timing: "action",
};

describe("355.10.d.2 — a sole legal option is still a choice, and it is a FIN choice", () => {
  test("one candidate raises the same prompt five would, flagged soleOption, before anyone gets priority", async () => {
    const game = await scenario()
      .interactive()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Lone" }, "lone")
      .hand(P1, PINGER, "ping")
      .build();
    await game.p1.play("ping", "base");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, soleOption: true, timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["lone"]);
    // rule 355.15 — the answer is locked here; nobody has held priority yet.
    expect(game.p2.can("passPriority")).toBe(false);
  });
});

describe("355.8 / 402.3 — no legal option for a required choice ⇒ absent from the offered set", () => {
  test("with no enemy unit at any battlefield the spell is not offered at all — it is never offered-then-rejected", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P2, "base", { might: 3, name: "Home" }, "home")
      .hand(P1, EXECUTE, "exec")
      .build();
    // rule 355.8 — the required choice has no valid answer, so there is no play.
    expect(game.p1.can("cast", "exec")).toBe(false);
    expect(game.p1.option("cast", "exec")).toBeUndefined();
  });

  test("rule 358.5 — a play refused for want of a legal choice leaves the state byte-identical", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P2, "base", { might: 3, name: "Home" }, "home")
      .hand(P1, EXECUTE, "exec")
      .build();
    const before = JSON.stringify(game.gameState);
    const attempt = await game.p1.try((p) => p.cast("exec", { targets: "home" }));
    expect(attempt.ok).toBe(false);
    // 358.5: "the actions taken in this process are undone and the action is
    // cancelled" — nothing about the attempt survives, not even a spent pip.
    expect(JSON.stringify(game.gameState)).toBe(before);
  });

  test('rule 355.13 — an "up to N" choice with no candidate never blocks the play: the item goes on the chain with an empty set', async () => {
    const upToPinger = {
      ...PINGER,
      abilities: [
        {
          effect: {
            amount: 1,
            target: { controller: "enemy", location: "battlefield", quantity: { upTo: 2 }, type: "unit" },
            type: "damage",
          },
          trigger: { event: "play-self", on: "self" },
          type: "triggered",
        },
      ],
      name: "Filler Up-To Pinger",
    };
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .hand(P1, upToPinger, "ping")
      .build();
    await game.p1.play("ping", "base");
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.p1.units("base")).toContain("ping");
    expect(game.violations()).toEqual([]);
  });
});

describe("355.15 / 358.1 / 359.3.e — a locked choice is re-CHECKED at resolution, never re-CHOSEN", () => {
  test("the chosen unit walks out of range in response: it is simply unaffected, no replacement is offered, and the item still resolves", async () => {
    const game = await scenario()
      .interactive()
      .resources(P2, { energy: 1, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Mark" }, "mark")
      .unit(P2, "bf1", { might: 3, name: "Spare" }, "spare")
      .hand(P1, PINGER, "ping")
      .hand(P2, RETREAT, "retreat")
      .build();
    await game.p1.play("ping", "base");
    // 355.5 / 402.2 — the choice is made now and locked (355.15).
    await game.p1.pick("mark");
    await game.p1.passPriority();
    // The chosen unit leaves the battlefield before the trigger resolves.
    await game.p2.cast("retreat", { targets: "mark" });
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.locationOf("mark")).toBe("base");
    // 359.3.e.2 / 359.3.e.5 — the target is illegal, so it is unaffected …
    expect(game.state("mark").damage).toBe(0);
    // … and 355.15 forbids a replacement: the spare standing right there is
    // never offered and never damaged.
    expect(game.state("spare").damage).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
