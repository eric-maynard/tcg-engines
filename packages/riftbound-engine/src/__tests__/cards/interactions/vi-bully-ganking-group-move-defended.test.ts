/**
 * Interaction: Vi, Destructive (ogn-036-298, 3 Might, [Ganking])
 *   × Bilgewater Bully (ogn-125-298, 6 Might) "While I'm buffed, I have [Ganking]."
 *   × Sunlit Guardian (ogn-054-298, 3 Might, [Shield] [Tank]) — the lone enemy defender
 *
 * Question: P1 controls battlefield A with Vi and Bully there and a ready vanilla unit in base;
 * P2 controls battlefield B with Sunlit Guardian. (a) Can P1 declare ONE standard move sending Vi
 * (from A) and the base unit (from base) together to B? Can UNBUFFED Bully be included? (b) If
 * Bully is buffed, can all three go in one move? (c) On arrival — how many combats, who attacks,
 * how is damage assigned against the Guardian, and what happens to control of A once emptied?
 *
 * Rules: 144.2/144.3/144.3.a-c (a multi-unit Standard Move is one action; same Destination,
 * Origins may differ; all exhaust simultaneously), 144.4/144.4.a/144.4.c.1 + 810.1.b/810.1.c
 * (Ganking only ADDS battlefield→battlefield to that unit's Standard Move), 446.3 (moves are
 * instantaneous, no chain), 450/453/461 (Contested → one Cleanup → one Combat), 464.2.c.1/464.2.c.3
 * (mover is Attacker; all their units there become attackers together), 814.1.c (Shield: +1 Might
 * while defending), 815.1.b (Tank takes lethal first), 465.2.c.3 (lethal-first assignment),
 * 190.4.c (a battlefield you have no units at becomes uncontrolled at the next open-state cleanup).
 *
 * Expected: (a) Vi + base unit together is legal; unbuffed Bully cannot join (no Ganking → no
 * bf→bf option). (b) Buffed Bully has Ganking (and 7 Might) → all three in one move. (c) One combat
 * with P1 attacking; Guardian defends at 4 and must be assigned lethal first (trivial, lone
 * defender) and dies; its 4 is spread lethal-first among attackers; P1 conquers B; A, left empty,
 * becomes uncontrolled.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VI = "ogn-036-298";
const BULLY = "ogn-125-298";
const SUNLIT_GUARDIAN = "ogn-054-298";

// Inline 0-cost "Buff a unit." so Bully's buff goes through the real effect pipeline (statics recalc).
const BUFF = {
  abilities: [{ effect: { target: { type: "unit" }, type: "buff" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Buff",
  timing: "action",
};

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Unit-groups the engine offers for a Standard Move to `dest` (each option is a list of unit ids). */
function moveGroupsOffered(game: Game, dest: string): string[][] {
  const opt = game.p1.option(`standardMove:to:${dest}`);
  const field = opt?.fields.find((f) => f.arg === "units");
  return ((field?.options ?? []) as string[][]).map((g) => [...g].sort());
}

function board() {
  return scenario()
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "bfA", VI, "vi")
    .unit(P1, "bfA", BULLY, "bully")
    .unit(P1, "base", { might: 2, name: "Grunt" }, "grunt") // the ready vanilla unit in base
    .unit(P2, "bfB", SUNLIT_GUARDIAN, "guardian")
    .unit(P2, "base", { might: 2, name: "P2 Reserve" }, "p2reserve") // a non-Tank P2 unit NOT at bfB
    .hand(P1, BUFF, "buff");
}

async function buffBully(game: Game): Promise<void> {
  await game.p1.cast("buff", { targets: "bully" });
  await game.settle();
}

