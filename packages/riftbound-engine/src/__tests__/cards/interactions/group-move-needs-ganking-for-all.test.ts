/**
 * Interaction: Commander Ledros (ogn-231-298) — "[Ganking] (I can move from battlefield to
 *     battlefield.)"
 *   × Sunlit Guardian (ogn-054-298) — no [Ganking].
 *
 * One group Standard Move, two units with different permissions:
 *   (a) Ledros at bfA + Guardian in base, both to bfB — legal, and what is exhausted?
 *   (b) both at bfA, both to bfB — legal? (the client's toast blames the DESTINATION)
 *   (c) may one action send Ledros to bfB and the Guardian to base?
 *   (d) which of them may Standard Move while a chain is open?
 *
 * Rules covered (riftbound-rules ids):
 *   144.1.a / 144.1.b   the Standard Move is a Main-Phase action and cannot be done in a Closed State
 *   144.3               several units' Standard Moves are ONE game action
 *   144.3.a / 144.3.b   one shared DESTINATION; the ORIGINS need not match
 *   144.3.c             the exhaust costs are paid simultaneously
 *   144.4 / .a / .b     base→battlefield and battlefield→base are the only licensed destinations…
 *   144.4.c.1 / 810.1.b …battlefield→battlefield needs [Ganking]
 *   810.1.c             [Ganking] ADDS permissions to the Standard Move; it changes nothing else
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const COMMANDER_LEDROS = "ogn-231-298";
const SUNLIT_GUARDIAN = "ogn-054-298";

/** [Action] "Deal 1 to a unit." — used only to open a chain (Closed State) for facet (d). */
const PING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Filler Ping",
  timing: "action",
};

