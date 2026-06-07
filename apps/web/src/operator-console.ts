export type OperatorConsoleSignalTone = "neutral" | "ready" | "risk" | "warning";

export interface OperatorConsoleSignal {
  readonly detail: string;
  readonly href: string;
  readonly id: string;
  readonly summary: string;
  readonly title: string;
  readonly tone: OperatorConsoleSignalTone;
  readonly value: string;
}

export interface OperatorConsoleSignalSummary {
  readonly neutral: number;
  readonly ready: number;
  readonly risk: number;
  readonly total: number;
  readonly warning: number;
}

export interface OperatorConsoleInput {
  readonly canLaunch: boolean;
  readonly deadLetterSummary: {
    readonly active: number;
    readonly failed: number;
    readonly total: number;
    readonly waiting: number;
  };
  readonly hardeningSummary: {
    readonly migrationSteps: number;
    readonly requiredInputs: number;
    readonly restoreSteps: number;
  };
  readonly observabilitySummary: {
    readonly alertCount: number;
    readonly criticalAlertCount: number;
    readonly deadLetterTotal: number;
    readonly requestTotal: number;
    readonly serverErrorCount: number;
  };
  readonly productizationSummary: {
    readonly configured: number;
    readonly launchBlocking: number;
    readonly manualFollowup: number;
    readonly needsProvisioning: number;
    readonly ready: number;
    readonly total: number;
  };
  readonly readinessSummary: {
    readonly blocked: number;
    readonly configured: number;
    readonly manualFollowup: number;
    readonly needsProvisioning: number;
    readonly ready: number;
    readonly total: number;
  };
}

export function createOperatorConsoleSignals(
  input: OperatorConsoleInput,
): readonly OperatorConsoleSignal[] {
  const readinessRisk = input.readinessSummary.blocked + input.readinessSummary.needsProvisioning;
  const readinessReady = input.readinessSummary.configured + input.readinessSummary.ready;
  const productizationBlockers = input.productizationSummary.launchBlocking;

  return [
    {
      detail: `${input.readinessSummary.manualFollowup} manual follow-up`,
      href: "/ops/readiness",
      id: "readiness",
      summary: "Credential, connector, hardening, 정책 확정 항목을 한 화면에서 추적합니다.",
      title: "출시 준비도",
      tone: chooseTone(readinessRisk, input.readinessSummary.manualFollowup),
      value: `${readinessReady}/${input.readinessSummary.total} ready`
    },
    {
      detail: `${input.observabilitySummary.serverErrorCount} server errors`,
      href: "/ops/observability",
      id: "observability",
      summary: "API 요청, worker failure, alert routing 신호를 운영 기준으로 봅니다.",
      title: "운영 지표",
      tone: chooseTone(
        input.observabilitySummary.criticalAlertCount + input.observabilitySummary.serverErrorCount,
        input.observabilitySummary.alertCount,
      ),
      value: `${input.observabilitySummary.alertCount} alerts`
    },
    {
      detail: `${input.deadLetterSummary.waiting} waiting jobs`,
      href: "/ops/dead-letter",
      id: "dead-letter",
      summary: "Dead-letter metadata와 재실행 가능성 판단을 분리해 확인합니다.",
      title: "실패 작업 관리",
      tone: chooseTone(
        input.deadLetterSummary.active + input.deadLetterSummary.failed,
        input.deadLetterSummary.waiting,
      ),
      value: `${input.deadLetterSummary.total} jobs`
    },
    {
      detail: `${input.hardeningSummary.restoreSteps} restore steps, ${input.hardeningSummary.migrationSteps} migration steps`,
      href: "/ops/hardening",
      id: "hardening",
      summary: "Restore drill, migration gate, 운영 실행 입력값을 배포 전 점검합니다.",
      title: "Production hardening",
      tone: chooseTone(0, input.hardeningSummary.requiredInputs),
      value: `${input.hardeningSummary.requiredInputs} inputs`
    },
    {
      detail: `${input.productizationSummary.manualFollowup} manual follow-up`,
      href: "/ops/productization",
      id: "productization",
      summary: "Auth/RBAC, invite, billing, domain, legal launch blockers를 묶어 봅니다.",
      title: "Productization",
      tone: chooseTone(input.canLaunch ? 0 : productizationBlockers, input.productizationSummary.manualFollowup),
      value: `${productizationBlockers} blockers`
    }
  ];
}

export function summarizeOperatorConsoleSignals(
  signals: readonly OperatorConsoleSignal[],
): OperatorConsoleSignalSummary {
  return {
    neutral: countTone(signals, "neutral"),
    ready: countTone(signals, "ready"),
    risk: countTone(signals, "risk"),
    total: signals.length,
    warning: countTone(signals, "warning")
  };
}

function chooseTone(riskCount: number, warningCount: number): OperatorConsoleSignalTone {
  if (riskCount > 0) {
    return "risk";
  }

  if (warningCount > 0) {
    return "warning";
  }

  return "ready";
}

function countTone(
  signals: readonly OperatorConsoleSignal[],
  tone: OperatorConsoleSignalTone,
) {
  return signals.filter((signal) => signal.tone === tone).length;
}
