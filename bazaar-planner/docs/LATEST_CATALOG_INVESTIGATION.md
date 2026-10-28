# 전체 아이템 도감 갱신 조사 — 2026-10-28 UTC

## 결론과 현재 상태

기존 UI를 다시 만들지 않고 데이터 계층만 갱신할 수 있는 구조입니다. 다만 **Bazaardex/BazaarDB의 최신 전체 스냅샷, 게임 UUID 대응 관계, 일괄 이용 조건은 이번에 검증하지 못했습니다.** 최신 도감을 확보하지 않은 상태에서 신규·드래곤즈 수나 영웅/태그 변경 수를 0으로 보고하지 않습니다.

현재 도감 1,117개, 로컬 이미지 1,080장, 저장된 덱을 교체하거나 삭제하지 않았습니다. 이번 변경은 읽기 전용 비교 도구와 이 보고서뿐입니다. 실제 게임 DB·이미지·개인 비교 결과를 이 문서나 배포 파일에 넣지 않았습니다.

## 수량과 비교 가능 범위

| 항목 | 보존한 기존 자료 | 최신 전체 도감과 비교 |
| --- | ---: | --- |
| Chronicle 아이템 | 1,117 | 최신 전체 수 미검증 |
| 이미지 파일명 UUID | 1,080 | 최신 UUID와 재사용 가능한 수 미검증 |
| 기존 자료 중 이미지 없음 | 37 | 게임에서 삭제되었다는 뜻은 아님 |
| 기존 UUID와 정확히 같은 최신 항목 | — | 미검증 |
| 신규 UUID / 기존 자료에만 있는 UUID | — | 미검증 / 미검증 |
| 영웅 소유 / 태그 변경 | — | 미검증 / 미검증 |
| 최신 드래곤즈 소유 / 신규 드래곤즈 | — | 미검증 / 미검증 |
| 검증된 공식 한국어 이름 | 0 | 최신 한국어 파일 미확보 |

기존 자료 검산: Chronicle과 `chronicle-local.json`의 1,117개 UUID 및 이름·영웅·크기·태그·ignored·이미지 ID 차이는 0개입니다. 첨부된 과거 `GameData.db.zip`도 비교기를 보완한 뒤 재검사했습니다. 원본 Item 1,146개에서 Chronicle의 기존 이름 제외 조건에 걸리는 29개를 제외하면 1,117개가 정확히 일치하고 이름·영웅·태그·크기·ArtKey 차이는 각각 0개입니다. 이미지 1,080장은 모두 이 기존 UUID에 연결됩니다. **이 결과는 과거 원본 검산이며 최신 사이트 비교 결과가 아닙니다.**

기준 파일의 SHA-256:

- Chronicle DB: `1e7967ffbc98a80b19360629e8b464c63e21468ef88dbd99e07c7b64ef7a86e7`
- 로컬 도감 JSON: `7bc73e452d742bdf3e2c86d9760af73d758e005e5bbb91fbd1d6343309f384a8`

## Bazaardex 우선 조사

