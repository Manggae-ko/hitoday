# 놀러와

친구 바탕화면에 내 캐릭터가 놀러 가서 같이 얘기하는 앱이에요. 맥과 윈도우 둘 다 돼요.

- 내 캐릭터는 화면 오른쪽 아래에 살아요. 내가 보낸 말은 내 캐릭터 말풍선에 떠요.
- 친구가 말을 걸면 친구 캐릭터가 화면 왼쪽에서 걸어 들어와서 말풍선으로 얘기해요. 1분 동안 조용하면 손 흔들고 나가요.
- 친구 화면에서도 똑같은 장면이 좌우만 바뀌어서 보여요. 양쪽 다 계속 주고받을 수 있어요.
- 친구 앱이 꺼져 있으면 메시지는 서버에 맡겨뒀다가(최대 24시간), 친구가 켜면 바로 전달돼요.
- 서로의 코드를 등록한 친구끼리만 얘기할 수 있어요. 화면 내용은 절대 주고받지 않아요.

## 사용자 (비개발자)

[Releases](../../releases)에서 맥은 `.dmg`, 윈도우는 `.exe`를 받아서 설치하면 끝이에요.
설정 창에서 내 코드를 친구한테 알려주고, 친구 코드를 등록하면 돼요.

> 아직 앱 서명을 안 해서 처음 열 때 경고가 떠요.
> - 맥: 시스템 설정 → 개인정보 보호 및 보안 → "그래도 열기"
> - 윈도우: "추가 정보" → "실행"

## 운영자 (나)

### 1. 서버 띄우기 (한 번만)

사용자는 서버를 몰라도 돼요. 내가 하나 띄워두고, 그 주소를 앱에 넣어서 배포해요.

- **Render (무료로 시작)**: render.com → New → Blueprint → 이 저장소 선택. `render.yaml`대로 올라가요.
  무료 플랜은 한동안 접속이 없으면 잠들어서, 첫 연결에 30초쯤 걸릴 수 있어요.
- **직접 서버 (EC2·Lightsail 등)**: `docker build -f server/Dockerfile -t nolleowa-relay .` → `docker run -p 8787:8787 nolleowa-relay`.
  앞에 HTTPS(wss) 프록시(Caddy·nginx)를 두세요.

살아 있는지는 `https://<서버주소>/health`가 `ok`를 주는지로 확인해요.

### 2. 설치 파일 배포

1. GitHub 저장소 → Settings → Secrets and variables → Actions → **Variables**에 `NOLLEOWA_SERVER = wss://<서버주소>` 추가
2. 버전 태그 푸시: `git tag v0.1.0 && git push origin v0.1.0`
3. GitHub Actions가 맥 `.dmg`와 윈도우 `.exe`를 만들어서 Releases에 초안으로 올려요. 확인하고 Publish 하면 돼요.

윈도우 PC가 없어도 윈도우 버전이 만들어져요.

## 개발

```bash
npm install
npm test             # 테스트
npm run server       # 로컬 중계 서버 (ws://localhost:8787)
npm start            # 앱
```

### 맥 한 대로 둘이 얘기하는 장면 테스트 (릴스 촬영용)

```bash
npm run server
npm run demo:a    # 화면 왼쪽 절반을 A가 씀
npm run demo:b    # 화면 오른쪽 절반을 B가 씀
```

A와 B 설정 창에 서로의 코드를 친구 코드로 넣고 저장한 다음 말을 걸어 보세요. 화면이 반씩 나뉘어서 모니터 두 대를 나란히 둔 것처럼 보여요.
(`demo:a`/`demo:b`는 맥·리눅스용이에요.)

## 구조

| 경로 | 역할 |
| --- | --- |
| `shared/protocol.js` | 앱과 서버가 같이 쓰는 메시지 형식과 검사 규칙 |
| `server/relay.js` | 친구 사이 메시지 중계, 꺼져 있는 친구용 대기열, 연타 방지, `/health` |
| `src/main/` | Electron 메인: 프로필 저장, 서버 연결, 창·트레이 |
| `src/renderer/overlay.*` | 투명한 전체 화면 창과 캐릭터 연출 (캐릭터가 없는 곳은 클릭이 바탕화면으로 통과) |
| `src/renderer/control.*` | 대화 기록, 보내기, 내 코드, 친구 코드 설정 창 |
| `scripts/snapshot.js` | 화면을 띄우지 않고 렌더링해서 PNG로 저장 (`npm run snapshot -- <폴더>`) |
| `.github/workflows/release.yml` | 태그를 푸시하면 맥·윈도우 설치 파일을 빌드해서 Releases에 올림 |

## 아직 안 된 것

- 내 코드를 아는 사람은 나인 척 접속할 수 있어요. 공개 배포 전에 기기별 비밀 키를 붙여야 해요.
- 친구는 한 명만 등록할 수 있어요.
- 서버를 재시작하면 대기 중인 메시지가 사라져요. 지금은 메모리에만 저장해요.
- 앱 서명·공증이 아직 안 돼 있어요 (맥은 Apple 개발자 계정, 연 $99).
- 앱 아이콘이 아직 Electron 기본 아이콘이에요.
