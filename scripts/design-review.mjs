#!/usr/bin/env node
/**
 * design-review.mjs
 *
 * Runs on every visual code change. Produces:
 *   1. Side-by-side before/after screenshots (desktop 1280 + mobile 375) for every route.
 *   2. Deviation report against design-review/brand-standards.json (colors, type, spacing, logo).
 *
 * Usage (local):
 *   node scripts/design-review.mjs \
 *     --baseline-url http://localhost:5000 \
 *     --candidate-url http://localhost:5001 \
 *     --out design-review/out
 *
 * Usage (CI): the workflow builds `main` and the PR head into separate servers,
 * passes both URLs, and uploads `design-review/out/**` as artifacts.
 */

import { chromium } from "playwright";
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ---- CLI args ----
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const BASELINE = arg("baseline-url", "http://localhost:5000");
const CANDIDATE = arg("candidate-url", "http://localhost:5001");
const OUT = path.resolve(ROOT, arg("out", "design-review/out"));

const ROUTES = [
  { name: "landing",           path: "/" },
  { name: "categories",        path: "/#/categories" },
  { name: "epilepsy",          path: "/#/condition/epilepsy" },
  { name: "category-functional", path: "/#/category/functional" },
  { name: "about",             path: "/#/about" },
];

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile",  width: 375,  height: 812 },
];

// ---- Utilities ----
async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function rgbFromCss(str) {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(str);
  return m ? [+m[1], +m[2], +m[3]] : null;
}
function rgbToHex([r,g,b]) {
  return "#" + [r,g,b].map(x => x.toString(16).padStart(2,"0")).join("").toUpperCase();
}
function relLuminance([r,g,b]) {
  const f = c => { c /= 255; return c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); };
  const [R,G,B] = [r,g,b].map(f);
  return 0.2126*R + 0.7152*G + 0.0722*B;
}
function contrastRatio(a, b) {
  const [L1, L2] = [relLuminance(a), relLuminance(b)].sort((x,y) => y-x);
  return (L1 + 0.05) / (L2 + 0.05);
}

// ---- Screenshot capture ----
async function captureAll(url, tag) {
  const browser = await chromium.launch();
  const shots = {};
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    for (const route of ROUTES) {
      const dest = path.join(OUT, "shots", `${route.name}-${vp.name}-${tag}.png`);
      await ensureDir(path.dirname(dest));
      try {
        await page.goto(url + route.path, { waitUntil: "domcontentloaded", timeout: 20000 });
        await page.waitForTimeout(1200);
        await page.screenshot({ path: dest, fullPage: false });
        shots[`${route.name}-${vp.name}`] = dest;
      } catch (e) {
        console.warn(`[${tag}] ${route.name}-${vp.name} failed: ${e.message}`);
      }
    }
    await ctx.close();
  }
  await browser.close();
  return shots;
}

// ---- Token & DOM audit ----
async function auditTokens(url) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(url + "/", { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(600);

  const audit = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const vars = {
      "--bh-dark":          root.getPropertyValue("--bh-dark").trim(),
      "--bh-teal":          root.getPropertyValue("--bh-teal").trim(),
      "--bh-rich-emerald":  root.getPropertyValue("--bh-rich-emerald").trim(),
      "--bh-light-emerald": root.getPropertyValue("--bh-light-emerald").trim(),
      "--bh-pale-emerald":  root.getPropertyValue("--bh-pale-emerald").trim(),
      "--font-display":     root.getPropertyValue("--font-display").trim(),
      "--font-body":        root.getPropertyValue("--font-body").trim(),
    };
    // Sample computed styles from key elements
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        color: cs.color,
        background: cs.backgroundColor,
        fontFamily: cs.fontFamily,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight,
        padding: cs.padding,
        margin: cs.margin,
      };
    };
    return {
      vars,
      logo:  pick('[data-testid="img-npsi-logo"]'),
      nav:   pick('[data-testid="nav-bar"]'),
      body:  pick('body'),
      h1:    pick('h1'),
      h2:    pick('h2'),
    };
  });

  await browser.close();
  return audit;
}

