import type { CSSProperties } from "react";

export const tableSectionStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  marginTop: 14,
  overflow: "hidden"
};

export const tableHeaderStyle: CSSProperties = {
  alignItems: "start",
  borderBottom: "1px solid #e5e7eb",
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
  background: "#f8fafc",
  borderBottom: "1px solid #e5e7eb",
  color: "#475569",
  fontSize: 12,
  fontWeight: 700,
  padding: "11px 12px",
  textAlign: "left",
  textTransform: "uppercase"
};

export const tdStyle: CSSProperties = {
  borderBottom: "1px solid #eef2f7",
  fontSize: 14,
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
  fontWeight: 700,
  lineHeight: 1,
  padding: "6px 8px"
};
