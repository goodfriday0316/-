# 보드 정렬과 드래곤 데이터 확인

## 보드 정렬 수정

카드 아래에 제거 버튼을 별도 flex 행으로 추가하면서 카드 테두리가 슬롯 테두리보다 짧아졌습니다. 제거 버튼은 카드와 별개의 버튼으로 유지하되 카드 영역 안에 배치하고, 카드 하단에 버튼 공간을 예약했습니다. 카드 테두리의 위·아래가 빈 슬롯의 위·아래와 일치합니다. 이미지 비율과 이름 표시 공간을 유지합니다.

PC와 모바일의 실제 소형·중형·대형 이미지로 카드/슬롯 상하 경계 차이 1px 이하, 제거 버튼의 카드 내부 배치, 이름과 버튼의 비겹침을 확인합니다. 드래그, 제거, 저장·복원은 기존 테스트로 검증합니다.

영웅의 원본 항목이 0개이면 이미지 불러오기 안내 대신 '불러온 도감에 이 영웅의 아이템이 없습니다'를 표시합니다.

## 원본에서 확인한 수치

- Chronicle DB 및 변환 JSON: 1,117개 모두 보존.
- heroes_json에 Dragons/Dragon 또는 알 수 없는 HeroN 값: 0개.
- 영웅 소유별(복수 영웅 중복 집계): Common184, Pygmalien155, Dooley143, Mak141, Vanessa140, Stelle122, Jules120, Karnok117.
- Dragon 태그 항목은 9개이며 전부 이미지가 있습니다. Common3, Jules2, Mak2, Dooley1, Pygmalien1입니다. 태그는 영웅 소유 분류와 다르므로 Dragons 영웅으로 바꾸지 않습니다.
- 플래너 변환기와 raw-adapter에는 Dragons 지원이 있으며 원본에 있던 항목을 이미지 필터가 모두 숨긴 상황이 아닙니다.

## 데이터 시점에 관한 한계

원본 모든 행의 updated_at_unix는 1793096101(2026-10-27 19:15:01 한국 시간)입니다. Chronicle은 이 값을 가져오기/upsert 때 time.time()으로 기록합니다. 게임 콘텐츠의 출시일은 아닙니다.

원본의 version=5.0.0은 importer가 card.Version에서 가져옵니다. 확인된 게임 전체 패치 번호로 볼 수 없습니다. Chronicle은 배포본에 포함된 templates.sqlite3를 사용자 폴더로 복사할 수 있어, 최근에 받은 파일도 오래된 번들일 가능성은 있습니다.

따라서 원본에 Dragons 소유 분류가 없는 것은 확실하지만, '드래곤 출시 전 데이터'라고 확정할 근거는 부족합니다. 현재 게임이 사용하는 GameData.db(.zip)와 패치/캐시 정보를 새로 추출해 비교해야 합니다. 원본 DB나 기존 덱을 임의 수정하지 않습니다.

근거: [Chronicle importer](https://github.com/rafastr/bazaar-chronicle/blob/85dadfdea3112d38991a067bc50444f19a739fc9/scripts/import_templates.py), [갱신 시각 기록](https://github.com/rafastr/bazaar-chronicle/blob/85dadfdea3112d38991a067bc50444f19a739fc9/core/templates_db.py), [번들 DB 복사](https://github.com/rafastr/bazaar-chronicle/blob/85dadfdea3112d38991a067bc50444f19a739fc9/core/bootstrap.py).

## 검증 결과

기본 회귀 14개, 실제 PC/모바일 이미지·저장·드래그를 포함한 프로덕션 21개 테스트가 통과했습니다. 실제 1/2/3칸 카드 모두 빈 슬롯과 상하 경계 차이 0px, 제거 버튼의 하단 여백 4px, 이름과 제거 버튼 사이 여백 9px를 확인했습니다. 모바일에서 제거 문구가 두 줄로 감겨 겹치지 않도록 버튼 폭과 줄바꿈도 제한했습니다.

게임 DB·실제 이미지·개인 매핑은 배포 ZIP에 포함하지 않습니다. 데이터의 소유 분류나 기존 덱은 변경하지 않았습니다.
