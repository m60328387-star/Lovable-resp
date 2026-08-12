import sys

with open('src/components/agent/chat-window.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

import_stmt = """import { AgentLiveLog, type LogEvent } from "@/components/agent/agent-live-log";
import { CostMeter } from "@/components/agent/cost-meter";"""

if 'CostMeter' not in content:
    content = content.replace('import { AgentLiveLog, type LogEvent } from "@/components/agent/agent-live-log";', import_stmt)

cost_meter_calc = """  const [logEvents, setLogEvents] = useState<LogEvent[]>([]);

  const tokensEstimate = useMemo(() => {
    return messages.reduce((acc, m) => acc + Math.floor((m.content?.length || 0) / 4), 0);
  }, [messages]);"""

content = content.replace('  const [logEvents, setLogEvents] = useState<LogEvent[]>([]);', cost_meter_calc)

cost_meter_ui = """            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ModePicker threadId={threadId} />
              <ModelPicker />
              <SkillsPicker />
              <CostMeter tokensUsed={tokensEstimate} maxTokens={100000} />"""

if '<ModePicker' in content and '<CostMeter' not in content:
    content = content.replace("""            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ModePicker threadId={threadId} />
              <ModelPicker />
              <SkillsPicker />""", cost_meter_ui)

with open('src/components/agent/chat-window.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Patched chat-window.tsx successfully')
