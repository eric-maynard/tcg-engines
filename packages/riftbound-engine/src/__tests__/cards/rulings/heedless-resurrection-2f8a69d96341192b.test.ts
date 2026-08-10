/**
 * Ruling 2f8a69d96341192b — Heedless Resurrection (unl-142-219) × Soulgorger (ogn-196-298) × Baron Nashor (unl-147-219) / Baron Pit (unl-t01)
 *   Heedless: "[Reaction] As an additional cost to play this, kill a friendly unit. Play a unit from your trash that
 *              costs no more Energy and no more Power than the killed unit, ignoring its cost."
 *   Soulgorger: "When you play me, you may play a unit from your trash, ignoring its Energy cost. (You must still pay its Power cost.)"
 *
 * Q: If I Heedless-kill my Baron and resurrect Soulgorger, can Soulgorger's on-play bring back that same Baron?
 * A: Yes. Heedless only can't resurrect the unit it killed (targets lock before costs). Baron → trash as the cost,
 *    Heedless plays Soulgorger, Soulgorger's trigger resolves with Baron already in the trash so Baron is a legal
 *    choice; you still pay Baron's 3 Power. Baron Pit already exists, so no new Pit — Baron enters at a battlefield
 *    you control or your base, your choice.
 * Rules: 355.5 / 357 (targets before costs), 356.1.b (ignoring cost), 369.3 ("if you do" fails when the Pit exists).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BARON = "unl-147-219";
const HEEDLESS = "unl-142-219";
const SOULGORGER = "ogn-196-298";
const BARON_PIT = "unl-t01";

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 4 } }) // 2 + [chaos] for Heedless, 3 chaos for Baron's Power cost
    .battlefield("pit", { controller: P1, def: BARON_PIT, inert: false })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "pit", BARON, "baron")
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .trash(P1, SOULGORGER, "sg")
    .hand(P1, HEEDLESS, "hr");
}

describe("Ruling 2f8a69d96341192b — Heedless kills Baron, plays Soulgorger, Soulgorger replays the same Baron", () => {
  test("full line: Baron dies as the cost, Heedless offers only Soulgorger, Soulgorger's trigger then offers Baron (now in trash), 3 chaos is paid, no second Pit is added and P1 chooses where Baron enters", async () => {
    const game = await board().build();
    expect(game.battlefields().toSorted()).toEqual(["bf1", "pit"]);

    // Baron is the only friendly unit → the only sacrifice.
    expect(game.p1.option("cast", "hr")?.fields.find((f) => f.arg === "sacrifice")?.options).toEqual(["baron"]);
    await game.p1.play("hr", { sacrifice: "baron" });
    expect(game.zoneOf("baron")).toBe("trash"); // cost paid up front
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 3 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["hr"]);

    // Heedless resolves: the unit to play is Soulgorger — Baron (the killed unit) is NOT offered.
    await game.settle();
    let d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["sg"]);
    await game.p1.pick("sg");

    // Soulgorger is played (cost ignored) — P1 chooses where it enters.
    await game.settle();
    d = game.decision();
    if (d?.kind === "pick" && d.semantics === "destination") {
      expect(d.seat).toBe(P1);
      await game.p1.pick("base");
      await game.settle();
      d = game.decision();
    }
    expect(game.zoneOf("sg")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 3 } }); // nothing paid for Soulgorger

    // Soulgorger's "you may" trigger is P1's decision; Baron is already in the trash when it resolves.
    expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.zoneOf("baron")).toBe("trash");
    await game.p1.yes();
    await game.settle();
    d = game.decision();
    if (d?.kind === "pick" && d.semantics !== "destination") {
      expect(d.options.map((o) => o.card ?? o.key)).toContain("baron");
      await game.p1.pick("baron");
      await game.settle();
      d = game.decision();
    }

    // Baron Pit already exists → no new token battlefield; P1 picks base or a battlefield they control.
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    const dests = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(dests).toContain("base");
    expect(dests).toContain("battlefield-pit");
    expect(dests).not.toContain("battlefield-bf1"); // P2's battlefield is not a choice
    await game.p1.pick("battlefield-pit");
    await game.settle();

    expect(game.battlefields().toSorted()).toEqual(["bf1", "pit"]); // still exactly one Pit
    expect(game.locationOf("baron")).toBe("pit");
    // Baron's Power cost was still paid (Soulgorger ignores only Energy).
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("hr")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("Baron's Power cost is mandatory under Soulgorger: with 0 chaos left after Heedless, Baron cannot be replayed and stays in the trash", async () => {
    const game = await board().resources(P1, { energy: 2, power: { chaos: 1 } }).build();
    await game.p1.play("hr", { sacrifice: "baron" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("sg");
    }
    await game.settle({ policy: "first" }); // take base, say yes if asked, etc.
    expect(game.zoneOf("sg")).toBe("base");
    expect(game.zoneOf("baron")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
