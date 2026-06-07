import type { CSSProperties } from "react";

export const tableSectionStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #dbe4ef",
  borderRadius: 8,
  boxShadow: "0 18px 48px rgba(15, 23, 42, 0.06)",
  marginTop: 14,
  overflow: "hidden"
};

export const tableHeaderStyle: CSSProperties = {
  alignItems: "start",
  background: "#ffffff",
  borderBottom: "1px solid #dbe4ef",
  display: "grid",
  gap: 8,
  gridTemplateColumns: "minmax(0, 1fr) auto",
  padding: 16
};

export const tableScrollStyle: CSSProperties = {
  overflowX: "auto"
};

export const tableStyle: CSSProperties = {
  borderCollapse: "collapse",
  minWidth: 780,
  width: "100%"
};

export const thStyle: CSSProperties = {
  background: "#f1f5f9",
  borderBottom: "1px solid #dbe4ef",
  color: "#475569",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 0,
  padding: "11px 12px",
  textAlign: "left",
  textTransform: "uppercase"
};

export const tdStyle: CSSProperties = {
  borderBottom: "1px solid #eef2f7",
  fontSize: 14,
  lineHeight: 1.42,
  padding: "12px"
};

export const codeTextStyle: CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 13
};

export const pillStyle: CSSProperties = {
  borderRadius: 999,
  display: "inline-flex",
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1,
  padding: "7px 9px"
};
