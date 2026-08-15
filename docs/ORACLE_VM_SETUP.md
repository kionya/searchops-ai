# Oracle Cloud Always Free VM 구축 절차

SearchOps API/Worker/Redis를 Oracle Cloud Always Free ARM VM 1대에 올리는 전체 순서.
확인 기준일 2026-08-16. 무료 티어 정책은 자주 바뀌므로 큰 차이가 보이면 공식 문서를 먼저 확인한다.

배포 자산은 레포의 `Dockerfile`과 `compose.prod.yaml`이다. env 목록은 `PROVISIONING_RUNBOOK.md`를 본다.

---

## 0. 되돌릴 수 없는 결정 두 가지

시작 전에 이 둘만 정확히 하면 나머지는 전부 복구 가능하다.

**홈 리전** — 가입 폼에서 한 번 정하고 **변경할 수 없다.** Always Free 컴퓨트는 홈 리전에서만 만들 수 있다.
가입 폼 드롭다운을 열고 위에서부터 판정한다:

1. `South Korea Central (Seoul)` 이 보이면 → **서울.** Supabase(서울)와 같은 도시라 DB 왕복 지연이 사실상 사라진다.
2. 서울이 없으면 → `Japan Central (Osaka)`. 도쿄보다 A1 용량 경합이 덜하다.
3. 오사카도 없으면 → `Japan East (Tokyo)`.
4. **`South Korea North (Chuncheon)` 은 절대 고르지 않는다.** Oracle 공식 문서가 A1 생성을 명시적으로 배제한
   유일한 리전이다. 여기를 고르면 이 프로젝트는 시작조차 불가능하고, 계정을 버리고 재가입하는 것 외에 방법이 없다.

> 서울과 춘천은 다른 리전이다(`ap-seoul-1` vs `ap-chuncheon-1`). 이름이 비슷해 혼동하기 쉽다.
> ⚠️ 무료 가입 폼에 서울이 안 뜨고 춘천만 나오는 사례 보고가 있다. 본인 폼에서 직접 확인해야 한다.

**인스턴스 크기** — 처음부터 **2 OCPU / 12GB 이하**로 만든다.
Oracle이 2026-06-15에 A1 무료 한도를 4 OCPU/24GB에서 반으로 줄였고 초과분은 종료 대상이다.
지금 새로 만들면 애초에 한도 안이라 무관하지만, 크레딧이 있다고 크게 잡으면 나중에 통째로 날아간다.

---

## 1. 계정 생성

준비물: 이메일(계정당 1개, 재사용 불가), 휴대폰, **신용카드**(체크/선불카드는 실패 사례가 많다).

카드에는 **본인 확인용 승인보류만 잡히고 실제 청구는 없다.** 유료로 업그레이드하지 않는 한 청구되지 않는다.

1. https://signup.oraclecloud.com 접속
2. Country `South Korea`, 이름·이메일 입력 → 캡차 → **Verify my email**
3. 메일의 인증 링크 클릭 (**30분 안에** 해야 한다. 놓치면 처음부터)
4. 다음 화면에서 입력:
   - Password — 8~40자, 대소문자·숫자·특수문자 각 1개 이상
   - Cloud Account Name — 테넌시 이름. 나중에 못 바꾸고 로그인에 계속 쓴다. `searchops` 같은 짧은 영소문자
   - **Home Region — 0번의 판정 결과를 고른다. 변경 불가.**
5. 주소·휴대폰 입력 → SMS 인증
6. Add payment verification method → Credit Card
7. 약관 동의 → **Start my free trial**

보통 몇 분 안에 계정이 만들어진다. 수동 검토로 빠지면 수 시간~수일 걸릴 수 있는데,
이때 재가입을 시도하면 영구 차단될 수 있으니 기다리거나 지원에 문의한다.

### 트라이얼과 Always Free의 관계

가입하면 30일 $300 크레딧과 Always Free를 동시에 받는다. 트라이얼이 끝나고 유예기간(30일)까지 지나면
유료 리소스는 회수되지만 **Always Free 리소스는 남고 카드에 청구되지 않는다.**
그래서 처음부터 무료 한도 안에서만 만들면 트라이얼 종료가 아무 일도 아니게 된다.

---

## 2. SSH 키 (로컬 맥에서 먼저)

