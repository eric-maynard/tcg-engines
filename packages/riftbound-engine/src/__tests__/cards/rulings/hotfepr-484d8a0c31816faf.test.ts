/**
 * Ruling 484d8a0c31816faf — (terminology) what does HOT FEPR stand for?
 *
 * Q: What does HOTFEPR mean?
 * A: "Handle Outstanding Tasks", then Finalize, Execute, Pass, Resolve — the loop the game runs while a
 *    chain is live. Whenever tasks are outstanding the FEPR loop is PAUSED until they have been handled.
 *    (Patch Notes 2026-03-30.)
 * Rules: 336 (the chain procedure), 337 Step 1 Finalize (337.1.a finalizing passes no priority; 337.4 the
 *        controller of the next item then gains priority), 338 Step 2 Execute, 339 Step 3 Pass,
 *        340 Step 4 Resolve (340.4 back to Execute), 320/321 (outstanding tasks are handled first).
 *
 * The acronym is not a game object, so what is asserted here is the procedure it names, step by step.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ASSAILANT = "sfd-002-221"; // [Weaponmaster] — raises an Outstanding Task when played
const DIRK = "sfd-009-221"; // [Equip] [fury]
const RELENTLESS_STORM = "ogn-249-298"; // "When you play a [Mighty] unit, you may exhaust me to channel 1"

/** [Reaction] "Deal 1 to a unit." */
const STING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Sting",
  rulesText: "[Reaction] Deal 1 to a unit.",
  timing: "reaction",
} as const;

/** [Action] "Give a unit +2 [Might] this turn." */
const RALLY = {
  abilities: [
    {
      effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Rally",
  rulesText: "[Action] Give a unit +2 [Might] this turn.",
  timing: "action",
} as const;

describe("Ruling 484d8a0c31816faf — HOT FEPR: Handle Outstanding Tasks, then Finalize / Execute / Pass / Resolve", () => {
  test("HOT — while a task is outstanding the loop is paused: only the task's owner may act, and only to answer it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 2 } })
      .gear(P1, DIRK, "dirk")
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .hand(P1, ASSAILANT, "aa")
      .hand(P1, STING, "sting")
      .hand(P2, STING, "psting")
      .build();
    await game.p1.play("aa");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 }); // an Outstanding Task
    // FEPR is paused: nobody plays anything, nobody passes anything
    expect(game.p1.can("cast", "sting")).toBe(false);
    expect(game.p2.can("cast", "psting")).toBe(false);
    expect(game.p2.isActing()).toBe(false);
    await game.p1.pick("dirk"); // task handled
    await game.settle();
    expect(game.state("dirk").attachedTo).toBe("aa");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("F — Finalize runs before anyone gets priority: a triggered item's question is asked first, and finalizing passes no priority", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .legend(P1, RELENTLESS_STORM, "storm")
      .hand(P1, { cardType: "unit", energyCost: 3, might: 5, name: "Test Titan" }, "titan")
      .hand(P2, STING, "psting")
      .build();
    await game.p1.play("titan");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    expect(game.p2.isActing()).toBe(false); // 337.1.a — finalizing did not pass priority
    await game.p1.yes();
    // E — Execute: only now does someone hold priority on the chain
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1, timing: "ACT" });
  });

  test("E / P / R — with priority you may add an item; passing in sequence resolves exactly the top one, then the loop restarts at Execute", async () => {
    const game = await scenario()
      .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
      .hand(P1, RALLY, "rally")
      .hand(P1, STING, "sting")
      .hand(P2, STING, "psting")
      .build();
    // E: the Focus/turn player executes
    await game.p1.cast("rally", { targets: "ally" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.cast("sting", { targets: "ally" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["rally", "sting"]);
    // P: passing hands priority on; only when everyone has passed in sequence…
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ seat: P2 });
    await game.p2.cast("psting", { targets: "ally" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["rally", "sting", "psting"]); // a new item resets the sequence
    await game.p2.passPriority();
    await game.p1.passPriority();
    // R: exactly the newest item resolved…
    expect(game.state("ally").damage).toBe(1);
    expect(game.chain().map((i) => i.cardId)).toEqual(["rally", "sting"]);
    // …and the loop went back to Execute with the controller of the newest remaining item (340.4)
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("ally").damage).toBe(2);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("ally").might).toBe(5);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("HOT again mid-loop: a task raised while the chain is live pauses it — priority is not offered until it is answered", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 2 } })
      .gear(P1, DIRK, "dirk")
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .hand(P1, ASSAILANT, "aa")
      .hand(P2, STING, "psting")
      .build();
    await game.p1.do("equipCard", { equipmentId: "dirk", unitId: "squire" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["dirk"]); // a live chain
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("dirk").attachedTo).toBe("squire");
    await game.p1.play("aa");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(game.p2.can("cast", "psting")).toBe(false);
    await game.p1.decline();
    await game.settle();
    expect(game.violations()).toEqual([]);
  });
});
