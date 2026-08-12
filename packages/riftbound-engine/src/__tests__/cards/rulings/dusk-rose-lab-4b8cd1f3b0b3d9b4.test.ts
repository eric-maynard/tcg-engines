/**
 * Ruling 4b8cd1f3b0b3d9b4 — Dusk Rose Lab (UNL-209 → unl-209-219) · battlefield
 *   "At the start of your Beginning Phase, you may kill a unit you control here to draw 1.
 *    (This happens before scoring.)"
 *   × a [Temporary] unit at that battlefield ("Kill this at the start of its controller's Beginning
 *     Phase, before scoring.")
 *
 * Q: Do my [Temporary] units die before I get to use Dusk Rose Lab?
 * A: No. Both trigger at the same moment, you control both, so you get to spend the [Temporary] unit
 *    as the Lab's cost first; the [Temporary] trigger then finds nothing to kill and does nothing.
 * Rules: 816.1.c ([Temporary] kill at the start of the Beginning Phase), 383.3.d (you order your own
 *        simultaneous triggers), 383.3.b / 204.3.a (a "you may [kill X] to …" pays at finalization).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DUSK_ROSE_LAB = "unl-209-219";

/** P2 is the turn player; P1 controls Dusk Rose Lab with a [Temporary] unit and a plain unit on it. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1, def: DUSK_ROSE_LAB, inert: false })
    .unit(P1, "bf1", { keywords: ["Temporary"], might: 2, name: "Temp" }, "temp")
    .unit(P1, "bf1", { might: 3, name: "Solid" }, "solid");
}

const chainIds = (game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>) =>
  game.chain().map((c) => c.cardId);

describe("Ruling 4b8cd1f3b0b3d9b4 — the [Temporary] unit can still be spent on Dusk Rose Lab", () => {
  test("both triggers arrive together at the start of P1's Beginning Phase, and the Lab's kill cost takes the Temporary unit", async () => {
    const game = await board().build();
    expect(game.p1.hand()).toHaveLength(0);
    await game.p2.endTurn();

    // 1. Both are on the Chain — the [Temporary] kill and the Lab — and it is still the Beginning Phase.
    expect(game.phase()).toBe("beginning");
    expect(chainIds(game).sort()).toEqual(["bf1", "temp"]);
    expect(game.zoneOf("temp")).toBe("battlefield-bf1"); // nothing has died yet

    // 2. The Lab offers its optional ability, then asks which unit pays the kill.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "bf1" }, timing: "FIN" });
    await game.p1.yes();
    const pick = game.decision();
    expect(pick).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1, timing: "FIN" });
    expect((pick as { options: { card?: string }[] }).options.map((o) => o.card).sort()).toEqual(["solid", "temp"]);
    await game.p1.pick("temp");

    // 3. The [Temporary] unit is spent as the cost — it dies to the LAB, not to its own trigger.
    expect(game.zoneOf("temp")).toBe("trash");

    // 4. P1 is offered the order of their two simultaneous triggers (383.3.d, a soft offer).
    expect(game.decision()).toMatchObject({ defaultable: true, kind: "order", seat: P1 });
    await game.acceptTriggerOrder();

    await game.settle();
    // 5. The draw happened; the [Temporary] trigger had nothing left to do; the plain unit survived.
    expect(game.p1.hand().length).toBeGreaterThanOrEqual(1);
    expect(game.zoneOf("solid")).toBe("battlefield-bf1");
    expect(game.zoneOf("temp")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("the Lab really draws: exactly one extra card compared with declining it", async () => {
    const declined = await board().build();
    await declined.p2.endTurn();
    await declined.p1.no(); // do not use the Lab
    await declined.settle();
    const withoutLab = declined.p1.hand().length;
    expect(declined.zoneOf("temp")).toBe("trash"); // killed by its own [Temporary] trigger instead

    const used = await board().build();
    await used.p2.endTurn();
    await used.p1.yes();
    await used.p1.pick("temp");
    await used.acceptTriggerOrder();
    await used.settle();
    expect(used.p1.hand().length).toBe(withoutLab + 1);
  });

  test("the Lab may also eat the non-Temporary unit — then the [Temporary] trigger still kills the Temporary one", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.p1.yes();
    await game.p1.pick("solid");
    expect(game.zoneOf("solid")).toBe("trash");
    await game.settle();
    expect(game.zoneOf("temp")).toBe("trash"); // its own trigger finished the job
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
