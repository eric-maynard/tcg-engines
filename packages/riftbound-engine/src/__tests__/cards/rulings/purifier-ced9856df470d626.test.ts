/**
 * Ruling ced9856df470d626 — Purifier (SFD-183 → sfd-183-221, Lucian legend) "Your Equipment each give [Assault]."
 *   × Veteran Poro (SFD-099 → sfd-099-221) 2 Might · × Kato the Arm (SFD-112 → sfd-112-221) 3 Might "[Deflect] When I move
 *     to a battlefield, give another friendly unit my keywords and +[Might] equal to my Might this turn."
 *   × Serrated Dirk (SFD-009 → sfd-009-221) Equipment "[Assault 2]" · × Doran's Blade (SFD-095 → sfd-095-221) Equipment +2
 *   × Punch First (SFD-097 → sfd-097-221) "Give a unit +5 [Might] this turn."
 *
 * Q: Purifier legend. Poro wears a Dirk; Kato wears a Dirk + Doran's Blade and has had Punch First. I move both to a
 *    battlefield to attack — what Might do they have?
 * A: Kato 14 = 3 + 2 (Doran's) + 5 (Punch First) + 3 (Dirk: Assault 2 + Purifier's Assault) + 1 (Doran's: Purifier's
 *    Assault). Poro 15 = 2 + 3 (Dirk: Assault 2 + 1) + 10 from Kato's trigger — Kato's Might is snapshotted at 10 when
 *    the move trigger resolves (Assault only counts in combat), and that +10 lasts the turn.
 * Rules: 719 (Equipment confer), 803 (Assault while attacking), Kato's move trigger (snapshot on resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PURIFIER = "sfd-183-221";
const VETERAN_PORO = "sfd-099-221";
const KATO_THE_ARM = "sfd-112-221";
const SERRATED_DIRK = "sfd-009-221";
const DORANS_BLADE = "sfd-095-221";
const PUNCH_FIRST = "sfd-097-221";

/**
 * P1 (legend Purifier), exactly [1] + [body][body] for Punch First. In base: Veteran Poro wearing a Serrated Dirk; Kato the
 * Arm wearing a Serrated Dirk and a Doran's Blade. P2 holds bf1 with a 40-Might Wall (so the showdown can be inspected
 * before anything dies).
 */
function board() {
  return scenario()
    .legend(P1, PURIFIER, "purifier")
    .resources(P1, { energy: 1, power: { body: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 40, name: "Wall" }, "wall")
    .unit(P1, "base", VETERAN_PORO, "poro", { equippedWith: ["dirk1"] })
    .card("dirk1", { def: SERRATED_DIRK, meta: { attachedTo: "poro" }, owner: P1, zone: "base" })
    .unit(P1, "base", KATO_THE_ARM, "kato", { equippedWith: ["dirk2", "dorans"] })
    .card("dirk2", { def: SERRATED_DIRK, meta: { attachedTo: "kato" }, owner: P1, zone: "base" })
    .card("dorans", { def: DORANS_BLADE, meta: { attachedTo: "kato" }, owner: P1, zone: "base" });
}

/** Punch First on Kato, then move Kato + Poro to bf1 together; resolve Kato's move trigger (onto the Poro); stop in the showdown. */
async function attackTogether(): Promise<Game> {
  const game = await board().hand(P1, PUNCH_FIRST, "punch").build();
  await game.p1.cast("punch", { targets: "kato" });
  await game.settle();
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  await game.p1.move(["kato", "poro"], "bf1");
  // Kato's "when I move to a battlefield" is on the chain; the Poro is the only other friendly unit.
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kato", triggered: true })]);
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("poro");
  }
  await game.p1.passPriority();
  await game.p2.passPriority(); // trigger resolves
  expect(game.chain()).toEqual([]);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  expect(game.state("kato").combatRole).toBe("attacker");
  expect(game.state("poro").combatRole).toBe("attacker");
  return game;
}

describe("Ruling ced9856df470d626 — Purifier + equipped Kato & Poro attacking together", () => {
  test("at rest: Kato = 3 + 2 (Doran's) = 5, and 10 after Punch First; the Poro is 2 (a Dirk gives no flat Might) — Assault is not counted outside combat", async () => {
    const game = await board().hand(P1, PUNCH_FIRST, "punch").build();
    expect(game.state("kato")).toMatchObject({ attachments: ["dirk2", "dorans"], baseMight: 3, might: 5 });
    expect(game.state("poro")).toMatchObject({ attachments: ["dirk1"], baseMight: 2, might: 2 });
    expect(game.state("kato").keywords).toEqual(expect.arrayContaining(["Deflect", "Assault"]));
    expect(game.state("poro").keywords).toContain("Assault");
    await game.p1.cast("punch", { targets: "kato" });
    await game.settle();
    expect(game.state("kato").might).toBe(10);
  });

  test("Kato's move trigger snapshots his Might at 10 (3 + 2 + 5, no Assault yet) — that is the +Might the Poro receives for the turn", async () => {
    const game = await board().hand(P1, PUNCH_FIRST, "punch").build();
    await game.p1.cast("punch", { targets: "kato" });
    await game.settle();
    await game.p1.move(["kato", "poro"], "bf1");
    expect(game.state("kato").might).toBe(10); // while his trigger waits on the chain
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("poro");
    }
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("poro").mightModifier).toBe(10);
  });

  test("Kato attacking: 3 + 2 + 5 + (Dirk Assault 2 + Purifier 1) + (Doran's Purifier 1) = 14", async () => {
    const game = await attackTogether();
    expect(game.state("kato").might).toBe(14);
  });

  // Expected (ruling): Poro attacking = 2 + 3 (its own Dirk: Assault 2 + Purifier's 1) + 10 (Kato's snapshot) = 15.
  // Actual: 17 — resolving "give another friendly unit my keywords" the engine also copies Kato's equipment-conferred
  // [Assault 2] (and Deflect) onto the Poro, so the Poro attacks with Assault 5 instead of 3.
  test("ruling ced9856df470d626 — engine makes the Poro 15 (Kato's Dirk-conferred Assault is not one of 'my keywords')", async () => {
    const game = await attackTogether();
    expect(game.state("poro").might).toBe(15);
  });

  test("the Assault part is attacker-only: had the pair stayed home (no combat), Kato would read 10 and the Poro 2 — the +3/+1 equipment Assault only shows while attacking", async () => {
    const game = await board().hand(P1, PUNCH_FIRST, "punch").build();
    await game.p1.cast("punch", { targets: "kato" });
    await game.settle();
    expect(game.state("kato")).toMatchObject({ combatRole: null, might: 10 });
    expect(game.state("poro")).toMatchObject({ combatRole: null, might: 2 });
    expect(game.violations()).toEqual([]);
  });
});
