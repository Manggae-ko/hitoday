# 네이버클라우드 배포 런북

HIToday 서버를 네이버클라우드(NAVER Cloud Platform, VPC 환경)의 Micro 서버 1대에 올리는 절차입니다. Micro 서버는 결제수단 등록 월부터 1년 무료이고, 공인 IP는 무료가 아닙니다. 무료 조건과 요금은 바뀔 수 있으므로 생성 전에 콘솔의 현재 안내를 확인하세요.

```
앱 ──wss──▶ Caddy (443, 자동 HTTPS) ──▶ relay (8787) ── /data (기기 키·방·일정)
브라우저 ──https─▶      〃           ──▶ 다운로드 페이지
```

## 0. 비용과 조건

| 항목 | 내용 |
| --- | --- |
| Micro 서버 (1 vCPU · 1GB · 50GB) | 결제수단 등록 월부터 1년 무료, 계정당 1대, 한국 거주자 한정. 1년 뒤 반납하지 않으면 자동 과금 |
| 공인 IP | 유료(시간 단위 과금, 30일 약 4천 원대, VAT 별도). 서버를 정지해도 IP를 보유하면 과금 |
| VPC · Subnet · ACG | 무료 |
| 가입 | 본인인증과 신용/체크카드 등록 필요 |

무료 기간 종료일은 콘솔 **결제 정보 관리**에서 결제수단 등록 월을 확인해 메모해 둡니다. 서버를 그만 쓸 때는 서버 반납과 함께 **공인 IP도 반납**해야 과금이 멈춥니다.

## 1. 네트워크 (VPC · Subnet)

서버 한 대라 공개 서브넷 하나면 충분합니다. NAT Gateway는 유료이고 지금 구성에는 필요 없습니다.

1. **VPC → VPC Management → VPC 생성**: 이름 `hitoday-vpc`, IP 범위 `10.0.0.0/16`
2. **VPC → Subnet Management → Subnet 생성**

   | 항목 | 값 |
   | --- | --- |
   | 이름 | `hitoday-public` |
   | VPC | `hitoday-vpc` |
   | IP 범위 | `10.0.1.0/24` |
   | 가용 Zone | Micro 타입을 고를 수 있는 Zone (KR-1 또는 KR-2) |
   | Internet Gateway 전용 여부 | **Y (Public)** — 공인 IP를 붙이려면 필수 |
   | 용도 | 일반 |

## 2. 서버 생성 · 방화벽 · 공인 IP

1. **Server → 서버 생성** (VPC `hitoday-vpc`, Subnet `hitoday-public`)
   - 서버 이미지: Ubuntu 22.04 또는 24.04
   - 서버 타입: **Micro**
   - 인증키: 새로 만들고 `.pem` 파일 보관
2. **ACG(방화벽)** 인바운드 규칙

   | 프로토콜 | 포트 | 허용 대상 |
   | --- | --- | --- |
   | TCP | 22 | 내 IP만 |
   | TCP | 80 | 0.0.0.0/0 (인증서 발급) |
   | TCP | 443 | 0.0.0.0/0 (앱 · 다운로드 페이지) |

   8787은 Caddy 뒤에 있으므로 열지 않습니다. SSH가 갑자기 안 되면 내 IP가 바뀐 것이니 22번 허용 IP만 고칩니다. 네이버클라우드 Ubuntu 이미지는 OS 안에 별도 방화벽 규칙이 없어 ACG만 관리하면 됩니다.
3. **공인 IP** 신청 → 이 서버에 할당
4. **관리자 비밀번호 확인**: 서버 목록 → 서버 관리 및 설정 변경 → 관리자 비밀번호 확인 (`.pem` 필요). 이 비밀번호로 `root` 접속합니다.

## 3. DuckDNS

1. DuckDNS에서 서브도메인을 만들고 서버의 공인 IP를 넣습니다.
2. 네이버클라우드 공인 IP는 고정이라 주기적 갱신 cron은 필요 없습니다. 서버를 다시 만들어 IP가 바뀌면 DuckDNS에서 값만 고칩니다.
3. 확인: `nslookup <your-subdomain>.duckdns.org` → 공인 IP가 나오면 됩니다.

## 4. 서버 준비와 실행

