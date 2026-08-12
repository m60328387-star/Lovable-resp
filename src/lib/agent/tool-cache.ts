export class ToolCache {
  private cache = new Map<string, { value: any; timestamp: number }>();
  // 5 minutes for web search, etc.
  private readonly DEFAULT_TTL = 5 * 60 * 1000;

  generateKey(toolName: string, args: any): string {
    return `${toolName}:${JSON.stringify(args)}`;
  }

  get(toolName: string, args: any): any | null {
    const key = this.generateKey(toolName, args);
    const item = this.cache.get(key);
    
    if (item && Date.now() - item.timestamp < this.DEFAULT_TTL) {
      return item.value;
    }
    
    // If expired or missing
    if (item) this.cache.delete(key);
    return null;
  }

  set(toolName: string, args: any, value: any, ttlMs: number = this.DEFAULT_TTL) {
    const key = this.generateKey(toolName, args);
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  invalidateFileCaches(filepath: string) {
    // If a file is written/edited, invalidate its read_file caches
    for (const [key, item] of this.cache.entries()) {
      if (key.includes(filepath) || key.startsWith("list_files:")) {
        this.cache.delete(key);
      }
    }
  }

  clear() {
    this.cache.clear();
  }
}

// Global cache instance per server lifetime or per session
export const globalToolCache = new ToolCache();
