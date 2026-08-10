/**
 * Ruling c84fa3281bd648a3 — Fox-Fire (OGN-256 → ogn-256-298) · Spell · [Hidden] [Action] "Kill any number of units at a
 *   battlefield with total Might 4 or less."
 *   × Consult the Past (OGN-083 → ogn-083-298) · Spell · [Hidden] [Reaction] "Draw 2."
 *   × Bandle Tree (OGN-278 → ogn-278-298, Battlefield) "You may hide an additional card here."
 *
 * Q: Can I check my own hidden cards once they are facedown on the battlefield (e.g. Fox-Fire and Consult the Past both
 *    hidden at Bandle Tree — which is which)?
 * A: Yes. A facedown card is private information: its owner may look at it; the opponent may not.
 * Rules: 129.4 (a facedown card's front is Private Information), 128.4 (Private = only its controller may look at it —
 *        the example is exactly a facedown card at a battlefield), 107.3.f, 811 (Hidden).
 */
import { describe, expect, test } from "bun:test";
import { isHiddenView, P1, P2, scenario } from "../../../harness";
import type { CardState, CardView } from "../../../harness";

const FOX_FIRE = "ogn-256-298";
const CONSULT_THE_PAST = "ogn-083-298";
const BANDLE_TREE = "ogn-278-298";

/** P1's turn 3. P1 holds the (live) Bandle Tree with a Holder and hid Fox-Fire AND Consult the Past there earlier. */
function board() {
  return scenario()
    .turn(3)
    .battlefield("bt", { controller: P1, def: BANDLE_TREE, inert: false })
    .unit(P1, "bt", { might: 3, name: "Holder" }, "holder")
    .facedown(P1, "bt", FOX_FIRE, "fox")
    .facedown(P1, "bt", CONSULT_THE_PAST, "consult")
    .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander");
}

describe("Ruling c84fa3281bd648a3 — you may look at your own facedown (hidden) cards; your opponent may not", () => {
  test("both cards sit facedown at Bandle Tree (two hidden cards allowed there) and are hidden", async () => {
    const game = await board().build();
    expect(game.p1.facedown("bt").sort()).toEqual(["consult", "fox"]);
    expect(game.state("fox")).toMatchObject({ isHidden: true, zone: "facedown-bt" });
    expect(game.state("consult")).toMatchObject({ isHidden: true, zone: "facedown-bt" });
    expect(game.view(P2).battlefields.find((b) => b.id === "bt")?.facedownCount).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("the OWNER's view identifies each facedown card (which is Fox-Fire, which is Consult the Past)", async () => {
    const game = await board().build();
    const mine = game.p1.view().zones["facedown-bt"] as readonly CardView[];
    expect(mine).toHaveLength(2);
    expect(mine.every((c) => !isHiddenView(c))).toBe(true);
    const byId = Object.fromEntries((mine as readonly CardState[]).map((c) => [c.id, c]));
    expect(byId.fox).toMatchObject({ defId: FOX_FIRE, name: "Fox-Fire", owner: P1 });
    expect(byId.consult).toMatchObject({ defId: CONSULT_THE_PAST, name: "Consult the Past", owner: P1 });
    // …and P1 can act on either one specifically (play it from hidden).
    expect(game.p1.can("reveal", "fox")).toBe(true);
    expect(game.p1.can("reveal", "consult")).toBe(true);
  });

  test("the OPPONENT's view of the same zone is redacted: two facedown cards owned by P1, no identities", async () => {
    const game = await board().build();
    const theirs = game.p2.view().zones["facedown-bt"] as readonly CardView[];
    expect(theirs).toHaveLength(2);
    expect(theirs.every((c) => isHiddenView(c))).toBe(true);
    for (const c of theirs) {
      expect(c).toMatchObject({ hidden: true, owner: P1, zone: "facedown-bt" });
      expect("name" in c).toBe(false);
      expect("defId" in c).toBe(false);
    }
  });
});