네이버클라우드는 `root`로 바로 접속되므로 `sudo -i`가 필요 없습니다. 저장소는 `/root/hitoday`에 clone하고 이후 명령은 모두 root 셸에서 실행합니다. 메모리 1GB라 `setup-server.sh`가 만드는 스왑 1GB가 Docker 빌드에 필요합니다.

```bash
ssh root@<공인 IP>
git clone https://github.com/Manggae-ko/hitoday.git /root/hitoday
cd /root/hitoday
bash deploy/setup-server.sh        # Docker, Compose, git 설치 + 스왑 1GB
cd deploy
cp .env.example .env
chmod 600 .env
nano .env                          # DOMAIN=<your-subdomain>.duckdns.org, GITHUB_REPO=Manggae-ko/hitoday
docker compose up -d --build
curl https://<your-subdomain>.duckdns.org/health    # ok
```

`.env`의 토큰, 이메일 주소, 실제 서버 주소는 커밋하지 않습니다. 로그는 `docker compose logs -f`로 봅니다.

## 5. 자동 업데이트

```bash
bash /root/hitoday/deploy/install-auto-update.sh
tail -f /var/log/hitoday-update.log
```

cron이 2분마다 `deploy/auto-update.sh`를 실행하고 새 커밋이 있으면 Docker 이미지를 다시 빌드합니다. GitHub에서 서버로 SSH 접속하는 방식은 쓰지 않으므로 22번은 내 IP에만 열어둔 채로 둡니다. 지금 돌아가는 커밋은 `https://<your-subdomain>.duckdns.org/version`에서 확인합니다.

## 6. 앱이 이 서버를 보게 하기

GitHub 저장소 → Settings → Secrets and variables → Actions → **Variables**

- `HITODAY_SERVER=wss://<your-subdomain>.duckdns.org`
- `HITODAY_DOMAIN=<your-subdomain>.duckdns.org`

그다음 `package.json` 버전을 정하고 태그를 올리면(`git tag vX.Y.Z && git push origin vX.Y.Z`) 이 주소가 들어간 `HIToday-Setup.exe`가 Releases에 만들어집니다. `HITODAY_SERVER` 없이 태그를 올리면 localhost를 가리키는 설치본이 나오므로 반드시 먼저 설정합니다.

## 7. 통계 · 알림 (선택)

- **서버 통계**: `openssl rand -hex 24`로 값을 만들어 `.env`의 `STATS_TOKEN`에 넣고 `docker compose up -d` → `https://<your-subdomain>.duckdns.org/stats?token=<값>`
- **디스코드 알림**: 채널 설정 → 연동 → 웹후크 URL을 `.env`의 `NOTIFY_WEBHOOK_URL`에 넣고 `docker compose up -d`. 웹후크 주소는 비밀번호처럼 다룹니다.
- **죽었을 때 알림**: UptimeRobot 같은 외부 모니터에 `https://<your-subdomain>.duckdns.org/health`를 5분 간격으로 등록합니다.

## 8. 백업과 복구

relay 데이터 볼륨의 `device-keys.json`, `rooms.json`, `stats.json`, `schedules.json`을 정기적으로 백업해 별도 장소에 암호화해 보관합니다. `/root/hitoday/deploy`에서 실행합니다.

```bash
docker run --rm -v deploy_relay-data:/data -v "$PWD":/backup alpine tar czf /backup/hitoday-data-$(date +%F).tgz -C /data .
```

복구는 컨테이너를 멈추고 같은 볼륨에 풉니다.

```bash
docker compose down
docker run --rm -v deploy_relay-data:/data -v "$PWD":/backup alpine sh -c 'rm -rf /data/* && tar xzf /backup/hitoday-data-YYYY-MM-DD.tgz -C /data'
docker compose up -d
```

## 운영 메모

- 재시작해도 유지: 기기 키, 방, 일정, HTTPS 인증서. 사라지는 것: 방별 최근 대화 기록.
- 비용을 정하는 것은 서버 사양보다 나가는 트래픽입니다. 콘솔에서 트래픽 사용량을 가끔 확인합니다.
- Micro 1년 무료가 끝나기 전에 계속 쓸지 결정합니다. 그만둘 때는 서버와 공인 IP를 모두 반납하고, 저장 데이터와 `deploy/.env`를 백업해 둡니다.
