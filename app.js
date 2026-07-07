// ===== Radix Spine — interaction logic =====
// Clinical constants & scoring data live in data.js (loaded first).
// This file ports the original vetted logic verbatim, adapted to the
// Apple-native single-page DOM. It MUST NOT redeclare data.js constants.

"use strict";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const PAGES = ["landing", "cervical", "thoracic", "lumbar", "symptom", "sources", "compare"];

const state = {
  level: "L4-L5",
  morphology: "paracentral",
  cervicalLevel: "C6-C7",
  thoracicLevel: "T8-T9",
  page: "landing",
  symptomEntries: {
    axial: { side: "left", selections: new Set() },
    pain: { side: "left", selections: new Set() },
    burning: { side: "left", selections: new Set() },
    numbness: { side: "left", selections: new Set() },
    weakness: { side: "left", selections: new Set() },
    exam: { side: "left", selections: new Set() },
  },
};

const EN_DASH = "\u2013";
const dash = (s) => s.replace(/-/g, EN_DASH);
const levelId = (lvl) => lvl.replace(/-/g, "");

// Set an element's text content if it exists (null-safe).
const setText = (sel, val) => { const el = $(sel); if (el) el.textContent = val; };

// ===================================================================
// Dermatome map helpers (image-based)
// ===================================================================
function getDermatomeMapSrc(root) {
  if (SOURCE_BASED_THORACIC_SOURCES[root]) return SOURCE_BASED_THORACIC_SOURCES[root];
  return DERMATOME_HIGHLIGHT_SOURCES[root] || HUMAN_DERMATOME_SRC;
}
function getDermatomeMapAttribution(root) {
  return SOURCE_BASED_THORACIC_SOURCES[root]
    ? SOURCE_BASED_THORACIC_ATTRIBUTION
    : HUMAN_MAP_ATTRIBUTION;
}
function getSpotlightCenterY(root) {
  return HUMAN_SPOTLIGHT_CENTERS[root] || 475;
}

// Render an image-based dermatome map into a `.dermatome-map` container.
// Also updates the sibling `.map-active-root` badge.
function renderHumanMap(containerSelector, root, regionLabel, testIdPrefix) {
  const container = $(containerSelector);
  if (!container) return;
  const src = getDermatomeMapSrc(root);
  const attribution = getDermatomeMapAttribution(root);
  const landmark = HUMAN_LANDMARKS[root] || { landmark: "", note: "" };

  container.innerHTML = `
    <div class="human-map-layout">
      <button type="button" class="human-map-trigger"
        data-open-map-viewer data-root="${root}" data-region="${regionLabel}"
        data-testid="button-open-${testIdPrefix}-map-viewer"
        aria-label="Enlarge ${regionLabel} dermatome map for ${root}">
        <img class="dermatome-base-img" src="${src}"
          alt="Full-body anterior and posterior dermatome map highlighting ${root}"
          loading="lazy" decoding="async"
          onerror="if(this.src.indexOf('${HUMAN_DERMATOME_SRC}')===-1){this.onerror=null;this.src='${HUMAN_DERMATOME_SRC}';}" />
        <span class="map-enlarge-hint">Tap to enlarge</span>
      </button>
      <div class="human-map-side">
        <h4>${root} reference</h4>
        <p><span class="landmark">${landmark.landmark}</span>${landmark.note}</p>
        <p class="map-attribution">${attribution}</p>
      </div>
    </div>
  `;

  const badge = $(`[data-testid='text-${testIdPrefix}-map-active-root']`);
  if (badge) badge.textContent = `${root} highlighted`;
}

function renderLumbarMap(root) {
  renderHumanMap("#lumbar-dermatome-map", root, "Lumbar", "lumbar");
}
function renderCervicalMap(root) {
  renderHumanMap("#cervical-dermatome-map", root, "Cervical", "cervical");
}
function renderThoracicMap(root) {
  renderHumanMap("#thoracic-dermatome-map", root, "Thoracic", "thoracic");
}

// ===================================================================
// Lumbar / sacral controls
// ===================================================================
function renderDiscButtons() {
  const host = $(".disc-levels");
  if (!host) return;
  host.innerHTML = DISC_LEVELS.map((lvl) => {
    const prevalence = PREVALENCE[lvl] || {};
    const hint = prevalence.common ? "common" : "less common";
    return `
      <button type="button" class="seg-btn disc-btn" role="radio"
        data-level="${lvl}" data-testid="button-disc-${levelId(lvl)}"
        aria-checked="${lvl === state.level}">
        <span class="disc-btn-level">${dash(lvl)}</span>
        <span class="disc-btn-hint">${hint}</span>
      </button>`;
  }).join("");
  host.querySelectorAll(".disc-btn").forEach((btn) => {
    btn.addEventListener("click", () => setLevel(btn.dataset.level));
  });
}

function renderMatrix() {
  const body = $("#matrix-body");
  if (!body) return;
  body.innerHTML = MATRIX_ROWS.map((row) => `
    <tr data-level="${row.level}" data-testid="row-matrix-${levelId(row.level)}">
      <th scope="row">${dash(row.level)}</th>
      <td>${row.traversing}</td>
      <td>${row.exiting}</td>
      <td>${row.autozone}</td>
      <td>${row.motorShort}</td>
      <td>${row.reflexShort}</td>
    </tr>`).join("");
  body.querySelectorAll("tr").forEach((tr) => {
    tr.addEventListener("click", () => setLevel(tr.dataset.level));
  });
}

