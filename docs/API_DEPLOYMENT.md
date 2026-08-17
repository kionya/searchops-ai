# SearchOps API 배포 (커넥터 연동을 살리는 경로)

대시보드 읽기와 쓰기 두 건(사이트 등록·지시서 상태)은 API 없이 돈다 — `docs/WEB_DIRECT_DB.md`.
**커넥터(GSC/GA4/Bing)만은 API 가 있어야 한다.** 이 문서는 그 이유와 배포 절차다.

## 왜 API 를 따로 두나

커넥터는 OAuth 토큰을 저장·복호화해야 하고, 그 열쇠가 `SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY` 다.

**이 키는 웹(Vercel)에 두지 않는다.** 프론트가 한 번 뚫리면 전 테넌트의 연동 토큰이 통째로 풀리기 때문이다. 그래서 키를 가진 프로세스를 웹 밖에 세운다 — 이게 원래 설계이고, 규칙을 어기는 게 아니라 지키는 방법이다.

```
Vercel (웹)          ← 암호화 키 없음. 대시보드 + 커넥터 UI
   │ HTTPS
   ↓
API (별도 호스트)     ← 암호화 키 여기. 커넥터 CRUD + Google OAuth 콜백
   │
   ├→ Postgres (Supabase)
   └→ Redis            ← API 가 필수로 요구 (큐 + OAuth state)

GitHub Actions (배치) ← 암호화 키 여기(Secret). 크롤 + 커넥터 동기화
```

배치가 키를 갖는 것은 새 위험이 아니다 — 이미 `DATABASE_URL` 과 richdoc service_role 키를 갖고 있어 신뢰 경계가 같다.

## 필요한 것

| | 무엇 | 왜 |
|---|---|---|
| 1 | 컨테이너 호스트 1개 | API 를 상시 띄운다. `apps/api/Dockerfile` 로 어디든 올라간다 |
| 2 | Redis 1개 | `REDIS_URL` 은 **필수**다. 큐와 OAuth state 저장에 쓴다 |
| 3 | Google Cloud OAuth 클라이언트 | GSC/GA4 계정 연결용. **API 도메인이 정해진 뒤에** 만든다(0절) |

⚠️ **검증필요**: 호스트별 무료 한도와 요금은 자주 바뀐다. Render·Fly·Koyeb·Railway 중 고르되 현재 가격을 직접 확인하라. Redis 는 Upstash 무료 티어가 이 규모에 충분하다(워커 폴링 튜닝 env 가 이미 준비돼 있다 — `SEARCHOPS_WORKER_DRAIN_DELAY_MS`).

## 0. `<API도메인>` 은 어디서 오나

**아직 없다. 배포하면 호스트가 발급한다.** 이 문서의 `<API도메인>` 은 전부 그 값을 가리킨다.

| 호스트 | 자동 발급 주소 |
|---|---|
| Render | `https://<서비스명>.onrender.com` |
| Fly.io | `https://<앱명>.fly.dev` |
| Koyeb | `https://<앱명>-<org>.koyeb.app` |
| Railway | `https://<서비스명>-production.up.railway.app` |

**권장: 본인 서브도메인 `api.totopapa.com` 을 붙여라.** OAuth 리디렉트 URI 가 이 주소에 묶이는데, 호스트가 준 주소를 그대로 쓰면 나중에 호스트를 옮길 때 Google Console 설정을 다시 만져야 한다. 서브도메인이면 CNAME 만 바꾸면 된다.

웹(`searchops.totopapa.com`)을 붙였던 방식과 같다 — Cloudflare 에 CNAME `api` → 호스트가 준 주소, **DNS only(회색 구름)**. 프록시(주황 구름)를 켜면 호스트의 인증서 발급이 막히는 경우가 있다.

⚠️ `searchops-api-production.up.railway.app` 은 **죽은 주소**다. `progress.md` 의 옛 기록에 남아 있을 뿐이니 재사용하지 마라.

