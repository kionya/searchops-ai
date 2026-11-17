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

**Render 를 쓰기로 했다.** `render.yaml` 이 1·2번을 한 번에 만든다(1절). Render 의 Key Value 인스턴스가 Redis 자리를 대신하므로 별도 Redis 서비스는 필요 없다.

⚠️ **검증필요**: 호스트별 무료 한도와 요금은 자주 바뀐다. 배포 전에 현재 요금을 직접 확인하라. 다른 호스트로 옮겨도 `apps/api/Dockerfile` 은 그대로 쓰인다 — `render.yaml` 만 그 호스트 형식으로 바꾸면 된다.

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

### Cloudflare 에 `api.totopapa.com` 붙이기

⚠️ **배포한 뒤에 한다.** CNAME 이 가리킬 대상(호스트가 준 주소)이 있어야 만들 수 있다.

**1) Cloudflare 대시보드** → `totopapa.com` → 왼쪽 **DNS** → **Add record**

| 항목 | 값 |
|---|---|
| Type | `CNAME` |
| Name | `api` |
| Target | 호스트가 준 주소 (`searchops-api.onrender.com` 처럼 **`https://` 와 끝 슬래시를 뺀 호스트명만**) |
| Proxy status | **DNS only (회색 구름)** |
| TTL | Auto |

프록시(주황 구름)를 켜면 호스트가 Let's Encrypt 인증서를 발급하지 못해 HTTPS 가 깨진다. Cloudflare 문서도 서드파티 서비스용 CNAME 은 DNS only 로 두라고 안내한다.

**2) 호스트 쪽에도 등록한다.** DNS 만 걸면 호스트가 그 호스트명으로 온 요청을 자기 것으로 인정하지 않는다.

| 호스트 | 위치 |
|---|---|
| Render | Settings → Custom Domains → Add |
| Fly.io | `fly certs add api.totopapa.com` |
| Koyeb | Service → Settings → Domains |
| Railway | Settings → Networking → Custom Domain |

**3) 확인** (전파에 보통 1~2분, 최대 수십 분):

```bash
dig +short api.totopapa.com          # 호스트 주소가 나와야 한다
curl -sI https://api.totopapa.com/health | head -1   # HTTP/2 200
```

`curl` 이 인증서 오류를 내면 아직 발급 전이거나 프록시가 켜져 있다.

**안 붙여도 된다.** 호스트가 준 주소를 그대로 써도 전부 동작한다. 나중에 호스트를 옮길 때 Google Console 의 리디렉트 URI 만 다시 등록하면 되고, 그건 2분짜리 일이다. 서브도메인은 그 2분을 미리 없애는 선택일 뿐이다.

### 순서 (도메인이 없으면 3절을 못 한다)

```
1) 1·2절로 배포한다 — 이때 OAuth env 는 비워둔다
2) 호스트가 준 주소를 확인한다 (원하면 여기서 서브도메인 CNAME)
3) 그 주소로 3절의 Google OAuth 클라이언트를 만든다
4) OAuth env 를 API 에 추가하고 재배포한다
5) 4절: Vercel 에 SEARCHOPS_API_BASE_URL
```

1단계에서 OAuth env 가 없어도 API 는 정상 기동한다(전부 optional 이다). 커넥터 화면만 `oauth=not_configured` 로 뜨고, 4단계를 마치면 열린다.

## 1. Render 배포 (Blueprint)

`render.yaml` 이 레포 루트에 있다. API 웹 서비스와 Key Value(Redis 호환) 인스턴스를 함께 정의한다.

**이미지는 Render 가 굽지 않는다.** 무료 플랜의 빌드 자원으로는 이 모노레포 빌드(pnpm install + tsc + prisma generate)가 메모리 부족으로 죽는다. GitHub Actions 가 굽어 GHCR 에 올리고, Render 는 받아서 띄우기만 한다(`.github/workflows/api-image.yml`). 같은 이미지를 GitHub 러너는 4분 안에 굽는다.

```
main 에 푸시
  └ api-image 워크플로
      ├ 이미지 빌드 (레이어 캐시로 2회차부터 수십 초)
      ├ 부팅 확인 (env 없이 돌려 검증 오류가 나오는지)
      ├ GHCR 푸시  ghcr.io/kionya/searchops-api:{latest,<sha>}
      └ Render deploy hook 호출 (imgURL 로 <sha> 태그를 못 박음)
```

### 1) GHCR 패키지를 먼저 만든다

`main` 에 푸시하면 워크플로가 이미지를 올린다. 첫 푸시 후 GitHub → 프로필/조직 → **Packages** → `searchops-api` 가 보인다.

**패키지를 public 으로 바꾼다** — Package settings → Danger Zone → Change visibility → Public.

