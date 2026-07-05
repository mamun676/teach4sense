var MODEL = "gemini-2.5-flash"; // na chale to gemini-flash-latest
var TQ = '"""';
var LS_KEY="t4s_key", LS_THEME="t4s_theme", LS_HIST="t4s_hist";
var lastTopic = "";

var STUDENTS = [
  { name:"Rahul", tag:"Slow learner", color:"#ef4444", profile:"- Speed: SLOW\n- Prior knowledge: WEAK\n- Hindi best; heavy English/technical words me atakta hai\n- step-by-step + real examples chahiye; abstract me kho jaata hai; dikhawa nahi karta." },
  { name:"Aisha", tag:"Fast learner", color:"#22c55e", profile:"- Speed: FAST\n- Prior knowledge: STRONG\n- concept jaldi pakadti; deep how/why sawaal; definition se santusht nahi, andar ka logic chahti." },
  { name:"Arjun", tag:"Exam-oriented", color:"#3b82f6", profile:"- Speed: MEDIUM\n- exam-focus; formulas/exact definitions yaad; clear definition na mile to confuse; deep why me interest kam." },
  { name:"Meera", tag:"Curious", color:"#a855f7", profile:"- Curiosity VERY HIGH; har cheez pe Why/What-if; assumptions probe karti; bina reason ke santusht nahi." },
  { name:"Kabir", tag:"Weak fundamentals", color:"#f59e0b", profile:"- Prior knowledge VERY WEAK (foundation gaps); concrete examples/analogy chahiye; 'ye to aata hoga' maan lo to kho jaata." }
];

/* ---------- PROMPTS ---------- */
function pStudent(name,profile,topic,lecture){
  return "You are simulating a student named "+name+" attending a class.\n"
  +"Stay fully in character. You are NOT a helpful AI - you are a real student.\n\n"
  +name.toUpperCase()+"'S PROFILE:\n"+profile+"\n\n"
  +"RULES:\n1. Lecture ko SIRF utna samjho jitna teacher ne bola. Bahar ki knowledge mat use karo.\n2. Step skip/mushkil word/fast pace ho to CONFUSED raho.\n3. Honest raho; jhootha perfect summary mat do.\n4. Understanding ko apne PROFILE ke hisaab se realistic rate karo.\n\n"
  +"Return JSON: name, understanding_percent (0-100 number), summary_in_own_words, confused_about (array), question_to_teacher, needed_but_missing.\n\n"
  +"Topic: "+topic+"\nLecture:\n"+TQ+"\n"+lecture+"\n"+TQ;
}
function pEval(topic,lecture,sj){
  return "You are the Teaching Evaluator of Teach4Sense. Judge HOW GOOD THE TEACHING was - not the students.\n"
  +"- CONCEPT CLARITY: understanding avg, weak learners (Rahul,Kabir) heavier weight.\n- TOPICS NOT UNDERSTOOD: 2+ students ne confused_about me likha.\n- ENGAGEMENT: question depth. PACE: fast samjhe par slow atke = too fast.\n- RECOMMENDATIONS specific & simple.\n\n"
  +"Return JSON: overall_teaching_score (0-100), concept_clarity, engagement_score, pace_analysis (string), most_asked_concept (string), topics_not_understood (array), student_wise_feedback (array of {name,note,most_asked}), recommendations (array), one_line_verdict.\n\n"
  +"Topic: "+topic+"\nLecture:\n"+TQ+"\n"+lecture+"\n"+TQ+"\nStudents JSON:\n"+TQ+"\n"+sj+"\n"+TQ;
}
function pCategorize(topic,qs){
  return "Categorize these student questions into 3 levels.\nLevel 1 = Basic Doubts (definitions, terminology).\nLevel 2 = Conceptual (understanding, reasoning, differences, examples).\nLevel 3 = Critical Thinking (application, real-world, what-if, future).\n\n"
  +"Return JSON: level1 (array of {student,question}), level2 (array), level3 (array).\n\nTopic: "+topic+"\nQuestions JSON:\n"+TQ+"\n"+qs+"\n"+TQ;
}
function pAsk(topic,q){
  return "A student asked this question during a lesson on '"+topic+"': \""+q+"\".\n"
  +"Explain the answer to the TEACHER in very simple terms (Hinglish ok) so they can teach it back. 3-5 short sentences + one simple everyday example. Plain text only.";
}

