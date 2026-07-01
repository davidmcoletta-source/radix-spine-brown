// ===== Clinical data (VERBATIM — clinically vetted, do not alter) =====
// Roots indexed by morphology -> disc level.
const DISC_LEVELS = ["L1-L2", "L2-L3", "L3-L4", "L4-L5", "L5-S1"];

const TRAVERSING_ROOT = {
  "L1-L2": "L2",
  "L2-L3": "L3",
  "L3-L4": "L4",
  "L4-L5": "L5",
  "L5-S1": "S1",
};
const EXITING_ROOT = {
  "L1-L2": "L1",
  "L2-L3": "L2",
  "L3-L4": "L3",
  "L4-L5": "L4",
  "L5-S1": "L5",
};

// Per-root content. Sources cited in the page footer.
const ROOT_DATA = {
  L1: {
    sensory:
      "Inguinal region, groin, and proximal anterior thigh. Pure L1 radiculopathy is uncommon and is typically seen only with far-lateral lesions at this level.",
    autozone: "Autonomous zone is not well defined for L1 in routine practice.",
    motor:
      "Hip flexion may be weakly affected. L1 contributes minimally to lower-limb power testing.",
    reflex:
      "No reliable lower-limb deep tendon reflex. Cremasteric reflex may be diminished in males.",
    bedside:
      "Sensory change is the most useful sign; motor exam of the lower limb is usually unremarkable.",
  },
  L2: {
    sensory:
      "Anterior thigh below the inguinal ligament. Symptoms may radiate into the groin and proximal medial thigh.",
    autozone: "Autonomous zone: anterior thigh.",
    motor:
      "Hip flexion (iliopsoas) and hip adduction may be weak. L2 sits in the L2–L4 functional group with marked anterior-thigh overlap.",
    reflex: "No reliable lower-limb deep tendon reflex routinely tested for L2 in isolation.",
    bedside:
      "Difficulty with stairs or rising from a chair can hint at proximal weakness, but findings are often subtle.",
  },
  L3: {
    sensory:
      "Anterior and medial thigh and across the knee; numbness, paresthesias, or pain in the anterior knee region.",
    autozone: "Autonomous zone: anterior thigh.",
    motor:
      "Quadriceps weakness affecting knee extension, with hip-flexion and hip-adduction overlap shared with L2 and L4.",
    reflex:
      "Patellar reflex may be diminished, though decreased patellar reflex is more specific to L4.",
    bedside:
      "Quadriceps weakness with anteromedial knee numbness in an older patient with degenerative foraminal stenosis is a classic L3 picture.",
  },
  L4: {
    sensory:
      "Anterior thigh extending to the medial leg and ankle (medial calf). Symptoms can cross the knee onto the medial lower leg.",
    autozone: "Autonomous zone: medial calf.",
    motor:
      "Quadriceps (knee extension) and tibialis anterior (ankle dorsiflexion) weakness; hip flexion and adduction may also be affected through L2–L4 overlap.",
    reflex: "Decreased patellar (knee-jerk) reflex.",
    bedside:
      "Diminished knee jerk with medial-calf numbness and difficulty resisting knee extension supports L4.",
  },
  L5: {
    sensory:
      "Buttock and posterolateral thigh, lateral calf, dorsum of the foot, and great toe.",
    autozone: "Autonomous zone: dorsum of the foot, particularly the first dorsal web space.",
    motor:
      "Weakness of great-toe extension (EHL), ankle dorsiflexion (tibialis anterior), foot inversion and eversion, and hip abduction (gluteus medius).",
    reflex:
      "No common deep tendon reflex on routine exam. The internal hamstring (medial hamstring / semitendinosus–semimembranosus) reflex may be diminished.",
    bedside:
      "Heel-walk difficulty or frank foot drop. A positive Trendelenburg sign can reflect gluteus medius weakness.",
  },
  S1: {
    sensory:
      "Posterolateral calf, lateral foot and sole, and the heel; pain often radiates from the buttock down the posterior leg.",
    autozone: "Autonomous zone: lateral or plantar foot (sole).",
    motor:
      "Plantar flexion (gastrocnemius–soleus), hip extension (gluteus maximus), and knee flexion (hamstrings) weakness.",
    reflex: "Decreased or absent Achilles (ankle-jerk) reflex.",
    bedside:
      "Tiptoe-walk difficulty; reduced single-leg heel-raise endurance is a sensitive bedside test for S1.",
  },
};

