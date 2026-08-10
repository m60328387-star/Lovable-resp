/**
 * موجة 6 — فصل محرّك الأدوات: مجموعات أدوات المنصة والذات والاستخبارات
 * والويب والبوتات وقاعدة بيانات المشروع، منقولة من routes/api/chat.ts.
 */
import { tool } from "ai";
import { z } from "zod";
import { type AuthedContext } from "@/lib/chat-auth.server";

import {
  getTargetConfig,
  targetSchema,
  targetRunSql,
  targetSelect,
  targetInsert,
  projectSchema,
} from "@/lib/target-supabase.server";
import {
  getSelfRepo,
  selfEdit,
  selfList,
  selfMap,
  selfRead,
  selfSearch,
  selfWrite,
} from "@/lib/self-repo.server";
import { webSearch, webFetch } from "@/lib/web.server";
import {
  buildSemanticIndex,
  codeSearch,
  embeddingProvider,
  fastModelId,
  llmCall,
  projectMap,
  readSlice,
  reasoningModelId,
  semanticSearch,
  visionModelId,
} from "@/lib/intel.server";

import {
  tgGetMe,
  tgSetWebhook,
  tgWebhookInfo,
  tgSendMessage,
  webhookSecret,
} from "@/lib/telegram.server";
import { MEMORY_RULE, SYSTEM_PROMPT } from "@/lib/agent/system-prompt";

export function platformTools(auth: AuthedContext | null) {
  return {
    propose_platform_change: tool({
      description:
        "يقترح تعديلاً على كود منصة Weaver نفسها ويحفظه كطلب مراجعة يظهر للمالك في صفحة «تطوير المنصة» مع Diff، ولا يُكتب حتى يعتمده. استخدمه بدل self_write_file عند أي تعديل على المنصة إلا إذا طلب المالك التطبيق المباشر.",
      inputSchema: z.object({
        title: z.string().describe("عنوان مختصر للتغيير"),
        description: z.string().describe("شرح ما سيتغيّر ولماذا"),
        files: z
          .array(z.object({ path: z.string(), content: z.string() }))
          .describe("الملفات بمحتواها الكامل بعد التعديل"),
      }),
      execute: async ({ title, description, files }) => {
        if (!auth) throw new Error("الجلسة غير صالحة");
        const { getSql } = await import("@/lib/db");
        const { ensurePlatformTables } = await import("@/lib/platform.server");
        const { getSelfRepo, selfRead, assertAllowed } = await import("@/lib/self-repo.server");
        await ensurePlatformTables();
        const repo = getSelfRepo();
        if (!repo) throw new Error("مستودع المنصة غير مضبوط");
        const payload: { path: string; before: string; after: string }[] = [];
        for (const f of files.slice(0, 20)) {
          const clean = assertAllowed(f.path);
          const current = await selfRead(repo, clean);
          payload.push({ path: clean, before: current.content, after: f.content });
        }
        const sql = getSql();
        const rows = await sql`
          INSERT INTO public.platform_changes (user_id, title, description, files)
          VALUES (${auth.userId}, ${title}, ${description ?? ""}, ${JSON.stringify(payload)}::jsonb)
          RETURNING id
        `;
        return {
          ok: true,
          changeId: String(rows[0]?.["id"] ?? ""),
          files: payload.map((f) => f.path),
          note: "بانتظار اعتماد المالك من صفحة تطوير المنصة",
        };
      },
    }),
    platform_settings_get: tool({
      description:
        "يقرأ إعدادات المنصة الحالية (النماذج، الحدود، الهوية) التي يضبطها المالك بلا كود.",
      inputSchema: z.object({}),
      execute: async () => {
        const { loadPlatformSettings } = await import("@/lib/platform.server");
        return loadPlatformSettings();
      },
    }),
  };
}

