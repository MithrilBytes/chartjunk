/* chartjunk demo. One nonsense figure, generated client-side. */
import {
  ARTIFACT_NOTES, generateFigure, randomSeed, render, renderSvg, renderTikz,
} from "./chartjunk.esm.js";

const DIALS = ["density", "junk", "confidence", "gobbledygook"];

const figureEl = document.getElementById("figure");
const sourceEl = document.getElementById("source-pane");
const sinsPanel = document.getElementById("sins-panel");
const sinsList = document.getElementById("sins-list");
const sinsCount = document.getElementById("sins-count");
let fig = null;
let seedText = "";

function coerceSeed(raw) {
  return /^-?\d+$/.test(raw) ? Number(raw) : raw;
}

function dialValue(name) {
  return Number(document.getElementById(name).value);
}

function selection(name) {
  return document.getElementById(name).value;
}

function checked(name) {
  return document.getElementById(name).checked;
}

function generate() {
  const opts = { seed: coerceSeed(seedText) };
  const params = new URLSearchParams();
  params.set("seed", seedText);
  for (const name of DIALS) {
    opts[name] = dialValue(name);
    if (opts[name] !== 0.5) params.set(name, String(opts[name]));
  }
  opts.kind = selection("kind");
  if (opts.kind !== "figure") params.set("kind", opts.kind);
  opts.style = selection("style");
  if (opts.style !== "matplotlib") params.set("style", opts.style);
  opts.mono = checked("mono");
  if (opts.mono) params.set("mono", "1");
  opts.orphan = checked("orphan");
  if (!opts.orphan) params.set("orphan", "0");

  fig = generateFigure(opts);
  figureEl.innerHTML = renderSvg(fig);
  renderSource();
  renderSins();
  history.replaceState(null, "", `${location.pathname}?${params}`);
}

function renderSource() {
  if (!fig || !sourceEl.closest("details").open) return;
  sourceEl.textContent = render(fig, selection("format"));
}

function renderSins() {
  const on = checked("sins");
  sinsPanel.hidden = !on;
  figureEl.classList.toggle("annotated", on);
  if (!on || !fig) return;
  sinsCount.textContent = `(${fig.artifacts.length})`;
  sinsList.innerHTML = "";
  for (const id of fig.artifacts) {
    const li = document.createElement("li");
    const code = document.createElement("code");
    code.textContent = id;
    li.appendChild(code);
    li.appendChild(document.createTextNode(" " + (ARTIFACT_NOTES[id] ?? "")));
    sinsList.appendChild(li);
  }
}

const seedEl = document.getElementById("seed");

document.getElementById("randomize").addEventListener("click", () => {
  seedText = randomSeed();
  seedEl.value = seedText;
  generate();
});

let seedTimer;
seedEl.addEventListener("input", () => {
  clearTimeout(seedTimer);
  seedTimer = setTimeout(() => {
    const raw = seedEl.value.trim();
    if (raw !== "") {
      seedText = raw;
      generate();
    }
  }, 250);
});

for (const name of DIALS) {
  const el = document.getElementById(name);
  el.addEventListener("input", () => {
    document.querySelector(`[data-value="${name}"]`).textContent = dialValue(name).toFixed(2);
    generate();
  });
}

for (const name of ["kind", "style", "mono", "orphan"]) {
  document.getElementById(name).addEventListener("change", generate);
}
document.getElementById("format").addEventListener("change", renderSource);
document.querySelector("details.source").addEventListener("toggle", renderSource);
document.getElementById("sins").addEventListener("change", renderSins);

document.getElementById("download").addEventListener("click", () => {
  if (!fig) return;
  const blob = new Blob([renderSvg(fig)], { type: "image/svg+xml" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `chartjunk-${seedText || fig.seed}.svg`;
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById("copy-tikz").addEventListener("click", async (ev) => {
  if (!fig) return;
  await navigator.clipboard.writeText(renderTikz(fig));
  const btn = ev.currentTarget;
  const old = btn.textContent;
  btn.textContent = "copied";
  setTimeout(() => { btn.textContent = old; }, 900);
});

/* Restore state from the URL, then draw. */
const params = new URLSearchParams(location.search);
seedText = params.get("seed") || randomSeed();
seedEl.value = seedText;
for (const name of DIALS) {
  const v = params.get(name);
  if (v !== null && !Number.isNaN(Number(v))) {
    document.getElementById(name).value = v;
    document.querySelector(`[data-value="${name}"]`).textContent = Number(v).toFixed(2);
  }
}
if (params.get("kind")) document.getElementById("kind").value = params.get("kind");
if (params.get("style")) document.getElementById("style").value = params.get("style");
if (params.get("mono") === "1") document.getElementById("mono").checked = true;
if (params.get("orphan") === "0") document.getElementById("orphan").checked = false;
generate();
