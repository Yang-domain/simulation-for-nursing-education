// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ----- 경로 설정 -----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.join(__dirname, "transcripts.json");

// ----- 정적 파일 제공 (프론트엔드) -----
app.use(express.static(__dirname));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ----- OpenAI 설정 -----
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 환경변수에서 디브리핑 프롬프트 불러오기
const DEBRIEF_PROMPT = process.env.DEBRIEF_PROMPT || "간호학생과 환자의 대화 내용을 Kalamazoo 의사소통 평가도구 기준으로 JSON으로 평가해줘.";

// ✅ API: 시나리오 생성
app.post("/api/generate-scenario", async (req, res) => {
  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "너는 간호학 교육 전문가다. 임상 시뮬레이션 학습용 시나리오를 JSON으로 생성해라."
        },
        {
          role: "user",
          content: `다음 형식으로 출력해줘:
{
  "title": "시나리오 제목",
  "text": "상황 설명",
  "goal": "학습 목표"
}`
        }
      ],
      response_format: { type: "json_object" }
    });

    const scenario = JSON.parse(completion.choices[0].message.content);
    res.json({ scenario });
  } catch (err) {
    console.error("시나리오 오류:", err);
    res.status(500).json({ error: "시나리오 생성 실패" });
  }
});

// ✅ API: 채팅
app.post("/api/chat", async (req, res) => {
  try {
    const { scenario, history, message } = req.body;

    const messages = [
      {
        role: "system",
        content: `너는 가상의 환자 역할을 수행한다. 아래 시나리오에 맞춰 환자처럼 대답해라.\n\n${scenario}`
      },
      ...history.map(h => ({
        role: h.who === "학생" ? "user" : "assistant",
        content: h.text
      })),
      { role: "user", content: message }
    ];

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages
    });

    res.json({ reply: completion.choices[0].message.content });
  } catch (err) {
    console.error("채팅 오류:", err);
    res.status(500).json({ error: "채팅 실패" });
  }
});

// ✅ API: 디브리핑
app.post("/api/debrief", async (req, res) => {
  try {
    const { student, scenario, history } = req.body;
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: DEBRIEF_PROMPT },
        {
          role: "user",
          content: `학생: ${JSON.stringify(student)}\n시나리오: ${JSON.stringify(scenario)}\n대화 기록: ${JSON.stringify(history)}`
        }
      ],
      response_format: { type: "json_object" }
    });

    let report = {};
    try {
      report = JSON.parse(completion.choices[0].message.content);
    } catch {
      report = { summary: completion.choices[0].message.content };
    }

    res.json({ report });
  } catch (err) {
    console.error("디브리핑 오류:", err);
    res.status(500).json({ error: "디브리핑 실패" });
  }
});

// ✅ API: 기록 저장
app.post("/api/transcript", (req, res) => {
  const { student, scenario, history, report } = req.body;
  let transcripts = [];
  if (fs.existsSync(DATA_PATH)) {
    transcripts = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  }

  const newT = {
    id: Date.now().toString(),
    student,
    scenario,
    history,
    report,
    savedAt: new Date().toISOString()
  };

  transcripts.push(newT);
  fs.writeFileSync(DATA_PATH, JSON.stringify(transcripts, null, 2));
  res.json({ ok: true });
});

// ✅ API: 기록 불러오기
app.get("/api/transcripts", (req, res) => {
  if (!fs.existsSync(DATA_PATH)) return res.json([]);
  const transcripts = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  res.json(transcripts);
});

app.get("/api/transcripts/:id", (req, res) => {
  if (!fs.existsSync(DATA_PATH)) return res.status(404).json({ error: "없음" });
  const transcripts = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const item = transcripts.find(t => t.id === req.params.id);
  if (!item) return res.status(404).json({ error: "없음" });
  res.json(item);
});

// ----- 서버 실행 -----
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
