/**
 * Interaction: Fox-Fire (ogn-256-298, Calm/Mind Action spell, 3)
 *     "Kill any number of units at a battlefield with total Might 4 or less."
 *   × Resonating Strike (ven-034-166, Calm Reaction spell, 2 + [calm])
 *     "Choose a battlefield you control and a unit you control at a different location.
 *      Move that unit to that battlefield and give it +2 [Might] this turn."
 *   × Flash (ogs-011-024, Chaos Reaction spell, 2) "Move up to 2 friendly units to base."
 *
 * Question: showdown at bf1. P2 has four 1-[M] Recruits there and also controls bf2. P1 plays
 * Fox-Fire choosing all four (total 4).
 *   (a) P2 Resonating-Strikes ONE Recruit to bf2 with +2 [M] — the original group is now
 *       3 + 1 + 1 + 1 = 6 spread over two battlefields. When Fox-Fire resolves, what may P1 kill?
 *       Can P1 reach the relocated 3-[M] Recruit at bf2, and can P1 MIX it with Recruits at bf1?
 *   (b) P2 instead Flashes TWO of the Recruits to P2's base — the total is still 4. Are those two
 *       still killable?
 *
 * Rules: 355.11 / 355.11.a (a group target whose restriction is met collectively at finalization),
 * 355.11.b (if the group no longer collectively qualifies on resolution the controller chooses a
 * subset of the ORIGINAL targets that does; units never chosen can't be added; units that LEFT the
 * chosen battlefield may still be affected "as long as those units are all located at the same
 * battlefield" — the rule's own example is literally Fox-Fire), 355.10.b ("at a battlefield" is a
 * targeting restriction on the units), 359.3.e.2 (a target that changed zones/no longer meets the
 * requirements is illegal on resolution), 359.3.e.5 (illegal targets are simply unaffected).
 *
 * Expected: (a) the subset prompt offers exactly the four original targets; the legal subsets are any
 * group of the three Recruits still at bf1 (≤ 3 total), OR the relocated 3-[M] Recruit ALONE at bf2 —
 * never a mix of the two battlefields, and never a bf1 unit that was not originally chosen.
 * (b) a base is not a battlefield, so the two flashed Recruits fall out entirely; the two left at bf1
 * total 2 ≤ 4, so no subset prompt is raised at all and exactly those two die.
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FOX_FIRE = "ogn-256-298";
const RESONATING_STRIKE = "ven-034-166";
const FLASH = "ogs-011-024";

const GROUP = ["rA", "rB", "rC", "rD"];

/**
 * P1's turn. P2 holds bf1 with four 1-[M] Recruits plus an un-chosen 1-[M] Spare, and bf2 with a
 * 5-[M] Anchor (so bf2 stays P2's). P1's 6-[M] Raider walks into bf1 to open the showdown.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 4, power: { calm: 1, chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Recruit A" }, "rA")
    .unit(P2, "bf1", { might: 1, name: "Recruit B" }, "rB")
    .unit(P2, "bf1", { might: 1, name: "Recruit C" }, "rC")
    .unit(P2, "bf1", { might: 1, name: "Recruit D" }, "rD")
    .unit(P2, "bf1", { might: 1, name: "Spare" }, "spare")
    .unit(P2, "bf2", { might: 5, name: "Anchor" }, "anchor")
    .unit(P1, "base", { might: 6, name: "Raider" }, "raider")
    .hand(P1, FOX_FIRE, "ff")
    .hand(P2, RESONATING_STRIKE, "res")
    .hand(P2, FLASH, "flash");
}

/** Both seats pass once each, so the newest chain item resolves (340.1). */
async function resolveTop(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
}

/** Open the showdown at bf1 and put Fox-Fire on the chain naming all four Recruits. */
async function foxFireAtFour(game: Game): Promise<void> {
  await game.p1.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("ff", { targets: GROUP });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ff", controller: P1, targets: GROUP })]);
  await game.p1.passPriority();
}

/** P2's reaction resolves, then Fox-Fire is left alone on the chain and resolves in turn. */
async function reactThenResolveFoxFire(game: Game, spell: string, targets: string | string[]): Promise<void> {
  await game.p2.cast(spell, { targets });
  await resolveTop(game); // the reaction
  expect(game.chain().map((i) => i.cardId)).toEqual(["ff"]);
  await resolveTop(game); // Fox-Fire
}