function morphImageSrcs(morph) {
  const entry = MORPH_IMAGE[morph] || MORPH_IMAGE.paracentral;
  return {
    label: entry.label,
    webp: `./assets/${entry.base}.webp`,
    png: `./assets/${entry.base}-1200.png`,
  };
}

function renderMorphThumb() {
  const srcs = morphImageSrcs(state.morphology);
  const webp = $("#morph-thumb-webp");
  const img = $("#morph-thumb-img");
  if (webp) webp.srcset = srcs.webp;
  if (img) {
    img.src = srcs.png;
    img.alt = `Axial view: ${srcs.label} disc morphology`;
  }
}

function renderReadout() {
  const lvl = state.level;
  const root = state.morphology === "paracentral"
    ? TRAVERSING_ROOT[lvl]
    : EXITING_ROOT[lvl];
  const info = ROOT_DATA[root] || {};

  renderMorphThumb();

  setText("#text-selected-level", "");
  const selLevel = $("[data-testid='text-selected-level']");
  if (selLevel) selLevel.textContent = dash(lvl);

  const affected = $("#affected-root");
  if (affected) affected.textContent = root;

  const morphLine = $("#affected-root-morph");
  if (morphLine) {
    morphLine.textContent = state.morphology === "paracentral"
      ? "paracentral · traversing"
      : "far-lateral · exiting";
  }

  setText("#deficit-sensory", info.sensory || "");
  setText("#deficit-autozone", info.autozone || "");
  setText("#deficit-motor", info.motor || "");
  setText("#deficit-reflex", info.reflex || "");
  setText("#deficit-bedside", info.bedside || "");

  const prev = PREVALENCE[lvl] || {};
  setText("#prevalence-note", prev.note || "");

  renderLumbarMap(root);
}

// ===================================================================
// Cervical controls
// ===================================================================
function renderCervicalButtons() {
  const host = $(".cervical-levels");
  if (!host) return;
  host.innerHTML = CERVICAL_LEVELS.map((lvl) => {
    const root = CERVICAL_ROOT_BY_LEVEL[lvl];
    return `
      <button type="button" class="seg-btn disc-btn" role="radio"
        data-level="${lvl}" data-testid="button-cervical-${levelId(lvl)}"
        aria-checked="${lvl === state.cervicalLevel}">
        <span class="disc-btn-level">${dash(lvl)}</span>
        <span class="disc-btn-hint">${root} root</span>
      </button>`;
  }).join("");
  host.querySelectorAll(".disc-btn").forEach((btn) => {
    btn.addEventListener("click", () => setCervicalLevel(btn.dataset.level));
  });
}

function renderCervicalMatrix() {
  const body = $("#cervical-matrix-body");
  if (!body) return;
  body.innerHTML = CERVICAL_MATRIX_ROWS.map((row) => `
    <tr data-level="${row.level}" data-testid="row-cervical-matrix-${levelId(row.level)}">
      <th scope="row">${dash(row.level)}</th>
      <td>${row.root}</td>
      <td>${row.sensory}</td>
      <td>${row.motor}</td>
      <td>${row.reflex}</td>
      <td>${row.caution}</td>
    </tr>`).join("");
  body.querySelectorAll("tr").forEach((tr) => {
    tr.addEventListener("click", () => setCervicalLevel(tr.dataset.level));
  });
}

function renderCervicalReadout() {
  const lvl = state.cervicalLevel;
  const root = CERVICAL_ROOT_BY_LEVEL[lvl];
  const info = CERVICAL_ROOT_DATA[root] || {};

  const selLevel = $("[data-testid='text-cervical-selected-level']");
  if (selLevel) selLevel.textContent = dash(lvl);
  setText("#cervical-affected-root", root);
  setText("#cervical-sensory", info.sensory || "");
  setText("#cervical-motor", info.motor || "");
  setText("#cervical-reflex", info.reflex || "");
  setText("#cervical-bedside", info.bedside || "");

  const warn = $("#cervical-warning-note");
  if (warn) {
    warn.textContent = root === "C7"
      ? "C7 is the most commonly affected cervical root. Triceps weakness and a diminished triceps reflex are classic findings."
      : "Cervical roots overlap; correlate sensory, motor, and reflex findings with imaging before drawing conclusions.";
  }

  renderCervicalMap(root);
}

// ===================================================================
// Thoracic controls
// ===================================================================
function renderThoracicButtons() {
  const host = $(".thoracic-levels");
  if (!host) return;
  host.innerHTML = THORACIC_LEVELS.map((lvl) => {
    const root = THORACIC_ROOT_BY_LEVEL[lvl];
    return `
      <button type="button" class="chip-btn disc-btn" role="radio"
        data-level="${lvl}" data-testid="button-thoracic-${levelId(lvl)}"
        aria-checked="${lvl === state.thoracicLevel}">
        <span class="disc-btn-level">${dash(lvl)}</span>
        <span class="disc-btn-hint">${root}</span>
      </button>`;
  }).join("");
  host.querySelectorAll(".disc-btn").forEach((btn) => {
    btn.addEventListener("click", () => setThoracicLevel(btn.dataset.level));
  });
}

function renderThoracicMatrix() {
  const body = $("#thoracic-matrix-body");
  if (!body) return;
  body.innerHTML = THORACIC_MATRIX_ROWS.map((row) => `
    <tr data-level="${row.level}" data-testid="row-thoracic-matrix-${levelId(row.level)}">
      <th scope="row">${dash(row.level)}</th>
      <td>${row.root}</td>
      <td>${row.sensory}</td>
      <td>${row.motorReflex}</td>
      <td>${row.caution}</td>
    </tr>`).join("");
  body.querySelectorAll("tr").forEach((tr) => {
    tr.addEventListener("click", () => setThoracicLevel(tr.dataset.level));
  });
}

