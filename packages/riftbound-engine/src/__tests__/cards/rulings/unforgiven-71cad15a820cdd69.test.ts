/**
 * Ruling 71cad15a820cdd69 — Yasuo, Unforgiven (OGN-259 → ogn-259-298, legend)
 *     "[2], [Exhaust]: Move a friendly unit to or from its base."
 *   × Ride the Wind (OGN-173 → ogn-173-298) "[Action] Move a friendly unit and ready it."
 *   × Charm (OGN-043 → ogn-043-298) "Move an enemy unit."
 *
 * Q: Can Yasuo's legend ability or "Move" spells like Ride the Wind move a unit with [Ganking] from
 *    battlefield to battlefield?
 * A: Yes. [Ganking] only concerns the Standard Move action; it neither enables nor restricts moves made by
 *    spells/abilities. A "Move" spell can send a unit anywhere but an enemy base (bf → bf included, Ganking or
 *    not); Yasuo's ability keeps its own printed restriction (to/from base) — Ganking doesn't widen it.
 * Rules: 726 (Ganking modifies the Standard Move), 141.2 (Standard Move: base ↔ battlefield), 421 (Move as an
 *        effect — any location the effect allows).
 */
import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UNFORGIVEN = "ogn-259-298";
const RIDE_THE_WIND = "ogn-173-298";
const CHARM = "ogn-043-298";

/**
 * P1's turn. P1 controls bf1 holding a [Ganking] unit and a plain unit; P2 controls bf2 with a unit; bf3 is
 * empty/uncontrolled. P1: Yasuo legend, Ride the Wind + its cost and [2] for the legend. P2 holds Charm.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 1 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .legend(P1, UNFORGIVEN, "yasuo")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: null })
    .unit(P1, "bf1", { keywords: ["Ganking"], might: 3, name: "Ganker" }, "ganker")
    .unit(P1, "bf1", { might: 2, name: "Plain Walker" }, "plain")
    .unit(P2, "bf2", { might: 2, name: "Foe" }, "foe")
    .hand(P1, RIDE_THE_WIND, "rtw")
    .hand(P2, CHARM, "charm");
}

describe("Ruling 71cad15a820cdd69 — Ganking restricts only the Standard Move; spells/abilities move freely within their own text", () => {
  test("baseline (what Ganking IS about): the plain unit at bf1 has no Standard Move to another battlefield, the Ganking unit does", async () => {
    const game = await board().build();
    expect(game.p1.can("gank", "ganker")).toBe(true);
    expect(game.p1.can("gank", "plain")).toBe(false);
    const r = await game.p1.try((p) => p.move("plain", "bf2"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("plain")).toBe("bf1");
  });

  test("Ride the Wind on the [Ganking] unit at bf1: the destination prompt offers other battlefields (bf2, bf3) — pick bf3 → it moves battlefield→battlefield and is readied", async () => {
    const game = await board().build();
    await game.p1.cast("rtw", { targets: "ganker" });
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    const keys = d.options.map((o) => o.key);
    expect(keys).toContain("battlefield-bf2");
    expect(keys).toContain("battlefield-bf3");
    await game.p1.pick("battlefield-bf3");
    await game.settle();
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.locationOf("ganker")).toBe("bf3");
    expect(game.state("ganker").isReady).toBe(true);
  });

  test("Ride the Wind on the NON-Ganking unit at bf1 may equally go battlefield→battlefield (bf3): Ganking is irrelevant to spell moves", async () => {
    const game = await board().build();
    await game.p1.cast("rtw", { targets: "plain" });
    const d = game.decision() as PickDecision;
    expect(d.options.map((o) => o.key)).toContain("battlefield-bf3");
    await game.p1.pick("battlefield-bf3");
    await game.settle();
    expect(game.locationOf("plain")).toBe("bf3");
  });

  test("Yasuo's legend ability moves the [Ganking] unit from bf1 — but only per its own text (to its base): Ganking neither blocks it nor adds bf→bf", async () => {
    const game = await board().build();
    const fields = game.p1.option("activate", "yasuo")?.fields ?? [];
    const targets = fields.find((f) => f.name === "targets");
    expect(targets?.options).toEqual(expect.arrayContaining([["ganker"], ["plain"]]));
    await game.p1.activate("yasuo", 0, { targets: "ganker" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yasuo", controller: P1 })]);
    expect(game.p1.energy()).toBe(2);
    expect(game.state("yasuo").isExhausted).toBe(true);
    // If a destination is asked, a unit at a battlefield may only go to its base.
    game.script(P1, [
      (d) => {
        if (d.kind === "pick" && d.semantics === "destination") {
          expect(d.options.map((o) => o.key)).toEqual(["base"]);
          return "base";
        }
        return undefined;
      },
    ]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("ganker")).toBe("base");
  });

  test("Charm (enemy 'Move') cast by P2 on P1's plain unit during P2's turn can also send it battlefield→battlefield", async () => {
    const game = await board().active(P2).build();
    await game.p2.cast("charm", { targets: "plain" });
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P2, semantics: "destination" });
    expect(d.options.map((o) => o.key)).toContain("battlefield-bf3");
    await game.p2.pick("battlefield-bf3");
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("plain")).toBe("bf3");
    expect(game.violations()).toEqual([]);
  });
});