export function selfTools() {
  const repo = getSelfRepo();
  if (!repo) return {};

  return {
    self_list_files: tool({
      description:
        "يسرد ملفات كود منصة Weaver نفسها (المستودع). استخدمه عندما يطلب المستخدم تعديل المنصة نفسها (ميزة، إصلاح، تغيير لون أو نص).",
      inputSchema: z.object({
        prefix: z.string().describe("بادئة المسار مثل src/components أو نص فارغ للكل"),
      }),
      execute: async ({ prefix }) => ({ files: await selfList(repo, prefix) }),
    }),
    self_read_file: tool({
      description: "يقرأ ملفاً من كود منصة Weaver نفسها. اقرأ دائماً قبل أي تعديل ذاتي.",
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => selfRead(repo, path),
    }),
    self_write_file: tool({
      description:
        "يكتب/يحدّث ملفاً في كود منصة Weaver نفسها ويعمل commit على الفرع الافتراضي. استخدمه فقط بعد self_read_file وبمحتوى كامل للملف، وبعد موافقة صريحة من المستخدم على تعديل المنصة.",
      inputSchema: z.object({
        path: z.string().describe("مسار الملف داخل مستودع Weaver"),
        content: z.string().describe("المحتوى الكامل للملف بعد التعديل"),
        message: z.string().describe("رسالة الـ commit بالعربية"),
        confirmed: z
          .boolean()
          .describe("true فقط إذا وافق المستخدم صراحةً في هذه المحادثة على تعديل كود المنصة"),
      }),
      execute: async ({ path, content, message, confirmed }) => {
        if (!confirmed) {
          return {
            error:
              "تعديل كود المنصة يحتاج موافقة صريحة من المستخدم. اسأله أولاً ثم أعد المحاولة مع confirmed=true.",
          };
        }
        // منع الكتابة على ملفات حسّاسة تكسر الأمان أو النشر
        const blocked = [
          /^\.env/i,
          /^supabase\/config\.toml$/i,
          /^src\/integrations\/supabase\//i,
          /^\.github\/workflows\//i,
          /(^|\/)package-lock\.json$|(^|\/)bun\.lock/i,
        ];
        const clean = path.replace(/^\.?\//, "");
        if (blocked.some((rule) => rule.test(clean))) {
          return { error: `الملف ${clean} محميّ ولا يمكن تعديله ذاتياً.` };
        }
        return selfWrite(repo, clean, content, message);
      },
    }),
    self_map: tool({
      description:
        "خريطة كود منصة Weaver: المجلدات وعدد ملفاتها وأكبر الملفات. استخدمه أولاً قبل أي إصلاح ذاتي لتحديد مكان العمل بأقل توكينز.",
      inputSchema: z.object({}),
      execute: async () => selfMap(repo),
    }),
    self_search: tool({
      description:
        "بحث نصّي داخل كود المنصة يعيد المسار ورقم السطر والنص. استخدمه للعثور على مكان الميزة أو الخطأ بدل التخمين.",
      inputSchema: z.object({
        query: z.string().describe("النص المطلوب البحث عنه"),
        prefix: z.string().describe("نطاق البحث مثل src أو deploy — استخدم src افتراضياً"),
      }),
      execute: async ({ query, prefix }) => selfSearch(repo, query, prefix || "src"),
    }),
    self_edit_file: tool({
      description:
        "تعديل جراحي على ملف من كود المنصة: يستبدل مقاطع محددة بدل إعادة كتابة الملف كاملاً، ويمر ببوابة تحقق قبل الالتزام. هذه الأداة المفضّلة لإصلاح المنصة.",
      inputSchema: z.object({
        path: z.string().describe("مسار الملف داخل مستودع Weaver"),
        edits: z
          .array(z.object({ find: z.string(), replace: z.string() }))
          .describe("مقاطع فريدة للاستبدال (find يجب أن يظهر مرة واحدة فقط)"),
        message: z.string().describe("رسالة الـ commit بالعربية"),
      }),
      execute: async ({ path, edits, message }) => {
        try {
          return await selfEdit(repo, path, edits, message);
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) };
        }
      },
    }),
    self_auto_repair: tool({
      description:
        "حلقة إصلاح مغلقة: يقرأ سجل آخر نشر فاشل، يستخرج رسائل الأخطاء والملفات المتورطة ويعيد محتواها لتصلحها مباشرة عبر self_edit_file ثم تعيد النشر.",
      inputSchema: z.object({}),
      execute: async () => {
        const { getSql } = await import("@/lib/db");
        const { ensurePlatformTables } = await import("@/lib/platform.server");
        await ensurePlatformTables();
        const sql = getSql();
        const rows = await sql`
          SELECT status, log, created_at FROM public.platform_deploys
          ORDER BY created_at DESC LIMIT 1
        `;
        const last = rows[0];
        if (!last) return { ok: true, note: "لا يوجد سجل نشر بعد" };
        const log = String(last["log"] ?? "");
        if (last["status"] === "success")
          return { ok: true, note: "آخر نشر ناجح — لا حاجة للإصلاح" };
        const lines = log.split("\n");
        const errors = lines
          .filter((l) => /error|failed|cannot find|is not|TS\d{4}/i.test(l))
          .slice(-40);
        const paths = [
          ...new Set(
            [
              ...log.matchAll(
                /(?:^|[\s(])((?:src|deploy)\/[\w./-]+\.(?:tsx?|jsx?|css|json|mjs|sh))/g,
              ),
            ].map((m) => m[1] as string),
          ),
        ].slice(0, 5);
        const files: { path: string; content: string }[] = [];
        for (const p of paths) {
          const f = await selfRead(repo, p);
          if (f.found) files.push({ path: p, content: f.content.slice(0, 20000) });
        }
        return {
          ok: false,
          status: last["status"],
          errors,
          suspectFiles: paths,
          files,
          next: "أصلح الملفات أعلاه بـ self_edit_file ثم أعد deploy_platform.",
        };
      },
    }),
    deploy_platform: tool({
      description:
        "ينشر آخر إصدار من كود منصة Weaver على خادم Contabo (سحب من GitHub ثم إعادة بناء الحاويات وفحص صحي)، أو يتراجع عن آخر نشر. استخدمه بعد self_write_file عندما يطلب المالك تفعيل التعديلات على الخادم.",
      inputSchema: z.object({
        action: z.enum(["deploy", "rollback"]).describe("deploy للنشر أو rollback للتراجع"),
        confirmed: z.boolean().describe("true فقط بعد موافقة المالك الصريحة"),
      }),
      execute: async ({ action, confirmed }) => {
        if (!confirmed) return { error: "النشر يحتاج موافقة صريحة من المالك." };
        const { deployWithGuard } = await import("@/lib/platform.server");
        const result = await deployWithGuard(action);
        return {
          ok: result.ok,
          status: result.status,
          health: result.health ?? null,
          rolledBack: result.rolledBack ?? false,
          log: result.log.slice(-4000),
        };
      },
    }),
  };
}