/* ---------- GEMINI ---------- */
function gemini(prompt, json){
  var key = (localStorage.getItem(LS_KEY)||"").trim();
  var url = "https://generativelanguage.googleapis.com/v1beta/models/"+MODEL+":generateContent?key="+encodeURIComponent(key);
  var cfg = { temperature:1 }; if(json!==false){ cfg.responseMimeType="application/json"; }
  return fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:cfg})})
    .then(function(r){ return r.json().then(function(d){
      if(!r.ok) throw new Error((d.error&&d.error.message)||("HTTP "+r.status));
      if(!d.candidates||!d.candidates[0]) throw new Error("No response (maybe blocked).");
      var t=d.candidates[0].content.parts[0].text;
      return json!==false ? JSON.parse(clean(t)) : t;
    });});
}
function clean(t){ t=String(t).trim(); return t.replace(/`{3}json/gi,"").replace(/`{3}/g,"").trim(); }

/* ---------- MAIN ---------- */
function runSimulation(){
  if(!(localStorage.getItem(LS_KEY)||"").trim()){ document.getElementById('keyNotice').classList.remove('hidden'); switchView('settings'); return; }
  var topic=(document.getElementById('topic').value||"").trim()||"General";
  var lecture=document.getElementById('lecture').value.trim();
  var status=document.getElementById('status');
  if(!lecture){ status.innerHTML=e("Lecture likho ya bolo pehle."); return; }
  lastTopic=topic;

  document.getElementById('runBtn').disabled=true;
  status.innerHTML='<span class="text-brand inline-flex items-center gap-2">Students padh rahe hain <span class="think-dots"><span></span><span></span><span></span></span></span>';
  ['reportSection','analysisSection'].forEach(function(id){ document.getElementById(id).classList.add('hidden'); });
  document.getElementById('studentsSection').classList.remove('hidden');
  skeletons();

  var good=[];
  Promise.all(STUDENTS.map(function(s){
    return gemini(pStudent(s.name,s.profile,topic,lecture)).then(function(o){return{ok:1,s:s,o:o};}).catch(function(err){return{ok:0,s:s,e:err.message};});
  })).then(function(res){
    renderStudents(res);
    good=res.filter(function(r){return r.ok;});
    if(!good.length) throw new Error("No responses. Settings me API key / model check karo.");
    status.innerHTML='<span class="text-brand inline-flex items-center gap-2">Report ban rahi hai <span class="think-dots"><span></span><span></span><span></span></span></span>';
    var sj=JSON.stringify(good.map(function(r){return r.o;}),null,2);
    return gemini(pEval(topic,lecture,sj)).then(function(report){
      renderReport(report);
      document.getElementById('reportSection').classList.remove('hidden');
      var qs=JSON.stringify(good.map(function(r){return{student:r.o.name,question:r.o.question_to_teacher};}));
      return gemini(pCategorize(topic,qs)).then(function(levels){
        renderAnalysis(levels);
        document.getElementById('analysisSection').classList.remove('hidden');
        saveHistory(topic,lecture,report,good);
        status.innerHTML='<span class="text-emerald-500">Done.</span>';
      });
    });
  }).catch(function(err){ status.innerHTML=e(err.message); })
    .then(function(){ document.getElementById('runBtn').disabled=false; });
}