function renderThoracicReadout() {
  const lvl = state.thoracicLevel;
  const root = THORACIC_ROOT_BY_LEVEL[lvl];
  const info = THORACIC_ROOT_DATA[root] || {};

  const selLevel = $("[data-testid='text-thoracic-selected-level']");
  if (selLevel) selLevel.textContent = dash(lvl);
  setText("#thoracic-affected-root", root);
  setText("#thoracic-sensory", info.sensory || "");
  setText("#thoracic-motor", info.motor || "");
  setText("#thoracic-reflex", info.reflex || "");
  setText("#thoracic-caution", info.caution || "");

  const warn = $("#thoracic-warning-note");
  if (warn) {
    warn.textContent = root === "T10"
      ? "T10 maps to the umbilicus — a classic clinical landmark. Read thoracic dermatomes as bands rather than sharp borders."
      : "Thoracic radicular pain is read as a band that often wraps from back to front. Exclude visceral and chest-wall mimics.";
  }

  renderThoracicMap(root);
}

// ===================================================================
// Symptom Localizer
// ===================================================================
function renderSymptomInputs() {
  const host = $("#symptom-drawing-builder");
  if (!host) return;
  host.innerHTML = SYMPTOM_CHANNELS.map((channel) => {
    const isFirst = channel.id === "axial";
    const compact = channel.id === "weakness" || channel.id === "exam";
    return `
      <div class="symptom-layer-card" data-layer-card="${channel.id}">
        <button type="button" class="symptom-layer-head"
          data-toggle-symptom-layer="${channel.id}"
          aria-expanded="${isFirst ? "true" : "false"}">
          <span class="layer-symbol">${channel.symbol}</span>
          <span>
            <strong>${channel.title}</strong>
            <small>${channel.prompt || ""}</small>
          </span>
          <span class="layer-count" data-layer-count="${channel.id}"></span>
        </button>
        <div class="symptom-layer-body" data-layer-body="${channel.id}" ${isFirst ? "" : "hidden"}>
          <p class="symptom-layer-prompt">${channel.helper || ""}</p>
          <div class="side-toggle" role="radiogroup" aria-label="${channel.title} side">
            <button type="button" class="side-btn" data-symptom-side="${channel.id}:left" aria-checked="true">Left</button>
            <button type="button" class="side-btn" data-symptom-side="${channel.id}:right" aria-checked="false">Right</button>
            <button type="button" class="side-btn" data-symptom-side="${channel.id}:bilateral" aria-checked="false">Both</button>
          </div>
          <div class="symptom-area-list ${compact ? "compact" : ""}" data-layer-list="${channel.id}"></div>
        </div>
      </div>`;
  }).join("");

  SYMPTOM_CHANNELS.forEach((channel) => renderSymptomLayerList(channel.id));

  host.querySelectorAll("[data-toggle-symptom-layer]").forEach((btn) => {
    btn.addEventListener("click", () => toggleSymptomLayer(btn.dataset.toggleSymptomLayer));
  });
  host.querySelectorAll("[data-symptom-side]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [channelId, side] = btn.dataset.symptomSide.split(":");
      setSymptomSide(channelId, side);
    });
  });
}

function getChannelItems(channel) {
  return channel.items || [];
}

function renderSymptomLayerList(channelId) {
  const channel = SYMPTOM_CHANNELS.find((c) => c.id === channelId);
  if (!channel) return;
  const list = $(`[data-layer-list="${channelId}"]`);
  if (!list) return;
  const items = getChannelItems(channel);
  const entry = state.symptomEntries[channelId];

  const channelObj = SYMPTOM_CHANNELS.find((c) => c.id === channelId);
  const symbol = channelObj ? channelObj.symbol : "";
  const renderBtn = (item) => {
    const pressed = entry.selections.has(item.id);
    return `
      <button type="button" class="symptom-area-btn"
        data-symptom-selection="${channelId}:${item.id}"
        data-testid="button-symptom-${channelId}-${item.id}"
        aria-pressed="${pressed}">
        <span class="symptom-area-title"><span class="inline-layer-symbol">${symbol}</span>${item.label}</span>
        ${item.hint ? `<span class="symptom-area-sub">${item.hint}</span>` : ""}
      </button>`;
  };

  if (items.length > 6 && items.some((i) => i.group)) {
    const groups = [];
    const seen = {};
    items.forEach((i) => {
      const g = i.group || "Other";
      if (!seen[g]) { seen[g] = []; groups.push([g, seen[g]]); }
      seen[g].push(i);
    });
    list.innerHTML = groups.map(([g, arr]) =>
      `<span class="symptom-area-group-label">${g}</span>${arr.map(renderBtn).join("")}`
    ).join("");
  } else {
    list.innerHTML = items.map(renderBtn).join("");
  }

  list.querySelectorAll("[data-symptom-selection]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [ch, itemId] = btn.dataset.symptomSelection.split(":");
      toggleSymptomSelection(ch, itemId);
    });
  });
}

function computeSymptomScores() {
  const scores = {};
  const evidence = {};
  SYMPTOM_CHANNELS.forEach((channel) => {
    const entry = state.symptomEntries[channel.id];
    if (!entry || entry.selections.size === 0) return;
    const items = getChannelItems(channel);
    entry.selections.forEach((selId) => {
      const item = items.find((i) => i.id === selId);
      if (!item || !item.weights) return;
      Object.entries(item.weights).forEach(([root, weight]) => {
        const adjustedWeight = Math.round(weight * channel.weight * 10) / 10;
        scores[root] = (scores[root] || 0) + adjustedWeight;
        (evidence[root] = evidence[root] || []).push({
          channel: channel.title,
          symbol: channel.symbol,
          side: entry.side,
          label: item.label,
        });
      });
    });
  });

  const rootNum = (r) => parseInt(r.replace(/[^0-9]/g, ""), 10) || 0;
  return Object.entries(scores)
    .map(([root, score]) => ({ root, score, evidence: evidence[root] || [] }))
    .sort((a, b) => b.score - a.score || rootNum(a.root) - rootNum(b.root));
}

