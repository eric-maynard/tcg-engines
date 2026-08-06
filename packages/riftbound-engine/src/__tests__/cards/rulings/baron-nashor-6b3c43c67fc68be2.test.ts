/**
 * Ruling 6b3c43c67fc68be2 — Baron Nashor (unl-147-219) · Unit · Chaos · 10 + [chaos]×3 · 12 Might
 *   "As you play me, add the Baron Pit battlefield token to the board if it's not there already. If you
 *    do, I enter there. (It has "Units can move here from anywhere.") I can't be chosen by enemy spells and
 *    abilities. Other friendly units have +2 [Might]."
 *   × Mageseeker Warden (ogn-070-298) "While I'm at a battlefield, opponents can only play units to their base."
 *   × Baron Pit (unl-t01) — token battlefield.
 *
 * Q: Can I play Baron Nashor while an opponent's Mageseeker Warden is at a battlefield?
 * A: Yes, in both cases. If the Baron Pit is NOT yet on the board: base is the only valid play location
 *    (355.2.a under Warden), but "as you play me" adds the Pit during the play (135.2.b.3, 187.9) and
 *    "If you do, I enter there" replaces his entry location (369.3, 370.1.b) → he enters the Pit.
 *    If the Pit IS already there: nothing is added, "if you do" fails → he simply enters base.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BARON = "unl-147-219";
const WARDEN = "ogn-070-298";
const BARON_PIT = "unl-t01";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Legal `to` locations offered for playing `alias` from P1's hand. */
function playLocations(game: Game, alias: string): unknown[] {
  return [...(game.p1.option("play", alias)?.fields.find((f) => f.arg === "to")?.options ?? [])];
}

/** The battlefield-row card whose definition is the Baron Pit token, if any. */
function pitIds(game: Game): string[] {
  return game.findAll({ defId: BARON_PIT, zone: "battlefieldRow" });
}

/**
 * P1's turn with exactly Baron's cost (10 + [chaos][chaos][chaos]). P2's Warden is at bf1; P1 controls
 * bf2 (a location Warden must deny). `pit` pre-places the Baron Pit token battlefield.
 */
function board(opts: { pit?: boolean } = {}) {
  let s = scenario()
    .resources(P1, { energy: 10, power: { chaos: 3 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 });
  if (opts.pit) {
    s = s.battlefield("pit", { controller: null, def: BARON_PIT, inert: false });
  }
  return s.unit(P2, "bf1", WARDEN, "warden").unit(P1, "bf2", { might: 2, name: "Holder" }, "holder").hand(P1, BARON, "baron");
}

describe("Ruling 6b3c43c67fc68be2 — Baron Nashor under Mageseeker Warden", () => {
  test("the play itself is legal under Warden whether or not the Pit exists — base is always offered — and it costs 10 + [chaos]×3", async () => {
    const a = await board().build();
    expect(a.state("warden").location).toBe("bf1");
    expect(a.p1.can("play", "baron")).toBe(true);
    expect(playLocations(a, "baron")).toContain("base");

    const b = await board({ pit: true }).build();
    expect(b.p1.can("play", "baron")).toBe(true);
    expect(playLocations(b, "baron")).toContain("base");
    await b.p1.play("baron", { to: "base" });
    expect(b.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });

  // Expected: Warden at a battlefield ⇒ P1 may only play units to base; bf2 (P1-controlled) must not be
  // offered and an attempt to play there is rejected (355.2.a as restricted). Actual: Warden's static
  // restriction is not enforced — battlefield-bf2 is offered.
  test("ruling 6b3c43c67fc68be2 — under Warden, base is Baron's ONLY nominal play location", async () => {
    const game = await board().build();
    expect(playLocations(game, "baron")).toEqual(["base"]);
    const r = await game.p1.try((p) => p.play("baron", { to: "bf2" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("baron")).toBe("hand");
  });

  // Expected: Case 1 — no Pit yet: playing Baron (to base) adds the Baron Pit token battlefield during
  // the play and Baron ENTERS THERE instead of base; Warden only limits the nominal play location, not
  // the entry replacement (135.2.b.3, 187.9, 369.3, 370.1.b). Actual: "As you play me … I enter there"
  // is not implemented — no Pit is created and Baron lands in base.
  test.failing("BUG: ruling 6b3c43c67fc68be2 — Case 1 (no Pit): Baron played to base under Warden creates the Baron Pit and enters there", async () => {
    const game = await board().build();
    expect(pitIds(game)).toEqual([]);
    const before = game.battlefields().length;
    await game.p1.play("baron", { to: "base" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.battlefields()).toHaveLength(before + 1);
    const [pit] = pitIds(game);
    expect(pit).toBeDefined();
    expect(game.locationOf("baron")).toBe(pit as string);
    expect(game.p1.units("base")).not.toContain("baron");
    expect(game.locationOf("warden")).toBe("bf1"); // Warden untouched, still restricting
  });

  test("Case 2 (Pit already on the board): nothing is added, 'if you do' is not met — Baron simply enters P1's base; still exactly one Pit, nobody at it", async () => {
    const game = await board({ pit: true }).build();
    const before = game.battlefields();
    expect(pitIds(game)).toEqual(["pit"]);
    await game.p1.play("baron", { to: "base" });
    await game.settle();
    expect(game.zoneOf("baron")).toBe("base");
    expect(game.p1.units("base")).toContain("baron");
    expect(game.battlefields()).toEqual(before);
    expect(pitIds(game)).toEqual(["pit"]);
    expect(game.cardsAt("pit")).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("Case 2 aftermath: Baron in base is 12 Might, gives P1's OTHER unit +2, and leaves the enemy Warden alone", async () => {
    const game = await board({ pit: true }).build();
    await game.p1.play("baron", { to: "base" });
    await game.settle();
    expect(game.state("baron").might).toBe(12);
    expect(game.state("holder").might).toBe(4); // 2 + 2 from "Other friendly units have +2"
    expect(game.state("warden").location).toBe("bf1");
    expect(game.state("warden").might).toBe(game.state("warden").baseMight);
    expect(game.violations()).toEqual([]);
  });
});
