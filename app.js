/* ============ CONFIG ============ */
const MODEL = "gemini-2.5-flash"; // if quota error appears, change to "gemini-flash-latest"
const K_KEY = "t4s_key", K_THEME = "t4s_theme", K_HIST = "t4s_hist";
const COLORS = { Rahul:"#ef4444", Aisha:"#22c55e", Arjun:"#3b82f6", Meera:"#a855f7", Kabir:"#f59e0b" };

let currentTopic = "";
let lastRun = null;

/* ============ HELPERS ============ */
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const esc = (s = "") => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const getKey = () => localStorage.getItem(K_KEY) || "";
const clean = (t) => t.replace(/```json/gi,"").replace(/```/g,"").trim();
const mdLite = (t) => esc(t).replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\n\s*[-*]\s+/g,"<br>• ").replace(/\n/g,"<br>");
const thinkDots = () => `<span class="dots"><span></span><span></span><span></span><span></span></span>`;

function toast(msg){
  const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.add("hidden"), 3200);
}

/* ============ GEMINI ============ */
async function gemini(prompt, wantJson){
  const key = getKey();
  if(!key) throw new Error("No API key found. Add your Gemini key in Settings.");
  const body = { contents:[{ parts:[{ text: prompt }] }] };
  if(wantJson) body.generationConfig = { responseMimeType:"application/json" };
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent?key=" + key;
  const res = await fetch(url, {
    method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body),
  });
  const data = await res.json();
  if(!res.ok) throw new Error(data?.error?.message || "Gemini error");
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if(!wantJson) return text;
  try { return JSON.parse(clean(text)); }
  catch(e){ throw new Error("AI's reply was not valid JSON. Please try again."); }
}

/* ============ PROMPTS ============ */
const studentPrompt = (topic, lecture) => `
You are simulating 5 real students in a classroom. Judge how well each ACTUALLY understood the lecture below. Be honest — a bad/short lecture should give LOW understanding.

Topic: ${topic || "(not specified)"}
Lecture:
"""${lecture}"""

The 5 students (fixed personalities):
1. Rahul — slow learner, weak basics, prefers Hindi, confuses easily.
2. Aisha — fast & strong, grasps quickly, asks advanced questions.
3. Arjun — exam-focused, wants formulas/definitions/steps.
4. Meera — very curious, asks "why" & "what-if".
5. Kabir — weak fundamentals, needs real-life examples.

For each student give an object:
{ "name", "understanding_percent" (0-100), "summary_in_own_words", "confused_about" (array), "question_to_teacher", "needed_but_missing" }
Return ONLY JSON: { "students": [ 5 objects ] }`;

const evalPrompt = (topic, lecture, students) => `
You are an expert teaching-quality evaluator (Decision Intelligence for teachers).
Topic: ${topic}
Lecture: """${lecture}"""
How 5 students understood it: ${JSON.stringify(students)}

Return ONLY JSON:
{
 "overall_teaching_score":0-100,
 "concept_clarity":0-100,
 "engagement_score":0-100,
 "pace_analysis":"one line",
 "most_asked_concept":"the concept students struggled with most",
 "topics_not_understood":[...],
 "student_wise_feedback":[{"name","note","most_asked"}],
 "recommendations":[3 short actionable tips],
 "one_line_verdict":"..."
}`;

const catPrompt = (topic, students) => `
Take ALL questions the students asked (question_to_teacher + confused_about) about "${topic}" and group them into 3 levels:
Level 1 = Basic / factual, Level 2 = Conceptual, Level 3 = Critical / deep thinking.
Students: ${JSON.stringify(students)}
Return ONLY JSON: { "level1":[{"student","question"}], "level2":[...], "level3":[...] }`;

const answerPrompt = (topic, q) => `A student asked this during a lesson on "${topic}". Give a clear, simple answer (4-6 lines) the teacher can read aloud to explain it well. Use an easy example. Question: ${q}`;
const askPrompt = (topic, q) => `You are a friendly teaching assistant. Explain simply (with an easy example) so a teacher can understand and then teach it confidently. Topic context: ${topic || "general"}. Question: ${q}`;

