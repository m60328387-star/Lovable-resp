import { useEffect, useState } from "react";
import { formatNumber } from "@/lib/utils";

export function CostMeter({ tokensUsed, maxTokens = 100000 }: { tokensUsed: number, maxTokens?: number }) {
  const [cost, setCost] = useState(0);

  // estimate cost based on average $0.01 per 1k tokens
  useEffect(() => {
    setCost((tokensUsed / 1000) * 0.01);
  }, [tokensUsed]);

  const percentage = Math.min((tokensUsed / maxTokens) * 100, 100);
  let color = "bg-green-500";
  if (percentage > 50) color = "bg-yellow-500";
  if (percentage > 80) color = "bg-red-500";

  return (
    <div className="flex flex-col gap-1 w-full max-w-xs p-3 rounded-lg border bg-card text-card-foreground shadow-sm">
      <div className="flex justify-between items-center text-xs font-medium">
        <span>مؤشر التكلفة والتوكنز</span>
        <span className="text-muted-foreground">${cost.toFixed(4)}</span>
      </div>
      <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
        <div 
          className={`h-full ${color} transition-all duration-500`} 
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="flex justify-between items-center text-[10px] text-muted-foreground">
        <span>{formatNumber(tokensUsed)} توكن</span>
        <span>الحد: {formatNumber(maxTokens)}</span>
      </div>
    </div>
  );
}
