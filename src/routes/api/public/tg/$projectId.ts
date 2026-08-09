import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";
import { createOpenRouterProvider, getOpenRouterModelId } from "@/lib/openrouter.server";
import { tgSendChatAction, tgSendMessage, webhookSecret } from "@/lib/telegram.server";
import { getSql } from "@/lib/db";
import { z } from "zod";
import { makeLocalSupabase } from "@/lib/local-supabase";

const tgMessageSchema = z.object({
  chat: z.object({ id: z.number() }).partial().optional(),
  text: z.string().max(8000).optional(),
  from: z.object({ first_name: z.string().optional() }).partial().optional(),
});

const telegramUpdateSchema = z.object({
  update_id: z.number().optional(),
  message: tgMessageSchema.optional(),
  edited_message: tgMessageSchema.optional(),
});

const botSchema = z.object({
  id: z.string(),
  token: z.string().min(10),
  persona: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  enabled: z.boolean().nullable().optional(),
  project_id: z.string(),
});

const historySchema = z
  .object({ role: z.string().nullable(), text: z.string().nullable() })
  .array();

/** مقارنة ثابتة الزمن لسر الويبهوك. */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** نقطة استقبال رسائل تيليغرام لكل مشروع: /api/public/tg/<projectId> */
export const Route = createFileRoute("/api/public/tg/$projectId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const sql = getSql();
        const supabase = makeLocalSupabase(sql, "service");

        const { data: botRow } = await supabase
          .from("bots")
          .select("id, token, persona, model, enabled, project_id")
          .eq("project_id", params.projectId)
          .eq("platform", "telegram")
          .maybeSingle();

        const parsedBot = botSchema.safeParse(botRow);
        if (!parsedBot.success) return new Response("Not found", { status: 404 });
        const bot = parsedBot.data;

        const expected = await webhookSecret(bot.token);
        const provided = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(provided, expected)) return new Response("Unauthorized", { status: 401 });

        const parsedUpdate = telegramUpdateSchema.safeParse(await request.json().catch(() => null));
        if (!parsedUpdate.success) return Response.json({ ok: true, ignored: true });
        const update = parsedUpdate.data;
        const message = update.message ?? update.edited_message;
        const chatId = message?.chat?.id;
        const text = message?.text?.trim();
        if (!chatId || !text) return Response.json({ ok: true, ignored: true });

        await supabase.from("bot_messages").upsert(
          {
            bot_id: bot.id,
            project_id: bot.project_id,
            update_id: update.update_id ?? null,
            chat_id: chatId,
            role: "user",
            text,
            raw: JSON.parse(JSON.stringify(update)),
          },
          { onConflict: "bot_id,update_id" },
        );

        if (!bot.enabled) return Response.json({ ok: true, disabled: true });

        const key = process.env["OPENROUTER_API_KEY"];
        if (!key) return Response.json({ ok: true, error: "no model key" });

        try {
          await tgSendChatAction(bot.token, chatId);

          // آخر 10 رسائل من نفس المحادثة كسياق
          const { data: history } = await supabase
            .from("bot_messages")
            .select("role, text")
            .eq("bot_id", bot.id)
            .eq("chat_id", chatId)
            .order("created_at", { ascending: false })
            .limit(10);

          const context = (historySchema.safeParse(history ?? []).data ?? [])
            .reverse()
            .map((row) => ({
              role: row.role === "assistant" ? ("assistant" as const) : ("user" as const),
              content: row.text ?? "",
            }))
            .filter((m) => m.content);

          const openrouter = createOpenRouterProvider(key, new URL(request.url).origin);
          const { text: reply } = await generateText({
            model: openrouter(bot.model ?? getOpenRouterModelId()),
            system:
              (bot.persona ?? "أنت مساعد ودود ومفيد على تيليغرام.") +
              "\n\nقواعد: أجب بالعربية ما لم يكتب المستخدم بلغة أخرى، اجعل الرد قصيراً ومباشراً (أقل من 1500 حرف)، واستخدم HTML بسيط فقط (<b>, <i>, <code>, <a>) دون Markdown.",
            messages: context.length > 0 ? context : [{ role: "user", content: text }],
            maxOutputTokens: 1200,
          });

          const answer = reply.trim() || "لم أفهم الطلب، حاول صياغته بشكل آخر.";
          await tgSendMessage(bot.token, chatId, answer);
          await supabase.from("bot_messages").insert({
            bot_id: bot.id,
            project_id: bot.project_id,
            chat_id: chatId,
            role: "assistant",
            text: answer,
          });
        } catch (error) {
          const detail = error instanceof Error ? error.message : "unknown";
          console.error("telegram webhook error:", detail);
          await tgSendMessage(bot.token, chatId, "حدث خطأ مؤقت، أعد المحاولة بعد قليل.").catch(
            () => null,
          );
        }

        return Response.json({ ok: true });
      },
    },
  },
});