function getSymptomConfidence(ranked) {
  let label;
  if (!ranked.length) {
    label = "tap symptoms";
  } else {
    const top = ranked[0];
    const lead = top.score - (ranked[1] ? ranked[1].score : 0);
    if (top.score >= 9 && lead >= 3) label = "stronger pattern match";
    else if (top.score >= 5) label = "pattern match";
    else label = "possible match";
    const anyBilateral = getSelectedSymptomLayers().some((l) => l.side === "bilateral");
    if (anyBilateral) label += " · includes both sides";
  }
  return label;
}

function getSelectedSymptomLayers() {
  return SYMPTOM_CHANNELS
    .filter((c) => state.symptomEntries[c.id].selections.size > 0)
    .map((c) => ({
      id: c.id,
      title: c.title,
      symbol: c.symbol,
      side: state.symptomEntries[c.id].side,
      selections: Array.from(state.symptomEntries[c.id].selections),
    }));
}

function sideLabel(side) {
  if (side === "left") return "Left";
  if (side === "right") return "Right";
  return "Both sides";
}

function renderSymptomSelectionSummary() {
  const host = $("#symptom-selection-summary");
  if (!host) return;
  const layers = getSelectedSymptomLayers();
  if (!layers.length) {
    host.hidden = true;
    host.innerHTML = "";
    return;
  }
  host.hidden = false;
  host.innerHTML = `
    <h3>Your symptom drawing</h3>
    <div class="selection-layer-list">
      ${layers.map((layer) => {
        const channel = SYMPTOM_CHANNELS.find((c) => c.id === layer.id);
        const items = getChannelItems(channel);
        const names = layer.selections
          .map((id) => (items.find((i) => i.id === id) || {}).label)
          .filter(Boolean)
          .join(", ");
        return `
          <div class="selection-layer-row">
            <span class="layer-symbol">${layer.symbol}</span>
            <span>
              <strong>${layer.title} · ${sideLabel(layer.side)}</strong>
              <small>${names}</small>
            </span>
          </div>`;
      }).join("")}
    </div>`;
}

function renderSymptomResults() {
  renderSymptomSelectionSummary();
  const ranked = computeSymptomScores();
  const empty = $("#symptom-empty");
  const results = $("#symptom-ranked-results");
  const topRootEl = $("#symptom-top-root");
  const confidenceEl = $("#symptom-confidence");

  if (!ranked.length) {
    if (empty) empty.hidden = false;
    if (results) results.innerHTML = "";
    if (topRootEl) topRootEl.textContent = "\u2014";
    if (confidenceEl) confidenceEl.textContent = "tap symptoms";
    const mapBadge = $("[data-testid='text-symptom-map-active-root']");
    if (mapBadge) mapBadge.textContent = "No root selected";
    const mapHost = $("#symptom-dermatome-map");
    if (mapHost) mapHost.innerHTML = `<p class="symptom-map-placeholder">Mark symptoms to preview the most likely dermatome.</p>`;
    return;
  }

  if (empty) empty.hidden = true;
  const top = ranked[0];
  if (topRootEl) topRootEl.textContent = top.root;
  if (confidenceEl) confidenceEl.textContent = getSymptomConfidence(ranked);

  if (results) {
    results.innerHTML = ranked.slice(0, 4).map((entry, index) => {
      const info = ROOT_LABELS[entry.root] || {};
      const isTop = index === 0;
      const heading = isTop ? "Most likely pattern" : `Possible pattern ${index + 1}`;
      const caution = info.caution || info.bedside || "";
      const lines = [
        info.sensory ? { label: "Common symptom area", text: info.sensory } : null,
        info.motor ? { label: "Possible weakness", text: info.motor } : null,
        info.reflex ? { label: "Exam clue", text: info.reflex } : null,
      ].filter(Boolean);

      const chips = entry.evidence.map((ev) =>
        `<span><span class="inline-layer-symbol">${ev.symbol}</span>${ev.channel} · ${sideLabel(ev.side)} · ${ev.label}</span>`
      ).join("");

      return `
        <div class="symptom-result-card ${isTop ? "is-top" : ""}">
          <div class="symptom-result-head">
            <span class="symptom-result-root">${entry.root}</span>
            <span class="symptom-result-score">${heading}</span>
          </div>
          <div class="symptom-clinical-lines">
            ${lines.map((l) => `<span><strong>${l.label}:</strong> ${l.text}</span>`).join("")}
          </div>
          ${caution ? `<p class="symptom-note">${caution}</p>` : ""}
          <p class="symptom-evidence-title">Why this pattern</p>
          <div class="symptom-evidence">${chips}</div>
        </div>`;
    }).join("");
  }

  renderHumanMap("#symptom-dermatome-map", top.root, "Symptom localizer", "symptom");
}

function toggleSymptomLayer(channelId) {
  const head = $(`[data-toggle-symptom-layer="${channelId}"]`);
  const body = $(`[data-layer-body="${channelId}"]`);
  if (!head || !body) return;
  const expanded = head.getAttribute("aria-expanded") === "true";
  head.setAttribute("aria-expanded", String(!expanded));
  body.hidden = expanded;
}

