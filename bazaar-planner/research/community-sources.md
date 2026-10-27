# 커뮤니티 데이터 소스 확인

확인일: 2026-10-27 (UTC). 공개 랜딩·이용약관·검색 결과만 확인했습니다. 아이템 목록이나 이미지를 대량 수집하지 않았습니다.

## 결론

현재 두 사이트 어느 쪽에서도 이 프로젝트가 데이터와 이미지를 복사·재배포할 수 있다는 명시적 허가를 확인하지 못했습니다. 따라서 실제 데이터를 가져오지 않았습니다. Bazaar DB에는 오히려 복사·다운로드 및 유사 서비스 구축에 대한 제한이 있습니다. 출처 표기만으로 재배포 허가가 생기지는 않습니다. 데이터 API 허가와 게임 이미지 재호스팅 허가는 따로 확인해야 합니다.

## Bazaardex

- https://bazaardex.com/
- 랜딩 표시 원문: “Latest patch notes: Hotfix 19.3” / “Database updated Oct 23, 2026, 18:03 UTC” / “Game build 1.0.12764”.
- 패치 링크: https://bazaardex.com/patch-notes/hotfix-19-3
- 이 값은 커뮤니티 사이트가 표시하는 최신 기준입니다. 공식 게임의 최신 패치와 대조한 확정값은 아닙니다.
- 랜딩은 공식 Steam 뉴스에서 패치 노트를 가져온다고 설명합니다. 그것만으로 데이터 정확성 전체나 제3자 재배포 권한이 증명되지는 않습니다.
- 공개 API 문서, 오픈 데이터 다운로드 라이선스, 이미지 재배포 허가를 확인하지 못했습니다. 검색에서 찾지 못했다는 것이 존재하지 않는다는 확정은 아닙니다.
- https://bazaardex.com/terms , https://bazaardex.com/privacy , https://bazaardex.com/about , https://bazaardex.com/robots.txt 는 웹 도구가 접근하지 못해 내용을 검증하지 못했습니다. robots.txt는 접근 가능해도 저작권·재배포 허가를 대체하지 않습니다.

## Bazaar DB

- https://bazaardb.gg/
- 랜딩 표시 원문: “Database based on patch `19.3 (Oct 23)`”. 공식 검증 대신 사이트의 자기 표시입니다.
- 이용약관: https://bazaardb.gg/terms — “LAST REVISED ON: January 14, 2026”.
- 2.1: 사이트 접근 허가는 “solely for your own personal, noncommercial use”로 제한됩니다.
- 2.2(c): “you shall not access the Site in order to build a similar or competitive website, product, or service”.
- 2.2(d): 명시적 예외 외 복사·배포·재게시·다운로드 등을 제한합니다.
- 2.5: “There are no implied licenses granted under these Terms.”
- 문의 경로: https://bazaardb.gg/contact
- 공개 검색에서 나온 Parse의 “BazaarDB API”는 https://parse.bot/marketplace/155ad353-a423-43ac-9825-c1e430c5cb06/bazaardb-gg-api 이며, 스스로 공식 API가 아닌 독립 REST wrapper라고 밝힙니다. 이를 공식 데이터 사용 허가로 간주하지 않았으며 호출하지 않았습니다.
- https://bazaardb.gg/robots.txt 는 웹 도구 접근 실패로 확인하지 못했습니다.

## 정확성과 실무 적용

두 사이트가 19.3을 함께 표시하는 것은 패치 후보를 고르는 참고 근거입니다. 실제 아이템 값, 한국어 번역, 마법부여 가능 조건의 정확성은 검증하지 않았습니다. 권한이 확인되기 전에는 실제 아이템 카탈로그를 비워 두고, 사용자가 제공한 허가 자료 또는 운영자의 명시적 라이선스를 기다립니다. 이후 허용 범위(필드·수량·캐시·업데이트 주기·재배포·상업 이용·이미지 호스팅)와 공식 게임 권리자의 이미지 이용 조건을 각각 기록해야 합니다.
