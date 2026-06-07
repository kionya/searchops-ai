import Link from "next/link";

export default function NotFound() {
  return (
    <main className="searchops-not-found">
      <span className="searchops-status-pill warning">404</span>
      <h1 style={{ fontSize: 30, letterSpacing: 0, margin: "12px 0 8px" }}>페이지를 찾을 수 없습니다</h1>
      <p style={{ color: "#64748b", margin: 0, maxWidth: 460 }}>
        요청한 주소가 없거나 이동되었습니다. 사이트 대시보드에서 다시 확인하세요.
      </p>
      <Link className="searchops-button" href="/sites" style={{ marginTop: 18 }}>
        사이트 목록으로
      </Link>
    </main>
  );
}
