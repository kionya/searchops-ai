/**
 * 직접 DB 모드의 스위치. 이 한 곳에서만 읽는다.
 *
 * **범용 `DATABASE_URL` 을 쓰지 않는다.** 그 이름은 마이그레이션·워커·호스팅 플랫폼
 * 통합이 저마다 쓰기 때문에, 그걸 조건으로 삼으면 누가 주입한 전권 연결 문자열을
 * 모르는 새 집어 쓰게 된다 — 최소권한 역할을 쓰겠다는 설계가 조용히 무력화된다.
 * 실제로 Vercel 에는 이미 그 이름의 변수가 있었다.
 *
 * 직접 DB 모드는 운영자가 `SEARCHOPS_WEB_DATABASE_URL` 을 명시적으로 넣었을 때만 켜진다.
 * 값은 반드시 풀러(pgbouncer) 쪽이어야 한다 — direct/session URL 을 서버리스에서 쓰면
 * Supabase 커넥션 한도를 금방 먹는다.
 *
 * 별도 모듈인 이유: site-database 와 provider-accounts 가 서로를 참조해 순환이 생긴다.
 */
export function getWebDatabaseUrl(): string | null {
  return process.env.SEARCHOPS_WEB_DATABASE_URL?.trim() || null;
}

export function isDirectDatabaseMode(): boolean {
  return getWebDatabaseUrl() !== null;
}
