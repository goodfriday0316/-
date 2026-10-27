> 업데이트: 실제 이미지 1,080장 검증 완료. [최종 검증 결과](REAL_IMAGE_VALIDATION.md)를 참조하세요. 아래 미첨부 관련 문장은 최초 구현 당시 기록입니다.

# The Bazaar 개인 플래너 개발 결과

기존 소스를 기준 커밋으로 보존한 뒤 확장했습니다. 새 앱으로 재작성하지 않았습니다.

## 제공 SQLite에서 검증한 결과
- templates: 1,117개. 모든 ID/이름/영웅/크기 변환 성공, 격리 0.
- 크기: 소형 490 / 중형 463 / 대형 164.
- ignored=0: 1,080개. ignored=1: 37개. 게임 활성 여부는 모두 미확인.
- image_path 있는 1,080개 전부 basename == template_id + '.webp'. art_key와 template_id 일치 0.
- 이미지 경로 없는 레코드 37개. 이는 실제 파일 누락 수의 확정치가 아님.
- DB version=5.0.0은 게임 패치로 간주하지 않음. 효과와 실제 등급도 미확인.
- items.zip 미첨부: 실제 매칭 성공/실패 이미지 수, 실제 파일 기준 이미지 없는 아이템 수는 아직 미검증.

## 구현
- Python 표준 라이브러리 기반 SQLite 읽기 전용 변환기와 선택적 이미지 ZIP UUID/CRC 검사.
- 기존 raw-adapter/Worker/IndexedDB 재사용. Chronicle 변환 JSON을 기존 가져오기 화면에서 처리.
- ignored 표시 보존, 등급 미확인 표시, 현재 활성·효과·패치 추정 금지.
- 로컬 이미지 ZIP BlobReader → 한 장씩 WebP 디코딩/CRC 검사 → 기존 IndexedDB Blob 저장.
- 중복 UUID 모두 거부, 미매칭/손상/경로 오류/암호화/크기 초과 보고.
- 도감·보드·상세·덱 비교에서 기존 Art 컴포넌트를 통해 실제 이미지 표시.
- 브라우저 저장 공간 조회, 지속 저장 요청, 파일 단위 처리, 분할 ZIP 도구.
- 외부 상세 URL은 DB에 없으므로 생성하지 않음. 검증된 URL이 없다는 안내 표시.
- Cloudflare에는 앱만 포함. SQLite·변환 JSON·게임 이미지·PC 경로는 배포 제외.

## 검증
- 기존 보드/배치/덱 기능 브라우저 회귀: 13 통과.
- 프로덕션/로컬 가져오기/이미지 테스트: 15 통과 (브라우저 재시작 테스트 포함).
- raw-adapter 23, local-library 6, data pipeline 9, raw contract 12 통과.
- Python 변환 도구 테스트 2 통과, Python 컴파일 통과.
- 실제 1,117개 변환 JSON의 브라우저 가져오기와 새로고침 확인.
- 합성 WebP로 도감/보드/상세 Blob 렌더링, 중복·손상 거부, 페이지 재접속 확인.
- Chromium 종료 후 같은 프로필로 재시작해 이미지와 보드 복원 확인.
- 실제 게임 이미지와 148MB ZIP의 전체 성능은 아직 미검증.

## 다음 파일
items.zip이 필요합니다. Windows 탐색기에서 `%APPDATA%\Bazaar Chronicle\assets\images\items`를 열어 items 폴더를 ZIP으로 압축하세요. UUID 파일명은 유지하고 원본은 변경/삭제하지 마세요.
추가 이용법은 소스의 docs/CHRONICLE_LOCAL.md 참조.

## 산출물
- bazaar-cloudflare-pages.zip: dist/의 내용이 ZIP 루트. 직접 배포하지 않음.
- bazaar-personal-source-updated.zip: 소스·도구·문서·테스트. 개인 DB와 이미지 제외.
- bazaar-planner.bundle: 원본 기준 커밋과 개발 커밋을 보존한 Git 백업.
- chronicle-local.json: 사용자 DB의 로컬 가져오기용 변환본. 배포 ZIP과 분리.
