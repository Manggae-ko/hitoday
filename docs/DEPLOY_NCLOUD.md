# 네이버클라우드에 서버 올리기

목표: `https://jakdang.naegoworks.com` 에서 다운로드 페이지가 뜨고, 앱이 `wss://jakdang.naegoworks.com` 으로 접속하게 하기.

구성: Micro 서버 1대 + Docker로 서버 실행 + **Caddy**가 HTTPS 인증서를 자동으로 받고 갱신.

```
사용자 앱 ──wss──▶ Caddy (443, 자동 HTTPS) ──▶ 작당모의 서버 (8787) ── /data (기기 키 해시)
브라우저  ──https─▶          〃              ──▶ 다운로드 페이지
```

> 콘솔 메뉴 이름은 네이버클라우드 화면 개편에 따라 조금 다를 수 있어요.

## 0. 네트워크 (VPC · 서브넷)

서버 한 대짜리라 공개 서브넷 하나면 충분해요. Private 서브넷·NAT Gateway는 DB 같은 내부 서버가 생길 때 추가하세요 (NAT Gateway는 유료).

1. **VPC → VPC Management → VPC 생성**
   | 항목 | 값 |
   | --- | --- |
   | VPC 이름 | `jakdang-vpc` |
   | IP 주소 범위 | `10.0.0.0/16` |
2. **VPC → Subnet Management → Subnet 생성**
   | 항목 | 값 |
   | --- | --- |
   | 서브넷 이름 | `jakdang-public` |
   | VPC | `jakdang-vpc` |
   | IP 주소 범위 | `10.0.1.0/24` |
   | 가용 Zone | `KR-2` 또는 `KR-1` (Micro 서버를 고를 수 있는 Zone인지 확인) |
   | Network ACL | 기본값 (방화벽은 ACG에서 관리) |
   | Internet Gateway 전용 여부 | **Y (Public)** — 공인 IP로 접속해야 하므로 필수 |
   | 용도 | 일반 |

## 1. 서버 만들기 (콘솔)

1. **Server → 서버 생성** (VPC `jakdang-vpc`, 서브넷 `jakdang-public` 선택)
   - 서버 이미지: **Ubuntu 22.04 또는 24.04**
   - 서버 타입: **Micro** (1년 무료 대상, 1인 1대)
   - 인증키: 새로 만들고 `.pem` 파일을 잘 보관하기
2. **ACG(방화벽) 규칙** — 서버에 연결된 ACG에 인바운드 추가
   | 프로토콜 | 포트 | 허용 대상 |
   | --- | --- | --- |
   | TCP | 22 | **내 IP만** (SSH) |
   | TCP | 80 | 0.0.0.0/0 (인증서 발급용) |
   | TCP | 443 | 0.0.0.0/0 (앱·다운로드 페이지) |

   서버 내부 포트(8787)는 Caddy 뒤에 있어서 열 필요 없어요. SSH가 갑자기 안 되면 내 IP가 바뀐 거라, 22번 허용 IP만 고치면 돼요.
3. **공인 IP** 신청 → 이 서버에 할당 (공인 IP는 무료 대상이 아니라 크레딧에서 차감돼요)
4. **관리자 비밀번호 확인**: 서버 목록 → 서버 관리 및 설정 변경 → 관리자 비밀번호 확인 (`.pem` 파일 필요)

## 2. 도메인 연결

`naegoworks.com`을 산 곳(가비아, 카페24, Cloudflare 등)의 DNS 설정에서:

| 타입 | 이름 | 값 |
| --- | --- | --- |
| A | `jakdang` | 서버 공인 IP |

몇 분 뒤 확인: `nslookup jakdang.naegoworks.com` → 공인 IP가 나오면 성공.

> Cloudflare를 쓴다면 처음엔 **프록시를 끄고(DNS only, 회색 구름)** 설정해 주세요. Caddy가 인증서를 받을 수 있어야 해요.

## 3. 서버 준비 (한 번만)

```bash
ssh root@<공인 IP>                         # 관리자 비밀번호 입력
curl -fsSL https://raw.githubusercontent.com/<아이디>/jakdang/main/deploy/setup-server.sh -o setup.sh
less setup.sh                               # 내용 확인 후
bash setup.sh                               # Docker, git 설치 + 스왑 1GB
```

저장소가 비공개라면 `setup-server.sh` 내용을 복사해서 붙여 넣어도 돼요.

## 4. 실행

```bash
git clone https://github.com/<아이디>/jakdang.git ~/jakdang
cd ~/jakdang/deploy
cp .env.example .env
nano .env        # DOMAIN=jakdang.naegoworks.com, GITHUB_REPO=<아이디>/jakdang
docker compose up -d --build
```

확인
- `curl https://jakdang.naegoworks.com/health` → `ok`
- 브라우저에서 `https://jakdang.naegoworks.com` → 다운로드 페이지
- 로그: `docker compose logs -f`

## 5. 앱이 이 서버를 보게 하기

GitHub 저장소 → Settings → Secrets and variables → Actions → **Variables**
- `JAKDANG_SERVER` = `wss://jakdang.naegoworks.com`