function color(p){ return p>=70?"#22c55e":p>=45?"#f59e0b":"#ef4444"; }
function skeletons(){
  var h=""; for(var i=0;i<5;i++){ h+='<div class="glass rounded-2xl p-5"><div class="flex items-center gap-3 mb-4"><div class="skel w-10 h-10 rounded-xl"></div><div class="flex-1"><div class="skel h-3 w-24 mb-2"></div><div class="skel h-2 w-16"></div></div></div><div class="skel h-2 w-full mb-2"></div><div class="skel h-2 w-5/6 mb-2"></div><div class="skel h-2 w-2/3"></div></div>'; }
  document.getElementById('students').innerHTML=h;
}
function renderStudents(res){
  document.getElementById('students').innerHTML=res.map(function(r,i){
    var d='style="animation-delay:'+(i*70)+'ms"';
    if(!r.ok) return '<div class="stu-card glass rounded-2xl p-5 animate-in" '+d+'><div class="font-semibold">'+esc(r.s.name)+'</div><div class="text-sm text-red-500 mt-2">'+esc(r.e)+'</div></div>';
    var o=r.o, p=Number(o.understanding_percent)||0, c=color(p);
    var conf=(o.confused_about||[]).map(function(x){return '<span class="inline-block text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400 mr-1 mb-1">'+esc(x)+'</span>';}).join('');
    return '<div class="stu-card glass rounded-2xl p-5 animate-in" '+d+'>'
      +'<div class="flex items-center gap-3 mb-3"><div class="w-10 h-10 rounded-xl grid place-items-center font-bold text-white" style="background:'+r.s.color+'">'+esc(r.s.name.charAt(0))+'</div>'
      +'<div><div class="font-semibold text-slate-900 dark:text-white leading-tight">'+esc(o.name||r.s.name)+'</div><div class="text-[11px] text-slate-400">'+esc(r.s.tag)+'</div></div>'
      +'<div class="ml-auto text-xl font-extrabold" style="color:'+c+'">'+p+'%</div></div>'
      +'<div class="h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden mb-3"><div class="h-full rounded-full" style="width:'+p+'%;background:'+c+'"></div></div>'
      +'<p class="text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed">'+esc(o.summary_in_own_words||'')+'</p>'
      +(conf?'<div class="mt-3">'+conf+'</div>':'')
      +'<div class="mt-3 pt-3 border-t border-slate-100 dark:border-white/10 text-[12px] text-slate-500 dark:text-slate-400"><b class="text-slate-600 dark:text-slate-300">Q:</b> '+esc(o.question_to_teacher||'')
      +'<br><button class="askbtn" onclick="askAI(this)" data-q="'+attr(o.question_to_teacher||'')+'"><svg class="ic-sm" viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-4 12.7V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.3A7 7 0 0 0 12 2z"/></svg>Ask AI to explain</button></div></div>';
  }).join('');
}
function ring(p){ var c=color(p), r=42, circ=2*Math.PI*r, off=circ-(p/100)*circ;
  return '<svg width="120" height="120" viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="none" stroke="rgba(120,120,140,.15)" stroke-width="9"/><circle cx="50" cy="50" r="42" fill="none" stroke="'+c+'" stroke-width="9" stroke-linecap="round" stroke-dasharray="'+circ+'" stroke-dashoffset="'+off+'" transform="rotate(-90 50 50)"/><text x="50" y="49" text-anchor="middle" font-size="24" font-weight="800" fill="'+c+'">'+p+'</text><text x="50" y="64" text-anchor="middle" font-size="9" fill="#94a3b8">/ 100</text></svg>';
}
function metric(l,v){ return '<div class="glass rounded-xl p-4"><div class="text-[11px] uppercase tracking-wider text-slate-400">'+l+'</div><div class="text-2xl font-bold text-slate-900 dark:text-white mt-1">'+v+'</div></div>'; }
function renderReport(r){
  var o=Number(r.overall_teaching_score)||0;
  var gaps=(r.topics_not_understood||[]).map(function(g){return li(g,'#ef4444');}).join('');
  var recs=(r.recommendations||[]).map(function(g){return li(g,'#22c55e');}).join('');
  var fb=(r.student_wise_feedback||[]).map(function(f){return '<div class="glass rounded-xl p-3"><div class="font-semibold text-sm text-slate-900 dark:text-white">'+esc(f.name)+'</div><div class="text-[12px] text-slate-500 dark:text-slate-400 mt-1">'+esc(f.note)+'</div>'+(f.most_asked?'<div class="text-[11px] mt-2 text-brand">Most asked: '+esc(f.most_asked)+'</div>':'')+'</div>';}).join('');
  document.getElementById('reportSection').innerHTML='<div class="animate-in space-y-5"><h3 class="section-h">Teaching Report</h3>'
    +'<div class="glass rounded-2xl p-6 flex flex-col md:flex-row gap-6 items-center bg-gradient-to-br from-brand/5 to-fuchsia-500/5">'
    +'<div class="text-center shrink-0">'+ring(o)+'<div class="text-[11px] uppercase tracking-wider text-slate-400 mt-1">Overall Score</div></div>'
    +'<div class="flex-1 grid grid-cols-2 gap-3 w-full">'+metric("Concept Clarity",r.concept_clarity||0)+metric("Engagement",r.engagement_score||0)
    +'<div class="glass rounded-xl p-4 col-span-2"><div class="text-[11px] uppercase tracking-wider text-slate-400">Pace</div><div class="text-[13px] mt-1 text-slate-700 dark:text-slate-200">'+esc(String(r.pace_analysis||''))+'</div></div>'
    +(r.most_asked_concept?'<div class="glass rounded-xl p-4 col-span-2"><div class="text-[11px] uppercase tracking-wider text-slate-400">Most Asked Concept</div><div class="text-sm font-semibold mt-1 text-brand">'+esc(r.most_asked_concept)+'</div></div>':'')
    +'</div></div>'
    +'<div class="grid md:grid-cols-2 gap-5"><div class="glass rounded-2xl p-5"><h4 class="font-bold text-slate-900 dark:text-white mb-3">Knowledge Gaps</h4><ul class="space-y-2 text-[13px] text-slate-600 dark:text-slate-300">'+gaps+'</ul></div>'
    +'<div class="glass rounded-2xl p-5"><h4 class="font-bold text-slate-900 dark:text-white mb-3">Recommendations</h4><ul class="space-y-2 text-[13px] text-slate-600 dark:text-slate-300">'+recs+'</ul></div></div>'
    +'<div><h4 class="font-bold text-slate-900 dark:text-white mb-3">Student-wise Feedback</h4><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">'+fb+'</div></div>'
    +'<div class="glass rounded-2xl p-5 border-l-4 border-brand"><div class="text-[11px] uppercase tracking-wider text-slate-400 mb-1">Verdict</div><p class="text-slate-700 dark:text-slate-200">'+esc(r.one_line_verdict||'')+'</p></div></div>';
}
function li(t,c){ return '<li class="flex gap-2"><span style="color:'+c+'" class="mt-1.5">&bull;</span><span>'+esc(t)+'</span></li>'; }

