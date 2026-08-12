/**
 * Ruling f8e488e271d4425f — Hard Bargain (SFD-136 → sfd-136-221) · [Reaction] [2], [Repeat] [2]
 *   "Counter a spell unless its controller pays [2]."
 *
 * Q: I cast Hard Bargain paying its [Repeat]; my opponent answers with their own Hard Bargain. Does that counter
 *    both instances or only one?
 * A: Both — because there is only ONE spell. Paying [Repeat] doubles the effect of a single card on the chain; it
 *    does not create a second chain item. The opposing Hard Bargain counters the whole thing unless I pay [2].
 * Rules: 425 ([Repeat] repeats a spell's effect; the spell stays one chain item), 340 (LIFO), 426 (Counter).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HARD_BARGAIN = "sfd-136-221";

/** A plain [1] "draw 1" spell for P2 to have on the chain in the first place. */
const STUDY = {
  abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  name: "Study",
} as const;

/**
 * P2's turn. P1: Hard Bargain and [6] (base [2] + [Repeat] [2] + the [2] ransom). P2: Study + their own Hard
 * Bargain and EXACTLY [3] — enough for both cards and nothing left to buy Study out of a counter.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 6 })
    .resources(P2, { energy: 3 })
    .hand(P2, STUDY, "study")
    .hand(P2, HARD_BARGAIN, "theirs")
    .hand(P1, HARD_BARGAIN, "mine");
}

/** P2 casts Study; P1 answers with a REPEATED Hard Bargain; P2 answers with their own Hard Bargain. */
async function repeatedBargainAnswered(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("study");
  await game.p2.passPriority();
  await game.p1.cast("mine", { repeat: 1, targets: "study" });
  expect(game.p1.energy()).toBe(2); // [2] base + [2] Repeat
  await game.p1.passPriority();
  await game.p2.cast("theirs", { targets: "mine" });
  return game;
}

describe("Ruling f8e488e271d4425f — a [Repeat]ed Hard Bargain is still ONE spell, countered as a whole", () => {
  test("paying [Repeat] adds no second chain item: the chain is Study + one Hard Bargain", async () => {
    const game = await board().build();
    await game.p2.cast("study");
    await game.p2.passPriority();
    await game.p1.cast("mine", { repeat: 1, targets: "study" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["study", "mine"]);
    expect(game.chain().filter((c) => c.cardId === "mine")).toHaveLength(1);
  });

  test("the opposing Hard Bargain chooses that single item — the whole repeated spell is at stake", async () => {
    const game = await repeatedBargainAnswered();
    expect(game.chain().map((c) => c.cardId)).toEqual(["study", "mine", "theirs"]);
    expect(game.chain().find((c) => c.cardId === "theirs")?.targets).toEqual(["mine"]);
  });

  test("declining to pay [2] counters the entire thing: my Hard Bargain is trashed and Study survives to resolve", async () => {
    const game = await repeatedBargainAnswered();
    await game.p2.passPriority();
    await game.p1.passPriority();
    // Their Hard Bargain resolves: I may pay [2] to save mine.
    const d = game.decision();
    expect(d).toMatchObject({ seat: P1 });
    if (d?.kind === "yes-no") await game.p1.no();
    else if (d?.kind === "pick") await game.p1.pick(d.options[d.options.length - 1]!.key);
    await game.settle();
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.zoneOf("study")).toBe("trash"); // resolved (drew a card), not countered
    expect(game.p1.energy()).toBe(2); // nothing more paid; the Repeat cost is NOT refunded
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("paying the [2] saves the whole repeated spell instead — it survives and counters Study", async () => {
    const game = await repeatedBargainAnswered();
    await game.p2.passPriority();
    await game.p1.passPriority();
    // Their Hard Bargain resolves first: P1 pays the ransom, so P1's (repeated) Hard Bargain is NOT countered.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("mine")).toBe("chain"); // survived — still one item, still repeated
    // A fresh priority window opens on the surviving Hard Bargain; both pass and it resolves.
    await game.p1.passPriority();
    await game.p2.passPriority();
    // P2 has [0] left, so the "unless its controller pays [2]" is unaffordable and Study is countered outright.
    expect(game.p2.energy()).toBe(0);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("study")).toBe("trash"); // countered
    expect(game.p2.hand()).toEqual([]); // Study never drew
    expect(game.violations()).toEqual([]);
  });
});
