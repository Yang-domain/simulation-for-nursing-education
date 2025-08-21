// server.js
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

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ----- 경로/파일 설정 -----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.join(__dirname, "transcripts.json");

// ✅ 정적 파일 서빙 (index.html, script.js, styles.css)
app.use(express.static(__dirname));

// 루트 요청 시 index.html 보내기
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ----- 시나리오 생성 API -----
app.post("/api/generate-scenario", async (req, res) => {
  try {
    const userPrompt = req.body.prompt || "기본 프롬프트";

    const response = await client.responses.create({
      model: "gpt-4.1",
      input: [
        { role: "system", content: process.env.SCENARIO_PROMPT },
        { role: "user", content: userPrompt }
      ]
    });

    res.json({ text: response.output[0].content[0].text });
  } catch (error) {
    console.error("❌ generate-scenario error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ----- 채팅 API -----
app.post("/api/chat", async (req, res) => {
  try {
    const userMessage = req.body.message || "기본 메시지";

    const response = await client.responses.create({
      model: "gpt-4.1",
      input: [
        { role: "system", content: process.env.CHAT_PROMPT },
        { role: "user", content: userMessage }
      ]
    });

    res.json({ text: response.output[0].content[0].text });
  } catch (error) {
    console.error("❌ chat error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ----- 디브리핑 API -----
app.post("/api/debrief", async (req, res) => {
  try {
    const transcript = req.body.transcript || "대화 기록 없음";

    const response = await client.responses.create({
      model: "gpt-4.1",
      input: [
        { role: "system", content: process.env.DEBRIEF_PROMPT },
        { role: "user", content: transcript }
      ]
    });

    res.json({ text: response.output[0].content[0].text });
  } catch (error) {
    console.error("❌ debrief error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ----- JSON 저장/로드 -----
app.post("/api/save-transcript", (req, res) => {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.error("❌ save-transcript error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/load-transcript", (req, res) => {
  try {
    if (!fs.existsSync(DATA_PATH)) {
      return res.json({ transcript: [] });
    }
    const data = fs.readFileSync(DATA_PATH, "utf-8");
    res.json(JSON.parse(data));
  } catch (error) {
    console.error("❌ load-transcript error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ----- 서버 실행 -----
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
