import Link from "next/link";
import type { CSSProperties } from "react";

import { CopyButton } from "../../../../src/copy-button";
import { getSiteDashboardPath } from "../../../../src/dashboard-shell";
import { getTodayBoard } from "../../../../src/site-database";
import { buildTodayView } from "../../../../src/today-view-model";
import { markDoneAction, markIntendedAction } from "./actions";

interface TodayPageProps {
  readonly params: Promise<{ readonly siteId: string }>;
  readonly searchParams?: Promise<{ readonly today?: string }>;
}

// 원장님이 텔레그램 링크로 여는 휴대폰용 한 장 화면. 360px 에서 가로 스크롤이 생기면 안 된다.
export default async function TodayPage({ params, searchParams }: TodayPageProps) {
  const { siteId } = await params;
  const feedback = (await searchParams)?.today;
  let board;
  try {
    board = await getTodayBoard(siteId);
  } catch {
    return <p style={noticeStyle}>오늘의 할 일을 불러오지 못했습니다. 웹 DB 역할의 읽기 권한(scripts/sql/web-role.sql)을 확인하세요.</p>;
  }
  if (board === null) {
    return <p style={noticeStyle}>오늘의 할 일은 실데이터(DB 직접) 모드에서만 보입니다.</p>;
  }
  const view = buildTodayView(board);

  return (
    <section aria-labelledby="today-heading" style={{ display: "grid", gap: 12, minWidth: 0 }}>
      <h2 id="today-heading" style={{ fontSize: 20, margin: 0 }}>
        오늘의 할 일 <span style={{ color: "var(--so-muted)", fontSize: 15 }}>{view.items.length}개</span>
      </h2>
      {feedback === "updated" ? <p role="status" style={{ color: "var(--so-ready)", margin: 0 }}>반영했습니다.</p> : null}
      {feedback === "failed" ? <p role="status" style={{ color: "var(--so-risk)", margin: 0 }}>반영하지 못했습니다. 다시 눌러 주세요.</p> : null}
      {view.changes.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {view.changes.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {view.searchLine === null ? null : <p style={{ color: "var(--so-muted)", margin: 0 }}>{view.searchLine}</p>}
      {view.items.length === 0 ? <p style={{ margin: 0 }}>지금 할 일이 없습니다. 새 문제가 보이면 아침 요약으로 알려 드립니다.</p> : null}
      <ol style={{ display: "grid", gap: 10, listStyle: "none", margin: 0, padding: 0 }}>
        {view.items.map((item, index) => (
          <li key={item.id} style={cardStyle}>
            <details>
              <summary style={{ cursor: "pointer", fontWeight: 700, overflowWrap: "anywhere" }}>
                {index + 1}. {item.title}
                <span style={{ color: "var(--so-muted)", display: "block", fontSize: 13, fontWeight: 400, marginTop: 4 }}>
                  {item.statusLabel}
                </span>
              </summary>
              <pre style={instructionStyle}>{item.aiInstruction}</pre>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <CopyButton text={item.aiInstruction} />
                <form action={markDoneAction.bind(null, siteId, item.id, item.isChecklist)}>
                  <button className="searchops-button secondary" type="submit">
                    했어요
                  </button>
                </form>
                {item.intendedKey === null ? null : (
                  <form action={markIntendedAction.bind(null, siteId, item.intendedKey)}>
                    <button className="searchops-button secondary" type="submit">
                      의도한 설정이에요
                    </button>
                  </form>
                )}
              </div>
            </details>
          </li>
        ))}
      </ol>
      {view.remaining > 0 ? <p style={{ color: "var(--so-muted)", margin: 0 }}>그 밖에 {view.remaining}개가 더 있습니다.</p> : null}
      <Link href={getSiteDashboardPath(siteId, "workorders")} style={{ fontSize: 14 }}>
        자세히 보기 (전체 작업 보드)
      </Link>
    </section>
  );
}

const noticeStyle: CSSProperties = { color: "var(--so-muted)", fontSize: 14, margin: 0 };

const cardStyle: CSSProperties = {
  background: "var(--so-paper)",
  border: "1px solid var(--so-line-soft)",
  borderRadius: 10,
  minWidth: 0,
  overflowWrap: "anywhere",
  padding: "12px 14px"
};

const instructionStyle: CSSProperties = {
  background: "var(--so-subtle)",
  borderRadius: 8,
  fontSize: 13,
  lineHeight: 1.5,
  margin: "10px 0",
  maxWidth: "100%",
  overflowWrap: "anywhere",
  padding: 10,
  whiteSpace: "pre-wrap"
};
