# 기존 주소 유지 및 코드 보존

현재 운영 주소는 **https://b-boardmaker-mk1.hyoon0316.workers.dev/** 입니다. 주소를 유지하려면 Cloudflare의 기존 `b-boardmaker-mk1` Worker를 업데이트하세요. 새 Pages 프로젝트를 만들면 주소가 달라집니다.

## 기존 Worker에 새 ZIP 적용

현재 ZIP은 **실제 데이터 미연결 준비 빌드**입니다. 게임 아이템이 채워진 완성본이 아니므로 내용 확인 후 적용하세요. 적용 전 기존 사이트에서 JSON을 내보내고 현재 Worker 버전을 기록해 롤백할 수 있게 보관합니다.

1. 전달받은 배포 ZIP을 압축 해제해 `index.html`과 `assets/` 폴더가 보이는지 확인합니다.
2. 기존 Worker가 있는 Cloudflare 계정(Workers 하위 도메인 `hyoon0316`)에 로그인합니다.
3. **Workers & Pages → b-boardmaker-mk1**에서 기존 프로젝트의 정적 자산 업로드 또는 새 버전 배포 기능이 제공되면 해당 위치에서 파일을 올립니다. 새 프로젝트 만들기를 선택하지 마세요. 대시보드 기능은 계정/프로젝트 유형에 따라 다를 수 있습니다.
4. 대시보드에서 기존 프로젝트 자산 교체를 지원하지 않으면 아래 Wrangler 절차를 사용하거나 개발자에게 이 파일을 전달합니다.
5. 배포 후 위의 정확한 운영 주소에서 새 버전을 확인합니다.

이번 작업은 ZIP 전달까지이며 실제 원격 배포는 수행하지 않습니다.

## Wrangler로 같은 Worker 업데이트

[Node.js LTS](https://nodejs.org/)를 설치하고 소스 폴더에서 실행합니다.

```sh
npm ci
npm run build
npx wrangler login
npx wrangler deploy --assets dist --name b-boardmaker-mk1
```

로그인은 기존 Worker가 있는 계정으로 해야 합니다. `wrangler.jsonc`는 Worker 이름과 정적 자산 경로만 포함하며 비밀값은 포함하지 않습니다. 여러 Cloudflare 계정이 표시되면 기존 프로젝트의 계정을 선택하세요. 다른 계정에 같은 이름으로 새 Worker를 만들면 원래 주소를 유지할 수 없습니다. 기존 Worker에 서버 코드나 바인딩이 있다면 이 정적 전용 설정으로 덮어쓰기 전 기존 구성을 보존해야 합니다.

배포용 ZIP의 내용만 받은 경우 폴더를 `dist`로 두고 별도 작업 폴더에서 위의 로그인·배포 명령을 실행할 수도 있습니다. 사이트 사용자는 프로그램 설치 없이 운영 URL만 열면 됩니다.

공식 참고:

- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/wrangler/commands/#deploy

## GitHub에 안전하게 보관

1. [GitHub Desktop](https://desktop.github.com/download/)에 로그인하고 소스 폴더를 로컬 저장소로 추가합니다. Git 저장소가 아니라는 안내가 나오면 해당 폴더에 저장소를 생성합니다.
2. `src`, `tests`, `package.json`, `package-lock.json`, 설정과 문서를 커밋합니다. `.gitignore`가 제외하는 `node_modules`, `dist`, 비밀 파일 및 개인 덱 백업은 올리지 않습니다.
3. **Publish repository → Keep this code private**를 선택합니다. GitHub 계정에 2단계 인증도 설정하세요.
4. 변경할 때마다 **Commit → Push origin**으로 이력을 보존합니다. GitHub 웹페이지에서 Private 표시와 파일을 확인합니다.

웹의 Upload files는 `.gitignore`를 적용하지 않으므로 폴더를 무작정 업로드하지 마세요. 비밀값을 이미 올렸다면 키를 폐기·재발급해야 합니다.

GitHub는 코드 백업입니다. 사용자가 구성한 덱은 앱에서 **JSON 내보내기**로 따로 보관하세요. `package-lock.json`은 재현 가능한 설치를 위해 보존합니다.

## 저장한 덱과 무료 사용

자동 저장은 브라우저·기기·사이트 주소별로 분리됩니다. 기존 운영 주소를 유지하면 같은 브라우저의 덱을 이어서 사용할 수 있습니다. 도메인을 바꾸거나 다른 기기로 이동할 때는 JSON 내보내기/가져오기로 옮기세요. 가져오기는 전체 덱을 교체하므로 먼저 현재 덱을 백업합니다. 브라우저 데이터 삭제나 시크릿 모드에서도 저장이 사라질 수 있습니다.

현재 앱은 정적 자산으로 제공되며 Cloudflare 무료 플랜 범위에서 운영할 수 있습니다. 한도와 정책은 최신 서비스 안내를 따릅니다. 유료 도메인을 구입하지 않아도 기존 `workers.dev` 주소를 사용할 수 있습니다. 저장소는 비공개여도 배포 웹앱은 공개 주소로 방문할 수 있습니다.
