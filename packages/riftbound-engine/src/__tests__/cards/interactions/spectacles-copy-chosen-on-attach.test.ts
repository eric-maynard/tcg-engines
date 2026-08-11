/**
 * Interaction: Shady Spectacles (ven-137-166) · Gear · Order · 4 energy
 *     "[Equip] [1][order] ([1][order]: Attach this to a unit you control.)
 *      As this is attached to a unit, choose another friendly unit. The equipped unit becomes a
 *      copy of that unit for as long as this is attached to it."
 *   × Gust (ogn-169-298) · [Reaction] spell · "Return a unit at a battlefield with 3 [Might] or
 *      less to its owner's hand."
 *   × Janna, Savior (sfd-053-221) · [Reaction] unit · 3 + [calm] · "When you play me, heal your
 *      units here, then move up to one enemy unit from here to its base."
 *
 * Rules: 402.2 + 355.5 / 355.7 (an ability's choices — its targets — are made as it is
 * FINALIZED; the [Equip] ability chooses only the unit it attaches to), 355.5.b (choices that
 * belong to a *different* ability are not made now), 370.1.b.1 ("As this is attached … choose"
 * is the gear's own as-attached replacement: it hangs off the ATTACH event, so nothing about
 * the copy source exists on the Equip chain item), 355.15 (a finalized choice can't be changed
 * later — which is exactly why locking the copy source at activation would be wrong),
 * 359.3.e.5 / 359.3.e.12 (an object that left the board is not affected and reads as null).
 *
 * Question: P1 controls Shady Spectacles (unattached), host H at bf1 and a 2-Might unit M at
 * bf1; P2 holds Gust, P1 holds Janna, Savior. P1 activates [Equip] [1][order] on H.
 *   (a) At activation, what is targeted — only H, or also the copy source? Does a copy-source
 *       Decision surface then?
 *   (b) P2 Gusts M back to P1's hand; P1 answers with Janna to bf1. When the Equip finally
 *       resolves and attaches, when does the copy-source Decision surface, who chooses, and
 *       what is offered — is M offered, is Janna, is H itself?
 *   (c) NO side: with no other friendly unit at attach time, does the attach still happen, and
 *       does a friendly unit arriving one instruction LATER retroactively become the source?
 *   (d) The losing timing: M must never be locked in at activation (it would either be copied
 *       from hand or fizzle the Equip).
 *
 * Expected: (a) only H — the copy source is the gear's as-attached choice, decided nowhere on
 * the Equip item. (b) at the attach, chooser = P1, options = friendly units other than H at
 * that instant = {Janna, spare}; M is absent (in hand), H excluded by "another"; H becomes a
 * copy of Janna's PRINTED traits and keeps its own damage/buff. (c) the attach still happens
 * with no copy and no prompt, and a later arrival changes nothing. (d) M is never the source
 * and the Equip never fizzles.
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPECTACLES = "ven-137-166";
const GUST = "ogn-169-298";
const JANNA = "sfd-053-221";

/** P1: host + M at bf1, a spare in base, Spectacles unattached, Janna in hand. P2 holds Gust. */
function board(opts: { spare?: boolean } = {}) {
  const { spare = true } = opts;
  let s = scenario()
    .resources(P1, { energy: 5, power: { calm: 2, order: 2 } })
    .resources(P2, { energy: 3, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 5, name: "Host" }, "host", { buffed: true, damage: 1 })
    .unit(P1, "bf1", { might: 2, name: "M" }, "m")
    .gear(P1, SPECTACLES, "specs")
    .hand(P1, JANNA, "janna")
    .hand(P2, GUST, "gust");
  if (spare) {
    s = s.unit(P1, "base", { might: 1, name: "Spare" }, "spare");
  }
  return s;
}

/** The copy-source pick, if that is what is being asked right now. */
function copyPick(game: Game): PickDecision | undefined {
  const d = game.decision();
  return d?.kind === "pick" && d.source?.cardId === "specs" ? d : undefined;
}

const offeredCards = (d: PickDecision): string[] => [...d.options.map((o) => o.card ?? o.key)].sort();

/** Activate [Equip] on `unitId` (no `equip` verb: the move is `equipCard`). */
async function activateEquip(game: Game, unitId: string): Promise<void> {
  await game.p1.choose("equipCard:-", { params: { equipmentId: "specs", unitId } });
}

