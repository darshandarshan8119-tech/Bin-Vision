"""
upr_schema.py

Pydantic models corresponding to TypeScript UnifiedPageRepresentation.
Matches extension/src/shared/types.ts exactly.
"""
from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field


PerceptionSource = Literal["dom", "ocr", "vision"]
ElementType = Literal["input", "button", "link", "select", "textarea", "image", "text", "form"]
FormPurpose = Literal["REGISTRATION", "LOGIN", "PAYMENT", "SEARCH", "CONTACT", "OTHER"]


class UPRElement(BaseModel):
    id: str
    tagName: str
    type: ElementType
    htmlType: Optional[str] = None
    htmlId: Optional[str] = None
    htmlName: Optional[str] = None
    label: str = ""
    placeholder: Optional[str] = None
    value: Optional[str] = None
    ariaLabel: Optional[str] = None
    autocomplete: Optional[str] = None
    bbox: List[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0, 0.0])
    visible: bool = True
    interactable: bool = True
    innerText: Optional[str] = None
    href: Optional[str] = None
    domPath: str = ""
    attributes: Dict[str, str] = Field(default_factory=dict)
    semantic: str = "OTHER"
    source: PerceptionSource = "dom"
    confidence: float = 1.0
    pii: bool = False
    tokenized: Optional[str] = None

    model_config = {
        "extra": "ignore"
    }


class UPRForm(BaseModel):
    form_id: str
    element_ids: List[str] = Field(default_factory=list)
    action: Optional[str] = None
    method: Optional[str] = None
    semantic_purpose: Optional[str] = None

    model_config = {
        "extra": "ignore"
    }


class UPRPage(BaseModel):
    title: str = ""
    url: str = ""
    snapshot_hash: str = ""
    timestamp: float = 0.0

    model_config = {
        "extra": "ignore"
    }


class UnifiedPageRepresentation(BaseModel):
    page: UPRPage
    elements: List[UPRElement] = Field(default_factory=list)
    forms: List[UPRForm] = Field(default_factory=list)
    perception_source: List[PerceptionSource] = Field(default_factory=lambda: ["dom"])
    overall_confidence: float = 1.0

    model_config = {
        "extra": "ignore"
    }
