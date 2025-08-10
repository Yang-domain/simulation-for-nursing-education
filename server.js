// server.js (Node.js + Express, ESM)
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ── 경로 계산 (ESM에서 __dirname 대체)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── .env 명시적으로 로드 (로컬에서 확실히 적용)
dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ── 정적 파일 서빙 + 루트 라우트 (Render에서 직접 열리게)
app.use(express.static(__dirname));
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ── 로그(선택)
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ── OpenAI / 관리자 설정
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "1234";

// ── 데이터 파일 경로
const DATA_PATH = path.join(__dirname, "transcripts.json");

// ── 저장 유틸
function readTranscripts() {
  try {
    if (!fs.existsSync(DATA_PATH)) return [];
    const raw = fs.readFileSync(DATA_PATH, "utf-8");
    return JSON.parse(raw || "[]");
  } catch {
    return [];
  }
}
function writeTranscripts(list) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(list, null, 2), "utf-8");
}

// ── 프롬프트 빌더
function buildScenarioPrompt(userPrompt, extras) {
  return `
${userPrompt}

출력은 JSON 하나만 반환하세요(설명문 금지):
{
  "title": "<짧은 시나리오 제목>",
  "text": "<임상 상황 설명 (2~5문단)>",
  "goal": "<학습목표: NTS/의사소통 관점 2~4개, 쉼표 구분>"
}

요구 조건:
- 한국어로 작성
- 교육 현장에서 바로 쓸 수 있게 구체적
- 민감/개인정보/실제 인명/병원명 금지
- (선택옵션) ${JSON.stringify(extras || {})}
`.trim();
}

// ⬇⬇⬇ 중요: .env 지침이 100% 우선되도록 하드코딩 제거
function buildPatientPrompt({ guidePrompt, scenario, history, userMessage }) {
  const log = (history || []).map(h => `${h.who}: ${h.text}`).join("\n");
  return `
${guidePrompt || "당신은 가상의 환자입니다. 한국어로만 답하세요."}

[시나리오]
${scenario || "시나리오 정보 없음"}

[대화기록]
${log}

[학생의 최신 발화]
학생: ${userMessage}

환자:
`.trim();
}

function buildDebriefPrompt(basePrompt, { student, scenario, history }) {
  const log = (history || []).map(h => `${h.who}: ${h.text}`).join("\n");
  return `
${basePrompt}

출력은 JSON 하나만 반환:
{
  "summary": "<대화 요약(한국어, 4~6문장)>",
  "strengths": ["<잘한 점 2~3개>"],
  "improvements": ["<개선점 2~3개>"],
  "scores": { "empathy": 0-2, "openQuestion": 0-2, "teachBack": 0-2 }
}

[학생] ${student?.id || "-"} ${student?.name || "-"}
[시나리오]
제목: ${scenario?.title}
목표: ${scenario?.goal}

[대화기록]
${log}
`.trim();
}

function safeParseJsonFromText(t) {
  if (!t) return null;
  try { return JSON.parse(t); } catch {}
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

// ── API

// (A) 시나리오 생성
app.post("/api/generate-scenario", async (req, res) => {
  try {
    const { extras } = req.body || {};
    const base = process.env.SCENARIO_PROMPT || "간호학생용 임상 시나리오를 생성한다.";
    const input = buildScenarioPrompt(base, extras);

    const r = await client.responses.create({ model: "gpt-4o-mini", input });
    const scenario = safeParseJsonFromText(r.output_text || "");
    if (!scenario?.title || !scenario?.text) {
      return res.status(500).json({ error: "invalid_format", raw: r.output_text });
    }
    res.json({ scenario });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "gen_failed" });
  }
});

// (B) 환자 응답
app.post("/api/chat", async (req, res) => {
  try {
    const { scenario, history = [], message } = req.body || {};
    if (!message) return res.status(400).json({ error: "message required" });

    const guide = process.env.PATIENT_GUIDE_PROMPT
      || "당신은 가상의 환자다. 한국어로 대화하고 설정을 벗어나지 말 것.";
    const input = buildPatientPrompt({ guidePrompt: guide, scenario, history, userMessage: message });

    const r = await client.responses.create({ model: "gpt-4o-mini", input });
    res.json({ reply: r.output_text || "" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server_error" });
  }
});

// (C) 디브리핑
app.post("/api/debrief", async (req, res) => {
  try {
    const { student, scenario, history = [] } = req.body || {};
    const base = process.env.DEBRIEF_PROMPT || "간호학생 의사소통 디브리핑을 생성한다.";
    const input = buildDebriefPrompt(base, { student, scenario, history });

    const r = await client.responses.create({ model: "gpt-4o-mini", input });
    const report = safeParseJsonFromText(r.output_text || "");
    if (!report) return res.status(500).json({ error: "invalid_format" });
    res.json({ report });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "debrief_failed" });
  }
});

// (D) 학생 세션 저장
app.post("/api/transcript", (req, res) => {
  try {
    const { student = {}, scenario, history = [] } = req.body || {};
    if (!scenario || !history.length) {
      return res.status(400).json({ ok: false, error: "scenario and history required" });
    }
    const list = readTranscripts();
    const item = {
      id: String(Date.now()),
      student: { id: student?.id || "", name: student?.name || "" },
      scenario,
      history,
      savedAt: new Date().toISOString()
    };
    list.push(item);
    writeTranscripts(list);
    res.json({ ok: true, id: item.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "save_failed" });
  }
});

// (E) 관리자 조회
app.get("/api/transcripts", (req, res) => {
  const pw = (req.query.password || "").trim();
  if (pw !== ADMIN_PASSWORD) return res.status(401).json({ error: "unauthorized" });
  const list = readTranscripts().map(({ id, student, scenario, savedAt }) => ({ id, student, scenario, savedAt }));
  res.json(list);
});

app.get("/api/transcripts/:id", (req, res) => {
  const pw = (req.query.password || "").trim();
  if (pw !== ADMIN_PASSWORD) return res.status(401).json({ error: "unauthorized" });

  const list = readTranscripts();
  const found = list.find(x => x.id === req.params.id);
  if (!found) return res.status(404).json({ error: "not_found" });
  res.json(found);
});

// (옵션) 디버그: 프롬프트 로딩 확인용 (길이/앞부분만 노출)
app.get("/api/_debug_prompts", (req, res) => {
  const pw = (req.query.password || "").trim();
  if (pw !== (process.env.ADMIN_PASSWORD || "1234")) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const mask = (v) => v ? { length: v.length, head: v.slice(0, 60) } : null;
  res.json({
    scenario: mask(process.env.SCENARIO_PROMPT),
    patient:  mask(process.env.PATIENT_GUIDE_PROMPT),
    debrief:  mask(process.env.DEBRIEF_PROMPT)
  });
});

// ── 실행
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
});
