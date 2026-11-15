from datetime import datetime
from typing import Annotated, Literal
from uuid import uuid4

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class BaseObservation(Model):
    schema_version: Literal["1"] = "1"
    observation_id: str = Field(default_factory=lambda: str(uuid4()), min_length=1, max_length=100)
    subject_id: str = Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")
    observed_at: AwareDatetime
    synthetic: bool = False
    quality: Literal["valid", "invalid"] = "valid"


class SleepObservation(BaseObservation):
    kind: Literal["sleep"]
    source: Literal["self_report"] = "self_report"
    sleep_hours: float = Field(ge=0, le=24)
    sleep_quality: int = Field(ge=1, le=5, strict=True)


class MoodObservation(BaseObservation):
    kind: Literal["mood"]
    source: Literal["self_report"] = "self_report"
    confirmed: Literal[True]
    mood_rating: int = Field(ge=1, le=5, strict=True)
    alertness: int = Field(ge=1, le=10, strict=True)
    # Free conversation and unconfirmed model inferences are deliberately absent.


class SleepMeasurement(BaseObservation):
    kind: Literal["sleep_measurement"]
    source: Literal["instrument"] = "instrument"
    device_id: str = Field(min_length=1, max_length=100)
    method: str = Field(min_length=1, max_length=100)
    period_start: AwareDatetime
    period_end: AwareDatetime
    sleep_hours: float = Field(ge=0, le=24)
    # Optional device-reported estimates, not values inferred from duration.
    sleep_latency_minutes: float | None = Field(default=None, ge=0, le=2880)
    wake_after_sleep_onset_minutes: float | None = Field(default=None, ge=0, le=2880)
    awakenings_count: int | None = Field(default=None, ge=0, le=500, strict=True)
    sleep_efficiency_percent: float | None = Field(default=None, ge=0, le=100)

    @model_validator(mode="after")
    def check_period(self):
        duration = (self.period_end - self.period_start).total_seconds() / 3600
        if not 0 < duration <= 48:
            raise ValueError("sleep period must be positive and at most 48 hours")
        if self.sleep_hours > duration:
            raise ValueError("sleep_hours cannot exceed the observation period")
        if (self.sleep_latency_minutes is not None and self.sleep_latency_minutes > duration * 60
                or self.wake_after_sleep_onset_minutes is not None and self.wake_after_sleep_onset_minutes > duration * 60):
            raise ValueError("sleep timing metrics cannot exceed the observation period")
        if self.observed_at < self.period_end:
            raise ValueError("observed_at must be at or after period_end")
        return self


class SpeechFeedback(BaseObservation):
    kind: Literal["speech_feedback"]
    source: Literal["speech_module"] = "speech_module"
    turn_id: str = Field(min_length=1, max_length=100)
    basis: Literal["self_report", "model_inference"]
    user_confirmed: bool
    fatigue_rating: int | None = Field(default=None, ge=1, le=10, strict=True)
    alertness: int | None = Field(default=None, ge=1, le=10, strict=True)
    mood_rating: int | None = Field(default=None, ge=1, le=5, strict=True)

    @model_validator(mode="after")
    def check_feedback(self):
        if all(v is None for v in (self.fatigue_rating, self.alertness, self.mood_rating)):
            raise ValueError("at least one feedback rating is required")
        if self.basis == "model_inference" and self.user_confirmed:
            raise ValueError("a confirmed user report must use basis=self_report")
        return self


class Trial(Model):
    status: Literal["response", "false_start", "missed"]
    rt_ms: float | None = Field(default=None, gt=0, le=60000)

    @model_validator(mode="after")
    def check_time(self):
        if (self.status == "response") != (self.rt_ms is not None):
            raise ValueError("rt_ms is required only for response trials")
        return self


class VigilanceObservation(BaseObservation):
    kind: Literal["vigilance"]
    source: Literal["pvt_task"] = "pvt_task"
    protocol_id: Literal["aegis-pvt-demo-v1"] = "aegis-pvt-demo-v1"
    device_id: str = Field(min_length=1, max_length=100)
    trials: list[Trial] = Field(min_length=1, max_length=1000)


Observation = Annotated[
    SleepObservation | MoodObservation | VigilanceObservation | SleepMeasurement | SpeechFeedback,
    Field(discriminator="kind"),
]


def utc_iso(value: datetime) -> str:
    from datetime import timezone
    return value.astimezone(timezone.utc).isoformat()