인스턴스 생성 화면에서 공개키를 붙여넣어야 하므로 미리 만든다.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/oci_a1 -C "searchops-oracle"
cat ~/.ssh/oci_a1.pub    # 이 값을 3번에서 붙여넣는다
```

---

## 3. 인스턴스 생성

콘솔 좌상단 햄버거 메뉴 **≡ → Compute → Instances → Create instance**

| 항목 | 값 |
|---|---|
| Name | `searchops` |
| Placement | 기본값. **fault domain은 지정하지 않는다**(지정하면 용량 확보가 더 어려워진다) |
| **Shape** | **Edit → Ampere → `VM.Standard.A1.Flex` → 2 OCPU / 12GB** |
| **Image** | Ubuntu 24.04 LTS **aarch64** 이미지 |
| SSH keys | Paste public keys → `~/.ssh/oci_a1.pub` 내용 |
| Boot volume | Custom 100GB (무료 총량 200GB 안. 나중에 줄일 수 없다) |

**Shape를 먼저 고르고 Image를 나중에 고른다.** 순서가 반대면 x86 이미지가 선택된 채로 남아
A1과 호환되지 않는다. 이미지 이름에 `aarch64`가 있는지 눈으로 확인한다.

### "Out of host capacity" 가 뜨면

A1은 인기가 많아 생성이 자주 실패한다. 정상이며 계정 문제가 아니다.

- 다른 가용 도메인(AD)을 번갈아 시도한다
- 시간을 두고 재시도한다. 콘솔에서 수동으로 반복하기보다 OCI CLI로 재시도 루프를 돌리는 편이 낫다
- 급하면 PAYG(유료)로 업그레이드하면 확보가 쉬워진다는 보고가 많다. 업그레이드해도 무료 한도 안이면 과금되지 않지만,
  ⚠️ 한도를 넘기면 즉시 과금되므로 Budgets 알림을 함께 설정한다

### 만든 뒤에 하지 말아야 할 것

- **terminate 하지 않는다.** 한 번 지우면 같은 크기로 다시 못 만들 수 있다
- **리사이즈하지 않는다.** 늘릴 때 용량이 없으면 원래 크기로 되돌리지도 못한 채 멈춘다
- 인스턴스를 지워도 **부트 볼륨은 남아 한도를 계속 차지한다.** 지울 때는 Block Storage에서 따로 확인한다

---

## 4. 접속

```bash
chmod 600 ~/.ssh/oci_a1
ssh -i ~/.ssh/oci_a1 ubuntu@<VM_공인IP>
```

Ubuntu 이미지의 기본 사용자는 `ubuntu`다(Oracle Linux는 `opc`).

---

## 5. 방화벽 — Docker 설치 **전에** 한다

여기가 이 문서에서 가장 중요한 부분이다. 방화벽이 **두 겹**이고, 순서를 틀리면 나중에 조용히 깨진다.

### 5-1. OCI 쪽 (VM 바깥)

콘솔 **≡ → Networking → Virtual cloud networks → (VCN 클릭) → Security Lists → Default Security List
→ Add Ingress Rules**

| 포트 | Source CIDR | 언제 |
|---|---|---|
| 22 | 본인 공인 IP `/32` 권장 | 필수 |
| 80, 443 | `0.0.0.0/0` | Caddy로 HTTPS 붙일 때만 |
| 8000 | 가급적 제한 | API를 직접 노출할 때만 |
| **6379** | — | **절대 열지 않는다.** 인증 없는 Redis는 몇 분 안에 털린다 |

Stateless는 체크 해제(기본값 stateful)로 둔다.

### 5-2. VM 안쪽 iptables — Docker를 쓰면 반드시 걸리는 함정

OCI Ubuntu 이미지는 ufw가 아니라 iptables로 잠겨 있고, INPUT과 FORWARD 체인 끝에
`REJECT` 규칙이 박혀 있다. 두 가지를 알아야 한다.

**첫째, `-A`(append)로는 규칙을 추가할 수 없다.** REJECT 뒤에 붙어 영원히 실행되지 않는다.
`-I`(insert)로 REJECT 앞에 넣어야 한다.

**둘째, Docker 퍼블리시 포트는 INPUT이 아니라 FORWARD 체인을 탄다.**
`ports: "8000:8000"`으로 노출한 컨테이너로 가는 패킷은 DNAT 후 FORWARD로 간다.
그래서 INPUT에 8000을 열어도 컨테이너는 열리지 않고, FORWARD의 REJECT를 지워야 열린다.

```bash
# 현재 상태 확인 — 줄번호는 이미지 버전마다 다르니 매번 눈으로 본다
sudo iptables -L INPUT --line-numbers -n
sudo iptables -L FORWARD --line-numbers -n

# FORWARD 의 REJECT 제거 (Docker 전용 VM 이므로 통째로 없앤다)
sudo iptables -D FORWARD -j REJECT --reject-with icmp-host-prohibited

# 호스트에 직접 띄우는 프로세스가 있을 때만 INPUT 삽입 (위에서 본 REJECT 줄번호를 N 이라 하면)
# 컨테이너로 띄우는 것(Caddy 포함)은 FORWARD 를 타므로 이 단계가 필요 없다
# sudo iptables -I INPUT <N> -p tcp -m state --state NEW --dport 443 -j ACCEPT

# 영구 반영 — Docker 설치 전인 지금이 적기다
sudo apt-get update && sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

