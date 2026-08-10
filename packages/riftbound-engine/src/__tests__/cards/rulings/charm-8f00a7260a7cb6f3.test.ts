/**
 * Ruling 8f00a7260a7cb6f3 — Charm (OGN-043 → ogn-043-298) × Fight or Flight (OGN-168 → ogn-168-298)
 *
 *   Charm — Spell · Calm · 1+[calm] · Action — "Move an enemy unit."
 *   Fight or Flight — Spell · Chaos · 2 · [Hidden] [Action] — "Move a unit from a battlefield to its base."
 *
 * Q: Must Charm's target AND destination be declared when it is played, or is the destination chosen on resolution?
 * A: Both are declared when Charm is put on the chain; opponents may then respond; on resolution the unit moves to the
 *    declared destination. Nuances: if a (hidden) Fight or Flight in response sends the unit to base and Charm's
 *    declared destination was base, Charm resolves and does nothing; and Fight or Flight cannot change where the
 *    Charmed unit ends up — the destination was already locked.
 * Rules: 355.5 (all choices made when the spell is finalized), 811 (Hidden → played as a Reaction), 340.1 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

/** P1's turn. P2's Foe (3) at P2's bf1 with P2's Fight or Flight hidden there since an earlier turn; bf2 open. P1: Charm + [1][calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
    .hand(P1, CHARM, "charm");
}

/** P2 flips the hidden Fight or Flight in response (Foe is its only legal mover) and it resolves first: Foe → P2's base. */
async function fofInResponse(game: Game): Promise<void> {
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("reveal", "fof")).toBe(true);
  await game.p2.reveal("fof");
  for (let i = 0; i < 3 && game.decision()?.kind === "pick"; i++) {
    await game.acting().pick("foe");
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["charm", "fof"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Fight or Flight resolves
  expect(game.zoneOf("foe")).toBe("base");
  expect(game.chain().map((c) => c.cardId)).toEqual(["charm"]);
}

describe("Ruling 8f00a7260a7cb6f3 — Charm's destination is locked when it is played", () => {
  test("casting Charm asks for the destination IMMEDIATELY (finalization, before anyone has priority); only then is Charm on the chain with P2 able to respond", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "foe" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination", timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["base", "battlefield-bf2"]);
    // Nobody has priority yet — P2 cannot act before the destination is named.
    expect(game.p2.legal()).toEqual([]);
    await game.p1.pick("battlefield-bf2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "charm", controller: P1, targets: ["foe"] })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("un-answered: on resolution Foe moves to the declared destination (bf2) with no further prompt", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "foe" });
    await game.p1.pick("battlefield-bf2");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()?.kind).not.toBe("pick"); // destination is not re-asked at resolution
    await game.settle();
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("foe")).toBe("bf2");
  });

  test("nuance 1 — destination declared as BASE, P2's hidden Fight or Flight sends Foe to base first: Charm then resolves and does nothing (Foe simply stays in base)", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "foe" });
    await game.p1.pick("base");
    await fofInResponse(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("base");
    expect(game.p2.base()).toContain("foe");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance 2 — destination declared as bf2: Fight or Flight cannot change where Foe ends up — after it bounces Foe to base, Charm still moves Foe to bf2", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "foe" });
    await game.p1.pick("battlefield-bf2");
    await fofInResponse(game);
    // No new destination prompt for P1 at resolution.
    await game.p1.passPriority();
    if (game.decision()?.kind === "action") {
      await game.p2.passPriority();
    }
    expect(game.decision()?.kind).not.toBe("pick");
    await game.settle();
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("foe")).toBe("bf2");
  });
});