이미지에 비밀값은 없다. 모든 env 는 런타임에 주입하고 `.dockerignore` 가 `.env` 를 제외하며, 레포 자체가 공개라 새로 새는 정보가 없다. private 로 두려면 Render Workspace Settings 에 `read:packages` 권한의 PAT 를 등록하고 `render.yaml` 의 `image.creds` 에 그 이름을 적는다.

### 2) Blueprint 적용

Render 대시보드 → **New → Blueprint → 이 레포 선택 → Apply**

`sync: false` 로 표시된 값만 물어본다:

| 키 | 값 |
|---|---|
| `DATABASE_URL` | Supabase 풀러(6543) 주소 |
| `DIRECT_DATABASE_URL` | Supabase 세션 풀러(5432) 주소 |
| `SEARCHOPS_CREDENTIAL_ENCRYPTION_KEY` | `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` |
| `SEARCHOPS_IDP_JWKS_JSON` | `curl -s https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` 결과 전체 |
| `SEARCHOPS_IDP_ISSUER` | `https://<ref>.supabase.co/auth/v1` |

OAuth 3종은 **도메인이 정해진 뒤** 3~4절에서 채운다. 비어 있어도 API 는 정상 기동한다.

### 3) Deploy hook 을 GitHub 에 등록한다

이미지 기반 서비스는 태그가 갱신돼도 **자동으로 재배포되지 않는다**(Render 공식 문서). 워크플로가 명시적으로 걸어야 한다.

Render → `searchops-api` → **Settings → Deploy Hook** 의 URL 을 복사해서:

```bash
gh secret set RENDER_DEPLOY_HOOK_URL --body '<복사한 URL>'
```

⚠️ 이 URL 은 **누구든 호출하면 배포가 걸리는 값**이다. 코드나 문서에 적지 말고 secret 으로만 둔다.

이 secret 이 없으면 워크플로는 이미지만 올리고 배포는 건너뛴다(경고만 남긴다). 그때는 Render 대시보드에서 **Deploy latest reference** 를 직접 누르면 된다.

### 4) 확인

```bash
curl -s https://searchops-api.onrender.com/health
```

⚠️ **무료 플랜은 15분 유휴 후 정지**한다. 다음 요청에서 다시 뜨는 데 수십 초 걸린다. 커넥터 화면 첫 로딩이 느릴 뿐이고, **데이터 동기화는 배치가 하므로 신선도에는 영향이 없다.**

⚠️ `region: singapore` 가 무료 플랜에서 선택 불가면 `oregon` 으로 바꿔라. 동작에는 지장 없고 DB 왕복만 느려진다.

## 1-1. 이미지 빌드 (직접 확인하고 싶을 때)

레포 루트를 컨텍스트로 준다:

```bash
docker build -f apps/api/Dockerfile -t searchops-api .
```

`api-image` 워크플로가 매 푸시마다 같은 빌드와 부팅 확인을 한다. 로컬에서 안 돌려도 된다.

호스트가 Dockerfile 을 직접 읽는 경우(Render/Fly/Koyeb 대부분), **Dockerfile 경로 `apps/api/Dockerfile`, 빌드 컨텍스트 `.`(레포 루트)** 로 설정한다. 컨텍스트를 `apps/api` 로 두면 워크스페이스 패키지를 못 찾아 실패한다.

## 2. API 환경변수

Render Blueprint 를 썼다면 이 목록은 `render.yaml` 이 이미 정의해 뒀다. 아래는 각 값이 무엇이고 왜 필요한지의 설명이자, 다른 호스트를 쓸 때의 정본이다.

### 필수

```
DATABASE_URL          = postgresql://...@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_DATABASE_URL   = (마이그레이션용. 세션 풀러 5432)
REDIS_URL             = redis://... 또는 rediss://...
```

### 로그인 토큰 검증 (빠뜨리면 인증 경로가 전부 500)

```
SEARCHOPS_IDP_JWKS_JSON = (아래 curl 결과 전체)
SEARCHOPS_IDP_ISSUER    = https://<project-ref>.supabase.co/auth/v1
SEARCHOPS_IDP_AUDIENCE  = authenticated
```

```bash
curl -s https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json
```

JWKS 는 공개 값이라 그대로 붙여넣어도 된다. 이게 없으면 토큰 검증기가 아예 구성되지 않아 `/organizations/...` 같은 경로가 401 이 아니라 **500** 을 낸다 — 처음에 빠뜨려서 실제로 겪었다.

Supabase 는 프로젝트에 따라 **RS256 또는 ES256** 으로 서명한다. 둘 다 지원한다(`apps/api/src/auth.ts`). 어느 쪽인지는 위 JWKS 응답의 `alg` 로 확인할 수 있다.

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