function renderAnalysis(lv){
  var cols=[{k:'level1',t:'Level 1 · Basic',c:'#22c55e'},{k:'level2',t:'Level 2 · Conceptual',c:'#f59e0b'},{k:'level3',t:'Level 3 · Critical',c:'#7c6cff'}];
  document.getElementById('analysis').innerHTML=cols.map(function(col){
    var items=(lv[col.k]||[]).map(function(q){
      return '<div class="qitem"><span class="w-1.5 h-1.5 rounded-full mt-2 shrink-0" style="background:'+col.c+'"></span><div class="text-[13px]"><b class="text-slate-500 dark:text-slate-400">'+esc(q.student||'')+':</b> '+esc(q.question||'')+'<br><button class="askbtn" onclick="askAI(this)" data-q="'+attr(q.question||'')+'"><svg class="ic-sm" viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-4 12.7V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.3A7 7 0 0 0 12 2z"/></svg>Ask AI</button></div></div>';
    }).join('')||'<p class="text-xs text-slate-400">No questions.</p>';
    return '<div class="glass rounded-2xl p-4"><div class="flex items-center gap-2 mb-3"><span class="w-2.5 h-2.5 rounded-full" style="background:'+col.c+'"></span><h4 class="font-bold text-sm text-slate-900 dark:text-white">'+col.t+'</h4></div><div class="space-y-2">'+items+'</div></div>';
  }).join('');
}

