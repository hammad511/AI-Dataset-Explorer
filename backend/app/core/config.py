from typing import List, Optional
from pydantic import Field, AliasChoices
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    PROJECT_NAME: str = "AI Dataset Explorer"
    VERSION: str = "2.0.0"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"

    # Database
    DATABASE_URL: str = Field(
        default="sqlite+aiosqlite:///./ai_dataset_explorer.db",
        description="PostgreSQL or SQLite async connection URL",
    )
    USE_PGVECTOR: bool = Field(
        default=False,
        description="Whether pgvector extension is available in database",
    )
    REDIS_URL: Optional[str] = Field(
        default=None,
        description="Optional Redis URL for caching",
    )

    # Security & CORS (NEVER wildcard with credentials per AGENTS.md)
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]
    RATE_LIMIT_RPM: int = 60

    # LLM Providers (OpenAI, Anthropic, Google, Mock)
    LLM_PROVIDER: str = "google"  # 'openai' | 'anthropic' | 'google' | 'mock'
    OPENAI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None

    # Embeddings Provider
    EMBEDDING_PROVIDER: str = "local"  # 'hosted' | 'local' | 'mock'
    EMBEDDING_MODEL: str = "BAAI/bge-small-en-v1.5"
    EMBEDDING_DIMENSION: int = 384
    EMBEDDING_VERSION: str = "v1"

    # Reranker Provider
    RERANKER_PROVIDER: str = "heuristic"  # 'cross-encoder' | 'hosted' | 'heuristic' | 'llm'
    RERANKER_API_KEY: Optional[str] = None

    # External Data Sources
    HUGGINGFACE_TOKEN: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("HF_TOKEN", "HUGGINGFACE_TOKEN", "HUGGING_FACE_TOKEN"),
    )
    KAGGLE_API_TOKEN: Optional[str] = None
    KAGGLE_USERNAME: Optional[str] = None
    KAGGLE_KEY: Optional[str] = None
    SEMANTIC_SCHOLAR_API_KEY: Optional[str] = None
    OPENALEX_API_KEY: Optional[str] = None
    OPENALEX_EMAIL: Optional[str] = "research@example.com"
    CONTACT_EMAIL: Optional[str] = "research@example.com"
    NCBI_API_KEY: Optional[str] = None

    # Ranking Weights (Section 81)
    SEMANTIC_WEIGHT: float = 0.30
    TASK_WEIGHT: float = 0.20
    CONSTRAINT_WEIGHT: float = 0.15
    RELATIONSHIP_WEIGHT: float = 0.15
    BENCHMARK_WEIGHT: float = 0.08
    FRESHNESS_WEIGHT: float = 0.07
    POPULARITY_WEIGHT: float = 0.05

    # RRF Constant
    RRF_K: int = 60


settings = Settings()
