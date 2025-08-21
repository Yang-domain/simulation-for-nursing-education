const API_BASE = "https://simulation-for-nursing-education.onrender.com";
const api = (p) => `${API_BASE}${p}`;

// ===== 전역 상태 =====
let currentScenario = null;
let history = []; // [{ who: "학생"|"환자"|"시스템", text: "..." }]
let student = { id: "", name: "" };
let latestReport = null; // ← 디브리핑 결과 저장해서 함께 저장 전송

// ===== API 베이스 (Render 서버 주소 고정) =====
// 👇 Render에 배포된 server.js 주소로 교체 완료

// ===== 공용 DOM =====
const roleSec     = document.getElementById("role");
const secScenario = document.getElementById("scenario");
const secChat     = document.getElementById("chat");
const secDebrief  = document.getElementById("debrief");
const secAdmin    = document.getElementById("admin");

const scenarioBtn  = document.getElementById("generate-scenario");
const scenarioView = document.getElementById("scenario-display");

const chatBox   = document.getElementById("chat-box");
const chatInput = document.getElementById("chat-input");
const sendBtn   = document.getElementById("send-message");

const saveBtn      = document.getElementById("save-session");
const debriefBtn   = document.getElementById("run-debrief");
const debriefView  = document.getElementById("debrief-result");

// 역할 선택 / 관리자
const studentIdInput   = document.getElementById("student-id");
const studentNameInput = document.getElementById("student-name");
const enterStudentBtn  = document.getElementById("enter-student");

const adminPassInput   = document.getElementById("admin-pass");
const enterAdminBtn    = document.getElementById("enter-admin");
const adminPassVerify  = document.getElementById("admin-pass-verify");
const loadLogsBtn      = document.getElementById("load-logs");
const logList          = document.getElementById("log-list");
const logView          = document.getElementById("log-view");

// ===== 유틸 =====
function showSections(ids = []) {
  const all = ["role", "scenario", "chat", "debrief", "admin"];
  all.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (ids.includes(id)) el.removeAttribute("hidden");
    else el.setAttribute("hidden", "");
  });
}