const PREVALENCE = {
  "L1-L2": { common: false, note: "Uncommon site for lumbar disc herniation." },
  "L2-L3": { common: false, note: "Uncommon site for lumbar disc herniation." },
  "L3-L4": { common: false, note: "Less common than L4–L5/L5–S1; seen more often in older patients with degenerative changes." },
  "L4-L5": { common: true, note: "Among the most common levels — together with L5–S1, accounts for ~95% of lumbar disc herniations." },
  "L5-S1": { common: true, note: "Among the most common levels — together with L4–L5, accounts for ~95% of lumbar disc herniations." },
};

// ===== Cervical data =====
const CERVICAL_LEVELS = ["C3-C4", "C4-C5", "C5-C6", "C6-C7", "C7-T1"];
const CERVICAL_ROOT_BY_LEVEL = {
  "C3-C4": "C4",
  "C4-C5": "C5",
  "C5-C6": "C6",
  "C6-C7": "C7",
  "C7-T1": "C8",
};

const CERVICAL_ROOT_DATA = {
  C4: {
    sensory: "Neck, upper trapezial, and shoulder-region pain or paresthesia. C2–C4 radiculopathy is uncommon and often less cleanly localizing than lower cervical roots.",
    motor: "No dependable single upper-extremity myotome. Severe high cervical pathology can overlap with shoulder girdle symptoms, but classic limb weakness is often absent.",
    reflex: "No reliable routine upper-extremity deep tendon reflex.",
    bedside: "Think broadly: upper cervical radicular symptoms can mimic primary neck pain, headache, shoulder pathology, or early myelopathy.",
    caution: "Uncommon; screen for myelopathy or nonradicular neck/shoulder causes.",
  },
  C5: {
    sensory: "Neck, shoulder, suprascapular area, and lateral upper arm to the elbow; dorsal arm paresthesias may be present.",
    motor: "Deltoid and biceps weakness; shoulder abduction, external rotation, and elbow flexion may be affected.",
    reflex: "Biceps reflex decreased; deltoid reflex may be reduced but is less routinely used.",
    bedside: "Shoulder abduction weakness with sensory change over the deltoid patch; can mimic rotator cuff disease.",
    caution: "Rotator cuff tear and Parsonage-Turner syndrome can resemble C5 radiculopathy.",
  },
  C6: {
    sensory: "Neck or trapezial pain radiating down the lateral forearm into the thumb and index finger.",
    motor: "Biceps, brachioradialis/supination, and wrist extensor weakness; elbow flexion may be affected.",
    reflex: "Biceps and brachioradialis reflexes may be decreased.",
    bedside: "Weak wrist extension or biceps with thumb/index paresthesia; can mimic carpal tunnel syndrome.",
    caution: "Carpal tunnel syndrome is a common mimic when thumb/index sensory symptoms dominate.",
  },
  C7: {
    sensory: "Lower neck, interscapular or scapular region, posterior forearm, and middle finger; some tables include index, middle, and ring finger paresthesias.",
    motor: "Triceps weakness with elbow extension; wrist flexion, forearm pronation, and finger extension may also be affected.",
    reflex: "Triceps reflex decreased.",
    bedside: "Triceps weakness or diminished triceps reflex with middle-finger paresthesia is the classic pattern.",
    caution: "Posterior interosseous neuropathy can mimic motor findings but should spare sensation and triceps reflex.",
  },
  C8: {
    sensory: "Medial forearm with ring and little finger paresthesias; interscapular or infrascapular pain may occur.",
    motor: "Finger flexion and hand-intrinsic weakness; grip may be reduced.",
    reflex: "No reliable routine deep tendon reflex.",
    bedside: "Difficulty keeping fingers flexed or weak grip with ulnar-sided hand paresthesia.",
    caution: "Cubital tunnel syndrome and ulnar neuropathy are key mimics; look for elbow tenderness and ulnar-distribution peripheral signs.",
  },
};

