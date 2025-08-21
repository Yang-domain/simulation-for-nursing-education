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

// ── 정적 파일 서빙 + 루트 라우트
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

// ── JSON 파싱 유틸
function safeParseJsonFromText(t) {
  if (!t) return null;
  try { return JSON.parse(t); } catch {}
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

// ── 입력 빌더 (instructions는 .env에서, input은 데이터/형식만)
function buildScenarioInput(extras) {
  return `
출력은 JSON 하나만 반환하세요(설명문 금지):
{
  "title": "<짧은 시나리오 제목>",
  "text": "<임상 상황 설명 (2~5문단)>",
  "goal": "<학습목표: NTS/의사소통 관점 2~4개, 쉼표 구분>"
}

(선택옵션) ${JSON.stringify(extras || {})}
`.trim();
}

function buildPatientInput({ scenario, history, userMessage }) {
  const log = (history || []).map(h => `${h.who}: ${h.text}`).join("\n");
  return `
[시나리오]
${scenario || "시나리오 정보 없음"}

[대화기록]
${log}

[학생의 최신 발화]
학생: ${userMessage}

환자:
`.trim();
}

// ==== 중요: 범주형 Kalamazoo 24문항 입력 빌더 ====
function buildDebriefInputKalamazoo({ student, scenario, history }) {
  const log = (history || []).map(h => `${h.who}: ${h.text}`).join("\n");
  return `
출력은 JSON 하나만 반환:
{
  "summary": "<대화 요약(한국어, 4~6문장)>",
  "items": [
    { "id": 1,  "section": "A", "label": "Greets and shows interest in patient as a person",                                "category": "<Done well|Needs improvements|Not done|Not applicable>", "comment": "<선택>" },
    { "id": 2,  "section": "A", "label": "Uses words that show care and concern throughout the interview",                  "category": "<Done well|Needs improvements|Not done|Not applicable>", "comment": "<선택>" },
    { "id": 3,  "section": "A", "label": "Uses tone, pace, eye contact, and posture that show care and concern",           "category": "Not applicable",                                          "comment": "<선택>" },
    { "id": 4,  "section": "B", "label": "Allows patient to complete opening statement without interruption",              "category": "Not applicable",                                          "comment": "<선택>" },
    { "id": 5,  "section": "B", "label": "Asks 'Is there anything else?' to elicit full set of concerns",                  "category": "<Done well|Needs improvements|Not done|Not applicable>", "comment": "<선택>" },
    { "id": 6,  "section": "B", "label": "Explains and/or negotiates an agenda for the visit",                             "category": "<Done well|Needs improvements|Not done|Not applicable>", "comment": "<선택>" },

    { "id": 7,  "section": "C", "label": "Begins with patient’s story using open-ended questions ('Tell me about …')",     "category": "<Done well|Needs improvements|Not done|Not applicable>", "comment": "<선택>" },
    { "id": 8,  "section": "C", "label": "Clarifies details as necessary with more specific or 'yes/no' questions",        "category": "<Done well|Needs improvements|Not done|Not applicable>", "comment": "<선택>" },
    { "id": 9,  "section": "C", "label": "Summarizes and gives patient opportunity to correct or add information",          "category": "<Done well|Needs improvements|Not done|Not applicable>", "comment": "<선택>" },
    { "id": 10, "section": "C", "label": "Transitions effectively to additional questions",                                 "category": "<Done well|Needs improvements|Not done|Not applicable>", "comment": "<선택>" },

    { "id": 11, "section": "D", "label": "Asks about life events, circumstances, other people that might affect health",    "category": "<Done well|Needs improvements|Not done|Not applicable>", "comment": "<선택>" },
    { "id": 12, "section": "D", "label": "Elicits patient’s beliefs, concerns, and expectations about illness/treatment",  "category": "<Done well|Needs improvements|Not done|Not applicable>", "comment": "<선택>" },
    { "id": 13, "section": "D", "label": "Responds explicitly to patient statements about ideas, feelings, and values",    "category": "<Done well|Needs improvements|Not done|Not applicable>", "comment": "<선택>" },

    { "id": 14, "section": "E", "label": "Assesses patient’s understanding of problem and desire for more information",     "category": "<Done well|Needs improvements|Not done|Not applicable>", "comment": "<선택>" },
    { "id": 15, "section": "E", "label": "Explains using words that are easy for patient to understand",                    "category": "<Done well|Needs improvements|Not done|Not applicable>", "comment": "<선택>" },
    { "id": 16, "section": "E", "label": "Checks for mutual understanding of diagnostic and/or treatment plans",            "category": "<Done well|Needs improvements|Not done|Not applicable>", "comment": "<선택>" },
    { "id": 17, "section": "E", "label": "Asks whether patient has any questions",                                          "category": "<Done well|Needs improvements|Not done|Not applicable>", "comment": "<선택>" },

    { "id": 18, "section": "F", "label": "Includes patient in choices and decisions to the extent s/he desires",           "category": "<Done well|Needs improvements|Not done|Not applicable>", "comment": "<선택>" },
    { "id": 19, "section": "F", "label": "Asks about patient’s ability to follow diagnostic/treatment plans",              "category": "<Done well|Needs improvements|Not done|Not applicable>", "comment": "<선택>" },
    { "id": 20, "section": "F", "label": "Identifies additional resources as appropriate",                                 "category": "<Done well|Needs improvements|Not done|Not applicable>", "comment": "<선택>" },

    { "id": 21, "section": "G", "label": "Asks whether the patient has questions, concerns, or other issues",              "category": "<Done well|Needs improvements|Not done|Not applicable>", "comment": "<선택>" },
    { "id": 22, "section": "G", "label": "Summarizes",                                                                     "category": "<Done well|Needs improvements|Not done|Not applicable>", "comment": "<선택>" },
    { "id": 23, "section": "G", "label": "Clarifies follow-up or contact arrangements",                                    "category": "<Done well|Needs improvements|Not done|Not applicable>", "comment": "<선택>" },
    { "id": 24, "section": "G", "label": "Acknowledges patient and closes interview",                                      "category": "<Done well|Needs improvements|Not done|Not applicable>", "comment": "<선택>" }
  ]
}

[학생] ${student?.id || "-"} ${student?.name || "-"}
[시나리오]
제목: ${scenario?.title}
목표: ${scenario?.goal}

[대화기록]
${log}
`.trim();
}

// ── API

// (A) 시나리오 생성
app.post("/api/generate-scenario", async (req, res) => {
  try {
    const { extras } = req.body || {};
    const instructions = process.env.SCENARIO_PROMPT || "간호학생용 임상 시나리오를 생성한다. 한국어로 작성하며 실명/기관명 금지.";
    const input = buildScenarioInput(extras);

    const r = await client.responses.create({
      model: "gpt-4o-mini",
      instructions,          // .env 프롬프트(시스템 지침) 우선
      input
    });
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

    const instructions = process.env.PATIENT_GUIDE_PROMPT
      || "당신은 가상의 환자다. 한국어로만 답하고 시나리오 설정을 벗어나지 말 것. 안전/윤리/개인정보 수칙 준수.";
    const input = buildPatientInput({ scenario, history, userMessage: message });

    const r = await client.responses.create({
      model: "gpt-4o-mini",
      instructions,          // .env 프롬프트(시스템 지침) 우선
      input
    });
    res.json({ reply: r.output_text || "" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server_error" });
  }
});

// (C) 디브리핑 (Kalamazoo 24문항 — 범주형)
app.post("/api/debrief", async (req, res) => {
  try {
    const { student, scenario, history = [] } = req.body || {};

    const instructions =
      process.env.DEBRIEF_PROMPT ||
      "Kalamazoo 24문항을 4개 범주(Done well, Needs improvements, Not done, Not applicable)로만 평가하라. JSON만 출력. 점수 금지.";
    const input = buildDebriefInputKalamazoo({ student, scenario, history });

    const r = await client.responses.create({
      model: "gpt-4o-mini",
      instructions,          // .env 프롬프트(시스템 지침) 우선
      input
    });

    let report = safeParseJsonFromText(r.output_text || "");
    if (!report || !Array.isArray(report.items)) {
      return res.status(500).json({ error: "invalid_format" });
    }

    // ---- 정규화 & 강제 규칙 & 집계 ----
    const ALLOWED = {
      "done well": "Done well",
      "needs improvements": "Needs improvements",
      "not done": "Not done",
      "not applicable": "Not applicable",
      "1": "Done well",
      "2": "Needs improvements",
      "3": "Not done",
      "4": "Not applicable",
    };
    const norm = (v) => {
      if (!v) return "Not applicable";
      const k = String(v).trim().toLowerCase();
      return ALLOWED[k] || "Not applicable";
    };

    const SECTIONS = {
      A: "Builds a Relationship",
      B: "Opens the Discussion",
      C: "Gathers Information",
      D: "Understands the Patient’s Perspective",
      E: "Shares Information",
      F: "Reaches Agreement",
      G: "Provides Closure"
    };
    const inferSection = (id) => {
      if (id <= 3) return "A";
      if (id <= 6) return "B";
      if (id <= 10) return "C";
      if (id <= 13) return "D";
      if (id <= 17) return "E";
      if (id <= 20) return "F";
      return "G"; // 21~24
    };

    // 아이템 정리 + 3,4번 강제 NA
    report.items = report.items
      .filter(it => it && it.id >= 1 && it.id <= 24)
      .map(it => {
        const forcedNA = (it.id === 3 || it.id === 4) ? "Not applicable" : null;
        return {
          id: it.id,
          section: it.section || inferSection(it.id),
          label: it.label,
          category: forcedNA ? forcedNA : norm(it.category),
          comment: it.comment || ""
        };
      });

    // 분포 집계
    const CAT_LIST = ["Done well", "Needs improvements", "Not done", "Not applicable"];
    const byCategory = { "Done well":0, "Needs improvements":0, "Not done":0, "Not applicable":0 };
    const bySection = {};
    for (const s of Object.keys(SECTIONS)) {
      bySection[s] = { "Done well":0, "Needs improvements":0, "Not done":0, "Not applicable":0 };
    }

    for (const it of report.items) {
      if (!CAT_LIST.includes(it.category)) it.category = "Not applicable";
      byCategory[it.category] += 1;
      bySection[it.section][it.category] += 1;
    }

    report.totals = {
      byCategory,
      bySection,
      sectionLabels: SECTIONS
    };

    res.json({ report });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "debrief_failed" });
  }
});

// (D) 학생 세션 저장 (report 포함 저장)
app.post("/api/transcript", (req, res) => {
  try {
    const { student = {}, scenario, history = [], report = null } = req.body || {};
    if (!scenario || !history.length) {
      return res.status(400).json({ ok: false, error: "scenario and history required" });
    }
    const list = readTranscripts();
    const item = {
      id: String(Date.now()),
      student: { id: student?.id || "", name: student?.name || "" },
      scenario,
      history,
      report,  // ← 평가 결과 저장
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
  const mask = (v) => v ? { length: v.length, head: v.slice(0, 80) } : null;
  res.json({
    scenario: mask(process.env.SCENARIO_PROMPT),
    patient:  mask(process.env.PATIENT_GUIDE_PROMPT),
    debrief:  mask(process.env.DEBRIEF_PROMPT)
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
