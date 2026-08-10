/**
 * Ruling 5e9dfc8857b334fd — Rumble, Hotheaded (SFD-026 → sfd-026-221) · 4 Might · Mech · "Your Mechs each have [Assault]. When I
 *     conquer, you may recycle another friendly unit to play a Mech from your trash. Reduce its Energy cost by the Might of the unit
 *     you recycled."
 *   × Vilemaw's Lair (ogn-295-298) · Battlefield · "Units can't move from here to base."  (scrape lists unl-060-219 Vilemaw; the
 *     question is about "Vilemaw's", the battlefield.)
 *   Mech in trash: Mega-Mech (ogn-088-298) · [7] · 8 Might · Mech.
 *
 * Q: Rumble conquers Vilemaw's Lair; I recycle a Mech that is AT the Lair for his trigger — may the new Mech be played to the Lair?
 * A: Yes. Rumble's conquer trigger is a chain item; you keep control of the battlefield you just conquered throughout that chain
 *    (even if recycling emptied it), so the Lair is a legal location for the Mech you play from trash.
 * Rules: 187.4.c / 190.4 (battlefield control is not lost while a chain item is resolving), 419.3.b (play via ability → to a
 *        location you control), 416 (recycle).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RUMBLE = "sfd-026-221";
const VILEMAWS_LAIR = "ogn-295-298";
const MEGA_MECH = "ogn-088-298";
const SCRAP = { cardType: "unit", energyCost: 2, might: 3, name: "Scrap Mech", tags: ["Mech"] } as const;

/** P1's turn with [4]. P2 controls the (empty, live) Lair. P1: Rumble + a 3-Might Scrap Mech ready in base; Mega-Mech in trash. */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .battlefield("lair", { controller: P2, def: VILEMAWS_LAIR, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Elsewhere" }, "elsewhere")
    .unit(P1, "base", RUMBLE, "rumble")
    .unit(P1, "base", SCRAP, "scrap")
    .trash(P1, MEGA_MECH, "mega");
}

const offers = (d: Decision | null, card: string) => d?.kind === "pick" && d.options.some((o) => (o.card ?? o.key) === card);

/** Rumble + Scrap walk onto the empty Lair; both pass focus → conquer; drive Rumble's trigger up to the Mech's DESTINATION prompt. */
async function conquerAndRecycleScrap(): Promise<{ game: Game; destination: Extract<Decision, { kind: "pick" }> }> {
  const game = await board().build();
  await game.p1.move(["rumble", "scrap"], "lair");
  expect(game.locationOf("scrap")).toBe("lair");
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.gameState.battlefields.lair?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
  for (let i = 0; i < 30; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "pick" && d.seat === P1 && d.semantics === "destination") {
      return { destination: d, game };
    }
    if (d.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
    } else if (d.seat === P1 && offers(d, "scrap")) {
      await game.p1.pick("scrap"); // the unit recycled as the cost — it is AT the Lair
    } else if (d.seat === P1 && offers(d, "mega")) {
      await game.p1.pick("mega");
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else {
      throw new Error(`unexpected prompt: ${d.kind} for ${d.seat}: ${d.prompt}`);
    }
  }
  throw new Error("never reached the Mech's destination prompt");
}

describe("Ruling 5e9dfc8857b334fd — Rumble's conquer trigger at Vilemaw's Lair may play the Mech to the Lair itself", () => {
  test("Rumble's trigger is a chain item controlled by P1; recycling the Scrap Mech (at the Lair) sends it to the bottom of P1's deck, and the Lair is still P1's", async () => {
    const { game } = await conquerAndRecycleScrap();
    expect(game.zoneOf("scrap")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("scrap");
    expect(game.gameState.battlefields.lair?.controller).toBe(P1);
  });

  test("the destination prompt for Mega-Mech offers the just-conquered Lair (alongside base); choosing it puts Mega-Mech at the Lair for [4] (7 − Scrap's 3)", async () => {
    const { destination, game } = await conquerAndRecycleScrap();
    const keys = destination.options.map((o) => o.key);
    const lairKey = keys.find((k) => /lair/.test(k));
    expect(lairKey).toBeDefined();
    expect(keys).toContain("base");
    expect(keys.some((k) => /bf2/.test(k))).toBe(false); // not a battlefield P1 doesn't control
    await game.p1.pick(lairKey!);
    await game.settle();
    expect(game.locationOf("mega")).toBe("lair");
    expect(game.p1.units("lair").toSorted()).toEqual(["mega", "rumble"]);
    expect(game.p1.energy()).toBe(0);
    expect(game.gameState.battlefields.lair?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
