/**
 * Interaction: Karthus, Eternal (ogn-236-298) — 3 Might Order champion
 *     "Your [Deathknell] effects trigger an additional time."
 *   × Ruined Rex (unl-067-219) — 6 Might Mind unit: "[Deathknell] — Deal 4 to an enemy unit."
 *   × Not So Fast (sfd-045-221) — [2]+[calm] Reaction spell:
 *     "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *
 * Question: P1 controls Karthus and Ruined Rex; Rex dies. (a) How many Deathknell items go on the
 * chain and how are their targets chosen? (b) P2 answers with ONE Not So Fast — does it stop both
 * triggers or one? Contrast: no Karthus (one trigger; one Not So Fast stops all the damage).
 *
 * Rules:
 *   808.1.d.2  a dies-trigger is added to the chain as a Pending Item before the unit hits the trash.
 *   Karthus    "trigger an additional time" → two separate pending items from one death.
 *   355.5      each item chooses its own Game Object (enemy unit) as it is finalized — same or
 *              different P2 units; 8 total damage if both resolve.
 *   337.1.b    items finalize in the order appended.
 *   Not So Fast counters "an" ability — exactly one chain item (425.1: a countered item does
 *              nothing); the other Rex trigger still resolves for 4. Each Rex trigger is an enemy
 *              ability choosing a unit friendly to P2, so Not So Fast is a legal play against it.
 *
 * Rex is killed by P1's own Final Spark (ogs-022-024, "Deal 8 to a unit") so that P2 keeps exactly
 * the [2]+[calm] for one Not So Fast.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KARTHUS = "ogn-236-298";
const RUINED_REX = "unl-067-219";
const NOT_SO_FAST = "sfd-045-221";
const FINAL_SPARK = "ogs-022-024"; // [8] Action: "Deal 8 to a unit." — kills the 6-Might Rex outright

function board(opts: { karthus: boolean }) {
  const b = scenario()
    .resources(P1, { energy: 8 }) // exactly Final Spark
    .resources(P2, { energy: 2, power: { calm: 1 } }) // exactly ONE Not So Fast
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", RUINED_REX, "rex")
    .unit(P2, "base", { might: 5, name: "Victim A" }, "victimA")
    .unit(P2, "base", { might: 5, name: "Victim B" }, "victimB")
    .hand(P1, FINAL_SPARK, "spark")
    .hand(P2, NOT_SO_FAST, "nsf");
  return opts.karthus ? b.unit(P1, "base", KARTHUS, "karthus") : b;
}

/** P1 Final-Sparks his own Rex; both players let it resolve → Rex dies → Deathknell(s) pend. */
async function killRex(game: Game): Promise<void> {
  await game.p1.cast("spark", { targets: "rex" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("rex")).toBe("trash");
}

/** Rex Deathknell items currently on the chain. */
function rexItems(game: Game) {
  return game.chain().filter((i) => i.cardId === "rex" && i.triggered);
}

/**
 * Strict (355.5 / 808.1.d.2): right after the death, P1 is prompted once per pending Rex item to
 * choose its enemy-unit target, BEFORE anyone receives priority. Each prompt offers both P2 units.
 */
async function chooseRexTargetsNow(game: Game, picks: string[]): Promise<void> {
  for (const pick of picks) {
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d && d.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered).toEqual(expect.arrayContaining(["victimA", "victimB"]));
    expect(offered).not.toContain("karthus"); // "an ENEMY unit"
    await game.p1.pick(pick);
  }
}

/**
 * Timing-tolerant driver for the outcome facets: kill Rex, supply P1's target picks whenever the
 * engine asks for them (at finalization per 355.5, or — engine convention — at resolution via the
 * queued script), and stop with the Rex item(s) on the chain and P1 holding priority.
 */
async function killRexAndTarget(game: Game, picks: string[]): Promise<void> {
  await killRex(game);
  if (game.decision()?.kind === "pick") {
    await chooseRexTargetsNow(game, picks);
  } else {
    game.script(P1, picks);
  }
  expect(rexItems(game).length).toBeGreaterThan(0);
  expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P1 });
}

/** P2, holding priority, plays its one Not So Fast at the first offered Rex item. Returns #targets offered. */
async function p2CountersOne(game: Game): Promise<number> {
  expect(game.actingSeat()).toBe(P2);
  expect(game.p2.can("cast", "nsf")).toBe(true);
  const offered = game.p2.option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options ?? [];
  const first = offered[0];
  await game.p2.cast("nsf", { targets: (Array.isArray(first) ? first : [first]) as string[] });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  return offered.length;
}

const totalDamage = (game: Game) => game.state("victimA").damage + game.state("victimB").damage;

