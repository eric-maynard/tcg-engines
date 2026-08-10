/**
 * Ruling 9932755e46ead0a7 — Decree of Discord (VEN-107 → ven-107-166) · Chaos · 1 + [chaos]
 *     "Return any number of enemy Order units with total Might 5 or less to their owners' hands."
 *   × Discipline (OGN-058 → ogn-058-298) · [Reaction] · 2 · "Give a unit +2 [Might] this turn. Draw 1."
 *   (Fox-Fire OGN-256 is the rules' own example of the same "total Might" group restriction.)
 *
 * Q: I Decree two 2-Might Order units (total 4). In response the opponent Disciplines one to 4 Might. What happens?
 * A: You return ONE of them, not both. The "total Might ≤ 5" is a group restriction (355.11); at resolution the group
 *    (4 + 2 = 6) no longer qualifies, so per 355.11.b you choose a legal SUBSET of the ORIGINAL targets: the 4 alone or
 *    the 2 alone — never both, never a unit that wasn't targeted.
 * Rules: 355.11 / 355.11.b (group restriction; legal subset of original targets at resolution), 337 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DECREE_OF_DISCORD = "ven-107-166";
const DISCIPLINE = "ogn-058-298";

type PickD = Extract<Decision, { kind: "pick" }>;
const O = (might: number, name: string) => ({ domain: "order", might, name });

/** P1's turn with 1 + [chaos]. P2: two 2-Might ORDER units (Alpha at bf1, Beta in base) + an untargeted Gamma (1); Discipline + [2]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { chaos: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", O(2, "Alpha"), "alpha")
    .unit(P2, "base", O(2, "Beta"), "beta")
    .unit(P2, "base", O(1, "Gamma"), "gamma")
    .hand(P1, DECREE_OF_DISCORD, "decree")
    .hand(P2, DISCIPLINE, "disc");
}

/** Decree on {alpha, beta} (2 + 2 = 4 ✓); P2 responds with Discipline on Alpha; Discipline resolves (Alpha 4). */
async function decreeThenDiscipline(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("decree", { targets: ["alpha", "beta"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  expect([...(game.chain()[0]?.targets ?? [])].sort()).toEqual(["alpha", "beta"]);
  await game.p1.passPriority();
  expect(game.p2.can("cast", "disc")).toBe(true);
  await game.p2.cast("disc", { targets: "alpha" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["decree", "disc"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Discipline resolves first (LIFO)
  expect(game.state("alpha").might).toBe(4);
  expect(game.state("beta").might).toBe(2);
  expect(game.chain().map((c) => c.cardId)).toEqual(["decree"]);
  return game;
}

/** Pass priority until the Decree starts resolving; return the subset prompt (or whatever came instead). */
async function toSubsetPrompt(game: Game): Promise<Decision | null> {
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      return d;
    }
  }
  return game.decision();
}

describe("Ruling 9932755e46ead0a7 — Decree of Discord vs a Discipline'd target: return one of the two, not both", () => {
  test("at play time both 2-Might Order units together are a legal group (total 4 ≤ 5)", async () => {
    const game = await board().build();
    const sets = (game.p1.option("cast", "decree")?.fields.find((f) => f.arg === "targets")?.options ?? []).map((s) => [...(s as string[])].sort().join("+"));
    expect(sets).toContain("alpha+beta");
  });

  // Expected (355.11.b): when Decree resolves the group is 4 + 2 = 6 > 5, so the caster is asked to choose a legal SUBSET
  // of the original targets — Alpha alone or Beta alone (Gamma never, both never). Actual: the engine re-checks each
  // target individually only, never re-evaluates the group's total, and returns BOTH units to hand with no prompt.
  test("engine never re-checks the 'total Might ≤ 5' group at resolution: no subset prompt, both units bounced", async () => {
    const game = await decreeThenDiscipline();
    const d = await toSubsetPrompt(game);
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "subset" });
    const offered = (d as PickD).options.map((o) => o.card ?? o.key).sort();
    expect(offered).toEqual(["alpha", "beta"]);
    expect(offered).not.toContain("gamma");
    const both = await game.p1.try((p) => p.pick("alpha", "beta"));
    expect(both.ok).toBe(false);
    // Nothing has been returned while P1 decides.
    expect(game.zoneOf("alpha")).toBe("battlefield-bf1");
    expect(game.zoneOf("beta")).toBe("base");
  });

  test("choosing the 4-Might Alpha alone should return only Alpha (engine returns both, asks nothing)", async () => {
    const game = await decreeThenDiscipline();
    const d = await toSubsetPrompt(game);
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("alpha");
    await game.settle();
    expect(game.zoneOf("alpha")).toBe("hand");
    expect(game.zoneOf("beta")).toBe("base");
    expect(game.zoneOf("gamma")).toBe("base");
    expect(game.zoneOf("decree")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("choosing the 2-Might Beta alone should return only Beta, Alpha stays (engine returns both, asks nothing)", async () => {
    const game = await decreeThenDiscipline();
    const d = await toSubsetPrompt(game);
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("beta");
    await game.settle();
    expect(game.zoneOf("beta")).toBe("hand");
    expect(game.zoneOf("alpha")).toBe("battlefield-bf1");
    expect(game.p2.hand().filter((c) => c === "alpha" || c === "beta")).toEqual(["beta"]);
    expect(game.zoneOf("decree")).toBe("trash");
  });

  // The ruling's bottom line, independent of how the choice is surfaced: never BOTH.
  // Expected: exactly one of alpha/beta ends in P2's hand. Actual: both do.
  test("after Discipline makes the pair total 6, Decree must not return both units (engine bounces both)", async () => {
    const game = await decreeThenDiscipline();
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else if (d.kind === "pick" && d.seat === P1) {
        await game.p1.pick(d.options[0]?.key as string);
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("decree")).toBe("trash");
    const returned = ["alpha", "beta"].filter((u) => game.zoneOf(u) === "hand");
    expect(returned).toHaveLength(1);
    expect(game.zoneOf("gamma")).toBe("base");
  });

  test("control: without the response both original targets (total 4) go back to P2's hand", async () => {
    const game = await board().build();
    await game.p1.cast("decree", { targets: ["alpha", "beta"] });
    await game.settle();
    expect(game.zoneOf("alpha")).toBe("hand");
    expect(game.zoneOf("beta")).toBe("hand");
    expect(game.zoneOf("gamma")).toBe("base");
  });
});
