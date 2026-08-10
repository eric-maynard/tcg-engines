/**
 * Ruling 9b85f01cd2491ac5 — Sigil of the Storm (OGN-287 → ogn-287-298) Battlefield
 *     "When you conquer here, you must recycle one of your runes. (This doesn't choose anything.)"
 *   × Green Father (UNL-195 → unl-195-219, Ivern Legend) "When you conquer or hold, you may exhaust me to replace that
 *     battlefield with a Brush battlefield token."  × Brush (unl-t03).
 *
 * Q: Conquering Sigil of the Storm with the Ivern legend — can I replace it with a Brush and skip the recycle?
 * A: No. Both conquer triggers fire together and both go on the chain. Even if Green Father's replacement resolves
 *    first and the Sigil becomes a Brush, the Sigil trigger is already on the chain and independent of its source, so
 *    it still resolves and you MUST recycle a rune. Only with no runes at all does it do nothing (you still conquer).
 * Rules: 375–377 (triggered abilities exist independently of their source once on the chain), 416 (recycle; as much
 *        as possible), 438 (replace a battlefield).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SIGIL = "ogn-287-298";
const GREEN_FATHER = "unl-195-219";

/** P1's turn, Green Father legend (ready). P2 holds the live Sigil with a 1-Might Sentry. P1: Raider (4) in base and `runes` order runes in the pool. */
function board(runes: number) {
  const s = scenario()
    .legend(P1, GREEN_FATHER, "gf")
    .battlefield("sigil", { controller: P2, def: SIGIL, inert: false, owner: P2 })
    .unit(P2, "sigil", { might: 1, name: "Sentry" }, "sentry")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .rune(P2, "order", { alias: "theirs" });
  for (let i = 0; i < runes; i++) {
    s.rune(P1, "calm", { alias: `r${i + 1}` });
  }
  return s;
}

/** P1 conquers the Sigil; drives to the first real prompt and returns it. */
async function conquerSigil(runes: number): Promise<Game> {
  const game = await board(runes).build();
  await game.p1.move("raider", "sigil");
  await game.settle();
  expect(game.zoneOf("sentry")).toBe("trash");
  expect(game.p1.points()).toBe(1);
  return game;
}

/** Answer prompts until the chain is empty, always saying YES to Green Father and recycling r1 when asked. Records what was asked. */
async function resolveAll(game: Game): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "order") {
      seen.push("order");
      expect(d.seat).toBe(P1);
      // Put Green Father FIRST to resolve (the ruling's "even if the replacement resolves first").
      const gfKey = d.items.find((it) => it.card === "gf")?.key;
      const other = d.items.filter((it) => it.card !== "gf").map((it) => it.key);
      await game.p1.order(gfKey ? [...other, gfKey] : d.items.map((it) => it.key));
      continue;
    }
    if (d.kind === "yes-no") {
      seen.push(`yes-no:${d.source?.cardId ?? "?"}`);
      expect(d.seat).toBe(P1);
      await game.p1.yes();
      continue;
    }
    if (d.kind === "pick") {
      seen.push(`pick:${d.options.map((o) => o.card ?? o.key).sort().join(",")}`);
      expect(d.seat).toBe(P1);
      const r1 = d.options.find((o) => (o.card ?? o.key) === "r1");
      await game.p1.pick(r1 ? "r1" : String(d.options[0]?.key));
      continue;
    }
    await game.settle();
  }
  return seen;
}

describe("Ruling 9b85f01cd2491ac5 — Brushing the Sigil with Green Father does not dodge the Sigil's forced recycle", () => {
  test("conquering the Sigil puts BOTH triggers (Sigil recycle + Green Father) on the chain for P1", async () => {
    const game = await conquerSigil(2);
    const ids = game.chain().map((c) => c.cardId).sort();
    expect(ids).toContain("gf");
    expect(ids).toContain("sigil");
    expect(game.chain().every((c) => c.triggered && c.controller === P1)).toBe(true);
  });

  test("say YES to Green Father (Sigil → Brush) — the Sigil trigger still resolves: P1 must recycle one of two runes (mandatory pick), ending with 1 rune", async () => {
    const game = await conquerSigil(2);
    const seen = await resolveAll(game);
    expect(seen.some((s) => s.startsWith("yes-no"))).toBe(true); // Green Father is optional ("you may exhaust me")
    expect(game.state("gf").isExhausted).toBe(true);
    const under = game.locationOf("raider") as string;
    expect(game.state(under).name).toBe("Brush"); // the Sigil was replaced
    // …and yet a rune was recycled.
    expect(seen.some((s) => s === "pick:r1,r2")).toBe(true); // "one of your runes" — P1's runes only, not P2's
    expect(game.zoneOf("r1")).toBe("runeDeck");
    expect(game.p1.runes()).toEqual(["r2"]);
    expect(game.zoneOf("theirs")).toBe("runePool");
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
  });

  test("with exactly one rune the recycle is forced — Brush or not, P1 ends with no runes in the pool", async () => {
    const game = await conquerSigil(1);
    await resolveAll(game);
    expect(game.state("gf").isExhausted).toBe(true);
    expect(game.zoneOf("r1")).toBe("runeDeck");
    expect(game.p1.runes()).toEqual([]);
  });

  test("the only way out: with NO runes the Sigil trigger does nothing — P1 still conquers (1 point) and may still Brush it", async () => {
    const game = await conquerSigil(0);
    const seen = await resolveAll(game);
    expect(seen.filter((s) => s.startsWith("pick:"))).toEqual([]); // nothing to recycle, nothing asked
    expect(game.p1.points()).toBe(1);
    expect(game.state("gf").isExhausted).toBe(true);
    expect(game.state(game.locationOf("raider") as string).name).toBe("Brush");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
