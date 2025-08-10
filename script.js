// ===== 간단 시나리오 목록 (폴백용) =====
const SCENARIOS = [
  { title: "흉통 호소 성인", text: "54세 남성. 1시간 전부터 조이는 흉통(7/10), 식은땀. 고혈압 복용 불규칙, 흡연.", goal: "공감, OPQRST 사정, 안전/보고" },
  { title: "수술 후 통증/불안", text: "24세 여성. 충수절제술 3시간 경과. 통증 6/10, 메스꺼움. 투약 지연으로 불안.", goal: "통증 사정, 비약물적 중재, Teach-back" },
  { title: "노인 어지럼/낙상 위험", text: "79세 여성. 기립 시 어지럼, 1주 전 소낙상. 보청기, 다약제(이뇨제 포함).", goal: "안전 설명, 가족 포용, 다음 단계 공유" }
];

// ===== 상태 =====
let currentScenario = null;
let history = []; // [{who:'학생'|'환자'|'시스템', text:'...'}]
let role = null;  // 'student' | 'admin'
let studentInfo = { id: "", name: "" }; // 학번/이름

const $ = (sel) => document.querySelector(sel);

// 공통 DOM
const scenarioBtn = $("#generate-scenario");
const scenarioDisplay = $("#scenario-display");
const chatBox = $("#chat-box");
const chatInput = $("#chat-input");
const sendBtn = $("#send-message");
const saveBtn = $("#save-session");
const debriefBtn = $("#run-debrief");
const debriefResult = $("#debrief-result");

// 역할 선택 DOM
const roleSection = $("#role");
const studentIdInput = $("#student-id");
const studentNameInput = $("#student-name");
const enterStudentBtn = $("#enter-student");
const enterAdminBtn = $("#enter-admin");
const adminPassInput = $("#admin-pass");

// 관리자 DOM
const adminSection = $("#admin");
const adminPassVerify = $("#admin-pass-verify");
const loadLogsBtn = $("#load-logs");
const logList = $("#log-list");
const logView = $("#log-view");

// 섹션 토글
function showForRole(r) {
  role = r;
  ["scenario","chat","debrief","admin"].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = true; });
  roleSection.hidden = true;

  if (role === "student") {
    $("#scenario").hidden = false;
    $("#chat").hidden = false;
    $("#debrief").hidden = false;
  } else if (role === "admin") {
    adminSection.hidden = false;
  }
}

// 역할 선택 이벤트
enterStudentBtn.addEventListener("click", () => {
  const sid = (studentIdInput.value || "").trim();
  const sname = (studentNameInput.value || "").trim();
  if (!sid || !sname) {
    alert("학번과 이름을 모두 입력하세요.");
    return;
  }
  studentInfo = { id: sid, name: sname };
  showForRole("student");
});

enterAdminBtn.addEventListener("click", async () => {
  const pass = (adminPassInput.value || "").trim();
  if (!pass) { alert("비밀번호를 입력하세요."); return; }
  if (pass !== "1234") { alert("비밀번호가 올바르지 않습니다."); return; }
  showForRole("admin");
  adminPassVerify.value = pass;
});

// 유틸
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
}
function appendChat(who, text) {
  const row = document.createElement("div");
  row.className = `chat-row ${who === "학생" ? "me" : who === "환자" ? "pt" : "system"}`;
  row.innerHTML = `<strong>${who}</strong>: ${escapeHtml(text)}`;
  chatBox.appendChild(row);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// ===== 시나리오 생성 (서버 호출 + 폴백) =====
async function generateScenario() {
  try {
    const res = await fetch("http://localhost:3000/api/generate-scenario", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ extras: { difficulty: "beginner" } }) // 옵션 필요없으면 {}로
    });
    if (!res.ok) throw new Error("bad status");
    const { scenario } = await res.json();
    return scenario;
  } catch {
    return SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];
  }
}
scenarioBtn.addEventListener("click", async () => {
  const s = await generateScenario();
  currentScenario = s;
  scenarioDisplay.innerHTML =
    `제목: ${s.title}\n${s.text}\n\n학습목표: ${s.goal}`;
  history = [];
  chatBox.innerHTML = "";
  debriefResult.innerHTML = "";
});

// ===== 채팅 전송 =====
async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  if (!currentScenario) {
    alert("먼저 '시나리오 생성'을 눌러주세요.");
    return;
  }

  appendChat("학생", text);
  history.push({ who: "학생", text });
  chatInput.value = "";

  appendChat("시스템", "…환자 응답 생성 중");

  try {
    const res = await fetch("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenario: `[${currentScenario.title}] ${currentScenario.text}`,
        history,
        message: text
      })
    });
    const data = await res.json();

    // 로딩 메시지 제거
    chatBox.removeChild(chatBox.lastElementChild);

    const reply = data.reply || "(응답 없음)";
    appendChat("환자", reply);
    history.push({ who: "환자", text: reply });
  } catch (err) {
    chatBox.removeChild(chatBox.lastElementChild);
    appendChat("시스템", "서버 오류: http://localhost:3000 이 켜져 있는지 확인하세요.");
    console.error(err);
  }
}
sendBtn.addEventListener("click", sendMessage);
chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });

