/**
 * Interaction: Baron Nashor (unl-147-219) × Mageseeker Warden (ogn-070-298)
 *
 *   Baron Nashor — Unit · Chaos · 10 + [chaos]×3 · 12 Might
 *     "As you play me, add the Baron Pit battlefield token to the board if it's not there already.
 *      If you do, I enter there. (It has "Units can move here from anywhere.")
 *      I can't be chosen by enemy spells and abilities. Other friendly units have +2 [Might]."
 *   Mageseeker Warden — Unit · Calm · 5 Might
 *     "While I'm at a battlefield, opponents can only play units to their base. …"
 *   Baron Pit (unl-t01) — token battlefield, "Units can move here from anywhere." (187.9)
 *
 * Question: P2's Warden is at a battlefield. P1 plays Baron Nashor. Case A: no Baron Pit yet.
 * Case B: the Pit token is already on the board. Where does Baron end up, and is the play legal?
 *
 * Expected (rules):
 *  - Legal in both cases: under Warden P1's base is the only valid play location (355.2.a as
 *    restricted by Warden), so Baron is nominally played to base.
 *  - Case A: "as you play me" executes during the play (135.2.b.3) and creates the Pit token
 *    (187.9); "If you do, I enter there" is a self-replacement on how Baron enters the board
 *    (369.3, 370.1.b). Warden restricts where units are PLAYED, not entry replacements → Baron
 *    ends up at the Baron Pit. (Same without Warden: the Pit is created and Baron enters there.)
 *  - Case B: nothing is added, "if you do" fails, no replacement → Baron enters P1's base.
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
function pitId(game: Game): string | undefined {
  return game.findAll({ defId: BARON_PIT, zone: "battlefieldRow" })[0];
}

/** P1's turn with exactly Baron's cost. P2's Warden sits at bf1; P1 controls bf2 (so Warden's restriction is observable). */
function board(opts: { pit?: boolean; warden?: boolean } = {}) {
  let s = scenario()
    .resources(P1, { energy: 10, power: { chaos: 3 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 });
  if (opts.pit) {
    s = s.battlefield("pit", { controller: null, def: BARON_PIT, inert: false });
  }
  if (opts.warden !== false) {
    s = s.unit(P2, "bf1", WARDEN, "warden");
  }
  return s.hand(P1, BARON, "baron");
}

describe("Baron Nashor × Mageseeker Warden — play location vs. 'I enter there' replacement", () => {
  test("the play is LEGAL under Warden in both cases (base is always a valid location) and costs 10 + [chaos][chaos][chaos]", async () => {
    const a = await board().build();
    expect(a.p1.can("play", "baron")).toBe(true);
    expect(playLocations(a, "baron")).toContain("base");
    const b = await board({ pit: true }).build();
    expect(b.p1.can("play", "baron")).toBe(true);
    expect(playLocations(b, "baron")).toContain("base");
    await b.p1.play("baron", { to: "base" });
    expect(b.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });

  // Expected: with Warden at a battlefield P1 may only play units to base — bf2 (which P1 controls)
  // must not be offered / must be rejected. Actual: Warden's first static is not enforced; bf2 is offered.
  test.failing("BUG: while Warden is at a battlefield, base is P1's ONLY legal play location for Baron (bf2 not offered, rejected)", async () => {
    const game = await board().build();
    expect(playLocations(game, "baron")).toEqual(["base"]);
    await expect(game.p1.play("baron", { to: "bf2" })).rejects.toThrow();
  });

  // Expected: playing Baron (to base, the only Warden-legal spot) creates the Baron Pit token
  // battlefield and Baron enters THERE instead (369.3 self-replacement; Warden only limits the play
  // location). Actual: the "As you play me … I enter there" text is not implemented — no Pit is
  // created and Baron simply lands in base.
  test.failing("BUG: Case A (no Pit yet, Warden out) — Baron played to base adds the Baron Pit token and enters there instead (135.2.b.3, 187.9, 369.3)", async () => {
    const game = await board().build();
    const before = game.battlefields().length;
    await game.p1.play("baron", { to: "base" });
    await game.settle();
    expect(game.battlefields()).toHaveLength(before + 1);
    const pit = pitId(game);
    expect(pit).toBeDefined();
    expect(game.locationOf("baron")).toBe(pit as string);
    expect(game.p1.units("base")).not.toContain("baron");
    expect(game.locationOf("warden")).toBe("bf1"); // Warden untouched
  });

  // Same as Case A but with no Warden at all: chosen location is irrelevant, Baron still enters the new Pit.
  // Actual: not implemented — Baron enters the chosen battlefield and no Pit exists.
  test.failing("BUG: control (no Warden, no Pit) — Baron played to bf2 still creates the Pit and enters there, not bf2", async () => {
    const game = await board({ warden: false }).build();
    await game.p1.play("baron", { to: "bf2" });
    await game.settle();
    const pit = pitId(game);
    expect(pit).toBeDefined();
    expect(game.locationOf("baron")).toBe(pit as string);
    expect(game.p1.units("bf2")).not.toContain("baron");
  });

  test("Case B (Pit already on the board) — nothing is added, 'if you do' fails, Baron simply enters P1's base; still exactly one Pit", async () => {
    const game = await board({ pit: true }).build();
    const before = game.battlefields();
    await game.p1.play("baron", { to: "base" });
    await game.settle();
    expect(game.zoneOf("baron")).toBe("base");
    expect(game.p1.units("base")).toContain("baron");
    expect(game.battlefields()).toEqual(before);
    expect(game.findAll({ defId: BARON_PIT, zone: "battlefieldRow" })).toEqual(["pit"]);
    expect(game.cardsAt("pit")).toEqual([]); // nobody at the Pit
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1, context: "main" });
  });

  test("Case B: Baron in base is a 12-Might unit and Warden is unaffected by any of this", async () => {
    const game = await board({ pit: true }).build();
    await game.p1.play("baron", { to: "base" });
    await game.settle();
    expect(game.state("baron").might).toBe(12);
    expect(game.locationOf("warden")).toBe("bf1");
    expect(game.state("warden").might).toBe(5); // "Other FRIENDLY units have +2" — not the enemy Warden
    expect(game.violations()).toEqual([]);
  });
});