### 순서 (도메인이 없으면 3절을 못 한다)

```
1) 1·2절로 배포한다 — 이때 OAuth env 는 비워둔다
2) 호스트가 준 주소를 확인한다 (원하면 여기서 서브도메인 CNAME)
3) 그 주소로 3절의 Google OAuth 클라이언트를 만든다
4) OAuth env 를 API 에 추가하고 재배포한다
5) 4절: Vercel 에 SEARCHOPS_API_BASE_URL
```

1단계에서 OAuth env 가 없어도 API 는 정상 기동한다(전부 optional 이다). 커넥터 화면만 `oauth=not_configured` 로 뜨고, 4단계를 마치면 열린다.

## 1. 이미지 빌드

레포 루트를 컨텍스트로 준다:

```bash
docker build -f apps/api/Dockerfile -t searchops-api .
```

CI 가 매 푸시마다 이 빌드와 부팅을 확인한다(`api-image` 잡). 로컬에서 안 돌려도 된다.

호스트가 Dockerfile 을 직접 읽는 경우(Render/Fly/Koyeb 대부분), **Dockerfile 경로 `apps/api/Dockerfile`, 빌드 컨텍스트 `.`(레포 루트)** 로 설정한다. 컨텍스트를 `apps/api` 로 두면 워크스페이스 패키지를 못 찾아 실패한다.

## 2. API 환경변수

### 필수

```
DATABASE_URL          = postgresql://...@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_DATABASE_URL   = (마이그레이션용. 세션 풀러 5432)
REDIS_URL             = redis://... 또는 rediss://...
```

### 커넥터용 (이게 없으면 커넥터 화면이 안 열린다)

```
SEARCHOPS_CREDENTIAL_STORAGE_MODE      = encrypted
SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY    = (32바이트 base64. 아래 생성 명령 참고)
SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID = k1
SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID       = ...apps.googleusercontent.com
SEARCHOPS_GOOGLE_OAUTH_CLIENT_SECRET   = ...
SEARCHOPS_GOOGLE_OAUTH_REDIRECT_URI    = https://<API도메인>/connectors/google/oauth/callback
SEARCHOPS_GOOGLE_OAUTH_STATE_SECRET    = (16자 이상 임의 문자열)
```

암호화 키 생성:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

⚠️ **이 키를 잃어버리면 저장된 연동 토큰을 복호화할 수 없다.** 재연결 말고는 복구가 없다. 키를 바꿀 때는 이전 키를 `SEARCHOPS_CREDENTIAL_ENCRYPTION_PREVIOUS_KEYS_JSON` 에 남겨야 한다(`pnpm credentials:rotate` 참고).

### 선택

```
SEARCHOPS_BING_API_KEY, SEARCHOPS_PAGESPEED_API_KEY
SEARCHOPS_RICHDOC_SUPABASE_URL / _SERVICE_ROLE_KEY / _SITE_IDS
SEARCHOPS_RATE_LIMIT_ENABLED (기본: production 이면 켜짐)
```

전체 목록은 `packages/types/src/index.ts` 의 `SearchOpsEnvSchema` 가 정본이다.

## 3. Google OAuth 클라이언트

**API 도메인이 정해진 뒤에 한다**(0절 순서 참고). 도메인이 없으면 리디렉트 URI 를 쓸 수 없다.

Google Cloud Console → API 및 서비스 → 사용자 인증 정보 → OAuth 클라이언트 ID(웹 애플리케이션):

- **승인된 리디렉션 URI**: `https://<API도메인>/connectors/google/oauth/callback`
  `SEARCHOPS_GOOGLE_OAUTH_REDIRECT_URI` 와 **한 글자도 다르면 안 된다.**
- 사용 설정할 API: Search Console API, Google Analytics Data API

## 4. Vercel 쪽 복구