/** P1's Main Phase. Ledros at bfA, the Guardian wherever the facet needs it, a beacon at bfB. */
function board(guardianAt: "base" | "bfA") {
  return scenario()
    .turn(4)
    .active(P1)
    .resources(P1, { energy: 10, power: { calm: 5, order: 5 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P1 })
    .unit(P1, "bfA", COMMANDER_LEDROS, "ledros")
    .unit(P1, guardianAt, SUNLIT_GUARDIAN, "guardian")
    .unit(P1, "bfB", { might: 1, name: "Beacon" }, "beacon");
}

type G = Awaited<ReturnType<ReturnType<typeof board>>["build"]>;

/** The unit SETS the Standard Move offers for one destination (empty when the destination is not offered). */
function movableSetsTo(game: G, destination: string): string[][] {
  const opt = game.p1.legal().find((o) => o.key === `standardMove:to:${destination}`);
  const field = opt?.fields.find((f) => f.name === "unitIds");
  return ((field?.options ?? []) as string[][]).map((s) => [...s].sort());
}

describe("group Standard Move — [Ganking] is needed by EVERY unit in the group", () => {
  test("(a) base + bfA → bfB in ONE action is legal: the origins need not match (144.3 / 144.3.b / 144.4.a)", async () => {
    const game = await board("base").build();

    // The pair is offered as one set for the shared destination.
    expect(movableSetsTo(game, "bfB")).toContainEqual(["guardian", "ledros"]);

    await game.p1.move(["ledros", "guardian"], "bfB");
    expect(game.locationOf("ledros")).toBe("bfB");
    expect(game.locationOf("guardian")).toBe("bfB");
    // 144.2 / 144.3.c — both paid the exhaust, together.
    expect(game.state("ledros").isExhausted).toBe(true);
    expect(game.state("guardian").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("(a) it really is ONE game action — a single undo takes both units back, both ready (144.3 / 144.3.c)", async () => {
    const game = await board("base").build();
    await game.p1.move(["ledros", "guardian"], "bfB");

    expect(game.undo()).toBe(true);
    expect(game.locationOf("ledros")).toBe("bfA");
    expect(game.locationOf("guardian")).toBe("base");
    expect(game.state("ledros").isExhausted).toBe(false);
    expect(game.state("guardian").isExhausted).toBe(false);
  });

  test("(b) both at bfA → bfB is ILLEGAL, and it is the GUARDIAN that makes it so: bfB is offered, just not to a set containing it (144.4.c.1 / 810.1.b)", async () => {
    const game = await board("bfA").build();

    // The destination is perfectly available — Ledros alone is offered for it.
    expect(movableSetsTo(game, "bfB")).toEqual([["ledros"]]);
    // …and no set containing the Guardian appears for that destination.
    expect(movableSetsTo(game, "bfB").some((s) => s.includes("guardian"))).toBe(false);

    const group = await game.p1.try((p) => p.move(["ledros", "guardian"], "bfB"));
    expect(group.ok).toBe(false);
    expect(game.locationOf("ledros")).toBe("bfA"); // nothing half-moved
    expect(game.locationOf("guardian")).toBe("bfA");
    expect(game.state("ledros").isExhausted).toBe(false); // 144.3.c — no half-paid cost

    // Ledros alone is fine; the Guardian's own battlefield→battlefield move is not, either as a
    // Standard Move or as a Ganking Move it does not have.
    expect((await game.p1.try((p) => p.gank("guardian", "bfB"))).ok).toBe(false);
    await game.p1.move("ledros", "bfB");
    expect(game.locationOf("ledros")).toBe("bfB");
  });

  test("(b) battlefield→base is licensed for BOTH of them, so the Guardian is not simply immobile (144.4.b)", async () => {
    const game = await board("bfA").build();
    expect(movableSetsTo(game, "base")).toContainEqual(["guardian", "ledros"]);
    await game.p1.move(["ledros", "guardian"], "base");
    expect(game.locationOf("ledros")).toBe("base");
    expect(game.locationOf("guardian")).toBe("base");
  });

  test.failing("BUG: the refusal blames nothing — it must name Sunlit Guardian and the missing [Ganking], not the destination (144.4.c.1 / 810)", async () => {
    const game = await board("bfA").build();
    const group = await game.p1.try((p) => p.move(["ledros", "guardian"], "bfB"));
    expect(group.ok).toBe(false);
    // Expected: "Sunlit Guardian has no [Ganking], so it can't move battlefield-to-battlefield."
    // Actual: `no legal variant matches units=["ledros","guardian"], to="bfB"` — which reads as a
    // claim about bfB, the one thing that is fine.
    const message = (group as { error: { message: string } }).error.message;
    expect(message).toContain("Sunlit Guardian");
    expect(message).toContain("Ganking");
  });

  test("(c) one group move takes exactly ONE shared destination — splitting needs two actions, each paying its own exhaust (144.3.a)", async () => {
    const game = await board("bfA").build();

    // The destination is part of the action's identity: every offered Standard Move is keyed by a
    // single destination, and no option carries a per-unit destination field.
    const moves = game.p1.legal().filter((o) => o.verb === "move");
    expect(moves.length).toBeGreaterThan(0);
    for (const o of moves) {
      expect(o.key).toMatch(/^standardMove:to:[^:]+$/);
      expect(o.fields.map((f) => f.name)).toEqual(["unitIds"]);
    }

    // So Ledros→bfB and Guardian→base are two separate declarations.
    await game.p1.move("ledros", "bfB");
    expect(game.state("ledros").isExhausted).toBe(true);
    expect(game.state("guardian").isExhausted).toBe(false); // untouched by the first action
    await game.p1.move("guardian", "base");
    expect(game.locationOf("ledros")).toBe("bfB");
    expect(game.locationOf("guardian")).toBe("base");
    expect(game.state("guardian").isExhausted).toBe(true);
  });

  test("(d) NEITHER may Standard Move while a chain is open — [Ganking] adds permissions, not timing (144.1.b / 810.1.c)", async () => {
    const game = await board("bfA").hand(P1, PING, "ping").build();
    await game.p1.cast("ping", { targets: "beacon" });

    // Closed State: the seat holds Priority on a chain, and no Standard Move is on the menu.
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P1 });
    expect(game.p1.legal().map((o) => o.verb)).not.toContain("move");
    expect(game.p1.can("move")).toBe(false);
    expect((await game.p1.try((p) => p.move("ledros", "base"))).ok).toBe(false);
    // The Ganking Move is a Standard Move with extra permissions, so it is gone too.
    expect((await game.p1.try((p) => p.gank("ledros", "bfB"))).ok).toBe(false);
    expect(game.locationOf("ledros")).toBe("bfA");
  });

  test("(d) nor outside the controller's own Main Phase (144.1.a)", async () => {
    const game = await board("bfA").build();
    await game.advanceTurn(); // → P2's Main Phase
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("move")).toBe(false);
    expect((await game.p1.try((p) => p.move("ledros", "base"))).ok).toBe(false);
    expect((await game.p1.try((p) => p.gank("ledros", "bfB"))).ok).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
