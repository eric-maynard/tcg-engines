/**
 * Interaction: is a unit exhausted as a spell's ADDITIONAL COST "chosen with a spell" for The
 * Dreaming Tree — and does it burn the Tree's once-per-turn draw before a real targeting spell?
 *
 *   × The Dreaming Tree (ogn-292-298, Battlefield) "When a player chooses a friendly unit here with a
 *                        spell for the first time each turn, they draw 1."
 *   × Meditation        (ogn-048-298, Spell, calm, 2, Reaction) "As an additional cost to play this,
 *                        you may exhaust a friendly unit. If you do, draw 2. Otherwise, draw 1."
 *   × Discipline        (ogn-058-298, Spell, calm, 2, Reaction) "Give a unit +2 [Might] this turn.
 *                        Draw 1."
 *
 * Rules: 355.7 (a card that chooses a specific game object to affect TARGETS it), 355.9.a.1 ("a
 * unit" = a unit on the board), 355.10.c / 355.10.c.1 (an object referenced only as part of a COST is
 * not targeted — "As an additional cost to play me, kill a friendly unit" targets nothing), 383.4.b.2
 * (a targeting trigger fires when the choosing spell is finalized; its item sits above the spell and
 * resolves first), 383.3.e ("first time each turn").
 *
 * Question. P1 controls the Tree with one ready friendly Sentinel (3) on it. Same turn: (1) Meditation,
 * exhausting the Sentinel as the optional additional cost; (2) Discipline on the Sentinel; (3) a second
 * Discipline on the Sentinel. Cards drawn at each step, and where does the Tree trigger sit?
 *
 * Expected. (1) The exhaust is a cost, not a target → no Tree trigger; Meditation draws 2; the Tree's
 * "first time" is still unused. (2) Discipline targets the Sentinel → first spell-choice this turn →
 * Tree item goes on the chain ABOVE Discipline, resolves first (draw 1), then Discipline: 3 → 5 Might,
 * draw 1. (3) Second Discipline: 5 → 7, draw 1, no Tree trigger. Totals 2 + 2 + 1 = 5 drawn; the Tree
 * fired exactly once, on the first Discipline.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DREAMING_TREE = "ogn-292-298";
const MEDITATION = "ogn-048-298";
const DISCIPLINE = "ogn-058-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P1's turn; P1 holds The Dreaming Tree with a ready 3-Might Sentinel on it; Meditation + 2× Discipline in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { calm: 3 } }) // 3 spells × 2 energy
    .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false, owner: P1 })
    .unit(P1, "tree", { might: 3, name: "Sentinel" }, "sentinel")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, MEDITATION, "meditation")
    .hand(P1, DISCIPLINE, "discipline1")
    .hand(P1, DISCIPLINE, "discipline2");
}

async function bothPass(game: Game): Promise<void> {
  await game.p1.passPriority();
  await game.p2.passPriority();
}

/** Step 1: Meditation paying the optional exhaust with the Sentinel, resolved. */
async function step1(game: Game): Promise<void> {
  await game.p1.cast("meditation", { payOptional: true, targets: "sentinel" });
  await bothPass(game);
}

/** Step 2: first Discipline on the Sentinel, fully resolved (Tree item, then Discipline). */
async function step2(game: Game): Promise<void> {
  await game.p1.cast("discipline1", { targets: "sentinel" });
  await bothPass(game); // Tree item
  await bothPass(game); // Discipline
}

