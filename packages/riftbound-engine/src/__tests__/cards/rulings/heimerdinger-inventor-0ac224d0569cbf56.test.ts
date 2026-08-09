/**
 * Ruling 0ac224d0569cbf56 — Heimerdinger, Inventor (OGN-111 → ogn-111-298) · 3 Might
 *   "I have all [Exhaust] abilities of all friendly legends, units, and gear."
 *   × Malzahar, Fanatic (ogn-113-298) "Kill a friendly unit or gear, [Exhaust]: [Action] — [Add] [rainbow][rainbow]."
 *
 * Q: When Heimerdinger copies Malzahar's [Exhaust] ability, do you still need to kill a unit to use it?
 * A: Yes — the ability is duplicated with ALL of its costs, restrictions and effects: kill a friendly unit or
 *    gear AND exhaust Heimerdinger, then add 2 rainbow. Nuance: Heimerdinger may kill HIMSELF to pay it.
 * Rules: 366 (activated abilities: all costs must be paid), 400.2 ([Add] resolves immediately), 356 (costs).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const HEIMERDINGER = "ogn-111-298";
const MALZAHAR = "ogn-113-298";

/** Malzahar is exhausted so the only live copy of the ability is Heimerdinger's inherited one. */
function board(withPawn = true) {
  const b = scenario().unit(P1, "base", HEIMERDINGER, "heimer").unit(P1, "base", MALZAHAR, "malz", { exhausted: true });
  return withPawn ? b.unit(P1, "base", { might: 1, name: "Pawn" }, "pawn") : b;
}

describe("Ruling 0ac224d0569cbf56 — Heimerdinger's copy of Malzahar's ability keeps the 'kill a friendly unit or gear' cost", () => {
  test("the inherited ability is offered on Heimerdinger and REQUIRES a sacrifice: activating without naming one is refused; nothing happens", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "heimer")).toBe(true);
    const fields = game.p1.option("activate", "heimer")?.fields ?? [];
    const sac = fields.find((f) => f.arg === "sacrifice");
    expect(sac?.required).toBe(true);
    expect(sac?.options as string[]).toEqual(expect.arrayContaining(["pawn", "malz"]));
    const r = await game.p1.try((p) => p.activate("heimer"));
    expect(r.ok).toBe(false);
    expect(game.state("heimer").isExhausted).toBe(false);
    expect(game.zoneOf("pawn")).toBe("base");
    expect(game.p1.power("rainbow")).toBe(0);
  });

  test("paying it in full: Pawn is killed, Heimerdinger exhausts, and [Add] gives 2 rainbow immediately (Malzahar untouched)", async () => {
    const game = await board().build();
    await game.p1.activate("heimer", undefined, { sacrifice: "pawn" });
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.state("heimer").isExhausted).toBe(true);
    expect(game.state("malz").isExhausted).toBe(true); // still exhausted, was not the one used
    expect(game.zoneOf("malz")).toBe("base");
    expect(game.p1.power("rainbow")).toBe(2);
    expect(game.chain()).toEqual([]); // [Add] abilities resolve at once
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("with no OTHER friendly unit or gear than the two champions, the kill cost can still be paid with Malzahar (a friendly unit)", async () => {
    const game = await board(false).build();
    expect(game.p1.can("activate", "heimer")).toBe(true);
    await game.p1.activate("heimer", undefined, { sacrifice: "malz" });
    expect(game.zoneOf("malz")).toBe("trash");
    expect(game.state("heimer").isExhausted).toBe(true);
    expect(game.p1.power("rainbow")).toBe(2);
  });

  // Expected (ruling nuance): Heimerdinger may kill HIMSELF to satisfy "kill a friendly unit" while also
  // exhausting — he ends in the trash and P1 still gets [rainbow][rainbow].
  // Actual: the engine never offers the ability's bearer as its own sacrifice (options: malz | pawn only).
  test("ruling 0ac224d0569cbf56 — Heimerdinger can be killed to pay his own inherited ability's cost", async () => {
    const game = await board().build();
    const sac = game.p1.option("activate", "heimer")?.fields.find((f) => f.arg === "sacrifice");
    expect(sac?.options as string[]).toContain("heimer");
    await game.p1.activate("heimer", undefined, { sacrifice: "heimer" });
    expect(game.zoneOf("heimer")).toBe("trash");
    expect(game.zoneOf("pawn")).toBe("base");
    expect(game.p1.power("rainbow")).toBe(2);
  });
});
