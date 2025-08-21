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
const DEBRIEF_PROMPT =
  process.env.DEBRIEF_PROMPT ||
  "간호학생과 환자의 대화 내용을 Kalamazoo 의사소통 평가도구 기준으로 JSON으로 평가해줘.";

//  API: 시나리오 생성
app.post("/api/generate-scenario", async (req, res) => {
  try {
    const SCENARIO_PROMPT = process.env.SCENARIO_PROMPT;
    if (!SCENARIO_PROMPT) {
      throw new Error("환경변수 SCENARIO_PROMPT가 설정되지 않았습니다.");
    }

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SCENARIO_PROMPT }
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
      // 🔹 강력한 규칙 (system role)
      {
        role: "system",
        content: `
너는 환자 역할을 한다. 반드시 다음 규칙을 지켜라.

[일반 지침]
- 시나리오에서 벗어나지 말 것
- 학생이 묻는 질문에만 답할 것
- 한 번에 2문장 이내로만 말할 것
- 의학 용어 대신 일상적인 표현만 사용할 것

[대화 규칙]
1. 상대방이 인사만 하면 → 간단히 인사만 답한다
2. 상대방이 이름을 물으면 → 이름만 말한다
3. 절대로 새로운 질문을 하지 않는다
4. 상대방이 묻지 않은 정보는 말하지 않는다
`
      },

      // 🔹 시나리오 정보 (참고용 → user role로 변경)
      {
        role: "user",
        content: `배경 시나리오 정보입니다. 참고만 하세요: ${scenario}`
      },

      // 🔹 이전 대화 히스토리
      ...history.map(h => ({
        role: h.who === "학생" ? "user" : "assistant",
        content: h.text
      })),

      // 🔹 새 입력된 학생 메시지
      { role: "user", content: message }
    ];

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      // 🔹 출력 형식 강제 (JSON, reply 키만 허용)
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "patient_reply",
          schema: {
            type: "object",
            properties: {
              reply: { type: "string" }
            },
            required: ["reply"],
            additionalProperties: false
          }
        }
      }
    });

    // 🔹 모델 출력(JSON) 파싱
    const content = completion.choices[0].message.content;
    const parsed = JSON.parse(content);

    res.json({ reply: parsed.reply });
  } catch (err) {
    console.error("채팅 오류:", err);
    res.status(500).json({ error: "채팅 실패" });
  }
});


//  API: 디브리핑
app.post("/api/debrief", async (req, res) => {
  try {
    const { student, scenario, history } = req.body;
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: DEBRIEF_PROMPT },
        {
          role: "user",
          content: `학생: ${JSON.stringify(student)}\n시나리오: ${JSON.stringify(
            scenario
          )}\n대화 기록: ${JSON.stringify(history)}`
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

//  API: 기록 저장
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

//  API: 기록 불러오기
app.get("/api/transcripts", (req, res) => {
  if (!fs.existsSync(DATA_PATH)) return res.json([]);
  const transcripts = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  res.json(transcripts);
});

app.get("/api/transcripts/:id", (req, res) => {
  if (!fs.existsSync(DATA_PATH))
    return res.status(404).json({ error: "없음" });
  const transcripts = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const item = transcripts.find(t => t.id === req.params.id);
  if (!item) return res.status(404).json({ error: "없음" });
  res.json(item);
});

// ----- 서버 실행 -----
//  Render는 반드시 process.env.PORT 사용해야 함
const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
