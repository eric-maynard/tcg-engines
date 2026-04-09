// combat.js — Combat: showdown cards, keyword extraction, combat preview, result detection

/** Render a compact card for the showdown overlay */
function renderShowdownCard(card) {
  const classes = ["showdown-card"];
  if (card.meta?.exhausted) classes.push("exhausted");
  if (card.meta?.stunned) classes.push("stunned");

  const defId = card.definitionId || "";
  const imgId = defId.replace(/^player-[12]-/, "");

  // Extract combat-relevant keywords
  const keywords = getCardKeywords(card);
  let kwHtml = "";
  if (keywords.length > 0) {
    kwHtml = `<div class="sc-keywords">${keywords.map(kw => {
      const kwLower = kw.name.toLowerCase();
      const badgeClass = kwLower === "tank" ? "kw-tank"
        : kwLower === "assault" ? "kw-assault"
        : kwLower === "shield" ? "kw-shield"
        : kwLower === "backline" ? "kw-backline"
        : "kw-other";
      const label = kw.value > 1 ? `${kw.name} ${kw.value}` : kw.name;
      return `<span class="kw-badge ${badgeClass}">${esc(label)}</span>`;
    }).join("")}</div>`;
  }

  // Calculate effective might for display (base + modifiers)
  const baseMight = card.might ?? 0;
  const mightMod = card.meta?.mightModifier ?? 0;
  const staticBonus = card.meta?.staticMightBonus ?? 0;
  const effectiveMight = baseMight + mightMod + staticBonus;

  return `
    <div class="${classes.join(" ")}"
         data-card-id="${esc(card.id)}"
         data-def-id="${esc(defId)}"
         onmouseenter="showPreview(event, this)"
         onmouseleave="hidePreview()"
         ondblclick="openZoom('${esc(card.id)}')">
      ${card.energyCost != null ? `<div class="sc-cost">${card.energyCost}</div>` : ""}
      ${card.might != null ? `<div class="sc-might">${effectiveMight}</div>` : ""}
      <img class="sc-img" src="/card-image/${esc(imgId)}" alt="${esc(card.name)}"
           onerror="this.style.background='linear-gradient(135deg,#201a38,#2a2248)';this.alt='${esc(card.name)}'">
      <div class="sc-name">${esc(card.name)}</div>
      ${kwHtml}
      ${card.meta?.damage > 0 ? `<div class="sc-damage">${card.meta.damage}</div>` : ""}
    </div>
  `;
}

/** Extract combat-relevant keywords from a card */
function getCardKeywords(card) {
  const keywords = [];
  const seen = new Set();

  // Parse from rulesText using [Keyword] or [Keyword N] pattern
  const text = card.rulesText || "";
  const kwRegex = /\[(Tank|Assault|Shield|Backline|Ganking|Evasive|Rush|Ward)(?:\s+(\d+))?\]/gi;
  let match;
  while ((match = kwRegex.exec(text)) !== null) {
    const name = match[1];
    const value = match[2] ? parseInt(match[2]) : 1;
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      keywords.push({ name, value });
    }
  }

  // Merge granted keywords from meta (runtime grants)
  const granted = card.meta?.grantedKeywords || [];
  for (const gk of granted) {
    const key = gk.keyword.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      keywords.push({ name: gk.keyword, value: gk.value || 1 });
    }
  }

  // Only return combat-relevant keywords
  const combatKeywords = ["tank", "assault", "shield", "backline"];
  return keywords.filter(k => combatKeywords.includes(k.name.toLowerCase()));
}

/** Calculate combat preview: total Might for each side including keyword bonuses */
function calculateCombatPreview(attackerUnits, defenderUnits) {
  let attackerMight = 0;
  for (const unit of attackerUnits) {
    let might = (unit.might || 0) + (unit.meta?.mightModifier || 0) + (unit.meta?.staticMightBonus || 0);
    // Assault keyword adds Might while attacking
    const kws = getCardKeywords(unit);
    const assaultKw = kws.find(k => k.name.toLowerCase() === "assault");
    if (assaultKw) might += assaultKw.value;
    attackerMight += Math.max(0, might);
  }

  let defenderMight = 0;
  for (const unit of defenderUnits) {
    let might = (unit.might || 0) + (unit.meta?.mightModifier || 0) + (unit.meta?.staticMightBonus || 0);
    // Shield keyword adds Might while defending
    const kws = getCardKeywords(unit);
    const shieldKw = kws.find(k => k.name.toLowerCase() === "shield");
    if (shieldKw) might += shieldKw.value;
    defenderMight += Math.max(0, might);
  }

  return { attackerMight, defenderMight };
}

// Combat Result Detection & Visualization

/**
 * Detect if combat just resolved by comparing previous and current state.
 * Looks for: showdown ending + battlefield damage/kills.
 */
