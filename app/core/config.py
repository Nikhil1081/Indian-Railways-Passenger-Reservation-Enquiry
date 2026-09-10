from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    """Runtime settings for the Indian Railways Enquiry clone."""
    model_config = SettingsConfigDict(env_prefix="IR_", env_file=".env", extra="ignore")

    app_name: str = Field(default="INDIAN RAILWAYS PASSENGER RESERVATION ENQUIRY")
    app_version: str = Field(default="1.0.0")
    groq_api_key: str = Field(default="", validation_alias="GROQ_API_KEY")

@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