const CERVICAL_MATRIX_ROWS = CERVICAL_LEVELS.map((level) => {
  const root = CERVICAL_ROOT_BY_LEVEL[level];
  const data = CERVICAL_ROOT_DATA[root];
  return {
    level,
    root,
    sensory: data.sensory,
    motor: data.motor,
    reflex: data.reflex,
    caution: data.caution,
  };
});

// ===== Thoracic data =====
const THORACIC_LEVELS = [
  "T1-T2", "T2-T3", "T3-T4", "T4-T5",
  "T5-T6", "T6-T7", "T7-T8", "T8-T9",
  "T9-T10", "T10-T11", "T11-T12", "T12-L1",
];

const THORACIC_ROOT_BY_LEVEL = {
  "T1-T2": "T1",
  "T2-T3": "T2",
  "T3-T4": "T3",
  "T4-T5": "T4",
  "T5-T6": "T5",
  "T6-T7": "T6",
  "T7-T8": "T7",
  "T8-T9": "T8",
  "T9-T10": "T9",
  "T10-T11": "T10",
  "T11-T12": "T11",
  "T12-L1": "T12",
};

const THORACIC_ROOT_DATA = {
  T1: {
    sensory: "Medial upper arm and medial forearm, with upper chest/axillary overlap. T1 also contributes to the lower brachial plexus, so C8/T1 overlap is common.",
    motor: "May involve intrinsic hand muscles through T1 contribution, but isolated thoracic-root localization is uncommon.",
    reflex: "No reliable thoracic deep tendon reflex. Upper-extremity reflexes may remain normal in isolated T1 radiculopathy.",
    caution: "Differentiate from C8/T1 cervical radiculopathy, ulnar neuropathy, brachial plexopathy, and apical thoracic pathology.",
  },
  T2: {
    sensory: "Axilla and upper medial arm, with a band across the upper chest just below the clavicular region.",
    motor: "Intercostal contribution; clinically obvious weakness is uncommon unless severe or multilevel.",
    reflex: "No reliable segmental deep tendon reflex.",
    caution: "Upper thoracic pain can mimic shoulder, chest wall, cardiopulmonary, or brachial plexus conditions.",
  },
  T3: {
    sensory: "Upper anterior chest band, roughly above the nipple line and below the clavicle.",
    motor: "Intercostal muscle contribution; motor deficit is usually subtle or absent.",
    reflex: "No reliable routine reflex.",
    caution: "Consider rib, zoster, pulmonary, cardiac, and referred shoulder pathology when symptoms are anterior chest dominant.",
  },
  T4: {
    sensory: "Nipple-line dermatome band wrapping from posterior thorax to anterior chest.",
    motor: "Intercostal muscle contribution; clinically measurable focal weakness is uncommon.",
    reflex: "No reliable routine reflex.",
    caution: "Chest pain at this level requires appropriate non-spine differential consideration before labeling radicular.",
  },
  T5: {
    sensory: "Lower anterior chest band, between nipple line and xiphoid region.",
    motor: "Intercostal contribution; weakness is generally not prominent.",
    reflex: "No reliable routine reflex.",
    caution: "May mimic costochondral, rib, pulmonary, cardiac, or upper abdominal conditions.",
  },
  T6: {
    sensory: "Xiphoid-level band, often described as lower chest or epigastric wrapping pain.",
    motor: "Lower intercostal and upper abdominal wall contribution; focal weakness is often difficult to detect.",
    reflex: "No reliable DTR; superficial upper abdominal reflex can be considered but is not a clean root localizer.",
    caution: "Epigastric pain can mimic GI, biliary, cardiac, or thoracic wall pathology.",
  },
  T7: {
    sensory: "Upper abdominal band below the xiphoid and above the umbilicus.",
    motor: "Upper abdominal wall contribution; weakness may be subtle and often absent on routine exam.",
    reflex: "No reliable DTR; abdominal reflex is nonspecific.",
    caution: "Abdominal wall pain can be mistaken for visceral disease; look for dermatomal sensory change and spine-motion provocation.",
  },
  T8: {
    sensory: "Mid-upper abdominal band; commonly wraps from the lower thorax toward the upper abdomen.",
    motor: "Abdominal wall contribution; severe lesions may produce segmental weakness but routine motor testing is limited.",
    reflex: "No reliable DTR; abdominal reflex asymmetry may support but does not localize precisely.",
    caution: "Thoracic radiculopathy is often overlooked because abdominal imaging can be unrevealing despite persistent dermatomal pain.",
  },
  T9: {
    sensory: "Upper abdominal band just superior to the umbilicus.",
    motor: "Abdominal wall contribution; weakness is usually subtle.",
    reflex: "No reliable DTR.",
    caution: "Differentiate from abdominal wall entrapment, zoster, diabetic radiculopathy, and visceral abdominal pathology.",
  },
  T10: {
    sensory: "Umbilicus-level dermatome band.",
    motor: "Abdominal wall contribution; severe denervation can affect trunk stability or produce abdominal wall asymmetry.",
    reflex: "No reliable DTR; lower abdominal reflex is nonspecific.",
    caution: "Periumbilical pain can be visceral or abdominal wall in origin; a unilateral band with sensory change supports radicular pattern.",
  },
  T11: {
    sensory: "Lower abdominal band below the umbilicus and above the inguinal region.",
    motor: "Lower abdominal wall contribution; focal weakness may be difficult to isolate.",
    reflex: "No reliable DTR.",
    caution: "Can mimic lower abdominal, flank, renal, gynecologic, or urologic pain syndromes.",
  },
  T12: {
    sensory: "Suprapubic or just-above-inguinal ligament region, sometimes extending toward flank or groin.",
    motor: "Lower abdominal wall contribution; severe lesions can contribute to abdominal wall bulge or pseudohernia.",
    reflex: "No reliable DTR.",
    caution: "Distinguish from iliohypogastric/ilioinguinal neuralgia, upper lumbar radiculopathy, hernia, and visceral pelvic or abdominal causes.",
  },
};