const subsetOptions = (game: Game) => ((game.decision() as PickDecision)?.options ?? []).map((o) => o.card ?? o.key).sort();

describe("Fox-Fire 355.11.b re-pick — a sideways move keeps a target reachable, a move to base does not", () => {
  test("setup: the four 1-[M] Recruits (total 4) are a legal Fox-Fire group in the showdown; adding the 5th unit at bf1 would be 5 and is refused", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    const sets = (game.p1.option("cast", "ff")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];
    expect(sets.map((s) => [...s].sort().join("+"))).toContain("rA+rB+rC+rD");
    const over = await game.p1.try((p) => p.cast("ff", { targets: [...GROUP, "spare"] }));
    expect(over.ok).toBe(false);
  });

  // ---- (a) Resonating Strike: a sideways move to another battlefield ---------------------------

  test("(a) the Strike resolves first: one Recruit is at bf2 at 3 [M], so the original group is 3+1+1+1 = 6 over two battlefields while Fox-Fire still waits", async () => {
    const game = await board().build();
    await foxFireAtFour(game);
    await game.p2.cast("res", { targets: "rA" });
    await resolveTop(game);
    expect(game.locationOf("rA")).toBe("bf2");
    expect(game.state("rA").might).toBe(3);
    expect(GROUP.filter((c) => game.locationOf(c) === "bf1")).toEqual(["rB", "rC", "rD"]);
    expect(game.chain().map((i) => i.cardId)).toEqual(["ff"]);
  });

  test("(a) on resolution Fox-Fire's controller is asked for a subset of the ORIGINAL targets — 'spare' at bf1 is never offered (355.11.b)", async () => {
    const game = await board().build();
    await foxFireAtFour(game);
    await reactThenResolveFoxFire(game, "res", "rA");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "subset", timing: "RES" });
    expect(subsetOptions(game)).toEqual(GROUP);
    expect(subsetOptions(game)).not.toContain("spare");
  });

  test("(a) the whole 6-[M] group is refused — the subset must still total 4 or less (355.11.a/355.11.b)", async () => {
    const game = await board().build();
    await foxFireAtFour(game);
    await reactThenResolveFoxFire(game, "res", "rA");
    const all = await game.p1.try((p) => p.pick(...GROUP));
    expect(all.ok).toBe(false);
  });

  test("(a) legal option 1 — all three Recruits still at bf1 (1+1+1 = 3): those die, the relocated 3-[M] Recruit survives at bf2", async () => {
    const game = await board().build();
    await foxFireAtFour(game);
    await reactThenResolveFoxFire(game, "res", "rA");
    await game.p1.pick("rB", "rC", "rD");
    expect(game.zoneOf("rB")).toBe("trash");
    expect(game.zoneOf("rC")).toBe("trash");
    expect(game.zoneOf("rD")).toBe("trash");
    expect(game.zoneOf("rA")).toBe("battlefield-bf2");
    expect(game.zoneOf("spare")).toBe("battlefield-bf1");
    expect(game.zoneOf("ff")).toBe("trash"); // Fox-Fire does not fizzle
  });

  test("(a) legal option 2 — the RELOCATED Recruit alone at bf2 (3 [M]): it is reachable even though it left the chosen battlefield (355.11.b last sentence)", async () => {
    const game = await board().build();
    await foxFireAtFour(game);
    await reactThenResolveFoxFire(game, "res", "rA");
    expect(subsetOptions(game)).toContain("rA");
    await game.p1.pick("rA");
    expect(game.zoneOf("rA")).toBe("trash");
    for (const c of ["rB", "rC", "rD", "spare"]) {
      expect(game.zoneOf(c)).toBe("battlefield-bf1");
    }
  });

  test("(a) a subset drawn only from bf1 is fine at any size within the cap — {rB, rC} kills two and leaves rD", async () => {
    const game = await board().build();
    await foxFireAtFour(game);
    await reactThenResolveFoxFire(game, "res", "rA");
    await game.p1.pick("rB", "rC");
    expect(game.zoneOf("rB")).toBe("trash");
    expect(game.zoneOf("rC")).toBe("trash");
    expect(game.zoneOf("rD")).toBe("battlefield-bf1");
    expect(game.zoneOf("rA")).toBe("battlefield-bf2");
  });

  // Expected (355.11.b, final sentence): units that left the chosen battlefield may be affected only
  // "as long as those units are all located at the same battlefield" — the relocated rA (bf2) and any
  // Recruit still at bf1 can never be in one subset, even though 3 + 1 = 4 respects the Might cap.
  // Actual: the engine validates only the total Might and accepts the cross-battlefield mix, killing both.
  test(
    "mixing the relocated bf2 Recruit with a bf1 Recruit is accepted — a 355.11.b subset must be all at ONE battlefield",
    async () => {
      const game = await board().build();
      await foxFireAtFour(game);
      await reactThenResolveFoxFire(game, "res", "rA");
      const mixed = await game.p1.try((p) => p.pick("rA", "rB"));
      expect(mixed.ok).toBe(false);
    },
  );

  test(
    "after the illegal mix the bf1 Recruit must still be alive — a cross-battlefield subset kills nothing extra (355.11.b)",
    async () => {
      const game = await board().build();
      await foxFireAtFour(game);
      await reactThenResolveFoxFire(game, "res", "rA");
      const mixed = await game.p1.try((p) => p.pick("rA", "rB"));
      expect(mixed.ok).toBe(false);
      expect(game.zoneOf("rB")).toBe("battlefield-bf1");
    },
  );

  test("(a) declining the subset entirely is legal — nothing dies and Fox-Fire still goes to the trash (355.13)", async () => {
    const game = await board().build();
    await foxFireAtFour(game);
    await reactThenResolveFoxFire(game, "res", "rA");
    expect(game.decision()).toMatchObject({ allowDecline: true, min: 0 });
    await game.p1.pick();
    for (const c of [...GROUP, "spare"]) {
      expect(game.zoneOf(c)).not.toBe("trash");
    }
    expect(game.zoneOf("ff")).toBe("trash");
  });

  // ---- (b) Flash: a move to base ----------------------------------------------------------------

  test("(b) Flash sends two Recruits to P2's base; the total is still 4 but a base is not a battlefield", async () => {
    const game = await board().build();
    await foxFireAtFour(game);
    await game.p2.cast("flash", { targets: ["rA", "rB"] });
    await resolveTop(game);
    expect(game.locationOf("rA")).toBe("base");
    expect(game.locationOf("rB")).toBe("base");
    expect(game.state("rA").might).toBe(1);
    expect(game.state("rB").might).toBe(1);
    expect(game.chain().map((i) => i.cardId)).toEqual(["ff"]);
  });

  test("(b) NO subset prompt is raised: the two Recruits left at bf1 total 2 ≤ 4, so the legal remainder still qualifies collectively", async () => {
    const game = await board().build();
    await foxFireAtFour(game);
    await reactThenResolveFoxFire(game, "flash", ["rA", "rB"]);
    expect(game.decision()?.kind).toBe("action");
    expect((game.decision() as { semantics?: string }).semantics).toBeUndefined();
  });

  test("(b) the two flashed Recruits are NOT killable — they are unaffected in P2's base while the two at bf1 die (355.10.b, 359.3.e.2/e.5)", async () => {
    const game = await board().build();
    await foxFireAtFour(game);
    await reactThenResolveFoxFire(game, "flash", ["rA", "rB"]);
    expect(game.zoneOf("rA")).toBe("base");
    expect(game.zoneOf("rB")).toBe("base");
    expect(game.zoneOf("rC")).toBe("trash");
    expect(game.zoneOf("rD")).toBe("trash");
    expect(game.zoneOf("spare")).toBe("battlefield-bf1");
    expect(game.zoneOf("ff")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(b) contrast with (a): a sideways move keeps a target reachable, a move to base removes it from every legal subset", async () => {
    const sideways = await board().build();
    await foxFireAtFour(sideways);
    await reactThenResolveFoxFire(sideways, "res", "rA");
    expect(subsetOptions(sideways)).toContain("rA"); // still choosable, alone, at bf2

    const home = await board().build();
    await foxFireAtFour(home);
    await reactThenResolveFoxFire(home, "flash", ["rA", "rB"]);
    expect(home.decision()?.kind).toBe("action"); // nothing to re-pick at all
    expect(home.zoneOf("rA")).toBe("base");
  });
});
