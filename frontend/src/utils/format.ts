/**
 * Parse a Git URL and extract the "owner/repo" part.
 * Supports HTTPS and SSH formats.
 *
 * Examples:
 *   https://github.com/user/repo.git     -> user/repo
 *   git@github.com:user/repo.git         -> user/repo
 *   https://gitlab.com/group/project     -> group/project
 */
export function parseGitRepoUrl(gitUrl: string): string {
  try {
    // Remove trailing .git
    const clean = gitUrl.replace(/\.git$/, "");

    // HTTPS: https://host/owner/repo
    if (clean.startsWith("http")) {
      const url = new URL(clean);
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length >= 2) {
        return parts.slice(-2).join("/");
      }
      return parts.join("/") || clean;
    }

    // SSH: git@host:owner/repo
    if (clean.includes("@")) {
      const afterAt = clean.split("@")[1];
      if (afterAt) {
        const pathPart = afterAt.includes(":")
          ? afterAt.split(":")[1]
          : afterAt;
        const parts = pathPart?.split("/").filter(Boolean);
        if (parts && parts.length >= 2) {
          return parts.slice(-2).join("/");
        }
        return parts?.join("/") || clean;
      }
    }

    return clean;
  } catch {
    return gitUrl;
  }
}

/**
 * Extract the Git host name from a URL.
 *
 * Examples:
 *   https://github.com/user/repo.git -> github.com
 *   git@gitlab.com:user/repo.git     -> gitlab.com
 */
export function parseGitHost(gitUrl: string): string {
  try {
    if (gitUrl.startsWith("http")) {
      const url = new URL(gitUrl);
      return url.hostname;
    }
    if (gitUrl.includes("@")) {
      const afterAt = gitUrl.split("@")[1];
      if (afterAt) {
        return afterAt.split(":")[0] || afterAt.split("/")[0];
      }
    }
    return "git";
  } catch {
    return "git";
  }
}

/**
 * Format a date string into a relative time description.
 *
 * Examples:
 *   刚刚
 *   5 分钟前
 *   3 小时前
 *   2 天前
 *   2024-01-15
 */
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  if (diffHour < 24) return `${diffHour} 小时前`;
  if (diffDay < 30) return `${diffDay} 天前`;

  // Fallback to YYYY-MM-DD
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