그다음 태그를 올리면(`git tag v0.1.0 && git push origin v0.1.0`) 이 주소가 들어간 맥·윈도우 설치 파일이 만들어져요.

## 6. 자동 배포

서버가 **2분마다 GitHub를 확인해서 새 커밋이 있으면 스스로 업데이트**해요. 밖에서 서버로 들어올 필요가 없어서 SSH(22번)는 내 IP에만 열어둔 채로 쓸 수 있어요.

서버에서 한 번만:
```bash
cd ~/jakdang && git pull
bash ~/jakdang/deploy/install-auto-update.sh
```

- 업데이트 기록: `tail -f /var/log/jakdang-update.log`
- 지금 돌아가는 커밋: `https://jakdang.naegoworks.com/version`
- GitHub Actions의 `deploy`는 테스트를 돌린 뒤, 서버의 `/version`이 새 커밋으로 바뀔 때까지 기다려서 배포가 됐는지 확인해요.
- GitHub에서 서버로 SSH 접속하는 방식은 쓰지 않아요. `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` 시크릿은 지워도 돼요.

## 7. 통계 보기

**서버 통계 (앱 사용량)**: 동시 접속, 열린 방, 새 설치, 메시지, 게임, 다운로드를 날짜별로 세요. 숫자만 세고 이름·코드·메시지 내용·IP는 기록하지 않아요.

1. 서버에서 비밀번호 만들기: `openssl rand -hex 24`
2. `~/jakdang/deploy/.env`에 `STATS_TOKEN=<만든 값>` 추가 → `docker compose up -d`
3. 브라우저에서 `https://jakdang.naegoworks.com/stats?token=<만든 값>` (북마크해 두면 편해요)

**다운로드 페이지 방문 (Google Analytics)**
1. [analytics.google.com](https://analytics.google.com)에서 속성 만들기 → 웹 스트림 URL `https://jakdang.naegoworks.com`
2. 측정 ID(`G-XXXXXXXXXX`)를 `.env`의 `GA_MEASUREMENT_ID=`에 넣고 `docker compose up -d`
3. 다운로드 버튼 클릭은 `download` 이벤트(platform: mac/win)로 들어가요. 페이지 하단에 GA 사용 안내 문구가 자동으로 붙어요.

## 8. 알림 받기 (디스코드)

서버가 디스코드 채널에 짧게 알려줘요: 🐥 새 사용자 첫 접속, 🏠 새 방, 👥 방에 친구 입장, 🔄 서버 켜짐, ⏹ 서버 꺼짐. 1분 안에 몰린 알림은 한 메시지로 묶어서 보내요. 닉네임은 들어가지만 방 코드와 대화 내용은 보내지 않아요.

1. 디스코드 채널 설정 → 연동 → 웹후크 → 새 웹후크 → 웹후크 URL 복사
2. `~/jakdang/deploy/.env`에 `NOTIFY_WEBHOOK_URL=<복사한 주소>` 추가 → `docker compose up -d`
3. "🔄 서버가 켜졌어요" 메시지가 오면 연결된 거예요.

웹후크 주소를 아는 사람은 누구나 그 채널에 글을 쓸 수 있으니 비밀번호처럼 다뤄요. 새어 나갔으면 디스코드에서 그 웹후크를 지우고 새로 만들어 바꾸면 돼요.

**서버가 죽었을 때**는 서버가 스스로 알릴 수 없어서 바깥에서 지켜봐야 해요. [UptimeRobot](https://uptimerobot.com)(무료)에 HTTP(s) 모니터로 `https://jakdang.naegoworks.com/health`를 5분 간격으로 등록하고, 알림 연락처에 같은 디스코드 웹후크를 추가하면 같은 채널로 와요.

## 운영 메모

- **바로 업데이트**: `bash ~/jakdang/deploy/auto-update.sh` (새 커밋이 있을 때만 다시 빌드해요)
- **재시작해도 유지되는 것**: 기기 키(누가 어떤 코드의 주인인지), HTTPS 인증서
- **재시작하면 사라지는 것**: 대화 기록(방마다 최근 30개). 방과 캐릭터 이미지는 앱이 다시 접속하면서 복구돼요.
- **용량 감**: 로컬 부하 테스트에서 동시 접속 5,000명이 메모리 약 110MB, CPU 한 코어의 9% 정도였어요 (`npm run load-test -- 5000`). Micro(1GB)로 충분하고, 늘어나면 서버 사양만 올리면 돼요.
- **비용을 정하는 건 트래픽**: 서버 사양보다 나가는 트래픽이 요금에 영향을 줘요. 콘솔에서 트래픽 사용량을 가끔 확인하세요.
- **무료 기간**: Micro 서버는 1년 뒤 자동 과금돼요. 날짜를 메모해 두세요.
- **모니터링**: UptimeRobot 같은 무료 서비스에 `https://jakdang.naegoworks.com/health`를 등록하면 서버가 죽었을 때 알림을 받을 수 있어요.
