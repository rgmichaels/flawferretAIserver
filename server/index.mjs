import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
const port = process.env.PORT || 8787;
const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!openaiApiKey) {
  console.warn("OPENAI_API_KEY is not set. Requests will fail.");
}

const client = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/generate-scenario", async (req, res) => {
  try {
    const payload = req.body || {};
    const {
      url,
      title,
      elementKey,
      role,
      name,
      selectedText,
      imageName,
      outerHTML,
      thenLine,
      issueType,
      provider,
      model: requestModel,
      ollamaUrl,
    } = payload;

    const system = [
      "You are a test authoring assistant.",
      "If issue type is Feature, return only valid Gherkin (Feature + Scenario).",
      "If issue type is Bug, return a short bug report template, not Gherkin.",
      "For Bug output, use this exact format (blank lines between sections):",
      "Bug Summary: ...",
      "",
      "Observed: ...",
      "",
      "Expected: ...",
      "",
      "Steps to Reproduce:",
      "1. ...",
      "2. ...",
      "3. ...",
      "No backticks, no markdown, no prose outside the requested format.",
    ].join(" ");

    const user = [
      `URL: ${url || ""}`,
      `Title: ${title || ""}`,
      `Element key: ${elementKey || ""}`,
      `Role: ${role || ""}`,
      `Accessible name: ${name || ""}`,
      `Selected text: ${selectedText || ""}`,
      `Image name: ${imageName || ""}`,
      `Outer HTML: ${outerHTML || ""}`,
      `Suggested Then: ${thenLine || ""}`,
      `Issue type: ${issueType || "Feature"}`,
      "Instruction: For Feature, write a full Scenario using the page title for Given when possible.",
      "If selected text exists, use it in a Then step.",
      "If role is link and name exists, use 'Then the link \"...\" should be visible'.",
      "If image name exists, use 'Then the image \"...\" should be visible'.",
      "For Bug, infer a likely issue from the selected text/element or leave a stub in the template.",
    ].join("\n");

    let text = "";
    if ((provider || "openai") === "ollama") {
      const ollamaBase = (ollamaUrl || "http://localhost:11434").replace(/\/+$/, "");
      const ollamaModel = requestModel || "codellama";
      const prompt = `${system}\\n\\n${user}`;

      const ollamaResp = await fetch(`${ollamaBase}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaModel,
          prompt,
          stream: false,
        }),
      });
      if (!ollamaResp.ok) {
        const detail = await ollamaResp.text();
        res.status(500).json({ ok: false, error: detail || "Ollama error" });
        return;
      }
      const data = await ollamaResp.json();
      text = (data.response || "").trim();
    } else {
      if (!client) {
        res.status(503).json({
          ok: false,
          error:
            "OpenAI is not configured. Set OPENAI_API_KEY or use provider=ollama.",
        });
        return;
      }

      const response = await client.responses.create({
        model: requestModel || model,
        input: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      text = response.output_text?.trim();
    }

    if (!text) {
      res.status(500).json({ ok: false, error: "Empty response" });
      return;
    }

    res.json({ ok: true, scenario: text });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || String(error) });
  }
});

app.listen(port, () => {
  console.log(`AI server running on http://localhost:${port}`);
});
