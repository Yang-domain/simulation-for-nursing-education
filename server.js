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

// ----- 경로/파일 설정 -----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.join(__dirname, "transcripts.json");

// ----- OpenAI 설정 -----
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ----- 유틸 함수 -----
function buildScenarioInput(extras) {
  return `시나리오를 생성하라. 참고 정보: ${JSON.stringify(extras)}`;
}

function buildPatientInput({ scenario, history, userMessage }) {
  return `현재 시나리오: ${scenario}\n대화 이력: ${JSON.stringify(
    history
  )}\n학생 발화: ${userMessage}`;
}

function buildDebriefInputKalamazoo({ student, scenario, history }) {
  return `학생: ${student}\n시나리오: ${scenario}\n대화 이력: ${JSON.stringify(
    history
  )}\n칼라마주 체크리스트 평가를 수행하라.`;
}

// ----- API 엔드포인트 -----

// 1) 시나리오 생성
app.post("/api/generate-scenario", async (req, res) => {
  try {
    const { extras } = req.body;

    const r = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: process.env.SCENARIO_PROMPT },
        { role: "user", content: buildScenarioInput(extras) },
      ],
    });

    res.json({ output: r.output_text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 2) 환자 시뮬레이션 대화
app.post("/api/chat", async (req, res) => {
  try {
    const { scenario, history, message } = req.body;

    const r = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: process.env.PATIENT_GUIDE_PROMPT },
        {
          role: "user",
          content: buildPatientInput({ scenario, history, userMessage: message }),
        },
      ],
    });

    res.json({ output: r.output_text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 3) 디브리핑 평가
app.post("/api/debrief", async (req, res) => {
  try {
    const { student, scenario, history } = req.body;

    const r = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: process.env.DEBRIEF_PROMPT },
        {
          role: "user",
          content: buildDebriefInputKalamazoo({ student, scenario, history }),
        },
      ],
    });

    res.json({ output: r.output_text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ----- 정적 파일 서빙 (GitHub Pages는 따로 배포하므로 여기선 불필요할 수도 있음) -----
app.use(express.static(__dirname));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ----- 서버 실행 -----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
