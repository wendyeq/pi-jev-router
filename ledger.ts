import { appendFileSync, chmodSync, mkdirSync, openSync, closeSync, constants } from "node:fs";
import { join } from "node:path";

export type JevStat = {
	kind: "evaluation" | "applied";
	question: "model" | "effort" | "skill";
	outcome: "selected" | "failed" | "temporary-failure" | "skipped-single" | "fallback";
	target?: string;
	thinking?: string;
	source?: string;
	reason?: string;
	/** Offered option label. Model routes use `model @ thinking`, never the model id alone. */
	choice?: string;
	/** Diagnostic distribution over offered options. Never used to change a route. */
	probabilities?: Record<string, number>;
	probabilityStatus?: "available" | "missing" | "invalid";
	/** Chunked model routing only. Intermediate assessments are not the pinned decision. */
	stage?: "intermediate" | "final";
	attempts?: number;
	milliseconds?: number;
	inputTokens?: number;
	outputTokens?: number;
	gatewayCostUsd?: number;
	/** Shared effort policy. Absent on older logs and on model routing. */
	policyVersion?: string;
	rawConfidence?: number | null;
	confidenceStatus?: "available" | "missing" | "invalid";
	selectedEffort?: string;
	decisionReason?: string;
	effectiveEffort?: string;
	/** Request-level effort field. It can differ from the effort a configuration update puts in force. */
	requestEffort?: string;
	applyStatus?: "applied" | "not-applied" | "apply-failed" | "cancelled";
};

/** Separate from Pi's conversation JSONL: session files can be created with a permissive umask. */
export function appendStat(agentDir: string, sessionId: string, entry: JevStat): boolean {
	try {
		const dir = join(agentDir, "jev-router", "sessions");
		mkdirSync(dir, { recursive: true, mode: 0o700 });
		chmodSync(dir, 0o700);
		if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?$/.test(sessionId)) return false;
		const path = join(dir, `${sessionId}.jsonl`);
		const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0), 0o600);
		try {
			chmodSync(path, 0o600);
			appendFileSync(fd, `${JSON.stringify({ time: new Date().toISOString(), sessionId, ...entry })}\n`);
		} finally { closeSync(fd); }
		return true;
	} catch { return false; }
}

export function usageFields(result: unknown): Pick<JevStat, "inputTokens" | "outputTokens" | "gatewayCostUsd"> {
	if (!result || typeof result !== "object") return {};
	const value = result as { usage?: { inputTokens?: unknown; outputTokens?: unknown }; providerMetadata?: unknown };
	const tokens = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : undefined;
	const cost = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : typeof n === "string" && n.trim() !== "" && Number.isFinite(Number(n)) && Number(n) >= 0 ? Number(n) : undefined;
	// POST /v1/evaluate reports cost only in providerMetadata.gateway.cost.
	const metadata = value.providerMetadata as { gateway?: { cost?: unknown } } | undefined;
	const inputTokens = tokens(value.usage?.inputTokens);
	const outputTokens = tokens(value.usage?.outputTokens);
	const gatewayCostUsd = cost(metadata?.gateway?.cost);
	return { ...(inputTokens !== undefined ? { inputTokens } : {}),
		...(outputTokens !== undefined ? { outputTokens } : {}),
		...(gatewayCostUsd !== undefined ? { gatewayCostUsd } : {}) };
}
