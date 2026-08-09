/**
 * Interaction (deck construction): Super Mega Death Rocket! (ogn-252-298) — Jinx's Signature spell,
 * fury+chaos, "Deal 5 to a unit. When you conquer, you may discard 1 to return this from your trash…"
 *   × Loose Cannon (ogn-251-298)        — Champion Legend, tag Jinx,  fury/chaos
 *   × Dark Child - Starter (ogs-017-024) — Champion Legend, tag Annie, fury/chaos
 *
 * Rules: 103.1.b.1 / 103.1.b.4 (Domain Identity — a two-domain card needs BOTH domains in the identity),
 * 103.2.b (max 3 copies of a name), 103.2.d (up to 3 Signature cards sharing the legend's Champion tag),
 * 103.2.d.1 (sum total of Signature cards ≤ 3 regardless of name), 103.2.d.2 (every Signature card must
 * carry the Champion tag of the deck's Champion Legend).
 *
 * Question. Side A: a Loose Cannon (Jinx) deck with 3x SMDR — legal? With a 4th — rejected, and under
 * which rule(s)? Side B: a Dark Child (Annie, same fury/chaos identity) deck with 1x SMDR — Domain
 * Identity is satisfied, so is it still rejected because SMDR's Champion tag (Jinx) ≠ Annie? And does the
 * dataset even mark ogn-252-298 as a Signature card with tag Jinx, or is 103.2.d.2 silently skipped?
 *
 * Expected: A: 3x legal; 4x fails 103.2.b (name cap) AND 103.2.d.1 (signature total). B: rejected under
 * 103.2.d.2 — Domain Identity passing is necessary but not sufficient. Signature status is a printed
 * characteristic, so the card data must carry isSignature=true and tags=["Jinx"].
 */
import { describe, expect, test } from "bun:test";
import type { CardDefLike, CardPool } from "../../../harness";
import { loadDefaultCardPool } from "../../../harness";
import { validateDeck } from "../../../validators/deck-validators";

const SMDR = "ogn-252-298";
const LOOSE_CANNON = "ogn-251-298"; // legend, Jinx, fury/chaos
const DARK_CHILD = "ogs-017-024"; // legend, Annie, fury/chaos
const JINX_REBEL = "ogn-202-298"; // champion unit, tag Jinx, chaos
const ANNIE_FIERY = "ogs-001-024"; // champion unit, tag Annie, fury

/** 3-of playsets of distinct-name, single-domain fury/chaos non-champion, non-Jinx/Annie cards. */
function filler(pool: CardPool, count: number): CardDefLike[] {
  const seen = new Set<string>();
  const playables = pool
    .all()
    .filter(
      (c) =>
        (c.cardType === "unit" || c.cardType === "spell") &&
        (c.domain === "fury" || c.domain === "chaos") &&
        c.isChampion !== true &&
        c.isSignature !== true &&
        !(c.tags ?? []).some((t) => t === "Jinx" || t === "Annie") &&
        c.name !== "Super Mega Death Rocket!",
    )
    .filter((c) => (seen.has(c.name ?? "") ? false : Boolean(seen.add(c.name ?? ""))));
  const out = playables.flatMap((c) => [c, c, c]);
  expect(out.length).toBeGreaterThanOrEqual(count);
  return out.slice(0, count);
}

/** Both sides: `legend`/`champion` deck (fury/chaos identity) with `smdrCopies` SMDR + filler to 40. */
async function deck(side: "jinx" | "annie", smdrCopies: number) {
  const pool = await loadDefaultCardPool();
  const legend = pool.get(side === "jinx" ? LOOSE_CANNON : DARK_CHILD)!;
  const champion = pool.get(side === "jinx" ? JINX_REBEL : ANNIE_FIERY)!;
  const smdr = pool.get(SMDR)!;
  const rune = pool.all().find((c) => c.cardType === "rune" && c.domain === "fury")!;
  const battlefields = pool.all().filter((c) => c.cardType === "battlefield" && c.domain === undefined).slice(0, 3);
  const mainDeck = [...Array.from({ length: smdrCopies }, () => smdr), ...filler(pool, 40 - smdrCopies)];
  expect(mainDeck).toHaveLength(40);
  return validateDeck({
    battlefields,
    chosenChampion: champion,
    legend,
    mainDeck,
    runeDeck: Array.from({ length: 12 }, () => rune),
  } as never);
}