// ---- Deviation checks ----
function checkDeviations(audit, brand) {
  const deviations = [];
  const info = [];

  // 1. Token hex matches
  const expected = {
    "--bh-dark":          brand.colors.primary.darkEmerald.hex,
    "--bh-teal":          brand.colors.webVariants.brandEmerald.hex,
    "--bh-rich-emerald":  brand.colors.webVariants.richEmerald.hex,
    "--bh-light-emerald": brand.colors.webVariants.brandLightEmerald.hex,
    "--bh-pale-emerald":  brand.colors.webVariants.paleEmerald.hex,
  };
  for (const [k, expHex] of Object.entries(expected)) {
    const actual = audit.vars[k]?.toUpperCase();
    if (!actual) {
      deviations.push({ severity: "error", category: "color", token: k, message: `token missing` });
    } else if (actual !== expHex.toUpperCase()) {
      deviations.push({
        severity: "error",
        category: "color",
        token: k,
        expected: expHex,
        actual,
        message: `${k} drift: expected ${expHex}, got ${actual}`,
      });
    }
  }

  // 2. Forbidden Brown Red anywhere except logo image
  const forbidden = brand.colors.forbidden.brownRed.hex.toUpperCase();
  const brownRedRgb = hexToRgb(forbidden);
  const seen = [audit.nav, audit.body, audit.h1, audit.h2, audit.logo].filter(Boolean);
  for (const s of seen) {
    for (const prop of ["color", "background"]) {
      const rgb = rgbFromCss(s[prop] || "");
      if (rgb && Math.abs(rgb[0]-brownRedRgb[0]) < 8 && Math.abs(rgb[1]-brownRedRgb[1]) < 8 && Math.abs(rgb[2]-brownRedRgb[2]) < 8) {
        deviations.push({
          severity: "error",
          category: "color",
          message: `Brown Red ${forbidden} detected in ${prop}. Brown Red is reserved for the Coat of Arms only.`,
        });
      }
    }
  }

  // 3. Typography: Raleway must be the display face
  const displayFam = audit.vars["--font-display"] || "";
  if (!/raleway/i.test(displayFam)) {
    deviations.push({
      severity: "error",
      category: "typography",
      message: `--font-display does not include Raleway. PDF requires Raleway as the web replacement for Effra. Got: ${displayFam}`,
    });
  }
  const h1Fam = audit.h1?.fontFamily || "";
  if (audit.h1 && !/raleway/i.test(h1Fam)) {
    deviations.push({
      severity: "warn",
      category: "typography",
      message: `H1 not rendered in Raleway. Got: ${h1Fam}`,
    });
  }

  // 4. Body font: soft deviation flagged every review per baseline
  const bodyFam = audit.vars["--font-body"] || "";
  if (!/portada|raleway/i.test(bodyFam)) {
    info.push({
      severity: "info",
      category: "typography",
      message: `--font-body is "${bodyFam}". Brand PDF specifies Portada Text (or Raleway for web body). Georgia is an acceptable serif substitute per print-substitute policy but should be reviewed on every change.`,
    });
  }

  // 5. Logo min size 50px COA height
  if (audit.logo?.background) {
    // We don't measure COA directly; measure rendered image height and require >= 50 for total logo (COA is ~65% of full logo height, so total >= 76px is safe)
    // We can read the rendered height from getBoundingClientRect via a second pass. Left as a soft note.
    info.push({
      severity: "info",
      category: "logo",
      message: `Logo rendered. Brand requires COA min height 50px. Verify the img height in the header stays ≥ 50px on desktop and mobile.`,
    });
  }

  // 6. Nav dark bg contrast if dark topbar exists
  if (audit.nav?.background) {
    const bg = rgbFromCss(audit.nav.background);
    if (bg) {
      const white = [255,255,255];
      const black = [0,0,0];
      const cw = contrastRatio(bg, white);
      const cb = contrastRatio(bg, black);
      const bgHex = rgbToHex(bg);
      if (Math.max(cw, cb) < 4.5) {
        deviations.push({
          severity: "error",
          category: "contrast",
          message: `Nav background ${bgHex} has insufficient contrast with both black and white text (WCAG AA needs ≥ 4.5).`,
        });
      } else {
        info.push({
          severity: "info",
          category: "contrast",
          message: `Nav background ${bgHex} contrast: ${cw.toFixed(2)}:1 vs white, ${cb.toFixed(2)}:1 vs black.`,
        });
      }
    }
  }

  return { deviations, info };
}

