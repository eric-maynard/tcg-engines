/**
 * Ruling 6170c60083979825 — Glasc Mixologist (SFD-165 → sfd-165-221) · 5 Might · "[Deathknell] — You may play a unit with cost no more
 *     than [3] and no more than [rainbow] from your trash, ignoring its cost."
 *   × Karthus, Eternal (OGN-236 → ogn-236-298) · [3][order] · 3 Might · "Your [Deathknell] effects trigger an additional time."
 *
 * Q: Two Mixologists with [Temporary] sit in my base and die at the start of my Beginning Phase. The first Deathknell brings back
 *    Karthus — does Karthus make the SECOND Mixologist's Deathknell bring back 2 units instead of 1?
 * A: No. The number of Deathknell triggers is fixed from the board at the moment of death. Both Mixologists die (to Temporary) with
 *    Karthus still in the trash, so exactly two Deathknell items exist; Karthus arriving during the first resolution cannot
 *    retroactively add a trigger to the second.
 * Rules: 816 (Temporary), 808.1.d.2 (Deathknell count locked at death), 383 (triggers read the board when the event happens), 326/340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GLASC = "sfd-165-221";
const KARTHUS = "ogn-236-298";
const SKULKER = "ogn-175-298"; // [3] vanilla — a second legal Deathknell play
const PEBBLE = { cardType: "unit", energyCost: 1, might: 2, name: "Pebble" } as const; // a third, so a would-be extra trigger is observable
const TEMPORARY = { grantedKeywords: [{ duration: "permanent" as const, keyword: "Temporary" }] };

/** P2's turn. P1's base: two Mixologists that have been given [Temporary]. P1's trash: Karthus, a Skulker and a Pebble. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: null })
    .base(P1, GLASC, "glascA", TEMPORARY)
    .base(P1, GLASC, "glascB", TEMPORARY)
    .trash(P1, KARTHUS, "karthus")
    .trash(P1, SKULKER, "skulker")
    .trash(P1, PEBBLE, "pebble");
}

const pickKeys = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

/**
 * Drive P1's Beginning Phase to its open main phase: pass every priority window, say YES to every Deathknell opt-in, and play
 * Karthus first, then the Skulker, then (if ever offered) the Pebble. Returns how many opt-ins were asked and what was played.
 */
async function playOutBeginning(game: Game): Promise<{ optIns: number; played: string[] }> {
  let optIns = 0;
  const played: string[] = [];
  for (let i = 0; i < 60; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "yes-no" && d.seat === P1) {
      optIns += 1;
      await game.p1.yes();
    } else if (d.kind === "pick" && d.seat === P1) {
      const keys = pickKeys(d);
      const want = ["karthus", "skulker", "pebble"].find((k) => keys.includes(k));
      if (want) {
        played.push(want);
        await game.p1.pick(want);
      } else if (keys.includes("base")) {
        await game.p1.pick("base");
      } else {
        await game.p1.pick(d.options[0]!.key);
      }
    } else if (d.kind === "order" && d.seat === P1) {
      await game.p1.order([]);
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      throw new Error(`unexpected prompt ${d.kind} for ${d.seat}: ${d.prompt}`);
    }
  }
  return { optIns, played };
}

describe("Ruling 6170c60083979825 — Karthus returned by the first Temporary-killed Mixologist does not double the second one's Deathknell", () => {
  test("premise: both Mixologists carry Temporary + Deathknell; when P1's turn begins the Temporary kill(s) go on the chain for BOTH of them before anything else happens, Karthus still in the trash", async () => {
    const game = await board().build();
    expect(game.state("glascA").keywords).toEqual(expect.arrayContaining(["Deathknell", "Temporary"]));
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(new Set(game.chain().map((c) => c.cardId))).toEqual(new Set(["glascA", "glascB"]));
    expect(game.chain().every((c) => c.triggered)).toBe(true);
    expect(game.zoneOf("karthus")).toBe("trash");
  });

  // Expected: the two Temporary kills are one death event — both Mixologists hit the trash together while Karthus is still in the
  // trash, leaving exactly TWO Deathknell items (one each) on the chain. Actual: the engine puts two separate Temporary chain
  // items and resolves them one at a time, so glascB dies (and its Deathknell fully resolves) before glascA is even killed.
  test("ruling 6170c60083979825 — engine kills the two Temporary Mixologists one at a time instead of simultaneously", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    // Pass priority until the first non-priority prompt (the first Deathknell opt-in).
    for (let i = 0; i < 8 && game.decision()?.kind === "action"; i++) {
      await game.acting().pass();
    }
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.zoneOf("glascA")).toBe("trash");
    expect(game.zoneOf("glascB")).toBe("trash");
    expect(game.zoneOf("karthus")).toBe("trash"); // not on the board at the moment of (either) death
  });

  // Expected: exactly two Deathknell resolutions in total — Karthus from the first, ONE more unit (the Skulker) from the second;
  // the Pebble is never offered and stays in the trash; P1 is asked to opt in exactly twice. Actual: glascA dies after Karthus
  // is already on the board, so its Deathknell triggers twice (three opt-ins, three plays — the Pebble comes back too).
  test("ruling 6170c60083979825 — engine lets Karthus (played by the first Deathknell) double the second Mixologist's Deathknell", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    const { optIns, played } = await playOutBeginning(game);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("karthus")).toBe("base"); // the first Deathknell did bring him back
    expect(played).toEqual(["karthus", "skulker"]);
    expect(optIns).toBe(2);
    expect(game.zoneOf("skulker")).toBe("base");
    expect(game.zoneOf("pebble")).toBe("trash");
    expect(game.p1.trash().toSorted()).toEqual(["glascA", "glascB", "pebble"]);
  });
});
