import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/hooks/message-integrity")({
  server: { handlers: { POST: async ({ request }) => {
    const expected=process.env["WEAVER_WORKER_TOKEN"]??"";
    const provided=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")??"";
    if(!expected||!safeEqual(expected,provided)) return Response.json({ok:false,error:"unauthorized"},{status:401});
    const sql=getSql();
    const result=await sql.begin(async(tx)=>{
      const positions=await tx`SELECT count(*)::int count FROM (SELECT project_id,position FROM public.messages GROUP BY project_id,position HAVING count(*)>1) d`;
      const ids=await tx`SELECT count(*)::int count FROM (SELECT project_id,parts->>'id' mid FROM public.messages WHERE NULLIF(parts->>'id','') IS NOT NULL GROUP BY project_id,parts->>'id' HAVING count(*)>1) d`;
      const removed=await tx`DELETE FROM public.messages older USING public.messages newer WHERE older.project_id=newer.project_id AND NULLIF(older.parts->>'id','') IS NOT NULL AND older.parts->>'id'=newer.parts->>'id' AND (older.created_at,older.id)<(newer.created_at,newer.id) RETURNING older.id`;
      return {duplicatePositions:Number(positions[0]?.count??0),duplicateIds:Number(ids[0]?.count??0),removed:removed.length};
    });
    console.info("[weaver:message-integrity]",JSON.stringify(result));
    return Response.json({ok:result.duplicatePositions===0,...result,checkedAt:new Date().toISOString()});
  } } },
});