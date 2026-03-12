# llm-model-comparison

LLM이 바로 읽고 호출하기 쉬운 가격 비교용 catalog/CLI/API 스캐폴드입니다. 지금은 여기에 GitHub Pages용 정적 export도 추가되어서, 무료 정적 호스팅으로 raw data, sorted views, preset comparison view를 바로 배포할 수 있습니다.

## 목표

- 가격 데이터는 단순한 JSON catalog로 관리
- 기본 출력은 JSON이라 LLM이 바로 파싱 가능
- 같은 contract로 CLI와 API 둘 다 지원
- `compare`, `analyze` 요청을 일관된 shape로 처리

## 구조

```text
data/pricing.catalog.json          # 가격 카탈로그
contracts/llm-price-api.contract.json
src/lib/catalog.js                 # catalog 로딩/필터링
src/lib/analysis.js                # 비교/분석 core
src/lib/pricing-engine.js          # 브라우저에서도 재사용 가능한 순수 계산 로직
src/lib/static-site.js             # 정적 export 생성
src/cli.js                         # CLI
src/server.js                      # HTTP API
public/                            # GitHub Pages UI 템플릿
scripts/build-static.js            # dist/ 생성 엔트리
test/analysis.test.js              # 기본 검증
```

## Contract 원칙

모든 응답은 같은 envelope를 씁니다.

```json
{
  "contract_version": "2026-03-12",
  "object": "price_comparison",
  "data": {},
  "meta": {}
}
```

가격 모델의 핵심 필드는 아래처럼 고정합니다.

```json
{
  "id": "openai/gpt-5-mini",
  "provider": "openai",
  "model": "gpt-5-mini",
  "status": "active",
  "pricing_mode": "text_tokens",
  "last_verified_at": "2026-03-12",
  "comparison_pricing_basis": "Standard text-token pricing from the official model page.",
  "pricing": {
    "input_usd_per_1m_tokens": 0.25,
    "cached_input_usd_per_1m_tokens": 0.025,
    "output_usd_per_1m_tokens": 2
  }
}
```

이 네이밍을 길게 둔 이유는 축약어보다 LLM이 오해 없이 읽기 쉽게 하기 위해서입니다.

추가로 아래 메타데이터를 강제합니다.

- `status`: `active | preview | deprecated`
- `pricing_mode`: 현재는 `text_tokens`
- `last_verified_at`: `YYYY-MM-DD`
- `source_url`: 공식 가격 확인 링크
- `comparison_pricing_basis`: 현재 compare/analyze가 어떤 기본 rate를 쓰는지 설명

필요하면 아래 확장 필드도 같이 넣습니다.

- `pricing_tiers`: prompt 길이, long context 같은 대체 rate card
- `pricing.batch_*`: batch 할인 가격
- `pricing.cache_write_*`, `pricing.cache_storage_*`: provider별 cache write/storage 가격
- `availability_note`: deprecated, shutdown 예정일 같은 운영 메타

이 필드들이 있어야 나중에 가격 최신성과 모델 상태를 함께 해석할 수 있습니다.

## 설치

의존성은 없습니다. Node.js 20+면 됩니다.

```bash
npm test
```

## CLI

기본은 JSON 출력입니다.

```bash
node src/cli.js list
node src/cli.js show openai/gpt-5-mini
node src/cli.js compare \
  --models openai/gpt-5-mini,google/gemini-2.5-flash-lite \
  --input-tokens 1000000 \
  --output-tokens 250000
node src/cli.js analyze \
  --input-tokens 1000000 \
  --output-tokens 250000 \
  --budget-usd 1 \
  --status active
```

사람이 보기 편한 테이블도 지원합니다.

```bash
node src/cli.js list --format table
node src/cli.js compare --models openai/gpt-5-mini,google/gemini-2.5-flash-lite --input-tokens 1000000 --output-tokens 250000 --format table
```

## GitHub Pages 정적 배포

정적 사이트를 생성합니다.

```bash
npm run build
```

생성 결과는 `dist/` 아래에 나옵니다.

- `dist/data/pricing.catalog.json`
- `dist/snapshots/*.json`
- `dist/contracts/llm-price-api.contract.json`
- `dist/api/index.json`
- `dist/api/snapshots/index.json`
- `dist/api/views/by-input-price.json`
- `dist/api/views/by-output-price.json`
- `dist/api/views/status/*.json`
- `dist/api/views/pricing-modes/*.json`
- `dist/api/views/providers/*.json`
- `dist/api/views/tags/*.json`
- `dist/api/views/workloads/*.json`
- `dist/index.html`

