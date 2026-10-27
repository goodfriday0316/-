# 허가된 일괄 아이템 데이터 업데이트

현재 조사한 출처에서는 이 플래너에 게임 데이터·이미지를 재배포할 권한이 확인되지 않았습니다. 따라서 **실제 아이템을 가져오지 않았으며**, 기본 명령은 권한 확인 단계에서 멈춥니다. 테스트의 `SYNTHETIC TEST ITEM`은 임시 디렉터리에서만 생성되고 앱에 포함되지 않습니다.

## 자동화 범위

`scripts/update-items.mjs`는 허가받은 공급자의 JSON 일괄 내보내기를 한 번에 읽어 다음 작업을 합니다.

1. 공급자·데이터 이용 허가·패치 근거를 확인하는 매니페스트를 먼저 검증합니다. 미확인 상태이면 **파일 읽기와 HTTP 요청 전에 거부**합니다.
2. 공급자 JSON 전체를 읽고 정규화·검증합니다. 항목을 사람이 하나씩 입력하지 않습니다. 현재는 특정 게임 사이트 HTML을 긁는 스크래퍼가 아닙니다.
3. 원본 ID에 공급자 네임스페이스를 붙입니다. 동일 ID의 동일 데이터는 중복 제거하고, 충돌하는 중복 또는 잘못된 레코드가 하나라도 있으면 기존 카탈로그를 교체하지 않습니다.
4. 원문 효과·등급별 수치를 그대로 보존합니다. 누락 등급을 계산하거나 번역·효과를 생성하지 않습니다.
5. 이미지 재배포 허가가 별도로 확인된 경우에만 허용된 호스트에서 PNG/JPEG/WebP를 내려받습니다. 허가가 없으면 URL을 기록하고 아이콘 대체 상태로 둡니다.
6. 이미지 누락·미번역·전체 통계를 별도 JSON으로 생성합니다. 입력 SHA-256과 허가 근거, 패치 확인 일자를 기록합니다.
7. 임시 폴더에서 모든 결과를 준비한 뒤 교체합니다. 교체 중 오류가 나면 이전 파일을 복원합니다. 과거 이미지 파일은 유지하므로 기존 덱의 이미지 경로를 삭제하지 않습니다.

현재 `bazaardb.gg`와 `lifein-ai/bazaar-helper`의 GitHub/API/raw 다운로드 경로는 조사 결과에 따라 차단되어 있습니다. 명령행 강제 승인 옵션은 없습니다. 이후 실제 이용 조건이 바뀌면 문서 근거를 다시 검토하고 차단 정책을 코드에서 명시적으로 갱신해야 합니다.

## 사용 전 실제로 필요한 것

- 공급자가 허용한 **일괄 JSON 파일 또는 내보내기 API**.
- 다운로드·변환·재배포가 가능한 데이터 권한 근거. 공개 접근 가능하다는 사실만으로는 충분하지 않습니다.
- 이미지를 내려받아 웹사이트에서 배포할 수 있다는 별도 근거. 게임 이미지 권한은 데이터/프로그램 코드 라이선스와 다릅니다.
- 실제 패치 버전과 그 버전을 확인할 수 있는 근거 URL.
- 한국어 이름을 공식 명칭으로 사용할 경우 그 사실을 확인할 수 있는 공식 번역 근거.

스크립트는 근거 URL의 법적 효력을 자동 판정하지 않습니다. `approved`는 실제 문서/허가를 검토한 관리자가 기록하는 검토 결과이며, 단지 실행하려고 값을 바꾸면 안 됩니다. 허가가 없으면 기본 `unverified`를 유지하세요.

공급자가 다른 스키마를 제공하면 허가와 구조가 확인된 후 그 **일괄 JSON을 정규화하는 공급자별 어댑터**를 추가해야 합니다. 현재 후보 사이트의 알려지지 않은 스키마나 API를 추측해서 구현하지 않았습니다.

## 실행

프로젝트 루트에서:

```sh
# 기본 상태에서는 PERMISSION_REQUIRED로 종료됩니다. 실제 데이터 요청 없음.
node scripts/update-items.mjs --dry-run

# 권한 검토가 끝난 공급자의 매니페스트로 전체 검증 (게시 파일 유지)
node scripts/update-items.mjs --manifest ./scripts/source-manifest.json --dry-run

# 일괄 갱신
node scripts/update-items.mjs --manifest ./scripts/source-manifest.json

# 오프라인 회귀 테스트. 실제 아이템/네트워크를 사용하지 않습니다.
node tests/data-pipeline.test.mjs
```

공급자가 있는 네트워크 환경에서 Node의 HTTP 프록시를 사용하는 경우 런타임의 기존 `HTTP_PROXY`/`HTTPS_PROXY`·CA 설정을 유지해야 합니다. Node 24에서 필요하면 `node --use-env-proxy scripts/update-items.mjs ...`로 실행합니다. 프록시를 우회하거나 TLS 검증을 끄지 마세요. 파일 입력에는 네트워크가 필요 없습니다.

## 공급자 검토 매니페스트

`scripts/source-manifest.example.json`을 참고합니다. 예제에는 유효한 허가나 게임 데이터가 없습니다.

```json
{
  "schemaVersion": 1,
  "source": {
    "id": "authorized-provider",
    "name": "공급자 실제 명칭",
    "url": "https://공급자/실제-데이터-출처",
    "revision": "실제-공급자-커밋-또는-내보내기-리비전"
  },
  "input": {
    "type": "file",
    "location": "authorized-export.json"
  },
  "patch": {
    "version": "실제 게임 패치 버전",
    "verifiedAt": "실제 확인 일시(ISO 8601)",
    "evidenceUrl": "https://공식-패치-또는-공급자-버전-근거",
    "latestConfirmed": false
  },
  "permissions": {
    "data": {
      "status": "approved",
      "evidenceUrl": "https://실제-다운로드-변환-재배포-허가",
      "licenseName": "실제 적용 라이선스 또는 허가 문서",
      "attribution": "요구되는 실제 저작자·출처 표시",
      "scope": ["download", "transform", "redistribute"],
      "reviewedBy": "검토자",
      "reviewedAt": "실제 확인 일시(ISO 8601)"
    },
    "images": { "status": "unverified" }
  },
  "images": { "allowedHosts": [] },
  "localization": { "officialKorean": false }
}
```

위 내용은 형식 설명이며 실행용 승인이 아닙니다. 파일 경로는 매니페스트 위치를 기준으로 해석합니다. `input.type: "url"`이면 `location`에는 허가된 HTTPS JSON 내보내기 주소를 넣습니다. 데이터 리다이렉트는 동일 호스트만 허용합니다.

이미지 허가가 확인되면 `permissions.images`에 데이터 권한과 같은 검토 정보를 넣되, `scope`는 `download`, `redistribute`가 필요합니다. `images.allowedHosts`에는 허가받은 이미지 호스트를 정확히 기록합니다. 서브도메인 와일드카드는 지원하지 않습니다. 허가 호스트 외 리다이렉트, 자격증명이 포함된 URL, HTTP, IP/로컬 호스트, SVG는 거부합니다. 데이터는 25MiB, 개별 이미지는 5MiB까지입니다.

`localization.officialKorean: true`를 쓰려면 `localization.evidenceUrl`이 필요합니다. 각 레코드도 `nameKoOfficial: true`일 때만 한국어 명칭을 사용합니다. 어느 한쪽이 미확인이면 영어 원문과 `untranslated`를 유지합니다.

## 공급자 일괄 JSON 계약

전체 파일:

```text
{
  schemaVersion: 1,
  patchVersion: string, // 매니페스트의 실제 패치와 일치해야 함
  items: [모든 아이템 레코드]
}
```

한 레코드의 필드:

| 필드 | 계약 |
| --- | --- |
| `id` | 공급자가 유지하는 원본 고유 ID. 이름으로 ID를 만들지 않음 |
| `nameEn` | 확인된 영어 원문명 |
| `nameKo` | 공식 명칭이 있으면 문자열, 없으면 null/생략 |
| `nameKoOfficial` | 공급자가 공식 한국어 명칭임을 확인한 경우 true |
| `heroes` | `Vanessa`, `Pygmalien`, `Dooley`, `Mak`, `Stelle`, `Jules`, `Karnok`, `Dragons`, `Neutral` 중 실제 사용 가능한 영웅들 |
| `size` | 정수 1, 2, 3 |
| `tags` | 확인된 태그 문자열 배열 |
| `tiers` | 실제 존재하는 `bronze`, `silver`, `gold`, `diamond` 키만 포함 |
| `tiers[tier].effects` | 출처에 있는 효과 문자열 배열. 계산·생성하지 않음 |
| `tiers[tier].stats` | 선택. 출처의 수치/문자열을 이름→값으로 보존 |
| `imageUrl` | 선택. 허가가 없으면 다운로드하지 않음 |
| `sourceUrl` | 선택. 개별 아이템 출처. 생략하면 공급자 출처 URL |
| `patchVersion` | 선택. 있다면 파일/매니페스트 패치와 같아야 함 |

`heroes` 열거는 이 플래너의 선택 메뉴와의 연결 계약입니다. 그 영웅이 현재 게임에서 플레이 가능한지 또는 아이템이 존재하는지 보증하는 목록이 아닙니다. 공급자에 없는 항목을 추가해서는 안 됩니다.

## 생성 결과

- `src/data/items.json`: UI가 읽는 독립 카탈로그.
- `public/images/items/`: 허가되어 내려받은 이미지. ID·파일내용 해시로 이름 지정.
- `data/versions/<source>@<patch>[+<revision>].json`: 입력 해시를 기록한 버전 스냅샷.
- `data/reports/catalog-report.json`: 전체 수, 이미지 성공률, 공식 한국어 적용률, 중복 제거 수, 패치 확인 근거. 검토자 등 내부 감사 정보는 이 비공개 빌드 입력 폴더에만 보존합니다.
- `public/data/status.json`: 사이트에서 확인 가능한 수·성공률·패치 상태 요약.
- `public/data/attribution.json`: 공개 출처·라이선스·저작자 표시·근거 링크. 검토자 개인정보를 포함하지 않습니다.
- `public/data/missing-images.json`, `public/data/untranslated-items.json`: 사이트에서 다운로드할 수 있는 누락 이미지·미번역 목록.

공개 요약과 목록도 카탈로그·이미지와 같은 단계적 교체에 포함됩니다. 번들에 들어가는 카탈로그의 provenance 역시 검토자 이름·검토 일자를 제외한 공개용 근거만 담습니다.
- `data/reports/missing-images.json`: 누락/미허가/다운로드 실패 이미지 목록.
- `data/reports/untranslated-items.json`: 공식 한국어 미확인 목록.
- `data/reports/invalid-items.json`: 성공한 배치에서는 빈 배열. 실패한 배치의 레코드 검증 보고서는 CLI 실행 시 `data/rejected/`에 따로 남고 카탈로그는 교체하지 않음.

같은 패치의 원본 내보내기가 바뀌면 기존 스냅샷을 덮어쓰지 않습니다. 실제 공급자 리비전/커밋을 `source.revision`으로 기록하여 별도 데이터 버전을 만드세요. **게임 패치 버전을 임의로 바꾸어 통과시키면 안 됩니다.** `latestConfirmed`는 독립 검증 사실이며 기본 false입니다. 최신 패치라고 자동 추정하지 않습니다.

이 파이프라인은 브라우저 localStorage에 접근하거나 덱 파일을 재작성하지 않습니다. 저장 덱의 패치 간 호환·알 수 없는 ID 보존은 앱의 저장 마이그레이션 계층에서 처리합니다.
