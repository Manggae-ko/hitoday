# 작당모의

초대 코드 하나로 친구들 캐릭터가 서로의 바탕화면 아래에 모여 사는 앱이에요. 맥과 윈도우 둘 다 돼요.

- **방 = 단톡방**: "새 방 만들기"를 누르면 초대 코드가 나와요. 친구들은 그 코드로 들어와요 (최대 12명).
- 같은 방 사람들 캐릭터가 모두 각자 화면 아래에 한 줄로 서 있어요. 내 캐릭터는 맨 오른쪽이에요.
- 누가 말하면 모든 사람 화면에서 그 사람 캐릭터 위에 말풍선이 떠요. 설정 창에는 단톡처럼 대화 기록이 쌓여요.
- 새로 들어온 사람은 왼쪽에서 걸어 들어오고, 나간 사람은 걸어 나가요. 앱이 꺼진 사람은 흐리게 졸고 있어요.
- 방 안에서는 서버가 색을 하나씩 나눠줘서 모두 다른 색이고, 모든 화면에서 같은 색으로 보여요.
- 화면 내용은 절대 주고받지 않아요. 오가는 건 이름, 캐릭터, 짧은 말뿐이에요.

### 미니게임 (접속한 사람 2명 이상)

| 게임 | 하는 법 |
| --- | --- |
| ☕ 커피 뽑기 | 스포트라이트가 캐릭터 사이를 튀다가 한 명한테 멈춰요 |
| ✊ 가위바위보 | 내 캐릭터 위에 뜬 ✊✌️✋ 중 하나 고르기 (10초) |
| ⚡ 반응속도 | "지금!"이 뜨면 내 캐릭터 클릭. 미리 누르면 부정출발 |

결과는 서버가 정해서 모든 화면에 같은 장면이 나와요. 결과는 대화 기록에도 남아요.

### 캐릭터

기본 캐릭터 11종(말랑이, 고양이, 강아지, 토끼, 곰, 펭귄, 병아리, 개구리, 햄스터, 유령, 여우) 중에 고를 수 있어요.
같은 동물을 골라도 캐릭터 위 이름표로 구분돼요. 설정 창에서 내 PNG를 올리면 같은 방 사람들한테도 그 그림으로 보여요.
규격, 템플릿, AI 프롬프트는 [`docs/CHARACTER_GUIDE.md`](docs/CHARACTER_GUIDE.md)에 있어요.

## 사용자

다운로드 페이지(`https://<서버주소>/`)에서 맥 또는 윈도우 버튼을 누르면 돼요.

- **맥**: `.dmg`를 열고 작당모의를 응용 프로그램 폴더로 끌어다 놓기
- **윈도우**: `.exe` 더블클릭 (내 계정에만 설치돼서 관리자 권한이 필요 없어요)

설치하고 나면 컴퓨터를 켤 때 자동으로 실행돼요. 서버 주소는 앱에 들어 있어서 따로 입력할 게 없어요.

> 아직 앱 서명을 안 해서 처음 열 때 경고가 떠요.
> - 맥: 시스템 설정 → 개인정보 보호 및 보안 → "그래도 열기"
> - 윈도우: "추가 정보" → "실행"
>
> 회사 컴퓨터: 회사가 승인되지 않은 앱 실행을 막아뒀다면 쓸 수 없어요. 이건 회사 보안 정책이라 우회하지 않아요.

## 운영자 (서버는 내가 직접 띄움)

### 1. 서버 띄우기

서버 하나가 방 중계, 다운로드 페이지, 기기 인증을 같이 맡아요. 운영 주소는 `jakdang.naegoworks.com`이에요.

- **네이버클라우드 (현재 계획)**: 단계별 가이드는 [`docs/DEPLOY_NCLOUD.md`](docs/DEPLOY_NCLOUD.md).
  `deploy/`의 Docker Compose가 서버와 Caddy(자동 HTTPS)를 같이 띄워요.
- **다른 곳 (EC2·Lightsail 등)**: 같은 `deploy/` 구성을 그대로 쓰면 돼요.
- **Render 무료 체험**: `render.yaml` 사용. 한동안 접속이 없으면 잠들고, 디스크가 없어서 기기 키가 재시작 때 초기화돼요.

| 환경변수 | 설명 |
| --- | --- |
| `PORT` | 기본 8787 |
| `GITHUB_REPO` | `내아이디/jakdang`. 다운로드 버튼이 이 저장소의 최신 Release로 연결돼요. |
| `DATA_DIR` | 기기 키 해시 저장 위치 (Docker에서는 `/data` 볼륨) |

확인: `https://<서버주소>/health`가 `ok`, `https://<서버주소>/`가 다운로드 페이지.

서버를 재시작해도 방은 유지돼요. 앱이 다시 접속할 때 자기 방 코드를 알려주면 서버가 방을 다시 만들어요.
(최근 대화 기록은 메모리에만 있어서 재시작하면 비어요.)

### 2. 설치 파일 배포

