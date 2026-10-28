> UI 수정: 보드 카드 높이 제한 및 이미지 없는 Chronicle 항목 기본 숨김. [변경·검증 보고서](docs/UI_FIX_REPORT.md)

> 실제 이미지 검증 완료: **1,080장 매칭·저장 성공, 실패 0장, 이미지 없는 항목 37개**. [상세 결과](docs/REAL_IMAGE_VALIDATION.md)

> Chronicle 로컬 DB·이미지 ZIP 연동: [사용 방법](docs/CHRONICLE_LOCAL.md), [개발 결과](docs/INTEGRATION_REPORT.md). 게임 데이터와 이미지는 배포에 포함하지 않습니다.

# The Bazaar · Deck Atelier

React + TypeScript + Vite + dnd-kit. 기존 디자인과 10칸 보드를 유지한 데이터 연동 준비 버전입니다.

**배포본에 실제 원본 데이터·이미지는 포함하지 않습니다.** 사용자가 보유한 `cards_generated.json` 형식 파일을 직접 선택하여 브라우저 안에서 개인 도감으로 변환할 수 있습니다. 서버 전송 없이 처리하며, 미해석 효과와 불확실한 활성 상태는 별도로 표시합니다. [개인 파일 사용법·지원 범위](docs/LOCAL_FILE_IMPORT.md)를 참고하세요.

## 실행과 검증

```sh
npm ci
npm run dev
npm run build
# Chromium이 없는 환경에서 1회
npx playwright install chromium
npm run test:data
npm test -- --workers=1
npm run test:production
```

- `npm test`: 임시 폴더에 만든 **합성 테스트 전용 카탈로그**로 검색·등급 효과·이미지·배치·비교·터치를 테스트합니다. 생산용 `src/data/items.json`을 변경하지 않습니다.
- `test:production`: 실제 배포 빌드를 테스트합니다. 미연결 표시, 이전 덱 마이그레이션, 스냅샷·로컬 저장·모바일 레이아웃을 확인합니다.
- `/usr/bin/chromium`이 있으면 사용하고, 없으면 Playwright 브라우저를 사용합니다. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`로 경로 지정 가능.

## 데이터 자동화

```sh
npm run data:update -- --dry-run
```

현재 매니페스트는 미승인 상태이므로 `PERMISSION_REQUIRED`로 요청 전 종료합니다. 허가된 공급자의 일괄 JSON 및 실제 허가/패치 근거를 확보한 뒤 매니페스트를 검토하고 실행합니다. 항목별 수동 입력은 필요하지 않습니다. 공급자 스키마가 다르면 허가 확인 후 공급자별 변환 어댑터를 추가해야 합니다. 현재 조사 대상 사이트를 스크래핑하는 도구는 구현·실행하지 않았습니다.

- UI 독립 카탈로그: `src/data/items.json`
- 이전 샘플: `src/data/1.0.0-sample.json` — 기존 덱 호환 전용
- 일괄 갱신: `scripts/update-items.mjs`
- 공급자 검토: `scripts/source-manifest.json`
- 이력: `data/versions/` (실제 도입 시 생성)
- 누락·미번역·출처: `data/reports/`, `public/data/`
- [자동화 사용법](docs/DATA_PIPELINE.md)

## 저장 호환성

localStorage 키 `bazaar-planner-v1`을 그대로 사용합니다. 기존 ID를 영어 이름으로 임의 치환하지 않습니다. 읽기 검증 후 저장 사본을 보강하고 원본은 `bazaar-planner-v1-before-catalog-update`에 보존합니다. 알 수 없는 데이터는 즉시 덮어쓰지 않습니다. 편집을 재개하면 `bazaar-planner-v1-recovery`에 복구 사본을 보존합니다.

각 배치 아이템은 ID·이름·크기·등급 효과·이미지 경로·출처 패치의 사본을 포함합니다. 이후 패치에서 삭제되거나 크기가 바뀌어도 옛 덱의 배치·효과를 그대로 보존합니다. 사본도 없는 알 수 없는 ID는 추측하지 않고 가져오기를 거부합니다.

브라우저·기기·주소별 저장이며 서버 동기화는 없습니다. JSON 가져오기는 전체 덱을 교체하므로 먼저 내보내기로 백업하세요. 모바일에서는 짧게 스와이프하여 스크롤하고 250ms 이상 길게 눌러 드래그합니다. 마법부여는 기존 덱 메모이며 효과를 추정·계산하지 않습니다. 전투 시뮬레이션은 없습니다.

## 보고서와 배포

- [작업 결과](IMPLEMENTATION_REPORT.md)
- [검증 결과](QA_REPORT.md)
- [후보 출처 조사](research/community-sources.md), [GitHub 조사](research/github-source.md)
- [기존 Cloudflare Worker 주소 유지](DEPLOYMENT.md)

이 작업은 ZIP 생성까지만 수행하며 원격 서비스를 변경하지 않습니다.

## 원시 스키마 기술 검증

`npm run test:raw-contract`로 합성 데이터 진단을 실행할 수 있습니다. 현재는 정규화된 공급자 스키마만 지원하며, 원시 등급 상속·자리표시자 치환·비활성 필터는 미지원입니다. 진단 통과를 원시 데이터 호환 완료로 해석하지 마세요. [검증 결과와 남은 작업](docs/RAW_DATA_VERIFICATION.md)을 참고하세요.

개인 파일 어댑터 단위 테스트는 `npm run test:adapter`, 저장·이미지 연결 구조 테스트는 `npm run test:local-storage`로 실행합니다. TypeScript 테스트 실행에는 Node.js 22.6 이상(현재 검증 Node 24)이 필요합니다. 이전 `test:raw-contract`는 서버용 정규화 파이프라인의 경계를 확인하는 진단이며, 새 브라우저 어댑터의 미지원 목록과 혼동하지 마세요.
