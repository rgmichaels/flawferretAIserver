import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
const port = process.env.PORT || 8787;
const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
const openaiApiKey = process.env.OPENAI_API_KEY;
const serverBaseUrl = process.env.SERVER_BASE_URL || `http://localhost:${port}`;

if (!openaiApiKey) {
  console.warn("OPENAI_API_KEY is not set. Requests will fail.");
}

const client = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "FlawFerret AI Server API",
    version: "1.0.0",
    description:
      "API for health checks and AI-driven scenario generation using OpenAI or Ollama.",
  },
  servers: [{ url: serverBaseUrl }],
  paths: {
    "/health": {
      get: {
        summary: "Health check",
        operationId: "getHealth",
        responses: {
          200: {
            description: "Server is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                  },
                  required: ["ok"],
                },
              },
            },
          },
        },
      },
    },
    "/generate-scenario": {
      post: {
        summary: "Generate feature scenario or bug report text",
        operationId: "generateScenario",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/GenerateScenarioRequest",
              },
            },
          },
        },
        responses: {
          200: {
            description: "Scenario generated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    scenario: { type: "string" },
                  },
                  required: ["ok", "scenario"],
                },
              },
            },
          },
          500: {
            description: "Generation failed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          503: {
            description: "OpenAI not configured",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      GenerateScenarioRequest: {
        type: "object",
        properties: {
          url: { type: "string", example: "https://example.com" },
          title: { type: "string", example: "Pricing" },
          elementKey: { type: "string", example: "link-start-trial" },
          role: { type: "string", example: "link" },
          name: { type: "string", example: "Start free trial" },
          selectedText: { type: "string", example: "Start free trial" },
          imageName: { type: "string", example: "" },
          outerHTML: { type: "string", example: "<a>Start free trial</a>" },
          thenLine: {
            type: "string",
            example: 'Then the link "Start free trial" should be visible',
          },
          issueType: {
            type: "string",
            enum: ["Feature", "Bug"],
            default: "Feature",
          },
          provider: {
            type: "string",
            enum: ["openai", "ollama"],
            default: "openai",
          },
          model: { type: "string", example: "tinyllama:latest" },
          ollamaUrl: {
            type: "string",
            example: "http://host.docker.internal:11434",
          },
        },
      },
      ErrorResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: false },
          error: { type: "string", example: "fetch failed" },
        },
        required: ["ok", "error"],
      },
    },
  },
};

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/openapi.json", (_req, res) => {
  res.json(openApiSpec);
});

app.get("/docs", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>FlawFerret AI API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true
      });
    </script>
  </body>
</html>`);
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
      'Given I am on the "<PAGE_TITLE>" page',
      'And the link "<LINK_NAME>" is expected to be visible',
      'When I inspect the page content for "<SELECTED_TEXT_OR_CONTEXT>"',
      'Then the link "<LINK_NAME>" should be visible',
      'And elements with role "<ROLE_OR_link>" should be visible',
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
