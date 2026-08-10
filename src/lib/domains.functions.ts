import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireWeaverAuth } from "@/lib/weaver-auth";
import { getSql } from "@/lib/db";

/** حالة الدومين المخصّص لمشروع + تعليمات DNS وفحصها الحيّ. */
export const getDomainState = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).parse(raw))
  .handler(async ({ data }) => {
    const mod = await import("@/lib/domains.server");
    const state = await mod.readDomainState(data.projectId);
    const dns = state.domain ? await mod.checkDomainDns(state.domain) : null;
    return {
      ...state,
      dns,
      instructions: state.domain ? mod.dnsInstructions(state.domain) : mod.dnsInstructions("example.com"),
    };
  });

/** يربط دوميناً مخصّصاً: يتحقّق من DNS ثم يهيّئ nginx وشهادة SSL على السيرفر. */
export const attachCustomDomain = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        domain: z.string().min(3).max(200),
        email: z.string().email().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const mod = await import("@/lib/domains.server");
    const domain = mod.normalizeDomain(data.domain);

    const sql = getSql();
    const [project] = await sql`
      SELECT slug, published FROM public.projects
      WHERE id = ${data.projectId} AND user_id = ${context.userId}
    `;
    if (!project) throw new Error("المشروع غير موجود");
    const slug = (project["slug"] as string | null) ?? "";
    if (!project["published"] || !slug) {
      throw new Error("انشر الموقع أولاً (publish) قبل ربط الدومين.");
    }

    const taken = await sql`
      SELECT id FROM public.projects
      WHERE custom_domain = ${domain} AND id <> ${data.projectId} LIMIT 1
    `;
    if (taken.length) throw new Error("هذا الدومين مربوط بمشروع آخر بالفعل.");

    const dns = await mod.checkDomainDns(domain);
    if (!dns.ok) {
      await mod.saveDomainState(data.projectId, domain, "pending_dns", dns.detail);
      return {
        ok: false as const,
        stage: "dns" as const,
        domain,
        dns,
        instructions: mod.dnsInstructions(domain),
        message: `${dns.detail}\n\n${mod.dnsInstructions(domain)}`,
      };
    }

    const email = data.email ?? process.env["LETSENCRYPT_EMAIL"] ?? "";
    const setup = await mod.requestDomainSetup(domain, slug, email);
    await mod.saveDomainState(
      data.projectId,
      domain,
      setup.ok ? "configuring" : "failed",
      setup.ok ? null : setup.log,
    );
    return {
      ok: setup.ok,
      stage: "provision" as const,
      domain,
      dns,
      jobId: setup.jobId,
      instructions: mod.dnsInstructions(domain),
      message: setup.ok
        ? `جارٍ تهيئة ${domain} وإصدار شهادة SSL. تابع الحالة بعد دقيقة.`
        : `تعذّرت التهيئة: ${setup.log}`,
    };
  });

/** يتابع مهمة التهيئة على السيرفر ويحدّث الحالة إلى live/failed. */
export const refreshDomainStatus = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: z.string().uuid(), jobId: z.string().max(64).optional() }).parse(raw),
  )
  .handler(async ({ data }) => {
    const mod = await import("@/lib/domains.server");
    const state = await mod.readDomainState(data.projectId);
    if (!state.domain) return { ...state, log: "" };

    if (data.jobId) {
      const job = await mod.domainJobStatus(data.jobId);
      if (job.status === "success" || job.status === "failed") {
        await mod.saveDomainState(
          data.projectId,
          state.domain,
          job.status === "success" ? "live" : "failed",
          job.status === "failed" ? job.log.slice(-1000) : null,
        );
        return { ...(await mod.readDomainState(data.projectId)), log: job.log };
      }
      return { ...state, log: job.log };
    }

    // بلا مهمة: نتحقّق أن الدومين يستجيب فعلاً.
    try {
      const res = await fetch(`https://${state.domain}/`, {
        signal: AbortSignal.timeout(8000),
        redirect: "follow",
      });
      if (res.ok) {
        await mod.saveDomainState(data.projectId, state.domain, "live", null);
        return { ...(await mod.readDomainState(data.projectId)), log: "الدومين يستجيب عبر HTTPS." };
      }
    } catch {
      /* لم يستجب بعد */
    }
    return { ...state, log: "الدومين لم يستجب بعد عبر HTTPS." };
  });

/** يفصل الدومين عن المشروع (لا يحذف إعداد nginx تلقائياً). */
export const detachCustomDomain = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).parse(raw))
  .handler(async ({ data }) => {
    const mod = await import("@/lib/domains.server");
    await mod.saveDomainState(data.projectId, null, "none", null);
    return { ok: true as const };
  });