조사 대상은 [Bazaardex](https://www.bazaardex.com/)입니다. 직접 요청은 목적지 서버에 도달하기 전 환경 CONNECT 프록시에서 403으로 거부됐고, 권한 확대 실행에서도 같은 결과였습니다. 사이트 서버 오류나 사이트의 크롤링 거절로 판단하지 않습니다.

GitHub 공개 저장소·README·이슈·커밋 검색에서 Bazaardex의 공식 API/전체 내보내기 문서나 UUID 교차표를 확보하지 못했습니다. 일부 검색은 429 이후 중단했습니다. 검색 결과가 없다는 이유로 API 자체가 없다고 단정하지 않습니다.

- 최신 일괄 데이터 주소·응답 스키마: 미확인.
- 최신 이용 약관·API 허용 범위·이미지 이용 조건: 미확인.
- 게임 template UUID 및 영웅·태그·이미지 참조: 미확인.
- 공식 한국어 데이터 제공 여부: 미확인.

기존 프로젝트 보고서의 패치 표시는 과거 조사 기록일 뿐이며, 이번에 현재 버전이나 도감의 완전성을 재검증한 근거로 사용하지 않습니다. 이름을 URL 슬러그로 바꾸거나 비슷한 이름을 기존 UUID에 자동 연결하지 않습니다.

## BazaarDB 우선 조사

실제 사이트는 [bazaardb.gg](https://bazaardb.gg/)입니다. [약관](https://bazaardb.gg/terms) 직접 요청도 같은 환경 프록시에서 차단됐습니다.

기존 프로젝트에는 약관 §2.2의 재사용 제한을 이유로 제외한 기록과 파이프라인 차단이 있습니다. 이번에 최신 약관 원문을 재확인한 것은 아니며 해당 제한을 해제하지 않았습니다. 공개된 독립 도구도 사이트 스크래핑 대신 로컬 게임 캐시를 사용합니다. 이 도구의 설명은 보조 근거이며 운영자의 허가 문서를 대신하지 않습니다.

- [bazaardb-cli의 경계 설계](https://github.com/loonghao/bazaardb-cli/blob/3aaa45d747745249a7c727830b51307c81dac637/docs/adr/0001-provider-cache-boundary.md)는 공개 개발자 API 및 재사용 허가를 확보하지 못했다고 설명합니다.
- [NOTICE](https://github.com/loonghao/bazaardb-cli/blob/3aaa45d747745249a7c727830b51307c81dac637/NOTICE.md)는 코드 라이선스와 게임/사이트 콘텐츠의 권리가 별도라고 구분합니다.
- [BazaarPlusPlus의 BazaarDB 피드 설계](https://github.com/BazaarPlusPlus/BazaarPlusPlus/blob/fe1fe705fc084cb8f99314e758fcf7f40cf57fa5/bazaarplusplus-server/docs/adr/0004-bazaardb-cursor-feed.md)는 인증된 플레이 기록·스크린샷 피드입니다. 전체 아이템 도감 API가 아닙니다. 계정 연결 API도 아이템 내보내기로 사용하지 않았습니다.

공개된 [S19 드래곤즈 분석 사본](https://github.com/IceZero610/TheBazaarGameAnalysis/blob/0cb4e7df81f902d6997f19816e40807f29d8770e/s19/the-dragons.html)은 패치 19.2, 원본 갱신 시각 2026-10-20을 표시합니다. 이 자료의 `itemsSeen=835`는 드래곤즈 플레이에서 **관측된** 아이템 수이며, 드래곤즈 소유 아이템이나 최신 전체 도감 수가 아닙니다. 소유 영웅 원문이 없고 사이트 식별자도 게임의 canonical UUID 형식이 아니어서, 명시적 UUID 교차표 없이 기존 아이템과 병합하지 않습니다.

해당 자료의 아트 URL은 콘텐츠 해시를 사용합니다. 기존 UUID 파일명과 URL·그림이 비슷하다는 이유로 연결하지 않습니다. 이 사본을 최신 도감으로 채택하거나 앱·배포 ZIP에 복사하지 않았습니다.

## 발견한 전체 JSON 후보

[BazaarDBKR의 다운로드 코드](https://github.com/kms1601/BazaarDBKR/blob/8ca58a08d84de364e77af087b598127fa5064312/data/fetch_game_data.py)와 [주소 상수](https://github.com/kms1601/BazaarDBKR/blob/8ca58a08d84de364e77af087b598127fa5064312/data/const.py)는 아래 주소를 사용합니다.

`https://data.playthebazaar.com/static/cards.json`

이는 게임 공식 도메인의 **접근 후보**입니다. 현재 응답도 환경 프록시에서 차단되어 최신성·필드·전체 수·이용 조건을 확인하지 못했습니다. 소스 코드에서 발견한 주소를 검증된 최신 API라고 표시하지 않습니다.

해당 코드는 최상위 버전 키 중 첫 번째를 선택하지만, 첫 키가 최신이라는 보장은 없습니다. 확보 후 실제 버전 목록과 패치 근거를 먼저 확인해야 합니다. 공식 도메인에서 내려받을 수 있다는 사실만으로 데이터나 이미지의 공개 재배포를 허용한다고 판단하지 않습니다.

## 드래곤즈 분류와 최신 로컬 원본

최신 공개 연동 코드의 [영웅 별칭 정의](https://github.com/BazaarPlusPlus/BazaarPlusPlus/blob/fe1fe705fc084cb8f99314e758fcf7f40cf57fa5/bazaarplusplus-mod/src/BazaarPlusPlus.Core/GameState/TheDragonsHeroId.cs)는 `TheDragons`와 이전 값 `Hero8`을 명시합니다. [게임 enum 대응 코드](https://github.com/BazaarPlusPlus/BazaarPlusPlus/blob/fe1fe705fc084cb8f99314e758fcf7f40cf57fa5/bazaarplusplus-mod/src/BazaarPlusPlus/GameInterop/Cards/DesktopCardFacets.cs)에서도 대응을 확인할 수 있습니다. 제3자 코드의 근거이며 공식 영웅 데이터 레코드 그 자체는 아닙니다.

읽기 전용 비교기는 이 두 정확한 값을 기존 `Dragons`/`The Dragons`와 함께 인식하도록 보완했습니다. 원문은 그대로 보고하고, `Dragon` 태그나 이름으로 영웅을 추정하지 않습니다. 과거 원본 2,709개 카드의 Heroes에는 네 값과 `Dragon` 모두 0개이므로 과거 파일의 누락 결론은 바뀌지 않습니다.

최신 PC 원본의 유력 경로는 다음과 같습니다. [로컬 데이터 제공자 문서](https://github.com/loonghao/bazaardb-cli/blob/3aaa45d747745249a7c727830b51307c81dac637/docs/providers.md) 및 [런타임 SQLite 카드맵 접근 코드](https://github.com/BazaarPlusPlus/BazaarPlusPlus/blob/fe1fe705fc084cb8f99314e758fcf7f40cf57fa5/bazaarplusplus-mod/src/BazaarPlusPlus/GameInterop/StaticCards/BppStaticDataAccess.cs)가 근거입니다. 모드 설치는 필요하지 않습니다.

```text
%USERPROFILE%\AppData\LocalLow\Tempo Storm\The Bazaar\prod\cache\GameData.db
```

게임의 데이터 갱신을 마친 뒤 게임 등 작성 프로그램을 사용자가 정상 종료하고, 이 파일의 복사본과 기존 Chronicle DB를 비교하면 됩니다. 설치 폴더의 과거 `StreamingAssets/GameData.db.zip`과 다른 파일일 수 있습니다. 파일 날짜만으로 최신 패치를 확정하지 말고 실행 버전도 함께 기록해야 합니다. WAL이 남아 있으면 비교기는 중단하며 원본 DB에 checkpoint나 수정 작업을 실행하지 않습니다.

## 새 이미지와 공식 한국어 이름

기존 이미지 1,080장의 template UUID 연결은 유지합니다. 최신 스냅샷과의 UUID 교집합 및 ArtKey 변경을 검사해야 실제 재사용 가능 수와 새 이미지 필요 수를 계산할 수 있습니다. 같은 UUID의 ArtKey가 바뀌더라도 기존 이미지를 자동 삭제하거나 덮어쓰지 않습니다.

새 이미지는 출처가 제공하는 명시적 template UUID→이미지 참조 또는 최신 로컬 게임 자원의 정확한 참조 관계가 필요합니다. 이번에는 이 관계를 가진 최신 이미지 manifest/캐시를 확보하지 못했습니다. Bazaardex/BazaarDB의 이미지 일괄 다운로드 허용 조건도 미확인입니다. 따라서 임의 CDN URL 생성이나 이름 검색에 의한 다운로드 도구는 실행하지 않았습니다. 관계와 조건이 확인되면 PC에서 개인 ZIP을 만들고 기존 IndexedDB 이미지 불러오기를 재사용할 수 있습니다. 이미지와 게임 데이터는 Cloudflare 파일에 넣지 않습니다.

[BazaarDBKR의 번역 수집 코드](https://github.com/kms1601/BazaarDBKR/blob/8ca58a08d84de364e77af087b598127fa5064312/data/fetch_translate_data.py)는 Paratranz를 사용합니다. 이 출처만으로 공식 한국어라고 표시하지 않으며 영어 이름만으로 UUID에 연결하지 않습니다.

공식 이름은 같은 버전 게임의 `Localization.Title.Key`와 공식 `ko-KR.bytes`의 `translation.hash`를 정확히 연결하는 기존 로컬 변환기를 재사용할 수 있습니다. 첨부된 과거 DB의 Item 1,146개에는 모두 비어 있지 않은 Title.Key 문자열이 있습니다. 현재 공식 한국어 파일을 받지 못해 검증된 이름은 0개이며 기존 1,117개는 영어를 유지합니다. 최신 도감의 한국어 수는 아직 알 수 없습니다. [한국어 변환 안내](LOCALIZATION_RESEARCH.md)를 참고하세요.

## 기존 데이터 계층의 보존 방식

1. 원본과 최신 후보를 별도 보관하고 출처·시각·해시·버전 근거·이용 조건을 기록합니다. 이번에는 후보를 활성 도감으로 전환하지 않았습니다.
2. 비교는 canonical template UUID가 같은 레코드끼리만 수행합니다. 다른 ID는 이름이 같아도 신규/별도 레코드이며 명시적인 원본 교차표 없이는 병합하지 않습니다. 중복·ID 충돌은 격리합니다.
3. 같은 ID의 이름·영웅·태그·크기·ArtKey 변화를 이전/이후 값으로 보고합니다. 배열 순서 변화와 실제 영웅/태그 구성 변화는 구분합니다. 새 데이터에 없다는 이유로 삭제·비활성이라고 추정하지 않습니다.
4. 앱의 `local-raw:<UUID>`를 유지하면 기존 IndexedDB 이미지 키를 재사용할 수 있습니다. 도감 저장소와 이미지 저장소는 별도입니다.
5. 저장 덱은 아이템 snapshot·크기·등급·마법부여를 보존하며 기존 배치 snapshot을 자동 갱신하지 않습니다. snapshot 없는 오래된 백업은 갱신 전 별도 검증이 필요합니다. 한국어/외부 링크 매핑도 UUID와 영어 원문을 재확인합니다.
6. 최신 원문 영웅값을 보고한 뒤 검증된 명시적 대응만 적용합니다. 현재 앱의 unknown-hero 격리 규칙을 우회하지 않았습니다. UI·보드·드래그·저장 기능의 재작성은 필요하지 않습니다.

기존 공개 배포용 파이프라인은 콘텐츠를 `src/public`에 쓰는 기능이 있어 개인 로컬 갱신 용도로 실행하지 않았습니다. 향후 실제 갱신은 로컬 후보 파일→비교 보고서→기존 브라우저 가져오기 흐름으로 구현해야 합니다.

## 검증 및 남은 접근 조건

- 비교 도구의 합성 자료 테스트 9개가 통과했습니다. exact ID 신규 판정, 명시적 영웅 별칭, 필드별 차이, 배열 순서와 구성 차이, 입력 보존, 잘못된 ID/ZIP/중복 거부를 검사합니다.
- 실제 과거 DB·Chronicle·6개 이미지 ZIP을 다시 비교했고 게임 DB ZIP·Chronicle DB의 입력 해시 불변과 이미지 CRC/헤더 검사를 통과했습니다. 픽셀 디코딩은 이번 CLI 검사의 범위가 아닙니다.
- 앱 소스·실제 도감·브라우저 덱/이미지 저장소는 수정하지 않았으므로 이번에 PC/모바일 UI를 다시 빌드하거나 Cloudflare ZIP을 교체하지 않았습니다.

환경의 허용 목록 초안에 `bazaardex.com`, `www.bazaardex.com`, `bazaardb.gg`, `www.bazaardb.gg`, `data.playthebazaar.com`, `www.playthebazaar.com`을 저장했습니다. 도구는 `status=saved`, `requires_publish=true`를 반환했습니다. **초안 저장은 현재 환경에 접근 권한을 적용하거나 환경을 게시한 것이 아닙니다.** 환경 설정에서 검토·저장 후 게시해야 합니다. 적용 뒤 각 사이트의 실제 응답과 조건부터 다시 확인해야 하며, 허용 목록을 추가해도 해당 서버가 API나 재사용을 허가한다는 뜻은 아닙니다.

사이트 접근 없이도 위 최신 런타임 `GameData.db` 복사본과 공식 한국어 파일을 PC에서 기존 읽기 전용 도구로 검사할 수 있습니다. 최신 파일 또는 검증 가능한 전체 export가 확보되어야 신규 수·UUID 일치 수·드래곤즈 수·분류/태그 변화·이미지 재사용 수를 실제 숫자로 채울 수 있습니다.
