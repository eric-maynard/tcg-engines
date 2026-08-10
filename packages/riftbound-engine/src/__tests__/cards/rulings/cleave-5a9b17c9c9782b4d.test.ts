/**
 * Ruling 5a9b17c9c9782b4d — Cleave (OGN-004 → ogn-004-298) · Action [1] fury "Give a unit [Assault 3] this turn."
 *   × Defy (OGN-045 → ogn-045-298) · Reaction [1][calm] "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × The Dreaming Tree (OGN-292 → ogn-292-298, battlefield) "When a player chooses a friendly unit here with a spell
 *     for the first time each turn, they draw 1."
 *
 * Q: Cleave targets my unit at the Dreaming Tree; opponent Defies Cleave. Do I still draw from the Tree?
 * A: Yes. Cleave targets when played, so the Tree triggers then; chain = Cleave > Tree trigger > Defy. Defy resolves
 *    (Cleave countered), then the Tree trigger still resolves and you draw.
 * Rules: 383.4.b (targeting triggers fire on finalize), 340 (LIFO), 425.1 (countered spell → trash, no effect).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CLEAVE = "ogn-004-298";
const DEFY = "ogn-045-298";
const DREAMING_TREE = "ogn-292-298";

/** P1's turn. P1 holds the live Dreaming Tree with a 3-Might Dreamer; Cleave + [1]. P2: Defy + [1][calm]. Known P1 deck top. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false, owner: P1 })
    .unit(P1, "tree", { might: 3, name: "Dreamer" }, "dreamer")
    .hand(P1, CLEAVE, "cleave")
    .hand(P2, DEFY, "defy")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

async function cleaveThenDefy(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("cleave", { targets: "dreamer" });
  // Cleave (bottom) > Dreaming Tree draw trigger (top, P1's) — the Tree fired at targeting time.
  expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "tree"]);
  expect(game.chain()[1]).toMatchObject({ controller: P1, triggered: true });
  expect(game.p1.hand()).toEqual([]); // not drawn yet
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "defy")).toBe(true);
  await game.p2.cast("defy", { targets: "cleave" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "tree", "defy"]);
  return game;
}

describe("Ruling 5a9b17c9c9782b4d — Defying Cleave does not stop the Dreaming Tree draw", () => {
  test("chain after both plays: Cleave > Dreaming Tree trigger > Defy", async () => {
    await cleaveThenDefy();
  });

  test("LIFO: Defy resolves first (Cleave countered → trash; no draw yet), the Tree trigger REMAINS on the chain, then resolves and P1 draws 1", async () => {
    const game = await cleaveThenDefy();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Defy resolves
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["tree"]);
    expect(game.p1.hand()).toEqual([]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("end state: P1 drew exactly 1; Cleave did nothing (no Assault granted); both spells in trash; resources spent", async () => {
    const game = await cleaveThenDefy();
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.state("dreamer").grantedKeywords).toEqual([]);
    expect(game.state("dreamer").might).toBe(3);
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: without Defy, the Tree draw resolves first, then Cleave grants the Dreamer Assault 3 this turn", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "dreamer" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Tree trigger resolves
    expect(game.p1.hand()).toEqual(["d1"]);
    await game.settle();
    expect(game.state("dreamer").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
  });
});
