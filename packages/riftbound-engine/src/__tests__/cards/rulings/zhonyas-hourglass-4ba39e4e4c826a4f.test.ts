/**
 * Ruling 4ba39e4e4c826a4f — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2] · [Hidden]
 *   "If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Super Mega Death Rocket! (OGN-252 → ogn-252-298) · Spell · [4][rainbow] · "Deal 5 to a unit. …"
 *
 * Q: Does Zhonya's trigger automatically when the next friendly unit dies, and can you choose not to?
 * A: It applies automatically the moment a friendly unit would die — there is no choice. It only cares about
 *    FRIENDLY units: an opponent's SMDR killing an enemy (i.e. the opponent's-side) unit doesn't touch it; and it
 *    works from your base.
 * Rules: 372–373 (replacement effects apply to the event they replace; not optional unless they say "may"),
 *        740.1.a (friendly = controlled by you).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const SMDR = "ogn-252-298";

describe("Ruling 4ba39e4e4c826a4f — Zhonya's Hourglass is a mandatory replacement for the next friendly death", () => {
  test("P2's SMDR deals 5 to P1's 2-Might Ally at bf1 while Zhonya's sits face-up in P1's BASE: nobody is asked anything — Zhonya's is killed instead; the Ally is healed, exhausted and recalled to base", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P2, { energy: 4, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .gear(P1, ZHONYAS, "zhonya")
      .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
      .hand(P2, SMDR, "smdr")
      .script(P1, [], { strict: true }) // any prompt to P1 (e.g. "use Zhonya's?") would throw
      .build();
    expect(game.zoneOf("zhonya")).toBe("base");
    expect(game.state("zhonya").isHidden).toBe(false);
    await game.p2.cast("smdr", { targets: "ally" });
    // Only priority passes happen — P1 never receives a yes/no or pick about Zhonya's.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.legal().map((o) => o.verb).toSorted()).toEqual(["concede", "passPriority"]);
    await game.p1.passPriority(); // SMDR resolves; the replacement applies on its own
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.zoneOf("zhonya")).toBe("trash"); // "kill this instead"
    expect(game.zoneOf("ally")).toBe("base"); // recalled
    expect(game.state("ally").damage).toBe(0); // healed
    expect(game.state("ally").isExhausted).toBe(true); // exhausted
    expect(game.zoneOf("smdr")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("only FRIENDLY deaths matter: P1's own SMDR killing P2's unit leaves P1's Zhonya's untouched in base", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P2 })
      .gear(P1, ZHONYAS, "zhonya")
      .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .hand(P1, SMDR, "smdr")
      .build();
    await game.p1.cast("smdr", { targets: "foe" });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("zhonya")).toBe("base");
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally").isExhausted).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("likewise from P2's side: P2's Zhonya's does not react when P2's SMDR kills P1's (enemy-to-P2) unit — that unit simply dies", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P2, { energy: 4, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .gear(P2, ZHONYAS, "p2zhonya")
      .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
      .hand(P2, SMDR, "smdr")
      .build();
    await game.p2.cast("smdr", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("p2zhonya")).toBe("base");
  });
});
