/**
 * Ruling 39db0a58377752b1 — Veteran Poro (SFD-099 → sfd-099-221) · 2 energy · 2 Might ·
 *   "[Weaponmaster] (When you play me, you may [Equip] one of your Equipment to me for [rainbow] less,
 *   even if it's already attached.)"
 *   × Doran's Shield (SFD-033 → sfd-033-221, [Equip] [calm], +1) × Serrated Dirk (SFD-009 → sfd-009-221,
 *   [Equip] [fury], grants [Assault 2]).
 *
 * Q: Can a [Weaponmaster] unit equip several gears at the reduced cost (e.g. two or three 1-power
 *    equipments for free)?
 * A: No. One instance of [Weaponmaster] lets you choose ONE Equipment and use its [Equip] ability once,
 *    a [rainbow] cheaper. Several instances of the keyword would each trigger and each choose one — but
 *    a single instance is a single choice. (No printed unit carries two instances, so the multi-instance
 *    half of the answer is stated, not exercised.)
 * Rules: 821.1 ([Weaponmaster]: choose one of your Equipment; cost reduced by [rainbow]), 821.1.c
 *        (only that one Equip cost is shaved), 383 (one trigger per instance).
 */
import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../../harness";
import { P1, scenario } from "../../../harness";

const VETERAN_PORO = "sfd-099-221";
const DORANS_SHIELD = "sfd-033-221";
const SERRATED_DIRK = "sfd-009-221";

const board = () =>
  scenario()
    .resources(P1, { energy: 2 })
    .gear(P1, DORANS_SHIELD, "shield")
    .gear(P1, SERRATED_DIRK, "dirk")
    .hand(P1, VETERAN_PORO, "poro");

describe("Ruling 39db0a58377752b1 — one [Weaponmaster] instance equips exactly one Equipment", () => {
  test("the trigger offers BOTH equipments but takes at most ONE (max = 1, and declining is legal)", async () => {
    const game = await board().build();
    await game.p1.play("poro");
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", min: 0, seat: P1, semantics: "equip" });
    expect(d.max).toBe(1);
    expect((d.options.map((o) => o.card ?? o.key) as string[]).sort()).toEqual(["dirk", "shield"]);
  });

  test("picking the Shield attaches only the Shield: no second prompt, the Dirk stays loose, and P1 is back in their main phase", async () => {
    const game = await board().build();
    await game.p1.play("poro", { answers: ["shield"] });
    await game.settle();
    expect(game.state("shield").attachedTo).toBe("poro");
    expect(game.state("dirk").attachedTo).toBeUndefined();
    expect(game.state("poro").attachments).toEqual(["shield"]);
    expect(game.state("poro").might).toBe(3); // 2 + the Shield's +1 only
    expect(game.state("poro").keywords).not.toContain("Assault"); // the Dirk never attached
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("the free ride does not extend to the second gear: with the pool emptied the Dirk's own [Equip] is not on offer", async () => {
    const game = await board().build();
    await game.p1.play("poro", { answers: ["shield"] });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    // Its printed [Equip] still costs [fury], which P1 cannot pay — so no equipCard option exists.
    expect(game.p1.legal().some((o) => o.moveId === "equipCard")).toBe(false);
    expect(game.state("dirk").attachedTo).toBeUndefined();
    expect(game.violations()).toEqual([]);
  });

  test("two picks are not accepted even when asked for at once", async () => {
    const game = await board().build();
    await game.p1.play("poro");
    const both = await game.p1.try((p) => p.pick("shield", "dirk"));
    expect(both.ok).toBe(false);
  });
});
