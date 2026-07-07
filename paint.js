// ===== Radix Spine — Guided patient pain drawing =====
// A calm, waiting-room "pain drawing" flow on top of the existing clinical
// engine. Three phases:
//   intro   -> patient picks a body region ("Arm or hand", "Leg or foot", ...)
//   paint   -> the shared line-art figure zooms to that region; the patient taps
//              color-coded symptom marks. No nerve-root result is shown here.
//   reveal  -> on "Complete", the drawing fades and a single most-likely nerve
//              root is revealed with a short, plain-language explanation.
//
// Scoring reuses the clinical weights in data.js (SYMPTOM_AREAS /
// AXIAL_PAIN_AREAS / SYMPTOM_FINDINGS / SYMPTOM_CHANNELS) verbatim — this file
// never mutates that data. The marks->area resolution and computeScores() are
// unchanged from the prior version; only the surrounding flow/UI is new.
"use strict";

(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const SVGNS = "http://www.w3.org/2000/svg";
  const XLINKNS = "http://www.w3.org/1999/xlink";

  // Uploaded detailed body templates, placed as a background image inside the
  // SVG viewBox (0..100 x, 0..200 y). The x/y/w/h below were computed so each
  // template's silhouette ink-box lands on the existing hand-authored outline
  // bounds, keeping the invisible hit-zones (and therefore scoring) aligned.
  const BODY_TEMPLATE = {
    front: { href: "./assets/body-templates/body-anterior.png?v=tpl2",  x: -11.30, y: -13.12, w: 122.72, h: 236.11 },
    back:  { href: "./assets/body-templates/body-posterior.png?v=tpl2", x: -13.84, y:  -9.05, w: 127.81, h: 235.22 },
    // Detailed enlarged extremity templates (landscape 900x600, two panels:
    // dorsum/back on the left, palm/sole on the right). Placed so the image
    // fills x:2..98 centered vertically; HAND_ZONES/FOOT_ZONES below map taps on
    // these panels to EXISTING data.js area ids (no scoring change).
    hand:  { href: "./assets/body-templates/hands-detailed.png?v=tpl2", x: 2, y: 68, w: 96, h: 64 },
    foot:  { href: "./assets/body-templates/feet-detailed.png?v=tpl2",  x: 2, y: 68, w: 96, h: 64 },
    // Lateral / oblique full-body profiles (left-facing, right-facing). Placed so
    // each silhouette's ink-box shares the SAME viewBox head-top..feet-bottom span
    // as the anterior/posterior figures, keeping the torso vertical band aligned
    // (so the chest focus box and the LATERAL_ZONES proxy bands below line up).
    // Used only for the Chest/torso region to capture wrap-around thoracic pain.
    left:  { href: "./assets/body-templates/body-lateral-left.png?v=tpl3",  x: -32.01, y: -17.56, w: 164.56, h: 246.84 },
    right: { href: "./assets/body-templates/body-lateral-right.png?v=tpl3", x: -26.49, y: -11.39, w: 153.74, h: 230.61 },
  };
  const prefersReducedMotion = () =>
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ------------------------------------------------------------------
  // Symptom SYMBOLS. Each maps to a clinical scoring CHANNEL in data.js, and now
  // also carries a calm display color for the patient-facing tool chips.
  // ------------------------------------------------------------------
  // Display colors only — distinct across the spectrum so painted strokes never
  // read as the same hue. `channel` drives scoring and is unchanged.
  const SYMBOLS = {
    aching:    { label: "Aching pain",    channel: "pain",     color: "#e53935", aria: "aching pain mark" },
    stabbing:  { label: "Sharp / shooting", channel: "pain",   color: "#8e24aa", aria: "sharp shooting mark" },
    burning:   { label: "Burning",        channel: "burning",  color: "#f57c00", aria: "burning mark" },
    numbness:  { label: "Numbness",       channel: "numbness", color: "#1e6fe0", aria: "numbness mark" },
    tingling:  { label: "Pins & needles", channel: "numbness", color: "#00897b", aria: "pins and needles mark" },
  };
  const SYMBOL_ORDER = ["aching", "stabbing", "burning", "numbness", "tingling"];

  const CHANNEL_LABEL = {
    axial: "Neck / back pain",
    pain: "Pain / aching",
    burning: "Burning",
    numbness: "Numbness / tingling",
    weakness: "Weakness",
  };

  function channelWeight(id) {
    const ch = (typeof SYMPTOM_CHANNELS !== "undefined")
      ? SYMPTOM_CHANNELS.find((c) => c.id === id) : null;
    return ch ? ch.weight : 1;
  }
  function areaItems() { return (typeof SYMPTOM_AREAS !== "undefined") ? SYMPTOM_AREAS : []; }
  function axialItems() { return (typeof AXIAL_PAIN_AREAS !== "undefined") ? AXIAL_PAIN_AREAS : []; }
  function findingItems() {
    return (typeof SYMPTOM_FINDINGS !== "undefined")
      ? SYMPTOM_FINDINGS.filter((i) => i.group === "Weakness noticed") : [];
  }
  function itemsForChannel(id) {
    if (id === "axial") return axialItems();
    if (id === "weakness") return findingItems();
    return areaItems();
  }

  // ------------------------------------------------------------------
  // Invisible anatomical regions used ONLY to resolve a tapped point to a
  // data.js area id for scoring. Never drawn. Coordinates are in the figure
  // viewBox (0..100 w x 0..200 h).
  // ------------------------------------------------------------------
  const SENSORY_ZONES = [
    // ---- FRONT ----
    { view: "front", area: "neck-trap", rect: [37, 40, 26, 8] },
    { view: "front", area: "deltoid-lateral-arm", rect: [18, 47, 11, 14] },
    { view: "front", area: "deltoid-lateral-arm", rect: [71, 47, 11, 14] },
    { view: "front", area: "radial-forearm-thumb", rect: [15, 63, 10, 22] },
    { view: "front", area: "radial-forearm-thumb", rect: [75, 63, 10, 22] },
    { view: "front", area: "middle-finger", rect: [13, 88, 9, 16] },
    { view: "front", area: "middle-finger", rect: [78, 88, 9, 16] },
    { view: "front", area: "ulnar-hand", rect: [11, 92, 6, 12] },
    { view: "front", area: "ulnar-hand", rect: [83, 92, 6, 12] },
    // Inner upper arm / axilla (true T1/T2 sensory). Kept LOW and narrow, below the
    // shoulder-cap/deltoid band (y<56), so a broad shoulder/lateral-arm sweep resolves
    // to the deltoid (C5) zone rather than spilling onto this high-weight T1/T2 zone.
    { view: "front", area: "medial-upper-arm", rect: [29, 56, 5, 11] },
    { view: "front", area: "medial-upper-arm", rect: [66, 56, 5, 11] },
    { view: "front", area: "upper-chest", rect: [34, 44, 32, 9] },
    { view: "front", area: "nipple-line", rect: [33, 54, 34, 8] },
    { view: "front", area: "xiphoid-epigastric", rect: [35, 63, 30, 8] },
    { view: "front", area: "umbilicus", rect: [36, 72, 28, 9] },
    { view: "front", area: "lower-abdomen-inguinal", rect: [34, 82, 32, 10] },
    { view: "front", area: "groin", rect: [38, 93, 24, 11] },
    { view: "front", area: "anterior-thigh", rect: [33, 110, 15, 26] },
    { view: "front", area: "anterior-thigh", rect: [52, 110, 15, 26] },
    { view: "front", area: "anterior-knee-medial-thigh", rect: [36, 138, 12, 14] },
    { view: "front", area: "anterior-knee-medial-thigh", rect: [52, 138, 12, 14] },
    { view: "front", area: "medial-calf-ankle", rect: [43, 154, 7, 34] },
    { view: "front", area: "medial-calf-ankle", rect: [50, 154, 7, 34] },
    { view: "front", area: "lateral-leg-dorsal-foot", rect: [34, 154, 9, 34] },
    { view: "front", area: "lateral-leg-dorsal-foot", rect: [57, 154, 9, 34] },

    // ---- BACK ----
    { view: "back", area: "neck-trap", rect: [37, 40, 26, 8] },
    { view: "back", area: "deltoid-lateral-arm", rect: [18, 47, 11, 14] },
    { view: "back", area: "deltoid-lateral-arm", rect: [71, 47, 11, 14] },
    { view: "back", area: "radial-forearm-thumb", rect: [15, 63, 10, 22] },
    { view: "back", area: "radial-forearm-thumb", rect: [75, 63, 10, 22] },
    { view: "back", area: "ulnar-hand", rect: [13, 88, 9, 16] },
    { view: "back", area: "ulnar-hand", rect: [78, 88, 9, 16] },
    { view: "back", area: "posterior-calf-lateral-foot", rect: [35, 154, 13, 34] },
    { view: "back", area: "posterior-calf-lateral-foot", rect: [52, 154, 13, 34] },
    { view: "back", area: "lateral-leg-dorsal-foot", rect: [34, 138, 8, 16] },
    { view: "back", area: "lateral-leg-dorsal-foot", rect: [58, 138, 8, 16] },
  ];

  const AXIAL_ZONES = [
    { view: "back", area: "upper-neck", rect: [44, 30, 12, 7] },
    { view: "back", area: "lower-neck", rect: [43, 37, 14, 6] },
    { view: "back", area: "trapezial-scapular", rect: [38, 44, 24, 14] },
    { view: "back", area: "mid-back", rect: [40, 59, 20, 18] },
    { view: "back", area: "low-back", rect: [40, 78, 20, 14] },
    { view: "back", area: "buttock-si", rect: [38, 93, 24, 13] },
  ];

  // ------------------------------------------------------------------
  // Dedicated enlarged HAND / FOOT views. These are PROXY zones: each rect maps
  // a tap on the detailed hand/foot template to an EXISTING data.js area id, so
  // the clinical scoring weights are reused verbatim (data.js untouched). The
  // rects are in the figure viewBox (0..100 x 0..200 y), positioned over the
  // hands-detailed / feet-detailed image placed by BODY_TEMPLATE.hand/.foot.
  //
  // Documented mapping (per the requested clinical proxy):
  //   HAND  thumb / radial side  -> radial-forearm-thumb  (C6)
  //         middle / central     -> middle-finger         (C7)
  //         ring-small / ulnar   -> ulnar-hand            (C8)
  //   FOOT  great toe / dorsum   -> lateral-leg-dorsal-foot (L5)
  //         medial ankle / foot  -> medial-calf-ankle       (L4)
  //         lateral foot / sole  -> posterior-calf-lateral-foot (S1)
  // Two panels per image: dorsum/back (left) + palm/sole (right). The detailed
  // hand is a right hand: dorsum thumb is on the RIGHT, palm thumb on the LEFT.
  const HAND_ZONES = [
    // --- dorsum panel (left): thumb on the right side ---
    { view: "hand", area: "radial-forearm-thumb", rect: [36.13, 75.89, 10.45, 30.51] }, // thumb/radial
    { view: "hand", area: "middle-finger",        rect: [26.53, 75.89,  9.60, 30.51] }, // central
    { view: "hand", area: "ulnar-hand",           rect: [16.72, 75.89,  9.81, 30.51] }, // small/ulnar
    { view: "hand", area: "middle-finger",        rect: [18.00, 106.4, 26.67, 13.01] }, // lower hand/wrist (central)
    // --- palm panel (right): thumb on the left side ---
    { view: "hand", area: "radial-forearm-thumb", rect: [52.77, 75.89,  8.96, 30.51] }, // thumb/radial
    { view: "hand", area: "middle-finger",        rect: [61.73, 75.89,  9.60, 30.51] }, // central
    { view: "hand", area: "ulnar-hand",           rect: [71.33, 75.89, 10.13, 30.51] }, // small/ulnar
    { view: "hand", area: "middle-finger",        rect: [54.27, 106.4, 25.60, 12.69] }, // lower palm (central)
  ];
  const FOOT_ZONES = [
    // --- dorsum panel (left): great toe on the right, small toe on the left ---
    { view: "foot", area: "lateral-leg-dorsal-foot",     rect: [34.00, 71.41, 15.47, 17.92] }, // great toe / dorsum (L5)
    { view: "foot", area: "lateral-leg-dorsal-foot",     rect: [21.20, 71.41, 12.80, 17.92] }, // mid dorsum (L5)
    { view: "foot", area: "posterior-calf-lateral-foot", rect: [ 5.41, 71.41, 15.79, 17.92] }, // lateral/small toe (S1)
    { view: "foot", area: "lateral-leg-dorsal-foot",     rect: [ 8.40, 89.33, 38.40, 23.47] }, // dorsum body (L5)
    { view: "foot", area: "medial-calf-ankle",           rect: [14.80, 112.8, 25.60, 15.79] }, // medial ankle/foot (L4)
    // --- sole panel (right): great toe on the left, small toe on the right ---
    { view: "foot", area: "medial-calf-ankle",           rect: [50.43, 71.41, 15.57, 17.92] }, // great toe / medial sole (L4)
    { view: "foot", area: "posterior-calf-lateral-foot", rect: [76.67, 71.41, 17.17, 17.92] }, // lateral/small toe (S1)
    { view: "foot", area: "posterior-calf-lateral-foot", rect: [55.33, 89.33, 34.13, 23.47] }, // sole body (S1)
    { view: "foot", area: "posterior-calf-lateral-foot", rect: [59.60, 112.8, 25.60, 15.79] }, // heel (S1)
  ];

  // ------------------------------------------------------------------
  // Lateral (oblique / side) torso PROXY zones for the Chest/torso region. A
  // side view shows the rib cage / flank wrapping from back to front, which is
  // exactly how thoracic radicular pain travels. Each band reuses an EXISTING
  // data.js trunk area id (the same ones the FRONT torso uses), so painting a
  // wrap on the side scores identically to the matching trunk dermatome — no
  // data.js or weight change. The visible torso strip sits at viewBox x≈33..67
  // (centered at 50) for both left/right profiles; bands are split by height:
  //   upper chest  -> upper-chest            (~T2–T4)
  //   nipple line  -> nipple-line            (~T4–T5)
  //   epigastric   -> xiphoid-epigastric     (~T6–T7)
  //   umbilicus    -> umbilicus              (~T10)
  //   lower abdo   -> lower-abdomen-inguinal (~T11–L1)
  const LATERAL_ZONES = [
    { view: "left",  area: "upper-chest",            rect: [33, 41, 34, 12] },
    { view: "left",  area: "nipple-line",            rect: [33, 53, 34,  9] },
    { view: "left",  area: "xiphoid-epigastric",     rect: [33, 62, 34,  9] },
    { view: "left",  area: "umbilicus",              rect: [33, 71, 34, 10] },
    { view: "left",  area: "lower-abdomen-inguinal", rect: [33, 81, 34, 13] },
    { view: "right", area: "upper-chest",            rect: [33, 41, 34, 12] },
    { view: "right", area: "nipple-line",            rect: [33, 53, 34,  9] },
    { view: "right", area: "xiphoid-epigastric",     rect: [33, 62, 34,  9] },
    { view: "right", area: "umbilicus",              rect: [33, 71, 34, 10] },
    { view: "right", area: "lower-abdomen-inguinal", rect: [33, 81, 34, 13] },
  ];

  // ------------------------------------------------------------------
  // Patient-facing REGIONS. Each is purely a view definition: which figure
  // view(s) to offer and a focus box [x,y,w,h] (viewBox units) to frame. The
  // marks themselves are still hit-tested against the zones above, so scoring is
  // identical regardless of which region the patient chose. `channel: "axial"`
  // regions paint axial neck/back pain (back midline).
  // ------------------------------------------------------------------
  // Each region lists the figure panels it shows, top to bottom. A panel is
  // { view, box: [x,y,w,h] focus crop, cap: caption, section: short label }.
  // Upper/lower extremity now combine the whole-limb body views AND the
  // dedicated enlarged hand/foot detail in one scrollable drawing page — no
  // sub-step. Every panel is drawable and contributes to scoring identically.
  const REGIONS = [
    {
      id: "arm", label: "Arm or hand", sub: "Shoulder, arm, hand, fingers",
      hint: "Paint over the spots where you feel it. Use the whole-arm view and the bigger hand below.",
      panels: [
        { view: "front", box: [9, 44, 82, 64], cap: "Front", section: "Arm" },
        { view: "back",  box: [9, 44, 82, 64], cap: "Back",  section: "Arm" },
        { view: "hand",  box: [0, 66, 100, 68], cap: "Back of hand & palm", section: "Hand detail" },
      ],
    },
    {
      id: "chest", label: "Chest or torso", sub: "Chest, ribs, stomach",
      hint: "Paint where you feel it. If the pain wraps around your side from the back, use the side views too.",
      panels: [
        { view: "front", box: [29, 42, 42, 52], cap: "Front", section: "Torso" },
        { view: "left",  box: [26, 40, 48, 58], cap: "Left side / wrap-around",  section: "Sides (wrap-around)" },
        { view: "right", box: [26, 40, 48, 58], cap: "Right side / wrap-around", section: "Sides (wrap-around)" },
      ],
    },
    {
      id: "leg", label: "Leg or foot", sub: "Hip, thigh, knee, calf, foot",
      hint: "Paint over the spots where you feel it. Use the whole-leg view and the bigger foot below.",
      panels: [
        { view: "front", box: [27, 98, 46, 100], cap: "Front", section: "Leg" },
        { view: "back",  box: [27, 98, 46, 100], cap: "Back",  section: "Leg" },
        { view: "foot",  box: [0, 66, 100, 68], cap: "Top of foot & sole", section: "Foot detail" },
      ],
    },
  ];
  function regionById(id) { return REGIONS.find((r) => r.id === id) || null; }

  function ptInRect(px, py, [x, y, w, h]) {
    return px >= x && px <= x + w && py >= y && py <= y + h;
  }

  // Resolve a tapped point to a data.js area id + channel routing. On the BACK
  // figure, a tap near the midline for a pain-type symbol is treated as axial.
  function resolveArea(view, px, py, channel) {
    if (view === "hand") {
      const h = HAND_ZONES.find((z) => ptInRect(px, py, z.rect));
      return h ? { area: h.area, channel } : null;
    }
    if (view === "foot") {
      const f = FOOT_ZONES.find((z) => ptInRect(px, py, z.rect));
      return f ? { area: f.area, channel } : null;
    }
    if (view === "left" || view === "right") {
      const l = LATERAL_ZONES.find((z) => z.view === view && ptInRect(px, py, z.rect));
      return l ? { area: l.area, channel } : null;
    }
    if (view === "back" && channel === "pain") {
      const ax = AXIAL_ZONES.find((z) => ptInRect(px, py, z.rect));
      if (ax) return { area: ax.area, channel: "axial" };
    }
    const z = SENSORY_ZONES.find((s) => s.view === view && ptInRect(px, py, s.rect));
    if (z) return { area: z.area, channel };
    return null; // off any scored region (still drawn, just unscored)
  }

  // ------------------------------------------------------------------
  // State.  phase: "intro" | "paint" | "reveal".
  // mark = { id, stroke, sym, channel, view, x, y, area|null }
  // `stroke` groups the sampled dabs of one continuous press into a single
  // visible brush path; scoring still sums over the individual marks unchanged.
  // ------------------------------------------------------------------
  const state = {
    phase: "intro",
    regionId: null,
    sym: "aching",
    tool: "paint", // "paint" = brush with state.sym; "erase" = rub out strokes
    marks: [],
    // Undo history: a snapshot of `marks` taken at the start of each user action
    // (one brush press, one eraser press, or a clear). Undo pops the latest.
    history: [],
    seq: 0,
    strokeSeq: 0,
  };

  // ------------------------------------------------------------------
  // Scoring — identical model: item.weights[root] * channel.weight summed over
  // every placed mark that resolved to a region.
  // ------------------------------------------------------------------
  function computeScores() {
    const scores = {};
    const evidence = {};
    function add(channel, areaId) {
      const items = itemsForChannel(channel);
      const item = items.find((i) => i.id === areaId);
      if (!item || !item.weights) return;
      const w = channelWeight(channel);
      for (const [root, weight] of Object.entries(item.weights)) {
        const adj = Math.round(weight * w * 10) / 10;
        scores[root] = (scores[root] || 0) + adj;
        (evidence[root] = evidence[root] || []).push({
          channel: CHANNEL_LABEL[channel], label: item.label,
        });
      }
    }
    state.marks.forEach((m) => { if (m.area) add(m.channel, m.area); });

    const rootNum = (r) => parseInt(r.replace(/[^0-9]/g, ""), 10) || 0;
    return Object.entries(scores)
      .map(([root, score]) => ({ root, score, evidence: evidence[root] || [] }))
      .sort((a, b) => b.score - a.score || rootNum(a.root) - rootNum(b.root));
  }

  // Adjacent nerve roots travel through neighbouring spinal levels, so a drawing
  // that lands meaningfully on two neighbours often reflects a genuine two-level
  // pattern (e.g. C7+C8). The spine is a single ordered ladder C4..C8, T1..T12,
  // L1..L5, S1.., so adjacency is "next rung on the ladder".
  const ROOT_LADDER = (() => {
    const ladder = [];
    for (let n = 1; n <= 8; n++) ladder.push("C" + n);
    for (let n = 1; n <= 12; n++) ladder.push("T" + n);
    for (let n = 1; n <= 5; n++) ladder.push("L" + n);
    for (let n = 1; n <= 5; n++) ladder.push("S" + n);
    return ladder;
  })();
  function rootsAdjacent(a, b) {
    const ia = ROOT_LADDER.indexOf(a), ib = ROOT_LADDER.indexOf(b);
    return ia !== -1 && ib !== -1 && Math.abs(ia - ib) === 1;
  }

  // Anatomical region gate. The patient explicitly picks a body region, and a
  // radicular pattern there can only localise to the spinal levels that actually
  // innervate it. An ARM/HAND complaint is brachial-plexus territory (C1–T1) and
  // can NEVER be a thoracic TRUNK root (T2+) — so a broad shoulder/upper-arm
  // sweep that grazes the central upper-chest band must not surface T2/T3. The
  // CHEST/torso is thoracic; the LEG is lumbosacral. This is the primary
  // guardrail against confidently-wrong thoracic roots for cervical drawings
  // (ranges are inclusive ladder endpoints, with one rung of overlap at the
  // anatomical borders).
  const REGION_ROOT_RANGE = {
    arm:   ["C1", "T1"],
    chest: ["C8", "T12"],
    leg:   ["T12", "S5"],
  };
  function eligibleForRegion(root) {
    const range = REGION_ROOT_RANGE[state.regionId];
    if (!range) return true; // unknown/unset region: do not gate
    const i = ROOT_LADDER.indexOf(root);
    return i !== -1 && i >= ROOT_LADDER.indexOf(range[0]) && i <= ROOT_LADDER.indexOf(range[1]);
  }
  function eligibleScores(ranked) {
    return ranked.filter((r) => eligibleForRegion(r.root));
  }

  // From the ranked scores, choose the likely root(s) to surface. The top root is
  // always returned. A neighbouring root is added only when its score is a
  // meaningful fraction of the top (MULTI_ROOT_RATIO) AND it sits adjacent to an
  // already-selected root — so a clear single winner stays single, and a noisy
  // broad drawing cannot fan out into many unrelated roots. Capped at MAX_ROOTS.
  const MULTI_ROOT_RATIO = 0.6;
  const MAX_ROOTS = 3;
  function selectLikelyRoots(ranked) {
    const gated = eligibleScores(ranked); // anatomical region gate (see above)
    if (!gated.length) return [];
    const top = gated[0];
    const chosen = [top];
    if (top.score <= 0) return chosen;
    for (const cand of gated.slice(1)) {
      if (chosen.length >= MAX_ROOTS) break;
      if (cand.score / top.score < MULTI_ROOT_RATIO) break; // ranked desc: none after will qualify
      if (chosen.some((c) => rootsAdjacent(c.root, cand.root))) chosen.push(cand);
    }
    // Defensive de-duplication: a result must never name the same root twice
    // (e.g. "T1 and T1"). computeScores keys are already unique, but guard the
    // display path regardless.
    const seen = new Set();
    const unique = chosen.filter((c) => (seen.has(c.root) ? false : seen.add(c.root)));
    // Present in spinal (head-to-toe) order so "C7 and C8" reads naturally.
    return unique.sort((a, b) => ROOT_LADDER.indexOf(a.root) - ROOT_LADDER.indexOf(b.root));
  }

  // Conservative uncertainty: when the gated scores are broad AND conflicting —
  // two or more comparably-strong roots that do NOT form a single contiguous
  // neighbour cluster (e.g. C5 and C8 with a gap) — the localiser cannot
  // responsibly name one level. It is safer to tell the patient the drawing
  // overlaps several nearby nerve areas and defer to a clinician than to guess a
  // single confident root. A contiguous run (C5,C6,C7) is a genuine multi-level
  // band, not uncertainty, so it is excluded here.
  function isBroadlyUncertain(ranked) {
    const gated = eligibleScores(ranked);
    if (gated.length < 2 || gated[0].score <= 0) return false;
    const top = gated[0];
    const strong = gated.filter((r) => r.score / top.score >= MULTI_ROOT_RATIO);
    if (strong.length < 2) return false;
    const idx = strong.map((r) => ROOT_LADDER.indexOf(r.root)).sort((a, b) => a - b);
    for (let k = 1; k < idx.length; k++) if (idx[k] - idx[k - 1] > 1) return true;
    return false;
  }

  // "C7" + "C8" -> "C7 and C8"; "C6","C7","C8" -> "C6, C7 and C8".
  function joinRootNames(roots) {
    if (roots.length <= 1) return roots[0] || "";
    if (roots.length === 2) return `${roots[0]} and ${roots[1]}`;
    return `${roots.slice(0, -1).join(", ")} and ${roots[roots.length - 1]}`;
  }

  // ------------------------------------------------------------------
  // Clinic-style line-art human figure (front + back share a silhouette so the
  // invisible zones stay aligned). Built once per view; reframed via viewBox.
  // ------------------------------------------------------------------
  function bodyOutline() {
    return [
      ["path", { d:
        "M50 6 C43 6 39 12 39 19 C39 24 41 28 44 30 C46 31 47 32 50 32 "
        + "C53 32 54 31 56 30 C59 28 61 24 61 19 C61 12 57 6 50 6 Z" }],
      ["path", { d: "M45 31 L44 40 L56 40 L55 31" }],
      ["path", { d:
        "M35 41 C30 41 26 44 25 49 C24 60 25 74 28 86 C29 92 30 99 31 106 "
        + "L69 106 C70 99 71 92 72 86 C75 74 76 60 75 49 C74 44 70 41 65 41 Z" }],
      ["path", { d:
        "M30 43 C24 45 21 50 19 58 C17 68 15 80 14 90 C13 95 12 100 13 103 "
        + "C13 105 15 105 16 104 C17 102 18 99 19 96 C21 88 23 78 25 70 "
        + "C27 62 29 56 31 52 Z" }],
      ["path", { d:
        "M13 103 C12 106 12 110 13 112 C14 113 15 112 15 110 C16 112 17 112 17 110 "
        + "C18 112 18 111 18 109 C18 107 18 105 18 103 C16 105 14 105 13 103 Z" }],
      ["path", { d:
        "M70 43 C76 45 79 50 81 58 C83 68 85 80 86 90 C87 95 88 100 87 103 "
        + "C87 105 85 105 84 104 C83 102 82 99 81 96 C79 88 77 78 75 70 "
        + "C73 62 71 56 69 52 Z" }],
      ["path", { d:
        "M87 103 C88 106 88 110 87 112 C86 113 85 112 85 110 C84 112 83 112 83 110 "
        + "C82 112 82 111 82 109 C82 107 82 105 82 103 C84 105 86 105 87 103 Z" }],
      ["path", { d:
        "M31 107 C30 120 31 140 33 158 C34 168 35 178 36 186 "
        + "L42 186 C44 170 46 150 48 130 C48 122 48 114 48 108 Z" }],
      ["path", { d:
        "M36 186 C35 189 35 192 37 193 C40 194 45 193 47 192 C48 191 48 189 47 188 "
        + "L42 186 Z" }],
      ["path", { d:
        "M69 107 C70 120 69 140 67 158 C66 168 65 178 64 186 "
        + "L58 186 C56 170 54 150 52 130 C52 122 52 114 52 108 Z" }],
      ["path", { d:
        "M64 186 C65 189 65 192 63 193 C60 194 55 193 53 192 C52 191 52 189 53 188 "
        + "L58 186 Z" }],
    ];
  }

  const FRONT_GUIDES = [
    "M44 17 C45 16 47 16 48 17 M52 17 C53 16 55 16 56 17",
    "M50 18 L49 23 L51 23",
    "M46 26 C48 27 52 27 54 26",
    "M37 43 C43 45 57 45 63 43",
    "M50 44 L50 104",
    "M50 72 m-1.4 0 a1.4 1.4 0 1 0 2.8 0 a1.4 1.4 0 1 0 -2.8 0",
    "M40 146 a3 3 0 1 0 6 0 M54 146 a3 3 0 1 0 6 0",
  ];
  const BACK_GUIDES = [
    "M50 41 L50 106",
    "M47 50 L53 50 M47 58 L53 58 M47 66 L53 66 M47 74 L53 74 M47 82 L53 82 M47 90 L53 90",
    "M34 47 C38 49 41 53 41 58 C38 57 35 54 33 50 Z",
    "M66 47 C62 49 59 53 59 58 C62 57 65 54 67 50 Z",
    "M50 106 C44 113 40 113 36 110 M50 106 C56 113 60 113 64 110",
    "M50 106 L50 116",
    "M40 150 C39 158 39 166 40 172 M60 150 C61 158 61 166 60 172",
  ];

  function buildFigure(view) {
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", "0 0 100 200");
    svg.setAttribute("class", "body-figure-svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("tabindex", "0");
    svg.setAttribute("data-view", view);
    const VIEW_LABEL = { front: "Front", back: "Back", hand: "Hand", foot: "Foot", left: "Left side", right: "Right side" };
    svg.setAttribute("aria-label",
      (VIEW_LABEL[view] || "Body") + " diagram. Activate, then tap where the symptom is felt.");

    // Detail/lateral views are bitmap-only: the hand-drawn front/back silhouette
    // outline would not match them, so we render just the template image.
    const isDetail = view === "hand" || view === "foot" || view === "left" || view === "right";
    const tpl = BODY_TEMPLATE[view];
    if (tpl) {
      const img = document.createElementNS(SVGNS, "image");
      img.setAttributeNS(XLINKNS, "xlink:href", tpl.href);
      img.setAttribute("href", tpl.href);
      img.setAttribute("x", String(tpl.x));
      img.setAttribute("y", String(tpl.y));
      img.setAttribute("width", String(tpl.w));
      img.setAttribute("height", String(tpl.h));
      img.setAttribute("preserveAspectRatio", "xMidYMid meet");
      img.setAttribute("class", "fig-template");
      img.setAttribute("aria-hidden", "true");
      svg.appendChild(img);
    }

    if (!isDetail) {
      bodyOutline().forEach(([tag, attrs]) => {
        const el = document.createElementNS(SVGNS, tag);
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
        el.setAttribute("class", "fig-outline");
        svg.appendChild(el);
      });
      (view === "front" ? FRONT_GUIDES : BACK_GUIDES).forEach((d) => {
        const g = document.createElementNS(SVGNS, "path");
        g.setAttribute("d", d);
        g.setAttribute("class", "fig-guide");
        svg.appendChild(g);
      });
    }

    const surface = document.createElementNS(SVGNS, "rect");
    surface.setAttribute("x", "0"); surface.setAttribute("y", "0");
    surface.setAttribute("width", "100"); surface.setAttribute("height", "200");
    surface.setAttribute("class", "fig-surface");
    svg.appendChild(surface);

    const layer = document.createElementNS(SVGNS, "g");
    layer.setAttribute("class", "fig-mark-layer");
    svg.appendChild(layer);
    return svg;
  }

  // Visible brush stroke width (viewBox units). Round caps/joins make a dragged
  // stroke read as one continuous painted line rather than scattered dots.
  // Kept thin for precise marking of small areas (toes/fingers).
  const STROKE_WIDTH = 2.8;
  const f1 = (n) => Number(n).toFixed(1);

  // Render ONE visible element for an entire stroke (a group of marks that share
  // the same `stroke` id and color). A single-point stroke (a tap) becomes a
  // round dot; a multi-point stroke becomes a polyline with round caps/joins.
  // Color-only, translucent, in the selected symptom color.
  function strokeElement(sym, pts) {
    const def = SYMBOLS[sym];
    if (pts.length === 1) {
      const c = document.createElementNS(SVGNS, "circle");
      c.setAttribute("cx", f1(pts[0].x));
      c.setAttribute("cy", f1(pts[0].y));
      c.setAttribute("r", f1(STROKE_WIDTH / 2));
      c.setAttribute("class", "mark-dot mark-" + sym);
      c.setAttribute("fill", def.color);
      c.setAttribute("stroke", "none");
      return c;
    }
    const pl = document.createElementNS(SVGNS, "polyline");
    pl.setAttribute("points", pts.map((p) => `${f1(p.x)},${f1(p.y)}`).join(" "));
    pl.setAttribute("class", "mark-stroke mark-" + sym);
    pl.setAttribute("fill", "none");
    pl.setAttribute("stroke", def.color);
    pl.setAttribute("stroke-width", f1(STROKE_WIDTH));
    pl.setAttribute("stroke-linecap", "round");
    pl.setAttribute("stroke-linejoin", "round");
    return pl;
  }

  // Built figures, keyed by view.
  const figures = {};

  function markLayer(view) {
    const svg = figures[view];
    return svg ? $(".fig-mark-layer", svg) : null;
  }

  // Pixel-eraser radius (viewBox units): dragging the eraser removes only the
  // samples within this distance of the pointer, not the whole stroke. Kept a
  // little above the stroke width (2.8) so a sweep reliably bites the line,
  // small enough that it rubs out a local patch rather than whole regions.
  const ERASE_RADIUS = 3.0;

  // When a pixel-eraser removes samples out of the middle of a stroke, the
  // remaining samples are no longer contiguous. A gap between two consecutive
  // surviving samples larger than this (viewBox units) means an erased section,
  // so the stroke is drawn as separate polyline segments around the hole rather
  // than one line bridging the gap. Sized above BRUSH_SPACING (1.1) with margin
  // so an ordinary fast drag (which can outrun the spacing) is not split, but an
  // erase-sized hole is.
  const SEG_BREAK = 6.0;

  // Split one stroke's ordered samples into contiguous point groups. A new group
  // starts wherever the gap to the previous surviving sample exceeds SEG_BREAK.
  function segmentsFromPts(pts) {
    const segs = [];
    let cur = null;
    for (const p of pts) {
      if (cur && Math.hypot(p.x - cur[cur.length - 1].x, p.y - cur[cur.length - 1].y) <= SEG_BREAK) {
        cur.push(p);
      } else {
        cur = [p];
        segs.push(cur);
      }
    }
    return segs;
  }

  // Group a view's marks into ordered strokes (preserving sample order), each
  // split into contiguous visible segments so pixel-erased holes break the line.
  function strokesForView(view) {
    const byStroke = new Map();
    state.marks.forEach((m) => {
      if (m.view !== view) return;
      let s = byStroke.get(m.stroke);
      if (!s) { s = { stroke: m.stroke, sym: m.sym, pts: [] }; byStroke.set(m.stroke, s); }
      s.pts.push({ x: m.x, y: m.y });
    });
    return Array.from(byStroke.values());
  }

  // Append all visible segment elements for one stroke's points to `layer`.
  function appendStrokeSegments(layer, sym, strokeId, pts) {
    segmentsFromPts(pts).forEach((seg, i) => {
      const el = strokeElement(sym, seg);
      el.setAttribute("data-stroke-id", strokeId);
      if (i > 0) el.setAttribute("data-seg", i);
      layer.appendChild(el);
    });
  }

  function renderMarks() {
    Object.keys(figures).forEach((view) => {
      const layer = markLayer(view);
      if (!layer) return;
      layer.textContent = "";
      strokesForView(view).forEach((s) => {
        appendStrokeSegments(layer, s.sym, s.stroke, s.pts);
      });
    });
  }

  // Redraw just one stroke incrementally (so a fast drag doesn't re-render every
  // other stroke on each move). Replaces every existing segment for this stroke.
  function renderStroke(view, strokeId) {
    const layer = markLayer(view);
    if (!layer) return;
    layer.querySelectorAll(`[data-stroke-id="${strokeId}"]`).forEach((el) => el.remove());
    const pts = state.marks
      .filter((m) => m.view === view && m.stroke === strokeId)
      .map((m) => ({ x: m.x, y: m.y }));
    if (!pts.length) return;
    const sym = state.marks.find((m) => m.stroke === strokeId).sym;
    appendStrokeSegments(layer, sym, strokeId, pts);
  }

  function eventToViewBox(svg, evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const loc = pt.matrixTransform(ctm.inverse());
    return { x: loc.x, y: loc.y };
  }

  // Tap-to-remove tolerance (viewBox units), matched to the thinner stroke.
  const HIT_RADIUS = 2.2;
  // Minimum spacing (viewBox units) between consecutive brush samples in one
  // stroke. Tuned to the thinner stroke (width 2.8): close enough that the
  // polyline reads as continuous, far enough that a drag doesn't spawn hundreds
  // of marks/scoring hits.
  const BRUSH_SPACING = 1.1;

  // Append one sampled mark to state (scoring is unchanged — it still sums over
  // these). `strokeId` groups samples of one press into a single visible path.
  // Returns the created mark.
  function addMark(view, x, y, strokeId) {
    const symbol = SYMBOLS[state.sym];
    const resolved = resolveArea(view, x, y, symbol.channel);
    const mark = {
      id: ++state.seq,
      stroke: strokeId,
      sym: state.sym,
      channel: resolved ? resolved.channel : symbol.channel,
      view, x, y,
      area: resolved ? resolved.area : null,
    };
    state.marks.push(mark);
    return mark;
  }

  // Pixel eraser: remove only the sampled marks within ERASE_RADIUS of (x,y) in
  // this view — a local rub, not the whole stroke. Dropping those marks updates
  // scoring (it sums over surviving marks) and leaves the rest of the stroke
  // intact; renderMarks then redraws each affected stroke split into contiguous
  // segments around the erased hole. Returns true if anything was removed.
  function eraseAt(view, x, y) {
    const before = state.marks.length;
    state.marks = state.marks.filter((m) => {
      if (m.view !== view) return true;
      return Math.hypot(m.x - x, m.y - y) > ERASE_RADIUS;
    });
    if (state.marks.length === before) return false;
    renderMarks();
    updateCompleteEnabled();
    return true;
  }

  // Single tap: toggle — remove the stroke the tap lands on if any, otherwise
  // drop a fresh single-dab stroke. Used for click/keyboard placement.
  function placeOrRemove(view, x, y) {
    let nearestIdx = -1, nearestD = Infinity;
    state.marks.forEach((m, i) => {
      if (m.view !== view) return;
      const d = Math.hypot(m.x - x, m.y - y);
      if (d < nearestD) { nearestD = d; nearestIdx = i; }
    });
    if (nearestIdx >= 0 && nearestD <= HIT_RADIUS) {
      // Remove the entire stroke that owns the nearest sample.
      const hitStroke = state.marks[nearestIdx].stroke;
      state.marks = state.marks.filter((m) => m.stroke !== hitStroke);
      renderMarks();
    } else {
      const strokeId = ++state.strokeSeq;
      addMark(view, x, y, strokeId);
      renderStroke(view, strokeId);
    }
    updateCompleteEnabled();
  }

  // Brush dab during a drag: place-only, deduped by BRUSH_SPACING against the
  // last dab placed in this stroke so move events don't pile up marks. Redraws
  // only this stroke's polyline so the line grows continuously as you drag.
  function paintDab(view, x, y, stroke) {
    if (stroke.last) {
      const d = Math.hypot(stroke.last.x - x, stroke.last.y - y);
      if (d < BRUSH_SPACING) return;
    }
    addMark(view, x, y, stroke.id);
    stroke.last = { x, y };
    stroke.count += 1;
    renderStroke(view, stroke.id);
    updateCompleteEnabled();
  }

  // Snapshot the current marks before a mutating action so undo can restore the
  // exact prior state. One snapshot per user action (a brush press, an eraser
  // press, or a clear) → one undo step. Bounded so long sessions stay light.
  const MAX_HISTORY = 60;
  function pushHistory() {
    state.history.push(state.marks.map((m) => ({ ...m })));
    if (state.history.length > MAX_HISTORY) state.history.shift();
  }

  // Undo restores the marks snapshot taken before the most recent action, so one
  // brush press, one eraser press, or a clear each undo as a single step.
  function undo() {
    resetClearConfirm();
    if (!state.history.length) return;
    state.marks = state.history.pop();
    renderMarks();
    updateCompleteEnabled();
  }

  // ------------------------------------------------------------------
  // viewBox framing (the "zoom"). Animates the four viewBox numbers unless the
  // user prefers reduced motion. Keeps a little padding around the focus box.
  // ------------------------------------------------------------------
  function clampBox(box) {
    let [x, y, w, h] = box;
    // keep a minimum size and within 0..100 / 0..200
    w = Math.min(Math.max(w, 14), 100);
    h = Math.min(Math.max(h, 28), 200);
    x = Math.min(Math.max(x, 0), 100 - w);
    y = Math.min(Math.max(y, 0), 200 - h);
    return [x, y, w, h];
  }
  function currentBox(svg) {
    const vb = svg.getAttribute("viewBox").split(/\s+/).map(Number);
    return vb.length === 4 ? vb : [0, 0, 100, 200];
  }
  function setViewBox(svg, targetBox, animate) {
    const target = clampBox(targetBox);
    if (!animate || prefersReducedMotion()) {
      svg.setAttribute("viewBox", target.join(" "));
      return;
    }
    const start = currentBox(svg);
    const t0 = performance.now();
    const dur = 420;
    const ease = (p) => 1 - Math.pow(1 - p, 3);
    function frame(now) {
      const p = Math.min(1, (now - t0) / dur);
      const e = ease(p);
      const vb = start.map((s, i) => s + (target[i] - s) * e);
      svg.setAttribute("viewBox", vb.map((n) => n.toFixed(2)).join(" "));
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------------
  // Phase machine
  // ------------------------------------------------------------------
  // True while we are re-applying a phase from a browser Back/Forward restore,
  // so the restore does NOT emit a new history entry (which would re-push the
  // step we just navigated to).
  let restoring = false;

  function showPhase(phase) {
    state.phase = phase;
    $$("[data-phase]").forEach((el) => { el.hidden = el.dataset.phase !== phase; });
  }

  // Map a phase to the hash sub-step the router understands.
  const PHASE_TO_SUB = { intro: "intro", paint: "paint", reveal: "reveal" };

  // Record a drawing sub-step in browser history via the app router. No-op when
  // restoring (Back/Forward) or when paint.js is loaded standalone (no router).
  function notifyStep(phase, opts) {
    if (restoring) return;
    const sub = PHASE_TO_SUB[phase];
    if (!sub) return;
    if (window.__appRouter && typeof window.__appRouter.setSymptomStep === "function") {
      window.__appRouter.setSymptomStep(sub, opts || {});
    }
  }

  // Re-apply a drawing sub-step from a Back/Forward restore WITHOUT wiping the
  // patient's marks/region/tool. The result is deterministic from the marks, so
  // reveal can always be re-rendered.
  function restoreStep(sub) {
    restoring = true;
    try {
      if (sub === "reveal" && state.marks.length) {
        renderReveal();
        showPhase("reveal");
      } else if (sub === "paint" && state.regionId) {
        mountRegionFigures(regionById(state.regionId));
        showPhase("paint");
        updateCompleteEnabled();
      } else {
        // intro, or a step we can't reconstruct (e.g. reveal/paint with no draw)
        showPhase("intro");
      }
    } finally {
      restoring = false;
    }
  }

  function focusFirst(selector) {
    requestAnimationFrame(() => {
      const el = $(selector);
      if (el && typeof el.focus === "function") el.focus();
    });
  }

  function selectRegion(regionId) {
    const region = regionById(regionId);
    if (!region) return;
    state.regionId = regionId;
    state.tool = "paint";
    state.history = [];
    mountRegionFigures(region);
    showPhase("paint");
    notifyStep("paint");
    const prompt = $("#guide-paint-region");
    if (prompt) prompt.textContent = region.label;
    const hint = $("#guide-paint-hint");
    if (hint) hint.textContent = region.hint || "Paint over the spots where you feel it.";
    updateCompleteEnabled();
    focusFirst("#guide-tools .symptom-tool.is-active");
  }

  // Build (or rebuild) the figure panels this region needs, top to bottom, each
  // framed to its own focus box. Figures are cached and reused across regions.
  // Consecutive panels that share a `section` (e.g. Arm front+back) are grouped
  // under a single section heading.
  function mountRegionFigures(region) {
    const host = $("#guide-figure");
    if (!host) return;
    host.innerHTML = "";
    let lastSection = null;
    region.panels.forEach((panel) => {
      const view = panel.view;
      if (!figures[view]) {
        figures[view] = buildFigure(view);
        wireFigure(figures[view], view);
      }
      if (panel.section && panel.section !== lastSection) {
        const head = document.createElement("p");
        head.className = "guide-figure-section";
        head.textContent = panel.section;
        host.appendChild(head);
        lastSection = panel.section;
      }
      const fig = document.createElement("figure");
      fig.className = "guide-figure-card";
      const cap = document.createElement("figcaption");
      cap.className = "guide-figure-cap";
      cap.textContent = panel.cap || "";
      const wrap = document.createElement("div");
      wrap.className = "guide-figure-host";
      wrap.appendChild(figures[view]);
      fig.appendChild(cap);
      fig.appendChild(wrap);
      host.appendChild(fig);
      setViewBox(figures[view], panel.box, false);
      // animate in from full-body on the next frame for a gentle zoom-in
      if (!prefersReducedMotion()) {
        figures[view].setAttribute("viewBox", "0 0 100 200");
        requestAnimationFrame(() => setViewBox(figures[view], panel.box, true));
      }
    });
    renderMarks();
  }

  // Distance (viewBox units) a pointer must travel before a press is treated as
  // a brush stroke rather than a tap. Below this, pointerup falls back to the
  // tap-to-toggle behavior so single dabs can still be removed by tapping again.
  const TAP_SLOP = 1.6;

  function wireFigure(svg, view) {
    let stroke = null;

    let erasing = false;
    // Snapshot guard: true once this eraser press has taken its history snapshot,
    // so one press (down + drag) is a single undo step and a press over blank
    // space records nothing.
    let eraseStarted = false;

    // One eraser sample. Takes the press's single history snapshot on the first
    // sample that actually removes something, so the whole press undoes at once
    // and a press over blank space leaves no empty undo step.
    function erasePress(view, x, y) {
      if (eraseStarted) { eraseAt(view, x, y); return; }
      const snap = state.marks.map((m) => ({ ...m }));
      if (eraseAt(view, x, y)) {
        eraseStarted = true;
        state.history.push(snap);
        if (state.history.length > MAX_HISTORY) state.history.shift();
      }
    }

    const onDown = (e) => {
      if (e.button != null && e.button !== 0) return; // ignore non-primary buttons
      const loc = eventToViewBox(svg, e);
      if (!loc) return;
      // Eraser mode: rub out the local patch the pointer touches; no painting.
      // One press (down + drag) is a single undoable action.
      if (state.tool === "erase") {
        erasing = true;
        eraseStarted = false;
        erasePress(view, loc.x, loc.y);
        try { svg.setPointerCapture(e.pointerId); } catch (_) {}
        e.preventDefault();
        return;
      }
      pushHistory();
      stroke = { id: ++state.strokeSeq, startX: loc.x, startY: loc.y, last: null, count: 0, moved: false };
      // Paint the first dab immediately so a quick tap leaves a mark.
      paintDab(view, loc.x, loc.y, stroke);
      try { svg.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    };

    const onMove = (e) => {
      if (erasing) {
        const loc = eventToViewBox(svg, e);
        if (!loc) return;
        e.preventDefault();
        erasePress(view, loc.x, loc.y);
        return;
      }
      if (!stroke) return;
      const loc = eventToViewBox(svg, e);
      if (!loc) return;
      if (!stroke.moved) {
        const d = Math.hypot(loc.x - stroke.startX, loc.y - stroke.startY);
        if (d >= TAP_SLOP) stroke.moved = true;
      }
      // While painting, prevent the page from scrolling under the finger/Pencil.
      e.preventDefault();
      paintDab(view, loc.x, loc.y, stroke);
    };

    const onUp = (e) => {
      if (erasing) {
        erasing = false;
        eraseStarted = false;
        try { svg.releasePointerCapture(e.pointerId); } catch (_) {}
        return;
      }
      if (!stroke) return;
      // A press that never moved is a tap: if it landed on an existing stroke,
      // toggle it off. We placed one dab on down (its own stroke); remove that
      // stroke and re-run the tap toggle so tapping an existing mark erases.
      if (!stroke.moved && stroke.count === 1) {
        const sid = stroke.id;
        state.marks = state.marks.filter((m) => m.stroke !== sid);
        const loc = eventToViewBox(svg, e) || { x: stroke.startX, y: stroke.startY };
        renderMarks();
        placeOrRemove(view, loc.x, loc.y);
      }
      stroke = null;
      try { svg.releasePointerCapture(e.pointerId); } catch (_) {}
    };

    // While a stroke is active, swallow touchmove so iPad Safari can't scroll the
    // page mid-paint even if a non-Pointer touch sequence slips through. The
    // listener must be non-passive for preventDefault() to take effect.
    const onTouchMove = (e) => { if (stroke || erasing) e.preventDefault(); };

    svg.addEventListener("pointerdown", onDown, { passive: false });
    svg.addEventListener("pointermove", onMove, { passive: false });
    svg.addEventListener("pointerup", onUp);
    svg.addEventListener("pointercancel", () => { stroke = null; erasing = false; eraseStarted = false; });
    svg.addEventListener("touchmove", onTouchMove, { passive: false });
    svg.addEventListener("touchstart", (e) => { if (stroke || erasing) e.preventDefault(); }, { passive: false });

    svg.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const vb = currentBox(svg);
        const cx = vb[0] + vb[2] / 2, cy = vb[1] + vb[3] / 2;
        if (state.tool === "erase") {
          const snap = state.marks.map((m) => ({ ...m }));
          if (eraseAt(view, cx, cy)) {
            state.history.push(snap);
            if (state.history.length > MAX_HISTORY) state.history.shift();
          }
        } else {
          pushHistory();
          placeOrRemove(view, cx, cy);
        }
      }
    });
  }

  function resetIntroPrompt() {
    renderRegionCards();
  }

  function goIntro() {
    resetIntroPrompt();
    showPhase("intro");
    notifyStep("intro");
    focusFirst("#guide-intro .region-card");
  }

  function startOver() {
    state.marks = [];
    state.history = [];
    state.regionId = null;
    renderMarks();
    goIntro();
  }

  function backToIntro() {
    // keep marks; just return to region picker
    goIntro();
  }

  function editDrawing() {
    const region = regionById(state.regionId) || REGIONS[0];
    showPhase("paint");
    notifyStep("paint");
    mountRegionFigures(region);
    updateCompleteEnabled();
  }

  function complete() {
    if (!state.marks.length) return;
    renderReveal();
    showPhase("reveal");
    notifyStep("reveal");
    // whimsical: let the reveal card fade/rise in (CSS handles via .is-entering)
    const card = $("#guide-result");
    if (card && !prefersReducedMotion()) {
      card.classList.remove("is-entering");
      // force reflow so the animation restarts each reveal
      void card.offsetWidth;
      card.classList.add("is-entering");
    }
    focusFirst("#guide-result");
  }

  function updateCompleteEnabled() {
    const btn = $("[data-guide-complete]");
    if (!btn) return;
    const has = state.marks.length > 0;
    btn.disabled = !has;
    btn.setAttribute("aria-disabled", String(!has));
    const counter = $("#guide-mark-count");
    if (counter) counter.textContent = has ? `${state.marks.length} mark${state.marks.length > 1 ? "s" : ""}` : "";
  }

  // ==================================================================
  // EHR export — copy ONLY the patient's drawing (template panels + the
  // patient's painted strokes), as a clean composited PNG. Deliberately
  // excludes every clinical artifact: no nerve-root prediction, no result
  // cards, no dermatome map, no caveat/educational text, no page chrome.
  // The only text rendered is a neutral view label (FRONT / BACK / HAND /
  // FOOT / LEFT / RIGHT) so the clinician can tell the panels apart.
  // Nothing is sent anywhere — all compositing is local in a <canvas>.
  // ==================================================================
  const NEUTRAL_VIEW_LABEL = { front: "FRONT", back: "BACK", hand: "HAND", foot: "FOOT", left: "LEFT", right: "RIGHT" };

  // Which panels of the current region actually carry the patient's marks.
  function paintedExportPanels() {
    const region = regionById(state.regionId);
    if (!region) return [];
    return region.panels
      .map((panel) => ({ panel, strokes: strokesForView(panel.view) }))
      .filter((p) => p.strokes.length > 0);
  }

  // Fetch a template PNG and return it as a base64 data URI. Inlining the
  // bitmap is required so the offscreen SVG can be drawn to a canvas without
  // tainting it (an external href would block canvas.toBlob in most browsers).
  const _tplDataUriCache = {};
  async function templateDataUri(view) {
    if (_tplDataUriCache[view]) return _tplDataUriCache[view];
    const tpl = BODY_TEMPLATE[view];
    if (!tpl) return null;
    const res = await fetch(tpl.href);
    const blob = await res.blob();
    const uri = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
    _tplDataUriCache[view] = uri;
    return uri;
  }

  // Build the stroke SVG fragment for one view (same geometry/colors as the
  // on-screen marks: single point -> dot, multi-point -> round-capped polyline,
  // pixel-erased holes split the stroke into segments).
  function strokeSvgFragment(strokes) {
    const parts = [];
    strokes.forEach((s) => {
      const def = SYMBOLS[s.sym] || { color: "#e53935" };
      segmentsFromPts(s.pts).forEach((seg) => {
        if (seg.length === 1) {
          parts.push(`<circle cx="${f1(seg[0].x)}" cy="${f1(seg[0].y)}" r="${f1(STROKE_WIDTH / 2)}" fill="${def.color}"/>`);
        } else {
          const pts = seg.map((p) => `${f1(p.x)},${f1(p.y)}`).join(" ");
          parts.push(`<polyline points="${pts}" fill="none" stroke="${def.color}" stroke-width="${f1(STROKE_WIDTH)}" stroke-linecap="round" stroke-linejoin="round"/>`);
        }
      });
    });
    return parts.join("");
  }

  // One offscreen SVG string for a panel: white card, the template bitmap
  // (inlined), and the patient's strokes — cropped to the panel's focus box.
  function panelSvgString(panel, tplUri, pxW, pxH) {
    const box = clampBox(panel.box);
    const [vx, vy, vw, vh] = box;
    const tpl = BODY_TEMPLATE[panel.view];
    const img = (tpl && tplUri)
      ? `<image href="${tplUri}" x="${tpl.x}" y="${tpl.y}" width="${tpl.w}" height="${tpl.h}" preserveAspectRatio="xMidYMid meet"/>`
      : "";
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${pxW}" height="${pxH}" viewBox="${vx} ${vy} ${vw} ${vh}">` +
      `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="#ffffff"/>` +
      img + strokeSvgFragment(strokesForView(panel.view)) +
      `</svg>`
    );
  }

  function svgStringToImage(svgStr) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
      im.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      im.src = url;
    });
  }

  // Composite all painted panels into one tall PNG canvas (white background,
  // each panel under a neutral view label). Returns the canvas, or null if
  // nothing was painted.
  async function composeDrawingCanvas() {
    const painted = paintedExportPanels();
    if (!painted.length) return null;

    const SCALE = 6;                 // viewBox units -> px (crisp at EHR sizes)
    const PAD = 24;                  // outer padding px
    const GAP = 20;                  // gap between panels px
    const LABEL_H = 26;              // neutral caption band px
    const cells = [];
    let maxPanelW = 0;
    for (const { panel } of painted) {
      const box = clampBox(panel.box);
      const pxW = Math.round(box[2] * SCALE);
      const pxH = Math.round(box[3] * SCALE);
      const tplUri = await templateDataUri(panel.view);
      const svgStr = panelSvgString(panel, tplUri, pxW, pxH);
      const img = await svgStringToImage(svgStr);
      cells.push({ panel, img, pxW, pxH });
      if (pxW > maxPanelW) maxPanelW = pxW;
    }

    const canvasW = maxPanelW + PAD * 2;
    let canvasH = PAD;
    cells.forEach((c) => { canvasH += LABEL_H + c.pxH + GAP; });
    canvasH = canvasH - GAP + PAD;

    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasW, canvasH);

    let y = PAD;
    ctx.textBaseline = "middle";
    cells.forEach((c) => {
      ctx.fillStyle = "#5b5b66";
      ctx.font = "600 15px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(NEUTRAL_VIEW_LABEL[c.panel.view] || c.panel.view.toUpperCase(), PAD, y + LABEL_H / 2);
      y += LABEL_H;
      const x = Math.round((canvasW - c.pxW) / 2);
      ctx.drawImage(c.img, x, y, c.pxW, c.pxH);
      y += c.pxH + GAP;
    });
    return canvas;
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => {
      if (canvas.toBlob) canvas.toBlob((b) => resolve(b), type, quality);
      else {
        const data = canvas.toDataURL(type, quality);
        const bin = atob(data.split(",")[1]);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        resolve(new Blob([arr], { type }));
      }
    });
  }

  function setCopyStatus(msg, kind) {
    const el = $("#guide-copy-status");
    if (!el) return;
    el.textContent = msg || "";
    el.dataset.kind = kind || "";
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // Orchestrate the copy: build the composite, try the async Clipboard image
  // write, and fall back to a PNG download where image-clipboard is blocked
  // (older browsers, some iPad/Safari and embedded EHR webviews). Nothing is
  // ever uploaded — all work is local.
  async function copyDrawingForEHR() {
    const btn = $("[data-guide-copy]");
    try {
      setCopyStatus("Preparing drawing…", "working");
      if (btn) btn.disabled = true;
      const canvas = await composeDrawingCanvas();
      if (!canvas) { setCopyStatus("Nothing to copy — no drawing found.", "error"); return; }
      const blob = await canvasToBlob(canvas, "image/png");

      const canCopyImage =
        navigator.clipboard && window.ClipboardItem &&
        typeof navigator.clipboard.write === "function";
      if (canCopyImage) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          setCopyStatus("Drawing copied — paste it into the EHR note.", "ok");
          return;
        } catch (_) { /* fall through to download */ }
      }
      downloadBlob(blob, "pain-drawing.png");
      setCopyStatus("Clipboard image copy is blocked here — the drawing was downloaded as pain-drawing.png.", "ok");
    } catch (e) {
      setCopyStatus("Sorry, the drawing could not be copied. Please try the download instead.", "error");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ------------------------------------------------------------------
  // Intro: region cards
  // ------------------------------------------------------------------
  const INTRO_REGIONS = ["arm", "chest", "leg"];
  function renderRegionCards() {
    const host = $("#guide-region-cards");
    if (!host) return;
    host.innerHTML = REGIONS.filter((r) => INTRO_REGIONS.includes(r.id)).map((r) => `
      <button type="button" class="region-card" data-region="${r.id}"
        data-testid="button-region-${r.id}">
        <span class="region-card-label">${r.label}</span>
        <span class="region-card-sub">${r.sub}</span>
      </button>`).join("");
  }

  // ------------------------------------------------------------------
  // Paint: color tool palette
  // ------------------------------------------------------------------
  // Small inline SVG icons for the palette action buttons (eraser/undo/clear).
  const ACTION_ICONS = {
    erase: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16.5 4.5l3 3a2 2 0 0 1 0 2.8l-7.8 7.8H7.2l-3.7-3.7a2 2 0 0 1 0-2.8l8.2-8.2a2 2 0 0 1 2.8 0z"/><path d="M9 9l6 6"/></svg>',
    undo: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 7L4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 0 10h-1"/></svg>',
    clear: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/></svg>',
  };

  function renderTools() {
    const host = $("#guide-tools");
    if (!host) return;
    const eraseOn = state.tool === "erase";
    const chips = SYMBOL_ORDER.map((sym) => {
      const def = SYMBOLS[sym];
      const on = state.tool === "paint" && sym === state.sym;
      return `<button type="button" class="symptom-tool ${on ? "is-active" : ""}"
        data-tool="${sym}" role="radio" aria-checked="${on}"
        style="--tool-color:${def.color}"
        data-testid="button-tool-${sym}">
        <span class="symptom-tool-dot" aria-hidden="true"></span>
        <span class="symptom-tool-name">${def.label}</span>
      </button>`;
    }).join("");
    // Palette action buttons: Eraser (a mode), Undo, Clear (two-tap confirm).
    const actions = `
      <div class="palette-actions" role="group" aria-label="Drawing tools">
        <button type="button" class="palette-action erase-tool ${eraseOn ? "is-active" : ""}"
          data-erase aria-pressed="${eraseOn}" data-testid="button-tool-erase"
          title="Eraser — rub out a mark">
          <span class="palette-action-ico" aria-hidden="true">${ACTION_ICONS.erase}</span>
          <span class="palette-action-name">Eraser</span>
        </button>
        <button type="button" class="palette-action" data-guide-undo
          data-testid="button-guide-undo" title="Undo last mark">
          <span class="palette-action-ico" aria-hidden="true">${ACTION_ICONS.undo}</span>
          <span class="palette-action-name">Undo</span>
        </button>
        <button type="button" class="palette-action palette-action-danger" data-guide-clear
          data-testid="button-guide-clear" title="Clear all marks" aria-live="polite">
          <span class="palette-action-ico" aria-hidden="true">${ACTION_ICONS.clear}</span>
          <span class="palette-action-name">Clear</span>
        </button>
      </div>`;
    host.innerHTML = chips + actions;
  }

  // Reflect tool state on the chips + action buttons without rebuilding markup.
  function syncToolUI() {
    const eraseOn = state.tool === "erase";
    $$("#guide-tools .symptom-tool").forEach((b) => {
      const on = !eraseOn && b.dataset.tool === state.sym;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-checked", String(on));
    });
    const eraseBtn = $("#guide-tools [data-erase]");
    if (eraseBtn) {
      eraseBtn.classList.toggle("is-active", eraseOn);
      eraseBtn.setAttribute("aria-pressed", String(eraseOn));
    }
    const fig = $("#guide-figure");
    if (fig) fig.setAttribute("data-tool", state.tool);
    resetClearConfirm();
  }

  function setSymbol(sym) {
    if (!SYMBOLS[sym]) return;
    state.sym = sym;
    state.tool = "paint"; // picking a color leaves the eraser
    syncToolUI();
  }

  function setTool(tool) {
    state.tool = tool === "erase" ? "erase" : "paint";
    syncToolUI();
  }

  // Clear-all uses a lightweight two-tap confirm so a patient can't wipe the whole
  // drawing with one accidental tap. First tap arms (button shows "Tap to clear");
  // a second tap within the window clears; tapping anything else cancels.
  let clearArmed = false;
  let clearTimer = null;
  function resetClearConfirm() {
    clearArmed = false;
    if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; }
    const btn = $("[data-guide-clear]");
    if (btn) {
      btn.classList.remove("is-armed");
      const name = btn.querySelector(".palette-action-name");
      if (name) name.textContent = "Clear";
    }
  }
  function clearMarks() {
    if (state.marks.length) pushHistory();
    state.marks = [];
    renderMarks();
    updateCompleteEnabled();
  }
  function onClearTap() {
    if (!state.marks.length) return;
    const btn = $("[data-guide-clear]");
    if (!clearArmed) {
      clearArmed = true;
      if (btn) {
        btn.classList.add("is-armed");
        const name = btn.querySelector(".palette-action-name");
        if (name) name.textContent = "Tap to clear";
      }
      clearTimer = setTimeout(resetClearConfirm, 3000);
      return;
    }
    clearMarks();
    resetClearConfirm();
  }

  // ------------------------------------------------------------------
  // Reveal: one primary root + optional "also consider"
  // ------------------------------------------------------------------
  function dedupeEvidence(ev) {
    const seen = new Set();
    const out = [];
    for (const e of ev) {
      const key = e.channel + "|" + e.label;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e);
    }
    return out;
  }

  function rowsHTML(info) {
    const lines = [
      info.sensory ? { label: "Area of skin it may affect", text: info.sensory } : null,
      info.motor ? { label: "Muscle group that may feel weak", text: info.motor } : null,
      info.reflex ? { label: "Reflex check your care team may do", text: info.reflex } : null,
    ].filter(Boolean);
    return `<div class="reveal-rows">
      ${lines.map((l) => `<div class="reveal-row"><span class="reveal-row-label">${l.label}</span><span class="reveal-row-text">${l.text}</span></div>`).join("")}
    </div>`;
  }

  function chipsHTML(entry) {
    const chips = dedupeEvidence(entry.evidence).slice(0, 4)
      .map((e) => `<span class="why-chip">${e.label}</span>`).join("");
    return chips ? `<div class="reveal-why"><span class="reveal-why-label">Because you marked symptoms here</span>${chips}</div>` : "";
  }

  // Primary: a prominent card. Secondary: a softened, collapsible <details> so it
  // never dominates the first screen on mobile.
  function primaryCardHTML(entry, opts) {
    const ROOT_LBL = (typeof ROOT_LABELS !== "undefined") ? ROOT_LABELS : {};
    const info = ROOT_LBL[entry.root] || {};
    const isTop = !opts || opts.isTop !== false;
    const kicker = isTop ? "Most likely nerve · may match" : "Also likely · may match";
    return `
      <div class="reveal-card is-primary" data-testid="reveal-${entry.root}">
        <div class="reveal-card-head">
          <span class="reveal-kicker">${kicker}</span>
          <span class="reveal-root">${entry.root}</span>
        </div>
        ${chipsHTML(entry)}
        ${rowsHTML(info)}
      </div>`;
  }

  // Map a nerve root (e.g. "C6", "L4", "S1", "T8") to the educational page that
  // covers it, plus a callback that preselects the exact level on that page.
  // Reuses the existing global level data + setters in app.js/data.js — no new
  // clinical content. Cervical roots -> Cervical, thoracic -> Thoracic,
  // lumbar/sacral -> Lumbar/Sacral.
  function learnTargetForRoot(root) {
    if (!root) return null;
    const letter = root[0];

    // Cervical: invert CERVICAL_ROOT_BY_LEVEL (default morphology n/a here).
    if (letter === "C" && typeof CERVICAL_ROOT_BY_LEVEL !== "undefined") {
      const level = Object.keys(CERVICAL_ROOT_BY_LEVEL).find((lv) => CERVICAL_ROOT_BY_LEVEL[lv] === root);
      if (level) return { page: "cervical", apply: () => { if (typeof setCervicalLevel === "function") setCervicalLevel(level); } };
    }
    // Thoracic.
    if (letter === "T" && typeof THORACIC_ROOT_BY_LEVEL !== "undefined") {
      const level = Object.keys(THORACIC_ROOT_BY_LEVEL).find((lv) => THORACIC_ROOT_BY_LEVEL[lv] === root);
      if (level) return { page: "thoracic", apply: () => { if (typeof setThoracicLevel === "function") setThoracicLevel(level); } };
    }
    // Lumbar / sacral: the lumbar page's default (paracentral) morphology shows
    // the traversing root, so match against TRAVERSING_ROOT.
    if ((letter === "L" || letter === "S") && typeof TRAVERSING_ROOT !== "undefined") {
      const level = Object.keys(TRAVERSING_ROOT).find((lv) => TRAVERSING_ROOT[lv] === root);
      if (level) return { page: "lumbar", apply: () => { if (typeof setLevel === "function") setLevel(level); } };
      // L1 only appears as an exiting root; fall back to that mapping.
      if (typeof EXITING_ROOT !== "undefined") {
        const exLevel = Object.keys(EXITING_ROOT).find((lv) => EXITING_ROOT[lv] === root);
        if (exLevel) return { page: "lumbar", apply: () => { if (typeof setLevel === "function") setLevel(exLevel); } };
      }
    }
    return null;
  }

  // The educational target for the currently revealed primary root.
  let revealLearnTarget = null;

  function gotoLearnMore() {
    const t = revealLearnTarget;
    if (!t) return;
    // Preselect the exact level (this also routes to the page via the setter's
    // setPage call). Fall back to a plain page navigation if no setter ran.
    if (typeof t.apply === "function") t.apply();
    if (typeof setPage === "function") setPage(t.page);
  }

  function updateLearnMoreButton(root) {
    const btn = $("[data-guide-learn]");
    if (!btn) return;
    revealLearnTarget = learnTargetForRoot(root);
    btn.hidden = !revealLearnTarget;
  }

  function setRevealCopy(headline, subtle) {
    const h = $("#guide-reveal-headline");
    if (h) h.textContent = headline;
    const s = $("#guide-reveal-subtle");
    if (s) s.textContent = subtle;
  }

  // The likely roots currently surfaced, and which one the patient has selected to
  // view in detail. Chips act as tabs: selecting one swaps the detail panel + map.
  let revealLikely = [];
  let revealActiveRoot = null;

  // Translate a raw score gap into soft, patient-friendly language. Never shows
  // a number — just a relative sense of how well each area fits the drawing.
  function matchStrengthLabel(ratio) {
    if (ratio >= 0.85) return "strong match";
    if (ratio >= 0.55) return "moderate match";
    return "possible match";
  }

  function renderRootChips(roots, activeRoot) {
    const host = $("#guide-reveal-roots");
    if (!host) return;
    if (roots.length <= 1) { host.innerHTML = ""; host.hidden = true; return; }
    host.hidden = false;
    host.setAttribute("role", "tablist");
    host.setAttribute("aria-label", "Likely nerve roots, ranked by how well they match — select one to see its details");
    const topScore = Math.max.apply(null, roots.map((r) => r.score || 0).concat([0.0001]));
    host.innerHTML = roots
      .map((r) => {
        const selected = r.root === activeRoot;
        const ratio = topScore > 0 ? Math.max(0, Math.min(1, (r.score || 0) / topScore)) : 0;
        const pct = Math.round(ratio * 100);
        const strength = matchStrengthLabel(ratio);
        // A slim bar visualises the relative fit; the text label keeps it
        // accessible without exposing a raw score.
        return `<button type="button" role="tab" class="reveal-root-chip${selected ? " is-active" : ""}"`
          + ` data-reveal-chip="${r.root}" data-testid="chip-reveal-${r.root}"`
          + ` aria-selected="${selected ? "true" : "false"}" tabindex="${selected ? "0" : "-1"}">`
          + `<span class="reveal-chip-root">${r.root}</span>`
          + `<span class="reveal-chip-meter" aria-hidden="true"><span class="reveal-chip-fill" style="width:${pct}%"></span></span>`
          + `<span class="reveal-chip-strength">${strength}</span>`
          + `</button>`;
      })
      .join("");
  }

  // Show one root's educational detail card + dermatome map + learn-more target.
  // Used both for single-root reveals and when a chip tab is selected.
  function renderRootDetail(root) {
    revealActiveRoot = root;
    const host = $("#guide-result-cards");
    const entry = revealLikely.find((r) => r.root === root)
      || (computeScores().find((r) => r.root === root))
      || { root, evidence: [] };
    const isTop = !revealLikely.length || revealLikely[0].root === root;
    if (host) host.innerHTML = primaryCardHTML(entry, { isTop });
    updateLearnMoreButton(root);
    if (typeof renderHumanMap === "function") {
      renderHumanMap("#symptom-dermatome-map", root, "Symptom localizer", "symptom");
    }
  }

  function selectRevealRoot(root) {
    if (!root || root === revealActiveRoot) return;
    renderRootChips(revealLikely, root);
    renderRootDetail(root);
    const host = $("#guide-reveal-roots");
    const active = host && host.querySelector(`[data-reveal-chip="${root}"]`);
    if (active) active.focus();
  }

  // ------------------------------------------------------------------
  // Safety-review banner
  //
  // A single radiculopathy is fundamentally a UNILATERAL, single-nerve-root
  // problem. When the paint drawing shows a pattern that plainly cannot be one
  // pinched nerve we surface a NEUTRAL amber banner suggesting the patient
  // review the drawing with their care team. This is intentionally NOT urgent
  // language — cauda-equina red flags live in their own dedicated card lower
  // on the page, where they belong with proper context. Adjacent-dermatome
  // patterns (e.g. L4/L5/S1 or C6/C7) are common radiculopathies and MUST
  // NEVER trigger the banner, no matter how many marks the drawing contains.
  //
  // Two triggers, either sufficient — both are gated heavily:
  //   1) Strong bilateral signal on a front/back full-body view. Requires
  //      substantial territory on BOTH sides of the midline, with a wide
  //      dead-zone so central lower-back scribbles or a stripe crossing the
  //      spine do not fire it. A stray dab on the opposite side is ignored.
  //   2) Genuinely non-contiguous ladder positions in the TOP scoring roots
  //      (e.g. a C6 + L4 mix, or C5..C8 with a gap of ≥2 rungs). A contiguous
  //      run of adjacent roots is normal multi-level radiculopathy, not
  //      scatter, and is suppressed here.
  //
  // Additionally, if the top-scored root sits in a strong unilateral cluster
  // with a contiguous adjacent neighbour, the banner is suppressed entirely.
  // That is the canonical L5+S1 / C6+C7 pattern.
  const BILATERAL_MIDLINE_DEADZONE = 12;   // viewBox units either side of x=50
  const BILATERAL_MIN_PER_SIDE = 8;        // marks needed on EACH side to fire
  const NONCONTIG_LADDER_GAP = 2;          // ladder rungs of gap to count as scatter
  const SCATTER_MIN_STRONG_ROOTS = 3;      // distinct comparably-strong roots

  function computeRedFlags(marks, ranked) {
    let left = 0, right = 0;
    for (const m of marks) {
      // Only front/back full-body views have a meaningful left/right midline.
      // Hand, foot, and side views are already lateralised by definition.
      if (m.view !== "front" && m.view !== "back") continue;
      if (m.x < 50 - BILATERAL_MIDLINE_DEADZONE) {
        // We do not need to disambiguate patient-left from patient-right —
        // we only need to know that BOTH sides of the body have marks.
        m.view === "front" ? right++ : left++;
      } else if (m.x > 50 + BILATERAL_MIDLINE_DEADZONE) {
        m.view === "front" ? left++ : right++;
      }
    }
    const bilateral = left >= BILATERAL_MIN_PER_SIDE && right >= BILATERAL_MIN_PER_SIDE;

    // Contiguous-cluster escape hatch: if the top gated roots form a
    // contiguous adjacent run on the ladder (canonical single-level or
    // two-adjacent-level radiculopathy), never fire the banner.
    const gated = ranked ? eligibleScores(ranked) : [];
    const topStrong = gated.length ? gated.filter((r) => r.score > 0 && r.score / gated[0].score >= MULTI_ROOT_RATIO) : [];
    const topIdx = topStrong.map((r) => ROOT_LADDER.indexOf(r.root)).sort((a, b) => a - b);
    let maxGap = 0;
    for (let i = 1; i < topIdx.length; i++) maxGap = Math.max(maxGap, topIdx[i] - topIdx[i - 1]);
    const contiguousUnilateralCluster = topIdx.length >= 1 && maxGap <= 1 && !bilateral;
    if (contiguousUnilateralCluster) return { show: false };

    const scattered = topStrong.length >= SCATTER_MIN_STRONG_ROOTS && maxGap >= NONCONTIG_LADDER_GAP;

    if (!bilateral && !scattered) return { show: false };
    if (bilateral && scattered) {
      return {
        show: true,
        headline: "Worth reviewing this with your care team",
        text: "Your drawing covers both sides of the body and several nerve areas at once. That can happen for many reasons — overlapping nerves, muscle-based pain, or more than one issue at the same time. Bring this pattern up at your next visit.",
      };
    }
    if (bilateral) {
      return {
        show: true,
        headline: "Symptoms on both sides — worth mentioning to your care team",
        text: "A single pinched nerve usually affects one side of the body at a time. Bilateral symptoms are worth reviewing with your clinician when you see them, since the cause may not be a single nerve root.",
      };
    }
    return {
      show: true,
      headline: "Symptoms span several separate areas",
      text: "Your drawing covers nerve areas that are not next to each other on the spine, which one pinched nerve alone would not usually explain. It is worth reviewing this pattern with your care team.",
    };
  }

  function applyRedFlagBanner(marks, ranked) {
    const banner = $("#guide-redflag");
    if (!banner) return;
    const flag = computeRedFlags(marks, ranked);
    if (!flag.show) { banner.hidden = true; return; }
    const title = $("#guide-redflag-title");
    const text = $("#guide-redflag-text");
    if (title) title.textContent = flag.headline;
    if (text) text.textContent = flag.text;
    banner.hidden = false;
  }

  function renderReveal() {
    const host = $("#guide-result-cards");
    const ranked = computeScores();
    const gated = eligibleScores(ranked); // anatomical region gate

    // Safety-review banner is evaluated on every render, using the ranked
    // scores so the contiguous-cluster escape hatch can suppress the banner
    // for canonical unilateral radiculopathy patterns (L5+S1, C6+C7, etc.).
    // In the empty state we hide it explicitly below.
    applyRedFlagBanner(state.marks, ranked);

    if (!gated.length || gated[0].score <= 0) {
      const banner0 = $("#guide-redflag");
      if (banner0) banner0.hidden = true;
      if (host) host.innerHTML = `<div class="reveal-card is-empty">We could not find a pattern yet. Tap <strong>Edit drawing</strong> and mark the spots where you feel symptoms.</div>`;
      const badge = $("[data-testid='text-symptom-map-active-root']");
      if (badge) badge.textContent = "No root selected";
      revealLikely = [];
      revealActiveRoot = null;
      renderRootChips([]);
      setRevealCopy(
        "Here's the nerve pattern your drawing most likely matches",
        "Each nerve from your spine sends feeling to its own area of skin and muscle. Mark where you feel symptoms and we'll show the nerve area that may fit best."
      );
      updateLearnMoreButton(null);
      return;
    }

    // `primary` is the highest-scored eligible root (the default-selected chip);
    // `likely` is the committed adjacency-based selection (gated + de-duped).
    const primary = gated[0];
    const likely = selectLikelyRoots(ranked);
    const uncertain = isBroadlyUncertain(ranked);

    // When uncertain, surface every comparably-strong eligible root (so the
    // patient can explore each) rather than the single adjacency cluster.
    let displayRoots = likely;
    if (uncertain) {
      displayRoots = gated
        .filter((r) => r.score / primary.score >= MULTI_ROOT_RATIO)
        .slice(0, MAX_ROOTS)
        .sort((a, b) => ROOT_LADDER.indexOf(a.root) - ROOT_LADDER.indexOf(b.root));
    }
    revealLikely = displayRoots;

    // Chips act as tabs; the highest-scored eligible root is selected by default.
    renderRootChips(displayRoots, primary.root);

    if (uncertain) {
      setRevealCopy(
        "Your drawing overlaps several nearby nerve areas",
        "The spots you marked spread across more than one nerve area without a single clear match. These nerves overlap a lot, so treat this as a starting point to review with your care team rather than a single answer — select each area below to see what it covers."
      );
    } else if (displayRoots.length > 1) {
      setRevealCopy(
        `Your drawing most closely matches the ${joinRootNames(displayRoots.map((r) => r.root))} nerve areas`,
        "Symptoms can cross more than one nerve area at once, and these neighbouring nerves overlap a lot. Select each nerve below to see what it covers — think of this as a starting point for a talk with your care team, not a diagnosis."
      );
    } else {
      setRevealCopy(
        `Your drawing most closely matches the ${primary.root} nerve area`,
        "Each nerve from your spine sends feeling to its own area of skin and muscle. Based on where you marked your symptoms, here's the nerve area that may fit best. Nerve areas overlap a lot, so think of this as a helpful starting point for a talk with your care team — not a diagnosis."
      );
    }

    // A single detail panel that reflects the selected (default: primary) root.
    // Other roots are reachable via the chip tabs, so no duplicate cards.
    renderRootDetail(primary.root);
  }

  // ------------------------------------------------------------------
  // Init
  // ------------------------------------------------------------------
  function init() {
    const guide = $("#symptom-guide");
    if (!guide) return;

    renderRegionCards();
    resetIntroPrompt(); // capture default intro headline/sub for restore
    renderTools();
    setSymbol("aching");

    // Region selection (intro). Listen on the whole intro phase so the injected
    // "Back to body areas" link (a sibling of the cards) is captured too.
    const intro = $("#guide-intro");
    if (intro) {
      intro.addEventListener("click", (e) => {
        const card = e.target.closest("[data-region]");
        if (!card) return;
        selectRegion(card.getAttribute("data-region"));
      });
    }

    // Tool palette (paint): color chips + eraser/undo/clear actions all live here.
    const tools = $("#guide-tools");
    if (tools) {
      tools.addEventListener("click", (e) => {
        const chip = e.target.closest("[data-tool]");
        if (chip) { setSymbol(chip.getAttribute("data-tool")); return; }
        if (e.target.closest("[data-erase]")) { setTool(state.tool === "erase" ? "paint" : "erase"); return; }
        if (e.target.closest("[data-guide-undo]")) { undo(); return; }
        if (e.target.closest("[data-guide-clear]")) { onClearTap(); return; }
      });
    }

    // Paint controls
    const changeRegionBtn = $("[data-guide-back]");
    if (changeRegionBtn) changeRegionBtn.addEventListener("click", backToIntro);
    const completeBtn = $("[data-guide-complete]");
    if (completeBtn) completeBtn.addEventListener("click", complete);

    // Reveal controls
    const editBtn = $("[data-guide-edit]");
    if (editBtn) editBtn.addEventListener("click", editDrawing);
    const learnBtn = $("[data-guide-learn]");
    if (learnBtn) learnBtn.addEventListener("click", gotoLearnMore);
    const copyBtn = $("[data-guide-copy]");
    if (copyBtn) copyBtn.addEventListener("click", copyDrawingForEHR);
    // Print / Save as PDF: browsers offer "Save as PDF" from the same dialog on
    // every modern platform, so a single window.print() covers both use cases.
    // The @media print rules in styles.css handle the actual page layout.
    const printBtn = $("[data-guide-print]");
    if (printBtn) printBtn.addEventListener("click", () => window.print());
    $$("[data-guide-startover]").forEach((b) => b.addEventListener("click", startOver));

    // Chip tabs: click to swap the detail panel; left/right arrows to move focus
    // between roots (standard tablist keyboard behaviour).
    const chipHost = $("#guide-reveal-roots");
    if (chipHost) {
      chipHost.addEventListener("click", (e) => {
        const chip = e.target.closest("[data-reveal-chip]");
        if (chip) selectRevealRoot(chip.getAttribute("data-reveal-chip"));
      });
      chipHost.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        const roots = revealLikely.map((r) => r.root);
        if (roots.length < 2) return;
        e.preventDefault();
        const cur = roots.indexOf(revealActiveRoot);
        const dir = e.key === "ArrowRight" ? 1 : -1;
        const next = roots[(cur + dir + roots.length) % roots.length];
        selectRevealRoot(next);
      });
    }

    showPhase("intro");

    // Test API for Playwright QA.
    window.__paint = {
      ready: () => true,
      phase: () => state.phase,
      regions: () => REGIONS.map((r) => r.id),
      selectRegion,
      setSymbol,
      // place a symptom at viewBox coords (x:0..100, y:0..200) on a view
      place: (sym, view, x, y) => { setSymbol(sym); placeOrRemove(view, x, y); },
      // read-only: what scored area+channel does a viewBox point resolve to (QA)
      resolveAt: (view, x, y, channel) => resolveArea(view, x, y, channel || "numbness"),
      // place a symptom at the centroid of a named scored region (first match)
      placeArea: (sym, view, area) => {
        setSymbol(sym);
        const pool = SENSORY_ZONES.concat(AXIAL_ZONES, HAND_ZONES, FOOT_ZONES, LATERAL_ZONES);
        const z = pool.find((s) => s.view === view && s.area === area);
        if (!z) return false;
        const [x, y, w, h] = z.rect;
        placeOrRemove(view, x + w / 2, y + h / 2);
        return true;
      },
      // simulate a brush DRAG across a named area's zone: places several deduped
      // dabs along a short path inside the zone (exercises the brush spacing).
      brushArea: (sym, view, area) => {
        setSymbol(sym);
        const pool = SENSORY_ZONES.concat(AXIAL_ZONES, HAND_ZONES, FOOT_ZONES, LATERAL_ZONES);
        const z = pool.find((s) => s.view === view && s.area === area);
        if (!z) return false;
        const [x, y, w, h] = z.rect;
        const cx = x + w / 2, cy = y + h / 2;
        const stroke = { id: ++state.strokeSeq, startX: cx, startY: cy, last: null, count: 0, moved: true };
        const steps = 8;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          paintDab(view, x + w * (0.2 + 0.6 * t), y + h * (0.5 + 0.2 * Math.sin(t * Math.PI)), stroke);
        }
        return stroke.count;
      },
      // simulate a real brush DRAG along arbitrary viewBox points (dense, deduped
      // by BRUSH_SPACING like a true pointer drag) — for faithful QA of strokes.
      brushPath: (sym, view, pts) => {
        setSymbol(sym);
        const stroke = { id: ++state.strokeSeq, last: null, count: 0, moved: true };
        pts.forEach(([x, y]) => paintDab(view, x, y, stroke));
        return stroke.count;
      },
      undo,
      setTool,
      tool: () => state.tool,
      eraseArea: (view, area) => {
        const pool = SENSORY_ZONES.concat(AXIAL_ZONES, HAND_ZONES, FOOT_ZONES, LATERAL_ZONES);
        const z = pool.find((s) => s.view === view && s.area === area);
        if (!z) return false;
        const [x, y, w, h] = z.rect;
        return eraseAt(view, x + w / 2, y + h / 2);
      },
      eraseAt: (view, x, y) => eraseAt(view, x, y),
      eraseRadius: () => ERASE_RADIUS,
      segCount: (view) => {
        const layer = markLayer(view);
        return layer ? layer.querySelectorAll(".mark-stroke, .mark-dot").length : 0;
      },
      clear: () => { clearMarks(); resetClearConfirm(); },
      clearTap: onClearTap,
      complete,
      startOver,
      editDrawing,
      markCount: () => state.marks.length,
      marks: () => state.marks.map((m) => ({ sym: m.sym, channel: m.channel, view: m.view, area: m.area, stroke: m.stroke })),
      scores: () => computeScores(),
      likelyRoots: () => selectLikelyRoots(computeScores()).map((r) => r.root),
      selectRevealRoot: (root) => selectRevealRoot(root),
      activeRevealRoot: () => revealActiveRoot,
      restoreStep,
      currentStep: () => state.phase,
      learnTarget: () => (revealLearnTarget ? revealLearnTarget.page : null),
      gotoLearnMore,
      copyDrawingForEHR,
      composeDrawingCanvas,
      exportPanelViews: () => paintedExportPanels().map((p) => p.panel.view),
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