/* ============ SIMULATION ============ */
async function runSimulation(){
  const topic = $("#topic").value.trim();
  const lecture = $("#lecture").value.trim();
  if(!getKey()){ switchView("settings"); toast("Add your Gemini key first"); return; }
  if(!lecture){ toast("Write or speak your lecture first"); return; }
  currentTopic = topic;
  showLoading(true);
  $("#results").classList.add("hidden");
  // scroll down so the teacher sees the students "reading"
  $("#loading").scrollIntoView({ behavior:"smooth", block:"start" });
  try {
    const s = await gemini(studentPrompt(topic, lecture), true);
    const students = s.students || [];
    const [report, cats] = await Promise.all([
      gemini(evalPrompt(topic, lecture, students), true),
      gemini(catPrompt(topic, students), true),
    ]);
    lastRun = { topic, students, report, cats, date: Date.now() };
    saveHistory(lastRun);
    renderResults(lastRun);
    showLoading(false);
    $("#results").classList.remove("hidden");
    $("#results").scrollIntoView({ behavior:"smooth" });
  } catch(e){
    showLoading(false);
    toast("⚠️ " + e.message);
  }
}

function showLoading(on){
  const l = $("#loading");
  if(!on){ l.classList.add("hidden"); l.innerHTML = ""; return; }
  l.classList.remove("hidden");
  l.innerHTML = `
    <div class="flex items-center gap-2 mb-4 text-slate-500">
      <span class="dots"><span></span><span></span><span></span><span></span></span>
      <span>AI students are reading your lecture...</span>
    </div>
    <div class="card p-6 space-y-3 mb-4"><div class="sk h-6 w-1/3"></div><div class="sk h-4 w-full"></div><div class="sk h-4 w-5/6"></div></div>
    <div class="grid md:grid-cols-2 gap-4">
      ${Array(4).fill(`<div class="card p-5 space-y-3"><div class="sk h-5 w-1/2"></div><div class="sk h-3 w-full"></div><div class="sk h-3 w-4/5"></div><div class="sk h-3 w-3/5"></div></div>`).join("")}
    </div>`;
}

/* ============ RENDER RESULTS ============ */
function ring(p, label){
  p = Math.max(0, Math.min(100, Math.round(p || 0)));
  const r = 52, c = 2*Math.PI*r, off = c - (p/100)*c;
  const color = p>=75 ? "#22c55e" : p>=50 ? "#f59e0b" : "#ef4444";
  return `<svg width="130" height="130" viewBox="0 0 140 140">
    <circle cx="70" cy="70" r="${r}" fill="none" stroke="currentColor" class="text-slate-200 dark:text-slate-700" stroke-width="12"/>
    <circle cx="70" cy="70" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 70 70)"/>
    <text x="70" y="68" text-anchor="middle" font-size="30" font-weight="800" fill="currentColor">${p}</text>
    <text x="70" y="90" text-anchor="middle" font-size="11" fill="currentColor" opacity="0.55">${label||"/ 100"}</text>
  </svg>`;
}

function renderResults(run){ $("#results").innerHTML = resultsHTML(run); }

