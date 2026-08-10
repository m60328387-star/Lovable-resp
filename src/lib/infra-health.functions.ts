import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireWeaverAuth } from "@/lib/weaver-auth";
import type { InfraSnapshot } from "@/lib/infra-health.server";

/** حالة البنية التحتية على كونتابو (خطّاف النشر + الحاويات + آخر نشر). */
export const getInfraHealth = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .handler(async (): Promise<InfraSnapshot> => {
    const { infraSnapshot } = await import("@/lib/infra-health.server");
    return infraSnapshot();
  });

/** إعادة تشغيل خدمة (خطّاف النشر / nginx / runtime / app / worker). */
export const restartInfraService = createServerFn({ method: "POST" })
  .middleware([requireWeaverAuth])
  .inputValidator((input: { service: string }) =>
    z
      .object({ service: z.enum(["deploy-hook", "nginx", "runtime", "app", "worker"]) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { restartInfra } = await import("@/lib/infra-health.server");
    return restartInfra(data.service);
  });
