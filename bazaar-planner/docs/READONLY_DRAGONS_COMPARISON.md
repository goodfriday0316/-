# PC용 읽기 전용 드래곤즈 비교 도구

이 도구는 인터넷 연결 없이 Python 표준 라이브러리만 사용합니다. 게임 원본, Chronicle DB, 이미지 ZIP/폴더를 읽고 비교 보고서 두 개만 새로 만듭니다. 기존 도감, 이미지, 덱이나 DB를 갱신하지 않습니다. 원본 파일을 공개하거나 서버로 전송하지 않습니다.

## 실행

Python 3.9 이상이 설치된 PC에서 ZIP을 풀고 `compare_dragons.py`, `GameData.db.zip`, `templates.sqlite3`, `items.zip`을 같은 작업 폴더에 준비합니다. 원본을 옮기거나 수정할 필요는 없으며 전체 경로를 지정해도 됩니다.

```powershell
python .\compare_dragons.py --game .\GameData.db.zip --chronicle .\templates.sqlite3 --images .\items.zip --output .\dragons-report.json
```

이미지 6분할 파일이 있는 폴더는 `--images`에 각 ZIP을 나열합니다. 또는 압축 해제된 WebP 폴더 경로를 지정합니다. 이미지 옵션을 생략하면 이미지 확인 항목은 미검사(null)로 표시합니다.

```powershell
python .\compare_dragons.py --game .\GameData.db.zip --chronicle .\templates.sqlite3 --images .\items-part-001.zip .\items-part-002.zip .\items-part-003.zip .\items-part-004.zip .\items-part-005.zip .\items-part-006.zip --output .\dragons-report.json
```

소스 프로젝트에서 실행할 때는 첫 번째 경로를 `.\tools\compare_dragons.py`로 지정합니다. `GameData.db`를 이미 풀었다면 --game에 그 파일을 지정할 수 있습니다. ZIP의 경우 루트에 GameData.db 하나가 있는 형식만 지원하며 전체 ZIP을 임의 경로로 풀지 않습니다.

## 결과

- `dragons-report.json`: 정확한 ID, 이름, 원본/Chronicle 영웅 분류, 필드별 차이, 드래곤즈 목록, 이미지 연결 여부, 제외·잘못된 레코드.
- `dragons-report.summary.txt`: 수량 중심의 간단한 요약.
- 기존 결과 파일이 있으면 덮어쓰지 않고 중단합니다. 다음 실행에는 다른 --output 이름을 지정하세요.
- 보고서는 개인 PC에 보관하세요. public/src/dist 폴더에 쓰는 것은 거부합니다. GitHub나 Cloudflare에 올릴 필요가 없습니다.

`rawItemCount`는 원본의 Item 레코드 수, `chronicleEligibleCount`는 유효 레코드에 Chronicle의 기존 이름 제외 조건을 적용한 수입니다. `rawIdsAbsentFromChronicle`에는 제외 조건에 걸리는 항목도 포함하므로, 이를 정상 아이템 추가 수로 해석하면 안 됩니다. 검토 대상 신규 수는 `newEligibleIds`, 기존 분류·이름 등의 차이는 `metadataChangedIds`로 확인합니다.

드래곤즈는 Heroes 필드의 정확한 `Dragons` 또는 `The Dragons` 값으로 집계하고 `targetHeroValues`에 명시합니다. Dragon 태그, 이름 유사성, ArtKey를 근거로 드래곤즈 소유를 추정하지 않습니다. 다른 영웅 값은 `heroValues`에 그대로 표시하므로 별칭이 실제로 있는지 확인할 수 있습니다.

이미지는 파일명 UUID로만 연결합니다. 중복 UUID는 임의 선택하지 않으며 ZIP CRC와 WebP 헤더를 검사합니다. 이 도구는 픽셀 디코딩이나 그림을 보고 아이템을 추측하는 기능은 제공하지 않습니다.

## 원본 보존과 판단 한계

SQLite는 읽기 전용·immutable 모드로 열고 무결성을 확인합니다. 유효한 WAL이 남아 있는 파일은 잘못된 스냅샷을 읽지 않도록 거부합니다. 프로그램에서 Chronicle/게임을 종료하고 정상 저장된 DB의 복사본을 사용하세요. ZIP 안 DB는 안전한 임시 폴더 한 파일로만 읽고 작업 후 임시 사본을 정리합니다. 원본 DB/ZIP의 SHA-256을 처리 전후 비교합니다.

ZIP의 파일 날짜와 카드의 Version 값은 `sourceMetadata`에 기록하지만 게임 패치·출시 시점을 확정하는 근거로 사용하지 않습니다. 설치 폴더의 기본 GameData.db.zip과 현재 게임이 다운로드한 최신 캐시가 다를 수 있습니다. 한 파일에서 드래곤즈가 없다는 결과가 현재 게임 전체에 드래곤즈가 없다는 뜻은 아닙니다.

도구는 비교만 합니다. 보고서 검토 없이 신규/제외 항목을 도감에 추가하거나 기존 영웅을 재분류하지 않습니다.

## 테스트

`python tests/compare-dragons.test.py`로 합성 자료 기반 정확한 ID 비교, 오분류 탐지, 읽기 전용 보존, 잘못된 JSON/ID·중복 거부, 안전한 ZIP 처리, 덮어쓰기 방지 등 6개 테스트를 실행합니다. 테스트 자료에 실제 게임 DB나 아이템 데이터는 포함하지 않습니다.
