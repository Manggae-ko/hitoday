# BRIEF — 오늘뭐해? (HIToday) 포크 구축

작성 2026-10-30 · 총괄: Claude (Fable 5.1) · 모드: Orca 감독형 병렬 분담

## 목표 (완료됐을 때 존재하는 것)
`/Users/miseonko/orca/personal/hitoday` 에 "오늘뭐해?(HIToday)" 앱 저장소가 존재한다:
원본 jakdang 의 그림(캐릭터 11종·아이콘)이 **고양이·강아지·토끼 3종 신규 디자인**과 새 아이콘으로 전부 교체되고,
이름·문구·식별자가 HIToday 로 바뀌고, Windows 전용 릴리즈 워크플로와 Oracle Free + 무료 서브도메인 배포 런북이 있으며,
**일정 기반 캐릭터 상태**(등록·오프라인 멤버 표시·방 일정표) 기능이 테스트와 함께 동작한다. `npm test` 가 통과한다.

## 근거 (절대경로)
- 원본 분석·설계 (vault):
  - /Users/miseonko/Mideas/10_Projects/jakdang/_hub.md
  - /Users/miseonko/Mideas/10_Projects/jakdang/03_배포운영/포크-재배포-검토.md
  - /Users/miseonko/Mideas/10_Projects/jakdang/03_배포운영/D-2026-10-29-포크-용도-서버-그림.md
  - /Users/miseonko/Mideas/10_Projects/jakdang/01_아키텍처/일정-기반-캐릭터-상태-설계.md
  - /Users/miseonko/Mideas/10_Projects/jakdang/01_아키텍처/서버-릴레이-프로토콜.md
  - /Users/miseonko/Mideas/10_Projects/jakdang/01_아키텍처/클라이언트-Electron-구조.md
- 원본 체크아웃(읽기 전용 참조, 수정 금지): /Users/miseonko/orca/personal/jakdang
- 저장소: https://github.com/Manggae-ko/hitoday (main) · upstream = https://github.com/donghyeun02/jakdang

## 결정 사항 (재질문 금지)
| 항목 | 값 |
|---|---|
| 용도 | 개인(지인 3명), 비상업 |
| 앱 이름 | 한글 표시 **오늘뭐해?** / 영문 slug·productName **HIToday** / appId `app.hitoday.desktop` / npm name `hitoday` |
| 플랫폼 | Windows 전용 (NSIS oneClick). mac 빌드·서명 제거 |
| 캐릭터 | 고양이 `cat` · 강아지 `dog` · 토끼 `rabbit` 3종 × 방 색 12. 원본과 다른 실루엣·비율·눈·색. 기본 캐릭터 = cat |
| 서버 | Oracle Always Free(ARM) 우선. 접속 주소 가정: 무료 서브도메인 + Caddy wss (환경변수로 주입, 코드에 하드코딩 금지) |
| 저장소 | Manggae-ko/hitoday 공개. publish owner/repo 를 이 값으로 |
| 상태 종류 | 연차 leave · 오전반차 half-am · 오후반차 half-pm · 외근 out · 재택 remote · 출장 trip · 따점(점심 약속) lunch · 자유 메모(≤12자) |
| 일정 조회 | 설정창 "일정" 탭 = 내 일정 편집 + 방 일정표(행=멤버, 열=오늘부터 14일) |
| 라이선스 | 코드 PolyForm NC 유지, `LICENSE` 의 `Required Notice:` 줄 보존. README 에 원본 출처 1줄. `LICENSE-ASSETS.md` 는 새 자산 저작권(사용자)으로 재작성 |

## 아키텍처 경계 (원본 유지)
main 프로세스가 상태·검증·ws 를 가짐 / renderer 는 그리기만 / `shared/` 는 양쪽 공용 / 서버는 메모리 중계 + `DATA_DIR` 영속(기기 키·방 사용 시각·통계·**일정**).
게임 결과·상태 계산은 서버 권위. 모든 입력 검증은 `shared/` 함수로 3중(renderer→main→server).

## 금지 사항
- `/Users/miseonko/orca/personal/jakdang` 수정 금지. 원본 스프라이트·아이콘 PNG 및 `scripts/sprites/draw.js`·`species.js` 의 재사용·부분 복제 금지(새 파일로 작성).
- 서버 주소·토큰·웹훅 하드코딩 금지. 비밀값 커밋 금지.
- 워커의 push·PR 금지. 통합·push 는 총괄이 사용자 확인 후.
- `LICENSE` 본문 수정 금지. 원본 작자 표기 삭제 금지.

## 수락 증거 (총괄이 직접 실행)
1. `npm test` exit 0 (기존 15 파일 + 신규 schedules 테스트).
2. 금지 문자열 0건: `grep -rniE "작당모의|jakdang|naegoworks|donghyeun02" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=_work --exclude-dir=dist .` 의 결과가 `LICENSE`(Required Notice)와 `README.md` 출처 1줄, `THIRD_PARTY_NOTICES.md` 외 0건.
3. 원본 자산 해시 0건 일치: `_work/original_asset_hashes.txt` 의 sha256 이 `src/renderer/sprites/ build/ assets/ web/sprites/ docs/` 어느 파일과도 같지 않음.
4. `shared/characters.js` 의 CHARACTER_IDS == ['cat','dog','rabbit'], `src/renderer/character.js` 동일, 스프라이트 36장(3×12) 존재, `tests/assets.test.js` 통과.
5. `.github/workflows/release.yml` 에 `macos` 0건, `npm pkg get build.publish.owner build.publish.repo` == Manggae-ko / hitoday, `build.productName` == HIToday.
6. 일정 기능: relay 테스트에서 (a) 오프라인 멤버의 오늘 연차가 snapshot `status` 로 노출 (b) 재시작 후 `DATA_DIR/schedules.json` 에서 복구 (c) snapshot 멤버에 `schedule` 목록 포함 (d) 본인 외 수정 거부.
7. `npm run snapshot -- _work/snap` 이 설정창 일정 탭 PNG 를 생성(렌더 확인).
8. 문서: README·docs/DEVELOPMENT.md·docs/DEPLOY_ORACLE.md(신규) 가 새 이름·절차를 반영. `render.yaml`·`docs/MAC_SIGNING.md`·`build/mac-locales`·`build/entitlements.mac.plist` 제거.
9. (가능 시) `npx electron-builder --win --publish never` 로 `dist/HIToday-Setup.exe` 생성. macOS 에서 실패하면 "미실시" 로 기록하고 CI 에서 확인.

## 파동 (plan 스킬에서 확정)
- 파동 1 (병렬): [B] 캐릭터·아이콘 생성기 신규 (Codex) · [C] 리브랜딩·Windows 전용 CI·배포 런북 (Antigravity 또는 Codex)
- 파동 2 (파동 1 통합 후, 병렬): [A1] 서버·프로토콜·일정 영속·테스트 (Codex) · [A2] 앱 main/renderer 일정 탭·방 일정표·overlay 상태 (Claude)
- 각 파동 뒤 검수 1라운드(code-reviewer + critic/architect, 반대편 하네스), 통합본 최종 리뷰 1회.