describe("Shady Spectacles — the copy source is chosen at the ATTACH, not at the Equip activation", () => {
  // ── (a) activation ────────────────────────────────────────────────────────────────────────

  test("(a) the [Equip] ability's only choice is the unit it attaches to: the move takes equipmentId + unitId and nothing else, and only units P1 controls are offered", async () => {
    const game = await board().build();
    const fields = game.p1.option("equipCard")?.fields ?? [];
    expect(fields.map((f) => f.name).sort()).toEqual(["equipmentId", "unitId"]);
    expect([...(fields.find((f) => f.name === "unitId")?.options ?? [])].sort()).toEqual(["host", "m", "spare"]);
  });

  test("(a) at activation the copy source is NOT decided: one chain item, no pick of any kind — P1 simply holds priority (402.2 / 355.5.b)", async () => {
    const game = await board().build();
    await activateEquip(game, "host");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "specs", controller: P1, triggered: false })]);
    expect(copyPick(game)).toBeUndefined();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    // Nothing has attached and nothing has been copied yet.
    expect(game.state("specs").attachedTo).toBeUndefined();
    expect(game.state("host")).toMatchObject({ baseMight: 5, name: "Host" });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { calm: 2, order: 1 } });
  });

  // ── (b) the chain resolves in reverse; the choice is made at the attach ────────────────────

  test("(b) M is Gusted away and Janna arrives before the Equip resolves — the copy-source pick surfaces only THEN, belongs to P1, and offers {janna, spare}: M is gone, H is excluded by 'another'", async () => {
    const game = await board().build();
    await activateEquip(game, "host");
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "m" });
    await game.p2.passPriority();
    await game.p1.play("janna", { to: "bf1" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["specs", "gust", "janna"]);

    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const pick = copyPick(game);
    expect(pick).toBeDefined();
    expect(pick?.seat).toBe(P1);
    expect(game.zoneOf("m")).toBe("hand"); // Gust already resolved
    expect(offeredCards(pick as PickDecision)).toEqual(["janna", "spare"]);
    expect(offeredCards(pick as PickDecision)).not.toContain("m");
    expect(offeredCards(pick as PickDecision)).not.toContain("host");
  });

  test("(b) picking Janna makes H a copy of her PRINTED traits (name, 3 Might, cost 3 + calm) while keeping its own buff; Janna herself is untouched and her 'when you play me' does not re-fire on H", async () => {
    const game = await board().build();
    await activateEquip(game, "host");
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "m" });
    await game.p2.passPriority();
    await game.p1.play("janna", { to: "bf1" });
    await game.settle();
    await game.p1.pick("janna");
    const end = await game.settle();

    expect(end.reason).toBe("open");
    expect(game.state("host")).toMatchObject({
      attachments: ["specs"],
      baseMight: 3,
      // Janna resolved BEFORE the Equip and her "heal your units here" cleared H's damage —
      // the copy itself never touches statuses (the buff below is still H's own).
      damage: 0,
      energyCost: 3,
      isBuffed: true,
      location: "bf1",
      might: 4, // 3 printed + its own buff
      name: "Janna, Savior",
    });
    expect(game.state("janna")).toMatchObject({ baseMight: 3, damage: 0, location: "bf1", name: "Janna, Savior" });
    expect(game.state("specs").attachedTo).toBe("host");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(d) the losing timing is not taken: M — chosen-able at activation, in HAND at attach time — is never the copy source, and the Equip does not fizzle for it", async () => {
    const game = await board().build();
    await activateEquip(game, "host");
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "m" });
    await game.p2.passPriority();
    await game.p1.play("janna", { to: "bf1" });
    await game.settle();
    await expect(game.p1.pick("m")).rejects.toThrow(); // M is not on the menu at all
    await game.p1.pick("spare");
    await game.settle();
    expect(game.zoneOf("m")).toBe("hand");
    expect(game.state("host")).toMatchObject({ baseMight: 1, name: "Spare" }); // copied the spare, not M
    expect(game.state("specs").attachedTo).toBe("host"); // the Equip resolved: no fizzle
    expect(game.zoneOf("specs")).toBe("battlefield-bf1");
  });

  // ── (c) the NO side ───────────────────────────────────────────────────────────────────────

  test("(c) no other friendly unit at attach time: the attach still happens, nothing is asked, and H keeps its own traits", async () => {
    const game = await board({ spare: false }).build();
    await activateEquip(game, "host");
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "m" }); // H is P1's only unit once M is in hand
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(copyPick(game)).toBeUndefined();
    expect(game.state("specs").attachedTo).toBe("host");
    expect(game.state("host")).toMatchObject({ baseMight: 5, might: 6, name: "Host" });
  });

  test("(c) the choice is made once, at the attachment: a friendly unit arriving one instruction later is NOT retroactively the copy source", async () => {
    const game = await board({ spare: false }).build();
    await activateEquip(game, "host");
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "m" });
    await game.settle();
    expect(game.state("host").name).toBe("Host");

    await game.p1.play("janna", { to: "bf1" }); // arrives AFTER the attach
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(copyPick(game)).toBeUndefined();
    expect(game.state("host")).toMatchObject({ baseMight: 5, name: "Host" });
    expect(game.state("specs").attachedTo).toBe("host");
    expect(game.violations()).toEqual([]);
  });
});