/** أدوات الذكاء التحليلي: فهم أعمق وأسرع للمحتوى والمشروع. */
export function intelTools(auth: AuthedContext | null, projectId: string | null) {
  const guard = () => {
    if (!auth || !projectId) throw new Error("مساحة العمل غير متاحة لهذه الجلسة");
    return projectId;
  };

  return {
    project_map: tool({
      description:
        "خريطة كاملة للمشروع: كل ملف بحجمه ومخططه (أقسام/عناوين/دوال) دون قراءة المحتوى الكامل. استخدمه أولاً دائماً قبل أي تعديل لفهم الموقع بسرعة وبأقل توكينز.",
      inputSchema: z.object({}),
      execute: async () => projectMap(guard()),
    }),
    file_outline: tool({
      description:
        "مخطط ملف واحد: أقسامه وعناوينه ودواله مع أرقام الأسطر — بديل خفيف عن read_file.",
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => {
        const map = await projectMap(guard());
        const file = map.files.find((f) => f.path === path);
        return file ? { ...file, found: true } : { path, found: false };
      },
    }),
    read_slice: tool({
      description:
        "يقرأ مقطعاً محدداً من ملف بالأسطر (from/to) بدل الملف كاملاً — أسرع وأدق للتعديلات الجراحية.",
      inputSchema: z.object({ path: z.string(), from: z.number(), to: z.number() }),
      execute: async ({ path, from, to }) => readSlice(guard(), path, from, to),
    }),
    code_search: tool({
      description:
        "بحث نصي مرتّب داخل كل ملفات المشروع يعيد المسار ورقم السطر والمقتطف. استخدمه لإيجاد موضع أي عنصر أو نص أو دالة فوراً.",
      inputSchema: z.object({ query: z.string(), limit: z.number() }),
      execute: async ({ query, limit }) => codeSearch(guard(), query, limit),
    }),
    semantic_index: tool({
      description:
        "يبني فهرساً دلالياً (Embeddings) لملفات المشروع لتمكين البحث بالمعنى. يتطلب مفتاح تضمين (OPENAI_API_KEY أو JINA_API_KEY أو VOYAGE_API_KEY).",
      inputSchema: z.object({}),
      execute: async () => {
        if (!embeddingProvider()) {
          return { ok: false, error: "لا يوجد مفتاح تضمين مضبوط — استخدم code_search بدلاً منه." };
        }
        return buildSemanticIndex(guard());
      },
    }),
    semantic_search: tool({
      description:
        "بحث بالمعنى داخل فهرس المشروع (بعد semantic_index). يعيد المقاطع الأقرب دلالياً للسؤال.",
      inputSchema: z.object({ query: z.string(), limit: z.number() }),
      execute: async ({ query, limit }) => {
        if (!embeddingProvider()) {
          return { ok: false, error: "لا يوجد مفتاح تضمين — استخدم code_search." };
        }
        return semanticSearch(guard(), query, limit);
      },
    }),
    analyze_content: tool({
      description:
        "يحلّل نصاً طويلاً أو ملفات المشروع بنموذج سريع ويعيد خلاصة مركّزة/استخراجاً منظّماً حسب التعليمة. استخدمه لضغط المحتوى الضخم قبل التفكير فيه.",
      inputSchema: z.object({
        instruction: z.string().describe("ما المطلوب استخراجه أو تلخيصه"),
        text: z.string().describe("النص المراد تحليله، أو اتركه فارغاً واستخدم paths"),
        paths: z.array(z.string()).describe("مسارات ملفات من المشروع تُضاف للتحليل"),
      }),
      execute: async ({ instruction, text, paths }) => {
        const pid = guard();
        let body = text ?? "";
        for (const path of (paths ?? []).slice(0, 6)) {
          const slice = await readSlice(pid, path, 1, 1200);
          if (slice.found) body += `\n\n=== ${path} ===\n${slice.text}`;
        }
        if (!body.trim()) return { ok: false, error: "لا يوجد محتوى للتحليل" };
        const answer = await llmCall({
          model: fastModelId(),
          kind: "fast",
          system: "أنت محلل محتوى دقيق. أجب بالعربية، منظّماً ومختصراً بلا حشو.",
          content: `${instruction}\n\nالمحتوى:\n${body.slice(0, 120_000)}`,
          maxTokens: 2500,
        });
        return { ok: true, model: fastModelId(), analysis: answer };
      },
    }),
    deep_think: tool({
      description:
        "تحليل عميق بنموذج تفكير قوي لقرار معماري أو تشخيص مشكلة معقّدة. يعيد استنتاجاً وخطوات تنفيذ. استخدمه عند التردد بدل التخمين.",
      inputSchema: z.object({ question: z.string(), context: z.string() }),
      execute: async ({ question, context }) => {
        const answer = await llmCall({
          model: reasoningModelId(),
          kind: "reasoning",
          system:
            "أنت مهندس برمجيات أول. حلّل بعمق، وازن البدائل، ثم اعطِ قراراً واحداً واضحاً وخطوات تنفيذ مرقّمة بالعربية.",
          content: `السؤال: ${question}\n\nالسياق:\n${(context ?? "").slice(0, 60_000)}`,
          maxTokens: 3000,
        });
        return { ok: true, model: reasoningModelId(), analysis: answer };
      },
    }),
    analyze_image: tool({
      description:
        "يحلّل صورة أو لقطة شاشة عبر رابط (أو data URL) بنموذج رؤية: يصف التصميم، يستخرج النص، ويقترح تحسينات دقيقة.",
      inputSchema: z.object({ url: z.string(), question: z.string() }),
      execute: async ({ url, question }) => {
        const answer = await llmCall({
          model: visionModelId(),
          kind: "vision",
          system: "أنت ناقد تصميم ومحلّل بصري دقيق. أجب بالعربية بنقاط عملية قابلة للتنفيذ.",
          content: [
            { type: "text" as const, text: question || "حلّل هذه الصورة بدقة." },
            { type: "image_url" as const, image_url: { url } },
          ],
          maxTokens: 2000,
        });
        return { ok: true, model: visionModelId(), analysis: answer };
      },
    }),
    research: tool({
      description:
        "بحث معمّق: ينفّذ عدة استعلامات، يقرأ أفضل المصادر فعلياً، ثم يعيد خلاصة موثّقة بالروابط. استخدمه قبل بناء أي شيء يحتاج معايير أو توثيق حديث.",
      inputSchema: z.object({ topic: z.string(), queries: z.array(z.string()) }),
      execute: async ({ topic, queries }) => {
        const list = (queries ?? []).filter(Boolean).slice(0, 4);
        const all = list.length > 0 ? list : [topic];
        const found = (await Promise.all(all.map((q) => webSearch(q, 4)))).flat();
        const unique = Array.from(new Map(found.map((r) => [r.url, r])).values()).slice(0, 6);
        const pages = await Promise.all(
          unique.slice(0, 4).map(async (r) => {
            try {
              const page = await webFetch(r.url, 6000);
              return `=== ${r.title} (${r.url}) ===\n${(page as { content?: string }).content ?? ""}`;
            } catch {
              return `=== ${r.title} (${r.url}) ===\n${r.snippet}`;
            }
          }),
        );
        const summary = await llmCall({
          model: fastModelId(),
          kind: "fast",
          system: "أنت باحث تقني. لخّص بالعربية بنقاط عملية مع ذكر الرابط بجانب كل معلومة مهمة.",
          content: `الموضوع: ${topic}\n\nالمصادر:\n${pages.join("\n\n").slice(0, 100_000)}`,
          maxTokens: 2500,
        });
        return { ok: true, sources: unique, summary };
      },
    }),
  };
}