function toggleSymptomSelection(channelId, itemId) {
  const entry = state.symptomEntries[channelId];
  if (!entry) return;
  if (entry.selections.has(itemId)) entry.selections.delete(itemId);
  else entry.selections.add(itemId);

  // auto-open the body when a selection is toggled
  const head = $(`[data-toggle-symptom-layer="${channelId}"]`);
  const body = $(`[data-layer-body="${channelId}"]`);
  if (head && body) {
    head.setAttribute("aria-expanded", "true");
    body.hidden = false;
  }

  renderSymptomLayerList(channelId);
  syncActiveStates();
  renderSymptomResults();
}

function setSymptomSide(channelId, side) {
  const entry = state.symptomEntries[channelId];
  if (!entry) return;
  entry.side = side;
  syncActiveStates();
  renderSymptomResults();
}

function resetSymptoms() {
  Object.keys(state.symptomEntries).forEach((id) => {
    state.symptomEntries[id].selections.clear();
    state.symptomEntries[id].side = "left";
  });
  SYMPTOM_CHANNELS.forEach((channel, idx) => {
    const head = $(`[data-toggle-symptom-layer="${channel.id}"]`);
    const body = $(`[data-layer-body="${channel.id}"]`);
    if (head && body) {
      const open = idx === 0;
      head.setAttribute("aria-expanded", String(open));
      body.hidden = !open;
    }
    renderSymptomLayerList(channel.id);
  });
  syncActiveStates();
  renderSymptomResults();
}

function initSymptomLocalizer() {
  $$("[data-reset-symptoms]").forEach((btn) => {
    btn.addEventListener("click", resetSymptoms);
  });
}

// ===================================================================
// Sheet viewers (dermatome map + morphology)
// ===================================================================
function isAnyViewerOpen() {
  const m = $("#map-viewer");
  const v = $("#morph-viewer");
  return (m && !m.hidden) || (v && !v.hidden);
}

// Element to return focus to after a viewer closes (the trigger that opened it).
let lastViewerTrigger = null;

function getFocusable(root) {
  return $$(
    'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    root
  ).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

// Keep Tab focus inside the currently open viewer dialog.
function trapFocus(e) {
  if (e.key !== "Tab") return;
  const viewer = $("#map-viewer:not([hidden])") || $("#morph-viewer:not([hidden])");
  if (!viewer) return;
  const focusable = getFocusable(viewer);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function restoreViewerFocus() {
  if (lastViewerTrigger && typeof lastViewerTrigger.focus === "function") {
    lastViewerTrigger.focus();
  }
  lastViewerTrigger = null;
}

function openMapViewer(trigger) {
  const root = trigger.dataset.root;
  const region = trigger.dataset.region || "";
  const viewer = $("#map-viewer");
  if (!viewer) return;
  lastViewerTrigger = trigger;

  const title = $("#map-viewer-title");
  const caption = $("#map-viewer-caption");
  const image = $("#map-viewer-image");
  if (title) title.textContent = `${region} dermatome map · ${root}`;
  if (caption) caption.innerHTML = getDermatomeMapAttribution(root);
  if (image) {
    image.src = getDermatomeMapSrc(root);
    image.alt = `Enlarged full-body dermatome map highlighting ${root}`;
  }

  viewer.hidden = false;
  document.body.classList.add("sheet-open");

  requestAnimationFrame(() => {
    const scroller = $(".sheet-body", viewer);
    if (scroller && image) {
      const ratio = getSpotlightCenterY(root) / 950;
      const target = image.scrollHeight * ratio - scroller.clientHeight / 2;
      scroller.scrollTop = Math.max(0, target);
    }
    const close = $(".sheet-close", viewer);
    if (close) close.focus();
  });
}

function closeMapViewer() {
  const viewer = $("#map-viewer");
  if (!viewer) return;
  viewer.hidden = true;
  if (!isAnyViewerOpen()) document.body.classList.remove("sheet-open");
  restoreViewerFocus();
}

function openMorphViewer(trigger) {
  const viewer = $("#morph-viewer");
  if (!viewer) return;
  lastViewerTrigger = trigger || document.activeElement;
  const srcs = morphImageSrcs(state.morphology);
  const title = $("#morph-viewer-title");
  const webp = $("#morph-viewer-webp");
  const image = $("#morph-viewer-image");
  if (title) title.textContent = srcs.label;
  if (webp) webp.srcset = srcs.webp;
  if (image) {
    image.src = srcs.png;
    image.alt = `Enlarged axial view of ${srcs.label} disc morphology`;
  }
  viewer.hidden = false;
  document.body.classList.add("sheet-open");
  requestAnimationFrame(() => {
    const close = $(".sheet-close", viewer);
    if (close) close.focus();
  });
}

function closeMorphViewer() {
  const viewer = $("#morph-viewer");
  if (!viewer) return;
  viewer.hidden = true;
  if (!isAnyViewerOpen()) document.body.classList.remove("sheet-open");
  restoreViewerFocus();
}

function initMapViewer() {
  document.addEventListener("click", (e) => {
    const openMorph = e.target.closest("[data-open-morph-viewer]");
    if (openMorph) { openMorphViewer(openMorph); return; }
    const closeMorph = e.target.closest("[data-close-morph-viewer]");
    if (closeMorph) { closeMorphViewer(); return; }
    const openMap = e.target.closest("[data-open-map-viewer]");
    if (openMap) { openMapViewer(openMap); return; }
    const closeMap = e.target.closest("[data-close-map-viewer]");
    if (closeMap) { closeMapViewer(); return; }
  });
  document.addEventListener("keydown", (e) => {
    if (!isAnyViewerOpen()) return;
    if (e.key === "Escape") {
      closeMapViewer();
      closeMorphViewer();
    } else if (e.key === "Tab") {
      trapFocus(e);
    }
  });
}

// ===================================================================
// Active-state sync across all controls
// ===================================================================
function syncActiveStates() {
  // Lumbar disc buttons
  $$(".disc-levels .disc-btn").forEach((btn) => {
    const on = btn.dataset.level === state.level;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-checked", String(on));
  });
  // Morphology segmented buttons
  $$(".morph-btn").forEach((btn) => {
    const on = btn.dataset.morph === state.morphology
      || (btn.dataset.morph === "far-lateral" && state.morphology === "far-lateral");
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-checked", String(on));
  });
  // Matrix rows
  $$("#matrix-body tr").forEach((tr) => {
    tr.classList.toggle("is-active", tr.dataset.level === state.level);
  });
  // Cervical
  $$(".cervical-levels .disc-btn").forEach((btn) => {
    const on = btn.dataset.level === state.cervicalLevel;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-checked", String(on));
  });
  $$("#cervical-matrix-body tr").forEach((tr) => {
    tr.classList.toggle("is-active", tr.dataset.level === state.cervicalLevel);
  });
  // Thoracic
  $$(".thoracic-levels .disc-btn").forEach((btn) => {
    const on = btn.dataset.level === state.thoracicLevel;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-checked", String(on));
  });
  $$("#thoracic-matrix-body tr").forEach((tr) => {
    tr.classList.toggle("is-active", tr.dataset.level === state.thoracicLevel);
  });
  // Morphology atlas cards
  $$(".atlas-card[data-morph-card]").forEach((card) => {
    const cardMorph = card.dataset.morphCard;
    const on = cardMorph === state.morphology
      || (cardMorph === "foraminal" && state.morphology === "far-lateral");
    card.classList.toggle("is-active", on);
  });
  // Symptom sides
  $$("[data-symptom-side]").forEach((btn) => {
    const [channelId, side] = btn.dataset.symptomSide.split(":");
    const on = state.symptomEntries[channelId] && state.symptomEntries[channelId].side === side;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-checked", String(on));
  });
  // Symptom selections
  $$("[data-symptom-selection]").forEach((btn) => {
    const [channelId, itemId] = btn.dataset.symptomSelection.split(":");
    const on = state.symptomEntries[channelId] && state.symptomEntries[channelId].selections.has(itemId);
    btn.setAttribute("aria-pressed", String(on));
    btn.classList.toggle("is-active", on);
  });
  // Layer counts
  $$("[data-layer-count]").forEach((el) => {
    const channelId = el.dataset.layerCount;
    const count = state.symptomEntries[channelId] ? state.symptomEntries[channelId].selections.size : 0;
    el.textContent = count > 0 ? String(count) : "";
  });
  // Nav links + bottom tab bar
  $$(".nav-link").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.openPage === state.page);
  });
  $$(".tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.openPage === state.page);
  });
}

