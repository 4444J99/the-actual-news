## Q: 
There was a time when, before privatization, news was the news. It didn't try and make money. It was a public service without intentional bias, let's say. Design a platform and business model and the software to automate and fix this, essentially.

## A: 
## Objective

Rebuild “news as a public service” by making **truthfulness and accountability** the product, and making **attention** economically irrelevant.

That requires three coupled designs: a platform architecture, a governance-and-incentives business model, and software automation that continuously produces verifiable reporting artifacts (not just articles).

I’ll describe a concrete blueprint you could implement under environment-configured deployment primitives like `$PLATFORM_ID`, `$LEDGER_URI`, `$EVIDENCE_STORE_URI`, `$MODEL_GATEWAY_URI`, `$PUBLIC_APP_URI`.

* * *

## Platform design

### Core idea: publish _reports plus a verification spine_

Every story ships with three layers, all publicly accessible:

Layer A: Narrative  
Human-readable piece, written for comprehension.

Layer B: Claims Ledger  
Machine-readable set of atomic claims extracted from the narrative, each with scope, time bounds, and confidence.

Layer C: Evidence Graph  
Links from each claim to primary evidence objects (documents, transcripts, datasets, raw media), plus counterevidence and known uncertainties.

This turns “bias disputes” into inspectable objects: people can argue about a specific claim node and its evidence edges rather than vibes.

### User-facing surfaces

Reader surface at `$PUBLIC_APP_URI`  
Story view shows the narrative and an expandable “verification spine” panel: claims, evidence, uncertainty, correction history.

Verifier surface at `$VERIFIER_APP_URI`  
Crowd/credentialed reviewers see claim queues, evidence gaps, contradiction alerts, and structured review tasks.

Publisher surface at `$NEWSROOM_APP_URI`  
Journalists get an “evidence-first” editor: you attach evidence, draft narrative, the system auto-extracts claims, flags unsupported statements, and generates disclosure blocks.

Public API at `$PUBLIC_API_URI`  
All claims/evidence/corrections are queryable. Third parties can build their own “front pages” without changing the underlying record.

### Governance features baked into product

Conflicts registry  
Every contributor’s affiliations, funding relationships, and recusal history are structured and queryable (`$COI_REGISTRY_URI`).

Corrections are first-class  
Corrections are not “updates”; they are immutable events appended to the claim ledger with reason codes and a link to the evidence change that triggered it.

Separation of powers inside the platform  
Editorial (what to cover), Verification (is it supported), Distribution (how it’s displayed) are separate roles and permissions. No single actor can quietly rewrite the record.

* * *

## Business model that makes clickbait irrational

If you pay for attention, you get attention engineering. So the model must pay for _verified informational utility_.

### Revenue architecture (no ads, no per-click)

Primary funding: Civic subscriptions  
Individuals pay a flat membership (or sliding scale) for: reliable coverage, open archives, and participation rights in verification. Membership is not a “premium news feed”; it’s a governance and sustainability mechanism.

Institutional funding: Public-interest procurement  
Cities, libraries, universities, unions, NGOs subscribe for enterprise features: local bulletin integrations, curriculum packs, API access, and “public record packs” (FOIA bundles, meeting summaries) delivered under open licenses.

Endowment + matching funds  
A legally separated endowment (or cooperative reserve) smooths revenue volatility. Matching funds can be triggered by measurable quality outcomes.

Micropayments for _bounties_, not clicks  
Members can fund specific investigations as bounties. Funds release only when a predefined verification threshold is met (see “Quality markets” below).

### Incentives that reward truth, not traffic

Pay contributors on quality-weighted outputs  
Each piece yields “verification units” based on: claim density, primary-source ratio, correction rate (lower is better, but with nuance), and reviewer consensus stability.

Quality markets (prediction + verification)  
For high-impact claims, the platform can run an internal prediction market limited to members/reviewers, where payouts depend on later verification. This doesn’t decide truth; it identifies where scrutiny is needed and prices uncertainty.

Distribution neutrality  
The platform’s UI can be personalized, but ranking is constrained to quality signals (evidence completeness, claim criticality, locality relevance), not engagement loops.

* * *

## Software automation to enforce the model

### Pipeline overview (event-driven)

Everything is a signed event appended to a ledger at `$LEDGER_URI`.

Ingest  
Inputs: reporter drafts, source docs, transcripts, datasets, external wires.  
Outputs: normalized evidence objects, provenance metadata.

Extract  
Models generate structured claims from narratives and propose which evidence supports each claim.

Verify  
Automated checks plus human-in-the-loop review tasks. Contradictions create “dispute threads” tied to claim IDs.

Publish  
Narrative becomes visible only when minimum verification thresholds are met (configurable by category).

Monitor  
Post-publication: new evidence, new data, and external corrections can trigger re-verification events.

### Verification automation modules (concrete)

Provenance and tamper-evidence  
Every evidence object is content-addressed. Store raw items at `$EVIDENCE_BLOB_STORE_URI` and their hashes in `$EVIDENCE_INDEX_URI`. The narrative references evidence by hash, not by mutable URLs.

Claim extraction and typing  
Each claim has: `claim_type` (factual, statistical, attribution, interpretation), `time_window`, `jurisdiction`, `entities`, `numerics`, `sensitivity`.

Evidence matching  
The system tries to map each claim to one of: primary document, direct quote transcript, dataset slice, or firsthand media. If it can’t, the claim becomes “unsupported” and blocks publication unless explicitly marked as analysis/opinion.

Cross-source corroboration  
For high-impact factual claims, require corroboration from independent sources or primary records. Independence is computed via ownership and upstream citation graphs.

Contradiction detection  
When two published claims conflict on the same entity/time slice, the platform raises a “collision event” and pushes it to verification.

Bias and framing diagnostics (non-moralizing, measurable)  
Instead of labeling “bias,” measure “framing variance”: headline sentiment divergence, omission risk (missing counterfactuals), and quote balance. These are shown as diagnostics, not editorial dictates.

### Minimal canonical data objects (drop-in spec)

Use environment-bound IDs so your system can shard cleanly.

`$CLAIM_LEDGER`  
A table or append-only log keyed by `$CLAIM_ID`, containing normalized claims extracted from narratives.

`$EVIDENCE_GRAPH`  
A graph keyed by `$EVIDENCE_ID` (content hash) and `$CLAIM_ID` edges with support strength and reviewer notes.

`$CORRECTION_LOG`  
Append-only events keyed by `$CORRECTION_ID` that point to prior `$CLAIM_ID`s, with reason codes and new evidence edges.

`$COI_REGISTRY`  
Structured conflicts/disclosures keyed by `$ACTOR_ID`, time-bounded, queryable.

A compact example schema shape (language-agnostic):

`$CLAIM = { id, story_id, claim_type, text, entities[], time_window, jurisdiction, numeric_payload?, support_status, confidence_model, confidence_review, created_at }`  
`$EVIDENCE = { id_hash, uri, media_type, extracted_text?, provenance: {source, chain, collected_at}, signatures[], licenses[] }`  
`$EDGE = { claim_id, evidence_id_hash, relation: supports|contradicts|context, strength, reviewer_id?, notes?, created_at }`

* * *

## Architecture you can actually build

### Services (clean separation)

`$GATEWAY_SERVICE`  
Auth, rate limits, API façade.

`$STORY_SERVICE`  
Narrative drafts, versioning, publishing states.

`$CLAIM_SERVICE`  
Claim extraction, typing, ledger writes.

`$EVIDENCE_SERVICE`  
Ingest, hashing, storage, OCR/transcription hooks, provenance.

`$VERIFICATION_SERVICE`  
Task queues, reviewer workflow, scoring, contradiction engine.

`$RANKING_SERVICE`  
Quality-first ranking under strict rules (no engagement optimization).

`$AUDIT_SERVICE`  
Public audit endpoints, diff views, correction timelines.

### Storage choices (practical defaults)

Ledger  
PostgreSQL with append-only tables plus cryptographic signatures is enough for v1; you can later mirror to a public transparency log.

Evidence blobs  
S3-compatible object store at `$EVIDENCE_BLOB_STORE_URI`.

Graph  
Start with relational edges; later promote to a graph DB if needed.

Search  
OpenSearch/Meilisearch for entity and claim search.

### Model usage policy (to avoid “AI laundering”)

All model outputs are treated as _proposals_, never authoritative. Every model-produced claim link must be reviewable, and any published claim must have either primary evidence or explicit “analysis/opinion” labeling with different UI treatment.

Configure this with gates like: `$MIN_PRIMARY_EVIDENCE_RATIO`, `$MIN_REVIEWER_QUORUM`, `$HIGH_IMPACT_CORROBORATION_RULES`.

* * *

## How this “fixes” the original problem

Privatized news drifted because it had to sell attention and narrative certainty. This design reverses that:

Revenue is not coupled to clicks.  
Publishing is coupled to verifiable artifacts.  
Corrections are reputationally rewarded because they improve the ledger, not because they’re hidden.

The platform becomes less like “a paper” and more like “a public record compiler with a readable interface.”

* * *

## Implementation path (fastest path to a working system)

Phase 1 at `$MVP_SCOPE=local`  
Local-government and civic-beat reporting only (meetings, budgets, procurement, school boards). This domain has abundant primary sources, making verification tractable and showing immediate value.

Phase 2 at `$SCALE_SCOPE=regional`  
Add investigative bounties and institutional subscriptions.

Phase 3 at `$SCALE_SCOPE=federated`  
Federate multiple local nodes under shared protocols, so no single org controls “the record.”

* * *

If you want, I can translate this into a concrete repo layout and runnable service contracts (OpenAPI specs, database migrations, event schemas, and a minimal UI flow) parameterized entirely by environment variables like `$PLATFORM_ID`, `$POSTGRES_URI`, `$EVIDENCE_BLOB_STORE_URI`, `$MODEL_GATEWAY_URI`, `$PUBLIC_APP_URI`.

## Q: 
translate this into a concrete repo layout and runnable service contracts (OpenAPI specs, database migrations, event schemas, and a minimal UI flow) parameterized entirely by environment variables like $PLATFORM_ID, $POSTGRES_URI, $EVIDENCE_BLOB_STORE_URI, $MODEL_GATEWAY_URI, $PUBLIC_APP_URI.

## A: 
## `$REPO_ID=news-ledger-platform` monorepo layout

```plain text
$REPO_ROOT/
  README.md
  .env.example
  Makefile

  contracts/
    openapi/
      gateway.openapi.yaml
      story.openapi.yaml
      claim.openapi.yaml
      evidence.openapi.yaml
      verify.openapi.yaml
      common.openapi.yaml
    events/
      envelope.v1.schema.json
      story.drafted.v1.schema.json
      story.published.v1.schema.json
      evidence.ingested.v1.schema.json
      claim.extracted.v1.schema.json
      verification.task.created.v1.schema.json
      correction.appended.v1.schema.json

  db/
    migrations/
      001_init.sql
      002_outbox.sql
      003_indexes.sql

  apps/
    public-web/
      package.json
      next.config.js
      src/
        pages/
          index.tsx
          story/[story_id].tsx
          verify/index.tsx
          verify/task/[task_id].tsx
        lib/
          api.ts
          env.ts

  infra/
    docker-compose.yml
    prism/
      Dockerfile
    postgres/
      init.sql

  services/
    gateway/                 # optional real BFF; prism can mock first
      package.json
      src/
        server.ts
        env.ts
    story/
      package.json
      src/
        server.ts
        env.ts
    claim/
      package.json
      src/
        server.ts
        env.ts
    evidence/
      package.json
      src/
        server.ts
        env.ts
    verify/
      package.json
      src/
        server.ts
        env.ts

  tools/
    migrate.sh
    gen-ulid.ts
```

* * *

## `.env.example` (everything is env-driven)

```bash
export PLATFORM_ID="plf_local_01"

export POSTGRES_URI="postgres://news:news@localhost:5432/news_ledger?sslmode=disable"

export EVIDENCE_BLOB_STORE_URI="s3://evidence"
export EVIDENCE_BLOB_STORE_ENDPOINT="http://localhost:9000"
export EVIDENCE_BLOB_STORE_REGION="us-east-1"
export EVIDENCE_BLOB_STORE_ACCESS_KEY="minioadmin"
export EVIDENCE_BLOB_STORE_SECRET_KEY="minioadmin"

export MODEL_GATEWAY_URI="http://localhost:8099"

export PUBLIC_APP_URI="http://localhost:3000"
export PUBLIC_API_URI="http://localhost:8080"

export GATEWAY_PORT="8080"
export STORY_PORT="8081"
export CLAIM_PORT="8082"
export EVIDENCE_PORT="8083"
export VERIFY_PORT="8084"

export EVENT_BUS_URI="postgres://news:news@localhost:5432/news_ledger?sslmode=disable"
export EVENT_TOPIC_PREFIX="newsledger"

export MIN_REVIEWER_QUORUM="2"
export MIN_PRIMARY_EVIDENCE_RATIO="0.50"
export HIGH_IMPACT_CORROBORATION_REQUIRED="true"
```

* * *

## `infra/docker-compose.yml` (runnable “contracts-first” with Prism mocks)

This boots Postgres plus Prism mock servers for each OpenAPI spec, so the UI can run against a stable API immediately.

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: news
      POSTGRES_PASSWORD: news
      POSTGRES_DB: news_ledger
    ports:
      - "5432:5432"
    volumes:
      - ./postgres/init.sql:/docker-entrypoint-initdb.d/init.sql:ro

  prism-gateway:
    image: stoplight/prism:5
    command: ["mock", "-h", "0.0.0.0", "/contracts/openapi/gateway.openapi.yaml"]
    volumes:
      - ../contracts:/contracts:ro
    ports:
      - "${GATEWAY_PORT:-8080}:4010"

  prism-story:
    image: stoplight/prism:5
    command: ["mock", "-h", "0.0.0.0", "/contracts/openapi/story.openapi.yaml"]
    volumes:
      - ../contracts:/contracts:ro
    ports:
      - "${STORY_PORT:-8081}:4010"

  prism-claim:
    image: stoplight/prism:5
    command: ["mock", "-h", "0.0.0.0", "/contracts/openapi/claim.openapi.yaml"]
    volumes:
      - ../contracts:/contracts:ro
    ports:
      - "${CLAIM_PORT:-8082}:4010"

  prism-evidence:
    image: stoplight/prism:5
    command: ["mock", "-h", "0.0.0.0", "/contracts/openapi/evidence.openapi.yaml"]
    volumes:
      - ../contracts:/contracts:ro
    ports:
      - "${EVIDENCE_PORT:-8083}:4010"

  prism-verify:
    image: stoplight/prism:5
    command: ["mock", "-h", "0.0.0.0", "/contracts/openapi/verify.openapi.yaml"]
    volumes:
      - ../contracts:/contracts:ro
    ports:
      - "${VERIFY_PORT:-8084}:4010"
```

* * *

## `contracts/openapi/common.openapi.yaml` (shared components)

```yaml
openapi: 3.0.3
info:
  title: Common Types
  version: "1.0.0"

components:
  schemas:
    Ulid:
      type: string
      description: ULID string
      pattern: "^[0-9A-HJKMNP-TV-Z]{26}$"

    IsoTime:
      type: string
      format: date-time

    Error:
      type: object
      required: [code, message]
      properties:
        code: { type: string }
        message: { type: string }
        details: { type: object, additionalProperties: true }

    ActorRef:
      type: object
      required: [actor_id]
      properties:
        actor_id: { $ref: "#/components/schemas/Ulid" }

    EvidenceRef:
      type: object
      required: [evidence_id_hash]
      properties:
        evidence_id_hash:
          type: string
          description: content hash, e.g. sha256:...
          minLength: 16
```

* * *

## `contracts/openapi/story.openapi.yaml` (Story Service)

```yaml
openapi: 3.0.3
info:
  title: Story Service
  version: "1.0.0"
servers:
  - url: ${STORY_BASE_URI}
paths:
  /v1/health:
    get:
      operationId: storyHealth
      responses:
        "200":
          description: ok

  /v1/stories:
    post:
      operationId: createStory
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateStoryRequest"
      responses:
        "201":
          description: created
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Story" }
        "400":
          description: error
          content:
            application/json:
              schema: { $ref: "common.openapi.yaml#/components/schemas/Error" }

    get:
      operationId: listStories
      parameters:
        - in: query
          name: state
          schema: { type: string, enum: [draft, review, published] }
        - in: query
          name: limit
          schema: { type: integer, minimum: 1, maximum: 200, default: 50 }
      responses:
        "200":
          description: list
          content:
            application/json:
              schema:
                type: object
                required: [items]
                properties:
                  items:
                    type: array
                    items: { $ref: "#/components/schemas/Story" }

  /v1/stories/{story_id}:
    get:
      operationId: getStory
      parameters:
        - in: path
          name: story_id
          required: true
          schema: { $ref: "common.openapi.yaml#/components/schemas/Ulid" }
      responses:
        "200":
          description: story
          content:
            application/json:
              schema: { $ref: "#/components/schemas/StoryWithVersions" }
        "404":
          description: not found
          content:
            application/json:
              schema: { $ref: "common.openapi.yaml#/components/schemas/Error" }

  /v1/stories/{story_id}/versions:
    post:
      operationId: createStoryVersion
      parameters:
        - in: path
          name: story_id
          required: true
          schema: { $ref: "common.openapi.yaml#/components/schemas/Ulid" }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/CreateVersionRequest" }
      responses:
        "201":
          description: created
          content:
            application/json:
              schema: { $ref: "#/components/schemas/StoryVersion" }

  /v1/stories/{story_id}/publish:
    post:
      operationId: publishStory
      parameters:
        - in: path
          name: story_id
          required: true
          schema: { $ref: "common.openapi.yaml#/components/schemas/Ulid" }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/PublishStoryRequest" }
      responses:
        "202":
          description: accepted
          content:
            application/json:
              schema:
                type: object
                required: [publish_job_id]
                properties:
                  publish_job_id: { $ref: "common.openapi.yaml#/components/schemas/Ulid" }

