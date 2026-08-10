/**
 * Ruling 2231a3c0375d0a2d — Karthus, Eternal (OGN-236 → ogn-236-298) · Unit · Order · 3 "Your [Deathknell] effects trigger
 *   an additional time."
 *   × Sacred Shears (SFD-172 → sfd-172-221) · Equipment +1 "[Equip] [order] · [Deathknell] — Draw 1."
 *
 * Q: Karthus wearing Sacred Shears dies — does he "see himself", so the Shears' Deathknell draws 2 instead of 1?
 * A: Yes. The Deathknell goes on the chain while Karthus is still on the board, so his passive applies to his own death:
 *    it triggers twice → draw 2 total (just as he doubles Deathknells of units that die together with him).
 * Rules: 428.1.a.1.b / 323.4 (Deathknell is put on the chain noting the unit's info before it leaves), 808 (Deathknell),
 *        522 (statics apply while on the board).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KARTHUS = "ogn-236-298";
const SACRED_SHEARS = "sfd-172-221";
const TASTY_FAEFOLK = "ogn-075-298"; // printed "[Deathknell] — Channel 2 runes exhausted and draw 1."
/** P2's plain kill spell. */
const CULL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "order",
  energyCost: 1,
  name: "Test Cull",
  timing: "action",
} as const;

/** P2's turn with Cull (1). P1's known deck top→: d1, d2, d3. `wearer` has the Shears attached; Karthus present per flag. */
function board(opts: { wearer: "karthus" | "squire"; karthusPresent: boolean }) {
  let b = scenario().active(P2).resources(P2, { energy: 1 }).deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]).hand(P2, CULL, "cull");
  if (opts.wearer === "karthus") {
    b = b.unit(P1, "base", KARTHUS, "karthus", { equippedWith: ["shears"] }).gear(P1, SACRED_SHEARS, "shears", { attachedTo: "karthus" });
  } else {
    b = b.unit(P1, "base", { might: 3, name: "Squire" }, "squire", { equippedWith: ["shears"] }).gear(P1, SACRED_SHEARS, "shears", { attachedTo: "squire" });
    if (opts.karthusPresent) {
      b = b.unit(P1, "base", KARTHUS, "karthus");
    }
  }
  return b;
}

async function cullAndResolve(game: Game, victim: string): Promise<void> {
  await game.p2.cast("cull", { targets: victim });
  await game.settle();
  expect(game.zoneOf(victim)).toBe("trash");
  expect(game.chain()).toEqual([]);
}

describe("Ruling 2231a3c0375d0a2d — Karthus doubles the Sacred Shears Deathknell on his own death", () => {
  test("premise: Karthus wearing the Shears is a 4 (3 + 1) with the Shears attached", async () => {
    const game = await board({ karthusPresent: true, wearer: "karthus" }).build();
    expect(game.state("karthus")).toMatchObject({ attachments: ["shears"], might: 4 });
  });

  test("control: Karthus doubles a PRINTED Deathknell of another friendly unit — Tasty Faefolk dies → its Deathknell is on the chain twice → draw 2, channel 4", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .unit(P1, "base", KARTHUS, "karthus")
      .unit(P1, "base", TASTY_FAEFOLK, "faefolk")
      .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"])
      .hand(P2, CULL, "cull")
      .build();
    const runesBefore = game.p1.runes().length;
    await game.p2.cast("cull", { targets: "faefolk" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Cull resolves → Faefolk dies
    expect(game.chain().filter((c) => c.cardId === "faefolk" && c.triggered)).toHaveLength(2);
    await game.settle();
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
    expect(game.p1.runes()).toHaveLength(runesBefore + 4);
  });

  test("contrast without Karthus: a Squire wearing the Shears dies → Deathknell once → draw exactly 1", async () => {
    const game = await board({ karthusPresent: false, wearer: "squire" }).build();
    await cullAndResolve(game, "squire");
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.state("shears").attachedTo).toBeUndefined();
  });

  // Expected: the Shears' granted "[Deathknell] — Draw 1" is one of "your Deathknell effects", so with Karthus on the board a
  // dying Squire wearing them draws 2. Actual: the engine doubles printed Deathknells only — the Equipment-granted one fires once.
  test("ruling 2231a3c0375d0a2d — Karthus does not double an Equipment-granted Deathknell (Squire with Shears dies beside Karthus → engine draws 1, not 2)", async () => {
    const game = await board({ karthusPresent: true, wearer: "squire" }).build();
    await cullAndResolve(game, "squire");
    expect(game.zoneOf("karthus")).toBe("base");
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
  });

  // Expected (the ruling): Karthus wearing the Shears dies → his passive still applies as the Deathknell is put on the chain
  // (he is on the board at that moment) → it triggers twice → P1 draws 2. Actual: one trigger, one card.
  test("ruling 2231a3c0375d0a2d — Karthus wearing Sacred Shears should see his own death and draw 2; engine draws 1", async () => {
    const game = await board({ karthusPresent: true, wearer: "karthus" }).build();
    await game.p2.cast("cull", { targets: "karthus" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Cull resolves → Karthus dies, Deathknell(s) go on the chain
    expect(game.zoneOf("karthus")).toBe("trash");
    expect(game.chain().filter((c) => c.triggered)).toHaveLength(2);
    await game.settle();
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
  });
});
