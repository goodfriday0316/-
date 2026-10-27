> 업데이트: 실제 이미지 1,080장 검증 완료. [최종 검증 결과](REAL_IMAGE_VALIDATION.md)를 참조하세요. 아래 미첨부 관련 문장은 최초 구현 당시 기록입니다.

# Bazaar Chronicle 로컬 데이터 / 이미지

기존 React/TypeScript/Vite 플래너를 확장했습니다. Cloudflare에는 dist/ 내용만 배포합니다.
DB, 변환 JSON, 이미지 ZIP은 public/나 src/에 넣지 마세요. PC의 원본 파일은 읽기만 합니다.

## 준비 (Windows)
1. Bazaar Chronicle의 templates.sqlite3를 복사해 별도 작업 폴더에 보관합니다. DB는 읽기 전용으로 연결합니다.
2. 이미지 폴더는 `%APPDATA%\Bazaar Chronicle\assets\images\items`입니다.
   탐색기 주소창에 해당 경로를 붙여넣고 items 폴더를 ZIP으로 압축해 `items.zip`을 만드세요.
   UUID 파일명은 변경하지 마세요. 현재 DB의 image_path가 가리키는 경로이며 PC마다 다를 수 있습니다.
3. Python 3 설치 후 소스 폴더에서 실행:

```powershell
py tools/convert_chronicle.py "C:\경로\templates.sqlite3" --images "C:\경로\items.zip" --output "C:\경로\chronicle-local.json"
```

이미지 ZIP이 없으면 --images 옵션을 생략할 수 있습니다. JSON과 .report.json을 새로 만들며 기존 출력이 있으면 덮어쓰지 않습니다.
실제 UUID 규칙: DB의 image_path 마지막 파일명이 template_id + `.webp`와 정확히 일치할 때만 imageId를 내보냅니다. art_key는 사용하지 않습니다.
--images 검사는 실제 ZIP 파일명, WebP 헤더, ZIP CRC를 확인합니다. 웹 앱은 추가로 이미지 디코딩까지 검사합니다.

## 플래너 사용
1. HTTPS 배포 페이지 또는 localhost를 엽니다. file:// 직접 열기는 지원하지 않습니다.
2. '원본 JSON 불러오기'로 chronicle-local.json 선택 → 결과 확인 → '이 파일을 개인 도감으로 사용'.
3. '개인 도감 관리' → '개인 이미지 ZIP 불러오기'에서 items.zip 선택.
4. 결과를 확인하고 이미지 매칭 보고서를 저장합니다. 도감·보드·상세에 연결된 이미지를 표시합니다.
5. 데이터와 이미지 Blob은 해당 사이트/브라우저의 IndexedDB에 저장합니다. 덱은 기존 localStorage 자동 저장과 JSON 백업을 유지합니다.

이미지는 덱 JSON에 포함되지 않습니다. 새 기기·다른 브라우저·다른 도메인에서는 JSON과 ZIP을 다시 가져오세요.
브라우저 종료 후에도 저장되지만, 시크릿 모드·브라우저 데이터 삭제·저장 공간 회수에는 유지가 보장되지 않습니다.
지속 저장 권한을 요청하되 브라우저가 거절해도 가져오기는 계속합니다. 중요한 덱은 JSON으로 백업하세요.

## 수치 해석
제공 DB: 1,117개(소형 490, 중형 463, 대형 164), ignored=0 1,080개 / ignored=1 37개.
1,117개 모두 메타데이터 등록 가능. ignored=1은 경고로 보존하고 임의로 제외하지 않습니다.
이미지 경로가 있는 1,080개 모두 template_id.webp 규칙 일치. 나머지 37개는 DB 이미지 경로 없음.
이는 파일명 규칙 검증이며 실제 1,080개 파일의 존재·내용 검증과 다릅니다.
현재 게임 활성 여부, 게임 패치, 효과, 실제 등급은 이 DB로 확인할 수 없습니다. DB version=5.0.0을 게임 패치로 사용하지 않습니다.
브론즈 표시는 기존 보드 호환을 위한 개인 메모 기본값이며 실제 등급의 증거가 아닙니다. 효과 영역에도 미제공 안내를 표시합니다.
외부 아이템 상세 URL은 DB에 없어 생성하지 않습니다. 확인되지 않은 이름 기반 URL도 만들지 않습니다.

## 대용량 처리
브라우저는 ZIP을 통째로 ArrayBuffer로 풀지 않고 BlobReader로 읽어 이미지 한 장씩 디코딩·저장합니다.
한 이미지 5MB, ZIP/누적 처리량 512MB, 항목 20,000개 제한. 중복 UUID는 첫 항목을 선택하지 않고 모두 실패 처리합니다.
암호화 ZIP, 손상 파일, 경로 탈출, UUID 미매칭은 연결하지 않습니다. 개별 실패 시 나머지는 진행하며 재시도할 수 있습니다.
보고서 matched는 이번 가져오기에서 저장한 이미지 수, missingItemIds는 이전 분할 ZIP 저장분까지 포함해 아직 없는 아이템입니다.
148MB 실제 ZIP 처리의 최대 메모리/실행시간은 파일 수신 후 확인해야 합니다.
저장 공간/메모리가 부족하면 PC에서 분할:

```powershell
py tools/split_images.py "C:\경로\items.zip" "C:\경로\items-parts" --mb 40
```

새 출력 폴더에 약 40MB씩 ZIP을 생성합니다. 각 분할 ZIP을 차례로 가져오세요. 원본 ZIP은 변경하지 않습니다.

## 개발 / 확인
Node 24 이상 권장. `npm ci`, `npm run dev`, `npm run build`.
`npm test -- --workers=2`, `npm run test:production`, `npm run test:adapter`, `npm run test:local-storage`, `npm run test:data`, `npm run test:raw-contract`.
개인 DB 변환 JSON 검증은 CHRONICLE_TEST_JSON 환경변수에 로컬 JSON 경로를 지정하면 production 테스트에 포함됩니다.
합성 WebP 테스트는 실제 게임 이미지 매칭 검증을 대신하지 않습니다.
배포는 dist의 내용만 ZIP 루트에 압축합니다. tools와 local-data는 배포에 포함하지 않습니다.