/* ---------- ASK AI ---------- */
function askAI(btn){
  var q=btn.getAttribute('data-q');
  document.getElementById('askQuestion').textContent=q;
  document.getElementById('askAnswer').innerHTML='<span class="think-dots"><span></span><span></span><span></span></span>';
  document.getElementById('askModal').classList.remove('hidden');
  gemini(pAsk(lastTopic||"this topic",q),false).then(function(t){
    document.getElementById('askAnswer').innerHTML=esc(t).replace(/\n/g,'<br>');
  }).catch(function(err){ document.getElementById('askAnswer').innerHTML=e(err.message); });
}
function closeAsk(){ document.getElementById('askModal').classList.add('hidden'); }

/* ---------- HISTORY ---------- */
function saveHistory(topic,lecture,report,good){
  var h=hist();
  var avgU=good.length?Math.round(good.reduce(function(a,r){return a+(Number(r.o.understanding_percent)||0);},0)/good.length):0;
  h.unshift({date:new Date().toISOString(),topic:topic,overall:Number(report.overall_teaching_score)||0,avgU:avgU,report:report});
  localStorage.setItem(LS_HIST,JSON.stringify(h.slice(0,50)));
  renderStats(); renderRecent(); renderReports();
}
function hist(){ try{return JSON.parse(localStorage.getItem(LS_HIST))||[];}catch(x){return[];} }
function renderStats(){
  var h=hist(), n=h.length;
  var avg=n?Math.round(h.reduce(function(a,x){return a+x.overall;},0)/n):0;
  var au=n?Math.round(h.reduce(function(a,x){return a+x.avgU;},0)/n):0;
  var best=n?Math.max.apply(null,h.map(function(x){return x.overall;})):0;
  document.getElementById('stats').innerHTML=
    sc("Classes Run",n,"M3 3v18h18M18 17V9M13 17V5M8 17v-3")+sc("Avg Teaching Score",avg,"M22 11.08V12a10 10 0 1 1-5.93-9.14")+sc("Avg Understanding",au+"%","M20 6L9 17l-5-5")+sc("Best Score",best,"M12 2l2.4 7.4H22l-6 4.6 2.3 7.4L12 17l-6.3 4.4L8 14 2 9.4h7.6z");
}
function sc(l,v,p){ return '<div class="glass rounded-2xl p-4 flex items-center gap-3"><span class="grid place-items-center w-10 h-10 rounded-xl bg-brand/10 text-brand"><svg class="ic" viewBox="0 0 24 24"><path d="'+p+'"/></svg></span><div><div class="text-[11px] uppercase tracking-wider text-slate-400">'+l+'</div><div class="text-xl font-bold text-slate-900 dark:text-white">'+v+'</div></div></div>'; }
function renderRecent(){
  var h=hist();
  document.getElementById('recentList').innerHTML=h.length?h.slice(0,8).map(function(x){
    return '<div class="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5"><span class="w-9 h-9 grid place-items-center rounded-lg font-bold text-white text-sm" style="background:'+color(x.overall)+'">'+x.overall+'</span><div class="flex-1 min-w-0"><div class="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">'+esc(x.topic)+'</div><div class="text-[11px] text-slate-400">'+new Date(x.date).toLocaleString()+'</div></div><span class="text-xs text-slate-400">'+x.avgU+'% avg</span></div>';
  }).join(''):'<p class="text-sm text-slate-400">Abhi tak koi class nahi. Simulate karo!</p>';
}
function renderReports(){
  var h=hist();
  document.getElementById('reportsList').innerHTML=h.length?h.map(function(x,i){
    return '<button onclick="openReport('+i+')" class="w-full text-left glass rounded-xl p-4 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-white/5"><span class="w-10 h-10 grid place-items-center rounded-lg font-bold text-white" style="background:'+color(x.overall)+'">'+x.overall+'</span><div class="flex-1"><div class="font-medium text-slate-800 dark:text-slate-200">'+esc(x.topic)+'</div><div class="text-[11px] text-slate-400">'+new Date(x.date).toLocaleString()+'</div></div><svg class="ic text-slate-400" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg></button>';
  }).join(''):'<p class="text-sm text-slate-400">No saved reports yet.</p>';
}
function openReport(i){ var x=hist()[i]; if(!x)return; renderReport(x.report); document.getElementById('reportDetail').innerHTML=document.getElementById('reportSection').innerHTML; document.getElementById('reportSection').classList.add('hidden'); document.getElementById('reportDetail').scrollIntoView({behavior:'smooth'}); }