const THORACIC_MATRIX_ROWS = THORACIC_LEVELS.map((level) => {
  const root = THORACIC_ROOT_BY_LEVEL[level];
  const data = THORACIC_ROOT_DATA[root];
  return {
    level,
    root,
    sensory: data.sensory,
    motorReflex: `${data.motor} ${data.reflex}`,
    caution: data.caution,
  };
});

function shortenMotor(root) {
  switch (root) {
    case "L2": return "Hip flexion / adduction (overlap)";
    case "L3": return "Knee extension; hip flexion (overlap)";
    case "L4": return "Knee extension; ankle dorsiflexion";
    case "L5": return "Great-toe extension, dorsiflexion, hip abduction";
    case "S1": return "Plantar flexion, hip extension, knee flexion";
    default: return "—";
  }
}
function shortenReflex(root) {
  switch (root) {
    case "L2": return "None reliable";
    case "L3": return "Patellar (less specific)";
    case "L4": return "Patellar ↓";
    case "L5": return "Internal hamstring ↓ (no common DTR)";
    case "S1": return "Achilles ↓";
    default: return "—";
  }
}

// Compact matrix rows.
const MATRIX_ROWS = DISC_LEVELS.map((level) => {
  const trav = TRAVERSING_ROOT[level];
  const exit = EXITING_ROOT[level];
  const root = ROOT_DATA[trav];
  return {
    level,
    traversing: trav,
    exiting: exit,
    autozone: root.autozone.replace(/^Autonomous zone:\s*/i, ""),
    motorShort: shortenMotor(trav),
    reflexShort: shortenReflex(trav),
  };
});

