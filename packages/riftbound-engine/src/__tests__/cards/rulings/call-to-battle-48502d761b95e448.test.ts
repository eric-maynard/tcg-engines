/**
 * Ruling 48502d761b95e448 — Call to Battle (unl-101-219) · Spell · Body · 3
 *   "Move a unit you control to a battlefield you control. Then, choose an opponent. They move a unit
 *    they control to the same battlefield."
 *   × Flash (ogs-011-024) · Reaction · 2 · "Move up to 2 friendly units to base."
 *
 * Q: Can I choose a unit's CURRENT battlefield as Call to Battle's destination?
 * A: No. When a spell has the player choose a move destination, it must be a location other than the
 *    unit's current one (355.4, 355.4.a). If no valid destination exists for the chosen unit the spell
 *    cannot be finalized. Contrast Flash: it names its destination (base) instead of asking for one, so a
 *    unit already in base is still a valid Flash target.
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CALL_TO_BATTLE = "unl-101-219";
const FLASH = "ogs-011-024";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;
type PickD = Extract<Decision, { kind: "pick" }>;

/** Legal single-card `targets` values offered for casting `alias`. */
function targetChoices(game: Game, alias: string): string[][] {
  const f = game.p1.option("cast", alias)?.fields.find((x) => x.name === "targets");
  return (f?.options ?? []).map((v) => (Array.isArray(v) ? (v as string[]) : [v as string]));
}

/** Pass chain priority for whoever holds it until something else is being asked. */
async function passAll(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context !== "chain" || !d.passKey) {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

describe("Ruling 48502d761b95e448 — Call to Battle's chosen destination can't be the unit's current battlefield", () => {
  test("ruling 48502d761b95e448 — Scout at bf1 (P1 controls bf1/bf2/bf3): the destination choice offers only bf2 and bf3 — never bf1 (its current location) and never base; engine crashes resolving the move ('zone battlefield does not exist')", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .battlefield("bf3", { controller: P1 })
      .battlefield("theirs", { controller: P2 })
      .unit(P1, "bf1", { might: 3, name: "Scout" }, "scout")
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .hand(P1, CALL_TO_BATTLE, "ctb")
      .build();

    await game.p1.cast("ctb", { targets: "scout" });
    expect(game.p1.energy()).toBe(0);
    await passAll(game);
    // P1 CHOOSES the destination (355.4) ⇒ a real decision for P1 …
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const keys = (d as PickD).options.map((o) => o.key).sort();
    // … restricted to battlefields P1 controls other than Scout's current one (355.4.a): not bf1, not base, not P2's.
    expect(keys).toEqual(["battlefield-bf2", "battlefield-bf3"]);
    await game.p1.pick("battlefield-bf2");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("scout")).toBe("battlefield-bf2");
    expect(game.zoneOf("ctb")).toBe("trash");
  });

  test("ruling 48502d761b95e448 — if the only battlefield P1 controls IS the unit's current one, that unit has no valid destination and cannot be chosen (spell can't be finalized for it); a base unit still can; engine offers both", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("theirs", { controller: P2 })
      .unit(P1, "bf1", { might: 3, name: "Scout" }, "scout")
      .unit(P1, "base", { might: 2, name: "Reserve" }, "reserve")
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .hand(P1, CALL_TO_BATTLE, "ctb")
      .build();

    const choices = targetChoices(game, "ctb");
    expect(choices).toContainEqual(["reserve"]); // base → bf1 is a real move
    expect(choices).not.toContainEqual(["scout"]); // bf1 → bf1 is not (355.4.a)
    const r = await game.p1.try((p) => p.cast("ctb", { targets: "scout" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("ctb")).toBe("hand");
    expect(game.p1.energy()).toBe(3);

    // The legal line: Reserve is called from base to bf1 (the only battlefield P1 controls).
    await game.p1.cast("ctb", { targets: "reserve" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("reserve")).toBe("battlefield-bf1");
    expect(game.zoneOf("scout")).toBe("battlefield-bf1");
  });

  test("contrast — Flash names its destination (base), so no destination is chosen and a unit ALREADY in base is a valid target; it simply stays put", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Scout" }, "scout")
      .unit(P1, "base", { might: 2, name: "Reserve" }, "reserve")
      .hand(P1, FLASH, "flash")
      .build();

    const choices = targetChoices(game, "flash");
    expect(choices).toContainEqual(["reserve"]);
    expect(choices).toContainEqual(["scout"]);
    expect(choices).toContainEqual(["reserve", "scout"]);

    await game.p1.cast("flash", { targets: "reserve" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.zoneOf("reserve")).toBe("base");
    expect(game.zoneOf("scout")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
