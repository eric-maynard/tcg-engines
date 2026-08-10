/**
 * Ruling 6b62dd3994a5ac1f — Glasc Mixologist (SFD-165 → sfd-165-221) · Unit · Order · [5][order] · 5 Might
 *     "[Deathknell] — You may play a unit with cost no more than [3] and no more than [rainbow] from your trash, ignoring its cost."
 *   × Dusk Rose Lab (UNL-209 → unl-209-219) · Battlefield "At the start of your Beginning Phase, you may kill a unit you control
 *     here to draw 1. (This happens before scoring.)"
 *   Here the Mixologist is TEMPORARY ("At the start of your Beginning Phase, kill me").
 *
 * Q: My only unit at Dusk Rose Lab is a Temporary Glasc Mixologist. At the start of my turn can I feed it to the Lab, and can
 *    the Deathknell'd unit be played onto the Lab?
 * A: Yes to both. Temporary and the Lab trigger together; as controller I order them and resolve the Lab first — kill the
 *    Mixologist (cost), draw 1; its Deathknell triggers and may play a unit from trash to the battlefield where it died (the
 *    Lab), even though that battlefield is now unoccupied. The Temporary trigger then resolves and does nothing.
 * Rules: 315.2 (start-of-Beginning triggers), 383.3.d (controller orders simultaneous triggers), 808 / 734.1.d.2
 *        (Deathknell), FAQ: Deathknell plays may go where the unit died.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GLASC = "sfd-165-221";
const DUSK_ROSE_LAB = "unl-209-219";
const TEMPORARY = { grantedKeywords: [{ duration: "permanent", keyword: "Temporary" }] } as const;
const REVIVED = { cardType: "unit", energyCost: 2, might: 2, name: "Revived Help" };

/** P2 is about to end turn 2. P1 controls the live Dusk Rose Lab holding ONLY a Temporary Glasc Mixologist; P1's trash: a 2-cost unit. Deck top d1..d4. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("lab", { controller: P1, def: DUSK_ROSE_LAB, inert: false, owner: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "lab", GLASC, "glasc", TEMPORARY)
    .trash(P1, REVIVED, "revived")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3", "d4"]);
}

/** P2 ends the turn → P1's Beginning Phase with both triggers pending; P1 accepts the Lab (its only unit there, the Mixologist, is the price). */
async function intoBeginningLabAccepted(): Promise<Game> {
  const game = await board().build();
  expect(game.state("glasc").keywords).toEqual(expect.arrayContaining(["Deathknell", "Temporary"]));
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  expect(game.chain().map((c) => c.cardId).toSorted()).toEqual(["glasc", "lab"]);
  expect(game.chain().every((c) => c.controller === P1 && c.triggered)).toBe(true);
  expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "lab" } });
  await game.p1.yes();
  const d = game.decision();
  if (d?.kind === "pick" && d.source?.cardId === "lab") {
    expect(d.options.map((o) => o.key)).toEqual(["glasc"]);
    await game.p1.pick("glasc");
  }
  return game;
}

/** Walk the Beginning-Phase chain: accept the trigger order offer, opt into the Deathknell, pick Revived, prefer the Lab as destination. */
async function resolveBeginning(game: Game): Promise<{ sawOrder: boolean; destinationKeys: string[] | null }> {
  let sawOrder = false;
  let destinationKeys: string[] | null = null;
  for (let i = 0; i < 24 && game.phase() === "beginning"; i++) {
    const d: Decision | null = game.decision();
    if (!d) {
      break;
    }
    if (d.kind === "order") {
      expect(d.seat).toBe(P1);
      expect(d.items.map((it) => it.card).toSorted()).toEqual(["glasc", "lab"]);
      sawOrder = true;
      await game.acceptTriggerOrder(); // listed order keeps the Lab on top → it resolves before Temporary
    } else if (d.kind === "yes-no") {
      expect(d).toMatchObject({ seat: P1, source: { cardId: "glasc" } }); // the Deathknell "you may"
      await game.p1.yes();
    } else if (d.kind === "pick" && d.seat === P1) {
      const keys = d.options.map((o) => o.key);
      if (keys.includes("revived")) {
        await game.p1.pick("revived");
      } else {
        destinationKeys = keys;
        await game.p1.pick(keys.find((k) => k.includes("lab")) ?? keys[0]!);
      }
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  return { destinationKeys, sawOrder };
}

describe("Ruling 6b62dd3994a5ac1f — Temporary Mixologist fed to Dusk Rose Lab; Deathknell replays a unit onto the Lab", () => {
  test("start of P1's Beginning Phase: Temporary AND the Lab trigger together (both P1's); accepting the Lab kills the Mixologist as its cost, which adds its Deathknell to the chain — and P1, controlling the simultaneous triggers, is offered their ORDER", async () => {
    const game = await intoBeginningLabAccepted();
    expect(game.zoneOf("glasc")).toBe("trash"); // paid: "kill a unit you control here"
    expect(game.chain().filter((c) => c.cardId === "glasc" && c.triggered).length).toBeGreaterThanOrEqual(1); // Temporary + Deathknell items
    expect(game.chain().some((c) => c.cardId === "lab")).toBe(true);
    let sawOrder = false;
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.source?.cardId === "glasc") {
        await game.p1.yes();
        continue;
      }
      if (d?.kind === "order") {
        expect(d.seat).toBe(P1);
        expect(d.items.map((it) => it.card).toSorted()).toEqual(["glasc", "lab"]);
        sawOrder = true;
      }
      break;
    }
    expect(sawOrder).toBe(true);
  });

  test("resolving Lab-first: P1 draws 1 off the Lab, the Deathknell plays Revived Help from the trash for free, and the Temporary trigger — its unit already gone — resolves doing nothing; P1 reaches the main phase with d1 (Lab) + d2 (draw step)", async () => {
    const game = await intoBeginningLabAccepted();
    const { sawOrder } = await resolveBeginning(game);
    expect(sawOrder).toBe(true);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("glasc")).toBe("trash");
    expect(game.p1.trash()).not.toContain("revived");
    expect(["base", "battlefield-lab"]).toContain(game.zoneOf("revived"));
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
    expect(game.p1.resources().energy).toBe(0); // "ignoring its cost" (pool was empty anyway — nothing went negative)
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // Expected: the Deathknell play may go to the battlefield where the Mixologist died — the Lab — even though it is now
  // unoccupied; P1 is offered "battlefield-lab" as a destination, Revived Help lands there and P1 holds the Lab again.
  // Actual: the engine offers no destination at all and drops Revived Help into P1's base; the Lab is left uncontrolled.
  test("ruling 6b62dd3994a5ac1f — Deathknell'd unit should be playable onto the (now empty) Dusk Rose Lab; engine forces it to base", async () => {
    const game = await intoBeginningLabAccepted();
    const { destinationKeys } = await resolveBeginning(game);
    expect(destinationKeys).not.toBeNull();
    expect(destinationKeys ?? []).toContain("battlefield-lab");
    await game.settle();
    expect(game.zoneOf("revived")).toBe("battlefield-lab");
    expect(game.gameState.battlefields.lab?.controller).toBe(P1);
  });
});