// ===================================================================
// Page switching + hash history routing
// ===================================================================
// True only while we are applying a popstate/boot restore, so the resulting
// setPage()/router calls do NOT push a new history entry (which would corrupt
// the back/forward stack). All history writes go through writeHistory().
let suppressHistory = false;

function buildHash(page, sub) {
  if (page === "landing") return "#";
  if (page === "symptom" && sub && sub !== "intro") return `#symptom/${sub}`;
  return `#${page}`;
}

// Single choke-point for every history mutation. Dedupes against the current
// hash so repeated in-page actions never spam the stack, and respects the
// suppressHistory guard so restores don't re-push.
function writeHistory(hash, { replace } = {}) {
  if (suppressHistory) return;
  const current = location.hash || "#";
  const normalizedCurrent = current === "" ? "#" : current;
  try {
    if (replace) {
      history.replaceState(null, "", hash);
    } else if (hash !== normalizedCurrent) {
      history.pushState(null, "", hash);
    }
  } catch (_) {}
}

function setPage(page, options = {}) {
  if (!PAGES.includes(page)) page = "landing";
  state.page = page;

  $$("section[data-page]").forEach((section) => {
    section.hidden = section.dataset.page !== page;
  });

  syncActiveStates();

  // Preserve an existing symptom sub-step in the hash unless told otherwise, so
  // a level/morph redirect to another page doesn't clobber the drawing step.
  const hash = buildHash(page, page === "symptom" ? options.sub : undefined);
  writeHistory(hash, { replace: options.replace === true });

  if (options.scroll !== false) {
    const behavior = options.instant ? "auto" : "smooth";
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : behavior });
  }
}