function detectCombatResult(prevState, newState) {
  if (!prevState || !newState) return;

  const prevShowdown = prevState.interaction?.showdown;
  const newShowdown = newState.interaction?.showdown;

  // Combat just resolved: showdown was active+combat, now it's not
  if (!prevShowdown?.active || !prevShowdown.isCombatShowdown) return;
  if (newShowdown?.active) return;

  const bfId = prevShowdown.battlefieldId;
  const bfZoneId = "battlefield-" + bfId;
  const prevUnits = (prevState.zones || {})[bfZoneId] || [];
  const newUnits = (newState.zones || {})[bfZoneId] || [];

  const newUnitMap = {};
  for (const u of newUnits) newUnitMap[u.id] = u;
  const prevUnitMap = {};
  for (const u of prevUnits) prevUnitMap[u.id] = u;

  const damaged = [];
  const killed = [];

  for (const prev of prevUnits) {
    const curr = newUnitMap[prev.id];
    if (!curr) {
      killed.push({ id: prev.id, name: prev.name });
    } else {
      const prevDmg = prev.meta?.damage || 0;
      const currDmg = curr.meta?.damage || 0;
      if (currDmg > prevDmg) {
        damaged.push({ id: curr.id, name: curr.name, delta: currDmg - prevDmg });
      }
    }
  }

  // Show damage visualization on battlefield cards
  if (damaged.length > 0 || killed.length > 0) {
    setTimeout(() => showCombatDamage(damaged, killed), 100);
  }

  // Determine combat outcome
  const prevBf = prevState.battlefields?.[bfId];
  const newBf = newState.battlefields?.[bfId];
  const attackingPlayer = prevShowdown.attackingPlayer;
  const defendingPlayer = prevShowdown.defendingPlayer;
  const bfName = getBattlefieldName(bfId);

  if (prevBf && newBf && prevBf.controller !== newBf.controller && newBf.controller === attackingPlayer) {
    showCombatOutcome("conquer", bfName, pName(attackingPlayer));
  } else if (killed.length > 0 && newUnits.length === 0) {
    showCombatOutcome("tie", bfName, "");
  } else {
    const attackerKilled = killed.filter(k => {
      const prev = prevUnitMap[k.id];
      return prev && prev.owner === attackingPlayer;
    });
    const defenderKilled = killed.filter(k => {
      const prev = prevUnitMap[k.id];
      return prev && prev.owner !== attackingPlayer;
    });

    if (attackerKilled.length > 0 || defenderKilled.length > 0) {
      if (defenderKilled.length > 0 && attackerKilled.length === 0) {
        showCombatOutcome("conquer", bfName, pName(attackingPlayer));
      } else if (attackerKilled.length > 0 && defenderKilled.length === 0) {
        showCombatOutcome("defend", bfName, pName(defendingPlayer));
      } else {
        if (newBf?.controller === attackingPlayer && prevBf?.controller !== attackingPlayer) {
          showCombatOutcome("conquer", bfName, pName(attackingPlayer));
        } else {
          showCombatOutcome("tie", bfName, "");
        }
      }
    }
  }
}

/** Show floating damage numbers and destroyed overlays on battlefield cards */
function showCombatDamage(damaged, killed) {
  for (const d of damaged) {
    const cardEl = document.querySelector(`[data-card-id="${CSS.escape(d.id)}"]`);
    if (cardEl) {
      const floater = document.createElement("div");
      floater.className = "floating-damage";
      floater.textContent = `+${d.delta}`;
      cardEl.style.position = "relative";
      cardEl.appendChild(floater);
      setTimeout(() => { if (floater.parentNode) floater.remove(); }, 1300);
    }
  }

  for (const k of killed) {
    const cardEl = document.querySelector(`[data-card-id="${CSS.escape(k.id)}"]`);
    if (cardEl) {
      const overlay = document.createElement("div");
      overlay.className = "destroyed-overlay";
      overlay.textContent = "Destroyed";
      cardEl.style.position = "relative";
      cardEl.appendChild(overlay);
      setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 1600);
    }
  }
}

/**
 * Show combat outcome banner in the center of the screen.
 * @param {"conquer"|"defend"|"tie"} outcome
 * @param {string} battlefieldName
 * @param {string} playerName
 */
function showCombatOutcome(outcome, battlefieldName, playerName) {
  const el = document.getElementById("combatOutcome");
  const titleEl = document.getElementById("outcomeTitle");
  const detailEl = document.getElementById("outcomeDetail");
  if (!el || !titleEl || !detailEl) return;

  el.classList.remove("visible", "outcome-conquer", "outcome-defend", "outcome-tie");

  if (outcome === "conquer") {
    el.classList.add("outcome-conquer");
    titleEl.textContent = "Conquer!";
    detailEl.textContent = `${playerName} takes ${battlefieldName}!`;
  } else if (outcome === "defend") {
    el.classList.add("outcome-defend");
    titleEl.textContent = "Defenders Hold!";
    detailEl.textContent = `${battlefieldName} remains defended`;
  } else {
    el.classList.add("outcome-tie");
    titleEl.textContent = "Mutual Destruction!";
    detailEl.textContent = `Forces clash at ${battlefieldName}`;
  }

  // Force reflow to restart animation
  void el.offsetWidth;
  el.classList.add("visible");

  setTimeout(() => { el.classList.remove("visible"); }, 2500);
}
