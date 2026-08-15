#!/usr/bin/env bash
# Oracle Cloud A1.Flex 인스턴스 확보 재시도 루프.
#
# 도쿄/오사카는 가용 도메인(AD)이 1개뿐이라 "다른 AD를 시도하라"는 콘솔 조언을 따를 수 없다.
# 남은 자유도는 fault domain(지정하지 않으면 OCI가 가용한 곳을 고른다 — Oracle 공식 권고)과
# 요청 크기뿐이다. 용량 판정은 요청 크기의 함수라, 작은 요청이 들어갈 자리를 찾기 쉽다.
#
# 실행:
#   export COMPARTMENT_ID=ocid1.tenancy.oc1..xxx
#   export AD='xxxx:AP-TOKYO-1-AD-1'
#   export SUBNET_ID=ocid1.subnet.oc1.ap-tokyo-1.xxx
#   export IMAGE_ID=ocid1.image.oc1.ap-tokyo-1.xxx      # Ubuntu aarch64
#   ./scripts/dev/oci-a1-retry.sh
#
# 기본값은 2 OCPU/12GB(무료 상한)와 1 OCPU/6GB를 번갈아 시도한다.
# ALTERNATE=0 으로 끄면 큰 구성만 노린다. 작게 확보한 뒤 키우는 리사이즈는
# 신규 생성과 동일하게 취급되어 다시 용량 부족이 날 수 있으니 기대하지 말 것.
set -uo pipefail

# 잠들면 루프가 멈춘다. 자기 자신을 caffeinate 안에서 다시 실행한다
# (-i 유휴 sleep 방지, -s AC 전원 연결 시 시스템 sleep 방지).
[ -z "${CAFFEINATED:-}" ] && command -v caffeinate >/dev/null 2>&1 && \
  exec env CAFFEINATED=1 caffeinate -is "$0" "$@"

: "${COMPARTMENT_ID:?tenancy 또는 compartment OCID}"
: "${AD:?가용 도메인 이름. oci iam availability-domain list 로 확인}"
: "${SUBNET_ID:?퍼블릭 서브넷 OCID}"
: "${IMAGE_ID:?Ubuntu aarch64 이미지 OCID}"

SHAPE=VM.Standard.A1.Flex
OCPUS=${OCPUS:-2}; MEM=${MEM:-12}            # 2026-06-15 이후 Always Free 상한
ALT_OCPUS=${ALT_OCPUS:-1}; ALT_MEM=${ALT_MEM:-6}
ALTERNATE=${ALTERNATE:-1}
BOOT_GB=${BOOT_GB:-50}                       # 부트볼륨 크기는 용량 확보와 무관하다
SSH_KEY=${SSH_KEY:-$HOME/.ssh/oci_a1.pub}
NAME=${NAME:-searchops}
MIN=${MIN:-120} MAX_SLEEP=${MAX_SLEEP:-180}  # 초 단위 폭격은 429를 부른다

# 재시도할 것만 나열한다. 나열되지 않은 에러는 기다려도 바뀌지 않으므로 즉시 중단한다.
# LimitExceeded 는 이미 무료 한도를 다 썼다는 뜻이라 재시도가 무의미하다(기존 인스턴스를 지워야 한다).
is_retryable() {
  printf '%s' "$1" | grep -Eqi \
    'Out of host capacity|OutOfHostCapacity|"code": *"InternalError"|TooManyRequests|ServiceUnavailable|Connection (reset|aborted)|timed out'
}

notify() {
  osascript -e "display notification \"$2\" with title \"$1\" sound name \"Glass\"" 2>/dev/null
  say "$1" 2>/dev/null &
}

n=0
while :; do
  n=$((n + 1))
  if [ "$ALTERNATE" = "1" ] && [ $((n % 2)) -eq 0 ]; then
    try_ocpus=$ALT_OCPUS; try_mem=$ALT_MEM
  else
    try_ocpus=$OCPUS; try_mem=$MEM
  fi

  # fault domain 은 일부러 지정하지 않는다 — OCI 가 가용한 곳을 고르게 두는 편이 확률이 높다.
  out=$(oci compute instance launch \
    --compartment-id "$COMPARTMENT_ID" \
    --availability-domain "$AD" \
    --shape "$SHAPE" \
    --shape-config "{\"ocpus\":$try_ocpus,\"memoryInGBs\":$try_mem}" \
    --image-id "$IMAGE_ID" \
    --subnet-id "$SUBNET_ID" \
    --boot-volume-size-in-gbs "$BOOT_GB" \
    --ssh-authorized-keys-file "$SSH_KEY" \
    --display-name "$NAME" \
    --assign-public-ip true \
    --wait-for-state RUNNING 2>&1)
  rc=$?

  if [ $rc -eq 0 ]; then
    printf '%s\n' "$out"
    printf '\n확보: %s OCPU / %s GB (시도 %d회)\n' "$try_ocpus" "$try_mem" "$n"
    notify "A1 확보 성공" "${try_ocpus} OCPU / ${try_mem}GB, 시도 ${n}회"
    exit 0
  fi

  if is_retryable "$out"; then
    printf '[%s] #%-4d %s OCPU/%sGB 용량 없음\n' "$(date +%H:%M:%S)" "$n" "$try_ocpus" "$try_mem"
    sleep $((MIN + RANDOM % (MAX_SLEEP - MIN + 1)))
  else
    printf '%s\n' "$out" >&2
    notify "A1 중단" "재시도로 풀리지 않는 에러 (#$n)"
    exit 1
  fi
done