describe("(1) Meditation: the exhausted Sentinel is a COST, not a target (355.10.c) — no Dreaming Tree trigger", () => {
  test("the play bundle offers the Sentinel only as the optional additional-cost object (min 0), and paying it exhausts the Sentinel at play time", async () => {
    const game = await board().build();
    const opt = game.p1.option("cast", "meditation");
    expect(opt?.fields.find((f) => f.arg === "payOptional")).toMatchObject({ options: [false, true], required: false });
    const costUnits = opt?.fields.find((f) => f.name === "targets");
    expect(costUnits).toMatchObject({ min: 0, required: false });
    expect((costUnits?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : v == null ? [] : [v]))).toEqual(["sentinel"]);
    await game.p1.cast("meditation", { payOptional: true, targets: "sentinel" });
    expect(game.state("sentinel").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(4);
  });

  test("on finalization the chain holds ONLY Meditation — no Dreaming Tree item — and Meditation carries no targets", async () => {
    const game = await board().build();
    await game.p1.cast("meditation", { payOptional: true, targets: "sentinel" });
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "meditation", controller: P1, triggered: false });
    expect(game.chain().some((c) => c.cardId === "tree")).toBe(false);
    expect(game.chain()[0]?.targets ?? null).toBeNull();
  });

  test("Meditation resolves: P1 draws exactly 2 (hand 3 → 2 on cast → 4), nothing else; Sentinel stays 3 Might, exhausted", async () => {
    const game = await board().build();
    expect(game.p1.hand()).toHaveLength(3);
    await step1(game);
    expect(game.zoneOf("meditation")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(4);
    expect(game.chain()).toEqual([]);
    expect(game.state("sentinel")).toMatchObject({ isExhausted: true, might: 3 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});

describe("(2) first Discipline: 'a unit' IS a target (355.7) → the Tree's first-time trigger fires NOW, proving Meditation did not use it up", () => {
  test("Discipline offers the (exhausted) Sentinel as a target; on finalization the chain is [Discipline, Dreaming Tree] — the Tree item ABOVE the spell, controlled by P1, Discipline's targets = [sentinel]", async () => {
    const game = await board().build();
    await step1(game);
    const field = game.p1.option("cast", "discipline1")?.fields.find((f) => f.name === "targets");
    expect((field?.options ?? []).flat()).toContain("sentinel");
    await game.p1.cast("discipline1", { targets: "sentinel" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["discipline1", "tree"]);
    expect(game.chain()[1]).toMatchObject({ cardId: "tree", controller: P1, triggered: true });
    expect(game.chain()[0]).toMatchObject({ cardId: "discipline1", targets: ["sentinel"], triggered: false });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("LIFO: the Tree item resolves first — P1 draws 1 while Discipline still waits (Sentinel still 3 Might); then Discipline resolves: Sentinel 3 → 5 this turn and P1 draws 1 more (net +2 this step: 4 → 3 on cast → 5)", async () => {
    const game = await board().build();
    await step1(game);
    expect(game.p1.hand()).toHaveLength(4);
    await game.p1.cast("discipline1", { targets: "sentinel" });
    expect(game.p1.hand()).toHaveLength(3);
    await bothPass(game); // Tree item
    expect(game.p1.hand()).toHaveLength(4);
    expect(game.chain().map((c) => c.cardId)).toEqual(["discipline1"]);
    expect(game.state("sentinel").might).toBe(3);
    await bothPass(game); // Discipline
    expect(game.zoneOf("discipline1")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(5);
    expect(game.state("sentinel")).toMatchObject({ baseMight: 3, might: 5 });
    expect(game.chain()).toEqual([]);
  });
});

describe("(3) second Discipline the same turn: targeted again, but 'first time each turn' is spent — no Tree trigger", () => {
  test("chain holds only the second Discipline; it resolves: Sentinel 5 → 7, P1 draws exactly 1 (5 → 4 on cast → 5)", async () => {
    const game = await board().build();
    await step1(game);
    await step2(game);
    expect(game.p1.hand()).toHaveLength(5);
    await game.p1.cast("discipline2", { targets: "sentinel" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["discipline2"]);
    expect(game.p1.hand()).toHaveLength(4);
    await bothPass(game);
    expect(game.zoneOf("discipline2")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(5);
    expect(game.state("sentinel").might).toBe(7);
  });

  test("totals: 3 spells played, 2 + 2 + 1 = 5 cards drawn (hand 3 → 5), the Tree triggered exactly once and P2 drew nothing; the +4 is 'this turn' only", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    const deck0 = game.p1.deck().length;
    await step1(game);
    await step2(game);
    await game.p1.cast("discipline2", { targets: "sentinel" });
    await game.settle();
    expect(game.p1.trash().sort()).toEqual(["discipline1", "discipline2", "meditation"]);
    expect(game.p1.hand()).toHaveLength(5);
    expect(game.p1.deck()).toHaveLength(deck0 - 5);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.p1.energy()).toBe(0);
    expect(game.state("sentinel").might).toBe(7);
    expect(game.violations()).toEqual([]);
    await game.advanceTurn();
    expect(game.state("sentinel").might).toBe(3);
  });

  test("control: had Meditation NOT been played first, the first Discipline behaves identically (Tree above it, +2 cards) — Meditation's cost neither triggers nor consumes the Tree", async () => {
    const game = await board().build();
    await game.p1.cast("discipline1", { targets: "sentinel" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["discipline1", "tree"]);
    await bothPass(game);
    await bothPass(game);
    expect(game.p1.hand()).toHaveLength(3 - 1 + 2);
    // …and Meditation afterwards (cost = exhaust Sentinel) still adds no Tree item.
    await game.p1.cast("meditation", { payOptional: true, targets: "sentinel" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["meditation"]);
    await bothPass(game);
    expect(game.p1.hand()).toHaveLength(4 - 1 + 2);
  });
});
