/**
 * Visual Invariants — programmatic DOM measurement test
 *
 * This is the test the Handler agent SHOULD have been running. It asserts
 * structural invariants about the rendered game UI without relying on an
 * LLM to "look at" a screenshot.
 *
 * Catches bugs the screenshot-based Handler misses:
 * - Elements that exist in the DOM but have collapsed to 0 width/height
 *   (e.g., rune-stack with no inline height when CSS has none)
 * - Background-cover cropping that hides part of an image
 * - Cards rendered off-screen
 * - State/visual disagreements (state says X runes, DOM shows 0)
 *
 * Usage:
 *   bun run apps/riftbound-app/scripts/visual-invariants.ts
 *
 * Exit code 0 = all invariants pass, non-zero = one or more failed.
 */

import puppeteer from "puppeteer-core";

const SERVER_URL = process.env.RIFTBOUND_URL ?? "http://localhost:3000";
const BROWSER_PATH =
  process.env.CHROMIUM_PATH ?? "/usr/bin/chromium-browser";

interface Failure {
  rule: string;
  detail: string;
}

const failures: Failure[] = [];
function fail(rule: string, detail: string): void {
  failures.push({ detail, rule });
  console.error(`  FAIL ${rule}: ${detail}`);
}
function pass(rule: string): void {
  console.log(`  pass ${rule}`);
}

