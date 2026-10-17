# 개발 가이드

## 로컬에서 실행

Node.js 22 이상이 필요해요.

```bash
npm install
npm test             # 테스트
npm run server       # 로컬 서버 (ws://localhost:8787, 다운로드 페이지 http://localhost:8787)
npm start            # 앱 (개발 모드에서는 설정 창에 서버 주소 칸이 보여요)
```

### 맥 한 대로 여러 명 테스트하기

```bash
npm run server
npm run demo:a    # 화면 왼쪽 절반을 A가 씀
npm run demo:b    # 화면 오른쪽 절반을 B가 씀
```

A에서 "새 방 만들기" → 초대 코드를 B에 입력하면 같은 방이 돼요. 각 절반이 한 사람의 화면이라 양쪽 모두에 두 캐릭터가 보이는 게 정상이에요.
(`demo:a`/`demo:b`는 맥·리눅스용이에요.)

### 그 밖의 스크립트

| 명령 | 하는 일 |
| --- | --- |
| `npm run snapshot -- <폴더>` | 화면을 띄우지 않고 방 화면·미니게임·설정 창·다운로드 페이지를 PNG로 저장 |
| `npm run load-test -- 5000` | 서버를 따로 띄우고 가짜 사용자 N명으로 부하 테스트 (메모리·CPU 출력) |
| `node scripts/make-sprites.js` | 기본 캐릭터 시트(11종 × 12색)와 미리보기 다시 그리기 |
| `npm run icons` | 앱 아이콘과 메뉴바 아이콘 다시 그리기 |
| `npm run dist:mac` / `npm run dist:win` | 설치 파일 만들기 |

## 구조

| 경로 | 역할 |
| --- | --- |
| `shared/protocol.js` | 앱과 서버가 같이 쓰는 메시지 형식과 검사 규칙 |
| `shared/avatar.js` | 올린 캐릭터 이미지 검사 (PNG, 크기, 용량) |
| `shared/characters.js`, `shared/colors.js` | 기본 캐릭터 목록, 방 색깔 |
| `server/relay.js` | 방 만들기·들어가기·나가기, 메시지·위치 전달, 접속 상태, 색 배정, 연타 방지 |
| `server/device-keys.js` | 기기 인증 (처음 접속한 기기만 그 코드를 쓸 수 있음, 해시만 저장) |
| `server/games.js`, `server/game-host.js` | 미니게임 결과 규칙, 게임 진행 (제한 시간·결과 발표) |
| `server/web.js`, `web/` | 다운로드 페이지, 다운로드 링크, 캐릭터 이미지 제공, `/health`, Google Analytics(선택) |
| `server/stats.js`, `server/stats-page.js` | 일별 사용량 숫자 세기, 운영자 통계 페이지 `/stats` |
| `src/main/` | Electron 메인: 프로필·기기 키 저장, 서버 연결, 창·트레이, 자동 실행 |
| `src/main/avatars.js` | 내 캐릭터 이미지 저장, 친구 이미지 내려받기·검증 |
| `src/renderer/overlay.*` | 투명한 전체 화면 창: 화면 아래 방 멤버 줄, 끌어서 옮기기 |
| `src/renderer/games.js` | 미니게임 연출 (간판, 스포트라이트, 가위바위보 버튼, 과녁) |
| `src/renderer/control.*` | 설정 창 (방 / 내 캐릭터 탭) |
| `src/renderer/sprites/`, `src/renderer/fonts/` | 캐릭터 시트, 갈무리 픽셀 폰트 |
| `scripts/sprites/` | 픽셀 캐릭터 그리기: 공통 몸통(`draw.js`), 캐릭터별 특징(`species.js`) |
| `deploy/` | 운영 서버 구성: Docker Compose, Caddy, 서버 준비 스크립트 |
| `.github/workflows/release.yml` | 태그를 푸시하면 맥·윈도우 설치 파일을 빌드해서 Releases에 올림 |
| `.github/workflows/deploy.yml` | main에 서버 코드를 푸시하면 테스트 후 서버에 자동 배포 |

## 서버 설정

| 환경변수 | 설명 |
| --- | --- |
| `PORT` | 기본 8787 |
| `GITHUB_REPO` | `owner/name`. 다운로드 버튼이 이 저장소의 최신 Release로 연결돼요 |
| `DATA_DIR` | 기기 키 해시와 일별 통계 저장 위치 (Docker에서는 `/data` 볼륨) |
| `GA_MEASUREMENT_ID` | 다운로드 페이지 Google Analytics 측정 ID (`G-...`). 비우면 꺼짐 |
| `STATS_TOKEN` | `/stats` 통계 페이지 비밀번호 (16자 이상). 비우면 페이지 없음 |

서버를 재시작해도 방은 유지돼요. 앱이 다시 접속할 때 자기 방 코드를 알려주면 서버가 방을 다시 만들어요. 최근 대화 기록과 캐릭터 이미지는 메모리에만 있어서, 대화 기록은 비고 이미지는 앱이 다시 보내요.

배포 방법은 [DEPLOY_NCLOUD.md](DEPLOY_NCLOUD.md)에 있어요. 같은 `deploy/` 구성으로 EC2·Lightsail 등 다른 곳에도 올릴 수 있어요.

## 설치 파일 배포

1. 저장소 → Settings → Secrets and variables → Actions → **Variables**에 `JAKDANG_SERVER = wss://<서버주소>` 추가
2. 버전 태그 푸시: `git tag v0.1.0 && git push origin v0.1.0`
3. GitHub Actions가 맥 `.dmg`와 윈도우 `.exe`를 만들어 Releases에 초안으로 올려요. 확인하고 Publish 하면 다운로드 페이지 버튼이 새 버전을 받아요.

## 알려진 한계

- 방은 한 번에 하나만 들어갈 수 있어요.
- 대화 기록은 서버 메모리에만 있어요 (방마다 최근 30개).
- 반응속도 게임에는 서버까지 가는 인터넷 속도 차이가 조금 섞여요.
- 앱 서명·공증 전이라 처음 열 때 경고가 떠요.
- 서버는 한 대 기준 설계예요 (상태를 메모리에 둠). 여러 대로 늘리려면 Redis 같은 공유 저장소가 필요해요.