function resultsHTML(run){
  const { topic, students, report, cats } = run;
  const fbMap = {};
  (report.student_wise_feedback || []).forEach(f => fbMap[f.name] = f);

  const overview = `
    <div class="card p-6 flex flex-col md:flex-row items-center gap-6 fade-in">
      <div class="shrink-0 text-indigo-500">${ring(report.overall_teaching_score, "Teaching")}</div>
      <div class="flex-1">
        <p class="text-xs uppercase tracking-wide text-slate-400 mb-1">Verdict${topic ? " · " + esc(topic) : ""}</p>
        <p class="text-lg font-bold mb-3">${esc(report.one_line_verdict || "")}</p>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div><p class="text-slate-400">Concept Clarity</p><p class="font-bold">${report.concept_clarity ?? "–"}/100</p></div>
          <div><p class="text-slate-400">Engagement</p><p class="font-bold">${report.engagement_score ?? "–"}/100</p></div>
          <div class="col-span-2"><p class="text-slate-400">Pace</p><p class="font-medium">${esc(report.pace_analysis || "–")}</p></div>
          <div class="col-span-2"><p class="text-slate-400">Most asked / hardest concept</p><p class="font-medium">${esc(report.most_asked_concept || "–")}</p></div>
        </div>
      </div>
    </div>`;

  const recs = `
    <div class="card p-6 fade-in">
      <h3 class="font-bold mb-3 flex items-center gap-2">💡 Recommendations</h3>
      <ul class="space-y-2 text-sm">${(report.recommendations||[]).map(r=>`<li class="flex gap-2"><span class="text-indigo-500">▹</span><span>${esc(r)}</span></li>`).join("")}</ul>
      ${report.topics_not_understood?.length ? `<p class="mt-4 text-sm"><span class="text-slate-400">Not understood:</span> ${report.topics_not_understood.map(t=>`<span class="soon">${esc(t)}</span>`).join(" ")}</p>` : ""}
    </div>`;

  const cards = `
    <div>
      <h2 class="font-bold text-lg mb-3">👥 Student-wise Feedback</h2>
      <div class="grid md:grid-cols-2 gap-4">
      ${students.map(st => {
        const color = COLORS[st.name] || "#6366f1";
        const fb = fbMap[st.name] || {};
        const p = Math.max(0, Math.min(100, Math.round(st.understanding_percent||0)));
        return `<div class="card p-5 fade-in">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 rounded-full grid place-items-center text-white font-bold" style="background:${color}">${esc(st.name[0])}</div>
            <div class="flex-1">
              <p class="font-bold">${esc(st.name)}</p>
              <div class="h-2 rounded-full bg-slate-200 dark:bg-slate-700 mt-1 overflow-hidden"><div style="width:${p}%;background:${color}" class="h-full"></div></div>
            </div>
            <span class="font-extrabold" style="color:${color}">${p}%</span>
          </div>
          <p class="text-sm mb-2"><span class="text-slate-400">Understood:</span> ${esc(st.summary_in_own_words||"")}</p>
          ${st.question_to_teacher ? `<p class="text-sm mb-2"><span class="text-slate-400">Question:</span> ${esc(st.question_to_teacher)}</p>` : ""}
          ${fb.most_asked ? `<p class="text-sm mb-2"><span class="text-slate-400">Most asked:</span> ${esc(fb.most_asked)}</p>` : ""}
          ${st.needed_but_missing ? `<p class="text-sm text-amber-600 dark:text-amber-400">Missing: ${esc(st.needed_but_missing)}</p>` : ""}
        </div>`;
      }).join("")}
      </div>
    </div>`;

  return overview + recs + cards + analysisHTML(cats);
}

/* ============ QUESTION ANALYSIS (3 levels) ============ */
let qCounter = 0;
function analysisHTML(cats){
  const block = (title, cls, arr) => {
    if(!arr || !arr.length) return "";
    return `<div class="mb-5">
      <div class="flex items-center gap-2 mb-2"><span class="lvl ${cls}">${title}</span><span class="text-xs text-slate-400">${arr.length} questions</span></div>
      <div class="space-y-2">${arr.map(item => qItem(item)).join("")}</div>
    </div>`;
  };
  return `<div class="card p-6 fade-in">
    <h2 class="font-bold text-lg mb-1">🎯 All Student Questions — 3 Levels</h2>
    <p class="text-sm text-slate-400 mb-4">Answer each question, or learn it from AI.</p>
    ${block("LEVEL 1 · Basic","lvl1",cats.level1)}
    ${block("LEVEL 2 · Conceptual","lvl2",cats.level2)}
    ${block("LEVEL 3 · Critical","lvl3",cats.level3)}
  </div>`;
}
function qItem(item){
  const id = "ans-" + (qCounter++);
  const q = item.question || "";
  const enc = encodeURIComponent(q);
  return `<div class="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
    <p class="text-sm mb-2">${esc(q)} ${item.student ? `<span class="text-xs text-slate-400">— ${esc(item.student)}</span>` : ""}</p>
    <div class="flex gap-2">
      <button data-answer data-q="${enc}" data-target="${id}" class="btn-ghost !py-1.5 !px-3 text-xs">Answer</button>
      <button data-askthis data-q="${enc}" class="btn-ghost !py-1.5 !px-3 text-xs">Ask AI</button>
    </div>
    <div id="${id}" class="hidden mt-2 text-sm bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3"></div>
  </div>`;
}
async function answerQuestion(btn){
  const q = decodeURIComponent(btn.dataset.q);
  const target = document.getElementById(btn.dataset.target);
  target.classList.remove("hidden");
  target.innerHTML = thinkDots();
  try { target.innerHTML = mdLite(await gemini(answerPrompt(currentTopic, q), false)); }
  catch(e){ target.innerHTML = "⚠️ " + e.message; }
}