const SYMPTOM_AREAS = [
  { id: "neck-trap", group: "Neck and arm", label: "Neck, upper shoulder, or top of shoulder", hint: "Symptoms near the neck/shoulder line", weights: { C4: 4, C5: 1 } },
  { id: "deltoid-lateral-arm", group: "Neck and arm", label: "Shoulder cap or outside upper arm", hint: "The patch over the deltoid muscle", weights: { C5: 5, C6: 1 } },
  { id: "radial-forearm-thumb", group: "Neck and arm", label: "Thumb side of forearm, thumb, or index finger", hint: "Often used as a C6 clue", weights: { C6: 5, C7: 1 } },
  { id: "middle-finger", group: "Neck and arm", label: "Middle finger or center of the hand", hint: "Often used as a C7 clue", weights: { C7: 5, C6: 1, C8: 1 } },
  { id: "ulnar-hand", group: "Neck and arm", label: "Ring finger, small finger, or inner forearm", hint: "Can overlap with ulnar nerve symptoms", weights: { C8: 5, T1: 2 } },
  { id: "medial-upper-arm", group: "Chest, trunk, and abdomen", label: "Inner upper arm or armpit area", hint: "Inner-arm (lower brachial plexus) zone", weights: { T1: 4, C8: 2 } },
  { id: "upper-chest", group: "Chest, trunk, and abdomen", label: "Band of symptoms across the upper chest", hint: "May wrap around from the back", weights: { T2: 4, T3: 3 } },
  { id: "nipple-line", group: "Chest, trunk, and abdomen", label: "Band around the nipple line", hint: "A common T4 landmark", weights: { T4: 5, T3: 1, T5: 1 } },
  { id: "xiphoid-epigastric", group: "Chest, trunk, and abdomen", label: "Lower chest or upper stomach band", hint: "Near the breastbone tip/upper abdomen", weights: { T6: 5, T5: 2, T7: 2 } },
  { id: "umbilicus", group: "Chest, trunk, and abdomen", label: "Band around the belly button", hint: "A common T10 landmark", weights: { T10: 5, T9: 2, T11: 2 } },
  { id: "lower-abdomen-inguinal", group: "Chest, trunk, and abdomen", label: "Lower abdomen or just above the groin", hint: "Lower trunk transition zone", weights: { T12: 4, L1: 3, T11: 1 } },
  { id: "groin", group: "Low back and leg", label: "Groin or crease of the hip", hint: "Upper lumbar symptom area", weights: { L1: 5, L2: 2, T12: 1 } },
  { id: "anterior-thigh", group: "Low back and leg", label: "Front of the thigh", hint: "Several upper lumbar nerves overlap here", weights: { L2: 4, L3: 4, L4: 1 } },
  { id: "anterior-knee-medial-thigh", group: "Low back and leg", label: "Front of knee or inner thigh", hint: "Often an L3/L4 clue", weights: { L3: 5, L4: 2, L2: 1 } },
  { id: "medial-calf-ankle", group: "Low back and leg", label: "Inner calf, inner ankle, or inner foot", hint: "Often used as an L4 clue", weights: { L4: 5, L3: 1 } },
  { id: "lateral-leg-dorsal-foot", group: "Low back and leg", label: "Outside leg, top of foot, or big toe", hint: "Often used as an L5 clue", weights: { L5: 5, L4: 1, S1: 1 } },
  { id: "posterior-calf-lateral-foot", group: "Low back and leg", label: "Back of calf, heel, outside foot, or sole", hint: "Often used as an S1 clue", weights: { S1: 5, L5: 1 } },
];