components:
  schemas:
    Story:
      type: object
      required: [story_id, platform_id, title, state, created_at]
      properties:
        story_id: { $ref: "common.openapi.yaml#/components/schemas/Ulid" }
        platform_id: { type: string }
        title: { type: string }
        state: { type: string, enum: [draft, review, published] }
        created_at: { $ref: "common.openapi.yaml#/components/schemas/IsoTime" }
        updated_at: { $ref: "common.openapi.yaml#/components/schemas/IsoTime" }

    StoryVersion:
      type: object
      required: [story_version_id, story_id, body_markdown, created_at]
      properties:
        story_version_id: { $ref: "common.openapi.yaml#/components/schemas/Ulid" }
        story_id: { $ref: "common.openapi.yaml#/components/schemas/Ulid" }
        body_markdown: { type: string }
        disclosure_markdown: { type: string }
        created_at: { $ref: "common.openapi.yaml#/components/schemas/IsoTime" }

    StoryWithVersions:
      allOf:
        - $ref: "#/components/schemas/Story"
        - type: object
          required: [versions]
          properties:
            versions:
              type: array
              items: { $ref: "#/components/schemas/StoryVersion" }

    CreateStoryRequest:
      type: object
      required: [title]
      properties:
        title: { type: string }
        initial_body_markdown: { type: string }

    CreateVersionRequest:
      type: object
      required: [body_markdown]
      properties:
        body_markdown: { type: string }
        disclosure_markdown: { type: string }

    PublishStoryRequest:
      type: object
      required: [story_version_id]
      properties:
        story_version_id: { $ref: "common.openapi.yaml#/components/schemas/Ulid" }
        publication_scope:
          type: string
          enum: [local, regional, national, global]
```

* * *

## `contracts/openapi/claim.openapi.yaml` (Claim Service)

```yaml
openapi: 3.0.3
info:
  title: Claim Service
  version: "1.0.0"
servers:
  - url: ${CLAIM_BASE_URI}
paths:
  /v1/health:
    get:
      operationId: claimHealth
      responses: { "200": { description: ok } }

  /v1/extract:
    post:
      operationId: extractClaims
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/ExtractClaimsRequest" }
      responses:
        "202":
          description: accepted
          content:
            application/json:
              schema:
                type: object
                required: [job_id]
                properties:
                  job_id: { $ref: "common.openapi.yaml#/components/schemas/Ulid" }

  /v1/stories/{story_id}/claims:
    get:
      operationId: listClaimsForStory
      parameters:
        - in: path
          name: story_id
          required: true
          schema: { $ref: "common.openapi.yaml#/components/schemas/Ulid" }
      responses:
        "200":
          description: claims
          content:
            application/json:
              schema:
                type: object
                required: [items]
                properties:
                  items:
                    type: array
                    items: { $ref: "#/components/schemas/Claim" }

components:
  schemas:
    ExtractClaimsRequest:
      type: object
      required: [platform_id, story_id, story_version_id, body_markdown, model_policy]
      properties:
        platform_id: { type: string }
        story_id: { $ref: "common.openapi.yaml#/components/schemas/Ulid" }
        story_version_id: { $ref: "common.openapi.yaml#/components/schemas/Ulid" }
        body_markdown: { type: string }
        model_policy:
          type: object
          required: [model_gateway_uri]
          properties:
            model_gateway_uri: { type: string }
            max_claims: { type: integer, default: 200 }
            allow_interpretation_claims: { type: boolean, default: false }

    Claim:
      type: object
      required: [claim_id, story_id, story_version_id, claim_type, text, support_status, created_at]
      properties:
        claim_id: { $ref: "common.openapi.yaml#/components/schemas/Ulid" }
        story_id: { $ref: "common.openapi.yaml#/components/schemas/Ulid" }
        story_version_id: { $ref: "common.openapi.yaml#/components/schemas/Ulid" }
        claim_type: { type: string, enum: [factual, statistical, attribution, interpretation] }
        text: { type: string }
        entities:
          type: array
          items: { type: string }
        time_window:
          type: object
          properties:
            start: { $ref: "common.openapi.yaml#/components/schemas/IsoTime" }
            end: { $ref: "common.openapi.yaml#/components/schemas/IsoTime" }
        jurisdiction: { type: string }
        support_status: { type: string, enum: [unsupported, partially_supported, supported, contradicted] }
        confidence_model: { type: number, minimum: 0, maximum: 1 }
        confidence_review: { type: number, minimum: 0, maximum: 1 }
        created_at: { $ref: "common.openapi.yaml#/components/schemas/IsoTime" }
```

* * *

## `contracts/openapi/evidence.openapi.yaml` (Evidence Service)

```yaml
openapi: 3.0.3
info:
  title: Evidence Service
  version: "1.0.0"
servers:
  - url: ${EVIDENCE_BASE_URI}
paths:
  /v1/health:
    get:
      operationId: evidenceHealth
      responses: { "200": { description: ok } }

  /v1/evidence/presign:
    post:
      operationId: presignUpload
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/PresignRequest" }
      responses:
        "200":
          description: presigned upload
          content:
            application/json:
              schema: { $ref: "#/components/schemas/PresignResponse" }

  /v1/evidence:
    post:
      operationId: registerEvidence
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/RegisterEvidenceRequest" }
      responses:
        "201":
          description: registered
          content:
            application/json:
              schema: { $ref: "#/components/schemas/EvidenceObject" }

  /v1/evidence/{evidence_id_hash}:
    get:
      operationId: getEvidence
      parameters:
        - in: path
          name: evidence_id_hash
          required: true
          schema: { type: string }
      responses:
        "200":
          description: evidence
          content:
            application/json:
              schema: { $ref: "#/components/schemas/EvidenceObject" }

components:
  schemas:
    PresignRequest:
      type: object
      required: [platform_id, media_type, filename]
      properties:
        platform_id: { type: string }
        media_type: { type: string }
        filename: { type: string }
        content_sha256: { type: string }

    PresignResponse:
      type: object
      required: [upload_url, blob_uri]
      properties:
        upload_url: { type: string }
        blob_uri: { type: string }

    RegisterEvidenceRequest:
      type: object
      required: [platform_id, blob_uri, media_type, provenance]
      properties:
        platform_id: { type: string }
        blob_uri: { type: string }
        media_type: { type: string }
        extracted_text: { type: string }
        provenance:
          type: object
          required: [source, collected_at]
          properties:
            source: { type: string }
            chain: { type: array, items: { type: string } }
            collected_at: { $ref: "common.openapi.yaml#/components/schemas/IsoTime" }
            license: { type: string }

    EvidenceObject:
      type: object
      required: [evidence_id_hash, platform_id, blob_uri, media_type, created_at]
      properties:
        evidence_id_hash: { type: string }
        platform_id: { type: string }
        blob_uri: { type: string }
        media_type: { type: string }
        extracted_text: { type: string }
        provenance: { type: object, additionalProperties: true }
        created_at: { $ref: "common.openapi.yaml#/components/schemas/IsoTime" }
```

* * *

## `contracts/openapi/verify.openapi.yaml` (Verification Service)

```yaml
openapi: 3.0.3
info:
  title: Verification Service
  version: "1.0.0"
servers:
  - url: ${VERIFY_BASE_URI}
paths:
  /v1/health:
    get:
      operationId: verifyHealth
      responses: { "200": { description: ok } }

  /v1/tasks:
    get:
      operationId: listVerificationTasks
      parameters:
        - in: query
          name: status
          schema: { type: string, enum: [open, in_progress, resolved] }
      responses:
        "200":
          description: tasks
          content:
            application/json:
              schema:
                type: object
                required: [items]
                properties:
                  items:
                    type: array
                    items: { $ref: "#/components/schemas/VerificationTask" }

  /v1/tasks/{task_id}/review:
    post:
      operationId: submitReview
      parameters:
        - in: path
          name: task_id
          required: true
          schema: { $ref: "common.openapi.yaml#/components/schemas/Ulid" }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/SubmitReviewRequest" }
      responses:
        "201":
          description: recorded
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Review" }

components:
  schemas:
    VerificationTask:
      type: object
      required: [task_id, story_id, claim_id, task_type, status, created_at]
      properties:
        task_id: { $ref: "common.openapi.yaml#/components/schemas/Ulid" }
        story_id: { $ref: "common.openapi.yaml#/components/schemas/Ulid" }
        claim_id: { $ref: "common.openapi.yaml#/components/schemas/Ulid" }
        task_type: { type: string, enum: [evidence_gap, corroboration, contradiction, coi_check] }
        status: { type: string, enum: [open, in_progress, resolved] }
        created_at: { $ref: "common.openapi.yaml#/components/schemas/IsoTime" }

    SubmitReviewRequest:
      type: object
      required: [actor_id, verdict, notes]
      properties:
        actor_id: { $ref: "common.openapi.yaml#/components/schemas/Ulid" }
        verdict: { type: string, enum: [supports, contradicts, context_only, cannot_determine] }
        notes: { type: string }
        evidence_edges:
          type: array
          items:
            type: object
            required: [evidence_id_hash, relation, strength]
            properties:
              evidence_id_hash: { type: string }
              relation: { type: string, enum: [supports, contradicts, context] }
              strength: { type: number, minimum: 0, maximum: 1 }

    Review:
      type: object
      required: [review_id, task_id, actor_id, verdict, created_at]
      properties:
        review_id: { $ref: "common.openapi.yaml#/components/schemas/Ulid" }
        task_id: { $ref: "common.openapi.yaml#/components/schemas/Ulid" }
        actor_id: { $ref: "common.openapi.yaml#/components/schemas/Ulid" }
        verdict: { type: string }
        created_at: { $ref: "common.openapi.yaml#/components/schemas/IsoTime" }
```

* * *

## `contracts/openapi/gateway.openapi.yaml` (Public API “BFF” contract)

This is what the UI uses, even if internally you later split services differently.

```yaml
openapi: 3.0.3
info:
  title: Gateway Public API
  version: "1.0.0"
servers:
  - url: ${PUBLIC_API_URI}
paths:
  /v1/health:
    get:
      operationId: gatewayHealth
      responses: { "200": { description: ok } }

  /v1/feed:
    get:
      operationId: getFeed
      parameters:
        - in: query
          name: scope
          schema: { type: string, enum: [local, regional, national, global], default: local }
      responses:
        "200":
          description: feed
          content:
            application/json:
              schema:
                type: object
                required: [items]
                properties:
                  items:
                    type: array
                    items:
                      type: object
                      required: [story_id, title, state, updated_at]
                      properties:
                        story_id: { $ref: "common.openapi.yaml#/components/schemas/Ulid" }
                        title: { type: string }
                        state: { type: string }
                        updated_at: { $ref: "common.openapi.yaml#/components/schemas/IsoTime" }

  /v1/story/{story_id}:
    get:
      operationId: getStoryBundle
      parameters:
        - in: path
          name: story_id
          required: true
          schema: { $ref: "common.openapi.yaml#/components/schemas/Ulid" }
      responses:
        "200":
          description: story bundle for reader view
          content:
            application/json:
              schema:
                type: object
                required: [story, claims, evidence_edges, corrections]
                properties:
                  story: { $ref: "story.openapi.yaml#/components/schemas/StoryWithVersions" }
                  claims:
                    type: array
                    items: { $ref: "claim.openapi.yaml#/components/schemas/Claim" }
                  evidence_edges:
                    type: array
                    items:
                      type: object
                      required: [claim_id, evidence_id_hash, relation, strength]
                      properties:
                        claim_id: { $ref: "common.openapi.yaml#/components/schemas/Ulid" }
                        evidence_id_hash: { type: string }
                        relation: { type: string, enum: [supports, contradicts, context] }
                        strength: { type: number, minimum: 0, maximum: 1 }
                  corrections:
                    type: array
                    items:
                      type: object
                      required: [correction_id, claim_id, reason, created_at]
                      properties:
                        correction_id: { $ref: "common.openapi.yaml#/components/schemas/Ulid" }
                        claim_id: { $ref: "common.openapi.yaml#/components/schemas/Ulid" }
                        reason: { type: string }
                        created_at: { $ref: "common.openapi.yaml#/components/schemas/IsoTime" }