/* ============ ASK AI MODAL ============ */
function openAsk(prefill){
  $("#askModal").classList.remove("hidden");
  if(prefill) $("#askInput").value = decodeURIComponent(prefill);
  $("#askAnswer").innerHTML = "";
  $("#askInput").focus();
}
function closeAsk(){ $("#askModal").classList.add("hidden"); }
async function runAsk(){
  const q = $("#askInput").value.trim();
  if(!q){ toast("Write a question first"); return; }
  $("#askAnswer").innerHTML = thinkDots();
  try { $("#askAnswer").innerHTML = mdLite(await gemini(askPrompt(currentTopic, q), false)); }
  catch(e){ $("#askAnswer").innerHTML = "⚠️ " + e.message; }
}

/* ============ HISTORY / DASHBOARD / REPORTS ============ */
function hist(){ try { return JSON.parse(localStorage.getItem(K_HIST) || "[]"); } catch { return []; } }
function saveHistory(run){
  const h = hist(); h.unshift(run);
  localStorage.setItem(K_HIST, JSON.stringify(h.slice(0, 50)));
}
function avg(arr){ return arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0; }

function renderDashboard(){
  const h = hist();
  const scores = h.map(r => r.report?.overall_teaching_score || 0);
  const unds = h.flatMap(r => (r.students||[]).map(s => s.understanding_percent || 0));
  $("#statClasses").textContent = h.length;
  $("#statAvg").textContent = h.length ? avg(scores) : "–";
  $("#statUnd").textContent = unds.length ? avg(unds) + "%" : "–";
  $("#statBest").textContent = h.length ? Math.max(...scores) : "–";
  $("#recentList").innerHTML = h.length
    ? h.slice(0,6).map((r,i)=>recentCard(r,i)).join("")
    : `<p class="text-slate-400 text-sm">No classes yet. Start from Simulate.</p>`;
}
function recentCard(r, i){
  const sc = r.report?.overall_teaching_score || 0;
  const color = sc>=75?"#22c55e":sc>=50?"#f59e0b":"#ef4444";
  return `<button data-openreport="${i}" class="card p-4 w-full flex items-center gap-4 text-left hover:shadow-md transition">
    <div class="w-11 h-11 rounded-full grid place-items-center font-bold text-white" style="background:${color}">${sc}</div>
    <div class="flex-1">
      <p class="font-semibold">${esc(r.topic || "Untitled class")}</p>
      <p class="text-xs text-slate-400">${new Date(r.date).toLocaleString()}</p>
    </div>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-slate-400"><path d="m9 18 6-6-6-6"/></svg>
  </button>`;
}
function renderReports(){
  const h = hist();
  $("#reportDetail").classList.add("hidden");
  $("#reportsList").classList.remove("hidden");
  $("#reportsList").innerHTML = h.length
    ? h.map((r,i)=>recentCard(r,i)).join("")
    : `<p class="text-slate-400 text-sm">No reports yet.</p>`;
}
function openReport(i){
  const r = hist()[i]; if(!r) return;
  currentTopic = r.topic || "";
  $("#reportsList").classList.add("hidden");
  const d = $("#reportDetail");
  d.classList.remove("hidden");
  d.innerHTML = `<button id="backReports" class="btn-ghost !py-1.5 !px-3 text-xs mb-2">← Back</button>` + resultsHTML(r);
  $("#backReports").addEventListener("click", renderReports);
  d.scrollIntoView({ behavior:"smooth" });
}

