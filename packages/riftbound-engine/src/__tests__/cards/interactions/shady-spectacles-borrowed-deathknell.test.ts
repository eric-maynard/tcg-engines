/**
 * Interaction: Shady Spectacles (ven-137-166) Gear · [Equip] [1][order] · "As this is attached to a unit, choose another
 *   friendly unit. The equipped unit becomes a copy of that unit for as long as this is attached to it."
 *   × Ruined Rex (unl-067-219) 6 Might · "[Deathknell] Deal 4 to an enemy unit."
 *   × Angle Shot (sfd-011-221) 2 energy Reaction · "Choose a unit and an Equipment with the same controller. Attach that
 *     Equipment to that unit or detach that Equipment from that unit. Draw 1."
 *
 * Question: P1 equips Shady Spectacles onto a vanilla unit H choosing friendly Ruined Rex, so H "becomes a copy of" Rex
 * while attached. H is then killed (kill spell or combat).
 *   (a) Does H's borrowed Deathknell trigger although the Spectacles fall off once H leaves the board? — YES. The copy
 *       lives in the trait layer and includes Rex's rules text (477.1.b.1 / 808.3). Abilities that trigger on their
 *       own source's death go on the chain as a Pending Item BEFORE the unit is moved to the trash, noting its
 *       attributes at that moment (428.1.a.1.b / 808.1.d.2 / 808.1.d.3) — Spectacles still attached ⇒ H has Deathknell.
 *       P1 finalizes it at an enemy unit: 4 damage. Spectacles end up unattached in base (457.1); H is its printed self
 *       in the trash.
 *   (b) If P2 answers the kill spell with Angle Shot (it may pick P1's pair — "same controller", not "friendly")
 *       detaching the Spectacles first? — NO trigger. Angle Shot resolves first; "for as long as this is attached" ends
 *       immediately, so when the kill resolves H has no Deathknell.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHADY_SPECTACLES = "ven-137-166";
const RUINED_REX = "unl-067-219";
const ANGLE_SHOT = "sfd-011-221";
const VENGEANCE = "ogn-229-298"; // 4 + [order][order]: Kill a unit. — the kill spell

/**
 * P1's turn. P1: vanilla 3-Might Host + Ruined Rex in base, Shady Spectacles (unattached), Vengeance in hand and
 * 5 energy + 3 order (Equip 1+[order], Vengeance 4+[order][order]). P2: a single 5-Might Victim in base (the only
 * enemy unit → a Deathknell target is forced), Angle Shot in hand with exactly 2 energy.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { order: 3 } })
    .resources(P2, { energy: 2 })
    .unit(P1, "base", { might: 3, name: "Host" }, "host")
    .unit(P1, "base", RUINED_REX, "rex")
    .unit(P2, "base", { might: 5, name: "Victim" }, "victim")
    .gear(P1, SHADY_SPECTACLES, "specs")
    .hand(P1, VENGEANCE, "vengeance")
    .hand(P2, ANGLE_SHOT, "angleShot");
}

/** Activate [Equip] onto Host, let it resolve, and choose Rex as the model if asked (a lone candidate is auto-bound). */
async function equipHostCopyingRex(game: Game) {
  await game.p1.choose("equipCard:-", { params: { equipmentId: "specs", unitId: "host" } });
  await game.settle();
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick("rex");
    await game.settle();
  }
}

/** After a settle, answer a pending Deathknell target prompt (if the engine asks rather than auto-binding). */
async function answerDeathknellTarget(game: Game, target: string) {
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick(target);
    await game.settle();
  }
}