```

* * *

## Database migrations

### `db/migrations/001_init.sql`

```sql
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS actors (
  actor_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coi_disclosures (
  disclosure_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES actors(actor_id),
  statement TEXT NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stories (
  story_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  title TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS story_versions (
  story_version_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id),
  body_markdown TEXT NOT NULL,
  disclosure_markdown TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evidence_objects (
  evidence_id_hash TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  blob_uri TEXT NOT NULL,
  media_type TEXT NOT NULL,
  extracted_text TEXT,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS claims (
  claim_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id),
  story_version_id TEXT NOT NULL REFERENCES story_versions(story_version_id),
  claim_type TEXT NOT NULL,
  text TEXT NOT NULL,
  entities JSONB NOT NULL DEFAULT '[]'::jsonb,
  time_window JSONB NOT NULL DEFAULT '{}'::jsonb,
  jurisdiction TEXT,
  support_status TEXT NOT NULL DEFAULT 'unsupported',
  confidence_model DOUBLE PRECISION,
  confidence_review DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS claim_evidence_edges (
  edge_id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES claims(claim_id),
  evidence_id_hash TEXT NOT NULL REFERENCES evidence_objects(evidence_id_hash),
  relation TEXT NOT NULL,
  strength DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  reviewer_actor_id TEXT REFERENCES actors(actor_id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS verification_tasks (
  task_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  story_id TEXT NOT NULL REFERENCES stories(story_id),
  claim_id TEXT NOT NULL REFERENCES claims(claim_id),
  task_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reviews (
  review_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES verification_tasks(task_id),
  actor_id TEXT NOT NULL REFERENCES actors(actor_id),
  verdict TEXT NOT NULL,
  notes TEXT,
  evidence_edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS corrections (
  correction_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  claim_id TEXT NOT NULL REFERENCES claims(claim_id),
  reason TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
```

### `db/migrations/002_outbox.sql` (event outbox for reliable publication)

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS event_outbox (
  event_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_version TEXT NOT NULL DEFAULT 'v1',
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

COMMIT;
```

### `db/migrations/003_indexes.sql`

```sql
BEGIN;

CREATE INDEX IF NOT EXISTS idx_stories_platform_updated ON stories(platform_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_versions_story_created ON story_versions(story_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claims_story ON claims(story_id);
CREATE INDEX IF NOT EXISTS idx_edges_claim ON claim_evidence_edges(claim_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON verification_tasks(status);

COMMIT;
```

* * *

## Event schemas (JSON Schema)

### `contracts/events/envelope.v1.schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:newsledger:event-envelope:v1",
  "type": "object",
  "required": ["event_id", "platform_id", "type", "time", "specversion", "data"],
  "properties": {
    "event_id": { "type": "string", "minLength": 8 },
    "platform_id": { "type": "string" },
    "type": { "type": "string" },
    "time": { "type": "string", "format": "date-time" },
    "specversion": { "type": "string", "const": "1.0" },
    "trace_id": { "type": "string" },
    "actor_id": { "type": "string" },
    "data": { "type": "object" }
  },
  "additionalProperties": false
}
```

### `contracts/events/story.published.v1.schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:newsledger:story.published:v1",
  "allOf": [
    { "$ref": "envelope.v1.schema.json" },
    {
      "properties": {
        "type": { "const": "story.published.v1" },
        "data": {
          "type": "object",
          "required": ["story_id", "story_version_id", "publication_scope"],
          "properties": {
            "story_id": { "type": "string" },
            "story_version_id": { "type": "string" },
            "publication_scope": { "type": "string" }
          },
          "additionalProperties": false
        }
      }
    }
  ]
}
```

You’d mirror this pattern for the other event types named in the repo layout, keeping the envelope stable and only evolving `data`.

* * *

## Minimal UI flow (Next.js pages + API contract)

This is the smallest coherent flow that exercises the whole platform spine.

### Reader flow

`GET $PUBLIC_API_URI/v1/feed?scope=local`  
Renders list of stories with state and updated time.

`GET $PUBLIC_API_URI/v1/story/{story_id}`  
Renders the story plus “verification spine” in three panes: narrative, claims list, evidence edges + corrections.

### Verifier flow

`GET $VERIFY_BASE_URI/v1/tasks?status=open`  
Renders task queue.

`POST $VERIFY_BASE_URI/v1/tasks/{task_id}/review`  
Submits a verdict and optional evidence edges, which can update claim support status asynchronously via internal events.

### UI code skeleton (env-only configuration)

`apps/public-web/src/lib/env.ts`

```ts
export const PLATFORM_ID = process.env.NEXT_PUBLIC_PLATFORM_ID as string;
export const PUBLIC_API_URI = process.env.NEXT_PUBLIC_PUBLIC_API_URI as string;

if (!PLATFORM_ID || !PUBLIC_API_URI) {
  throw new Error("Missing NEXT_PUBLIC_PLATFORM_ID or NEXT_PUBLIC_PUBLIC_API_URI");
}
```

`apps/public-web/src/lib/api.ts`

```ts
import { PUBLIC_API_URI } from "./env";

export async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${PUBLIC_API_URI}${path}`, { method: "GET" });
  if (!r.ok) throw new Error(`GET ${path} failed: ${r.status}`);
  return (await r.json()) as T;
}
```

`apps/public-web/src/pages/index.tsx` pulls `GET /v1/feed` and links to `/story/[story_id]`.  
`apps/public-web/src/pages/story/[story_id].tsx` pulls `GET /v1/story/{story_id}` and renders narrative plus claim/evidence panels.

* * *

## `Makefile` + migration runner

```makefile
export PLATFORM_ID ?= $(PLATFORM_ID)
export POSTGRES_URI ?= $(POSTGRES_URI)

up:
	docker compose -f infra/docker-compose.yml up -d

down:
	docker compose -f infra/docker-compose.yml down -v

migrate:
	POSTGRES_URI="$(POSTGRES_URI)" bash tools/migrate.sh

reset: down up migrate
```

`tools/migrate.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

: "${POSTGRES_URI:?POSTGRES_URI not set}"

for f in db/migrations/*.sql; do
  echo "Applying $f"
  psql "${POSTGRES_URI}" -v ON_ERROR_STOP=1 -f "$f"
done
```

* * *

## What you can run immediately

```bash
export PLATFORM_ID="plf_local_01"
export POSTGRES_URI="postgres://news:news@localhost:5432/news_ledger?sslmode=disable"
export PUBLIC_API_URI="http://localhost:8080"

make up
make migrate
```

At that point, the API surfaces exist as Prism mocks (contract-true), the DB exists with migrations applied, and the UI can be wired to `$PUBLIC_API_URI` and start rendering mock responses while you implement real services behind the same OpenAPI.

If you want the next step, I can provide a minimal “real” `$GATEWAY_SERVICE` implementation that simply composes Story+Claim+Evidence+Verify into `GET /v1/story/{story_id}` and reads/writes the tables above, still parameterized only by `$PLATFORM_ID` and `$POSTGRES_URI`.

## Q: 
provide a minimal “real” $GATEWAY_SERVICE implementation that simply composes Story+Claim+Evidence+Verify into GET /v1/story/{story_id} and reads/writes the tables above, still parameterized only by $PLATFORM_ID and $POSTGRES_URI.

## A: 
## `$GATEWAY_SERVICE` (minimal real implementation)

Language/runtime choice here is TypeScript + Node, using `express` and `pg`. It exposes:

`GET /v1/health`  
`GET /v1/story/:story_id`

It composes `stories + story_versions + claims + claim_evidence_edges + corrections` into the **Gateway contract** shape, reading only from `$POSTGRES_URI`, scoped by `$PLATFORM_ID`.

### Repo placement

```plain text
$REPO_ROOT/
  services/
    gateway/
      package.json
      tsconfig.json
      src/
        env.ts
        db.ts
        server.ts
```

* * *

## `services/gateway/package.json`

```json
{
  "name": "gateway-service",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "node --watch --loader ts-node/esm src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "express": "^4.19.2",
    "pg": "^8.12.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^22.10.2",
    "ts-node": "^10.9.2",
    "typescript": "^5.6.3"
  }
}
```

* * *

## `services/gateway/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

* * *

## `services/gateway/src/env.ts`

Only `$PLATFORM_ID` and `$POSTGRES_URI` are required. Port is hard-defaulted to `8080` to honor your constraint.

```ts
export type Env = {
  PLATFORM_ID: string;
  POSTGRES_URI: string;
};

export function loadEnv(): Env {
  const PLATFORM_ID = process.env.PLATFORM_ID ?? "";
  const POSTGRES_URI = process.env.POSTGRES_URI ?? "";

  if (!PLATFORM_ID) throw new Error("Missing $PLATFORM_ID");
  if (!POSTGRES_URI) throw new Error("Missing $POSTGRES_URI");

  return { PLATFORM_ID, POSTGRES_URI };
}

export const DEFAULT_PORT = 8080;
```

* * *

## `services/gateway/src/db.ts`

```ts
import pg from "pg";
const { Pool } = pg;

export function makePool(postgresUri: string) {
  return new Pool({ connectionString: postgresUri });
}
```

* * *

## `services/gateway/src/server.ts`

This is the entire composition endpoint.

```ts
import express from "express";
import { loadEnv, DEFAULT_PORT } from "./env.js";
import { makePool } from "./db.js";

type Story = {
  story_id: string;
  platform_id: string;
  title: string;
  state: "draft" | "review" | "published";
  created_at: string;
  updated_at?: string;
};

type StoryVersion = {
  story_version_id: string;
  story_id: string;
  body_markdown: string;
  disclosure_markdown?: string | null;
  created_at: string;
};

type Claim = {
  claim_id: string;
  story_id: string;
  story_version_id: string;
  claim_type: "factual" | "statistical" | "attribution" | "interpretation";
  text: string;
  entities?: string[];
  time_window?: Record<string, unknown>;
  jurisdiction?: string | null;
  support_status: "unsupported" | "partially_supported" | "supported" | "contradicted";
  confidence_model?: number | null;
  confidence_review?: number | null;
  created_at: string;
};

type EvidenceEdge = {
  claim_id: string;
  evidence_id_hash: string;
  relation: "supports" | "contradicts" | "context";
  strength: number;
};

type Correction = {
  correction_id: string;
  claim_id: string;
  reason: string;
  created_at: string;
};

const env = loadEnv();
const pool = makePool(env.POSTGRES_URI);

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/v1/health", (_req, res) => {
  res.status(200).json({ ok: true, platform_id: env.PLATFORM_ID });
});

app.get("/v1/story/:story_id", async (req, res) => {
  const storyId = req.params.story_id;

  try {
    const storyQ = await pool.query(
      `
      SELECT story_id, platform_id, title, state, created_at, updated_at
      FROM stories
      WHERE story_id = $1 AND platform_id = $2
      LIMIT 1
      `,
      [storyId, env.PLATFORM_ID]
    );

    if (storyQ.rowCount === 0) {
      return res.status(404).json({ code: "not_found", message: "story not found" });
    }

    const story: Story = storyQ.rows[0];

    const versionsQ = await pool.query(
      `
      SELECT story_version_id, story_id, body_markdown, disclosure_markdown, created_at
      FROM story_versions
      WHERE story_id = $1
      ORDER BY created_at DESC
      `,
      [storyId]
    );

    const versions: StoryVersion[] = versionsQ.rows;

    const claimsQ = await pool.query(
      `
      SELECT claim_id, story_id, story_version_id, claim_type, text, entities, time_window,
             jurisdiction, support_status, confidence_model, confidence_review, created_at
      FROM claims
      WHERE story_id = $1
      ORDER BY created_at ASC
      `,
      [storyId]
    );

    const claims: Claim[] = claimsQ.rows.map((r: any) => ({
      ...r,
      entities: Array.isArray(r.entities) ? r.entities : (r.entities ?? []),
      time_window: r.time_window ?? {}
    }));

    const edgesQ = await pool.query(
      `
      SELECT claim_id, evidence_id_hash,
             CASE
               WHEN relation = 'context_only' THEN 'context'
               WHEN relation = 'context' THEN 'context'
               ELSE relation
             END AS relation,
             strength
      FROM claim_evidence_edges
      WHERE claim_id IN (
        SELECT claim_id FROM claims WHERE story_id = $1
      )
      ORDER BY created_at ASC
      `,
      [storyId]
    );

    const evidence_edges: EvidenceEdge[] = edgesQ.rows.map((r: any) => ({
      claim_id: r.claim_id,
      evidence_id_hash: r.evidence_id_hash,
      relation: r.relation,
      strength: Number(r.strength ?? 0.5)
    }));

    const correctionsQ = await pool.query(
      `
      SELECT correction_id, claim_id, reason, created_at
      FROM corrections
      WHERE platform_id = $1
        AND claim_id IN (SELECT claim_id FROM claims WHERE story_id = $2)
      ORDER BY created_at ASC
      `,
      [env.PLATFORM_ID, storyId]
    );

    const corrections: Correction[] = correctionsQ.rows;

    const storyWithVersions = { ...story, versions };

    return res.status(200).json({
      story: storyWithVersions,
      claims,
      evidence_edges,
      corrections
    });
  } catch (err: any) {
    return res.status(500).json({
      code: "internal_error",
      message: "unexpected server error",
      details: { error: String(err?.message ?? err) }
    });
  }
});

const server = app.listen(DEFAULT_PORT, () => {
  console.log(
    JSON.stringify(
      {
        service: "gateway",
        port: DEFAULT_PORT,
        platform_id: env.PLATFORM_ID
      },
      null,
      2
    )
  );
});

process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
```

* * *

## Running it (assuming your DB migrations already ran)

```bash
export PLATFORM_ID="plf_local_01"
export POSTGRES_URI="postgres://news:news@localhost:5432/news_ledger?sslmode=disable"

cd services/gateway
npm i
npm run dev
```

Test:

```bash
curl -s "http://localhost:8080/v1/health" | jq
curl -s "http://localhost:8080/v1/story/${STORY_ID}" | jq
```

* * *

## Notes on correctness vs your schema

`entities` and `time_window` are stored as `JSONB` in your migrations; the gateway normalizes them into JSON values directly (arrays/objects).  
`relation` in `claim_evidence_edges` supports your earlier contract values; if you later standardize to `supports|contradicts|context`, keep the DB aligned and you can delete the `CASE` shim.

If you want the gateway to also expose `GET /v1/feed` from the `stories` table (to unblock the UI end-to-end), say so and I’ll add it without introducing any new env vars.

## Q: 
expose GET /v1/feed from the stories table (to unblock the UI end-to-end)

## A: 
```ts
// services/gateway/src/server.ts
// Add this route below /v1/health and above /v1/story/:story_id

app.get("/v1/feed", async (req, res) => {
  const scope = String(req.query.scope ?? "local"); // accepted for contract symmetry; not used yet
  const limitRaw = Number(req.query.limit ?? 50);

  const limit =
    Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200) : 50;

  const state = req.query.state ? String(req.query.state) : null;

  const allowedStates = new Set(["draft", "review", "published"]);
  const stateFilter = state && allowedStates.has(state) ? state : null;

  try {
    const q = await pool.query(
      `
      SELECT story_id, title, state, updated_at
      FROM stories
      WHERE platform_id = $1
        AND ($2::text IS NULL OR state = $2)
      ORDER BY updated_at DESC
      LIMIT $3
      `,
      [env.PLATFORM_ID, stateFilter, limit]
    );

    return res.status(200).json({
      scope,
      items: q.rows.map((r: any) => ({
        story_id: r.story_id,
        title: r.title,
        state: r.state,
        updated_at: r.updated_at
      }))
    });
  } catch (err: any) {
    return res.status(500).json({
      code: "internal_error",
      message: "unexpected server error",
      details: { error: String(err?.message ?? err) }
    });
  }
});
```

## Q: 
design complete, full-roadmap ['there-&-back-again'];

## A: 
## `$ROADMAP_ID=there-and-back-again` (full end-to-end program)

This roadmap is structured as a **closed loop**: prototype → credibility → scale → federation → resilience → institutionalization → public handoff → archival permanence. “Back again” means the system ends in a state where it can **outlive any single team**, with transparent governance, reproducible deployment, and verifiable archives.

All phase gates and operations are parameterized by env vars so you can run this as a policy-controlled machine.

* * *

## `$NORTH_STAR`

`$NORTH_STAR_METRIC = "verified-information-throughput"`  
Operational definition: **verified claim throughput per unit cost**, with corrections as a first-class improvement signal.

`$QUALITY_GUARDS = { $MIN_PRIMARY_EVIDENCE_RATIO, $MIN_REVIEWER_QUORUM, $HIGH_IMPACT_CORROBORATION_REQUIRED, $MAX_UNSUPPORTED_CLAIM_SHARE, $CORRECTION_SLA_HOURS }`

* * *

## `$PHASE_0=foundations` (contracts, ledger discipline, local run)

### Outcomes

A running system that produces a **Story Bundle** (story + versions + claims + evidence edges + corrections) and exposes it via `$PUBLIC_API_URI`.

### Deliverables

`$REPO_ROOT/contracts` frozen at `$CONTRACTS_VERSION=v1` and used as the single source of truth.  
`$DB_SCHEMA_VERSION=001..003` applied via `$POSTGRES_URI`.  
`$GATEWAY_SERVICE` real, reading from Postgres, serving `/v1/feed` and `/v1/story/{story_id}`.  
`$PUBLIC_APP` minimal pages: feed + story view + verifier task list view (can be read-only initially).  
`$EVIDENCE_STORE` stubbed as metadata-only registration until blob storage is wired.

### “Done” gate

`$DONE_PHASE_0 = (OpenAPI mocks pass, real gateway passes integration tests, migrations idempotent, seed data renders UI)`

### Policy env surface

`$PLATFORM_ID`, `$POSTGRES_URI`, `$PUBLIC_API_URI`, `$PUBLIC_APP_URI`.

* * *

## `$PHASE_1=MVP-local-civic-beat` (evidence-first newsroom loop)

### Outcomes

A complete loop for civic reporting: ingest → evidence register → draft → claim extraction → verification tasks → publish → corrections.

### Deliverables

`$EVIDENCE_SERVICE` real with content hashing and `$EVIDENCE_BLOB_STORE_URI` support.  
`$CLAIM_SERVICE` real extraction job backed by `$MODEL_GATEWAY_URI` producing claims into `claims`.  
`$VERIFY_SERVICE` real task creation and review persistence into `verification_tasks` and `reviews`.  
`$PUBLISH_GATES` enforced: story cannot reach `published` unless guard thresholds meet policy.

### Hard constraints (codified)

`$PUBLISH_BLOCK_IF_UNSUPPORTED_CLAIMS=true` for civic facts.  
`$HIGH_IMPACT_CORROBORATION_REQUIRED=true` for “budget numbers”, “accusations”, “legal violations”, “public safety”.

### “Done” gate

`$DONE_PHASE_1 = (a single story can be produced end-to-end with at least one primary evidence object per critical claim class, plus one correction event replayable from ledger)`

* * *

## `$PHASE_2=trust-engine` (verification spine becomes the product)

### Outcomes

The platform becomes valuable even to skeptics because it makes disagreement inspectable.

### Deliverables

Evidence graph UX in `$PUBLIC_APP_URI`: claim list with support state, evidence edge viewer, correction timeline diff.  
Contradiction detection at the DB layer (minimum viable): conflicting claims on same entity+time-window raise a verification task.  
`$COI_REGISTRY_URI` integrated and displayed per story version.

### “Done” gate

`$DONE_PHASE_2 = (for any published story, a reader can traverse narrative → claim → evidence → reviewer notes → correction events without leaving the platform)`

* * *

## `$PHASE_3=operations-and-safety` (reliability, abuse resistance, auditability)

### Outcomes

A production-grade service posture without ads, without engagement loops, and with defensible provenance.

### Deliverables

AuthN/AuthZ with strict role separation: `$ROLE_EDITOR`, `$ROLE_VERIFIER`, `$ROLE_PUBLISHER`, `$ROLE_ADMIN`.  
Rate limits and request signing for evidence uploads.  
Outbox-driven event emission using `event_outbox` to avoid partial writes.  
Tamper-evidence guarantees: evidence object IDs are content-hashes; story versions immutable once published.  
Abuse controls: brigading resistance for verification tasks via reviewer reputation and throttles, without “who’s right” moralizing.

### “Done” gate

`$DONE_PHASE_3 = (deploy is repeatable from empty infra, audit logs are queryable, and the system degrades gracefully under load and spam)`

* * *

## `$PHASE_4=economics-without-clicks` (business model implementation)

### Outcomes

Funding is decoupled from attention. Incentives align to verification quality.

### Deliverables

Membership ledger (separate from content ledger): subscriptions, sliding scale, institutional seats.  
Bounties with escrow release rules tied to verification thresholds: `$BOUNTY_RELEASE_POLICY`.  
Creator compensation engine based on verification-weighted output: `$QUALITY_UNIT_FORMULA`.

### “Done” gate

`$DONE_PHASE_4 = (a story can be funded as a bounty, completed, verified, and trigger a deterministic payout calculation independent of views)`

* * *

## `$PHASE_5=federation` (multiple nodes, shared protocols)

### Outcomes

No single organization controls the record. Nodes can interoperate.

### Deliverables

Federated identity and cross-node story bundles: `$FEDERATION_PROTOCOL_VERSION=v1`.  
Signed bundle export/import: a node can mirror another node’s story + ledger events while preserving provenance.  
Namespace policy: `$PLATFORM_ID` becomes a first-class multi-tenant boundary.

### “Done” gate

`$DONE_PHASE_5 = (two independent deployments can exchange published bundles and maintain verifiable consistency of claims and evidence hashes)`

* * *

## `$PHASE_6=public-institution-interface` (libraries, cities, schools)

### Outcomes

Adoption shifts from “news app” to “public record compiler with a readable interface”.

### Deliverables

Library mode: public terminals, offline bundle caching, printable reports.  
Curriculum packs: structured claim/evidence sets for instruction.  
Procurement-ready packaging: security docs, SLA documents, data retention, accessibility compliance.

### “Done” gate

`$DONE_PHASE_6 = (an institution can run the platform under its own governance while still interoperating with the federation)`

* * *

## `$PHASE_7=scale-and-specialization` (investigations, datasets, media)

### Outcomes

The platform supports investigative work and complex evidence without turning into an attention machine.

### Deliverables

Dataset evidence type: structured datasets, query snapshots, reproducible transforms, with hash-based outputs.  
Long-form investigations: multi-story arcs with shared evidence graphs.  
Media provenance: transcription pipelines, clip referencing, and tamper-evident hashes for raw audio/video.

### “Done” gate

`$DONE_PHASE_7 = (an investigation can be published with reproducible dataset slices and media clips linked to claims, with independent corroboration)`

* * *

## `$PHASE_8=governance-hardening` (cooperative/endowment readiness)

### Outcomes

The system is institutionally survivable.

### Deliverables

Legal/structural separation: content operations vs platform stewardship.  
Transparent governance artifacts: bylaws, election/appointment mechanics, COI enforcement, dispute resolution.  
Policy-as-code: all publish gates and thresholds are env-controlled and versioned as `$POLICY_PACK_VERSION`.

### “Done” gate

`$DONE_PHASE_8 = (platform stewardship can change hands without breaking trust, data integrity, or federation compatibility)`

* * *

## `$PHASE_9=back-again` (archival permanence, exit strategy, “public inheritance”)

### Outcomes

Even if the company dies, the record lives.

### Deliverables

Immutable archival exports: periodic signed bundle dumps to multiple storage backends.  
“Cold storage readers” that can render story bundles without any server dependency.  
Sunset plan: keys escrow, domain handoff, final ledger checkpoint, published verification of completeness.

### “Done” gate

`$DONE_PHASE_9 = (a third party can reconstruct the full public archive from exported bundles and verify integrity via hashes and signatures)`

* * *

## Program sequencing as an executable plan

### Workstreams (parallelizable)

`$WORKSTREAMS = { core-api, evidence-provenance, verification-workflow, ui-reader, ui-verifier, ops-security, economics, federation, governance, archival }`

### Critical path dependencies (high-level)

Phase 0 must finish before Phase 1 because the system needs stable contracts and migrations.  
Phase 1 must finish before Phase 2 because trust UX needs real claims/evidence edges.  
Phase 3 must be underway before Phase 4 because money requires operational controls.  
Phase 5 should start once Phase 2 stabilizes because federation amplifies mistakes.  
Phase 9 planning starts early, but implementation completes late.

* * *

## Acceptance criteria and KPIs (quality over attention)

### Operational

`$SLO_P99_MS`, `$SLO_UPTIME`, `$CORRECTION_SLA_HOURS`, `$EVIDENCE_INGEST_LATENCY_S`.

### Quality

`$PRIMARY_EVIDENCE_RATIO`, `$CORROBORATION_RATE_HIGH_IMPACT`, `$UNSUPPORTED_CLAIM_SHARE`, `$POST_PUBLISH_CORRECTION_RATE`, `$CONTRADICTION_RESOLUTION_TIME`.

### Governance integrity

`$COI_DISCLOSURE_COVERAGE`, `$RECUSAL_COMPLIANCE_RATE`, `$AUDIT_EVENT_COMPLETENESS`.

### Economics

`$COST_PER_VERIFIED_CLAIM`, `$MEMBER_RETENTION`, `$INSTITUTIONAL_ADOPTION_COUNT`, `$BOUNTY_COMPLETION_RATE`.

* * *

## Immediate next concrete step (to move from Phase 0 to Phase 1)

Set these env vars and treat them as the first “policy pack”:

`$MIN_REVIEWER_QUORUM=2`  
`$MIN_PRIMARY_EVIDENCE_RATIO=0.50`  
`$HIGH_IMPACT_CORROBORATION_REQUIRED=true`  
`$MAX_UNSUPPORTED_CLAIM_SHARE=0.10`  
`$CORRECTION_SLA_HOURS=72`

Then implement the minimum “publish gate” transaction in `$STORY_SERVICE` (or temporarily in `$GATEWAY_SERVICE`) that computes these metrics from the DB and flips `stories.state` only when the policy passes.

If you want, I can provide the exact SQL for computing the publish gate metrics (primary-evidence ratio, unsupported claim share, corroboration checks) and the minimal transactional publish endpoint that enforces them using only `$PLATFORM_ID` and `$POSTGRES_URI`.

## Q: 
provide the exact SQL for computing the publish gate metrics (primary-evidence ratio, unsupported claim share, corroboration checks) and the minimal transactional publish endpoint that enforces them using only $PLATFORM_ID and $POSTGRES_URI

## A: 
## SQL: publish-gate metrics (single query)

This query assumes two conventions that make the gate deterministic using only your existing tables:

`$PRIMARY_EVIDENCE_CLASS = evidence_objects.provenance->>'source_class' = 'primary'`  
`$INDEPENDENCE_KEY = COALESCE(evidence_objects.provenance->>'source', evidence_objects.provenance->>'publisher', evidence_objects.provenance->>'url', evidence_objects.blob_uri)`

If `source_class` is absent, the gate treats that evidence as non-primary (conservative).

```sql
-- params:
--   $1 = platform_id
--   $2 = story_id
--   $3 = story_version_id (nullable; if null, uses latest version)

WITH
story_row AS (
  SELECT s.story_id, s.platform_id, s.state
  FROM stories s
  WHERE s.platform_id = $1 AND s.story_id = $2
  LIMIT 1
),
version_row AS (
  SELECT v.story_version_id
  FROM story_versions v
  WHERE v.story_id = $2
  ORDER BY v.created_at DESC
  LIMIT 1
),
chosen_version AS (
  SELECT
    COALESCE($3::text, (SELECT story_version_id FROM version_row)) AS story_version_id
),
claim_base AS (
  SELECT
    c.claim_id,
    c.claim_type,
    c.text,
    c.support_status
  FROM claims c
  JOIN chosen_version cv ON cv.story_version_id = c.story_version_id
  WHERE c.story_id = $2
),
edges_support AS (
  SELECT
    e.claim_id,
    e.evidence_id_hash,
    e.relation,
    e.strength
  FROM claim_evidence_edges e
  WHERE e.claim_id IN (SELECT claim_id FROM claim_base)
    AND e.relation = 'supports'
),
evidence_enriched AS (
  SELECT
    eo.evidence_id_hash,
    eo.blob_uri,
    eo.provenance,
    (eo.provenance->>'source_class') AS source_class,
    COALESCE(eo.provenance->>'source', eo.provenance->>'publisher', eo.provenance->>'url', eo.blob_uri) AS independence_key
  FROM evidence_objects eo
  WHERE eo.evidence_id_hash IN (SELECT evidence_id_hash FROM edges_support)
),
primary_supported_claims AS (
  SELECT DISTINCT es.claim_id
  FROM edges_support es
  JOIN evidence_enriched ev ON ev.evidence_id_hash = es.evidence_id_hash
  WHERE ev.source_class = 'primary'
),
totals AS (
  SELECT
    (SELECT COUNT(*) FROM claim_base) AS total_claims,
    (SELECT COUNT(*) FROM claim_base WHERE support_status = 'unsupported') AS unsupported_claims,
    (SELECT COUNT(*) FROM claim_base WHERE support_status = 'contradicted') AS contradicted_claims,
    (SELECT COUNT(*) FROM primary_supported_claims) AS primary_supported_claims
),
high_impact_claims AS (
  SELECT cb.claim_id
  FROM claim_base cb
  WHERE
    cb.claim_type IN ('statistical')
    OR (
      cb.claim_type = 'factual'
      AND (
        cb.text ~* '(accus|illegal|fraud|crime|charged|indict|lawsuit|killed|injur|shoot|arrest|explos|terror|abuse)'
        OR cb.text ~* '(\$|usd|million|billion|percent|%)'
      )
    )
),
high_impact_support_counts AS (
  SELECT
    hic.claim_id,
    COUNT(DISTINCT ev.independence_key) AS independent_support_sources
  FROM high_impact_claims hic
  LEFT JOIN edges_support es ON es.claim_id = hic.claim_id
  LEFT JOIN evidence_enriched ev ON ev.evidence_id_hash = es.evidence_id_hash
  GROUP BY hic.claim_id
),
high_impact_rollup AS (
  SELECT
    (SELECT COUNT(*) FROM high_impact_claims) AS high_impact_claims,
    (SELECT COUNT(*) FROM high_impact_support_counts WHERE independent_support_sources >= 2) AS high_impact_corroborated
),
metrics AS (
  SELECT
    t.total_claims,
    t.unsupported_claims,
    t.contradicted_claims,
    t.primary_supported_claims,
    CASE WHEN t.total_claims = 0 THEN 0 ELSE (t.primary_supported_claims::double precision / t.total_claims::double precision) END AS primary_evidence_ratio,
    CASE WHEN t.total_claims = 0 THEN 1 ELSE (t.unsupported_claims::double precision / t.total_claims::double precision) END AS unsupported_claim_share,
    hr.high_impact_claims,
    hr.high_impact_corroborated,
    CASE WHEN hr.high_impact_claims = 0 THEN true ELSE (hr.high_impact_corroborated = hr.high_impact_claims) END AS corroboration_ok
  FROM totals t
  CROSS JOIN high_impact_rollup hr
)
SELECT
  sr.story_id,
  sr.platform_id,
  sr.state,
  (SELECT story_version_id FROM chosen_version) AS story_version_id,
  m.*,
  (
    m.total_claims > 0
    AND m.contradicted_claims = 0
    AND m.primary_evidence_ratio >= 0.50
    AND m.unsupported_claim_share <= 0.10
    AND m.corroboration_ok = true
  ) AS publish_gate_pass
FROM story_row sr
CROSS JOIN metrics m;
```

This returns one row with all computed metrics plus `publish_gate_pass`.

* * *

## Minimal transactional publish endpoint (only `$PLATFORM_ID`, `$POSTGRES_URI`)

This drops into your existing `services/gateway/src/server.ts` and uses the same `pool`, `env` you already have. It locks the story row, evaluates the gate, and either publishes or returns a 409 with metrics.

Constants are in-code to keep env surface limited to `$PLATFORM_ID` and `$POSTGRES_URI`.

```ts
// services/gateway/src/server.ts
// Add below existing routes. Uses only env.PLATFORM_ID and pool (POSTGRES_URI).

const MIN_PRIMARY_EVIDENCE_RATIO = 0.5;
const MAX_UNSUPPORTED_CLAIM_SHARE = 0.10;
const REQUIRE_HIGH_IMPACT_CORROBORATION = true; // requires >=2 independent sources per high-impact claim

app.post("/v1/story/:story_id/publish", async (req, res) => {
  const storyId = req.params.story_id;
  const storyVersionId: string | null = req.body?.story_version_id ?? null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the story row to make the gate + publish atomic.
    const lockQ = await client.query(
      `
      SELECT story_id, platform_id, state
      FROM stories
      WHERE platform_id = $1 AND story_id = $2
      FOR UPDATE
      `,
      [env.PLATFORM_ID, storyId]
    );

    if (lockQ.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ code: "not_found", message: "story not found" });
    }

    const lockedState = String(lockQ.rows[0].state);
    if (lockedState === "published") {
      await client.query("ROLLBACK");
      return res.status(409).json({ code: "already_published", message: "story already published" });
    }

    const gateQ = await client.query(
      `
      WITH
      version_row AS (
        SELECT v.story_version_id
        FROM story_versions v
        WHERE v.story_id = $2
        ORDER BY v.created_at DESC
        LIMIT 1
      ),
      chosen_version AS (
        SELECT COALESCE($3::text, (SELECT story_version_id FROM version_row)) AS story_version_id
      ),
      claim_base AS (
        SELECT c.claim_id, c.claim_type, c.text, c.support_status
        FROM claims c
        JOIN chosen_version cv ON cv.story_version_id = c.story_version_id
        WHERE c.story_id = $2
      ),
      edges_support AS (
        SELECT e.claim_id, e.evidence_id_hash
        FROM claim_evidence_edges e
        WHERE e.claim_id IN (SELECT claim_id FROM claim_base)
          AND e.relation = 'supports'
      ),
      evidence_enriched AS (
        SELECT
          eo.evidence_id_hash,
          eo.blob_uri,
          eo.provenance,
          (eo.provenance->>'source_class') AS source_class,
          COALESCE(eo.provenance->>'source', eo.provenance->>'publisher', eo.provenance->>'url', eo.blob_uri) AS independence_key
        FROM evidence_objects eo
        WHERE eo.evidence_id_hash IN (SELECT evidence_id_hash FROM edges_support)
      ),
      primary_supported_claims AS (
        SELECT DISTINCT es.claim_id
        FROM edges_support es
        JOIN evidence_enriched ev ON ev.evidence_id_hash = es.evidence_id_hash
        WHERE ev.source_class = 'primary'
      ),
      totals AS (
        SELECT
          (SELECT COUNT(*) FROM claim_base) AS total_claims,
          (SELECT COUNT(*) FROM claim_base WHERE support_status = 'unsupported') AS unsupported_claims,
          (SELECT COUNT(*) FROM claim_base WHERE support_status = 'contradicted') AS contradicted_claims,
          (SELECT COUNT(*) FROM primary_supported_claims) AS primary_supported_claims
      ),
      high_impact_claims AS (
        SELECT cb.claim_id
        FROM claim_base cb
        WHERE
          cb.claim_type IN ('statistical')
          OR (
            cb.claim_type = 'factual'
            AND (
              cb.text ~* '(accus|illegal|fraud|crime|charged|indict|lawsuit|killed|injur|shoot|arrest|explos|terror|abuse)'
              OR cb.text ~* '(\$|usd|million|billion|percent|%)'
            )
          )
      ),
      high_impact_support_counts AS (
        SELECT
          hic.claim_id,
          COUNT(DISTINCT ev.independence_key) AS independent_support_sources
        FROM high_impact_claims hic
        LEFT JOIN edges_support es ON es.claim_id = hic.claim_id
        LEFT JOIN evidence_enriched ev ON ev.evidence_id_hash = es.evidence_id_hash
        GROUP BY hic.claim_id
      ),
      high_impact_rollup AS (
        SELECT
          (SELECT COUNT(*) FROM high_impact_claims) AS high_impact_claims,
          (SELECT COUNT(*) FROM high_impact_support_counts WHERE independent_support_sources >= 2) AS high_impact_corroborated
      )
      SELECT
        (SELECT story_version_id FROM chosen_version) AS story_version_id,
        t.total_claims,
        t.unsupported_claims,
        t.contradicted_claims,
        t.primary_supported_claims,
        CASE WHEN t.total_claims = 0 THEN 0 ELSE (t.primary_supported_claims::double precision / t.total_claims::double precision) END AS primary_evidence_ratio,
        CASE WHEN t.total_claims = 0 THEN 1 ELSE (t.unsupported_claims::double precision / t.total_claims::double precision) END AS unsupported_claim_share,
        hr.high_impact_claims,
        hr.high_impact_corroborated,
        CASE WHEN hr.high_impact_claims = 0 THEN true ELSE (hr.high_impact_corroborated = hr.high_impact_claims) END AS corroboration_ok
      FROM totals t
      CROSS JOIN high_impact_rollup hr
      `,
      [env.PLATFORM_ID, storyId, storyVersionId]
    );

    if (gateQ.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        code: "publish_gate_error",
        message: "cannot compute publish gate metrics (missing version or claims)"
      });
    }

    const m = gateQ.rows[0];

    const primaryEvidenceRatio = Number(m.primary_evidence_ratio ?? 0);
    const unsupportedClaimShare = Number(m.unsupported_claim_share ?? 1);
    const contradictedClaims = Number(m.contradicted_claims ?? 0);
    const totalClaims = Number(m.total_claims ?? 0);

    const corroborationOkDb = Boolean(m.corroboration_ok);
    const corroborationOk = REQUIRE_HIGH_IMPACT_CORROBORATION ? corroborationOkDb : true;

    const pass =
      totalClaims > 0 &&
      contradictedClaims === 0 &&
      primaryEvidenceRatio >= MIN_PRIMARY_EVIDENCE_RATIO &&
      unsupportedClaimShare <= MAX_UNSUPPORTED_CLAIM_SHARE &&
      corroborationOk;

    if (!pass) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        code: "publish_gate_failed",
        message: "publish gate failed",
        thresholds: {
          min_primary_evidence_ratio: MIN_PRIMARY_EVIDENCE_RATIO,
          max_unsupported_claim_share: MAX_UNSUPPORTED_CLAIM_SHARE,
          require_high_impact_corroboration: REQUIRE_HIGH_IMPACT_CORROBORATION
        },
        metrics: {
          story_version_id: m.story_version_id,
          total_claims: totalClaims,
          unsupported_claims: Number(m.unsupported_claims ?? 0),
          contradicted_claims: contradictedClaims,
          primary_supported_claims: Number(m.primary_supported_claims ?? 0),
          primary_evidence_ratio: primaryEvidenceRatio,
          unsupported_claim_share: unsupportedClaimShare,
          high_impact_claims: Number(m.high_impact_claims ?? 0),
          high_impact_corroborated: Number(m.high_impact_corroborated ?? 0),
          corroboration_ok: corroborationOkDb
        }
      });
    }

    await client.query(
      `
      UPDATE stories
      SET state = 'published', updated_at = now()
      WHERE platform_id = $1 AND story_id = $2
      `,
      [env.PLATFORM_ID, storyId]
    );

    // Optional: write an outbox event in the same transaction (safe even if you don't consume it yet).
    await client.query(
      `
      INSERT INTO event_outbox (event_id, platform_id, event_type, event_version, payload)
      VALUES ($1, $2, $3, 'v1', $4::jsonb)
      `,
      [
        ulidLike(), // implement however you already do IDs; can be a placeholder if not yet wired
        env.PLATFORM_ID,
        "story.published.v1",
        JSON.stringify({
          story_id: storyId,
          story_version_id: m.story_version_id,
          publication_scope: "local"
        })
      ]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      story_id: storyId,
      state: "published",
      story_version_id: m.story_version_id,
      metrics: {
        total_claims: totalClaims,
        primary_evidence_ratio: primaryEvidenceRatio,
        unsupported_claim_share: unsupportedClaimShare,
        high_impact_claims: Number(m.high_impact_claims ?? 0),
        high_impact_corroborated: Number(m.high_impact_corroborated ?? 0),
        corroboration_ok: corroborationOkDb
      }
    });
  } catch (err: any) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    return res.status(500).json({
      code: "internal_error",
      message: "unexpected server error",
      details: { error: String(err?.message ?? err) }
    });
  } finally {
    client.release();
  }
});

// Minimal placeholder. Replace with your ULID generator (you already have tools/gen-ulid.ts).
function ulidLike(): string {
  // Not cryptographically strong; only to keep the example runnable without extra deps.
  // Swap with a proper ULID in your codebase.
  return (Date.now().toString(36).toUpperCase().padStart(10, "0") + Math.random().toString(36).slice(2, 18).toUpperCase()).slice(0, 26);
}
```

### Request / response

`POST $PUBLIC_API_URI/v1/story/{story_id}/publish` with optional JSON body:

```json
{ "story_version_id": "01J..." }
```

If omitted, it publishes the latest version for that story.

* * *

## One practical requirement to make “primary evidence ratio” real

You need the evidence ingester to set:

`evidence_objects.provenance = { "source_class": "primary", ... }`

If you want a stricter definition (FOIA, court docs, meeting minutes), standardize it as:

`provenance.source_class in { primary_record, primary_media, primary_dataset }`

Then modify the SQL `WHERE ev.source_class = 'primary'` to `IN (...)` and keep the gate stable.

## Q: 
What else is required to build out full theoretical specifications?

## A: 
## What’s still required for **full theoretical specifications** (beyond the runnable MVP)

You already have: data model (tables), contracts (OpenAPI), a gateway composition, and first publish-gate SQL. A “full theoretical spec” adds the missing layers that make the system _unambiguous_, _auditable_, _federatable_, and _governable_—so independent implementers can build compatible nodes and get the same behavior.

### 1. Formal semantics of “truth artifacts”

A spec must define what the platform _means_ by each artifact and how it behaves over time.

Claim ontology  
Define `$CLAIM_TYPE`, `$CLAIM_SCOPE`, `$CLAIM_TIME_WINDOW`, `$CLAIM_MODALITY` (assertion vs attribution vs estimate), `$CLAIM_REVOCABILITY` (can it be superseded vs must be corrected).

Evidence ontology  
Define `$EVIDENCE_CLASS` (primary record, primary media, dataset, secondary reporting, commentary), `$PROVENANCE_CHAIN` structure, `$LICENSE_MODEL`, `$REDaction_POLICY`.

Edge semantics  
Define `$EDGE_RELATION` meanings precisely (supports / contradicts / context) and how `strength` is computed and combined (e.g., min, max, Bayesian update, quorum-weighted).

Correction semantics  
Define when something is a correction event vs a new claim vs a retraction. Specify invariants like: “published story versions are immutable; corrections append; claims can be superseded but not deleted.”

### 2. Normative algorithms (“MUST” rules) for gates and scoring

Right now, your publish gate is one concrete implementation. A full spec requires a normative description that other nodes can reproduce.

Publish gate specification  
Define `$PUBLISH_GATES_V1` as a deterministic function of ledger state. Include: handling of missing provenance fields, how to treat conflicting evidence, and whether to require at least one claim.

Verification scoring  
Define `$SUPPORT_STATUS_UPDATE_RULES` mapping from reviews + edges → claim status. Example: how many verifier votes to flip from `unsupported` to `supported`, how to treat `cannot_determine`, and how reviewer reputation weights.

Independence function  
Your corroboration uses `independence_key`. The spec must define it and its anti-gaming constraints (canonical domains, publisher normalization, ownership graph overrides).

### 3. Event protocol and state machine spec

OpenAPI covers request/response, but theoretical completeness needs an event model that defines system evolution.

Canonical event types and versions  
Define `$EVENT_TYPES_V1` and per-event invariants (idempotency keys, causality fields, ordering expectations, replay semantics).

Aggregate state machines  
Define state machines for `$STORY`, `$STORY_VERSION`, `$CLAIM`, `$TASK`, `$CORRECTION`. Include allowable transitions and prohibited transitions.

Outbox and delivery guarantees  
Specify at-least-once semantics and required consumer idempotency behavior.

### 4. Threat model and adversary-resistance

A full spec must assume adversaries (political, financial, coordinated online). Without this, “public service” collapses at scale.

Abuse and brigading  
Define `$BRIGADE_DETECTION_RULES`, reviewer throttles, rate limits, Sybil resistance approach, and escalation paths.

Evidence poisoning  
Define rules for detecting tampered media, misleading provenance, dataset manipulation, and adversarial citations.

Model laundering  
Define strict constraints: model outputs are proposals; publishing requires evidence edges and/or reviewer confirmations; disclose model involvement at the claim level.

### 5. Governance specification (institutional survivability)

This is the main difference between “a product” and “public service.”

Separation of powers  
Define roles, permissions, and hard constraints: editorial cannot unilaterally mark claims as supported; verification cannot choose what to cover; admins cannot rewrite published history.

COI and recusal rules  
Define how COI disclosures are structured, when recusal is mandatory, and enforcement mechanisms.

Appeals and disputes  
Define a dispute protocol: how a claim can be challenged, what evidence is admissible, and how resolution affects claim status.

### 6. Federation and interoperability spec (multi-node future)

If you want “not privatized,” you want multiple operators.

Bundle format  
Define `$BUNDLE_FORMAT_V1` for exporting/importing: story versions, claims, evidence hashes, edges, reviews, corrections, plus signatures.

Signature and trust model  
Define node keys, rotation, revocation, and how consuming nodes decide what to trust (web-of-trust vs institutional anchors).

Cross-node conflict handling  
Define what happens when two nodes publish conflicting claims about the same entity/time.

### 7. Privacy, safety, and legal compliance as code

Public service news touches sensitive material.

PII policy  
Define `$PII_CLASSES`, retention windows, redaction rules, and audit trails for redaction decisions.

Defamation-risk handling  
Define “high-risk claim classes,” corroboration rules, right-of-reply workflow, and takedown policy compatible with immutable ledgers (tombstone + sealed evidence).

Jurisdictional compliance  
Define configurable compliance packs (`$POLICY_PACK_US`, `$POLICY_PACK_EU`, etc.) without changing core protocols.

### 8. Reference implementation spec (conformance tests)

A theoretical spec is incomplete unless implementers can prove compatibility.

Conformance suite  
Define test vectors: sample DB states and expected gate results, expected claim status transitions, expected bundle signatures.

Golden fixtures  
Provide canonical stories and evidence graphs that all nodes must process identically.

Compatibility policy  
Define versioning, deprecations, and how nodes negotiate `$PROTOCOL_VERSION`.

### 9. Observability and audit specification

Define what must be logged, measured, and publicly exposed.

Audit endpoints  
Specify public audit queries: “show all corrections for story,” “show evidence provenance chain,” “show claim status history.”

Metrics vocabulary  
Define the canonical names and computation rules for `$PRIMARY_EVIDENCE_RATIO`, `$CORRECTION_RATE`, `$CONTRADICTION_RATE`, etc., so dashboards are comparable across nodes.

### 10. Economic mechanism specification (anti-attention economics)

You outlined a model; a spec must pin down payout and funding math.

Quality units formula  
Define exactly how “verification units” accrue, decay, and are paid—so contributors cannot game it with claim spam.

Bounty escrow rules  
Define release criteria and refund criteria deterministically.

Institutional procurement mode  
Define service tiers without changing editorial incentives (no “sponsor influence” channels).

* * *

## The single missing artifact that ties it all together

A “full theoretical spec” should be published as:

`$SPEC_SERIES = { $CORE_PROTOCOL_SPEC, $GOVERNANCE_SPEC, $FEDERATION_SPEC, $SECURITY_THREAT_MODEL, $ECONOMICS_SPEC, $CONFORMANCE_TESTS }`

with RFC-style numbering and normative language (MUST/SHOULD/MAY), so anyone can implement a compatible node.

* * *

## If you want the shortest path to “complete”

Build one document first:

`$CORE_PROTOCOL_SPEC_V1`  
It defines: claim/evidence/correction semantics, event envelopes, publish gates, and status transition rules. Everything else (federation, economics, governance) can then reference it.

If you want, I can draft `$CORE_PROTOCOL_SPEC_V1` as a tight RFC: terminology, invariants, schemas, normative algorithms, and conformance tests—still parameterized by env-policy packs like `$POLICY_PACK_VERSION` rather than hardcoded values.

## Q: 
draft $CORE_PROTOCOL_SPEC_V1 as a tight RFC: terminology, invariants, schemas, normative algorithms, and conformance tests—still parameterized by env-policy packs like $POLICY_PACK_VERSION rather than hardcoded values.

## A: 
# `$CORE_PROTOCOL_SPEC_V1` — Core Protocol RFC (Draft)

`$RFC_ID = core-protocol-spec-v1`  
`$PROTOCOL_FAMILY = news-ledger`  
`$PROTOCOL_VERSION = v1`  
`$POLICY_PACK_VERSION = $ENV($POLICY_PACK_VERSION)`  
`$PLATFORM_ID = $ENV($PLATFORM_ID)`

This document defines the **minimum interoperable core** for a verifiable news ledger system: terminology, invariants, canonical schemas, normative algorithms, and conformance tests. All operational thresholds are specified via **Policy Packs**, not hardcoded constants.

* * *

## 0. Status, goals, non-goals

### 0.1 Status

This RFC is a normative draft. Implementations MAY deviate internally, but MUST satisfy conformance tests and invariants to claim compliance with `$PROTOCOL_VERSION=v1`.

### 0.2 Goals

A compliant implementation MUST:  
A. Represent stories as immutable versions plus append-only correction events.  
B. Represent claims as atomic, typed statements with time bounds.  
C. Represent evidence as content-addressed objects with provenance.  
D. Represent support relations as edges from claims to evidence.  
E. Provide deterministic policy-gated publication.  
F. Support replay from events to reconstruct public state.

### 0.3 Non-goals

This RFC does not specify: federation, economics, identity/auth, UI, or dispute governance mechanics beyond required data fields.

* * *

## 1. Terminology (normative)

`MUST`, `SHOULD`, `MAY` are as in RFC 2119.

### 1.1 Core identifiers

`$ULID`  
A 26-char ULID string. Used for all mutable-entity identifiers.

`$EVIDENCE_ID_HASH`  
A content hash identifier, `sha256:<hex>`. Used to identify evidence immutably.

`$PLATFORM_ID`  
Deployment namespace boundary. All public objects MUST be scoped to a single platform.

### 1.2 Objects

`$STORY`  
A topic container with publication state and metadata.

`$STORY_VERSION`  
An immutable narrative snapshot. A story MAY have many versions.

`$CLAIM`  
An atomic, independently verifiable statement extracted from a story version.

`$EVIDENCE_OBJECT`  
A content-addressed object (document/media/dataset) plus provenance.

`$EDGE`  
A directed relation `(claim → evidence)` with a relation type and strength.

`$CORRECTION_EVENT`  
An append-only event that supersedes/qualifies prior claims.

`$POLICY_PACK`  
A versioned configuration that supplies thresholds and rule toggles.

* * *

## 2. Invariants (normative)

### 2.1 Immutability and append-only rules

I1. Published story versions MUST be immutable.  
I2. Evidence objects MUST be immutable and identified by `$EVIDENCE_ID_HASH`.  
I3. Corrections MUST be append-only events; they MUST NOT delete prior public history.  
I4. A claim’s text MUST remain stable once published; changes require a new claim ID (supersession).

### 2.2 Determinism

I5. Publication gating for a given `(story_id, story_version_id, policy_pack_version)` MUST be deterministic given the ledger state.  
I6. Conformance tests MUST pass independent of local ordering of evidence ingestion, provided object hashes and ledger contents are identical.

### 2.3 Scope

I7. A story, its versions, claims, edges, and corrections MUST share the same `$PLATFORM_ID`.  
I8. A claim MUST reference exactly one `story_version_id`.

### 2.4 Referencing constraints

I9. Evidence edges MUST reference existing `claim_id` and existing `evidence_id_hash`.  
I10. Corrections MUST reference existing `claim_id` (or a list of claim IDs).

* * *

## 3. Canonical schemas (normative)

Schemas are defined as canonical JSON objects; storage MAY differ but MUST serialize equivalently.

### 3.1 `$POLICY_PACK`

`$POLICY_PACK` MUST be retrievable by `$POLICY_PACK_VERSION` and provide:

```json
{
  "policy_pack_version": "v1.0.0",
  "publish_gates": {
    "min_primary_evidence_ratio": 0.50,
    "max_unsupported_claim_share": 0.10,
    "max_contradicted_claims": 0,
    "require_high_impact_corroboration": true,
    "high_impact_min_independent_sources": 2
  },
  "evidence": {
    "primary_source_classes": ["primary_record", "primary_media", "primary_dataset"],
    "independence_key_fields": ["source", "publisher", "url", "blob_uri"]
  },
  "claim": {
    "high_impact_claim_types": ["statistical"],
    "high_impact_regexes": [
      "(accus|illegal|fraud|crime|charged|indict|lawsuit|killed|injur|shoot|arrest|explos|terror|abuse)",
      "(\\$|usd|million|billion|percent|%)"
    ]
  }
}
```

Implementations MUST treat absent fields conservatively (deny publication if a required comparator cannot be computed without them).

### 3.2 `$STORY`

```json
{
  "story_id": "01J...",
  "platform_id": "plf_...",
  "title": "string",
  "state": "draft|review|published",
  "created_at": "RFC3339",
  "updated_at": "RFC3339"
}
```

### 3.3 `$STORY_VERSION`

```json
{
  "story_version_id": "01J...",
  "story_id": "01J...",
  "body_markdown": "string",
  "disclosure_markdown": "string|null",
  "created_at": "RFC3339"
}
```

### 3.4 `$CLAIM`

```json
{
  "claim_id": "01J...",
  "story_id": "01J...",
  "story_version_id": "01J...",
  "claim_type": "factual|statistical|attribution|interpretation",
  "text": "string",
  "entities": ["string"],
  "time_window": { "start": "RFC3339|null", "end": "RFC3339|null" },
  "jurisdiction": "string|null",
  "support_status": "unsupported|partially_supported|supported|contradicted",
  "confidence_model": 0.0,
  "confidence_review": 0.0,
  "created_at": "RFC3339"
}
```

### 3.5 `$EVIDENCE_OBJECT`

Evidence MUST include `provenance.source_class` when feasible.

```json
{
  "evidence_id_hash": "sha256:...",
  "platform_id": "plf_...",
  "blob_uri": "string",
  "media_type": "string",
  "extracted_text": "string|null",
  "provenance": {
    "source_class": "primary_record|primary_media|primary_dataset|secondary|commentary|unknown",
    "source": "string|null",
    "publisher": "string|null",
    "url": "string|null",
    "collected_at": "RFC3339",
    "license": "string|null",
    "chain": ["string"]
  },
  "created_at": "RFC3339"
}
```

### 3.6 `$EDGE`

```json
{
  "edge_id": "01J...",
  "claim_id": "01J...",
  "evidence_id_hash": "sha256:...",
  "relation": "supports|contradicts|context",
  "strength": 0.0,
  "reviewer_actor_id": "01J...|null",
  "notes": "string|null",
  "created_at": "RFC3339"
}
```

### 3.7 `$CORRECTION_EVENT`

```json
{
  "correction_id": "01J...",
  "platform_id": "plf_...",
  "claim_id": "01J...",
  "reason": "string",
  "details": { "supersedes_claim_id": "01J...|null", "note": "string|null" },
  "created_at": "RFC3339"
}
```

### 3.8 Event envelope (required)

All events MUST use this envelope.

```json
{
  "event_id": "01J...",
  "platform_id": "plf_...",
  "type": "string",
  "time": "RFC3339",
  "specversion": "1.0",
  "trace_id": "string|null",
  "actor_id": "01J...|null",
  "data": {}
}
```

* * *

## 4. Normative algorithms

### 4.1 Evidence independence key

Given an evidence object `E` and policy pack `P`, compute:

`independence_key(E,P) = first_non_empty(E.provenance[field]) for field in P.evidence.independence_key_fields`

If none exist, use `E.blob_uri`. Implementations SHOULD normalize URLs/domains if present; conformance tests use exact string match.

### 4.2 Primary evidence classification

Evidence is primary iff:

`E.provenance.source_class ∈ P.evidence.primary_source_classes`

Absent `source_class` MUST be treated as non-primary.

### 4.3 High-impact claim detection

A claim `C` is high-impact iff:  
A. `C.claim_type ∈ P.claim.high_impact_claim_types` OR  
B. any regex in `P.claim.high_impact_regexes` matches `C.text` case-insensitively.

Regex evaluation MUST use a PCRE-like engine semantics; if unavailable, implementations MUST document equivalent behavior and MUST still pass conformance fixtures.

### 4.4 Publish gate metrics

For a given `(story_id, story_version_id)`:

Let `Claims = { C | C.story_id=story_id AND C.story_version_id=story_version_id }`

Let `Edges(C) = { e | e.claim_id=C.claim_id AND e.relation='supports' }`

Let `PrimarySupportedClaims = { C | ∃e∈Edges(C): Evidence(e).is_primary=true }`

Metrics:

`total_claims = |Claims|`  
`unsupported_claims = |{C∈Claims | C.support_status='unsupported'}|`  
`contradicted_claims = |{C∈Claims | C.support_status='contradicted'}|`  
`primary_supported_claims = |PrimarySupportedClaims|`

`primary_evidence_ratio = primary_supported_claims / total_claims` (if `total_claims=0`, ratio = 0)

`unsupported_claim_share = unsupported_claims / total_claims` (if `total_claims=0`, share = 1)

High-impact corroboration:

For each high-impact claim `H`, compute:

`independent_support_sources(H) = |{ independence_key(E,P) | ∃e∈Edges(H): e.evidence_id_hash=E.hash }|`

`H` is corroborated iff `independent_support_sources(H) >= P.publish_gates.high_impact_min_independent_sources`

`corroboration_ok = true` if no high-impact claims exist, else all high-impact claims corroborated.

### 4.5 Publish gate decision

Given policy pack `P`:

`pass = (total_claims > 0)`  
AND `(contradicted_claims <= P.publish_gates.max_contradicted_claims)`  
AND `(primary_evidence_ratio >= P.publish_gates.min_primary_evidence_ratio)`  
AND `(unsupported_claim_share <= P.publish_gates.max_unsupported_claim_share)`  
AND `(P.publish_gates.require_high_impact_corroboration = false OR corroboration_ok = true)`

If any required field to compute `pass` is missing, implementations MUST set `pass=false`.

### 4.6 Transactional publication

To publish a story version, implementations MUST:  
A. Lock the story row (`FOR UPDATE`) scoped by platform.  
B. Compute metrics for the chosen version within the same transaction.  
C. If gate fails, roll back with metrics.  
D. If gate passes, set story state to `published` and append an event `story.published.v1` in an outbox within the same transaction.

* * *

## 5. Conformance tests (normative)

A conforming implementation MUST provide a test runner that loads fixtures, executes the gate algorithm, and matches expected outputs exactly.

### 5.1 Fixture format

Each fixture consists of:  
A. `$POLICY_PACK` JSON  
B. Ledger snapshot: arrays of `stories`, `story_versions`, `claims`, `evidence_objects`, `claim_evidence_edges`, `corrections`  
C. Gate evaluation request: `{ platform_id, story_id, story_version_id }`  
D. Expected result: metrics + pass boolean.

### 5.2 Required test cases

#### `CT-01` minimal publish passes

Policy:  
`min_primary_evidence_ratio=0.50`, `max_unsupported_claim_share=0.10`, `require_high_impact_corroboration=true`, `high_impact_min_independent_sources=2`

Ledger:  
One story version, `total_claims=2`.  
Claim A supported by one primary evidence.  
Claim B supported by one primary evidence.  
No unsupported, no contradicted.  
No high-impact claims.

Expected:  
`primary_evidence_ratio=1.0`, `unsupported_claim_share=0.0`, `corroboration_ok=true`, `pass=true`.

#### `CT-02` fails unsupported claim share

Same as CT-01 but add a third claim with `support_status='unsupported'`.

Expected:  
`unsupported_claim_share=1/3`, `pass=false`.

#### `CT-03` fails primary evidence ratio

Two claims, only one has primary support; other has no primary support.

Expected:  
`primary_evidence_ratio=0.5` passes iff policy is `>=0.50`.  
Provide two subcases:  
A. threshold 0.50 → pass true if other gates satisfied  
B. threshold 0.60 → pass false

#### `CT-04` high-impact corroboration required

One high-impact statistical claim supported by **two** evidence objects with distinct independence keys.

Expected:  
`high_impact_claims=1`, `high_impact_corroborated=1`, `corroboration_ok=true`, `pass depends on other gates`.

#### `CT-05` high-impact corroboration fails

Same as CT-04 but both evidence objects share the same independence key.

Expected:  
`high_impact_corroborated=0`, `corroboration_ok=false`, `pass=false` when requirement is true.

#### `CT-06` contradicted claims hard fail

Any claim in the version has `support_status='contradicted'`.

Expected:  
`contradicted_claims>=1`, `pass=false` when `max_contradicted_claims=0`.

#### `CT-07` missing provenance treated conservatively

High-impact claim supported by evidence with missing `provenance.source_class`.

Expected:  
Primary evidence ratio computed without counting that evidence as primary; gate likely fails if ratio depends on it.

### 5.3 Output normalization rules

Conformance outputs MUST normalize:  
A. timestamps ignored unless explicitly asserted in fixture  
B. ordering of lists irrelevant; counts and booleans matter  
C. ratios compared as exact decimals in fixtures; implementations SHOULD compute in double precision and format with a deterministic rounding rule specified by the runner (e.g., 6 decimals).

* * *

## 6. Compliance statement

An implementation MAY claim compliance with `$CORE_PROTOCOL_SPEC_V1` only if:  
A. It enforces invariants I1–I10,  
B. It implements algorithms 4.1–4.6, and  
C. It passes all required conformance tests CT-01..CT-07 under at least one policy pack version.

* * *

## Appendix A: Minimal SQL mapping guidance (non-normative)

A relational schema equivalent to this RFC includes tables: `stories`, `story_versions`, `claims`, `evidence_objects`, `claim_evidence_edges`, `corrections`, and `event_outbox`.

## Appendix B: Policy pack distribution (non-normative)

Policy packs SHOULD be versioned, signed, and deployed alongside releases; `$POLICY_PACK_VERSION` SHOULD be recorded in publish events.

* * *

If you want the next step, I can output the **actual CT-01..CT-07 fixture JSON files** plus a minimal test runner (`node` + `pg`) that loads fixtures into a temp schema under `$POSTGRES_URI`, evaluates the publish gate query, and asserts the expected outputs—so you have a real conformance harness aligned to this RFC.

## Q: 
output the actual CT-01..CT-07 fixture JSON files plus a minimal test runner (node + pg) that loads fixtures into a temp schema under $POSTGRES_URI, evaluates the publish gate query, and asserts the expected outputs—so you have a real conformance harness aligned to this RFC

## A: 
## `$CONFORMANCE_HARNESS_LAYOUT`

```plain text
$REPO_ROOT/
  tools/
    conformance/
      run.mjs
      sql/
        schema.sql
        publish_gate.sql
      fixtures/
        CT-01.json
        CT-02.json
        CT-03A.json
        CT-03B.json
        CT-04.json
        CT-05.json
        CT-06.json
        CT-07.json
```

* * *

## `tools/conformance/sql/schema.sql`

```sql
BEGIN;

CREATE TABLE stories (
  story_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  title TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE story_versions (
  story_version_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  disclosure_markdown TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE evidence_objects (
  evidence_id_hash TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  blob_uri TEXT NOT NULL,
  media_type TEXT NOT NULL,
  extracted_text TEXT,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE claims (
  claim_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  story_version_id TEXT NOT NULL,
  claim_type TEXT NOT NULL,
  text TEXT NOT NULL,
  entities JSONB NOT NULL DEFAULT '[]'::jsonb,
  time_window JSONB NOT NULL DEFAULT '{}'::jsonb,
  jurisdiction TEXT,
  support_status TEXT NOT NULL DEFAULT 'unsupported',
  confidence_model DOUBLE PRECISION,
  confidence_review DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE claim_evidence_edges (
  edge_id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL,
  evidence_id_hash TEXT NOT NULL,
  relation TEXT NOT NULL,
  strength DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  reviewer_actor_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE corrections (
  correction_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  claim_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
```

* * *

## `tools/conformance/sql/publish_gate.sql`

This SQL computes metrics and the publish decision using **policy-pack parameters**.

It expects these positional parameters:

`$1 platform_id`  
`$2 story_id`  
`$3 story_version_id`  
`$4 primary_source_classes::text[]`  
`$5 independence_fields::text[]` (allowed: `source`, `publisher`, `url`, `blob_uri`)  
`$6 high_impact_claim_types::text[]`  
`$7 high_impact_regexes::text[]`  
`$8 min_primary_evidence_ratio::float8`  
`$9 max_unsupported_claim_share::float8`  
`$10 max_contradicted_claims::int`  
`$11 require_high_impact_corroboration::bool`  
`$12 high_impact_min_independent_sources::int`

```sql
WITH
story_row AS (
  SELECT s.story_id, s.platform_id, s.state
  FROM stories s
  WHERE s.platform_id = $1 AND s.story_id = $2
  LIMIT 1
),
claim_base AS (
  SELECT c.claim_id, c.claim_type, c.text, c.support_status
  FROM claims c
  WHERE c.story_id = $2 AND c.story_version_id = $3
),
edges_support AS (
  SELECT e.claim_id, e.evidence_id_hash
  FROM claim_evidence_edges e
  WHERE e.claim_id IN (SELECT claim_id FROM claim_base)
    AND e.relation = 'supports'
),
evidence_enriched AS (
  SELECT
    eo.evidence_id_hash,
    eo.blob_uri,
    eo.provenance,
    (eo.provenance->>'source_class') AS source_class,
    CASE
      WHEN array_position($5, 'source') IS NOT NULL AND NULLIF(eo.provenance->>'source','') IS NOT NULL THEN eo.provenance->>'source'
      WHEN array_position($5, 'publisher') IS NOT NULL AND NULLIF(eo.provenance->>'publisher','') IS NOT NULL THEN eo.provenance->>'publisher'
      WHEN array_position($5, 'url') IS NOT NULL AND NULLIF(eo.provenance->>'url','') IS NOT NULL THEN eo.provenance->>'url'
      WHEN array_position($5, 'blob_uri') IS NOT NULL AND NULLIF(eo.blob_uri,'') IS NOT NULL THEN eo.blob_uri
      ELSE eo.blob_uri
    END AS independence_key
  FROM evidence_objects eo
  WHERE eo.evidence_id_hash IN (SELECT evidence_id_hash FROM edges_support)
),
primary_supported_claims AS (
  SELECT DISTINCT es.claim_id
  FROM edges_support es
  JOIN evidence_enriched ev ON ev.evidence_id_hash = es.evidence_id_hash
  WHERE ev.source_class = ANY($4)
),
totals AS (
  SELECT
    (SELECT COUNT(*) FROM claim_base) AS total_claims,
    (SELECT COUNT(*) FROM claim_base WHERE support_status = 'unsupported') AS unsupported_claims,
    (SELECT COUNT(*) FROM claim_base WHERE support_status = 'contradicted') AS contradicted_claims,
    (SELECT COUNT(*) FROM primary_supported_claims) AS primary_supported_claims
),
high_impact_claims AS (
  SELECT cb.claim_id
  FROM claim_base cb
  WHERE
    cb.claim_type = ANY($6)
    OR EXISTS (
      SELECT 1
      FROM unnest($7) r
      WHERE cb.text ~* r
    )
),
high_impact_support_counts AS (
  SELECT
    hic.claim_id,
    COUNT(DISTINCT ev.independence_key) AS independent_support_sources
  FROM high_impact_claims hic
  LEFT JOIN edges_support es ON es.claim_id = hic.claim_id
  LEFT JOIN evidence_enriched ev ON ev.evidence_id_hash = es.evidence_id_hash
  GROUP BY hic.claim_id
),
high_impact_rollup AS (
  SELECT
    (SELECT COUNT(*) FROM high_impact_claims) AS high_impact_claims,
    (SELECT COUNT(*) FROM high_impact_support_counts WHERE independent_support_sources >= $12) AS high_impact_corroborated
),
metrics AS (
  SELECT
    t.total_claims,
    t.unsupported_claims,
    t.contradicted_claims,
    t.primary_supported_claims,
    CASE WHEN t.total_claims = 0 THEN 0 ELSE (t.primary_supported_claims::float8 / t.total_claims::float8) END AS primary_evidence_ratio,
    CASE WHEN t.total_claims = 0 THEN 1 ELSE (t.unsupported_claims::float8 / t.total_claims::float8) END AS unsupported_claim_share,
    hr.high_impact_claims,
    hr.high_impact_corroborated,
    CASE WHEN hr.high_impact_claims = 0 THEN true ELSE (hr.high_impact_corroborated = hr.high_impact_claims) END AS corroboration_ok
  FROM totals t
  CROSS JOIN high_impact_rollup hr
)
SELECT
  sr.story_id,
  sr.platform_id,
  sr.state,
  m.*,
  (
    m.total_claims > 0
    AND m.contradicted_claims <= $10
    AND m.primary_evidence_ratio >= $8
    AND m.unsupported_claim_share <= $9
    AND (CASE WHEN $11 THEN m.corroboration_ok ELSE true END)
  ) AS publish_gate_pass
FROM story_row sr
CROSS JOIN metrics m;
```

* * *

## Fixtures: `tools/conformance/fixtures/CT-01.json` .. `CT-07.json`

### `CT-01.json` (minimal publish passes)

```json
{
  "fixture_id": "CT-01",
  "policy_pack": {
    "policy_pack_version": "v1.0.0",
    "publish_gates": {
      "min_primary_evidence_ratio": 0.5,
      "max_unsupported_claim_share": 0.1,
      "max_contradicted_claims": 0,
      "require_high_impact_corroboration": true,
      "high_impact_min_independent_sources": 2
    },
    "evidence": {
      "primary_source_classes": ["primary_record", "primary_media", "primary_dataset"],
      "independence_key_fields": ["source", "publisher", "url", "blob_uri"]
    },
    "claim": {
      "high_impact_claim_types": ["statistical"],
      "high_impact_regexes": [
        "(accus|illegal|fraud|crime|charged|indict|lawsuit|killed|injur|shoot|arrest|explos|terror|abuse)",
        "(\\$|usd|million|billion|percent|%)"
      ]
    }
  },
  "request": {
    "platform_id": "plf_local_01",
    "story_id": "01JCT01000000000000000001",
    "story_version_id": "01JCT01V00000000000000001"
  },
  "ledger": {
    "stories": [
      {
        "story_id": "01JCT01000000000000000001",
        "platform_id": "plf_local_01",
        "title": "CT-01 story",
        "state": "review",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z"
      }
    ],
    "story_versions": [
      {
        "story_version_id": "01JCT01V00000000000000001",
        "story_id": "01JCT01000000000000000001",
        "body_markdown": "Two supported claims.",
        "disclosure_markdown": null,
        "created_at": "2026-01-01T00:00:00Z"
      }
    ],
    "claims": [
      {
        "claim_id": "01JCT01C00000000000000001",
        "story_id": "01JCT01000000000000000001",
        "story_version_id": "01JCT01V00000000000000001",
        "claim_type": "factual",
        "text": "City council met on Tuesday.",
        "entities": [],
        "time_window": {},
        "jurisdiction": "local",
        "support_status": "supported",
        "confidence_model": 0.9,
        "confidence_review": 0.9,
        "created_at": "2026-01-01T00:00:00Z"
      },
      {
        "claim_id": "01JCT01C00000000000000002",
        "story_id": "01JCT01000000000000000001",
        "story_version_id": "01JCT01V00000000000000001",
        "claim_type": "factual",
        "text": "A vote was held on ordinance 12.",
        "entities": [],
        "time_window": {},
        "jurisdiction": "local",
        "support_status": "supported",
        "confidence_model": 0.9,
        "confidence_review": 0.9,
        "created_at": "2026-01-01T00:00:00Z"
      }
    ],
    "evidence_objects": [
      {
        "evidence_id_hash": "sha256:ct01e1",
        "platform_id": "plf_local_01",
        "blob_uri": "s3://evidence/ct01/minutes.pdf",
        "media_type": "application/pdf",
        "extracted_text": null,
        "provenance": {
          "source_class": "primary_record",
          "source": "city_clerk",
          "publisher": "city",
          "url": "https://example.local/minutes",
          "collected_at": "2026-01-01T00:00:00Z",
          "license": "public_record",
          "chain": []
        },
        "created_at": "2026-01-01T00:00:00Z"
      },
      {
        "evidence_id_hash": "sha256:ct01e2",
        "platform_id": "plf_local_01",
        "blob_uri": "s3://evidence/ct01/agenda.pdf",
        "media_type": "application/pdf",
        "extracted_text": null,
        "provenance": {
          "source_class": "primary_record",
          "source": "city_clerk_2",
          "publisher": "city",
          "url": "https://example.local/agenda",
          "collected_at": "2026-01-01T00:00:00Z",
          "license": "public_record",
          "chain": []
        },
        "created_at": "2026-01-01T00:00:00Z"
      }
    ],
    "claim_evidence_edges": [
      {
        "edge_id": "01JCT01E00000000000000001",
        "claim_id": "01JCT01C00000000000000001",
        "evidence_id_hash": "sha256:ct01e1",
        "relation": "supports",
        "strength": 0.9,
        "reviewer_actor_id": null,
        "notes": null,
        "created_at": "2026-01-01T00:00:00Z"
      },
      {
        "edge_id": "01JCT01E00000000000000002",
        "claim_id": "01JCT01C00000000000000002",
        "evidence_id_hash": "sha256:ct01e2",
        "relation": "supports",
        "strength": 0.9,
        "reviewer_actor_id": null,
        "notes": null,
        "created_at": "2026-01-01T00:00:00Z"
      }
    ],
    "corrections": []
  },
  "expected": {
    "total_claims": 2,
    "unsupported_claims": 0,
    "contradicted_claims": 0,
    "primary_supported_claims": 2,
    "primary_evidence_ratio": 1.0,
    "unsupported_claim_share": 0.0,
    "high_impact_claims": 0,
    "high_impact_corroborated": 0,
    "corroboration_ok": true,
    "publish_gate_pass": true
  }
}
```

### `CT-02.json` (fails unsupported claim share)

```json
{
  "fixture_id": "CT-02",
  "policy_pack": {
    "policy_pack_version": "v1.0.0",
    "publish_gates": {
      "min_primary_evidence_ratio": 0.5,
      "max_unsupported_claim_share": 0.1,
      "max_contradicted_claims": 0,
      "require_high_impact_corroboration": true,
      "high_impact_min_independent_sources": 2
    },
    "evidence": {
      "primary_source_classes": ["primary_record", "primary_media", "primary_dataset"],
      "independence_key_fields": ["source", "publisher", "url", "blob_uri"]
    },
    "claim": {
      "high_impact_claim_types": ["statistical"],
      "high_impact_regexes": [
        "(accus|illegal|fraud|crime|charged|indict|lawsuit|killed|injur|shoot|arrest|explos|terror|abuse)",
        "(\\$|usd|million|billion|percent|%)"
      ]
    }
  },
  "request": {
    "platform_id": "plf_local_01",
    "story_id": "01JCT02000000000000000001",
    "story_version_id": "01JCT02V00000000000000001"
  },
  "ledger": {
    "stories": [
      {
        "story_id": "01JCT02000000000000000001",
        "platform_id": "plf_local_01",
        "title": "CT-02 story",
        "state": "review",
        "created_at": "2026-01-02T00:00:00Z",
        "updated_at": "2026-01-02T00:00:00Z"
      }
    ],
    "story_versions": [
      {
        "story_version_id": "01JCT02V00000000000000001",
        "story_id": "01JCT02000000000000000001",
        "body_markdown": "Two supported, one unsupported.",
        "disclosure_markdown": null,
        "created_at": "2026-01-02T00:00:00Z"
      }
    ],
    "claims": [
      {
        "claim_id": "01JCT02C00000000000000001",
        "story_id": "01JCT02000000000000000001",
        "story_version_id": "01JCT02V00000000000000001",
        "claim_type": "factual",
        "text": "Meeting occurred.",
        "support_status": "supported",
        "created_at": "2026-01-02T00:00:00Z"
      },
      {
        "claim_id": "01JCT02C00000000000000002",
        "story_id": "01JCT02000000000000000001",
        "story_version_id": "01JCT02V00000000000000001",
        "claim_type": "factual",
        "text": "Ordinance discussed.",
        "support_status": "supported",
        "created_at": "2026-01-02T00:00:00Z"
      },
      {
        "claim_id": "01JCT02C00000000000000003",
        "story_id": "01JCT02000000000000000001",
        "story_version_id": "01JCT02V00000000000000001",
        "claim_type": "factual",
        "text": "A specific amendment passed unanimously.",
        "support_status": "unsupported",
        "created_at": "2026-01-02T00:00:00Z"
      }
    ],
    "evidence_objects": [
      {
        "evidence_id_hash": "sha256:ct02e1",
        "platform_id": "plf_local_01",
        "blob_uri": "s3://evidence/ct02/minutes.pdf",
        "media_type": "application/pdf",
        "provenance": { "source_class": "primary_record", "source": "city_clerk", "collected_at": "2026-01-02T00:00:00Z" },
        "created_at": "2026-01-02T00:00:00Z"
      },
      {
        "evidence_id_hash": "sha256:ct02e2",
        "platform_id": "plf_local_01",
        "blob_uri": "s3://evidence/ct02/agenda.pdf",
        "media_type": "application/pdf",
        "provenance": { "source_class": "primary_record", "source": "city_clerk_2", "collected_at": "2026-01-02T00:00:00Z" },
        "created_at": "2026-01-02T00:00:00Z"
      }
    ],
    "claim_evidence_edges": [
      { "edge_id": "01JCT02E00000000000000001", "claim_id": "01JCT02C00000000000000001", "evidence_id_hash": "sha256:ct02e1", "relation": "supports", "strength": 0.9, "created_at": "2026-01-02T00:00:00Z" },
      { "edge_id": "01JCT02E00000000000000002", "claim_id": "01JCT02C00000000000000002", "evidence_id_hash": "sha256:ct02e2", "relation": "supports", "strength": 0.9, "created_at": "2026-01-02T00:00:00Z" }
    ],
    "corrections": []
  },
  "expected": {
    "total_claims": 3,
    "unsupported_claims": 1,
    "contradicted_claims": 0,
    "primary_supported_claims": 2,
    "primary_evidence_ratio": 0.6666666667,
    "unsupported_claim_share": 0.3333333333,
    "high_impact_claims": 0,
    "high_impact_corroborated": 0,
    "corroboration_ok": true,
    "publish_gate_pass": false
  }
}
```

### `CT-03A.json` (ratio edge passes at 0.50)

```json
{
  "fixture_id": "CT-03A",
  "policy_pack": {
    "policy_pack_version": "v1.0.0",
    "publish_gates": {
      "min_primary_evidence_ratio": 0.5,
      "max_unsupported_claim_share": 0.1,
      "max_contradicted_claims": 0,
      "require_high_impact_corroboration": false,
      "high_impact_min_independent_sources": 2
    },
    "evidence": {
      "primary_source_classes": ["primary_record", "primary_media", "primary_dataset"],
      "independence_key_fields": ["source", "publisher", "url", "blob_uri"]
    },
    "claim": {
      "high_impact_claim_types": ["statistical"],
      "high_impact_regexes": ["(\\$|usd|million|billion|percent|%)"]
    }
  },
  "request": {
    "platform_id": "plf_local_01",
    "story_id": "01JCT03A00000000000000001",
    "story_version_id": "01JCT03AV0000000000000001"
  },
  "ledger": {
    "stories": [
      { "story_id": "01JCT03A00000000000000001", "platform_id": "plf_local_01", "title": "CT-03A story", "state": "review", "created_at": "2026-01-03T00:00:00Z", "updated_at": "2026-01-03T00:00:00Z" }
    ],
    "story_versions": [
      { "story_version_id": "01JCT03AV0000000000000001", "story_id": "01JCT03A00000000000000001", "body_markdown": "One primary, one secondary.", "disclosure_markdown": null, "created_at": "2026-01-03T00:00:00Z" }
    ],
    "claims": [
      { "claim_id": "01JCT03AC0000000000000001", "story_id": "01JCT03A00000000000000001", "story_version_id": "01JCT03AV0000000000000001", "claim_type": "factual", "text": "Primary-supported claim.", "support_status": "supported", "created_at": "2026-01-03T00:00:00Z" },
      { "claim_id": "01JCT03AC0000000000000002", "story_id": "01JCT03A00000000000000001", "story_version_id": "01JCT03AV0000000000000001", "claim_type": "factual", "text": "Supported only by secondary evidence.", "support_status": "supported", "created_at": "2026-01-03T00:00:00Z" }
    ],
    "evidence_objects": [
      { "evidence_id_hash": "sha256:ct03a1", "platform_id": "plf_local_01", "blob_uri": "s3://evidence/ct03a/primary.pdf", "media_type": "application/pdf", "provenance": { "source_class": "primary_record", "source": "city_clerk", "collected_at": "2026-01-03T00:00:00Z" }, "created_at": "2026-01-03T00:00:00Z" },
      { "evidence_id_hash": "sha256:ct03a2", "platform_id": "plf_local_01", "blob_uri": "s3://evidence/ct03a/secondary.html", "media_type": "text/html", "provenance": { "source_class": "secondary", "source": "blog", "collected_at": "2026-01-03T00:00:00Z" }, "created_at": "2026-01-03T00:00:00Z" }
    ],
    "claim_evidence_edges": [
      { "edge_id": "01JCT03AE0000000000000001", "claim_id": "01JCT03AC0000000000000001", "evidence_id_hash": "sha256:ct03a1", "relation": "supports", "strength": 0.9, "created_at": "2026-01-03T00:00:00Z" },
      { "edge_id": "01JCT03AE0000000000000002", "claim_id": "01JCT03AC0000000000000002", "evidence_id_hash": "sha256:ct03a2", "relation": "supports", "strength": 0.7, "created_at": "2026-01-03T00:00:00Z" }
    ],
    "corrections": []
  },
  "expected": {
    "total_claims": 2,
    "unsupported_claims": 0,
    "contradicted_claims": 0,
    "primary_supported_claims": 1,
    "primary_evidence_ratio": 0.5,
    "unsupported_claim_share": 0.0,
    "high_impact_claims": 0,
    "high_impact_corroborated": 0,
    "corroboration_ok": true,
    "publish_gate_pass": true
  }
}
```

### `CT-03B.json` (ratio fails at 0.60)

Same ledger as CT-03A, stricter policy.

```json
{
  "fixture_id": "CT-03B",
  "policy_pack": {
    "policy_pack_version": "v1.0.0",
    "publish_gates": {
      "min_primary_evidence_ratio": 0.6,
      "max_unsupported_claim_share": 0.1,
      "max_contradicted_claims": 0,
      "require_high_impact_corroboration": false,
      "high_impact_min_independent_sources": 2
    },
    "evidence": {
      "primary_source_classes": ["primary_record", "primary_media", "primary_dataset"],
      "independence_key_fields": ["source", "publisher", "url", "blob_uri"]
    },
    "claim": {
      "high_impact_claim_types": ["statistical"],
      "high_impact_regexes": ["(\\$|usd|million|billion|percent|%)"]
    }
  },
  "request": {
    "platform_id": "plf_local_01",
    "story_id": "01JCT03A00000000000000001",
    "story_version_id": "01JCT03AV0000000000000001"
  },
  "ledger": {
    "stories": [
      { "story_id": "01JCT03A00000000000000001", "platform_id": "plf_local_01", "title": "CT-03A story", "state": "review", "created_at": "2026-01-03T00:00:00Z", "updated_at": "2026-01-03T00:00:00Z" }
    ],
    "story_versions": [
      { "story_version_id": "01JCT03AV0000000000000001", "story_id": "01JCT03A00000000000000001", "body_markdown": "One primary, one secondary.", "disclosure_markdown": null, "created_at": "2026-01-03T00:00:00Z" }
    ],
    "claims": [
      { "claim_id": "01JCT03AC0000000000000001", "story_id": "01JCT03A00000000000000001", "story_version_id": "01JCT03AV0000000000000001", "claim_type": "factual", "text": "Primary-supported claim.", "support_status": "supported", "created_at": "2026-01-03T00:00:00Z" },
      { "claim_id": "01JCT03AC0000000000000002", "story_id": "01JCT03A00000000000000001", "story_version_id": "01JCT03AV0000000000000001", "claim_type": "factual", "text": "Supported only by secondary evidence.", "support_status": "supported", "created_at": "2026-01-03T00:00:00Z" }
    ],
    "evidence_objects": [
      { "evidence_id_hash": "sha256:ct03a1", "platform_id": "plf_local_01", "blob_uri": "s3://evidence/ct03a/primary.pdf", "media_type": "application/pdf", "provenance": { "source_class": "primary_record", "source": "city_clerk", "collected_at": "2026-01-03T00:00:00Z" }, "created_at": "2026-01-03T00:00:00Z" },
      { "evidence_id_hash": "sha256:ct03a2", "platform_id": "plf_local_01", "blob_uri": "s3://evidence/ct03a/secondary.html", "media_type": "text/html", "provenance": { "source_class": "secondary", "source": "blog", "collected_at": "2026-01-03T00:00:00Z" }, "created_at": "2026-01-03T00:00:00Z" }
    ],
    "claim_evidence_edges": [
      { "edge_id": "01JCT03AE0000000000000001", "claim_id": "01JCT03AC0000000000000001", "evidence_id_hash": "sha256:ct03a1", "relation": "supports", "strength": 0.9, "created_at": "2026-01-03T00:00:00Z" },
      { "edge_id": "01JCT03AE0000000000000002", "claim_id": "01JCT03AC0000000000000002", "evidence_id_hash": "sha256:ct03a2", "relation": "supports", "strength": 0.7, "created_at": "2026-01-03T00:00:00Z" }
    ],
    "corrections": []
  },
  "expected": {
    "total_claims": 2,
    "unsupported_claims": 0,
    "contradicted_claims": 0,
    "primary_supported_claims": 1,
    "primary_evidence_ratio": 0.5,
    "unsupported_claim_share": 0.0,
    "high_impact_claims": 0,
    "high_impact_corroborated": 0,
    "corroboration_ok": true,
    "publish_gate_pass": false
  }
}
```

### `CT-04.json` (high-impact corroboration passes)

```json
{
  "fixture_id": "CT-04",
  "policy_pack": {
    "policy_pack_version": "v1.0.0",
    "publish_gates": {
      "min_primary_evidence_ratio": 0.5,
      "max_unsupported_claim_share": 0.1,
      "max_contradicted_claims": 0,
      "require_high_impact_corroboration": true,
      "high_impact_min_independent_sources": 2
    },
    "evidence": {
      "primary_source_classes": ["primary_record", "primary_media", "primary_dataset"],
      "independence_key_fields": ["source", "publisher", "url", "blob_uri"]
    },
    "claim": {
      "high_impact_claim_types": ["statistical"],
      "high_impact_regexes": []
    }
  },
  "request": {
    "platform_id": "plf_local_01",
    "story_id": "01JCT04000000000000000001",
    "story_version_id": "01JCT04V00000000000000001"
  },
  "ledger": {
    "stories": [
      { "story_id": "01JCT04000000000000000001", "platform_id": "plf_local_01", "title": "CT-04 story", "state": "review", "created_at": "2026-01-04T00:00:00Z", "updated_at": "2026-01-04T00:00:00Z" }
    ],
    "story_versions": [
      { "story_version_id": "01JCT04V00000000000000001", "story_id": "01JCT04000000000000000001", "body_markdown": "Statistical claim with 2 independent supports.", "disclosure_markdown": null, "created_at": "2026-01-04T00:00:00Z" }
    ],
    "claims": [
      { "claim_id": "01JCT04C00000000000000001", "story_id": "01JCT04000000000000000001", "story_version_id": "01JCT04V00000000000000001", "claim_type": "statistical", "text": "The budget increased by 5 percent.", "support_status": "supported", "created_at": "2026-01-04T00:00:00Z" }
    ],
    "evidence_objects": [
      { "evidence_id_hash": "sha256:ct04e1", "platform_id": "plf_local_01", "blob_uri": "s3://evidence/ct04/budget.pdf", "media_type": "application/pdf", "provenance": { "source_class": "primary_record", "source": "finance_dept", "collected_at": "2026-01-04T00:00:00Z" }, "created_at": "2026-01-04T00:00:00Z" },
      { "evidence_id_hash": "sha256:ct04e2", "platform_id": "plf_local_01", "blob_uri": "s3://evidence/ct04/minutes.pdf", "media_type": "application/pdf", "provenance": { "source_class": "primary_record", "source": "city_clerk", "collected_at": "2026-01-04T00:00:00Z" }, "created_at": "2026-01-04T00:00:00Z" }
    ],
    "claim_evidence_edges": [
      { "edge_id": "01JCT04E00000000000000001", "claim_id": "01JCT04C00000000000000001", "evidence_id_hash": "sha256:ct04e1", "relation": "supports", "strength": 0.9, "created_at": "2026-01-04T00:00:00Z" },
      { "edge_id": "01JCT04E00000000000000002", "claim_id": "01JCT04C00000000000000001", "evidence_id_hash": "sha256:ct04e2", "relation": "supports", "strength": 0.9, "created_at": "2026-01-04T00:00:00Z" }
    ],
    "corrections": []
  },
  "expected": {
    "total_claims": 1,
    "unsupported_claims": 0,
    "contradicted_claims": 0,
    "primary_supported_claims": 1,
    "primary_evidence_ratio": 1.0,
    "unsupported_claim_share": 0.0,
    "high_impact_claims": 1,
    "high_impact_corroborated": 1,
    "corroboration_ok": true,
    "publish_gate_pass": true
  }
}
```

### `CT-05.json` (high-impact corroboration fails due to same independence key)

```json
{
  "fixture_id": "CT-05",
  "policy_pack": {
    "policy_pack_version": "v1.0.0",
    "publish_gates": {
      "min_primary_evidence_ratio": 0.5,
      "max_unsupported_claim_share": 0.1,
      "max_contradicted_claims": 0,
      "require_high_impact_corroboration": true,
      "high_impact_min_independent_sources": 2
    },
    "evidence": {
      "primary_source_classes": ["primary_record", "primary_media", "primary_dataset"],
      "independence_key_fields": ["source", "publisher", "url", "blob_uri"]
    },
    "claim": {
      "high_impact_claim_types": ["statistical"],
      "high_impact_regexes": []
    }
  },
  "request": {
    "platform_id": "plf_local_01",
    "story_id": "01JCT05000000000000000001",
    "story_version_id": "01JCT05V00000000000000001"
  },
  "ledger": {
    "stories": [
      { "story_id": "01JCT05000000000000000001", "platform_id": "plf_local_01", "title": "CT-05 story", "state": "review", "created_at": "2026-01-05T00:00:00Z", "updated_at": "2026-01-05T00:00:00Z" }
    ],
    "story_versions": [
      { "story_version_id": "01JCT05V00000000000000001", "story_id": "01JCT05000000000000000001", "body_markdown": "Statistical claim with 2 supports but not independent.", "disclosure_markdown": null, "created_at": "2026-01-05T00:00:00Z" }
    ],
    "claims": [
      { "claim_id": "01JCT05C00000000000000001", "story_id": "01JCT05000000000000000001", "story_version_id": "01JCT05V00000000000000001", "claim_type": "statistical", "text": "The budget increased by 5 percent.", "support_status": "supported", "created_at": "2026-01-05T00:00:00Z" }
    ],
    "evidence_objects": [
      { "evidence_id_hash": "sha256:ct05e1", "platform_id": "plf_local_01", "blob_uri": "s3://evidence/ct05/budget.pdf", "media_type": "application/pdf", "provenance": { "source_class": "primary_record", "source": "same_source", "collected_at": "2026-01-05T00:00:00Z" }, "created_at": "2026-01-05T00:00:00Z" },
      { "evidence_id_hash": "sha256:ct05e2", "platform_id": "plf_local_01", "blob_uri": "s3://evidence/ct05/budget_copy.pdf", "media_type": "application/pdf", "provenance": { "source_class": "primary_record", "source": "same_source", "collected_at": "2026-01-05T00:00:00Z" }, "created_at": "2026-01-05T00:00:00Z" }
    ],
    "claim_evidence_edges": [
      { "edge_id": "01JCT05E00000000000000001", "claim_id": "01JCT05C00000000000000001", "evidence_id_hash": "sha256:ct05e1", "relation": "supports", "strength": 0.9, "created_at": "2026-01-05T00:00:00Z" },
      { "edge_id": "01JCT05E00000000000000002", "claim_id": "01JCT05C00000000000000001", "evidence_id_hash": "sha256:ct05e2", "relation": "supports", "strength": 0.9, "created_at": "2026-01-05T00:00:00Z" }
    ],
    "corrections": []
  },
  "expected": {
    "total_claims": 1,
    "unsupported_claims": 0,
    "contradicted_claims": 0,
    "primary_supported_claims": 1,
    "primary_evidence_ratio": 1.0,
    "unsupported_claim_share": 0.0,
    "high_impact_claims": 1,
    "high_impact_corroborated": 0,
    "corroboration_ok": false,
    "publish_gate_pass": false
  }
}
```

### `CT-06.json` (contradicted claims hard fail)

```json
{
  "fixture_id": "CT-06",
  "policy_pack": {
    "policy_pack_version": "v1.0.0",
    "publish_gates": {
      "min_primary_evidence_ratio": 0.0,
      "max_unsupported_claim_share": 1.0,
      "max_contradicted_claims": 0,
      "require_high_impact_corroboration": false,
      "high_impact_min_independent_sources": 2
    },
    "evidence": {
      "primary_source_classes": ["primary_record", "primary_media", "primary_dataset"],
      "independence_key_fields": ["source", "publisher", "url", "blob_uri"]
    },
    "claim": {
      "high_impact_claim_types": ["statistical"],
      "high_impact_regexes": []
    }
  },
  "request": {
    "platform_id": "plf_local_01",
    "story_id": "01JCT06000000000000000001",
    "story_version_id": "01JCT06V00000000000000001"
  },
  "ledger": {
    "stories": [
      { "story_id": "01JCT06000000000000000001", "platform_id": "plf_local_01", "title": "CT-06 story", "state": "review", "created_at": "2026-01-06T00:00:00Z", "updated_at": "2026-01-06T00:00:00Z" }
    ],
    "story_versions": [
      { "story_version_id": "01JCT06V00000000000000001", "story_id": "01JCT06000000000000000001", "body_markdown": "Contradicted claim exists.", "disclosure_markdown": null, "created_at": "2026-01-06T00:00:00Z" }
    ],
    "claims": [
      { "claim_id": "01JCT06C00000000000000001", "story_id": "01JCT06000000000000000001", "story_version_id": "01JCT06V00000000000000001", "claim_type": "factual", "text": "A fact that is contradicted.", "support_status": "contradicted", "created_at": "2026-01-06T00:00:00Z" }
    ],
    "evidence_objects": [],
    "claim_evidence_edges": [],
    "corrections": []
  },
  "expected": {
    "total_claims": 1,
    "unsupported_claims": 0,
    "contradicted_claims": 1,
    "primary_supported_claims": 0,
    "primary_evidence_ratio": 0.0,
    "unsupported_claim_share": 0.0,
    "high_impact_claims": 0,
    "high_impact_corroborated": 0,
    "corroboration_ok": true,
    "publish_gate_pass": false
  }
}
```

### `CT-07.json` (missing provenance source_class treated conservatively)

High-impact claim has corroboration OK (2 distinct sources), but primary ratio fails because evidence lacks `source_class`.

```json
{
  "fixture_id": "CT-07",
  "policy_pack": {
    "policy_pack_version": "v1.0.0",
    "publish_gates": {
      "min_primary_evidence_ratio": 0.5,
      "max_unsupported_claim_share": 0.1,
      "max_contradicted_claims": 0,
      "require_high_impact_corroboration": true,
      "high_impact_min_independent_sources": 2
    },
    "evidence": {
      "primary_source_classes": ["primary_record", "primary_media", "primary_dataset"],
      "independence_key_fields": ["source", "publisher", "url", "blob_uri"]
    },
    "claim": {
      "high_impact_claim_types": ["statistical"],
      "high_impact_regexes": []
    }
  },
  "request": {
    "platform_id": "plf_local_01",
    "story_id": "01JCT07000000000000000001",
    "story_version_id": "01JCT07V00000000000000001"
  },
  "ledger": {
    "stories": [
      { "story_id": "01JCT07000000000000000001", "platform_id": "plf_local_01", "title": "CT-07 story", "state": "review", "created_at": "2026-01-07T00:00:00Z", "updated_at": "2026-01-07T00:00:00Z" }
    ],
    "story_versions": [
      { "story_version_id": "01JCT07V00000000000000001", "story_id": "01JCT07000000000000000001", "body_markdown": "Statistical claim with missing source_class evidence.", "disclosure_markdown": null, "created_at": "2026-01-07T00:00:00Z" }
    ],
    "claims": [
      { "claim_id": "01JCT07C00000000000000001", "story_id": "01JCT07000000000000000001", "story_version_id": "01JCT07V00000000000000001", "claim_type": "statistical", "text": "The budget increased by 5 percent.", "support_status": "supported", "created_at": "2026-01-07T00:00:00Z" }
    ],
    "evidence_objects": [
      { "evidence_id_hash": "sha256:ct07e1", "platform_id": "plf_local_01", "blob_uri": "s3://evidence/ct07/doc1.pdf", "media_type": "application/pdf", "provenance": { "source": "source_a", "collected_at": "2026-01-07T00:00:00Z" }, "created_at": "2026-01-07T00:00:00Z" },
      { "evidence_id_hash": "sha256:ct07e2", "platform_id": "plf_local_01", "blob_uri": "s3://evidence/ct07/doc2.pdf", "media_type": "application/pdf", "provenance": { "source": "source_b", "collected_at": "2026-01-07T00:00:00Z" }, "created_at": "2026-01-07T00:00:00Z" }
    ],
    "claim_evidence_edges": [
      { "edge_id": "01JCT07E00000000000000001", "claim_id": "01JCT07C00000000000000001", "evidence_id_hash": "sha256:ct07e1", "relation": "supports", "strength": 0.9, "created_at": "2026-01-07T00:00:00Z" },
      { "edge_id": "01JCT07E00000000000000002", "claim_id": "01JCT07C00000000000000001", "evidence_id_hash": "sha256:ct07e2", "relation": "supports", "strength": 0.9, "created_at": "2026-01-07T00:00:00Z" }
    ],
    "corrections": []
  },
  "expected": {
    "total_claims": 1,
    "unsupported_claims": 0,
    "contradicted_claims": 0,
    "primary_supported_claims": 0,
    "primary_evidence_ratio": 0.0,
    "unsupported_claim_share": 0.0,
    "high_impact_claims": 1,
    "high_impact_corroborated": 1,
    "corroboration_ok": true,
    "publish_gate_pass": false
  }
}
```

* * *

## Test runner: `tools/conformance/run.mjs`

Requires only `pg` and `node` (ESM). Install once:

```bash
npm i pg
```

Run:

```bash
export POSTGRES_URI="postgres://news:news@localhost:5432/news_ledger?sslmode=disable"
node tools/conformance/run.mjs
```
```js
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;

const POSTGRES_URI = process.env.POSTGRES_URI;
if (!POSTGRES_URI) {
  console.error("Missing $POSTGRES_URI");
  process.exit(2);
}

const ROOT = process.cwd();
const FIXTURES_DIR = path.join(ROOT, "tools", "conformance", "fixtures");
const SQL_DIR = path.join(ROOT, "tools", "conformance", "sql");
const SCHEMA_SQL = fs.readFileSync(path.join(SQL_DIR, "schema.sql"), "utf8");
const GATE_SQL = fs.readFileSync(path.join(SQL_DIR, "publish_gate.sql"), "utf8");

const FIXTURE_FILES = [
  "CT-01.json",
  "CT-02.json",
  "CT-03A.json",
  "CT-03B.json",
  "CT-04.json",
  "CT-05.json",
  "CT-06.json",
  "CT-07.json"
];

function schemaName() {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10);
  return `tmp_conformance_${t}_${r}`.replace(/[^a-zA-Z0-9_]/g, "_");
}

function round6(n) {
  if (n === null || n === undefined) return null;
  return Number(Number(n).toFixed(6));
}

function assertEq(label, got, exp) {
  if (typeof exp === "number") {
    const g = round6(got);
    const e = round6(exp);
    if (g !== e) throw new Error(`${label}: expected ${e} got ${g}`);
    return;
  }
  if (got !== exp) throw new Error(`${label}: expected ${exp} got ${got}`);
}

async function execInSchema(client, schema, sql) {
  await client.query(`SET search_path TO ${schema}, public;`);
  return client.query(sql);
}

async function insertRows(client, table, rows) {
  if (!rows || rows.length === 0) return;

  const cols = Object.keys(rows[0]);
  const colList = cols.map((c) => `"${c}"`).join(", ");

  for (const row of rows) {
    const vals = cols.map((c) => row[c]);
    const params = vals.map((_, i) => `$${i + 1}`).join(", ");
    const q = `INSERT INTO ${table} (${colList}) VALUES (${params})`;
    await client.query(q, vals);
  }
}

async function runFixture(pool, fixturePath) {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const schema = schemaName();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA ${schema};`);
    await execInSchema(client, schema, SCHEMA_SQL);

    const ledger = fixture.ledger;

    await insertRows(client, "stories", ledger.stories ?? []);
    await insertRows(client, "story_versions", ledger.story_versions ?? []);
    await insertRows(client, "claims", (ledger.claims ?? []).map((c) => ({
      entities: JSON.stringify(c.entities ?? []),
      time_window: JSON.stringify(c.time_window ?? {}),
      jurisdiction: c.jurisdiction ?? null,
      confidence_model: c.confidence_model ?? null,
      confidence_review: c.confidence_review ?? null,
      ...c
    })));
    await insertRows(client, "evidence_objects", (ledger.evidence_objects ?? []).map((e) => ({
      extracted_text: e.extracted_text ?? null,
      provenance: JSON.stringify(e.provenance ?? {}),
      ...e
    })));
    await insertRows(client, "claim_evidence_edges", (ledger.claim_evidence_edges ?? []).map((e) => ({
      reviewer_actor_id: e.reviewer_actor_id ?? null,
      notes: e.notes ?? null,
      ...e
    })));
    await insertRows(client, "corrections", (ledger.corrections ?? []).map((c) => ({
      details: JSON.stringify(c.details ?? {}),
      ...c
    })));

    const P = fixture.policy_pack;
    const req = fixture.request;

    const args = [
      req.platform_id,
      req.story_id,
      req.story_version_id,
      P.evidence.primary_source_classes,
      P.evidence.independence_key_fields,
      P.claim.high_impact_claim_types,
      P.claim.high_impact_regexes,
      P.publish_gates.min_primary_evidence_ratio,
      P.publish_gates.max_unsupported_claim_share,
      P.publish_gates.max_contradicted_claims,
      P.publish_gates.require_high_impact_corroboration,
      P.publish_gates.high_impact_min_independent_sources
    ];

    const gateRes = await execInSchema(client, schema, {
      text: GATE_SQL,
      values: args
    });

    if (gateRes.rowCount !== 1) {
      throw new Error(`Gate query returned ${gateRes.rowCount} rows`);
    }

    const row = gateRes.rows[0];
    const exp = fixture.expected;

    assertEq("total_claims", Number(row.total_claims), exp.total_claims);
    assertEq("unsupported_claims", Number(row.unsupported_claims), exp.unsupported_claims);
    assertEq("contradicted_claims", Number(row.contradicted_claims), exp.contradicted_claims);
    assertEq("primary_supported_claims", Number(row.primary_supported_claims), exp.primary_supported_claims);

    assertEq("primary_evidence_ratio", Number(row.primary_evidence_ratio), exp.primary_evidence_ratio);
    assertEq("unsupported_claim_share", Number(row.unsupported_claim_share), exp.unsupported_claim_share);

    assertEq("high_impact_claims", Number(row.high_impact_claims), exp.high_impact_claims);
    assertEq("high_impact_corroborated", Number(row.high_impact_corroborated), exp.high_impact_corroborated);

    assertEq("corroboration_ok", Boolean(row.corroboration_ok), exp.corroboration_ok);
    assertEq("publish_gate_pass", Boolean(row.publish_gate_pass), exp.publish_gate_pass);

    await client.query("ROLLBACK"); // drop schema in separate statement outside txn
    await client.query(`DROP SCHEMA ${schema} CASCADE;`);

    return { fixture_id: fixture.fixture_id, ok: true };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    try {
      await client.query(`DROP SCHEMA ${schema} CASCADE;`);
    } catch {}
    return { fixture_id: fixture.fixture_id, ok: false, error: String(err?.message ?? err) };
  } finally {
    client.release();
  }
}

async function main() {
  const pool = new Pool({ connectionString: POSTGRES_URI });

  let failed = 0;
  for (const f of FIXTURE_FILES) {
    const fp = path.join(FIXTURES_DIR, f);
    const r = await runFixture(pool, fp);
    if (!r.ok) {
      failed += 1;
      console.error(`[FAIL] ${r.fixture_id}: ${r.error}`);
    } else {
      console.log(`[OK] ${r.fixture_id}`);
    }
  }

  await pool.end();

  if (failed > 0) process.exit(1);
  console.log("All conformance tests passed.");
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
```

* * *

## Notes that matter for interoperability

`provenance.source_class` is treated as mandatory for primary counting; missing means non-primary.  
Corroboration independence uses `policy_pack.evidence.independence_key_fields` as an ordered preference list, constrained to `source|publisher|url|blob_uri`.  
Regex matching uses Postgres `~*` (case-insensitive) so fixtures assume Postgres behavior.

If you want the harness to also validate the **publish transaction** semantics (row-lock + state update + outbox append), I can extend it with a second SQL file that performs the transactional publish and asserts final state changes in the temp schema.

## Q: 
extend it with a second SQL file that performs the transactional publish and asserts final state changes in the temp schema.

## A: 
## `tools/conformance/sql/schema.sql` (extend with `event_outbox`)

Append this table definition (or insert before `COMMIT;`):

```sql
CREATE TABLE event_outbox (
  event_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_version TEXT NOT NULL DEFAULT 'v1',
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);
```

Full file remains valid as-is (it already has `BEGIN; ... COMMIT;`).

* * *

## New file: `tools/conformance/sql/publish_txn.sql`

This file is executed **inside a transaction** by the runner. It locks the story row, re-evaluates the gate (policy-pack parameterized), and either:

A. Updates `stories.state='published'` and inserts one outbox event, then returns `(state, outbox_count)`  
B. Raises an exception `publish_gate_failed` (runner rolls back), then state/outbox remain unchanged.

Parameters are the same as `publish_gate.sql` plus one:

`$13 policy_pack_version::text`

```sql
DO $$
DECLARE
  v_pass boolean;
  v_story_version_id text;
BEGIN
  -- lock story row (platform-scoped)
  PERFORM 1
  FROM stories s
  WHERE s.platform_id = $1 AND s.story_id = $2
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'story_not_found';
  END IF;

  -- compute pass using the same gate logic (embedded)
  WITH
  claim_base AS (
    SELECT c.claim_id, c.claim_type, c.text, c.support_status
    FROM claims c
    WHERE c.story_id = $2 AND c.story_version_id = $3
  ),
  edges_support AS (
    SELECT e.claim_id, e.evidence_id_hash
    FROM claim_evidence_edges e
    WHERE e.claim_id IN (SELECT claim_id FROM claim_base)
      AND e.relation = 'supports'
  ),
  evidence_enriched AS (
    SELECT
      eo.evidence_id_hash,
      eo.blob_uri,
      eo.provenance,
      (eo.provenance->>'source_class') AS source_class,
      CASE
        WHEN array_position($5, 'source') IS NOT NULL AND NULLIF(eo.provenance->>'source','') IS NOT NULL THEN eo.provenance->>'source'
        WHEN array_position($5, 'publisher') IS NOT NULL AND NULLIF(eo.provenance->>'publisher','') IS NOT NULL THEN eo.provenance->>'publisher'
        WHEN array_position($5, 'url') IS NOT NULL AND NULLIF(eo.provenance->>'url','') IS NOT NULL THEN eo.provenance->>'url'
        WHEN array_position($5, 'blob_uri') IS NOT NULL AND NULLIF(eo.blob_uri,'') IS NOT NULL THEN eo.blob_uri
        ELSE eo.blob_uri
      END AS independence_key
    FROM evidence_objects eo
    WHERE eo.evidence_id_hash IN (SELECT evidence_id_hash FROM edges_support)
  ),
  primary_supported_claims AS (
    SELECT DISTINCT es.claim_id
    FROM edges_support es
    JOIN evidence_enriched ev ON ev.evidence_id_hash = es.evidence_id_hash
    WHERE ev.source_class = ANY($4)
  ),
  totals AS (
    SELECT
      (SELECT COUNT(*) FROM claim_base) AS total_claims,
      (SELECT COUNT(*) FROM claim_base WHERE support_status = 'unsupported') AS unsupported_claims,
      (SELECT COUNT(*) FROM claim_base WHERE support_status = 'contradicted') AS contradicted_claims,
      (SELECT COUNT(*) FROM primary_supported_claims) AS primary_supported_claims
  ),
  high_impact_claims AS (
    SELECT cb.claim_id
    FROM claim_base cb
    WHERE
      cb.claim_type = ANY($6)
      OR EXISTS (SELECT 1 FROM unnest($7) r WHERE cb.text ~* r)
  ),
  high_impact_support_counts AS (
    SELECT
      hic.claim_id,
      COUNT(DISTINCT ev.independence_key) AS independent_support_sources
    FROM high_impact_claims hic
    LEFT JOIN edges_support es ON es.claim_id = hic.claim_id
    LEFT JOIN evidence_enriched ev ON ev.evidence_id_hash = es.evidence_id_hash
    GROUP BY hic.claim_id
  ),
  high_impact_rollup AS (
    SELECT
      (SELECT COUNT(*) FROM high_impact_claims) AS high_impact_claims,
      (SELECT COUNT(*) FROM high_impact_support_counts WHERE independent_support_sources >= $12) AS high_impact_corroborated
  ),
  metrics AS (
    SELECT
      t.total_claims,
      t.unsupported_claims,
      t.contradicted_claims,
      t.primary_supported_claims,
      CASE WHEN t.total_claims = 0 THEN 0 ELSE (t.primary_supported_claims::float8 / t.total_claims::float8) END AS primary_evidence_ratio,
      CASE WHEN t.total_claims = 0 THEN 1 ELSE (t.unsupported_claims::float8 / t.total_claims::float8) END AS unsupported_claim_share,
      hr.high_impact_claims,
      hr.high_impact_corroborated,
      CASE WHEN hr.high_impact_claims = 0 THEN true ELSE (hr.high_impact_corroborated = hr.high_impact_claims) END AS corroboration_ok
    FROM totals t
    CROSS JOIN high_impact_rollup hr
  )
  SELECT
    ($3)::text AS story_version_id,
    (
      m.total_claims > 0
      AND m.contradicted_claims <= $10
      AND m.primary_evidence_ratio >= $8
      AND m.unsupported_claim_share <= $9
      AND (CASE WHEN $11 THEN m.corroboration_ok ELSE true END)
    ) AS pass
  INTO v_story_version_id, v_pass
  FROM metrics m;

  IF v_story_version_id IS NULL THEN
    RAISE EXCEPTION 'missing_story_version_id';
  END IF;

  IF v_pass IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'publish_gate_failed';
  END IF;

  -- publish
  UPDATE stories
  SET state = 'published', updated_at = now()
  WHERE platform_id = $1 AND story_id = $2;

  -- write outbox event (deterministic enough for harness; real system should use ULID)
  INSERT INTO event_outbox (event_id, platform_id, event_type, event_version, payload)
  VALUES (
    'evt_' || $2 || '_' || $3,
    $1,
    'story.published.v1',
    'v1',
    jsonb_build_object(
      'story_id', $2,
      'story_version_id', $3,
      'policy_pack_version', $13
    )
  );

END $$;

SELECT
  (SELECT state FROM stories WHERE platform_id = $1 AND story_id = $2) AS story_state,
  (SELECT COUNT(*)::int FROM event_outbox WHERE platform_id = $1 AND event_type = 'story.published.v1') AS outbox_count;
```

* * *

## Update runner: `tools/conformance/run.mjs` (execute publish txn + assert)

Add near the top:

```js
const PUBLISH_TXN_SQL = fs.readFileSync(path.join(SQL_DIR, "publish_txn.sql"), "utf8");
```

Replace the transaction handling in `runFixture` with the publish assertions shown below. This version keeps your existing gate assertions and then validates transactional publish behavior.

```js
async function runFixture(pool, fixturePath) {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const schema = schemaName();

  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema};`);
    await execInSchema(client, schema, SCHEMA_SQL);

    const ledger = fixture.ledger;

    await insertRows(client, "stories", ledger.stories ?? []);
    await insertRows(client, "story_versions", ledger.story_versions ?? []);
    await insertRows(client, "claims", (ledger.claims ?? []).map((c) => ({
      entities: JSON.stringify(c.entities ?? []),
      time_window: JSON.stringify(c.time_window ?? {}),
      jurisdiction: c.jurisdiction ?? null,
      confidence_model: c.confidence_model ?? null,
      confidence_review: c.confidence_review ?? null,
      ...c
    })));
    await insertRows(client, "evidence_objects", (ledger.evidence_objects ?? []).map((e) => ({
      extracted_text: e.extracted_text ?? null,
      provenance: JSON.stringify(e.provenance ?? {}),
      ...e
    })));
    await insertRows(client, "claim_evidence_edges", (ledger.claim_evidence_edges ?? []).map((e) => ({
      reviewer_actor_id: e.reviewer_actor_id ?? null,
      notes: e.notes ?? null,
      ...e
    })));
    await insertRows(client, "corrections", (ledger.corrections ?? []).map((c) => ({
      details: JSON.stringify(c.details ?? {}),
      ...c
    })));

    const P = fixture.policy_pack;
    const req = fixture.request;

    const gateArgs = [
      req.platform_id,
      req.story_id,
      req.story_version_id,
      P.evidence.primary_source_classes,
      P.evidence.independence_key_fields,
      P.claim.high_impact_claim_types,
      P.claim.high_impact_regexes,
      P.publish_gates.min_primary_evidence_ratio,
      P.publish_gates.max_unsupported_claim_share,
      P.publish_gates.max_contradicted_claims,
      P.publish_gates.require_high_impact_corroboration,
      P.publish_gates.high_impact_min_independent_sources
    ];

    const gateRes = await execInSchema(client, schema, { text: GATE_SQL, values: gateArgs });
    if (gateRes.rowCount !== 1) throw new Error(`Gate query returned ${gateRes.rowCount} rows`);

    const row = gateRes.rows[0];
    const exp = fixture.expected;

    assertEq("total_claims", Number(row.total_claims), exp.total_claims);
    assertEq("unsupported_claims", Number(row.unsupported_claims), exp.unsupported_claims);
    assertEq("contradicted_claims", Number(row.contradicted_claims), exp.contradicted_claims);
    assertEq("primary_supported_claims", Number(row.primary_supported_claims), exp.primary_supported_claims);

    assertEq("primary_evidence_ratio", Number(row.primary_evidence_ratio), exp.primary_evidence_ratio);
    assertEq("unsupported_claim_share", Number(row.unsupported_claim_share), exp.unsupported_claim_share);

    assertEq("high_impact_claims", Number(row.high_impact_claims), exp.high_impact_claims);
    assertEq("high_impact_corroborated", Number(row.high_impact_corroborated), exp.high_impact_corroborated);

    assertEq("corroboration_ok", Boolean(row.corroboration_ok), exp.corroboration_ok);
    assertEq("publish_gate_pass", Boolean(row.publish_gate_pass), exp.publish_gate_pass);

    // transactional publish assertions
    const publishArgs = [...gateArgs, P.policy_pack_version];

    if (exp.publish_gate_pass === true) {
      await client.query("BEGIN");
      const pubRes = await execInSchema(client, schema, { text: PUBLISH_TXN_SQL, values: publishArgs });
      await client.query("COMMIT");

      const st = String(pubRes.rows?.[0]?.story_state ?? "");
      const oc = Number(pubRes.rows?.[0]?.outbox_count ?? -1);
      assertEq("publish_txn.story_state", st, "published");
      assertEq("publish_txn.outbox_count", oc, 1);
    } else {
      let failedAsExpected = false;
      await client.query("BEGIN");
      try {
        await execInSchema(client, schema, { text: PUBLISH_TXN_SQL, values: publishArgs });
      } catch (e) {
        failedAsExpected = true;
      } finally {
        await client.query("ROLLBACK");
      }
      if (!failedAsExpected) throw new Error("publish_txn: expected failure but succeeded");

      const check = await execInSchema(
        client,
        schema,
        {
          text: `
            SELECT
              (SELECT state FROM stories WHERE platform_id=$1 AND story_id=$2) AS story_state,
              (SELECT COUNT(*)::int FROM event_outbox WHERE platform_id=$1 AND event_type='story.published.v1') AS outbox_count
          `,
          values: [req.platform_id, req.story_id]
        }
      );

      const st = String(check.rows?.[0]?.story_state ?? "");
      const oc = Number(check.rows?.[0]?.outbox_count ?? -1);

      // story state should remain whatever fixture inserted (typically 'review')
      const expectedInitialState = String((ledger.stories?.[0]?.state ?? "review"));
      assertEq("publish_txn.story_state", st, expectedInitialState);
      assertEq("publish_txn.outbox_count", oc, 0);
    }

    await client.query(`DROP SCHEMA ${schema} CASCADE;`);
    return { fixture_id: fixture.fixture_id, ok: true };
  } catch (err) {
    try { await client.query(`DROP SCHEMA ${schema} CASCADE;`); } catch {}
    return { fixture_id: fixture.fixture_id, ok: false, error: String(err?.message ?? err) };
  } finally {
    client.release();
  }
}
```

* * *

## Resulting behavior

When a fixture’s `expected.publish_gate_pass=true`, the harness now also proves:

`stories.state` becomes `published` inside the temp schema  
`event_outbox` contains exactly one `story.published.v1` row

When `expected.publish_gate_pass=false`, the harness proves the publish attempt fails transactionally and leaves:

`stories.state` unchanged  
`event_outbox` empty

This is the minimal conformance proof for “gate + atomic publish + append-only event” aligned to `$CORE_PROTOCOL_SPEC_V1`.

