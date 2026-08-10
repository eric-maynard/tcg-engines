/**
 * Ruling 218961d1ad1949f0 — Defy (OGN-045 → ogn-045-298) · Reaction · [1]+[calm]
 *     "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Rocket Barrage (SFD-077 → sfd-077-221) · Spell · Mind · [4]+[mind] · "[Repeat] [4][mind] Choose one — Deal 4 to
 *     a unit in a base. Kill a gear."
 *
 * Q: How does Defy interact with a Repeated Rocket Barrage — can you Defy it after Repeat raised what was paid?
 * A: Yes. Defy reads the PRINTED cost ([4] + one pip), not what was paid. Repeat is declared at finalization (it is
 *    an additional cost on the same chain item, not a second spell), so ONE Defy counters the whole spell including
 *    every repeated execution; and you cannot hold Repeat back to declare it after a Defy.
 * Rules: 206 (printed cost), 820 / 746.1.d (Repeat = additional cost paid as the spell is finalized, same item),
 *        425.1.a (countered → no effect, to trash), 340.1 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const ROCKET_BARRAGE = "sfd-077-221";

/** P1's turn: exactly [8] + 2 mind (base + one Repeat). P2: two 5-Might units in base, Defy with exactly [1]+[calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { mind: 2 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", { might: 5, name: "Sitter A" }, "a")
    .unit(P2, "base", { might: 5, name: "Sitter B" }, "b")
    .hand(P1, ROCKET_BARRAGE, "rb")
    .hand(P2, DEFY, "defy");
}

/** P1 casts Rocket Barrage with Repeat paid once: mode 0 ("Deal 4 to a unit in a base") at A, then at B; passes to P2. */
async function castRepeatedBarrage(game: Game): Promise<void> {
  await game.p1.cast("rb", { modes: [0, 0], repeat: 1, targets: ["a", "b"] });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

function defyTargets(game: Game): string[] {
  const field = game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : v === null ? [] : [v]) as string[]))];
}

describe("Ruling 218961d1ad1949f0 — one Defy counters a Repeat-paid Rocket Barrage entirely (printed cost is what Defy reads)", () => {
  test("Repeat is declared as the spell is played: the cast option carries a `repeat` field, paying it drains [8] + 2 mind, and the result is ONE chain item", async () => {
    const game = await board().build();
    const fields = game.p1.option("cast", "rb")?.fields.map((f) => String(f.arg)) ?? [];
    expect(fields).toContain("repeat");
    await game.p1.cast("rb", { modes: [0, 0], repeat: 1, targets: ["a", "b"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "rb", controller: P1, triggered: false });
    // …and there is no later "repeat" action to bolt on after the fact (820: declared during finalization).
    expect(game.p1.legal().some((o) => /repeat/i.test(`${o.key} ${o.label}`))).toBe(false);
  });

  test("Defy may target the Repeat-paid Barrage: its PRINTED cost ([4] + [mind]) satisfies both clauses even though [8] + 2 pips were paid", async () => {
    const game = await board().build();
    await castRepeatedBarrage(game);
    expect(game.p2.can("cast", "defy")).toBe(true);
    expect(defyTargets(game)).toEqual(["rb"]);
    await game.p2.cast("defy", { targets: "rb" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["rb", "defy"]);
  });

  test("Defy resolves first (LIFO) and counters the WHOLE spell — neither the first nor the repeated 'Deal 4' happens; both spells to trash; nothing refunded", async () => {
    const game = await board().build();
    await castRepeatedBarrage(game);
    await game.p2.cast("defy", { targets: "rb" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("rb")).toBe("trash");
    expect(game.state("a")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("b")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // Repeat cost stays paid (425.1.c)
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: un-Defied, the Barrage executes twice — 4 to A, then 4 to B", async () => {
    const game = await board().build();
    await castRepeatedBarrage(game);
    await game.settle();
    expect(game.zoneOf("rb")).toBe("trash");
    expect(game.state("a").damage).toBe(4);
    expect(game.state("b").damage).toBe(4);
  });
});
