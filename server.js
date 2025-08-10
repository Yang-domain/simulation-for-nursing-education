// server.js (Node.js + Express, ESM)
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// 로그
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "1234";

// ----- 데이터 파일 경로 -----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.join(__dirname, "transcripts.json");

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

// ========== 프롬프트 빌더들 ==========
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

function buildPatientPrompt({ guidePrompt, scenario, history, userMessage }) {
  const log = (history || []).map(h => `${h.who}: ${h.text}`).join("\n");
  return `
${guidePrompt}

[시나리오]
${scenario || "시나리오 정보 없음"}

[대화기록]
${log}

[학생의 최신 발화]
학생: ${userMessage}

환자: (한국어, 1~3문장)
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

// ========== AI 엔드포인트들 ==========

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

// (B) 환자 응답(대화 지침)
app.post("/api/chat", async (req, res) => {
  try {
    const { scenario, history = [], message } = req.body || {};
    if (!message) return res.status(400).json({ error: "message required" });

    const guide = process.env.PATIENT_GUIDE_PROMPT
      || "당신은 가상의 환자다. 한국어, 1~3문장, 설정을 벗어나지 말 것. 질문에 맞게 구체적으로 답하되 과도한 의학 조언은 금지.";
    const input = buildPatientPrompt({ guidePrompt: guide, scenario, history, userMessage: message });

    const r = await client.responses.create({ model: "gpt-4o-mini", input });
    res.json({ reply: r.output_text || "" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server_error" });
  }
});

// (C) 디브리핑 요약/점수
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

// ========== 저장/열람 엔드포인트들 (그대로 사용) ==========

// 학생 세션 저장 (학번/이름 포함)
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

// 관리자: 목록 조회 (학번/이름 포함)
app.get("/api/transcripts", (req, res) => {
  const pw = (req.query.password || "").trim();
  if (pw !== ADMIN_PASSWORD) return res.status(401).json({ error: "unauthorized" });
  const list = readTranscripts().map(({ id, student, scenario, savedAt }) => ({ id, student, scenario, savedAt }));
  res.json(list);
});

// 관리자: 단건 조회
app.get("/api/transcripts/:id", (req, res) => {
  const pw = (req.query.password || "").trim();
  if (pw !== ADMIN_PASSWORD) return res.status(401).json({ error: "unauthorized" });

  const list = readTranscripts();
  const found = list.find(x => x.id === req.params.id);
  if (!found) return res.status(404).json({ error: "not_found" });
  res.json(found);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
});