const AXIAL_PAIN_AREAS = [
  { id: "upper-neck", group: "Neck and back pain", label: "Upper neck or base of skull", hint: "Axial neck pain; often less specific than arm symptoms", weights: { C4: 2, C5: 1, C6: 1 } },
  { id: "lower-neck", group: "Neck and back pain", label: "Lower neck", hint: "Neck pain near the lower cervical spine", weights: { C5: 1, C6: 1, C7: 1, C8: 1 } },
  { id: "trapezial-scapular", group: "Neck and back pain", label: "Trapezius, shoulder blade, or between shoulder blades", hint: "Commonly reported with cervical radicular symptoms", weights: { C5: 1, C6: 1, C7: 2, C8: 1, T1: 1 } },
  { id: "mid-back", group: "Neck and back pain", label: "Mid-back or thoracic spine", hint: "Axial thoracic pain; correlate with wraparound chest or abdominal symptoms", weights: { T3: 1, T4: 1, T5: 1, T6: 1, T7: 1, T8: 1, T9: 1, T10: 1 } },
  { id: "low-back", group: "Neck and back pain", label: "Low back", hint: "Axial low-back pain; common and not specific by itself", weights: { L3: 1, L4: 1, L5: 1, S1: 1 } },
  { id: "buttock-si", group: "Neck and back pain", label: "Buttock or sacroiliac area", hint: "Can accompany lower lumbar or sacral patterns", weights: { L4: 1, L5: 2, S1: 2 } },
];

const SYMPTOM_FINDINGS = [
  { id: "shoulder-abduction", group: "Weakness noticed", label: "Trouble lifting the arm out to the side", hint: "Shoulder/deltoid weakness", weights: { C5: 5, C6: 1 } },
  { id: "elbow-flexion", group: "Weakness noticed", label: "Trouble bending the elbow", hint: "Biceps-type weakness", weights: { C5: 3, C6: 4 } },
  { id: "wrist-extension", group: "Weakness noticed", label: "Trouble lifting the wrist up", hint: "Wrist extension weakness", weights: { C6: 4, C7: 2 } },
  { id: "elbow-extension", group: "Weakness noticed", label: "Trouble straightening the elbow", hint: "Triceps-type weakness", weights: { C7: 5 } },
  { id: "grip-finger-flexion", group: "Weakness noticed", label: "Weak grip or trouble bending fingers", hint: "Hand-strength clue", weights: { C8: 5, T1: 2 } },
  { id: "hand-intrinsics", group: "Weakness noticed", label: "Trouble spreading fingers apart", hint: "Small hand muscle weakness", weights: { T1: 4, C8: 3 } },
  { id: "hip-flexion", group: "Weakness noticed", label: "Trouble lifting the thigh", hint: "Hip flexion weakness", weights: { L2: 4, L3: 2, L1: 1 } },
  { id: "knee-extension", group: "Weakness noticed", label: "Trouble straightening the knee", hint: "Quadriceps weakness", weights: { L3: 4, L4: 4 } },
  { id: "ankle-dorsiflexion", group: "Weakness noticed", label: "Foot drop or trouble heel-walking", hint: "Trouble lifting the foot up", weights: { L5: 4, L4: 3 } },
  { id: "great-toe-extension", group: "Weakness noticed", label: "Trouble lifting the big toe", hint: "Common L5 strength clue", weights: { L5: 5 } },
  { id: "plantarflexion", group: "Weakness noticed", label: "Trouble standing on tiptoes", hint: "Calf push-off weakness", weights: { S1: 5 } },
  { id: "biceps-reflex", group: "Reflex noted by clinician", label: "Biceps reflex was decreased", hint: "Often C5/C6", weights: { C5: 3, C6: 3 } },
  { id: "brachioradialis-reflex", group: "Reflex noted by clinician", label: "Forearm reflex was decreased", hint: "Often C6", weights: { C6: 4 } },
  { id: "triceps-reflex", group: "Reflex noted by clinician", label: "Triceps reflex was decreased", hint: "Often C7", weights: { C7: 5 } },
  { id: "patellar-reflex", group: "Reflex noted by clinician", label: "Knee reflex was decreased", hint: "Often L4", weights: { L4: 5, L3: 2 } },
  { id: "achilles-reflex", group: "Reflex noted by clinician", label: "Ankle reflex was decreased", hint: "Often S1", weights: { S1: 5 } },
];

