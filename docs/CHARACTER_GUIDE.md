# 캐릭터 만들기 가이드

## 기본 캐릭터 11종

설정 창 → 내 캐릭터에서 고를 수 있어요. 말랑이는 방 색깔로 몸 색이 바뀌고, 나머지 동물은 방 색깔 목도리를 둘러요.

말랑이 · 고양이 · 강아지 · 토끼 · 곰 · 펭귄 · 병아리 · 개구리 · 햄스터 · 유령 · 여우

![기본 캐릭터 미리보기 (가만히 · 걷기 · 말하기 · 졸기)](characters-preview.png)

- 시트 파일: `src/renderer/sprites/<캐릭터>-<색 0~11>.png`
- 모두 코드로 그려요: 공통 몸통은 `scripts/sprites/draw.js`, 캐릭터별 특징(귀, 꼬리, 배, 얼굴)은 `scripts/sprites/species.js`.
  새 캐릭터를 추가하려면 `species.js`에 하나 더 정의하고, `shared/characters.js`와 `src/renderer/character.js`의 목록에 id를 넣은 다음 `node scripts/make-sprites.js`를 실행하면 돼요.

## 직접 그린 캐릭터 올리기

화면에 보이는 캐릭터 크기는 **96×96으로 고정**이에요. 그림은 32×32 픽셀로 그리고, 앱이 3배로 또렷하게 키워서 보여줘요.

## 규격

| 종류 | 크기 | 움직임 |
| --- | --- | --- |
| 한 장짜리 | 32×32 PNG | 그림은 그대로이고, 걷거나 말할 때 통통 튀어요 |
| 스프라이트 시트 | 128×128 PNG (32×32 칸 4×4) | 줄마다 동작이 바뀌어요 |

공통 규칙
- PNG만, **32KB 이하** (픽셀 아트는 보통 2~5KB라 넉넉해요)
- 배경은 **투명**
- 캐릭터는 **오른쪽을 보게** 그리기. 왼쪽을 볼 때는 앱이 좌우를 뒤집어요.
- 발이 칸 맨 아래에 닿게 그리기. 그래야 화면 바닥에 서 있는 것처럼 보여요.
- 안티앨리어싱(흐린 가장자리) 없이, 테두리는 진한 색 1픽셀 추천 (`#2b2420`)

### 스프라이트 시트 칸 배치

```
        1칸      2칸      3칸      4칸
1줄   가만히1   가만히2    (빈칸)    (빈칸)     ← 1.1초에 2칸 반복
2줄   걷기1     걷기2     걷기3     걷기4      ← 0.5초에 4칸 반복
3줄   말하기1   말하기2    (빈칸)    (빈칸)     ← 말풍선 뜰 때, 0.5초에 2칸
4줄   졸기1     졸기2     (빈칸)    (빈칸)     ← 앱 꺼진 친구, 1.8초에 2칸
```

- 빈 템플릿: [`docs/character-template.png`](character-template.png) (주황 선이 칸 경계, 회색 칸은 안 쓰는 칸)
- 기본 캐릭터 말랑이 시트 12색: `src/renderer/sprites/mochi-0.png` ~ `mochi-11.png`. 그대로 열어서 고쳐 써도 돼요.
- 말랑이는 `scripts/make-sprites.js`가 코드로 그려요. 모양을 바꾸려면 이 파일을 고치고 `node scripts/make-sprites.js`를 실행하면 돼요.

## 만드는 순서 (추천)

1. **AI로 디자인 뽑기**: 아래 프롬프트로 캐릭터 디자인을 여러 개 만들어 보고 마음에 드는 걸 고르기
2. **도트 정리**: [Piskel](https://www.piskelapp.com) (무료, 웹)이나 Aseprite에서 32×32 캔버스를 열고, AI 그림을 보고 다시 찍기
   - AI가 만든 "픽셀풍" 그림은 실제 픽셀 격자가 안 맞는 경우가 많아서, 그대로 줄이면 뭉개져요. 보고 따라 찍는 게 제일 깔끔해요.
3. **동작 만들기**: 가만히 2칸 → 걷기 4칸 → 말하기 2칸 → 졸기 2칸 순서로. 처음엔 한 장짜리(32×32)로 시작해도 충분해요.
4. **내보내기**: 시트는 128×128, 한 장짜리는 32×32 PNG로 내보내기 (배율 1배, 투명 배경)
5. **앱에서 올리기**: 설정 창 → 내 캐릭터 → 이미지 올리기

## AI 이미지 생성 프롬프트

영어로 쓰는 게 결과가 더 안정적이에요. 괄호 안은 바꿔 쓰면 돼요.

### 1. 캐릭터 디자인 (한 장)

```
32x32 pixel art game character, a cute round (mochi blob) creature with small ears,
full body, standing, facing right, 3/4 view, centered on a transparent background,
1-pixel dark brown outline (#2b2420), limited 6-color pastel palette,
soft (mint green) body with slightly darker shading on the lower right,
tiny dot eyes and pink cheeks, no anti-aliasing, crisp pixels,
retro 16-bit style, no text, no shadow on the ground
```

바꿔 쓰기 예시
- `(mochi blob) creature` → `office worker cat with a tiny tie`, `sleepy hamster in a hoodie`, `round penguin holding a coffee cup`
- `(mint green)` → `peach`, `lavender`, `butter yellow`

### 2. 스프라이트 시트 (동작 전체)

```
pixel art sprite sheet of the same character, 4 columns by 4 rows, each cell exactly 32x32 pixels,
transparent background, character facing right, feet touching the bottom of each cell,
row 1: idle breathing animation, 2 frames;
row 2: walk cycle, 4 frames;
row 3: talking and waving one hand, 2 frames;
row 4: sleeping with closed eyes, 2 frames;
leave unused cells empty, consistent proportions and palette across all frames,
1-pixel dark outline, no anti-aliasing, no grid lines, no text
```

> 시트 프롬프트는 AI가 칸 크기를 정확히 못 지키는 경우가 많아요. 동작 아이디어를 얻는 용도로 쓰고, 최종 칸 맞춤은 Piskel에서 하세요.

### 3. 이미 만든 캐릭터에 동작만 추가

```
same pixel art character as the reference image, 32x32, facing right, transparent background,
(walking: left foot forward) pose, keep exactly the same palette, outline and proportions,
no anti-aliasing, crisp pixels
```

## 주의

- 다른 사람이 만든 캐릭터(만화·게임·브랜드 캐릭터 등)를 그대로 쓰면 저작권 문제가 생길 수 있어요. 직접 만든 캐릭터를 써 주세요.
- 올린 그림은 같은 방 사람들한테 보여요.
