// script.js (Render/로컬 공용)

// ====== 상태 ======
let currentScenario = null;
let history = []; // { who: "학생"|"환자"|"시스템", text: "..." }
let student = { id: "", name: "" };

// ====== DOM ======
const scenarioBtn   = document.getElementById("generate-scenario");
const scenarioView  = document.getElementById("scenario-display");

const chatBox       = document.getElementById("chat-box");
const chatInput     = document.getElementById("chat-input");
const sendBtn       = document.getElementById("send-message");

const debriefBtn    = document.getElementById("run-debrief");
const debriefView   = document.getElementById("debrief-result");

const saveBtn       = document.getElementById("save-session"); // 있으면 사용

// (학생 시작용 입력칸이 있다면) id="student-id", id="student-name"
const studentIdInput   = document.getElementById("student-id");
const studentNameInput = document.getElementById("student-name");

// ====== 공용 함수 ======
function appendChat(who, text) {
  history.push({ who, text });
  const div = document.createElement("div");
  div.innerHTML = `<strong>${who}:</strong> ${text}`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function setScenarioView(s) {
  scenarioView.innerHTML = `
    <div class="scenario">
      <p><strong>제목:</strong> ${s.title}</p>
      <p>${s.text.replace(/\n/g, "<br>")}</p>
      <p><strong>학습목표:</strong> ${s.goal}</p>
    </div>
  `;
}

// ====== 이벤트 바인딩 ======
if (scenarioBtn) {
  scenarioBtn.addEventListener("click", async () => {
    try {
      scenarioBtn.disabled = true;
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
      history = []; // 새 시나리오면 대화 초기화
      chatBox.innerHTML = "";
      appendChat("시스템", "새 시나리오가 준비되었습니다. 대화를 시작하세요.");
    } catch (e) {
      alert("서버 오류: 시나리오를 가져오지 못했습니다.");
      console.error(e);
    } finally {
      scenarioBtn.disabled = false;
      scenarioBtn.textContent = "시나리오 생성";
    }
  });
}

if (sendBtn && chatInput) {
  sendBtn.addEventListener("click", async () => {
    const msg = chatInput.value.trim();
    if (!msg) return;
    if (!currentScenario) {
      alert("먼저 위에서 시나리오를 생성하세요.");
      return;
    }

    // 학생 정보 갱신(있으면)
    if (studentIdInput) student.id = studentIdInput.value.trim();
    if (studentNameInput) student.name = studentNameInput.value.trim();

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
  });

  // Enter로 전송
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendBtn.click();
  });
}

if (debriefBtn) {
  debriefBtn.addEventListener("click", async () => {
    if (!currentScenario || history.length === 0) {
      alert("먼저 시나리오를 생성하고 대화를 진행하세요.");
      return;
    }
    try {
      debriefBtn.disabled = true;
      debriefBtn.textContent = "분석 중...";
      const res = await fetch("/api/debrief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student,
          scenario: currentScenario,
          history
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "디브리핑 실패");
      const r = data.report;
      debriefView.innerHTML = `
        <h3>요약</h3>
        <p>${(r.summary || "").replace(/\n/g, "<br>")}</p>
        <h3>잘한 점</h3>
        <ul>${(r.strengths || []).map(x => `<li>${x}</li>`).join("")}</ul>
        <h3>개선점</h3>
        <ul>${(r.improvements || []).map(x => `<li>${x}</li>`).join("")}</ul>
        <h3>점수</h3>
        <pre>${JSON.stringify(r.scores || {}, null, 2)}</pre>
      `;
    } catch (e) {
      console.error(e);
      alert("서버 오류: 디브리핑을 받지 못했습니다.");
    } finally {
      debriefBtn.disabled = false;
      debriefBtn.textContent = "디브리핑 시작";
    }
  });
}

if (saveBtn) {
  saveBtn.addEventListener("click", async () => {
    if (!currentScenario || history.length === 0) {
      alert("저장할 대화가 없습니다.");
      return;
    }
    try {
      // 학생 입력값 최신화
      if (studentIdInput) student.id = studentIdInput.value.trim();
      if (studentNameInput) student.name = studentNameInput.value.trim();

      const res = await fetch("/api/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student,
          scenario: currentScenario,
          history
        })
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