즉, Pages에는 서버를 올리는 게 아니라 정적 JSON 문서와 브라우저 UI를 같이 올리는 구조입니다.

### 왜 이 구조가 맞는가

- raw catalog는 LLM이 직접 읽을 수 있음
- snapshot 파일로 가격 변경 이력을 남길 수 있음
- 자주 쓰는 정렬 view는 미리 JSON으로 생성 가능
- preset workload 비교도 빌드 시 미리 생성 가능
- 임의 workload 비교는 브라우저가 raw catalog를 읽고 클라이언트에서 계산

주의할 점은, GitHub Pages만으로는 임의 `POST /compare` 같은 동적 API는 제공할 수 없다는 점입니다. 정적 호스팅이기 때문에 서버 응답 대신 raw data와 precomputed view를 제공하는 방식으로 설계해야 합니다.

### Pages 배포

워크플로는 [.github/workflows/deploy-pages.yml](/Volumes/ssd-x31/pioneer-genie/llm-model-comparison/.github/workflows/deploy-pages.yml#L1)에 있습니다.

1. GitHub에서 `Settings > Pages`로 이동
2. Source를 `GitHub Actions`로 설정
3. `main` 브랜치에 push

그러면 workflow가 테스트 후 `dist/`를 Pages에 배포합니다.

## HTTP API

```bash
node src/server.js
```

기본 바인딩은 `127.0.0.1:3030` 입니다.

### 엔드포인트

- `GET /health`
- `GET /v1/catalog`
- `GET /v1/contract`
- `GET /v1/models`
- `GET /v1/models?id=openai/gpt-5-mini`
- `POST /v1/compare`
- `POST /v1/analyze`

### 예시

```bash
curl -s http://localhost:3030/v1/models
```

```bash
curl -s http://localhost:3030/v1/models?id=openai/gpt-5-mini
```

```bash
curl -s http://localhost:3030/v1/compare \
  -H 'content-type: application/json' \
  -d '{
    "model_ids": ["openai/gpt-5-mini", "google/gemini-2.5-flash-lite"],
    "workload": {
      "input_tokens": 1000000,
      "output_tokens": 250000
    }
  }'
```

```bash
curl -s http://localhost:3030/v1/analyze \
  -H 'content-type: application/json' \
  -d '{
    "filters": { "tag": "cost", "status": "active" },
    "workload": {
      "input_tokens": 1000000,
      "output_tokens": 250000
    },
    "budget_usd": 1
  }'
```

## LLM 친화 포인트

- JSON이 기본 출력이라 tool calling이나 agent ingestion에 바로 사용 가능
- `contract_version`, `object`, `data`를 모든 응답에 고정
- 필드명을 축약하지 않고 의미 중심으로 명시
- CLI와 API가 같은 로직을 써서 응답 shape가 일관됨
- `/v1/contract`와 `contracts/llm-price-api.contract.json`로 machine-readable contract 제공
- GitHub Pages 배포 시에도 raw catalog와 sorted static JSON view를 그대로 유지
- `status`, `pricing_mode`, `last_verified_at`, `source_url`가 있어서 LLM이 최신성과 운영 상태를 같이 해석 가능

## 데이터 운영 원칙

- 가격 변경 시 `data/pricing.catalog.json`을 갱신합니다.
- 같은 날짜 기준 스냅샷을 `snapshots/YYYY-MM-DD.pricing.catalog.json`에 남깁니다.
- 최소 검증 기준은 `id` 중복 금지, `status` 필수, `pricing_mode` 필수, `last_verified_at` 필수, `source_url` 필수입니다.
- 현재 catalog는 OpenAI, Anthropic, Google의 공식 pricing page 기준 curated general-purpose + coding(Codex) text model 집합입니다.
- provider가 prompt 길이, long context, batch, cache storage를 따로 공개하면 `pricing_tiers`와 확장 pricing 필드에 같이 적재합니다.

## 주의

이 catalog는 2026-03-12 기준 공식 페이지 수집본이지만, provider 가격표는 자주 바뀝니다. 실제 의사결정 전에는 `last_verified_at`과 `source_url`을 다시 확인하는 편이 안전합니다.