```
SEARCHOPS_API_BASE_URL = https://<API도메인>
```

이 값을 넣는 순간 커넥터 화면이 열리고, "이 모드에서는 설정할 수 없습니다" 안내가 사라진다.

⚠️ `SEARCHOPS_WEB_DATABASE_URL` 은 **그대로 둔다.** 대시보드 읽기·쓰기는 계속 DB 직접 경로를 쓴다 — 더 빠르고, API 가 죽어도 대시보드는 산다. `SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY` 는 **여전히 Vercel 에 넣지 않는다.**

## 5. GitHub Secrets (배치 동기화용)

배치가 매일 GSC/GA4 데이터를 당겨오게 하려면:

```bash
gh secret set SEARCHOPS_CREDENTIAL_STORAGE_MODE --body 'encrypted'
gh secret set SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY --body '<API 와 같은 값>'
gh secret set SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY_ID --body 'k1'
gh secret set SEARCHOPS_GOOGLE_OAUTH_CLIENT_ID --body '<...>'
gh secret set SEARCHOPS_GOOGLE_OAUTH_CLIENT_SECRET --body '<...>'
```

이걸 안 넣으면 배치의 커넥터 동기화 스텝은 **건너뛰고 초록불로 끝난다**(크롤은 계속 돈다).

### 왜 배치가 동기화를 하나

API 의 "지금 동기화" 버튼은 BullMQ 큐에 넣기만 한다. 큐를 소비하는 **워커를 상시 띄우지 않으면 그 작업은 영원히 대기한다.** 배치(`apps/worker/src/batch-connector-sync.ts`)가 큐를 우회해 직접 실행하므로, 워커 없이도 매일 데이터가 들어온다.

즉시 동기화까지 원하면 같은 이미지로 워커를 하나 더 띄운다(`node apps/worker/dist/index.js`). 그러면 버튼이 실제로 동작한다. 안 띄워도 데이터는 매일 들어온다.

## 6. 검증 순서

```bash
# 1. API 가 살아 있나
curl -s https://<API도메인>/health

# 2. 커넥터 설정이 완결됐나 (누락 항목을 항목별로 알려준다)
curl -s https://<API도메인>/ops/connector-live-setup

# 3. 웹이 API 를 보나
curl -s https://searchops.totopapa.com/api/deployment
#    → config.apiBaseUrl 이 true 여야 한다
```

그다음 화면에서: 사이트 → 커넥터 → **Google 연결** → GSC/GA4 계정 선택 + 리소스 입력 → 저장.

마지막으로 배치를 수동 실행해 데이터가 들어오는지 본다:

```bash
gh workflow run batch-crawl
gh run watch
```

로그에 `[batch-connector-sync] <도메인> ok=N` 이 찍히면 성공이다.

## 문제 해결

| 증상 | 원인 | 처방 |
|---|---|---|
| 커넥터 화면에 "이 모드에서는 설정할 수 없습니다" | Vercel 에 `SEARCHOPS_API_BASE_URL` 없음 | 4절 |
| `?oauth=not_configured` | API 에 Google OAuth env 없음 | 2·3절 |
| OAuth 콜백에서 `redirect_uri_mismatch` | Console 의 URI 와 env 불일치 | 3절 — 한 글자까지 대조 |
| 계정은 연결됐는데 저장 버튼 비활성 | 계정 목록 조회 실패 | `/ops/connector-live-setup` 으로 원인 확인 |
| 동기화를 눌러도 아무 일 없음 | 워커 없음(정상) | 배치가 매일 처리한다. 즉시 원하면 5절 끝 참고 |
| 배치 로그에 `키링을 읽지 못했다` | GitHub Secret 의 키가 API 와 다름 | 5절 — 같은 값이어야 한다 |
| 배치 로그에 `failed=N` | provider 별 실패 | 해당 사이트의 커넥터 상태와 토큰 만료 확인 |
