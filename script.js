// ===== 전역 상태 =====
let currentScenario = null;
let history = []; // [{ who: "학생"|"환자"|"시스템", text: "..." }]
let student = { id: "", name: "" };

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

const adminPassInput = document.getElementById("admin-pass");
const enterAdminBtn  = document.getElementById("enter-admin");
const adminPassVerify = document.getElementById("admin-pass-verify");
const loadLogsBtn     = document.getElementById("load-logs");
const logList         = document.getElementById("log-list");
const logView         = document.getElementById("log-view");

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
  row.innerHTML = `<strong>${who}:</strong> ${text}`;
  chatBox.appendChild(row);
  chatBox.scrollTop = chatBox.scrollHeight;
}
function setScenarioView(s) {
  scenarioView.innerHTML = `
    <div class="scenario">
      <p><strong>제목:</strong> ${s.title}</p>
      <p>${String(s.text || "").replace(/\n/g, "<br>")}</p>
      <p><strong>학습목표:</strong> ${s.goal}</p>
    </div>
  `;
}

// ===== 역할 진입 이벤트 =====
// 학생으로 시작
if (enterStudentBtn) {
  enterStudentBtn.addEventListener("click", () => {
    const id = (studentIdInput?.value || "").trim();
    const name = (studentNameInput?.value || "").trim();
    if (!id || !name) {
      alert("학번과 이름을 모두 입력하세요.");
      return;
    }
    student = { id, name };
    showSections(["scenario", "chat", "debrief"]); // 학습 화면 열기
    location.hash = "#scenario";
  });
}

// 관리자 접속
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
      const original = scenarioBtn.textContent;
      scenarioBtn.textContent = "생성 중...";

      const res = await fetch("/api/generate-scenario", {
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

      scenarioBtn.textContent = original;
      scenarioBtn.disabled = false;
    } catch (e) {
      console.error(e);
      alert("서버 오류: 시나리오를 가져오지 못했습니다.");
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
    const res = await fetch("/api/chat", {
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
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });
}

// ===== 디브리핑 =====
if (debriefBtn) {
  debriefBtn.addEventListener("click", async () => {
    if (!currentScenario || history.length === 0) {
      alert("먼저 시나리오를 생성하고 대화를 진행하세요.");
      return;
    }
    try {
      debriefBtn.disabled = true;
      const original = debriefBtn.textContent;
      debriefBtn.textContent = "분석 중...";

      const res = await fetch("/api/debrief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student, scenario: currentScenario, history })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "디브리핑 실패");

      const r = data.report || {};
      debriefView.innerHTML = `
        <h3>요약</h3>
        <p>${String(r.summary || "").replace(/\n/g, "<br>")}</p>
        <h3>잘한 점</h3>
        <ul>${(r.strengths || []).map(x => `<li>${x}</li>`).join("")}</ul>
        <h3>개선점</h3>
        <ul>${(r.improvements || []).map(x => `<li>${x}</li>`).join("")}</ul>
        <h3>점수</h3>
        <pre>${JSON.stringify(r.scores || {}, null, 2)}</pre>
      `;

      debriefBtn.textContent = original;
      debriefBtn.disabled = false;
    } catch (e) {
      console.error(e);
      alert("서버 오류: 디브리핑을 받지 못했습니다.");
      debriefBtn.disabled = false;
      debriefBtn.textContent = "디브리핑 시작";
    }
  });
}

// ===== 세션 저장 =====
if (saveBtn) {
  saveBtn.addEventListener("click", async () => {
    if (!currentScenario || history.length === 0) {
      alert("저장할 대화가 없습니다.");
      return;
    }
    // 최신 학생 정보 반영
    student.id = (studentIdInput?.value || student.id).trim();
    student.name = (studentNameInput?.value || student.name).trim();

    try {
      const res = await fetch("/api/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student, scenario: currentScenario, history })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || "저장 실패");
      alert("세션이 저장되었습니다. (관리자 전용 열람)");
    } catch (e) {
      console.error(e);
      alert("서버 오류로 저장하지 못했습니다.");
    }
  });
}

// ===== 관리자: 로그 조회 =====
if (loadLogsBtn) {
  loadLogsBtn.addEventListener("click", async () => {
    const pw = (adminPassVerify?.value || "").trim();
    if (!pw) { alert("관리자 비밀번호를 입력하세요."); return; }

    try {
      const res = await fetch(`/api/transcripts?password=${encodeURIComponent(pw)}`);
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

      // 상세 보기
      logList.querySelectorAll("button[data-id]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-id");
          const r = await fetch(`/api/transcripts/${id}?password=${encodeURIComponent(pw)}`);
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
}