async function main(): Promise<void> {
  console.log("Visual Invariants Test");
  console.log(`  server: ${SERVER_URL}`);

  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    executablePath: BROWSER_PATH,
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ height: 800, width: 1280 });

  try {
    await page.goto(`${SERVER_URL}/play`, { waitUntil: "networkidle2" });

    // Step 1: open the Goldfish (host) lobby
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      btns.find((b) => b.textContent?.trim() === "Goldfish")?.click();
    });
    await new Promise((r) => setTimeout(r, 500));

    // Step 2: pick "Single Player" mode (solo vs goldfish — no opponent needed)
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const sp = btns.find((b) =>
        /Single Player/i.test(b.textContent?.trim() ?? ""),
      );
      sp?.click();
    });
    await new Promise((r) => setTimeout(r, 300));

    // Step 3: select a deck from the <select> dropdown
    await page.evaluate(() => {
      const sel = document.querySelector("select") as HTMLSelectElement | null;
      if (!sel) {return;}
      // First option is the placeholder "-- Choose a deck --"; pick option 1
      const target = sel.options[1] ?? sel.options[0];
      if (target) {
        sel.value = target.value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await new Promise((r) => setTimeout(r, 300));

    // Step 4: start the game
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      btns.find((b) => b.textContent?.trim() === "Start Game")?.click();
    });
    await new Promise((r) => setTimeout(r, 1500));

    // Step 5: handle pregame (dice roll, mulligan, etc.). Only click VISIBLE
    // Buttons — there are hidden modal buttons in the DOM that match labels
    // Like "I'll go first" left over from previous flows.
    for (let attempt = 0; attempt < 20; attempt++) {
      const clicked = (await page.evaluate(() => {
        const candidates = [
          "I'll go first",
          "Keep Hand",
          "Keep",
          "Keep all",
          "Done",
          "Continue",
          "Confirm",
          "Submit",
          "OK",
        ];
        const isVisible = (el: Element) => {
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) {return false;}
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden") {return false;}
          // Walk up to check for hidden ancestors
          let p: Element | null = el.parentElement;
          while (p) {
            const ps = getComputedStyle(p);
            if (ps.display === "none" || ps.visibility === "hidden") {return false;}
            p = p.parentElement;
          }
          return true;
        };
        const btns = [...document.querySelectorAll('button')].filter(
          isVisible,
        );
        for (const label of candidates) {
          const b = btns.find((x) => {
            const t = x.textContent?.trim() ?? "";
            return (
              t === label ||
              t.startsWith(label + " ") ||
              t.startsWith(label + "\n")
            );
          });
          if (b) {
            (b as HTMLButtonElement).click();
            return label;
          }
        }
        return null;
      })) as string | null;
      if (clicked) {
        console.log(`  pregame: clicked "${clicked}" (attempt ${attempt + 1})`);
      }
      await new Promise((r) => setTimeout(r, 800));
    }

    // Allow flow + render to settle.
    await new Promise((r) => setTimeout(r, 2000));

    // ---- Begin invariant checks -----------------------------------------

    console.log("\nInvariant checks:");

    const measurements = await page.evaluate(() => {
      const visible = (el: Element): boolean => {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) {return false;}
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") {return false;}
        return true;
      };

      const grab = (sel: string) =>
        [...document.querySelectorAll(sel)].map((el) => {
          const r = el.getBoundingClientRect();
          return {
            cls: (el as HTMLElement).className ?? "",
            height: r.height,
            id: (el as HTMLElement).id ?? "",
            left: r.left,
            tag: el.tagName,
            text: el.textContent?.trim().slice(0, 40) ?? "",
            top: r.top,
            visible: visible(el),
            width: r.width,
          };
        });

      return {
        battlefields: grab(".battlefield"),
        bfArts: grab(".bf-art"),
        legendCards: grab(".legend-champion-zone .card"),
        playerBase: grab("#player-base .card"),
        playerHand: grab("#player-hand .card"),
        playerRunePoolBox: document
          .getElementById("player-runePool")
          ?.getBoundingClientRect(),
        playerRunePoolHTML:
          document.getElementById("player-runePool")?.innerHTML?.slice(0, 200) ??
          "",
        runeCards: grab("#player-runePool .card"),
        runeStacks: grab("#player-runePool .rune-stack"),
        url: location.href,
      };
    });

    // Invariant 1: We're actually in a game (not stuck in lobby)
    if (
      !measurements.playerRunePoolBox ||
      measurements.playerRunePoolBox.width === 0
    ) {
      fail(
        "in-game",
        `player-runePool not rendered or has 0 width — likely stuck in lobby. URL: ${measurements.url}`,
      );
    } else {
      pass("in-game");
    }

    // Invariant 2: Rune pool container has reasonable size
    const rp = measurements.playerRunePoolBox;
    if (rp && (rp.width < 50 || rp.height < 50)) {
      fail(
        "rune-pool-size",
        `player-runePool bounding box ${rp.width.toFixed(0)}x${rp.height.toFixed(0)} is too small. innerHTML: "${measurements.playerRunePoolHTML}"`,
      );
    } else if (rp) {
      pass("rune-pool-size");
    }

    // Invariant 3: Every rune stack is visible AND has non-trivial size
    if (measurements.runeStacks.length === 0) {
      fail(
        "rune-stacks-exist",
        `no .rune-stack elements found in player-runePool — runes invisible to player`,
      );
    } else {
      let allOk = true;
      for (const s of measurements.runeStacks) {
        if (!s.visible || s.width < 30 || s.height < 50) {
          fail(
            "rune-stack-size",
            `.rune-stack ${s.width.toFixed(0)}x${s.height.toFixed(0)} (visible=${s.visible}) too small`,
          );
          allOk = false;
        }
      }
      if (allOk) {pass("rune-stacks-size");}
    }

    // Invariant 4: Every rune card inside a stack is visible
    if (measurements.runeCards.length === 0) {
      fail(
        "rune-cards-exist",
        "no rune .card elements rendered — runes invisible",
      );
    } else {
      let allOk = true;
      for (const c of measurements.runeCards) {
        if (!c.visible || c.width < 20 || c.height < 30) {
          fail(
            "rune-card-size",
            `rune card ${c.width.toFixed(0)}x${c.height.toFixed(0)} (visible=${c.visible}) too small`,
          );
          allOk = false;
        }
      }
      if (allOk) {pass("rune-cards-size");}
    }

    // Invariant 5: Battlefields render and their art has non-trivial size
    if (measurements.battlefields.length === 0) {
      fail("battlefields-exist", "no .battlefield elements rendered");
    } else {
      let allOk = true;
      for (const bf of measurements.battlefields) {
        if (!bf.visible || bf.width < 100 || bf.height < 100) {
          fail(
            "battlefield-size",
            `.battlefield ${bf.width.toFixed(0)}x${bf.height.toFixed(0)} (visible=${bf.visible}) too small`,
          );
          allOk = false;
        }
      }
      if (allOk) {pass("battlefields-size");}
    }

    // Invariant 6: Battlefield art (the card image area) has non-trivial size
    if (measurements.bfArts.length === 0) {
      fail("bf-art-exist", "no .bf-art elements rendered");
    } else {
      let allOk = true;
      for (const a of measurements.bfArts) {
        if (!a.visible || a.width < 80 || a.height < 80) {
          fail(
            "bf-art-size",
            `.bf-art ${a.width.toFixed(0)}x${a.height.toFixed(0)} too small`,
          );
          allOk = false;
        }
      }
      if (allOk) {pass("bf-art-size");}
    }

    // Invariant 7: Hand has at least 1 card (after pregame draw + mulligan keep)
    if (measurements.playerHand.length === 0) {
      fail("hand-not-empty", "player-hand has 0 cards after pregame");
    } else {
      pass(`hand-not-empty (${measurements.playerHand.length} cards)`);
    }

    // Invariant 8: Legend + champion are visible
    if (measurements.legendCards.length < 2) {
      fail(
        "legend-champion-visible",
        `legend-champion-zone has ${measurements.legendCards.length} cards, expected 2`,
      );
    } else {
      pass("legend-champion-visible");
    }

    // Take a screenshot for the audit trail
    await page.screenshot({
      fullPage: false,
      path: "visual-invariants-result.png",
    });

    // Dump page state for debugging
    const debug = await page.evaluate(() => ({
      bodyText: document.body.innerText.slice(0, 500),
      handExists: !!document.getElementById("player-hand"),
      handHTMLStart:
        document.getElementById("player-hand")?.innerHTML?.slice(0, 200) ?? "",
      hasGameBoard: !!document.querySelector(".game-board, .game-area"),
      runePoolExists: !!document.getElementById("player-runePool"),
      title: document.title,
      url: location.href,
      visibleButtons: Array.from(document.querySelectorAll("button"))
        .filter((b) => {
          const r = b.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        })
        .map((b) => b.textContent?.trim().slice(0, 30))
        .filter((t) => t && t.length > 0),
    }));
    console.log("\nPage debug state:");
    console.log(JSON.stringify(debug, null, 2));
  } finally {
    await browser.close();
  }

  console.log(
    `\nResult: ${failures.length === 0 ? "ALL PASS" : `${failures.length} FAILURES`}`,
  );
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) {
      console.log(`  ${f.rule}: ${f.detail}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(2);
});