// Parse a location hash into { page, sub }. Unknown pages fall back to landing.
function parseHash(raw) {
  const h = (raw || "").replace(/^#/, "");
  if (!h) return { page: "landing", sub: null };
  const [page, sub] = h.split("/");
  if (!PAGES.includes(page)) return { page: "landing", sub: null };
  return { page, sub: sub || null };
}

// Router bridge used by paint.js to record drawing sub-steps in history.
window.__appRouter = {
  setSymptomStep(sub, { replace } = {}) {
    if (state.page !== "symptom") return; // only meaningful on the symptom page
    writeHistory(buildHash("symptom", sub), { replace: replace === true });
  },
};

// Apply a parsed route to the DOM without pushing history. Used by boot + popstate.
function applyRoute({ page, sub }) {
  suppressHistory = true;
  try {
    setPage(page, { instant: true, scroll: false });
    if (page === "symptom" && window.__paint && typeof window.__paint.restoreStep === "function") {
      window.__paint.restoreStep(sub || "intro");
    }
  } finally {
    suppressHistory = false;
  }
}

function setLevel(lvl) {
  if (state.level === lvl) return;
  state.level = lvl;
  if (state.page !== "lumbar") setPage("lumbar", { scroll: false });
  syncActiveStates();
  renderReadout();
}

function setCervicalLevel(lvl) {
  if (state.cervicalLevel === lvl) return;
  state.cervicalLevel = lvl;
  if (state.page !== "cervical") setPage("cervical", { scroll: false });
  syncActiveStates();
  renderCervicalReadout();
}

function setThoracicLevel(lvl) {
  if (state.thoracicLevel === lvl) return;
  state.thoracicLevel = lvl;
  if (state.page !== "thoracic") setPage("thoracic", { scroll: false });
  syncActiveStates();
  renderThoracicReadout();
}

function setMorphology(morph) {
  state.morphology = morph;
  syncActiveStates();
  renderReadout();
}

// ===================================================================
// Navigation, morphology buttons, keyboard
// ===================================================================
function initNav() {
  $$("[data-open-page]").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (el.tagName === "A") e.preventDefault();
      setPage(el.dataset.openPage);
    });
  });
}

function initMorphButtons() {
  $$(".morph-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.page !== "lumbar") setPage("lumbar", { scroll: false });
      setMorphology(btn.dataset.morph);
    });
  });
  $$("[data-set-morph]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.page !== "lumbar") setPage("lumbar", { scroll: false });
      setMorphology(btn.dataset.setMorph);
    });
  });
}

function initKeyboard() {
  const wire = (selector, levels, getCurrent, setter, stepCount) => {
    const host = $(selector);
    if (!host) return;
    host.addEventListener("keydown", (e) => {
      const idx = levels.indexOf(getCurrent());
      if (idx < 0) return;
      let next = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next = Math.min(levels.length - 1, idx + 1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = Math.max(0, idx - 1);
      if (next !== null && next !== idx) {
        e.preventDefault();
        setter(levels[next]);
        const btns = host.querySelectorAll(".disc-btn");
        if (btns[next]) btns[next].focus();
      }
    });
  };
  wire(".disc-levels", DISC_LEVELS, () => state.level, setLevel);
  wire(".cervical-levels", CERVICAL_LEVELS, () => state.cervicalLevel, setCervicalLevel);
  wire(".thoracic-levels", THORACIC_LEVELS, () => state.thoracicLevel, setThoracicLevel);
}


// ===================================================================
// Compare tool — side-by-side of any two nerve roots
// ===================================================================
// A lightweight reference that puts two roots next to each other and
// highlights where their sensory / motor / reflex / bedside profiles differ.
// Reuses the unified ROOT_LABELS map (cervical + thoracic + lumbosacral), so
// no new clinical content is introduced here.
const COMPARE_FIELDS = [
  { key: "sensory", label: "Dermatome (sensory)" },
  { key: "motor", label: "Myotome (motor)" },
  { key: "reflex", label: "Reflex" },
  { key: "bedside", label: "Bedside clue" },
];

// Ordered root list for the pickers, head-to-tail down the neuraxis.
const COMPARE_ROOTS = ["C4","C5","C6","C7","C8","T1","T4","T6","T8","T10","T12","L1","L2","L3","L4","L5","S1"]
  .filter((r) => (typeof ROOT_LABELS !== "undefined") && ROOT_LABELS[r]);

// Classic confusables offered as one-tap presets.
const COMPARE_PRESETS = [
  { a: "L5", b: "S1", note: "the most common lumbar mix-up" },
  { a: "L4", b: "L5", note: "adjacent lower-limb roots" },
  { a: "C6", b: "C7", note: "adjacent cervical roots" },
  { a: "C8", b: "T1", note: "hand intrinsics vs. thoracic" },
];

const compareState = { a: "L5", b: "S1" };

function compareRootField(root, key) {
  const info = (typeof ROOT_LABELS !== "undefined" && ROOT_LABELS[root]) || {};
  return info[key] || "—";
}

function renderComparePickers() {
  ["a", "b"].forEach((side) => {
    const host = $(`#compare-picker-${side}`);
    if (!host) return;
    host.innerHTML = COMPARE_ROOTS.map((r) => {
      const on = compareState[side] === r;
      return `<button type="button" class="compare-chip${on ? " is-active" : ""}"`
        + ` role="radio" aria-checked="${on}" tabindex="${on ? "0" : "-1"}"`
        + ` data-compare-side="${side}" data-compare-root="${r}"`
        + ` data-testid="compare-${side}-${r}">${r}</button>`;
    }).join("");
  });
  const presetHost = $("#compare-presets");
  if (presetHost) {
    presetHost.innerHTML = COMPARE_PRESETS.map((p) =>
      `<button type="button" class="compare-preset" data-compare-preset="${p.a}:${p.b}"`
      + ` data-testid="compare-preset-${p.a}-${p.b}"><strong>${p.a} vs ${p.b}</strong><span>${p.note}</span></button>`
    ).join("");
  }
}

function renderCompareTable() {
  const { a, b } = compareState;
  const head = $("#compare-heads");
  if (head) {
    head.innerHTML =
      `<div class="compare-col-head"><span class="compare-col-eyebrow">Root A</span><span class="compare-col-root">${a}</span></div>`
      + `<div class="compare-col-head"><span class="compare-col-eyebrow">Root B</span><span class="compare-col-root">${b}</span></div>`;
  }
  const body = $("#compare-body");
  if (!body) return;
  body.innerHTML = COMPARE_FIELDS.map((f) => {
    const va = compareRootField(a, f.key);
    const vb = compareRootField(b, f.key);
    const differs = va !== vb;
    return `<div class="compare-field${differs ? " differs" : ""}">
        <div class="compare-field-label">${f.label}${differs ? '<span class="compare-diff-tag">differs</span>' : ''}</div>
        <div class="compare-cells">
          <p class="compare-cell">${va}</p>
          <p class="compare-cell">${vb}</p>
        </div>
      </div>`;
  }).join("");
}

function renderCompare() {
  renderComparePickers();
  renderCompareTable();
}

function setCompareRoot(side, root) {
  if (side !== "a" && side !== "b") return;
  if (!ROOT_LABELS[root]) return;
  compareState[side] = root;
  renderCompare();
}

function initCompareTool() {
  const page = $('section[data-page="compare"]');
  if (!page) return;
  renderCompare();
  page.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-compare-root]");
    if (chip) { setCompareRoot(chip.dataset.compareSide, chip.dataset.compareRoot); return; }
    const preset = e.target.closest("[data-compare-preset]");
    if (preset) {
      const [a, b] = preset.dataset.comparePreset.split(":");
      compareState.a = a; compareState.b = b;
      renderCompare();
    }
  });
  // Arrow-key navigation within each root picker (radiogroup pattern).
  ["a", "b"].forEach((side) => {
    const host = $(`#compare-picker-${side}`);
    if (!host) return;
    host.addEventListener("keydown", (e) => {
      const idx = COMPARE_ROOTS.indexOf(compareState[side]);
      if (idx < 0) return;
      let next = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next = Math.min(COMPARE_ROOTS.length - 1, idx + 1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = Math.max(0, idx - 1);
      if (next !== null && next !== idx) {
        e.preventDefault();
        setCompareRoot(side, COMPARE_ROOTS[next]);
        const btns = host.querySelectorAll(".compare-chip");
        if (btns[next]) btns[next].focus();
      }
    });
  });
}

