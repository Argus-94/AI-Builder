/**
 * Centralized redaction rules for persistent/application logs.
 * Keep this module dependency-free so all log surfaces can reuse the same rules.
 */

export function redactSecrets(value: string): string {
  return String(value ?? "")
    // Authorization headers / bearer tokens.
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/(authorization\s*[:=]\s*)["']?[^\s,;}"']+["']?/gi, "$1[REDACTED]")
    .replace(/(x-api-key|x-goog-api-key|api-key)\s*[:=]\s*["']?[^\s,;}"']+["']?/gi, "$1: [REDACTED]")
    .replace(/(\bbearer\s+)[A-Za-z0-9._~+/=\-]{8,}/gi, "$1[REDACTED]")
    // Provider token formats commonly seen in logs. Keep the prefix only.
    .replace(/\bsk-(?:proj-|ant-|or-v1-)?[A-Za-z0-9_-]{8,}/g, "sk-[REDACTED]")
    .replace(/\bor-[A-Za-z0-9_-]{8,}/g, "or-[REDACTED]")
    .replace(/\bghp_[A-Za-z0-9_]{12,}/g, "ghp_[REDACTED]")
    .replace(/\bgho_[A-Za-z0-9_]{12,}/g, "gho_[REDACTED]")
    .replace(/\bgha_[A-Za-z0-9_]{12,}/g, "gha_[REDACTED]")
    .replace(/\bghu_[A-Za-z0-9_]{12,}/g, "ghu_[REDACTED]")
    .replace(/\bghr_[A-Za-z0-9_]{12,}/g, "ghr_[REDACTED]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{12,}/g, "github_pat_[REDACTED]")
    .replace(/\bxai-[A-Za-z0-9_-]{8,}/g, "xai-[REDACTED]")
    .replace(/\bAIza[0-9A-Za-z_-]{20,}/g, "AIza[REDACTED]")
    // Common machine credentials that may appear without an explicit field name.
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "AKIA[REDACTED]")
    .replace(/\bASIA[0-9A-Z]{16}\b/g, "ASIA[REDACTED]")
    // JWTs are bearer credentials even when they are logged as plain values.
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_JWT]")
    // Basic auth and cookie credentials are commonly exposed by request/debug dumps.
    .replace(/(\bbasic\s+)[A-Za-z0-9+/=]{12,}/gi, "$1[REDACTED]")
    .replace(/(\b(?:cookie|set-cookie)\s*[:=]\s*)[^\r\n]+/gi, "$1[REDACTED]")
    // PEM private keys must never reach persistent storage.
    .replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]")
    // Query-string credentials. Also redact URL userinfo (https://user:pass@host).
    .replace(/([?&](?:key|api[_-]?key|apikey|token|access_token|authorization|secret|password|client_secret)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[REDACTED]:[REDACTED]@")
    // Credential-like CLI flags.
    .replace(/(\s--?(?:api[-_]?key|token|access[-_]?token|secret|password|passwd|credential|auth(?:orization)?)(?:=|\s+))["']?[^\s"']+["']?/gi, "$1[REDACTED]")
    // Package-manager and environment credential forms.
    .replace(/(^|[\s,{;])(_?npm_config_?(?:_authToken|authToken)|npm_token)\s*[=:]\s*["']?[^\s,;}"']+["']?/gim, "$1$2=[REDACTED]")
    .replace(/(^|[\s,{;])(?:[A-Z0-9_]*(?:API[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|CLIENT[_-]?SECRET|PASSWORD|SECRET|PRIVATE[_-]?KEY))\s*[=:]\s*["']?[^\s,;}"']+["']?/g, "$1[REDACTED_SECRET]")
    // JSON/object-style credential fields, including single-quoted values.
    .replace(/("?(?:api[_-]?key|apikey|apiKey|token|access_token|authorization|secret|password|client_secret)"?\s*[:=]\s*)["'][^"']*["']/gi, '$1"[REDACTED]"')
    .replace(/(\b(?:api[_-]?key|apikey|apiKey|token|access_token|authorization|secret|password|client_secret)\b\s*[:=]\s*)[^\s,;}]+/gi, "$1[REDACTED]");
}