/** أدوات البحث على الإنترنت (مجانية بلا اشتراك). */
export function webTools() {
  return {
    web_search: tool({
      description:
        "يبحث على الإنترنت فعلياً (DuckDuckGo) ويعيد نتائج بعناوين وروابط ومقتطفات. استخدمه لأي معلومة حديثة أو متغيّرة: أسعار، إصدارات، توثيق، أخبار، مقارنات.",
      inputSchema: z.object({
        query: z.string().describe("استعلام البحث"),
        limit: z.number().describe("عدد النتائج المطلوبة 1-10"),
      }),
      execute: async ({ query, limit }) => ({ query, results: await webSearch(query, limit) }),
    }),
    web_fetch: tool({
      description:
        "يفتح رابطاً ويعيد محتوى الصفحة نصاً/Markdown نظيفاً للقراءة. استخدمه بعد web_search لقراءة المصادر المهمة فعلياً قبل الاستنتاج.",
      inputSchema: z.object({ url: z.string().describe("رابط كامل يبدأ بـ https://") }),
      execute: async ({ url }) => webFetch(url),
    }),
  };
}

/**
 * يعيد الأصل العام الصحيح للروابط المنشورة.
 * إذا كان الطلب قادماً من عنوان IP خام (مثل http://194.163.155.52) نستخدم
 * WEAVER_PUBLIC_URL إن وُجد حتى لا تظهر روابط المشاريع بعنوان IP غير آمن.
 */
