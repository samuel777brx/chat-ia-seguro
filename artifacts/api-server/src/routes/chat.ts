import { Router, type IRouter } from "express";
import { GoogleGenAI } from "@google/genai";
import { SendChatMessageBody } from "@workspace/api-zod";
import { db, conversationsTable, messagesTable } from "@workspace/db";

const router: IRouter = Router();

const SYSTEM_INSTRUCTION =
  "Ajude a criar prompts claros em português do Brasil. Transforme ideias vagas em comandos prontos para copiar, com resposta curta, prática e acolhedora.";

function sendEvent(res: Parameters<Parameters<IRouter["post"]>[1]>[1], payload: unknown) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

router.post("/chat", async (req, res) => {
  const parsed = SendChatMessageBody.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "Envie uma lista válida de mensagens." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "A integração com a IA ainda não foi configurada." });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  sendEvent(res, { status: "thinking" });

  let closed = false;
  let fullResponse = "";
  res.on("close", () => {
    closed = true;
  });
  req.on("aborted", () => {
    closed = true;
  });

  try {
    await db
      .insert(conversationsTable)
      .values({ id: parsed.data.conversationId })
      .onConflictDoNothing();
    await db.insert(messagesTable).values({
      conversationId: parsed.data.conversationId,
      role: "user",
      content: parsed.data.messages[parsed.data.messages.length - 1].content,
    });

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: parsed.data.messages.slice(-12).map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        maxOutputTokens: 2048,
      },
    });
    if (closed) return;
    fullResponse = response.text ?? "";
    if (fullResponse) sendEvent(res, { content: fullResponse });

    if (!closed) {
      if (fullResponse) {
        await db.insert(messagesTable).values({
          conversationId: parsed.data.conversationId,
          role: "assistant",
          content: fullResponse,
        });
      }
      sendEvent(res, { done: true });
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Gemini chat request failed");
    if (!closed) {
      sendEvent(res, { error: "Não consegui gerar uma resposta agora. Tente novamente." });
      res.end();
    }
  }
});

export default router;