function appendChat(who, text) {
  history.push({ who, text });
  const row = document.createElement("div");
  row.className = "chat-row " + (who === "학생" ? "me" : who === "환자" ? "pt" : who === "시스템" ? "system" : "");
  row.innerHTML = `<strong>${who}:</strong> ${text}`;
  chatBox.appendChild(row);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function setScenarioView(s) {
  scenarioView.innerHTML = `
    <div class="scenario-box">
      <p><strong>제목:</strong> ${s.title}</p>
      <p>${String(s.text || "").replace(/\n/g, "<br>")}</p>
      <p><strong>학습목표:</strong> ${s.goal}</p>
    </div>
  `;
}

// ===== 범주형 Kalamazoo 렌더러 =====
function renderDebriefKalamazoo(report) {
  const r = report || {};
  const totals = r.totals || {};
  const byCat = totals.byCategory || { "Done well":0, "Needs improvements":0, "Not done":0, "Not applicable":0 };
  const items = Array.isArray(r.items) ? r.items : [];
  const CAT_LIST = ["Done well", "Needs improvements", "Not done", "Not applicable"];
  const CODE_OF = { "Done well":1, "Needs improvements":2, "Not done":3, "Not applicable":4 };

  const boxScore = `
    <div class="card-section">
      <h3 class="kz-title">평가 점수</h3>
      <table class="kz-score-table">
        <tbody>
          ${CAT_LIST.map(c => `<tr><td>${c}</td><td class="t-right">${byCat[c] ?? 0}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;

  const totalItems = items.length;
  const effective = totalItems - (byCat["Not applicable"] || 0);
  const boxTotals = `
    <div class="card-section">
      <h3 class="kz-title">총점</h3>
      <table class="kz-score-table">
        <tbody>
          <tr><td>전체 문항 수</td><td class="t-right">${totalItems}</td></tr>
          <tr><td>평가 적용 문항 수 (NA 제외)</td><td class="t-right">${effective}</td></tr>
          <tr><td>Done well 개수</td><td class="t-right">${byCat["Done well"] || 0}</td></tr>
          <tr><td>Needs improvements 개수</td><td class="t-right">${byCat["Needs improvements"] || 0}</td></tr>
          <tr><td>Not done 개수</td><td class="t-right">${byCat["Not done"] || 0}</td></tr>
          <tr><td>Not applicable 개수</td><td class="t-right">${byCat["Not applicable"] || 0}</td></tr>
        </tbody>
      </table>
    </div>
  `;

  const boxItems = `
    <div class="card-section">
      <h3 class="kz-title">세부 평가내용 <small>(Kalamazoo 24문항, 범주형)</small></h3>
      <table class="kz-items-table">
        <thead>
          <tr><th>#</th><th>섹션</th><th>문항</th><th>범주</th><th>코멘트</th></tr>
        </thead>
        <tbody>
          ${items.map(it => `
            <tr>
              <td>${it.id}</td>
              <td>${it.section}</td>
              <td>${it.label}</td>
              <td>${it.category}</td>
              <td>${it.comment || "-"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  const boxCodes = `
    <div class="card-section">
      <h3 class="kz-title">문항별 배점 (코드 1~4)</h3>
      <table class="kz-items-table">
        <thead><tr><th>#</th><th>섹션</th><th>코드</th><th>범주</th></tr></thead>
        <tbody>
          ${items.map(it => {
            const code = CODE_OF[it.category] ?? "-";
            return `<tr><td>${it.id}</td><td>${it.section}</td><td>${code}</td><td>${it.category}</td></tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;

  const boxSummary = `
    <div class="card-section">
      <h3 class="kz-title">대화 요약</h3>
      <p>${String(r.summary || "").replace(/\n/g, "<br>") || "요약 정보가 없습니다."}</p>
    </div>
  `;

  return boxScore + boxTotals + boxItems + boxCodes + boxSummary;
}

// ===== 역할 진입 =====
if (enterStudentBtn) {
  enterStudentBtn.addEventListener("click", () => {
    const id = (studentIdInput?.value || "").trim();
    const name = (studentNameInput?.value || "").trim();
    if (!id || !name) { alert("학번과 이름을 모두 입력하세요."); return; }
    student = { id, name };
    showSections(["scenario", "chat", "debrief"]);
    location.hash = "#scenario";
  });
}

if (enterAdminBtn) {
  enterAdminBtn.addEventListener("click", () => {
    const pw = (adminPassInput?.value || "").trim();
    if (!pw) { alert("관리자 비밀번호를 입력하세요."); return; }
    showSections(["admin"]);
    if (adminPassVerify && !adminPassVerify.value) adminPassVerify.value = pw;
    location.hash = "#admin";
  });
}

// ===== 시나리오 생성 =====
if (scenarioBtn) {
  scenarioBtn.addEventListener("click", async () => {
    try {
      scenarioBtn.disabled = true;
      const res = await fetch(api("/api/generate-scenario"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extras: {} })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "시나리오 생성 실패");

      currentScenario = data.scenario;
      setScenarioView(currentScenario);
      history = [];
      chatBox.innerHTML = "";
      appendChat("시스템", "새 시나리오가 준비되었습니다. 대화를 시작하세요.");
      latestReport = null;
      debriefView.innerHTML = "";
    } catch (e) {
      console.error(e);
      alert("서버 오류: 시나리오 생성 실패");
    } finally {
      scenarioBtn.disabled = false;
      scenarioBtn.textContent = "시나리오 생성";
    }
  });
}

// ===== 채팅 =====
async function sendMessage() {
  const msg = chatInput.value.trim();
  if (!msg) return;
  if (!currentScenario) { alert("먼저 시나리오를 생성하세요."); return; }

  appendChat("학생", msg);
  chatInput.value = "";
  try {
    const res = await fetch(api("/api/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenario: `제목: ${currentScenario.title}\n목표: ${currentScenario.goal}\n${currentScenario.text}`,
        history,
        message: msg
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "응답 실패");
    appendChat("환자", data.reply || "(응답 없음)");
  } catch (e) {
    console.error(e);
    appendChat("시스템", "서버 오류: 응답을 받지 못했습니다.");
  }
}
if (sendBtn && chatInput) {
  sendBtn.addEventListener("click", sendMessage);
  chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });
}

