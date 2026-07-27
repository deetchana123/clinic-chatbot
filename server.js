const db = require("./db");
require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const CHAT_PROVIDER = (process.env.CHAT_PROVIDER || "anthropic").toLowerCase();
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";

const isAnthropicCreditError = (error) => {
  return (
    error?.type === "invalid_request_error" &&
    typeof error?.message === "string" &&
    error.message.toLowerCase().includes("credit balance")
  );
};

const buildOfflineFallbackReply = (messages = []) => {
  const lastUserMessage =
    [...messages]
      .reverse()
      .find((message) => message?.role !== "assistant")?.content || "";

  const text = String(lastUserMessage).toLowerCase();

  if (/(hello|hi|hey|good morning|good evening|greeting|namaste)/i.test(text)) {
    return "Hello! I can help with clinic timings, contact details, directions, token registration, payment info, and diabetes guidance. For direct assistance, call 2343 2345.";
  }

  if (/(phone|contact|call|landline|telephone|whatsapp|mobile)/i.test(text) && !/(token|ticket|appointment|queue|book|register)/i.test(text)) {
    return "Clinic landline: 2343 2345. WhatsApp / clinic contact: 9498633892.";
  }

  if (/(tim|hour|open|close|morning|evening|lunch)/i.test(text)) {
    return "Clinic hours: 9:00 AM–12:00 PM, lunch 12:00 PM–2:00 PM, and 2:00 PM–6:00 PM. Please call 2343 2345 to confirm before visiting.";
  }

  if (/(locat|address|where|map|route|reach|near)/i.test(text)) {
    return "The clinic is on Gandhi Road, Kallakurichi, near Chinnasalem. Phone: 2343 2345. Use the map link for directions.";
  }

  if (/(pay|cash|gpay|upi|payment)/i.test(text)) {
    return "Payment is cash only. GPay and UPI are not accepted at the clinic. Please bring enough cash.";
  }

  if (/(token|ticket|appointment|queue|book)/i.test(text)) {
    return "Tap the Get Token button at the bottom-left, then enter your name, age, gender, phone number, visit reason, and preferred session. Your token will be generated immediately.";
  }

  if (/(diabet|sugar|blood sugar|glucose)/i.test(text)) {
    return "For diabetes questions, the clinic can provide general advice and follow-up guidance. For diagnosis or treatment, please visit the clinic and speak with the doctor.";
  }

  if (/(thanks|thank you|okay|fine|good)/i.test(text)) {
    return "You’re welcome. I can help with timings, contact details, directions, token registration, payment info, or diabetes questions.";
  }

  if (/(how are you|what can you do|what do you do|help)/i.test(text)) {
    return "I’m here to help with clinic timings, contact details, directions, token registration, Diabetes guidance, and general checkup questions. If you need direct help, call 2343 2345.";
  }

  const fallbackVariants = [
    "I can help with clinic timings, directions, token registration, diabetes guidance, and general checkup information. Call 2343 2345 if you need direct support.",
    "I’m your clinic assistant. You can ask me about opening hours, directions, the clinic phone number, token registration, or diabetes care.",
    "For clinic help, I can answer questions about timings, address, payment method, token number, and general diabetes guidance. Please call 2343 2345 for immediate assistance.",
    "I can guide you on clinic timings, location, patient token registration, and basic diabetes-related questions. Call 2343 2345 for quick direct help."
  ];

  const variantIndex = Math.abs(
    [...text].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  ) % fallbackVariants.length;

  return fallbackVariants[variantIndex];
};

const MODEL = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const isOllamaModelMissingError = (error) => {
  const reason = String(error?.message || error?.details || "").toLowerCase();
  return error?.status === 404 || reason.includes("model") && reason.includes("not found");
};

async function callOllama(messages, system) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: system || "You are a helpful hospital assistant." },
        ...messages.map((message) => ({
          role: message.role === "assistant" ? "assistant" : "user",
          content: String(message.content || ""),
        })),
      ],
    }),
  });

  const bodyText = await response.text();
  let data;

  try {
    data = JSON.parse(bodyText);
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error = new Error(
      data?.error || `Ollama request failed with status ${response.status}`
    );
    error.status = response.status;
    error.details = data?.error || bodyText;
    throw error;
  }

  const reply = data?.message?.content || data?.content || "";

  if (!reply) {
    throw new Error("Ollama returned an empty response.");
  }

  return reply;
}

async function callAnthropic(messages, system) {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: system || "You are a helpful hospital assistant.",
    messages,
  });

  if (typeof response.content === "string") {
    return response.content || "No response";
  }

  if (Array.isArray(response.content)) {
    return (
      response.content
        .filter((item) => item.type === "text")
        .map((item) => item.text)
        .join("\n") || "No response"
    );
  }

  return String(response.content || "No response");
}

app.post("/api/chat", async (req, res) => {
  const { messages, system } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: "Messages array is required and must contain at least one message.",
    });
  }

  const lastMessage = String(messages[messages.length - 1]?.content || "").toLowerCase();

  try {

    if (CHAT_PROVIDER === "ollama") {
      if (lastMessage.includes("doctor") || lastMessage.includes("diabetologist")) {
        return db.query("SELECT * FROM doctors", (err, results) => {
          if (err) {
            return res.status(500).json({
              error: "Database query failed.",
              reply: "Sorry, I could not retrieve doctor information right now.",
            });
          }

          if (!Array.isArray(results) || results.length === 0) {
            return res.json({
              reply: "Our doctor schedule is currently unavailable. Please call 2343 2345 for doctor availability.",
              provider: "database",
            });
          }

          const answer = results
            .map(
              (doctor) =>
                `${doctor.name} - ${doctor.specialization}\nAvailable: ${doctor.available_days}`
            )
            .join("\n\n");

          return res.json({ reply: answer, provider: "database" });
        });
      }

      try {
        const reply = await callOllama(messages, system);
        return res.json({ reply, provider: "ollama" });
      } catch (error) {
        if (isOllamaModelMissingError(error) && process.env.ANTHROPIC_API_KEY) {
          console.warn(
            `Ollama model ${OLLAMA_MODEL} was not found at ${OLLAMA_BASE_URL}; falling back to Anthropic.`
          );

          const reply = await callAnthropic(messages, system);
          return res.json({
            reply,
            provider: "anthropic",
            fallback: "ollama-model-missing",
          });
        }

        throw error;
      }
    }

    const reply = await callAnthropic(messages, system);
    return res.json({ reply, provider: "anthropic" });
  } catch (error) {
    console.error("Claude Error:");
    console.error(error);

    const offlineReply = buildOfflineFallbackReply(messages);

    if (CHAT_PROVIDER === "ollama" && (error?.status === 404 || error?.status === 503)) {
      return res.status(200).json({
        reply: offlineReply,
        provider: "offline",
        note: `Ollama is not available at ${OLLAMA_BASE_URL}.`,
      });
    }

    if (isAnthropicCreditError(error)) {
      return res.status(200).json({
        reply: offlineReply,
        provider: "offline",
        note: "Anthropic billing credit is unavailable.",
      });
    }

    return res.status(200).json({
      reply: offlineReply,
      provider: "offline",
      note: "The chat service encountered an error.",
    });
  }
});
app.get("/api/doctors", (req, res) => {

    db.query("SELECT * FROM doctors", (err, results) => {

        if (err) {
            return res.status(500).json(err);
        }

        res.json(results);

    });

});
const PORT = Number(process.env.PORT || 3000);

const server = app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Stop the old Node process and try again, or start on another port with PORT=3003.`);
    process.exit(1);
  }

  throw error;
});