describe("Shady Spectacles × Ruined Rex × Angle Shot — a borrowed Deathknell", () => {
  test("setup: while the Spectacles are attached, Host IS Ruined Rex — name, 6 Might, rules text incl. [Deathknell] (477.1.b.1 / 808.3)", async () => {
    const game = await board().build();
    await equipHostCopyingRex(game);
    expect(game.state("specs").attachedTo).toBe("host");
    expect(game.state("host")).toMatchObject({ attachments: ["specs"], baseMight: 6, might: 6, name: "Ruined Rex" });
    expect(game.state("host").keywords).toContain("Deathknell");
    expect(game.state("rex")).toMatchObject({ might: 6, name: "Ruined Rex" }); // the model is untouched
    expect(game.p1.resources()).toEqual({ energy: 4, power: { order: 2 } }); // Equip cost 1 + [order]
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("control: the REAL Ruined Rex killed by Vengeance → its Deathknell deals 4 to the (only) enemy unit", async () => {
    const game = await board().build();
    await game.p1.cast("vengeance", { targets: "rex" });
    await game.settle();
    await answerDeathknellTarget(game, "victim");
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.state("victim").damage).toBe(4);
    expect(game.chain()).toEqual([]);
  });

  // ================================================================ (a) the borrowed Deathknell fires
  test("(a) kill spell — Host dies wearing the Spectacles, so its copied Deathknell triggers (noted BEFORE it leaves, 428.1.a.1.b / 808.1.d.2-3) and deals 4 to the enemy Victim", async () => {
    // Expected: Vengeance kills Host; at that moment Host is still a copy of Rex, so "[Deathknell] Deal 4 to an enemy
    // unit" pends, P1 finalizes it at Victim (forced — the only enemy unit) and Victim ends on 4 damage.
    // Actual: Host goes to the trash and nothing triggers — Victim stays on 0 damage.
    const game = await board().build();
    await equipHostCopyingRex(game);
    await game.p1.cast("vengeance", { targets: "host" });
    await game.settle();
    await answerDeathknellTarget(game, "victim");
    expect(game.zoneOf("host")).toBe("trash");
    expect(game.state("victim").damage).toBe(4);
    expect(game.chain()).toEqual([]);
  });

  test("(a) aftermath: the Spectacles sit unattached in P1's base and the dead Host is its printed self again (3-Might 'Host', no Deathknell) in the trash", async () => {
    const game = await board().build();
    await equipHostCopyingRex(game);
    await game.p1.cast("vengeance", { targets: "host" });
    await game.settle();
    await answerDeathknellTarget(game, "victim");
    expect(game.zoneOf("host")).toBe("trash");
    expect(game.state("host")).toMatchObject({ baseMight: 3, name: "Host" });
    expect(game.state("host").keywords).not.toContain("Deathknell");
    expect(game.zoneOf("specs")).toBe("base");
    expect(game.state("specs").attachedTo).toBeUndefined();
    expect(game.state("rex")).toMatchObject({ location: "base", name: "Ruined Rex" }); // model unaffected
  });

  test("(a) combat — the 6-Might copy attacks a 7-Might Wall and dies in combat: Deathknell still triggers, P1 aims it at an enemy unit for 4; Spectacles recalled to base (457.1)", async () => {
    // Expected: Host (as Rex, 6) dies to the Wall (7 ≥ 6); its Deathknell pends before it leaves, P1 picks Victim → 4
    // damage. Actual: Host dies, Spectacles are recalled correctly, but no Deathknell is ever put on the chain.
    const game = await scenario()
      .resources(P1, { energy: 1, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 7, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 3, name: "Host" }, "host")
      .unit(P1, "base", RUINED_REX, "rex", { exhausted: true })
      .unit(P2, "base", { might: 5, name: "Victim" }, "victim")
      .gear(P1, SHADY_SPECTACLES, "specs")
      .build();
    await equipHostCopyingRex(game);
    expect(game.state("host")).toMatchObject({ isExhausted: false, might: 6, name: "Ruined Rex" });
    await game.p1.move("host", "bf1");
    await game.settle();
    await answerDeathknellTarget(game, "victim"); // two enemy units (Wall, Victim) → P1 chooses
    expect(game.zoneOf("host")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-bf1"); // 6 < 7
    expect(game.zoneOf("specs")).toBe("base");
    expect(game.state("specs").attachedTo).toBeUndefined();
    expect(game.state("victim").damage).toBe(4);
  });

  // ================================================================ (b) Angle Shot strips the copy first
  test("(b) Angle Shot is a legal Reaction for P2 in response to Vengeance and may name P1's OWN pair [Host, Spectacles] ('same controller', not 'friendly'); it stacks on top", async () => {
    const game = await board().build();
    await equipHostCopyingRex(game);
    await game.p1.cast("vengeance", { targets: "host" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "angleShot")).toBe(true);
    const pairs = game.p2.option("cast", "angleShot")?.fields.find((f) => f.name === "targets")?.options;
    expect(pairs).toEqual(expect.arrayContaining([["host", "specs"]]));
    await game.p2.cast("angleShot", { targets: ["host", "specs"] });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain().map((i) => i.cardId)).toEqual(["vengeance", "angleShot"]);
    expect(game.chain()[1]).toMatchObject({ controller: P2, targets: ["host", "specs"] });
  });

  test("(b) Angle Shot resolves FIRST and detaches the Spectacles: the copy ends at once — Host is a 3-Might 'Host' with no Deathknell while still on the board; P2 draws 1", async () => {
    // Expected: after Angle Shot resolves (Vengeance still on the chain) specs.attachedTo is cleared, the Spectacles
    // stay in base, and Host has reverted (477.1.b "for as long as this is attached"). Actual: the draw happens but
    // the detach silently does nothing for this [Equip] gear — Spectacles stay attached and Host is still "Ruined Rex".
    const game = await board().build();
    await equipHostCopyingRex(game);
    await game.p1.cast("vengeance", { targets: "host" });
    await game.p1.passPriority();
    await game.p2.cast("angleShot", { targets: ["host", "specs"] });
    const p2Hand = game.p2.hand().length;
    await game.p2.passPriority();
    await game.p1.passPriority(); // Angle Shot (top) resolves; Vengeance still pending
    expect(game.chain().map((i) => i.cardId)).toEqual(["vengeance"]);
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.zoneOf("angleShot")).toBe("trash");
    expect(game.state("specs").attachedTo).toBeUndefined();
    expect(game.zoneOf("specs")).toBe("base");
    expect(game.state("host")).toMatchObject({ attachments: [], baseMight: 3, location: "base", might: 3, name: "Host" });
    expect(game.state("host").keywords).not.toContain("Deathknell");
  });

  test("(b) …then Vengeance kills a plain Host: no Deathknell exists to trigger — nothing goes on the chain, Victim takes no damage", async () => {
    // Expected: Spectacles already detached (precondition), Host dies as printed "Host", chain empties with no trigger,
    // Victim on 0 damage. Actual: the precondition fails — Angle Shot never detached the Spectacles (see above).
    const game = await board().build();
    await equipHostCopyingRex(game);
    await game.p1.cast("vengeance", { targets: "host" });
    await game.p1.passPriority();
    await game.p2.cast("angleShot", { targets: ["host", "specs"] });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("specs").attachedTo).toBeUndefined(); // the reason the answer is "no"
    await game.settle({ policy: "first" }); // if a Deathknell prompt wrongly appeared, "first" would aim it somewhere
    expect(game.zoneOf("host")).toBe("trash");
    expect(game.state("host")).toMatchObject({ baseMight: 3, name: "Host" });
    expect(game.chain()).toEqual([]);
    expect(game.state("victim").damage).toBe(0);
    expect(game.state("rex")).toMatchObject({ damage: 0, location: "base" });
    expect(game.zoneOf("specs")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
