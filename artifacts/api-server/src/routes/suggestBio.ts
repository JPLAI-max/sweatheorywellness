import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

router.post("/users/suggest-bio", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { interests } = req.body as { interests?: string[] };

  const interestList = Array.isArray(interests) && interests.length > 0
    ? interests
    : (Array.isArray(user.interests) ? user.interests : []);

  const prompt = interestList.length > 0
    ? `Write a short, punchy social media bio (max 2 sentences, under 150 characters) for an adult content creator whose interests include: ${interestList.join(", ")}. Make it confident, fun, and on-brand. Just return the bio text, nothing else.`
    : `Write a short, punchy social media bio (max 2 sentences, under 150 characters) for an adult content creator. Make it confident and intriguing. Just return the bio text, nothing else.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    const bio = response.choices[0]?.message?.content?.trim() ?? "";
    res.json({ bio });
  } catch (err) {
    req.log.error({ err }, "suggest-bio failed");
    res.status(500).json({ error: "Failed to generate suggestion" });
  }
});

export default router;
