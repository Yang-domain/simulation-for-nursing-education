// 상대 경로 기반 API 호출 (Render 같은 서버 환경에서 안전하게 작동)
const api = (p) => `/api${p}`;

// 시나리오 생성
async function generateScenario() {
  const res = await fetch(api("/generate-scenario"), { method: "POST" });
  const data = await res.json();
  document.getElementById("scenario").textContent = data.scenario;
}

// 채팅
async function sendChat() {
  const input = document.getElementById("chatInput");
  const message = input.value;
  if (!message) return;

  const chatLog = document.getElementById("chatLog");
  chatLog.innerHTML += `<div><b>나:</b> ${message}</div>`;
  input.value = "";

  const res = await fetch(api("/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  const data = await res.json();
  chatLog.innerHTML += `<div><b>AI:</b> ${data.reply}</div>`;
}

// 디브리핑
async function getDebrief() {
  const res = await fetch(api("/debrief"), { method: "POST" });
  const data = await res.json();
  document.getElementById("debrief").textContent = data.debrief;
}

// 기록 저장
async function saveTranscript() {
  const title = prompt("저장할 대화 제목을 입력하세요:");
  if (!title) return;

  const res = await fetch(api("/transcript"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });

  const data = await res.json();
  alert(data.message);
}

// 저장된 기록 불러오기
async function loadTranscripts() {
  const res = await fetch(api("/transcripts"));
  const data = await res.json();
  const list = document.getElementById("transcriptList");
  list.innerHTML = "";

  data.forEach((t) => {
    const li = document.createElement("li");
    li.textContent = t.title;
    li.onclick = () => loadTranscriptDetail(t);
    list.appendChild(li);
  });
}

function loadTranscriptDetail(t) {
  const detail = document.getElementById("transcriptDetail");
  detail.innerHTML = `
    <h3>${t.title}</h3>
    <pre>${t.content}</pre>
  `;
}

