# 공식 한국어 이름과 Bazaardex 연결 조사

## 확보된 자료와 미확인 항목

사용자 제공 `templates.sqlite3`는 1,117개 이름을 영어로 보존하며 공식 한국어 문자열이나 Bazaardex 상세 URL을 포함하지 않습니다. 실제 공식 한국어 이름 매칭은 현재 0개, 미확인 1,117개입니다. 추정 번역을 생성하지 않았습니다.

Bazaardex는 이 실행 환경의 제한된 네트워크 허용 목록에 없습니다. `https://www.bazaardex.com/` 요청이 목적지에 도달하기 전 CONNECT 프록시에서 403으로 거부되었습니다. 이는 Bazaardex 서버 자체의 오류라는 뜻은 아닙니다. GitHub의 공개 저장소/이슈 검색에서도 개별 상세 경로의 근거를 찾지 못했습니다. 따라서 실제 검증된 Bazaardex 매칭은 0개이며 나머지는 실패 확정이 아니라 미검증입니다. 이름을 슬러그로 바꿔 URL을 임의 생성하지 않습니다.

## 로컬 한국어 데이터 경로와 정확한 연결

다음 공개 소스에서 게임 파일 구조의 근거를 확인했습니다. 이는 제3자 도구의 코드 증거이며, 게임 파일의 재배포 허가나 현재 사용자 설치 버전의 구조를 보증하지 않습니다.

1. [Bazaar Chronicle import_templates.py (고정 커밋)](https://github.com/rafastr/bazaar-chronicle/blob/85dadfdea3112d38991a067bc50444f19a739fc9/scripts/import_templates.py)
   - Steam 기본 경로의 `TheBazaar_Data/StreamingAssets/GameData.db.zip`을 읽습니다.
   - `GameData.db`의 `cards(Id, Data)`에서 JSON을 읽습니다.
   - 아이템 JSON `Id`를 template_id로, `Localization.Title.Text`를 영어 이름으로 사용합니다.
2. [TheBazaarRusPatcher Program.cs (고정 커밋)](https://github.com/Lazyalexs/TheBazaarRusPatcher/blob/62773cf0d934b57b3aa4946c5cccbfa485cc5d87/Program.cs)
   - 737행 부근의 설명은 공식 타 언어 파일 `translations/ko-KR.bytes`를 별도 보존합니다.
   - `translation(hash, text)`는 SQLite 문자열 테이블입니다.
   - 키 문자열을 변형하거나 새 해시를 만들지 않고 직접 `hash`에 대응시킵니다. 게임 JSON의 `Localization.Title.Key`를 이 키에 정확히 연결할 수 있습니다.
3. [도구의 권리 안내](https://github.com/Lazyalexs/TheBazaarRusPatcher/blob/62773cf0d934b57b3aa4946c5cccbfa485cc5d87/DISCLAIMER.md)
   - 비공식 도구이며 게임 원본 파일을 배포하지 않는다고 명시합니다. 해당 도구의 MIT 라이선스가 게임 콘텐츠에 적용되는 것은 아닙니다.

한국어 이름은 `cards.Id == card.Id == template_id`와 `Localization.Title.Key == translation.hash`의 정확한 결합으로만 연결합니다. 영어 이름도 기존 Chronicle 이름과 같아야 합니다. 이름 유사도나 키 해시 추측을 사용하지 않습니다.

## PC에서 필요한 파일

게임이 설치된 PC에서 아래 파일을 찾습니다. 게임/설치 경로는 PC별로 다를 수 있습니다.

- `GameData.db.zip` 또는 압축 해제된 `GameData.db`
- 같은 버전 게임의 `translations/ko-KR.bytes` (수정되지 않은 공식 한국어 파일)
- 기존 `%APPDATA%\Bazaar Chronicle\templates.sqlite3`

찾아볼 경로:

- Steam: `C:\Program Files (x86)\Steam\steamapps\common\The Bazaar\TheBazaar_Data\StreamingAssets`
- Tempo: `%APPDATA%\Tempo Launcher - Beta\game\buildx64\TheBazaar_Data\StreamingAssets`
- 게임 캐시: `%USERPROFILE%\AppData\LocalLow\Tempo Storm\The Bazaar\prod\cache`

파일을 찾지 못하면 Steam의 '설치된 파일 찾아보기'에서 `TheBazaar_Data\StreamingAssets`와 게임 캐시를 확인하세요. 임의 웹사이트에서 언어 파일을 받거나 러시아어 번역 패치로 원본 파일을 수정하지 마세요.

## 로컬 변환

Python 3.9 이상에서 소스 폴더를 열고 실행합니다.

```powershell
python tools/extract_official_korean.py "C:\경로\GameData.db.zip" "C:\경로\translations\ko-KR.bytes" --templates "C:\경로\templates.sqlite3" --output "local-data\korean-names.json"
```

- 입력은 SQLite 읽기 전용으로 열며 원본을 변경하지 않습니다. ZIP에서는 정확한 루트 `GameData.db` 한 파일만 임시 폴더에 읽어 CRC와 SQLite 구조를 검사합니다.
- 키 누락, 중복 키, 중복 아이템 ID, SQL/JSON ID 충돌, 영어 이름 불일치는 연결하지 않고 보고합니다.
- `korean-names.json`과 `.report.json`이 새로 생성됩니다. 기존 출력은 덮어쓰지 않습니다.
- 결과는 `bazaar-item-details-v1` 형식의 로컬 매핑으로 개인 메타데이터 가져오기에 사용합니다.
- SHA-256은 제공 파일의 동일성을 기록할 뿐, 공식 출처나 파일 무변조를 인증하는 서명은 아닙니다. 이름을 공식 명칭으로 사용할 때는 수정되지 않은 게임의 한국어 파일인지 확인해야 합니다.
- 변환기는 합성 SQLite/ZIP 자료로 검증했습니다. 이후 사용자 제공 과거 `GameData.db.zip`을 확보해 Chronicle의 1,117개 UUID·메타데이터 일치를 확인했지만, 공식 `ko-KR.bytes`는 아직 없어 실제 한국어 매칭 수는 검증하지 못했습니다. 최신 전체 도감·언어 파일 확보 상태는 [전체 도감 갱신 조사](LATEST_CATALOG_INVESTIGATION.md)를 참고하세요.

게임의 이용 약관과 데이터 이용 조건을 직접 확인할 공식 페이지는 이 환경에서 접근할 수 없었습니다. 로컬 읽기 전용 사용이 약관상 허용된다고 단정하지 않습니다. 변환기는 파일을 공개 배포하거나 서버에 전송하지 않으며, 게임 문자열과 개인 매핑은 Cloudflare 배포 파일에 포함하지 않습니다.