describe("Super Mega Death Rocket! (Signature · Jinx) — Loose Cannon accepts it, Dark Child must not", () => {
  // BUG (data) — expected: Signature is a printed characteristic; ogn-252-298 must carry
  // isSignature: true and tags: ["Jinx"] so 103.2.d/103.2.d.2 can be enforced. Actual: the card
  // definition prints neither flag nor tag, so every Signature check on it is silently skipped.
  test("card data marks ogn-252-298 as a Signature card with Champion tag Jinx (103.2.d)", async () => {
    const pool = await loadDefaultCardPool();
    const smdr = pool.get(SMDR)!;
    expect(smdr.name).toBe("Super Mega Death Rocket!");
    expect(smdr.domain).toEqual(["fury", "chaos"]);
    expect(smdr.isSignature).toBe(true);
    expect(smdr.tags ?? []).toContain("Jinx");
  });

  test("control: both legends share the fury/chaos Domain Identity, so SMDR (fury+chaos) satisfies 103.1.b.4 in either deck", async () => {
    const pool = await loadDefaultCardPool();
    expect(pool.get(LOOSE_CANNON)).toMatchObject({ championTag: "Jinx", domain: ["fury", "chaos"] });
    expect(pool.get(DARK_CHILD)).toMatchObject({ championTag: "Annie", domain: ["fury", "chaos"] });
    for (const side of ["jinx", "annie"] as const) {
      const r = await deck(side, 1);
      expect(r.errors.map((e) => e.code)).not.toContain("DOMAIN_IDENTITY_VIOLATION");
    }
  });

  test("Side A: Loose Cannon (Jinx) deck with 3x SMDR is legal (103.2.d — up to 3 Signature cards of the legend's tag; 103.2.b — 3 of a name)", async () => {
    const r = await deck("jinx", 3);
    expect(r).toEqual({ errors: [], valid: true });
  });

  test("Side A: a 4th SMDR is rejected — at least the 103.2.b name cap (TOO_MANY_COPIES naming the card)", async () => {
    const r = await deck("jinx", 4);
    expect(r.valid).toBe(false);
    const copies = r.errors.filter((e) => e.code === "TOO_MANY_COPIES");
    expect(copies).toHaveLength(1);
    expect(copies[0]!.message).toContain("Super Mega Death Rocket!");
    expect(copies[0]!.message).toContain("4");
  });

  // BUG — expected (103.2.d.1): 4 Signature cards also breaches the "sum total of 3 Signature cards"
  // cap, so the validator should report TOO_MANY_SIGNATURE_CARDS alongside TOO_MANY_COPIES.
  // Actual: SMDR carries no Jinx tag / isSignature flag, so countSignatureCards sees 0 and only the
  // name-cap error is produced.
  test("4x SMDR in a Jinx deck ALSO reports the 103.2.d.1 signature-total breach (TOO_MANY_SIGNATURE_CARDS)", async () => {
    const r = await deck("jinx", 4);
    expect(r.valid).toBe(false);
    expect(r.errors.map((e) => e.code).sort()).toEqual(["TOO_MANY_COPIES", "TOO_MANY_SIGNATURE_CARDS"]);
  });

  // BUG — expected (103.2.d.2): "All of the Signature cards must have the Champion tag that corresponds
  // to the Champion Legend of the deck" — an Annie deck may not run Jinx's Signature spell even though
  // Domain Identity (fury/chaos) is satisfied; validateDeck must return valid:false with
  // SIGNATURE_TAG_MISMATCH naming the card. Actual: validateSignatureTags keys off card.isSignature,
  // which the dataset never sets on ogn-252-298, so the check never fires and the deck is accepted.
  test("Side B — Dark Child (Annie) deck with 1x SMDR is rejected under 103.2.d.2 (SIGNATURE_TAG_MISMATCH), Domain Identity notwithstanding", async () => {
    const r = await deck("annie", 1);
    expect(r.errors.map((e) => e.code)).not.toContain("DOMAIN_IDENTITY_VIOLATION");
    expect(r.valid).toBe(false);
    const sig = r.errors.filter((e) => e.code === "SIGNATURE_TAG_MISMATCH");
    expect(sig).toHaveLength(1);
    expect(sig[0]!.message).toContain("Super Mega Death Rocket!");
    expect(sig[0]!.message).toContain("Annie");
  });

  test("Side B control: the same Annie deck with the SMDR slot filled by ordinary fury/chaos filler is legal — the rejection above is about the Signature tag, nothing else", async () => {
    const r = await deck("annie", 0);
    expect(r).toEqual({ errors: [], valid: true });
  });
});