describe("Vi × Bilgewater Bully × Sunlit Guardian — ganking group move into a defended battlefield", () => {
  // ---------------------------------------------------------------- (a)

  test("(a) Vi has Ganking: her Standard Move may go battlefield A → battlefield B; it exhausts her, B becomes Contested by P1 and ONE showdown opens with P1 holding Focus (810.1.b, 446.3, 450)", async () => {
    const game = await board().build();
    expect(game.state("vi").keywords).toContain("Ganking");
    expect(game.p1.can("gank", "vi")).toBe(true);
    await game.p1.gank("vi", "bfB");
    expect(game.locationOf("vi")).toBe("bfB");
    expect(game.state("vi").isExhausted).toBe(true);
    expect(game.chain()).toHaveLength(0); // a move never uses the chain
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    const d = game.decision();
    expect(d?.kind).toBe("action");
    expect(d && d.kind === "action" ? d.context : undefined).toBe("showdown");
    expect(d?.seat).toBe(P1); // attacker gains Focus (464.2.c.1.a)
    expect(game.state("vi").combatRole).toBe("attacker");
    expect(game.state("guardian").combatRole).toBe("defender");
  });

  test("(a) UNBUFFED Bully has no Ganking: battlefield→battlefield is not a destination for him — only A → base is offered (144.4, 810.1.c.1)", async () => {
    const game = await board().build();
    expect(game.state("bully").isBuffed).toBe(false);
    expect(game.state("bully").keywords).not.toContain("Ganking");
    expect(game.p1.can("gank", "bully")).toBe(false);
    expect(moveGroupsOffered(game, "bfB").some((g) => g.includes("bully"))).toBe(false);
    expect(moveGroupsOffered(game, "base")).toContainEqual(["bully"]);
    const r = await game.p1.try((p) => p.move(["vi", "bully", "grunt"], "bfB"));
    expect(r.ok).toBe(false);
    const r2 = await game.p1.try((p) => p.gank("bully", "bfB"));
    expect(r2.ok).toBe(false);
    expect(game.locationOf("bully")).toBe("bfA");
    expect(game.state("bully").isExhausted).toBe(false);
  });

  test("(a) a multi-unit Standard Move is ONE action: Vi + Bully from A → base move together and are exhausted simultaneously (144.3, 144.3.c, 144.4.b)", async () => {
    const game = await board().build();
    expect(moveGroupsOffered(game, "base")).toContainEqual(["bully", "vi"]);
    await game.p1.move(["vi", "bully"], "base");
    expect(game.locationOf("vi")).toBe("base");
    expect(game.locationOf("bully")).toBe("base");
    expect(game.state("vi").isExhausted).toBe(true);
    expect(game.state("bully").isExhausted).toBe(true);
    expect(game.chain()).toHaveLength(0);
  });

  test("(a) Vi (from A, via Ganking) + the base unit (from base) may be sent to B as ONE Standard Move — different Origins, same Destination (144.3.a/b, 144.4.c.1); engine only offers base units for a move to B", async () => {
    // Expected: standardMove → bfB offers the group [vi, grunt]; taking it exhausts both and puts both at bfB
    // in a single action (one Contested application, one showdown).
    // Actual: Ganking is a separate single-unit `gankingMove`; standardMove to bfB offers only [grunt].
    const game = await board().build();
    expect(moveGroupsOffered(game, "bfB")).toContainEqual(["grunt", "vi"]);
    await game.p1.move(["vi", "grunt"], "bfB");
    expect(game.locationOf("vi")).toBe("bfB");
    expect(game.locationOf("grunt")).toBe("bfB");
    expect(game.state("vi").isExhausted).toBe(true);
    expect(game.state("grunt").isExhausted).toBe(true);
    expect(game.locationOf("bully")).toBe("bfA"); // not included
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, contestedBy: P1 });
    expect(game.state("vi").combatRole).toBe("attacker");
    expect(game.state("grunt").combatRole).toBe("attacker");
  });

  // ---------------------------------------------------------------- (b)

  test("(b) while buffed, Bully has Ganking (static) and is 7 Might — battlefield A → B is now open to him", async () => {
    const game = await board().build();
    await buffBully(game);
    expect(game.state("bully").isBuffed).toBe(true);
    expect(game.state("bully").might).toBe(7);
    expect(game.state("bully").keywords).toContain("Ganking");
    expect(game.p1.can("gank", "bully")).toBe(true);
    await game.p1.gank("bully", "bfB");
    expect(game.locationOf("bully")).toBe("bfB");
    expect(game.state("bully").isExhausted).toBe(true);
  });

  test("(b) buffed Bully + Vi + the base unit may ALL move to B as one Standard Move (144.3, 810.1.b); engine has no multi-origin / ganking group move", async () => {
    // Expected: the group [vi, bully, grunt] is a legal single move to bfB; all three exhausted, all at bfB.
    // Actual: not offered; the harness rejects the bundle as matching no legal variant.
    const game = await board().build();
    await buffBully(game);
    expect(moveGroupsOffered(game, "bfB")).toContainEqual(["bully", "grunt", "vi"]);
    await game.p1.move(["vi", "bully", "grunt"], "bfB");
    for (const u of ["vi", "bully", "grunt"]) {
      expect(game.locationOf(u)).toBe("bfB");
      expect(game.state(u).isExhausted).toBe(true);
      expect(game.state(u).combatRole).toBe("attacker");
    }
    expect(game.p1.units("bfA")).toHaveLength(0);
  });

  // ---------------------------------------------------------------- (c)

  test("(c) Shield: the Guardian DEFENDS at 3+1 = 4 — Vi alone (3) cannot kill it and takes 4 back: Vi dies, Guardian survives (healed), B stays P2's (814.1.c)", async () => {
    const game = await board().build();
    await game.p1.gank("vi", "bfB");
    await game.settle(); // both pass focus → combat damage → cleanup
    expect(game.zoneOf("vi")).toBe("trash"); // took 4 ≥ 3
    expect(game.zoneOf("guardian")).toBe("battlefield-bfB"); // took 3 < 4
    expect(game.state("guardian").damage).toBe(0); // healed in combat cleanup
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
  });

  test("(c) one combat, P1 attacking: buffed Bully (7) alone into the lone Tank defender — Guardian must take lethal (4) first and dies; its 4 lands on Bully (survives, 4 < 7); P1 conquers B for 1 point (815.1.b, 465.2.c.3)", async () => {
    const game = await board().build();
    await buffBully(game);
    await game.p1.gank("bully", "bfB");
    expect(game.state("bully").combatRole).toBe("attacker");
    expect(game.state("guardian").combatRole).toBe("defender");
    expect(game.state("p2reserve").combatRole).toBeFalsy(); // not at bfB → not in this combat
    await game.settle();
    expect(game.zoneOf("guardian")).toBe("trash");
    expect(game.zoneOf("bully")).toBe("battlefield-bfB");
    expect(game.state("bully").damage).toBe(0); // marked 4, healed at combat cleanup
    expect(game.zoneOf("p2reserve")).toBe("base"); // untouched
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    // Combat is over: back to P1's open main phase, no lingering roles.
    const d = game.decision();
    expect(d && d.kind === "action" ? d.context : undefined).toBe("main");
    expect(game.state("bully").combatRole).toBeFalsy();
  });

  test("(c) all three arrive together → ONE combat with Vi, Bully and Grunt all attackers; Guardian (4, Tank) dies to 3+7+2; its 4 damage kills at most the units it can cover lethal-first; P1 conquers B; A — now empty — becomes uncontrolled (461, 464.2.c.3, 465.2.c.3, 190.4.c)", async () => {
    // Expected: single showdown/combat; Guardian dead; P1 controls bfB (+1 point); total damage marked on
    // P1's attackers is exactly 4 before healing so at most Grunt(2)-then-partial or Vi(3)-then-partial die
    // lethal-first — Bully (7) certainly survives; bfA has no units → controller null after cleanup.
    // Actual: the group move is not legal in the engine (see (a)/(b) BUGs), so this line throws.
    const game = await board().build();
    await buffBully(game);
    await game.p1.move(["vi", "bully", "grunt"], "bfB");
    const d = game.decision();
    expect(d && d.kind === "action" ? d.context : undefined).toBe("showdown");
    expect(d?.seat).toBe(P1);
    await game.settle();
    expect(game.zoneOf("guardian")).toBe("trash");
    expect(game.zoneOf("bully")).toBe("battlefield-bfB");
    // Guardian's 4 must be assigned lethal-first: it can fully kill Grunt (2) or Vi (3) but not both (2+3 > 4).
    const dead = ["vi", "grunt"].filter((u) => game.zoneOf(u) === "trash");
    expect(dead.length).toBeLessThanOrEqual(1);
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p1.units("bfA")).toHaveLength(0);
    expect(game.gameState.battlefields.bfA?.controller ?? null).toBeNull();
  });

  test("(c) moving every unit off A forfeits it — with no P1 unit left at A it becomes UNCONTROLLED at the next open-state cleanup (190.4.c); engine leaves P1 as controller", async () => {
    // Expected: after Vi + Bully leave bfA (here: one Standard Move to base, open state, no combat there),
    // the following cleanup clears bfA's controller.
    // Actual: bfA.controller stays "player-1" indefinitely (even across turns).
    const game = await board().build();
    await game.p1.move(["vi", "bully"], "base");
    await game.settle();
    expect(game.p1.units("bfA")).toHaveLength(0);
    expect(game.gameState.battlefields.bfA?.controller ?? null).toBeNull();
  });
});
