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
      "You are a strict test authoring assistant.",
      "Return plain text only. No markdown, no backticks.",
      "If issue type is Feature, output only valid Gherkin with one Feature and one Scenario.",
      "For Feature output, always include:",
      "- Given step with page title context.",
      "- Given step saying a specific link is expected to be visible.",
      "- Then step checking a visible link by exact name when available.",
      "- Then step checking visible elements by role when name is missing.",
      "Use this exact Feature template shape:",
      "Feature: Link visibility on titled page",
      "",
      "Scenario: Verify page title context and link visibility",
      "Given I am on the \"<PAGE_TITLE>\" page",
      "And the link \"<LINK_NAME>\" is expected to be visible",
      "When I inspect the page content for \"<SELECTED_TEXT_OR_CONTEXT>\"",
      "Then the link \"<LINK_NAME>\" should be visible",
      "And elements with role \"<ROLE_OR_link>\" should be visible",
      "",
      "If issue type is Bug, output only this exact bug template format:",
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
      "For Bug, infer an issue from selected text/element/html/title, or use 'Issue not enough detail provided'.",
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
      "Authoring rules:",
      "- Use the provided page title in the Given step when available; otherwise use 'current page'.",
      "- Use accessible name as LINK_NAME when available.",
      "- If accessible name is empty and selected text exists, use selected text as LINK_NAME.",
      "- If both are empty, use 'target link' as LINK_NAME.",
      "- For ROLE_OR_link use provided role when available; otherwise use 'link'.",
      "- SELECTED_TEXT_OR_CONTEXT should use selected text first, then element key, then URL, else 'page context'.",
      "- For Bug output, infer issue details from provided fields or use the stub text exactly when data is weak.",
    ].join("\n");

    let text = "";
    if ((provider || "openai") === "ollama") {
      const ollamaBase = (ollamaUrl || "http://localhost:11434").replace(/\/+$/, "");
      const ollamaModel = requestModel || "codellama";
      const prompt = `${system}\n\n${user}`;

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
