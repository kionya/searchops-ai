import type { CSSProperties } from "react";

// 테이블/헤더/스크롤 컨테이너 스타일은 globals.css 의 .searchops-table* 클래스로 옮겼다.
// 셀마다 스타일 객체를 직렬화하면 RSC 페이로드가 행 수만큼 커진다.
// 여기 남은 둘은 값에 따라 동적으로 합쳐 쓰는 것들이다.

export const codeTextStyle: CSSProperties = {
  fontFamily: "var(--so-mono)",
  fontSize: 14
};

export const pillStyle: CSSProperties = {
  borderRadius: 999,
  display: "inline-flex",
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.3,
  padding: "4px 10px"
};