/* ============ VOICE (speech-to-text) ============ */
let recog = null, recording = false;
function setupVoice(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){ $("#micBtn").style.display = "none"; return; }
  recog = new SR();
  recog.lang = "en-IN"; recog.continuous = true; recog.interimResults = false;
  recog.onresult = (e) => {
    let txt = "";
    for(let i=e.resultIndex; i<e.results.length; i++) txt += e.results[i][0].transcript + " ";
    const ta = $("#lecture");
    ta.value = (ta.value + " " + txt).trim();
  };
  recog.onend = () => { recording = false; $("#micBtn").classList.remove("rec"); $("#micLabel").textContent = "Voice"; };
  recog.onerror = () => toast("Voice error — allow the mic and use Live Server");
}
function toggleVoice(){
  if(!recog) return;
  if(recording){ recog.stop(); return; }
  try { recog.start(); recording = true; $("#micBtn").classList.add("rec"); $("#micLabel").textContent = "Rec..."; }
  catch(e){ /* ignore double start */ }
}

/* ============ NAV / THEME ============ */
const TITLES = {
  simulate:["Simulate a Class","Paste your lecture — 5 AI students will learn from it and give you real feedback."],
  dashboard:["Dashboard","An overview of your teaching."],
  reports:["Reports","Detailed reports of all your past classes."],
  settings:["Settings","API key, database and more."],
};
function switchView(v){
  $$("[id^='view-']").forEach(s => s.classList.add("hidden"));
  $("#view-" + v).classList.remove("hidden");
  $$(".nav-btn[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  $("#pageTitle").textContent = TITLES[v][0];
  $("#pageSub").textContent = TITLES[v][1];
  if(v === "dashboard") renderDashboard();
  if(v === "reports") renderReports();
  window.scrollTo({ top:0, behavior:"smooth" });
}
function applyTheme(t){ document.documentElement.classList.toggle("dark", t === "dark"); }

/* ============ INIT ============ */
document.addEventListener("DOMContentLoaded", () => {
  applyTheme(localStorage.getItem(K_THEME) || "light");
  setupVoice();

  if(!getKey()) $("#keyNotice").classList.remove("hidden");
  $("#keyInput").value = getKey();

  $$("[data-view]").forEach(b => b.addEventListener("click", () => switchView(b.dataset.view)));
  $("#themeToggle").addEventListener("click", () => {
    const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
    localStorage.setItem(K_THEME, next); applyTheme(next);
  });
  $("#runBtn").addEventListener("click", runSimulation);
  $("#micBtn").addEventListener("click", toggleVoice);
  $("#askOpenBtn").addEventListener("click", () => openAsk());
  $("#askClose").addEventListener("click", closeAsk);
  $("#askBtn").addEventListener("click", runAsk);
  $("#askModal").addEventListener("click", (e) => { if(e.target.id === "askModal") closeAsk(); });
  $("#saveKey").addEventListener("click", () => {
    const v = $("#keyInput").value.trim();
    if(!v){ toast("Key is empty"); return; }
    localStorage.setItem(K_KEY, v);
    $("#keyNotice").classList.add("hidden");
    $("#keyStatus").textContent = "✅ Key saved! Now go to Simulate.";
    toast("Key saved ✅");
  });
  $("#clearHist").addEventListener("click", () => {
    if(confirm("Delete all history?")){ localStorage.removeItem(K_HIST); renderDashboard(); renderReports(); toast("History cleared"); }
  });

  document.addEventListener("click", (e) => {
    const ans = e.target.closest("[data-answer]");
    if(ans){ answerQuestion(ans); return; }
    const askThis = e.target.closest("[data-askthis]");
    if(askThis){ openAsk(askThis.dataset.q); return; }
    const openR = e.target.closest("[data-openreport]");
    if(openR){ openReport(Number(openR.dataset.openreport)); return; }
  });

  switchView("simulate");
});
