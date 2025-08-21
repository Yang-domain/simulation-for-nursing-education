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
const DEBRIEF_PROMPT = process.env.DEBRIEF_PROMPT || "의사소통 디브리핑을 요약해줘.";

// ✅ API: 시나리오 생성
app.post("/api/generate-scenario", async (req, res) => {
  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: "간호학 시뮬레이션 시나리오를 생성해줘." }],
    });
    res.json({ scenario: completion.choices[0].message.content });
  } catch (err) {
    console.error("시나리오 오류:", err);
    res.status(500).json({ error: "시나리오 생성 실패" });
  }
});

// ✅ API: 채팅
app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: message }],
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
    const { history } = req.body; // 학생과 환자의 대화 기록 전달
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: DEBRIEF_PROMPT },
        { role: "user", content: `다음은 학생과 환자의 대화 기록이다: ${JSON.stringify(history)}` }
      ],
      response_format: { type: "json_object" }
    });

    const report = JSON.parse(completion.choices[0].message.content);
    res.json({ report });
  } catch (err) {
    console.error("디브리핑 오류:", err);
    res.status(500).json({ error: "디브리핑 실패" });
  }
});

// ✅ API: 기록 저장
app.post("/api/transcript", (req, res) => {
  const { title, content } = req.body;
  let transcripts = [];
  if (fs.existsSync(DATA_PATH)) {
    transcripts = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  }
  const newT = { title, content };
  transcripts.push(newT);
  fs.writeFileSync(DATA_PATH, JSON.stringify(transcripts, null, 2));
  res.json({ message: "저장 완료!" });
});

// ✅ API: 기록 불러오기
app.get("/api/transcripts", (req, res) => {
  if (!fs.existsSync(DATA_PATH)) return res.json([]);
  const transcripts = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  res.json(transcripts);
});

// ----- 서버 실행 -----
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