export function resolvePublicOrigin(requestOrigin: string) {
  const configured = (process.env["WEAVER_PUBLIC_URL"] || "https://buildbuddy-ai-55.lovable.app")
    .trim()
    .replace(/\/+$/, "");
  let host = "";
  try {
    host = new URL(requestOrigin).hostname;
  } catch {
    return configured || requestOrigin;
  }
  const isRawIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const isLocal = host === "localhost" || host === "127.0.0.1";
  if (isRawIp && !isLocal) return configured;
  return requestOrigin;
}

/** يحوّل أصل الطلب إلى رابط عام ثابت صالح لـ Webhook تيليغرام. */
export function publicBase(origin: string) {
  const url = new URL(origin);
  const match = url.host.match(/^id-preview--([0-9a-f-]+)\.(.+)$/i);
  if (match) return `https://project--${match[1]}-dev.${match[2]}`;
  return url.origin;
}

/** أدوات بوتات تيليغرام: تسجيل بوت للمشروع وربط الـWebhook وإرسال الرسائل. */
export function botTools(auth: AuthedContext | null, projectId: string | null, origin: string) {
  const guard = () => {
    if (!auth || !projectId) throw new Error("مساحة العمل غير متاحة لهذه الجلسة");
    return { supabase: auth.supabase, userId: auth.userId, projectId };
  };

  const loadBot = async () => {
    const { supabase, projectId: pid } = guard();
    const { data } = await supabase
      .from("bots")
      .select("id, token, username, persona, model, enabled, webhook_url")
      .eq("project_id", pid)
      .eq("platform", "telegram")
      .maybeSingle();
    return data;
  };

  return {
    bot_setup: tool({
      description:
        "يسجّل بوت تيليغرام لهذا المشروع ويربط الـWebhook تلقائياً بحيث يبدأ البوت بالرد على المستخدمين فوراً. يحتاج توكن البوت من @BotFather (مرة واحدة؛ بعدها يكفي تمرير persona للتحديث).",
      inputSchema: z.object({
        token: z.string().describe("توكن البوت من BotFather، أو نص فارغ للاحتفاظ بالتوكن المسجّل"),
        persona: z
          .string()
          .describe("تعليمات وشخصية البوت: من هو، ماذا يفعل، أسلوبه، وما لا يفعله"),
      }),
      execute: async ({ token, persona }) => {
        const { supabase, userId, projectId: pid } = guard();
        const existing = await loadBot();
        const botToken = token.trim() || existing?.token;
        if (!botToken)
          throw new Error("لا يوجد توكن مسجّل؛ اطلب من المستخدم توكن البوت من @BotFather");

        const me = await tgGetMe(botToken);
        const url = `${publicBase(origin)}/api/public/tg/${pid}`;
        await tgSetWebhook(botToken, url, await webhookSecret(botToken));

        const row = {
          project_id: pid,
          user_id: userId,
          platform: "telegram",
          token: botToken,
          username: me.username ?? null,
          persona,
          webhook_url: url,
          enabled: true,
        };
        const { error } = existing
          ? await supabase.from("bots").update(row).eq("id", existing.id)
          : await supabase.from("bots").insert(row);
        if (error) throw new Error(error.message);

        return {
          username: me.username,
          link: me.username ? `https://t.me/${me.username}` : null,
          webhook: url,
          message: "تم ربط البوت؛ أي رسالة تصل إليه سيرد عليها تلقائياً.",
        };
      },
    }),

    bot_status: tool({
      description: "يعرض حالة بوت تيليغرام لهذا المشروع: اسم المستخدم، الويب هوك، وعدد الرسائل.",
      inputSchema: z.object({}),
      execute: async () => {
        const { supabase } = guard();
        const bot = await loadBot();
        if (!bot) return { linked: false };
        const info = await tgWebhookInfo(bot.token).catch(() => null);
        const { count } = await supabase
          .from("bot_messages")
          .select("id", { count: "exact", head: true })
          .eq("bot_id", bot.id);
        return {
          linked: true,
          username: bot.username,
          enabled: bot.enabled,
          webhook: bot.webhook_url,
          messages: count ?? 0,
          telegram: info,
        };
      },
    }),

    bot_send: tool({
      description: "يرسل رسالة من البوت إلى محادثة محددة (اختبار أو إشعار). يحتاج chat_id.",
      inputSchema: z.object({
        chat_id: z.string().describe("معرّف المحادثة في تيليغرام"),
        text: z.string().describe("نص الرسالة (HTML بسيط مسموح)"),
      }),
      execute: async ({ chat_id, text }) => {
        const bot = await loadBot();
        if (!bot) throw new Error("لا يوجد بوت مرتبط بهذا المشروع؛ استخدم bot_setup أولاً");
        await tgSendMessage(bot.token, chat_id, text);
        return { sent: true, chat_id };
      },
    }),
  };
}