const SYMPTOM_CHANNELS = [
  {
    id: "axial",
    symbol: "◆",
    title: "Neck / back pain",
    prompt: "Where is the neck or back pain?",
    helper: "Use this to show axial pain separately from arm, chest, trunk, or leg symptoms.",
    items: AXIAL_PAIN_AREAS,
    weight: 0.45,
  },
  {
    id: "pain",
    symbol: "×",
    title: "Pain / aching",
    prompt: "Where is the pain felt?",
    helper: "Mark all areas where pain travels or settles.",
    items: SYMPTOM_AREAS,
    weight: 1,
  },
  {
    id: "burning",
    symbol: "≈",
    title: "Burning / electric",
    prompt: "Where is burning, zapping, or electric pain felt?",
    helper: "Use this when the symptom quality is different from general pain.",
    items: SYMPTOM_AREAS,
    weight: 1.08,
  },
  {
    id: "numbness",
    symbol: "•",
    title: "Numbness / tingling",
    prompt: "Where is numbness, pins-and-needles, or tingling felt?",
    helper: "Sensory change can localize differently from pain.",
    items: SYMPTOM_AREAS,
    weight: 1.18,
  },
  {
    id: "weakness",
    symbol: "↓",
    title: "Weakness",
    prompt: "What activity or movement feels weak?",
    helper: "Weakness is scored separately because it may not be felt in the same place as pain.",
    items: SYMPTOM_FINDINGS.filter((item) => item.group === "Weakness noticed"),
    weight: 1.45,
  },
  {
    id: "exam",
    symbol: "!",
    title: "Exam finding",
    prompt: "Was a reflex change noted by the clinician?",
    helper: "Optional clinician-entered layer.",
    items: SYMPTOM_FINDINGS.filter((item) => item.group === "Reflex noted by clinician"),
    weight: 1.3,
  },
];

const ROOT_LABELS = {
  C4: CERVICAL_ROOT_DATA.C4,
  C5: CERVICAL_ROOT_DATA.C5,
  C6: CERVICAL_ROOT_DATA.C6,
  C7: CERVICAL_ROOT_DATA.C7,
  C8: CERVICAL_ROOT_DATA.C8,
  ...THORACIC_ROOT_DATA,
  ...ROOT_DATA,
};

// ===== Human dermatome reference map sources (verbatim asset wiring) =====
const HUMAN_DERMATOME_SRC = "./assets/dermatomes-highlight-v6-default.svg";
const DERMATOME_HIGHLIGHT_SOURCES = Object.fromEntries(
  [
    "C4", "C5", "C6", "C7", "C8",
    "L1", "L2", "L3", "L4", "L5", "S1",
  ].map((root) => [root, `./assets/dermatomes-highlight-v6-${root}.svg`])
);
DERMATOME_HIGHLIGHT_SOURCES.L5 = "./assets/dermatomes-highlight-v6-L5-buttockfix.svg";
DERMATOME_HIGHLIGHT_SOURCES.C6 = "./assets/dermatomes-highlight-v11-C6-outer-lateral-arm.svg";
DERMATOME_HIGHLIGHT_SOURCES.C7 = "./assets/dermatomes-highlight-v12-C7-radiating.svg";
DERMATOME_HIGHLIGHT_SOURCES.S1 = "./assets/dermatomes-highlight-v14-S1-fullregion.svg";
DERMATOME_HIGHLIGHT_SOURCES.L4 = "./assets/dermatomes-highlight-v14-L4-fullregion.svg";
const SOURCE_BASED_THORACIC_SOURCES = Object.fromEntries(
  [
    "T1", "T2", "T3", "T4", "T5", "T6",
    "T7", "T8", "T9", "T10", "T11", "T12",
  ].map((root) => [root, `./assets/dermatomes-goran-highlight-v4-${root}.svg`])
);
const HUMAN_MAP_ATTRIBUTION =
  'Dermatome base map: <a href="https://commons.wikimedia.org/wiki/File:Dermatoms.svg" target="_blank" rel="noopener">Ralf Stephan / Wikimedia Commons</a>, public domain.';
const SOURCE_BASED_THORACIC_ATTRIBUTION =
  'Thoracic dermatome map: <a href="https://commons.wikimedia.org/wiki/File:Dermatomes_labeled,_female_front-back_3d-shaded.svg" target="_blank" rel="noopener">Goran_tek-en / Wikimedia Commons</a>, CC BY-SA 4.0.';

