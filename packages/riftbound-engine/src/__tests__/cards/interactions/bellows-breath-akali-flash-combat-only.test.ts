/**
 * Interaction: Bellows Breath (sfd-080-221) — Spell, Mind, 1 + [mind], [Action], [Repeat]
 *     "Deal 1 to up to three units at the same location."
 *   × Akali, Silent (ven-038-166) — 4 Might champion unit, Calm
 *     "I can't be chosen by enemy spells and abilities unless I'm in combat.
 *      When I move to a battlefield, give me +2 [Might] this turn."
 *   × Flash (ogs-011-024) — Spell, Chaos, 2, [Reaction]: "Move up to 2 friendly units to base."
 *
 * Question: combat at bf1 — P1 attacks, P2 defends with Akali plus two vanilla units X and Y.
 * During the showdown P1 plays Bellows Breath choosing Akali, X and Y.
 *   (a) P2 responds with Flash moving Akali to base. Does Akali still take 1? Do X and Y? Does the
 *       whole spell fail because the three are no longer "at the same location"?
 *   (b) Instead P2 Flashes X (not Akali) to base — who can be hit now?
 *   (c) Outside combat (P1's main phase, no combat at Akali's battlefield), can P1 choose Akali
 *       with Bellows Breath at all?
 *
 * Rules:
 *   758 / 355.6   an untargetable object is not a legal target → never offered (c).
 *   758.1         becomes untargetable after being chosen and before resolution → the spell
 *                 mistargets as to that object; its instructions for it are ignored.
 *   359.3.e.5     the CR's own example: Bellows Breath on Akali-in-combat, Flash to base → she is
 *                 no longer in combat → no longer a legal target → unaffected (a).
 *   359.3.e.8     multi-target instruction with fewer than all targets invalid still executes on
 *                 the remaining valid targets → X and Y each take 1 (a).
 *   355.11.b      group requirement ("at the same location") no longer collectively met → the
 *                 spell's controller (P1) chooses a subset of the ORIGINAL targets that does; in
 *                 (b) X is in base while Akali (still in combat, still legal) and Y are at bf1 →
 *                 P1 normally picks {Akali, Y}: each takes 1, X unaffected; never all three.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BELLOWS_BREATH = "sfd-080-221";
const AKALI_SILENT = "ven-038-166";
const FLASH = "ogs-011-024";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn. P2 holds bf1 with Akali + X + Y and has Flash (2) in hand; P1 has a 2-Might attacker
 * in base and Bellows Breath (1 + [mind]) in hand. `move("att","bf1")` opens the combat showdown
 * with P1 holding Focus.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { mind: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", AKALI_SILENT, "akali")
    .unit(P2, "bf1", { might: 3, name: "Xander" }, "x")
    .unit(P2, "bf1", { might: 3, name: "Yorick" }, "y")
    .unit(P1, "base", { might: 2, name: "Attacker" }, "att")
    .hand(P1, BELLOWS_BREATH, "bb")
    .hand(P2, FLASH, "flash");
}

/** Same three P2 units at bf1, but no combat: P1's open main phase. */
function peacefulBoard() {
  return scenario()
    .resources(P1, { energy: 1, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", AKALI_SILENT, "akali")
    .unit(P2, "bf1", { might: 3, name: "Xander" }, "x")
    .unit(P2, "bf1", { might: 3, name: "Yorick" }, "y")
    .hand(P1, BELLOWS_BREATH, "bb");
}

function targetsOffered(game: Game, seat: "p1" | "p2", alias: string): string[] {
  const opt = game[seat].option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** Attack bf1, cast Bellows Breath on Akali+X+Y in the showdown, P1 passes priority to P2. */
async function attackAndBreathe(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("att", "bf1");
  expect(game.state("akali").combatRole).toBe("defender");
  await game.p1.cast("bb", { targets: ["akali", "x", "y"] });
  expect(game.chain().map((c) => c.cardId)).toEqual(["bb"]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  return game;
}

/**
 * Pass priority around until the chain is empty. If P1 is asked to choose a subset of targets
 * on resolution (355.11.b), prefer the given cards.
 */
async function drainChain(game: Game, prefer: string[] = []) {
  // The 355.11.b subset pick is raised while the item is already off the Chain,
  // so keep draining while such a decision is open too.
  for (let i = 0; i < 12 && (game.chain().length > 0 || game.decision()?.kind === "pick"); i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "action" && d.context === "chain" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "pick" && d.seat === P1) {
      const keys = d.options.filter((o) => prefer.includes(o.card ?? o.key)).map((o) => o.key);
      await game.p1.pick(...(keys.length > 0 ? keys.slice(0, Math.max(d.min, Math.min(d.max, keys.length))) : [d.options[0]?.key as string]));
    } else {
      break;
    }
  }
  expect(game.chain()).toEqual([]);
  expect(game.violations()).toEqual([]);
}

describe("Bellows Breath × Akali, Silent × Flash — 'unless I'm in combat' re-checked at resolution", () => {
  test("in combat Akali IS a legal choice for the enemy Bellows Breath: offered alongside X and Y, and the three-target cast is accepted (758.2-style lapse while defending)", async () => {
    const game = await board().build();
    await game.p1.move("att", "bf1");
    const offered = targetsOffered(game, "p1", "bb");
    expect(offered).toEqual(expect.arrayContaining(["akali", "x", "y"]));
    await game.p1.cast("bb", { targets: ["akali", "x", "y"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bb", controller: P1 })]);
  });

  test("control (no response): Bellows Breath resolves and Akali, X and Y each take exactly 1; spell to P1's trash", async () => {
    const game = await attackAndBreathe();
    await drainChain(game);
    expect(game.state("akali").damage).toBe(1);
    expect(game.state("x").damage).toBe(1);
    expect(game.state("y").damage).toBe(1);
    expect(game.zoneOf("bb")).toBe("trash");
  });

  test("(a) P2 Flashes Akali to base in response: Flash resolves first (LIFO), Akali is in base and out of combat before Bellows Breath resolves", async () => {
    const game = await attackAndBreathe();
    expect(targetsOffered(game, "p2", "flash")).toContain("akali");
    await game.p2.cast("flash", { targets: ["akali"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["bb", "flash"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Flash resolves
    expect(game.chain().map((c) => c.cardId)).toEqual(["bb"]);
    expect(game.locationOf("akali")).toBe("base");
    expect(game.state("akali").combatRole ?? null).toBeNull();
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.p2.energy()).toBe(0);
  });

  test("(a) …then Bellows Breath mistargets as to Akali — no longer in combat, so untargetable again — she takes NO damage (758.1, 359.3.e.5 example)", async () => {
    const game = await attackAndBreathe();
    await game.p2.cast("flash", { targets: ["akali"] });
    await drainChain(game, ["x", "y"]);
    expect(game.locationOf("akali")).toBe("base");
    expect(game.state("akali").damage).toBe(0);
  });

  test("(a) …but the spell does not fizzle: X and Y (still together at bf1) each take 1 and Bellows Breath goes to the trash (359.3.e.8, 355.11.b)", async () => {
    const game = await attackAndBreathe();
    await game.p2.cast("flash", { targets: ["akali"] });
    await drainChain(game, ["x", "y"]);
    expect(game.state("x").damage).toBe(1);
    expect(game.state("y").damage).toBe(1);
    expect(game.locationOf("x")).toBe("bf1");
    expect(game.locationOf("y")).toBe("bf1");
    expect(game.zoneOf("bb")).toBe("trash");
  });

  test("(b) P2 Flashes X instead: Akali stays in combat and remains a legal target — Akali and Y at bf1 each take 1", async () => {
    const game = await attackAndBreathe();
    await game.p2.cast("flash", { targets: ["x"] });
    await drainChain(game, ["akali", "y"]);
    expect(game.locationOf("x")).toBe("base");
    expect(game.locationOf("akali")).toBe("bf1");
    expect(game.state("akali").combatRole).toBe("defender");
    expect(game.state("akali").damage).toBe(1);
    expect(game.state("y").damage).toBe(1);
    expect(game.zoneOf("bb")).toBe("trash");
  });

  // Expected: once X is in P2's base the original group {Akali, X, Y} no longer collectively
  // satisfies "at the same location"; per 355.11.b P1 affects only a same-location subset of the
  // original targets — with {Akali, Y} hit at bf1, X in base must be unaffected (all three can
  // never be hit). Actual: the engine re-checks each target individually but not the group
  // requirement, so X takes 1 in base as well.
  test("(b) X, now alone in base, is NOT at the same location as Akali and Y — it must take no damage when they do (355.11.b)", async () => {
    const game = await attackAndBreathe();
    await game.p2.cast("flash", { targets: ["x"] });
    await drainChain(game, ["akali", "y"]);
    expect(game.state("akali").damage + game.state("y").damage).toBe(2);
    expect(game.state("x").damage).toBe(0);
  });

  // Expected: 355.11.b makes the subset the SPELL CONTROLLER's choice ({Akali, Y} at bf1, or {X}
  // alone in base) → a P1 pick surfaced as Bellows Breath resolves. Actual: no decision; the spell
  // just damages every individually-legal original target.
  test("(b) P1 should be asked to choose the same-location subset of the original targets as Bellows Breath resolves (355.11.b)", async () => {
    const game = await attackAndBreathe();
    await game.p2.cast("flash", { targets: ["x"] });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Flash resolves, X to base
    expect(game.locationOf("x")).toBe("base");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Bellows Breath begins resolving
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(d?.kind).toBe("pick");
    const cards = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(cards).toEqual(expect.arrayContaining(["akali", "y"]));
  });

  test("(c) outside combat Akali can't be chosen by the enemy Bellows Breath at all: not offered, and naming her is rejected (758, 355.6)", async () => {
    const game = await peacefulBoard().build();
    expect(game.state("akali").combatRole ?? null).toBeNull();
    const offered = targetsOffered(game, "p1", "bb");
    expect(offered).toContain("x");
    expect(offered).toContain("y");
    expect(offered).not.toContain("akali");
    await expect(game.p1.cast("bb", { targets: ["akali", "x", "y"] })).rejects.toThrow();
    await expect(game.p1.cast("bb", { targets: ["akali"] })).rejects.toThrow();
    expect(game.zoneOf("bb")).toBe("hand");
    expect(game.state("akali").damage).toBe(0);
  });

  test("(c) …while X and Y at that battlefield remain fair game: Bellows Breath on {X, Y} deals 1 to each", async () => {
    const game = await peacefulBoard().build();
    await game.p1.cast("bb", { targets: ["x", "y"] });
    await game.settle();
    expect(game.state("x").damage).toBe(1);
    expect(game.state("y").damage).toBe(1);
    expect(game.state("akali").damage).toBe(0);
    expect(game.zoneOf("bb")).toBe("trash");
  });
});