/* ---------- VOICE ---------- */
function setupVoice(){
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  var btn=document.getElementById('micBtn'), lbl=document.getElementById('micLabel');
  if(!SR){ btn.style.display='none'; return; }
  var rec=new SR(); rec.continuous=true; rec.interimResults=true; rec.lang='en-IN';
  var on=false, base="";
  btn.addEventListener('click',function(){ if(on){rec.stop();return;} base=document.getElementById('lecture').value; rec.start(); });
  rec.onstart=function(){ on=true; btn.classList.add('rec'); lbl.textContent='Listening...'; };
  rec.onend=function(){ on=false; btn.classList.remove('rec'); lbl.textContent='Speak'; };
  rec.onerror=function(){ on=false; btn.classList.remove('rec'); lbl.textContent='Speak'; };
  rec.onresult=function(ev){ var t=""; for(var i=0;i<ev.results.length;i++){ t+=ev.results[i][0].transcript; } document.getElementById('lecture').value=(base?base+" ":"")+t; };
}

/* ---------- UI ---------- */
function e(m){ return '<span class="text-red-500 font-medium">Error: '+esc(m)+'</span>'; }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function attr(s){ return esc(s).replace(/"/g,'&quot;'); }
function switchView(v){
  document.querySelectorAll('#nav .nav-item').forEach(function(b){ b.classList.toggle('active',b.dataset.view===v); });
  ['simulate','dashboard','reports','settings'].forEach(function(x){ document.getElementById('view-'+x).classList.toggle('hidden',x!==v); });
  var t={simulate:"Classroom Simulator",dashboard:"Dashboard",reports:"Reports",settings:"Settings"};
  document.getElementById('viewTitle').textContent=t[v];
  if(v==='dashboard'){ renderStats(); renderRecent(); } if(v==='reports'){ renderReports(); }
}
document.addEventListener('DOMContentLoaded',function(){
  if(localStorage.getItem(LS_THEME)==='light') document.documentElement.classList.remove('dark');
  document.getElementById('themeToggle').addEventListener('click',function(){ document.documentElement.classList.toggle('dark'); localStorage.setItem(LS_THEME,document.documentElement.classList.contains('dark')?'dark':'light'); });
  var k=document.getElementById('apiKey'); k.value=localStorage.getItem(LS_KEY)||"";
  k.addEventListener('input',function(){ localStorage.setItem(LS_KEY,k.value.trim()); document.getElementById('keyNotice').classList.toggle('hidden',!!k.value.trim()); });
  if(!k.value.trim()) document.getElementById('keyNotice').classList.remove('hidden');
  document.getElementById('findKeyToggle').addEventListener('click',function(){ document.getElementById('findKeySteps').classList.toggle('hidden'); });
  document.getElementById('clearBtn').addEventListener('click',function(){ if(confirm('Clear all history?')){ localStorage.removeItem(LS_HIST); renderStats(); renderRecent(); renderReports(); } });
  document.getElementById('runBtn').addEventListener('click',runSimulation);
  document.querySelectorAll('#nav .nav-item').forEach(function(b){ b.addEventListener('click',function(){ switchView(b.dataset.view); }); });
  document.getElementById('askModal').addEventListener('click',function(ev){ if(ev.target===this) closeAsk(); });
  setupVoice(); renderStats(); renderRecent(); renderReports();
});