1. GitHub 저장소 → Settings → Secrets and variables → Actions → **Variables**에 `JAKDANG_SERVER = wss://<서버주소>` 추가
2. 버전 태그 푸시: `git tag v0.1.0 && git push origin v0.1.0`
3. GitHub Actions가 맥 `.dmg`와 윈도우 `.exe`를 만들어 Releases에 초안으로 올려요. 확인하고 Publish 하면 다운로드 페이지 버튼이 바로 새 버전을 받아요.

윈도우 PC가 없어도 윈도우 버전이 만들어져요.

## 개발

```bash
npm install
npm test             # 테스트
npm run server       # 로컬 서버 (ws://localhost:8787, 다운로드 페이지는 http://localhost:8787)
npm start            # 앱
```

### 맥 한 대로 여러 명 테스트하기

```bash
npm run server
npm run demo:a    # 화면 왼쪽 절반
npm run demo:b    # 화면 오른쪽 절반
```

A에서 "새 방 만들기" → 초대 코드를 B에 입력하면 둘이 같은 방이 돼요.
각 절반이 한 사람의 화면이라, 양쪽 모두에 두 캐릭터가 보이는 게 정상이에요.
(`demo:a`/`demo:b`는 맥·리눅스용이에요. 개발 모드에서만 설정 창에 서버 주소 칸이 보여요.)

## 구조

| 경로 | 역할 |
| --- | --- |
| `shared/protocol.js` | 앱과 서버가 같이 쓰는 메시지 형식과 검사 규칙 |
| `shared/avatar.js` | 올린 캐릭터 이미지 검사 (PNG, 크기, 용량) |
| `server/relay.js` | 방 만들기·들어가기·나가기, 메시지 전달, 접속 상태, 색 배정, 캐릭터 이미지, 연타 방지 |
| `server/games.js`, `server/game-host.js` | 미니게임 결과 규칙, 게임 진행(제한 시간·결과 발표) |
| `server/web.js`, `web/index.html` | 다운로드 페이지, 다운로드 링크 연결, 캐릭터 이미지 제공, `/health` |
| `src/main/avatars.js` | 내 캐릭터 이미지 저장, 친구 이미지 내려받기 |
| `src/renderer/games.js` | 미니게임 연출 (간판, 스포트라이트, 가위바위보 버튼, 과녁) |
| `src/renderer/sprites/` | 기본 캐릭터 11종 × 12색 시트 (`scripts/make-sprites.js`로 생성) |
| `scripts/sprites/` | 픽셀 캐릭터 그리기: 공통 몸통(`draw.js`), 캐릭터별 특징(`species.js`) |
| `shared/characters.js` | 기본 캐릭터 목록 |
| `build/icon.png`, `assets/tray*.png` | 앱 아이콘(1024px)과 메뉴바 아이콘 (`scripts/make-icons.js`로 생성) |
| `docs/CHARACTER_GUIDE.md` | 캐릭터 규격, 템플릿, AI 이미지 프롬프트 |
| `src/main/` | Electron 메인: 프로필 저장, 서버 연결, 창·트레이, 자동 실행 |
| `src/renderer/overlay.*` | 투명한 전체 화면 창, 화면 아래 방 멤버 줄 (캐릭터가 없는 곳은 클릭이 바탕화면으로 통과) |
| `src/renderer/control.*` | 방 만들기·들어가기, 초대 코드, 멤버, 대화 |
| `scripts/snapshot.js` | 화면을 띄우지 않고 렌더링해서 PNG로 저장 (`npm run snapshot -- <폴더>`) |
| `.github/workflows/release.yml` | 태그를 푸시하면 맥·윈도우 설치 파일을 빌드해서 Releases에 올림 |
| `.github/workflows/deploy.yml` | main에 서버 코드를 푸시하면 테스트 후 서버에 자동 배포 |
| `deploy/` | 운영 서버 구성: Docker Compose, Caddy, 서버 준비 스크립트 |
| `server/device-keys.js` | 기기 인증 (처음 접속한 기기만 그 코드를 쓸 수 있음) |
| `scripts/load-test.js` | 부하 테스트 (`npm run load-test -- 5000`) |

## 아직 안 된 것

- 방은 한 번에 하나만 들어갈 수 있어요.
- 대화 기록은 서버 메모리에만 있어요 (방마다 최근 30개). 캐릭터 이미지도 메모리에만 있지만, 앱이 접속할 때마다 다시 보내요.
- 반응속도 게임은 서버까지 가는 인터넷 속도 차이가 조금 섞여요.
- 앱 서명·공증이 아직 안 돼 있어요 (맥은 Apple 개발자 계정, 연 $99).
- 앱 아이콘이 아직 Electron 기본 아이콘이에요.

## 라이선스

- **코드**: [PolyForm Noncommercial 1.0.0](LICENSE). 비상업적 용도(공부, 개인 사용, 연구 등)로는 자유롭게 쓸 수 있고, 상업적으로 쓰려면 허락이 필요해요.
- **캐릭터·그림·디자인**: All rights reserved. [LICENSE-ASSETS.md](LICENSE-ASSETS.md)
- **외부 저작물**(갈무리 폰트 등): [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

© 2026 donghyeun02