const HUMAN_LANDMARKS = {
  C4: { landmark: "Lower neck, clavicle, and shoulder cap region.", note: "Use shoulder/clavicle sensation as a practical C4 landmark." },
  C5: { landmark: "Lateral upper arm / deltoid badge.", note: "C5 overlaps shoulder pathology; pair with deltoid/biceps testing." },
  C6: { landmark: "Radial forearm and thumb.", note: "Classic sensory test point: thumb." },
  C7: { landmark: "Central hand, especially middle finger.", note: "Classic sensory test point: middle finger." },
  C8: { landmark: "Ulnar hand, ring/small finger, medial forearm.", note: "Compare with ulnar neuropathy and C8/T1 overlap." },
  T1: { landmark: "Medial upper arm and axilla-adjacent chest.", note: "T1 overlaps lower brachial plexus and C8/T1 patterns." },
  T2: { landmark: "Upper chest/back near axilla.", note: "Thoracic pain often wraps from posterior to anterior trunk." },
  T3: { landmark: "Upper chest, below axilla.", note: "Band-like pain may be unilateral." },
  T4: { landmark: "Nipple-line dermatome.", note: "T4 at the nipple line is a standard clinical landmark." },
  T5: { landmark: "Lower pectoral / upper sternum band.", note: "Differentiate from chest wall and cardiopulmonary causes." },
  T6: { landmark: "Xiphoid-level band.", note: "Epigastric symptoms can mimic visceral disease." },
  T7: { landmark: "Upper abdominal band.", note: "Thoracic radicular pain may worsen with cough or trunk movement." },
  T8: { landmark: "Mid upper-abdominal band.", note: "Look for an asymmetric sensory stripe." },
  T9: { landmark: "Just above umbilicus.", note: "Thoracic levels are best read as bands, not sharp borders." },
  T10: { landmark: "Umbilicus-level dermatome.", note: "T10 at the umbilicus is a standard clinical landmark." },
  T11: { landmark: "Below umbilicus, above inguinal region.", note: "Consider abdominal wall and visceral mimics." },
  T12: { landmark: "Just above inguinal ligament / pelvic brim.", note: "May overlap upper lumbar or ilioinguinal-type symptoms." },
  L1: { landmark: "Inguinal region and upper groin.", note: "L1 is uncommon in routine lumbar radiculopathy patterns." },
  L2: { landmark: "Anterior upper thigh.", note: "L2-L4 functions overlap strongly." },
  L3: { landmark: "Anterior thigh and medial knee.", note: "Pair sensory findings with quadriceps strength and patellar reflex." },
  L4: { landmark: "Medial leg, medial malleolus, medial foot.", note: "Classic sensory test point: medial malleolus." },
  L5: { landmark: "Anterolateral leg, dorsum of foot, great toe.", note: "Classic sensory test point: dorsum of foot / great toe." },
  S1: { landmark: "Posterolateral calf, heel, lateral foot, little toe.", note: "Classic sensory test point: lateral foot or little toe." },
};

// Spotlight center-Y used for auto-scroll positioning in the enlarged viewer (verbatim).
const HUMAN_SPOTLIGHT_CENTERS = {
  C4: 158, C5: 224, C6: 486, C7: 495, C8: 490,
  T1: 202, T2: 232, T3: 262, T4: 292, T5: 322, T6: 352,
  T7: 382, T8: 412, T9: 442, T10: 472, T11: 502, T12: 534,
  L1: 575, L2: 648, L3: 740, L4: 851, L5: 869, S1: 869,
};

// ===== Morphology axial-view image map (verbatim) =====
const MORPH_IMAGE = {
  paracentral: { base: "morph-paracentral-rendered", label: "Paracentral · traversing" },
  "far-lateral": { base: "morph-extraforaminal-rendered", label: "Far-lateral · exiting" },
  central: { base: "morph-central-rendered", label: "Central" },
  foraminal: { base: "morph-foraminal-rendered", label: "Foraminal · exiting" },
  normal: { base: "morph-normal-rendered-labeled", label: "Normal anatomy" },
};