### 코드가 요구하는 scope (정본: `apps/api/src/google-oauth.ts`)

```
openid
email
https://www.googleapis.com/auth/webmasters.readonly     ← GSC
https://www.googleapis.com/auth/analytics.readonly      ← GA4
```

둘 다 **읽기 전용**이다. 쓰기 권한은 요구하지 않는다.

인증 URL 에 `access_type=offline` 과 `prompt=consent` 를 붙이므로 refresh token 이 발급된다 — 이게 있어야 배치가 매일 토큰을 갱신하며 돈다.

### ⚠️ 게시 상태를 "프로덕션" 으로 올려야 한다

Google 문서: *"외부 사용자 유형이고 게시 상태가 '테스트' 인 프로젝트는 **7일 만에 만료되는** refresh token 을 발급한다 — 요청 scope 가 이름·이메일·프로필의 부분집합인 경우는 예외."*

우리 scope 는 그 예외에 **해당하지 않는다.** 테스트 상태로 두면 연결 일주일 뒤 배치가 조용히 실패하기 시작한다. 증상이 "어제까지 되던 게 안 된다" 라서 원인을 찾기 어렵다.

- **Google Workspace 계정이 있으면**: 사용자 유형을 **내부(Internal)** 로 하면 이 문제가 없고 확인(verification)도 필요 없다. 이쪽이 가장 깔끔하다.
- **일반 Gmail 계정이면**: 외부(External)로 만들고 **게시 상태를 "프로덕션" 으로 전환**한다. 확인받지 않은 앱이라 동의 화면에 경고가 뜨는데, 본인이 쓰는 것이므로 `고급` → `<앱 이름>(안전하지 않음)으로 이동` 으로 통과하면 된다. 민감한 scope 를 확인 없이 쓸 때 사용자 100명 상한이 있는데, 운영자 몇 명이면 문제되지 않는다.

### 절차

1. **프로젝트 선택** — 기존 프로젝트를 쓰거나 새로 만든다.
2. **API 사용 설정** — `API 및 서비스` → `라이브러리` 에서 두 개를 각각 검색해 **사용** 을 누른다.
   - `Google Search Console API`
   - `Google Analytics Data API`
3. **OAuth 동의 화면 구성** — `API 및 서비스` → `OAuth 동의 화면`
   - 사용자 유형: 위 경고 참고
   - 앱 이름 / 사용자 지원 이메일 / 개발자 연락처 이메일 입력
   - `범위 추가 또는 삭제` 에서 위 4개를 추가
4. **게시 상태를 프로덕션으로 전환** — 같은 화면의 `앱 게시` 버튼. **이 단계를 빠뜨리지 마라.**
5. **클라이언트 생성** — `사용자 인증 정보` → `사용자 인증 정보 만들기` → `OAuth 클라이언트 ID` → **웹 애플리케이션**
   - 승인된 JavaScript 원본: **비워둔다**(서버 사이드 흐름이라 필요 없다)
   - **승인된 리디렉션 URI**: `https://<API도메인>/connectors/google/oauth/callback`
     `SEARCHOPS_GOOGLE_OAUTH_REDIRECT_URI` 와 **한 글자도 다르면 안 된다.**
6. 발급된 **클라이언트 ID / 보안 비밀번호** 를 2절의 env 에 넣는다.

⚠️ 나중에 **연결을 승인하는 Google 계정**은 대상 사이트의 Search Console 속성과 GA4 속성에 접근 권한이 있어야 한다. 권한 없는 계정으로 연결하면 인증은 성공하는데 데이터가 비어 온다.

## 4. Vercel 쪽 복구

```
SEARCHOPS_API_BASE_URL = https://searchops-api.onrender.com   (또는 https://api.totopapa.com)
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
| **연결 일주일 뒤부터 동기화 실패** | 게시 상태가 '테스트' 라 refresh token 이 7일 만에 만료 | 3절 — 게시 상태를 프로덕션으로 올리고 재연결 |
| 인증은 됐는데 데이터가 비어 옴 | 승인한 Google 계정에 해당 속성 권한이 없음 | Search Console/GA4 에서 그 계정 권한 확인 |
| 계정은 연결됐는데 저장 버튼 비활성 | 계정 목록 조회 실패 | `/ops/connector-live-setup` 으로 원인 확인 |
| 동기화를 눌러도 아무 일 없음 | 워커 없음(정상) | 배치가 매일 처리한다. 즉시 원하면 5절 끝 참고 |
| 배치 로그에 `키링을 읽지 못했다` | GitHub Secret 의 키가 API 와 다름 | 5절 — 같은 값이어야 한다 |
| 배치 로그에 `failed=N` | provider 별 실패 | 해당 사이트의 커넥터 상태와 토큰 만료 확인 |