> **Docker를 설치·기동한 뒤에는 `netfilter-persistent save`를 다시 돌리지 않는다.**
> Docker가 동적으로 넣은 규칙이 파일에 굳어 다음 부팅에 충돌한다.
> 꼭 필요하면 `sudo systemctl stop docker docker.socket` → save → `start docker` 순서로 한다.
> 마찬가지로 `netfilter-persistent reload`를 돌렸다면 그 뒤에 `sudo systemctl restart docker`를 해야
> 날아간 Docker 체인이 복구된다.

---

## 6. Docker 설치

```bash
# 아키텍처 확인 (arm64 / aarch64 가 나와야 한다)
dpkg --print-architecture && uname -m

# 배포판 구버전 제거
for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
  sudo apt-get remove -y $pkg
done

# GPG 키
sudo apt-get update && sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# apt 저장소 등록
sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

# 설치
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 부팅 시 자동 시작 확인
sudo systemctl enable docker containerd
sudo systemctl is-enabled docker containerd

# sudo 없이 쓰기 (docker 그룹은 사실상 root 권한이다)
sudo usermod -aG docker $USER && newgrp docker
docker compose version
```

---

## 7. 배포

```bash
git clone https://github.com/kionya/searchops-ai.git
cd searchops-ai

# env 파일 작성 — 필수/선택 목록은 docs/PROVISIONING_RUNBOOK.md
nano .env
chmod 600 .env

docker compose -f compose.prod.yaml up -d --build
```

`REDIS_URL`은 compose가 주입하므로 env 파일에 넣지 않아도 된다.
`DATABASE_URL`에는 `?pgbouncer=true&connection_limit=2`를 붙인다.

빌드가 OOM으로 죽으면 스왑을 붙인다:

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

마이그레이션은 `PROVISIONING_RUNBOOK.md`의 4.3 절차를 컨테이너에서 실행한다
(`DIRECT_DATABASE_URL`이 env 파일에 있어야 한다).

---

## 8. 검증 — 재부팅까지 해봐야 끝난다

```bash
sudo reboot
```

재접속 후:

```bash
sudo iptables -S FORWARD                      # REJECT 가 없고 DOCKER 점프가 보여야 한다
docker compose -f compose.prod.yaml ps        # api / worker / redis 모두 Up
docker compose -f compose.prod.yaml logs --tail=50 worker
```

그리고 **로컬 맥에서** (VM 안에서 curl하면 방화벽을 타지 않아 의미가 없다):

```bash
curl -sS -m 5 http://<VM_공인IP>:8000/health
```

마지막으로 heartbeat를 되살린다:

```bash
gh variable set SEARCHOPS_API_BASE --repo kionya/searchops-ai --body 'http://<VM_공인IP>:8000'
```

---

## 9. 선택 사항

### API를 공개하지 않기 (가장 안전)

Vercel web 앱이 이 API를 호출하지 않는다면, `compose.prod.yaml`의 api 포트를
`"127.0.0.1:8000:8000"`으로 바꾸고 Security List에서 8000을 열지 않는다.
접근은 SSH 터널로 한다: `ssh -N -L 8000:127.0.0.1:8000 ubuntu@<VM_공인IP>`

### HTTPS (도메인 비용 0)

공인 IP를 Reserved로 고정한 뒤 DuckDNS에 등록하고, compose에 Caddy 컨테이너를 추가하면
Let's Encrypt 인증서를 자동 발급·갱신한다. 80과 443을 **둘 다** 열어야 한다(80이 없으면 발급 실패).
`Caddyfile`은 도메인 한 줄과 `reverse_proxy api:8000` 한 줄이면 된다.
인증서 저장소는 반드시 named volume으로 둔다 — 날리면 재발급이고 rate limit에 걸린다.

### 보안

OCI Ubuntu 이미지는 기본이 SSH 키 전용 로그인이라 추가 설정이 거의 필요 없다.
`sudo sshd -T | grep passwordauthentication`으로 `no`인지 확인만 한다.
**fail2ban은 필요 없다** — 비밀번호 로그인이 없으면 무차별 대입이 성공할 수 없고,
iptables에 체인을 하나 더 얹어 5번에서 정리한 순서만 복잡해진다.
자동 보안 업데이트는 `unattended-upgrades`로 켜되 **자동 재부팅은 끈 채로 둔다**(기본값).

---

## 유휴 회수 주의

7일간 CPU·네트워크·메모리 사용률이 **모두** 20% 미만이면 Oracle이 인스턴스를 회수할 수 있다.
세 조건이 AND라, Redis `maxmemory`를 넉넉히 잡아 메모리 사용률만 20% 위로 올려도 회피된다.
인위적으로 CPU를 태우는 것보다 이쪽이 깔끔하다. (PAYG 계정은 회수 대상이 아니다.)
