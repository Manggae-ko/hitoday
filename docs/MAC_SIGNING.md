# 맥 앱 서명·공증 설정

서명·공증을 하면 맥에서 "'Jakdang'을(를) 열지 않음" 경고 없이 바로 열려요.
Apple Developer Program 계정(연 $99)이 필요하고, 아래는 한 번만 하면 돼요. 이후에는 태그를 올릴 때마다 GitHub Actions가 자동으로 서명·공증해요.

> 팀 계정이라면 Developer ID 인증서는 **Account Holder**만 만들 수 있어요.

## 1. Developer ID Application 인증서 만들기

가장 쉬운 방법은 Xcode예요.

1. Xcode → **Settings → Accounts** → Apple ID 선택 → **Manage Certificates…**
2. 왼쪽 아래 **+** → **Developer ID Application**
3. 키체인 접근(Keychain Access) → **로그인** 키체인 → **내 인증서**에 `Developer ID Application: 이름 (팀ID)`가 생겼는지 확인

Xcode가 없다면 [developer.apple.com → Certificates](https://developer.apple.com/account/resources/certificates/list)에서 **Developer ID Application**을 고르고, 키체인 접근의 "인증 기관에서 인증서 요청"으로 만든 CSR 파일을 올려서 만들 수 있어요.

## 2. 인증서를 .p12 파일로 내보내기

1. 키체인 접근 → **내 인증서** → `Developer ID Application: …`를 펼쳐서 **인증서와 개인 키를 함께** 선택
2. 오른쪽 클릭 → **내보내기** → 파일 형식 `.p12` → 이름 `jakdang-developer-id.p12`
3. 내보내기 비밀번호를 정해요 (아래 `MAC_CERT_PASSWORD`로 써요)

## 3. 공증용 정보 준비

| 값 | 어디서 |
| --- | --- |
| Apple ID | 개발자 계정 로그인 이메일 |
| 앱 암호 | [appleid.apple.com](https://appleid.apple.com) → 로그인 및 보안 → **앱 암호** → 새로 만들기 (이름 예: `jakdang-notarize`) |
| 팀 ID | [developer.apple.com → Membership details](https://developer.apple.com/account#MembershipDetailsCard) 의 Team ID (영문·숫자 10자리) |

## 4. GitHub에 비밀값 넣기

저장소 → Settings → Secrets and variables → Actions → **Secrets** → New repository secret

| 이름 | 값 |
| --- | --- |
| `MAC_CERT_P12_BASE64` | 터미널에서 `base64 -i jakdang-developer-id.p12 \| pbcopy` 후 붙여넣기 |
| `MAC_CERT_PASSWORD` | 2단계에서 정한 내보내기 비밀번호 |
| `APPLE_ID` | Apple ID 이메일 |
| `APPLE_APP_SPECIFIC_PASSWORD` | 3단계 앱 암호 (`xxxx-xxxx-xxxx-xxxx`) |
| `APPLE_TEAM_ID` | 팀 ID |

`gh` CLI를 쓴다면:
```bash
base64 -i jakdang-developer-id.p12 | gh secret set MAC_CERT_P12_BASE64 -R donghyeun02/jakdang
gh secret set MAC_CERT_PASSWORD -R donghyeun02/jakdang          # 입력창에 붙여넣기
gh secret set APPLE_ID -R donghyeun02/jakdang
gh secret set APPLE_APP_SPECIFIC_PASSWORD -R donghyeun02/jakdang
gh secret set APPLE_TEAM_ID -R donghyeun02/jakdang
```

다 넣었으면 `.p12` 파일은 안전한 곳에 보관하거나 지우세요. 절대 저장소에 넣지 마세요.

## 5. 새 버전 올리기

`package.json`의 `version`을 올리고 같은 이름의 태그를 푸시하면 돼요 (예: `0.1.2` → `v0.1.2`).
GitHub Actions의 release 작업에서 **Check the Mac apps are signed and notarized** 단계가 통과하면 끝이에요. 공증은 Apple 서버에서 몇 분 걸릴 수 있어요.