// ===================================================================
// Developer-only integrity check
// ===================================================================
// Warns (console only) if any clinical root resolves to a dermatome asset that
// 404s, or if a root has no explicit highlight mapping. Runs only on localhost
// or when "?debug" is present, so it never affects production users. This is a
// guardrail for future root-localizer work where assets are remapped often.
function runDermatomeIntegrityCheck() {
  const isDev = /^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname)
    || new URLSearchParams(location.search).has("debug");
  if (!isDev) return;

  const roots = Object.keys(ROOT_LABELS);
  const checks = roots.map((root) => {
    const src = getDermatomeMapSrc(root);
    const explicit = !!(DERMATOME_HIGHLIGHT_SOURCES[root] || SOURCE_BASED_THORACIC_SOURCES[root]);
    return new Promise((resolve) => {
      fetch(src, { method: "HEAD" })
        .then((r) => resolve({ root, src, explicit, ok: r.ok }))
        .catch(() => resolve({ root, src, explicit, ok: false }));
    });
  });

  Promise.all(checks).then((results) => {
    const missing = results.filter((r) => !r.ok);
    const unmapped = results.filter((r) => !r.explicit);
    if (missing.length) {
      console.warn("[Radix dev] roots mapped to a MISSING dermatome asset:", missing);
    }
    if (unmapped.length) {
      console.info("[Radix dev] roots using the default fallback map (no explicit highlight):",
        unmapped.map((r) => r.root));
    }
    if (!missing.length) {
      console.info(`[Radix dev] dermatome asset integrity OK — ${results.length} roots resolve.`);
    }
  });
}

// ===================================================================
// Boot
// ===================================================================
document.addEventListener("DOMContentLoaded", () => {
  // Dark mode removed: the app is light-only. Clear any stale dark class that a
  // cached page may have applied before this build.
  document.documentElement.classList.remove("dark");

  renderDiscButtons();
  renderMatrix();
  renderReadout();

  renderCervicalButtons();
  renderCervicalMatrix();
  renderCervicalReadout();

  renderThoracicButtons();
  renderThoracicMatrix();
  renderThoracicReadout();

  // Symptom Localizer is now a guided patient pain-drawing flow driven by
  // paint.js. The legacy list-mode render/init (renderSymptomInputs,
  // renderSymptomResults, initSymptomLocalizer) target DOM that no longer
  // exists, so they are not booted here. The functions are left defined for a
  // possible future clinician "list" mode.

  initNav();
  initMorphButtons();
  initKeyboard();
  initMapViewer();
  initCompareTool();

  syncActiveStates();

  // Restore the route from the URL hash. Replace (not push) the boot entry so
  // the first Back leaves the app cleanly instead of cycling the landing page.
  const route = parseHash(location.hash);
  suppressHistory = true;
  try {
    setPage(route.page, { instant: true, scroll: false, replace: true, sub: route.sub });
  } finally {
    suppressHistory = false;
  }
  // paint.js may still be booting (it inits on its own DOMContentLoaded); defer
  // the drawing sub-step restore until it is ready.
  if (route.page === "symptom" && route.sub) {
    const restore = () => {
      if (window.__paint && typeof window.__paint.restoreStep === "function") {
        suppressHistory = true;
        try { window.__paint.restoreStep(route.sub); } finally { suppressHistory = false; }
      } else {
        requestAnimationFrame(restore);
      }
    };
    requestAnimationFrame(restore);
  }

  // Browser Back/Forward: re-apply whatever route the new hash describes.
  window.addEventListener("popstate", () => {
    applyRoute(parseHash(location.hash));
  });

  runDermatomeIntegrityCheck();
});