/** أدوات قاعدة بيانات المشروع: مخطط مستقل لكل مشروع داخل نفس القاعدة. */
export function targetSupabaseTools(projectId: string) {
  const cfg = getTargetConfig();
  if (!cfg) return {};
  const schema = projectSchema(projectId);

  const inspect = tool({
    description:
      "يفحص مخطط قاعدة بيانات هذا المشروع (جداول وأعمدة مساحته المستقلة). استخدمه قبل أي تعديل.",
    inputSchema: z.object({}),
    execute: async () => ({ schema: await targetSchema(cfg, schema) }),
  });

  const sql = tool({
    description:
      "ينفّذ SQL فعلياً داخل مساحة هذا المشروع (CREATE TABLE، فهارس، دوال). لا تكتب اسم المخطط؛ الجداول تُنشأ تلقائياً داخل مساحة المشروع.",
    inputSchema: z.object({
      sql: z.string().describe("جملة أو جمل SQL كاملة"),
      reason: z.string().describe("سبب هذا التغيير ولأي مهمة"),
    }),
    execute: async ({ sql: statement, reason }) => ({
      reason,
      result: await targetRunSql(cfg, schema, statement),
    }),
  });

  const readRows = tool({
    description: "يقرأ صفوفاً من جدول داخل مساحة هذا المشروع.",
    inputSchema: z.object({
      table: z.string(),
      where: z.string().describe("شرط SQL بدون كلمة where، أو نص فارغ"),
      limit: z.number().describe("عدد الصفوف (1-200)"),
    }),
    execute: async ({ table, where, limit }) => ({
      rows: await targetSelect(cfg, schema, table, where, limit),
    }),
  });

  const insertRows = tool({
    description: "يدرج صفوفاً في جدول داخل مساحة هذا المشروع.",
    inputSchema: z.object({
      table: z.string(),
      rows: z.array(z.record(z.string(), z.unknown())).describe("الصفوف المراد إدراجها"),
    }),
    execute: async ({ table, rows }) => ({
      inserted: await targetInsert(cfg, schema, table, rows),
    }),
  });

  return {
    db_inspect: inspect,
    db_sql: sql,
    db_select: readRows,
    db_insert: insertRows,
  };
}