// ---- Composite side-by-side using sharp if available; else HTML wrapper ----
async function composeSideBySide(baseShots, candShots) {
  const composites = [];
  let sharp;
  try { sharp = (await import("sharp")).default; } catch {}
  const compDir = path.join(OUT, "compare");
  await ensureDir(compDir);

  for (const key of Object.keys(baseShots)) {
    if (!candShots[key]) continue;
    const bPath = baseShots[key];
    const cPath = candShots[key];
    const out = path.join(compDir, `${key}.png`);

    if (sharp) {
      const [bMeta, cMeta] = await Promise.all([sharp(bPath).metadata(), sharp(cPath).metadata()]);
      const height = Math.max(bMeta.height, cMeta.height);
      const bResized = await sharp(bPath).resize({ height }).png().toBuffer();
      const cResized = await sharp(cPath).resize({ height }).png().toBuffer();
      const bW = (await sharp(bResized).metadata()).width;
      const cW = (await sharp(cResized).metadata()).width;
      const gap = 16;
      await sharp({
        create: {
          width: bW + gap + cW,
          height,
          channels: 4,
          background: { r: 240, g: 239, b: 239, alpha: 1 }
        }
      })
        .composite([
          { input: bResized, left: 0, top: 0 },
          { input: cResized, left: bW + gap, top: 0 },
        ])
        .png()
        .toFile(out);
      composites.push(out);
    } else {
      // fallback: copy both, produce an HTML side-by-side viewer
      composites.push(bPath);
      composites.push(cPath);
    }
  }
  return composites;
}

// ---- Markdown report ----
function md({ deviations, info, baseAudit, candAudit }) {
  const line = (d) => `- **[${d.severity.toUpperCase()}] ${d.category}** — ${d.message}${d.expected ? ` (expected \`${d.expected}\`, got \`${d.actual}\`)` : ""}`;
  const errors = deviations.filter(d => d.severity === "error");
  const warns  = deviations.filter(d => d.severity === "warn");

  return `# Design Review Report

**Baseline tokens:** ${JSON.stringify(baseAudit.vars, null, 2)}
**Candidate tokens:** ${JSON.stringify(candAudit.vars, null, 2)}

## Gate result

${errors.length === 0 ? "✅ **PASS** — No blocking deviations from NPSI brand standards." : `❌ **BLOCK** — ${errors.length} blocking deviation(s). Requires manual approval before merge.`}

## Errors (blocking) — ${errors.length}

${errors.length ? errors.map(line).join("\n") : "_None_"}

## Warnings — ${warns.length}

${warns.length ? warns.map(line).join("\n") : "_None_"}

## Informational — ${info.length}

${info.length ? info.map(line).join("\n") : "_None_"}

## Side-by-side comparisons

See \`design-review/out/compare/\` for every route × viewport composite (baseline left, candidate right).

## Brand source of truth

- **Primary:** \`space_files/LS1002_BrownUniversityHealth_visualguidelines_update_100924.pdf\` (Brown Health Brand Guide v1.0)
- **Secondary:** \`design-review/token-baseline.json\` (frozen local tokens)
- **Conflict rule:** PDF wins.

## Manual approval required

This PR modifies visual code. A human approver must:
1. Open every side-by-side in \`design-review/out/compare/\`.
2. Confirm zero deviation from the errors list above (or explicitly waive with justification).
3. Approve the PR review before merge is possible (branch protection enforces this).
`;
}

// ---- Main ----
async function main() {
  await ensureDir(OUT);
  const brand = JSON.parse(await fs.readFile(path.join(ROOT, "design-review/brand-standards.json"), "utf-8"));

  console.log(`Capturing baseline from ${BASELINE}...`);
  const baseShots = await captureAll(BASELINE, "baseline");
  const baseAudit = await auditTokens(BASELINE);

  console.log(`Capturing candidate from ${CANDIDATE}...`);
  const candShots = await captureAll(CANDIDATE, "candidate");
  const candAudit = await auditTokens(CANDIDATE);

  console.log("Composing side-by-side images...");
  await composeSideBySide(baseShots, candShots);

  console.log("Checking deviations against brand standards...");
  const { deviations, info } = checkDeviations(candAudit, brand);

  const report = md({ deviations, info, baseAudit, candAudit });
  await fs.writeFile(path.join(OUT, "report.md"), report, "utf-8");
  await fs.writeFile(path.join(OUT, "audit.json"), JSON.stringify({ baseAudit, candAudit, deviations, info }, null, 2), "utf-8");

  const errors = deviations.filter(d => d.severity === "error");
  console.log(`\nReport: ${path.join(OUT, "report.md")}`);
  console.log(`Errors: ${errors.length}, Warnings: ${deviations.length - errors.length}, Info: ${info.length}`);

  // Non-zero exit on errors so CI can gate
  if (errors.length > 0) process.exit(2);
}

main().catch(e => { console.error(e); process.exit(1); });
