import asyncio
import logging
from typing import List, Dict, Any, Optional
import httpx
from backend.app.providers.data_sources.base import DataSourceAdapter
from backend.app.providers.data_sources.huggingface_dataset import get_huggingface_headers

logger = logging.getLogger(__name__)


class HuggingFaceModelAdapter(DataSourceAdapter):
    """
    Adapter for Hugging Face Models API.
    """

    @property
    def source_name(self) -> str:
        return "huggingface"

    async def search(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        headers = get_huggingface_headers()
        url = (
            "https://huggingface.co/api/models"
            f"?search={query}&limit={limit}"
            "&expand[]=downloads&expand[]=likes&expand[]=tags&expand[]=pipeline_tag&expand[]=cardData&expand[]=siblings"
        )

        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=8.0) as client:
                    resp = await client.get(url, headers=headers)
                    if resp.status_code in (429, 503) and attempt < 2:
                        delay = 0.5 * (2 ** attempt)
                        logger.warning(f"HuggingFace model API HTTP {resp.status_code}, retrying in {delay}s...")
                        await asyncio.sleep(delay)
                        continue
                    if resp.status_code == 200:
                        items = resp.json()
                        return [await self.normalize(item) for item in items]
                    break
            except Exception as e:
                if attempt < 2:
                    await asyncio.sleep(0.5 * (2 ** attempt))
                    continue
                logger.warning(f"HuggingFace model search failed: {e}")

        return []

    async def fetch(self, resource_id: str) -> Optional[Dict[str, Any]]:
        headers = get_huggingface_headers()
        url = f"https://huggingface.co/api/models/{resource_id}"
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    return await self.normalize(resp.json())
        except Exception as e:
            logger.warning(f"HuggingFace model fetch failed: {e}")
        return None

    async def normalize(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        model_id = raw.get("id") or raw.get("modelId") or ""
        pipeline = raw.get("pipeline_tag") or "machine-learning"
        tags = raw.get("tags") or []
        card_data = raw.get("cardData") or {}

        # Architecture and modality inference
        arch = "Transformer / Neural Network"
        for t in tags:
            if "bert" in t:
                arch = "BERT"
            elif "swin" in t:
                arch = "Swin Transformer"
            elif "unet" in t:
                arch = "U-Net"
            elif "yolo" in t:
                arch = "YOLO"
            elif "llama" in t:
                arch = "Llama"
            elif "resnet" in t:
                arch = "ResNet"

        modalities = []
        if any(t in tags for t in ("image-classification", "image-segmentation", "object-detection", "computer-vision")):
            modalities.append("Image")
        if any(t in tags for t in ("text-classification", "translation", "question-answering", "nlp")):
            modalities.append("Text")
        if any(t in tags for t in ("audio-classification", "automatic-speech-recognition", "audio")):
            modalities.append("Audio")

        return {
            "id": f"hfm_{model_id.replace('/', '_')}",
            "source": "huggingface",
            "source_id": model_id,
            "name": model_id.split("/")[-1] if "/" in model_id else model_id,
            "slug": model_id,
            "canonical_url": f"https://huggingface.co/{model_id}",
            "description": f"Pretrained checkpoint for {pipeline}. Tags: {', '.join(tags[:6])}",
            "architecture": arch,
            "tasks": [pipeline],
            "domains": ["General AI"],
            "modalities": modalities or ["Text"],
            "parameters": "Unknown",
            "framework": "PyTorch" if "pytorch" in tags else "TensorFlow" if "tf" in tags else "PyTorch",
            "license": card_data.get("license") or "open",
            "memory_requirement": {"min_vram_gb": 8.0},
            "inference_information": {"latency_ms": 100.0},
        }

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get("https://huggingface.co/api/models?limit=1", headers=get_huggingface_headers())
                return resp.status_code == 200
        except Exception:
            return False