// ===== 세션 저장 =====
saveBtn.addEventListener("click", async () => {
  if (!currentScenario || history.length === 0) {
    alert("시나리오와 대화가 있어야 저장할 수 있습니다.");
    return;
  }
  try {
    const res = await fetch("http://localhost:3000/api/transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student: studentInfo,
        scenario: currentScenario,
        history
      })
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      alert(`저장 실패 (HTTP ${res.status})\n${text || "서버 응답 본문 없음"}`);
      return;
    }

    const data = await res.json().catch(() => ({}));
    if (data.ok) alert("세션이 저장되었습니다.");
    else alert("저장 실패: " + (data.error || "알 수 없는 오류"));
  } catch (e) {
    console.error(e);
    alert("서버 통신 오류로 저장하지 못했습니다.");
  }
});

// ===== 디브리핑 (서버 호출 + 폴백) =====
debriefBtn.addEventListener("click", async () => {
  if (!history.length) { debriefResult.textContent = "대화 기록이 없습니다."; return; }

  try {
    const res = await fetch("http://localhost:3000/api/debrief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student: studentInfo, scenario: currentScenario, history })
    });
    if (!res.ok) throw new Error("bad status");
    const { report } = await res.json();

    debriefResult.innerHTML = `
      <h4>요약</h4><p>${report.summary}</p>
      <h4>잘한 점</h4><ul>${(report.strengths||[]).map(s=>`<li>${s}</li>`).join("")}</ul>
      <h4>개선점</h4><ul>${(report.improvements||[]).map(s=>`<li>${s}</li>`).join("")}</ul>
      <h4>점수</h4>
      <p>공감: ${report.scores?.empathy}/2, 열린질문: ${report.scores?.openQuestion}/2, Teach-back: ${report.scores?.teachBack}/2</p>
    `;
  } catch {
    // 폴백(키워드 기반)
    const studentOnly = history.filter(h => h.who === "학생").map(h => h.text).join(" ");
    const score = {
      empathy: /(괜찮|걱정|불안|힘드시|걱정되)/g.test(studentOnly) ? 1 : 0,
      openQuestion: /(어떠|어디|언제|무엇|어떻게|왜)/g.test(studentOnly) ? 1 : 0,
      teachBack: /(이해하셨|다시 한번|요약|말씀해보)/g.test(studentOnly) ? 1 : 0
    };
    const total = score.empathy + score.openQuestion + score.teachBack;
    debriefResult.innerHTML = `
      <h4>간단 평가 결과(폴백)</h4>
      <p>총점: ${total}/3</p>
    `;
  }
});

// ===== 관리자: 로그 조회 =====
loadLogsBtn.addEventListener("click", async () => {
  const pass = (adminPassVerify.value || "").trim();
  if (!pass) { alert("비밀번호를 입력하세요."); return; }

  try {
    const res = await fetch(`http://localhost:3000/api/transcripts?password=${encodeURIComponent(pass)}`);
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
      const labelStudent = (st.id || st.name) ? ` [${st.id || ""} ${st.name || ""}]` : "";
      const li = document.createElement("li");
      li.innerHTML = `<button class="btn" data-id="${item.id}" style="margin-bottom:6px; width:100%;">
        ${new Date(item.savedAt).toLocaleString()} — ${item.scenario?.title || "제목 없음"}${labelStudent}
      </button>`;
      logList.appendChild(li);
    });

    // 상세 보기
    logList.querySelectorAll("button[data-id]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        const r = await fetch(`http://localhost:3000/api/transcripts/${id}?password=${encodeURIComponent(pass)}`);
        if (r.status === 401) { alert("비밀번호가 올바르지 않습니다."); return; }
        const data = await r.json();
        const st = data.student || {};
        logView.textContent =
          `학번/이름: ${st.id || "-"} / ${st.name || "-"}\n` +
          `제목: ${data.scenario?.title}\n목표: ${data.scenario?.goal}\n시간: ${new Date(data.savedAt).toLocaleString()}\n\n` +
          `--- 대화 ---\n` +
          data.history.map(h => `${h.who}: ${h.text}`).join("\n");
      });
    });

  } catch (e) {
    console.error(e);
    alert("서버 통신 오류로 목록을 불러오지 못했습니다.");
  }
});
