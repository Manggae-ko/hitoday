# 개발 가이드

Node.js 22 이상이 필요합니다.

```bash
npm install
npm test
npm run server
npm start
```

두 앱을 나란히 확인하려면 서버를 켠 뒤 `npm run demo:a`와 `npm run demo:b`를 각각 실행합니다. 설치 파일은 `npm run dist:win`으로 만듭니다.

## 구조

| 경로 | 역할 |
| --- | --- |
| `shared/` | 앱과 서버가 공유하는 프로토콜·검증 규칙 |
| `server/relay.js` | 방, 대화, 접속 상태와 게임을 중계하는 서버 |
| `server/schedules.js` | 일정 저장과 상태 계산(예정) |
| `server/web.js`, `web/` | 다운로드·개인정보·통계 웹 페이지 |
| `src/main/` | Electron 메인 프로세스와 서버 연결 |
| `src/main/schedule-view.js` | 일정 표 표시 모델 생성(예정) |
| `src/renderer/` | 설정 창과 바탕화면 오버레이 |
| `deploy/` | Docker Compose, Caddy, 서버 준비와 자동 업데이트 |

## 환경변수

| 환경변수 | 설명 |
| --- | --- |
| `HITODAY_SERVER` | 앱이 접속할 WebSocket 주소 |
| `HITODAY_PROFILE` | 로컬 다중 실행 프로필 |
| `HITODAY_REGION` | 데모 창 배치(`left` 또는 `right`) |
| `PORT` | 서버 포트, 기본 8787 |
| `DATA_DIR` | 서버 영속 데이터 디렉터리 |
| `GITHUB_REPO` | 다운로드할 Release 저장소(`owner/name`) |
| `GIT_COMMIT` | 서버 `/version`에 표시할 커밋 해시(`auto-update.sh`가 주입) |
| `GA_MEASUREMENT_ID` | 선택적 Google Analytics 측정 ID |
| `STATS_TOKEN` | `/stats` 접근 토큰(16자 이상) |
| `NOTIFY_WEBHOOK_URL` | 선택적 운영 알림 Webhook URL |

`DATA_DIR`에는 `device-keys.json`, `rooms.json`, `stats.json`, `schedules.json`이 저장됩니다. 실제 비밀값과 토큰은 커밋하지 말고 `deploy/.env`에만 둡니다.

GitHub Actions Variables에는 `HITODAY_SERVER=wss://<your-subdomain>.duckdns.org`와 `HITODAY_DOMAIN=<your-subdomain>.duckdns.org`를 설정합니다. 배포 절차는 [Oracle Cloud 배포 런북](DEPLOY_ORACLE.md)을 참고하세요.

## 알려진 한계

- 대화 기록과 캐릭터 이미지는 서버 재시작 시 사라집니다.
- Windows 코드 서명 전에는 SmartScreen 경고가 나타날 수 있습니다.
- 서버는 단일 인스턴스 구성을 전제로 합니다.
