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

## 6. 자동 배포 (선택)

main에 서버 코드가 푸시되면 테스트 → 서버에서 자동으로 새 버전 실행.

1. 배포용 SSH 키 만들기 (내 컴퓨터에서)
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/jakdang_deploy -N ""
   ssh-copy-id -i ~/.ssh/jakdang_deploy.pub root@<공인 IP>
   ```
2. GitHub 저장소 → Settings → Secrets and variables → Actions → **Secrets**
   - `DEPLOY_HOST` = 공인 IP
   - `DEPLOY_USER` = `root`
   - `DEPLOY_SSH_KEY` = `~/.ssh/jakdang_deploy` 파일 내용 전체
3. 비공개 저장소라면 서버에서 `git pull`이 되도록 서버에 [deploy key](https://docs.github.com/ko/authentication/connecting-to-github-with-ssh/managing-deploy-keys)를 등록하세요.

## 7. 통계 보기

**서버 통계 (앱 사용량)**: 동시 접속, 열린 방, 새 설치, 메시지, 게임, 다운로드를 날짜별로 세요. 숫자만 세고 이름·코드·메시지 내용·IP는 기록하지 않아요.

1. 서버에서 비밀번호 만들기: `openssl rand -hex 24`
2. `~/jakdang/deploy/.env`에 `STATS_TOKEN=<만든 값>` 추가 → `docker compose up -d`
3. 브라우저에서 `https://jakdang.naegoworks.com/stats?token=<만든 값>` (북마크해 두면 편해요)

**다운로드 페이지 방문 (Google Analytics)**
1. [analytics.google.com](https://analytics.google.com)에서 속성 만들기 → 웹 스트림 URL `https://jakdang.naegoworks.com`
2. 측정 ID(`G-XXXXXXXXXX`)를 `.env`의 `GA_MEASUREMENT_ID=`에 넣고 `docker compose up -d`
3. 다운로드 버튼 클릭은 `download` 이벤트(platform: mac/win)로 들어가요. 페이지 하단에 GA 사용 안내 문구가 자동으로 붙어요.

## 운영 메모

- **업데이트**: `cd ~/jakdang && git pull && cd deploy && docker compose up -d --build`
- **재시작해도 유지되는 것**: 기기 키(누가 어떤 코드의 주인인지), HTTPS 인증서
- **재시작하면 사라지는 것**: 대화 기록(방마다 최근 30개). 방과 캐릭터 이미지는 앱이 다시 접속하면서 복구돼요.
- **용량 감**: 로컬 부하 테스트에서 동시 접속 5,000명이 메모리 약 110MB, CPU 한 코어의 9% 정도였어요 (`npm run load-test -- 5000`). Micro(1GB)로 충분하고, 늘어나면 서버 사양만 올리면 돼요.
- **비용을 정하는 건 트래픽**: 서버 사양보다 나가는 트래픽이 요금에 영향을 줘요. 콘솔에서 트래픽 사용량을 가끔 확인하세요.
- **무료 기간**: Micro 서버는 1년 뒤 자동 과금돼요. 날짜를 메모해 두세요.
- **모니터링**: UptimeRobot 같은 무료 서비스에 `https://jakdang.naegoworks.com/health`를 등록하면 서버가 죽었을 때 알림을 받을 수 있어요.