describe("Karthus doubling Ruined Rex's Deathknell vs a single Not So Fast", () => {
  test("sanity: Rex carries Deathknell; with nothing on the chain P2 has no legal Not So Fast (355.8)", async () => {
    const game = await board({ karthus: true }).build();
    expect(game.state("rex").keywords).toContain("Deathknell");
    expect(game.chain()).toEqual([]);
    expect(game.p2.can("cast", "nsf")).toBe(false);
  });

  // ── contrast: no Karthus ──────────────────────────────────────────────────────────────

  test.failing("BUG: no Karthus — Rex's death puts exactly ONE Deathknell item (P1's ability) on the chain, its enemy-unit target chosen by P1 as it is finalized (808.1.d.2, 355.5)", async () => {
    // Expected: one triggered item sourced from rex, controller P1; P1 immediately prompted victimA|victimB.
    // Actual: Ruined Rex's Deathknell never triggers at all (no chain item, no prompt, no damage).
    const game = await board({ karthus: false }).build();
    await killRex(game);
    await chooseRexTargetsNow(game, ["victimA"]);
    expect(rexItems(game)).toHaveLength(1);
    expect(rexItems(game)[0]).toMatchObject({ controller: P1, type: "ability" });
  });

  test.failing("BUG: no Karthus, no reaction — the single trigger resolves for exactly 4 to the chosen unit", async () => {
    const game = await board({ karthus: false }).build();
    await killRexAndTarget(game, ["victimA"]);
    expect(rexItems(game)).toHaveLength(1);
    await game.settle();
    expect(game.state("victimA").damage).toBe(4);
    expect(game.state("victimB").damage).toBe(0);
  });

  test.failing("BUG: no Karthus — one Not So Fast is legal against the Rex trigger (enemy ability choosing P2's unit) and counters it entirely: 0 damage", async () => {
    const game = await board({ karthus: false }).build();
    await killRexAndTarget(game, ["victimA"]);
    await game.p1.passPriority();
    expect(await p2CountersOne(game)).toBe(1);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(totalDamage(game)).toBe(0);
  });

  // ── with Karthus ──────────────────────────────────────────────────────────────────────

  test.failing("BUG: (a) with Karthus, Rex's death puts TWO independent Deathknell items on the chain, each choosing its own target as it is finalized (Karthus text, 808.1.d.2, 355.5, 337.1.b)", async () => {
    // Expected: two pending items appended in order; P1 answers two separate target prompts before
    // priority (different units here; the same unit twice would also be legal).
    // Actual: no trigger at all (and the 'trigger-double' static has no engine support either).
    const game = await board({ karthus: true }).build();
    await killRex(game);
    await chooseRexTargetsNow(game, ["victimA", "victimB"]);
    const items = rexItems(game);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.controller === P1 && i.type === "ability")).toBe(true);
    expect(items[0]?.id).not.toBe(items[1]?.id);
  });

  test.failing("BUG: (a) with Karthus and no reaction both triggers resolve — 4 + 4 = 8 total (4 to each chosen victim)", async () => {
    const game = await board({ karthus: true }).build();
    await killRexAndTarget(game, ["victimA", "victimB"]);
    expect(rexItems(game)).toHaveLength(2);
    await game.settle();
    expect(game.state("victimA").damage).toBe(4);
    expect(game.state("victimB").damage).toBe(4);
    expect(totalDamage(game)).toBe(8);
  });

  test.failing("BUG: (a) both triggers may choose the SAME unit — 8 to victimA kills it (5 Might), victimB untouched", async () => {
    const game = await board({ karthus: true }).build();
    await killRexAndTarget(game, ["victimA", "victimA"]);
    expect(rexItems(game)).toHaveLength(2);
    await game.settle();
    expect(game.zoneOf("victimA")).toBe("trash");
    expect(game.state("victimB").damage).toBe(0);
  });

  test.failing("BUG: (b) ONE Not So Fast is offered both Rex items but counters exactly one — the other still resolves for 4 (425.1; 'an ability' is singular)", async () => {
    // Expected: P2 sees two legal targets for Not So Fast, counters one; after everything resolves
    // exactly 4 damage has landed on P2's side (on whichever victim the surviving trigger chose).
    // Actual: nothing to counter — Rex never triggered.
    const game = await board({ karthus: true }).build();
    await killRexAndTarget(game, ["victimA", "victimB"]);
    expect(rexItems(game)).toHaveLength(2);
    await game.p1.passPriority();
    expect(await p2CountersOne(game)).toBe(2); // each Rex trigger is separately targetable
    expect(game.p2.can("cast", "nsf")).toBe(false); // the single copy is spent
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(totalDamage(game)).toBe(4);
  });

  test.failing("BUG: Karthus doubles only DEATHKNELL effects — Final Spark is not doubled and Rex dies once: exactly two Rex items, one Rex in trash", async () => {
    const game = await board({ karthus: true }).build();
    await killRexAndTarget(game, ["victimA", "victimB"]);
    expect(rexItems(game)).toHaveLength(2);
    expect(game.chain().filter((i) => i.cardId === "spark")).toHaveLength(0); // spark already resolved once
    expect(game.p1.trash().filter((c) => c === "rex")).toHaveLength(1);
  });
});