// ===== 디브리핑 =====
if (debriefBtn) {
  debriefBtn.addEventListener("click", async () => {
    if (!currentScenario || history.length === 0) { alert("먼저 대화를 진행하세요."); return; }
    try {
      debriefBtn.disabled = true;
      const res = await fetch(api("/api/debrief"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student, scenario: currentScenario, history })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "디브리핑 실패");
      latestReport = data.report || null;
      debriefView.innerHTML = renderDebriefKalamazoo(latestReport);
    } catch (e) {
      console.error(e);
      alert("서버 오류: 디브리핑 실패");
    } finally {
      debriefBtn.disabled = false;
      debriefBtn.textContent = "디브리핑 시작";
    }
  });
}

// ===== 세션 저장 =====
if (saveBtn) {
  saveBtn.addEventListener("click", async () => {
    if (!currentScenario || history.length === 0) { alert("저장할 대화가 없습니다."); return; }
    student.id = (studentIdInput?.value || student.id).trim();
    student.name = (studentNameInput?.value || student.name).trim();

    try {
      const res = await fetch(api("/api/transcript"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student, scenario: currentScenario, history, report: latestReport })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || "저장 실패");
      alert("세션이 저장되었습니다. (관리자 전용 열람)");
    } catch (e) {
      console.error(e);
      alert("서버 오류: 저장 실패");
    }
  });
}

// ===== 관리자: 로그 조회 =====
if (loadLogsBtn) {
  loadLogsBtn.addEventListener("click", async () => {
    const pw = (adminPassVerify?.value || "").trim();
    if (!pw) { alert("관리자 비밀번호를 입력하세요."); return; }

    try {
      const res = await fetch(api(`/api/transcripts?password=${encodeURIComponent(pw)}`));
      if (res.status === 401) { alert("비밀번호가 올바르지 않습니다."); return; }
      const items = await res.json();

      logList.innerHTML = "";
      logView.textContent = "";
      if (!Array.isArray(items) || items.length === 0) {
        logList.innerHTML = "<li>저장된 세션이 없습니다.</li>";
        return;
      }

      items.forEach(item => {
        const st = item.student || {};
        const label = (st.id || st.name) ? ` [${st.id || ""} ${st.name || ""}]` : "";
        const li = document.createElement("li");
        li.innerHTML = `<button class="btn" data-id="${item.id}" style="margin-bottom:6px; width:100%;">
          ${new Date(item.savedAt).toLocaleString()} — ${item.scenario?.title || "제목 없음"}${label}
        </button>`;
        logList.appendChild(li);
      });

      logList.querySelectorAll("button[data-id]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-id");
          const r = await fetch(api(`/api/transcripts/${id}?password=${encodeURIComponent(pw)}`));
          if (r.status === 401) { alert("비밀번호가 올바르지 않습니다."); return; }
          const data = await r.json();
          const convo = (data.history || []).map(h => `${h.who}: ${h.text}`).join("\n");
          const reportHTML = data.report ? renderDebriefKalamazoo(data.report)
                                         : `<div class="admin-report-empty">평가 데이터가 없습니다.</div>`;

          logView.innerHTML = `
            <div class="admin-detail-grid">
              <pre class="admin-conv-pre">${convo || "(대화 기록 없음)"}</pre>
              <div class="admin-report">${reportHTML}</div>
            </div>
          `;
        });
      });
    } catch (e) {
      console.error(e);
      alert("서버 통신 오류로 목록을 불러오지 못했습니다.");
    }
  });
}