export default function NotFound() {
  return (
    <main
      style={{
        alignItems: "center",
        color: "#172033",
        display: "flex",
        flexDirection: "column",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        justifyContent: "center",
        minHeight: "100vh",
        padding: 24,
        textAlign: "center"
      }}
    >
      <p style={{ color: "#64748b", fontSize: 13, fontWeight: 700, margin: 0 }}>404</p>
      <h1 style={{ fontSize: 28, letterSpacing: 0, margin: "8px 0" }}>페이지를 찾을 수 없습니다</h1>
      <p style={{ color: "#64748b", margin: 0 }}>
        요청한 주소가 없거나 이동되었습니다. 사이트 대시보드에서 다시 확인하세요.
      </p>
    </main>
  );
}
