/**
 * Ruling b0ae3430a976689a — Sprite token (OGN-274 → ogn-274-298, 3 Might [Temporary]) holding Rockfall Path (SFD-216 →
 *     sfd-216-221, Battlefield: "Units can't be played here.") with Mischievous Marai (UNL-003 → unl-003-219, 2 Might,
 *     "[Hidden] When you play me to a battlefield, deal 2 to an enemy unit here.") hidden there.
 *
 * Q: I hold Rockfall Path with a Sprite and hide Mischievous Marai there. Next turn, can I flip and play the Marai there?
 *    If not, what happens?
 * A: No. Playing the hidden unit at Rockfall Path is an illegal play; it is rewound and the card stays facedown, unplayable.
 *    Consequently, when you lose control of the battlefield (e.g. the Temporary Sprite dies and nothing else of yours is
 *    there) the hidden Marai goes to the trash.
 * Rules: 811.1.b / 811.1.d.1 (Hide; a hidden permanent is played TO that battlefield), Rockfall Path's restriction,
 *        Temporary (killed at the start of your Beginning Phase), 190.4.c + 323.7 (control lost → hidden card trashed).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ROCKFALL_PATH = "sfd-216-221";
const SPRITE = "ogn-274-298";
const MISCHIEVOUS_MARAI = "unl-003-219";

/**
 * P1's turn 2. bf1 = Rockfall Path (live), held by P1's Sprite token; with `anchor`, a non-Temporary Anchor (2) stands there too.
 * P1: Marai in hand + [rainbow] to hide it. P2: a Scout (3) at P2's bf2 (an "enemy unit" for Marai's text elsewhere).
 */
function board(anchor = false) {
  const b = scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1, def: ROCKFALL_PATH, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", SPRITE, "sprite")
    .unit(P2, "bf2", { might: 3, name: "Scout" }, "scout")
    .hand(P1, MISCHIEVOUS_MARAI, "marai");
  return anchor ? b.unit(P1, "bf1", { might: 2, name: "Anchor" }, "anchor") : b;
}

/** Hide the Marai at Rockfall Path (legal), with an Anchor there so the Path stays P1's; go round to P1's next turn. */
async function hiddenAndBack(): Promise<Game> {
  const game = await board(true).build();
  expect(game.p1.can("hide", "marai")).toBe(true);
  await game.p1.hide("marai", "bf1");
  expect(game.zoneOf("marai")).toBe("facedown-bf1");
  expect(game.p1.power("rainbow")).toBe(0);
  await game.advanceTurn(); // → P2
  await game.advanceTurn(); // → P1 (the Temporary Sprite dies here; the Anchor keeps the Path)
  expect(game.turnPlayer()).toBe(P1);
  expect(game.zoneOf("sprite")).toBe("gone");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.zoneOf("marai")).toBe("facedown-bf1");
  return game;
}

describe("Ruling b0ae3430a976689a — Marai hidden at Rockfall Path can never be played there; it is trashed when the Path is lost", () => {
  test("hiding Mischievous Marai at Rockfall Path while the Sprite holds it is LEGAL (hiding is not playing)", async () => {
    const game = await board().build();
    await game.p1.hide("marai", "bf1");
    expect(game.zoneOf("marai")).toBe("facedown-bf1");
    expect(game.state("marai").isHidden).toBe(true);
    expect(game.p1.facedown("bf1")).toEqual(["marai"]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("next turn (Path still mine via the Anchor): 'unhide and play it here' is NOT a legal action; forcing it is rejected and rewound — the Marai stays facedown, no trigger, no damage anywhere", async () => {
    const game = await hiddenAndBack();
    expect(game.p1.can("reveal", "marai")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "marai")).toBe(false);
    const r = await game.p1.try((p) => p.reveal("marai"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("marai")).toBe("facedown-bf1");
    expect(game.state("marai").isHidden).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.state("scout").damage).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("nor can it be hard-cast from hand TO Rockfall Path (only base / other controlled battlefields are destinations)", async () => {
    const game = await board().build();
    const dests = game.p1.option("play", "marai")?.fields.find((f) => f.arg === "to")?.options ?? [];
    expect(dests).toContain("base");
    expect(dests).not.toContain("battlefield-bf1");
  });

  test("consequence as asked (Sprite alone holds the Path): at the start of my next turn [Temporary] kills the Sprite, I have nothing there, control of Rockfall Path is lost — and the hidden Marai goes to my trash, never played", async () => {
    const game = await board().build();
    await game.p1.hide("marai", "bf1");
    await game.advanceTurn(); // → P2
    expect(game.zoneOf("marai")).toBe("facedown-bf1"); // fine through the opponent's turn
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    await game.advanceTurn(); // → P1: Beginning Phase kills the Sprite
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("sprite")).toBe("gone");
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.zoneOf("marai")).toBe("trash");
    expect(game.p1.trash()).toContain("marai");
    expect(game.p1.facedown("bf1")).toEqual([]);
    expect(game.state("scout").damage).toBe(0); // its play trigger never happened
    expect(game.violations()).toEqual([]);
  });
});
